#!/usr/bin/env node
'use strict';
// Actual island edits in fresh browser storage, with remote artwork blocked.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright'), root = path.resolve(__dirname, '..');
let source;
if (process.env.ISLAND_SOURCE){
  const read = p => fs.readFileSync(path.join(root, p), 'utf8');
  const manifest = JSON.parse(read('src/pokemon/manifest.json'));
  for (const p of Object.values(manifest.pokemon)) p.image = 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'src/pokemon', p.file)).toString('base64');
  const script = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js')).sort().map(f => read('src/js/' + f)).join('\n')
    .replace('/*__POKEMON_MANIFEST__*/ { pokemon: {}, slots: {}, dailyPool: [] }', JSON.stringify(manifest).replace(/</g, '\\u003c'));
  source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}[hidden]{display:none!important}'
    + read('src/styles.css') + read('src/sticker-world.css') + '</style></head><body>' + read('src/body.html')
    + '<script>(function(){\n' + script.replace(/<\/script>/g, '<\\/script>') + '\n})();</script></body></html>';
}
const server = http.createServer((req, res) => {
  if (source){ res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(source); return; }
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); res.end(error ? '' : data); });
});
(async () => {
  let browser, passed = 0; const errors = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch();
    const scenario = async (format, name, run) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: 'Asia/Tokyo' });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(name + ': ' + error.message));
      await page.route('https://**', route => route.abort());
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/dist/${format}`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => { const K = KazuApp; K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false; K.Sound.say = () => {}; K.Store.reset(); });
        await run(page); passed++; console.log('PASS ' + format + ': ' + name);
      } finally { await context.close(); }
    };
    const open = (page, key) => page.evaluate(k => KazuApp.StickerWorld.open(k), key);
    const world = page => page.evaluate(() => KazuApp.Store.stickerWorld());
    const tapBoard = async (page, x, y) => {
      await page.locator('.sticker-world-board').evaluate((board, p) => {
        const r = board.getBoundingClientRect();
        board.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + board.clientLeft + board.clientWidth * p.x / 100, clientY: r.top + board.clientTop + board.clientHeight * p.y / 100 }));
      }, { x, y });
    };
    const pointerTapBoard = async (page, x, y) => {
      const board = page.locator('.sticker-world-board'); await board.scrollIntoViewIfNeeded();
      const point = await board.evaluate((n, p) => { const r = n.getBoundingClientRect();
        return { x: r.left + n.clientLeft + n.clientWidth * p.x / 100, y: r.top + n.clientTop + n.clientHeight * p.y / 100 };
      }, { x, y });
      await page.mouse.click(point.x, point.y);
    };
    for (const format of source ? ['source.html'] : ['kazu-no-bouken.html', 'artifact.html']) {
      await scenario(format, 'eight real answers award stickers whose result buttons open the exact owned artwork', async page => {
        const rewards = await page.evaluate(() => {
          const K = KazuApp, S = K.Store; K.Sound.say = (text, options) => { if (options?.onend) options.onend(); };
          K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.autoAdvance(true); K.Session._test.breaks(false);
          K.Session.startLevel(K.Games.byId.count, 0);
          const session = K.Session._test;
          for (let guard = 0; K.UI.currentName() === 'play' && guard < 40; guard++) {
            const answer = Number(session.item.split(':').pop());
            document.querySelectorAll('#play .obj:not(.counted)').forEach(n => n.click()); session.flushTimers(6);
            [...document.querySelectorAll('#play .choices .choice')].find(n => Number(n.textContent) === answer)?.click(); session.flushTimers(6);
          }
          if (K.UI.currentName() !== 'result') throw new Error('real count course did not finish');
          return { buttons: [...document.querySelectorAll('#result .result-sticker-place')].map(n => n.dataset.stickerKey), stickers: S.data.stickers.slice(), today: S.todayCount(), plays: S.plays('count', 0) };
        });
        assert.deepEqual(rewards.buttons, ['count:0', 'count:0:g']); assert.equal(rewards.today, 8); assert.equal(rewards.plays, 1);
        for (const key of rewards.buttons) {
          if (await page.evaluate(() => KazuApp.UI.currentName()) !== 'result') await page.evaluate(() => KazuApp.UI.show('result'));
          await page.locator('.result-sticker-place[data-sticker-key="' + key + '"]').click();
          assert.equal(await page.evaluate(() => KazuApp.UI.currentName()), 'sticker-world');
          assert.equal(await page.locator('.world-selected [data-sticker-key]').getAttribute('data-sticker-key'), key);
          assert.deepEqual(await page.evaluate(() => KazuApp.Store.data.stickers), rewards.stickers);
        }
      });
      await scenario(format, '120 acquired stickers use a compact grid and current-lap acquisition order; selected art stays visible', async page => {
        await page.setViewportSize({ width: 320, height: 568 });
        const expectedRecent = await page.evaluate(() => {
          const K = KazuApp, S = K.Store;
          for (const g of K.Games.list) for (let i = 0; i < g.levels.length; i++) { S.addSticker(g.id + ':' + i); S.addSticker(g.id + ':' + i + ':g'); }
          return S.data.stickers.slice(-6).reverse();
        });
        await open(page);
        assert.deepEqual(await page.locator('.world-palette-sticker').evaluateAll(ns => ns.map(n => n.dataset.worldKey)), expectedRecent);
        await page.locator('.world-picker [data-filter="all"]').click();
        assert.equal(await page.locator('.world-palette-sticker').count(), 120);
        const layout = await page.locator('.sticker-world-palette').evaluate(n => ({ width: n.clientWidth, scrollWidth: n.scrollWidth, height: n.clientHeight, scrollHeight: n.scrollHeight, columns: getComputedStyle(n).gridTemplateColumns.split(' ').length }));
        assert.ok(layout.columns >= 3 && layout.scrollWidth <= layout.width + 1 && layout.scrollHeight > layout.height, JSON.stringify(layout));
        await page.locator('.world-palette-sticker[data-world-key="count:0"]').click();
        assert.equal(await page.locator('.world-picker').evaluate(n => n.open), false);
        assert.equal(await page.locator('.world-selection-name b').textContent(), 'ピカチュウ');
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.sticker-world-board')), true);
        const preview = await page.locator('.world-selected').boundingBox();
        assert.ok(preview.y >= 0 && preview.y + preview.height <= 568, JSON.stringify(preview));
        await page.locator('.world-choose').click();
        const selectedVisible = await page.locator('.world-palette-sticker.selected').evaluate(n => {
          const a = n.getBoundingClientRect(), b = n.parentElement.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
        });
        assert.equal(selectedVisible, true);
        await page.screenshot({ path: `/tmp/math-youji-island-grid-${format}.png`, animations: 'disabled' });
      });
      await scenario(format, 'place, move, remove, done and one-step undo retain ownership and learning records', async page => {
        await page.evaluate(() => { KazuApp.Store.addSticker('count:0'); KazuApp.Store.addSticker('count:0:g'); });
        await open(page, 'count:0');
        await pointerTapBoard(page, 60, 50); const placed = (await world(page)).items['count:0']; assert.ok(Math.abs(placed.x - 60) < 1);
        await pointerTapBoard(page, 1, 50); const moved = (await world(page)).items['count:0']; assert.ok(moved.x > 1 && moved.x < placed.x && moved.y > 1);
        await page.locator('.world-undo').click(); assert.deepEqual((await world(page)).items['count:0'], placed);
        await page.locator('.world-remove').click(); assert.equal((await world(page)).items['count:0'], undefined);
        await page.locator('.world-undo').click(); assert.deepEqual((await world(page)).items['count:0'], placed);
        await page.locator('.world-done').click(); assert.equal(await page.locator('.world-selected .pokemon-sticker').count(), 0);
        await open(page, 'count:0:g'); await page.locator('.world-place').click(); assert.ok((await world(page)).items['count:0:g']);
        await page.locator('.world-undo').click(); assert.equal((await world(page)).items['count:0:g'], undefined);
        assert.deepEqual(await page.evaluate(() => ({ owned: KazuApp.Store.data.stickers, stars: KazuApp.Store.totalStars(), today: KazuApp.Store.todayCount(), plays: KazuApp.Store.plays('count', 0) })), { owned: ['count:0', 'count:0:g'], stars: 0, today: 0, plays: 0 });
      });
      await scenario(format, 'unplaced filtering changes after actual placement and removal without losing the selection', async page => {
        await page.evaluate(() => { KazuApp.Store.addSticker('count:0'); KazuApp.Store.addSticker('count:0:g'); });
        await open(page, 'count:0'); await page.locator('.world-place').click(); await page.locator('.world-choose').click();
        await page.locator('.world-picker [data-filter="unplaced"]').click();
        assert.deepEqual(await page.locator('.world-palette-sticker').evaluateAll(ns => ns.map(n => n.dataset.worldKey)), ['count:0:g']);
        assert.equal(await page.locator('.world-selection-name b').textContent(), 'ピカチュウ');
        await page.locator('.world-remove').click();
        assert.equal(await page.locator('.world-palette-sticker').count(), 2);
        assert.equal(await page.locator('.world-palette-sticker.selected').getAttribute('data-world-key'), 'count:0');
        await page.locator('.world-picker [data-filter="all"]').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement?.dataset.filter), 'all');
      });
      await scenario(format, 'keyboard arrows preview a position and Enter places without a pointer', async page => {
        await page.evaluate(() => { KazuApp.Store.addSticker('transfer:0'); }); await open(page, 'transfer:0');
        await page.locator('.sticker-world-board').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
        assert.equal(Object.keys((await world(page)).items).length, 0);
        await page.keyboard.press('Enter');
        assert.deepEqual((await world(page)).items['transfer:0'], { x: 55, y: 45 });
        await page.locator('.world-sticker').focus(); await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.sticker-world-board')), true);
        assert.equal(await page.locator('.world-selection-name b').textContent(), 'ミュウツー');
        for (const n of await page.locator('.world-edit-actions .btn:visible').all()) { const box = await n.boundingBox(); assert.ok(box.height >= 48 && box.width >= 48); }
      });
      await scenario(format, 'every edge keeps full artwork inside the board at phone and tablet sizes, including old saved edges', async page => {
        await page.evaluate(() => { KazuApp.Store.addSticker('count:0'); KazuApp.Store.addSticker('transfer:0'); });
        for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
          await page.setViewportSize(size);
          for (const key of ['count:0', 'transfer:0']) {
            await open(page, key);
            for (const p of [[0, 0], [100, 0], [0, 100], [100, 100]]) {
              await tapBoard(page, p[0], p[1]);
              const fits = await page.locator('.world-sticker[data-world-key="' + key + '"]').evaluate(n => {
                const a = n.getBoundingClientRect(), b = n.parentElement.getBoundingClientRect();
                return { left: a.left >= b.left - .1, right: a.right <= b.right + .1, top: a.top >= b.top - .1, bottom: a.bottom <= b.bottom + .1 };
              });
              assert.ok(Object.values(fits).every(Boolean), JSON.stringify({ size, key, p, fits }));
            }
          }
          await page.evaluate(() => { KazuApp.Store.putWorldSticker('count:0', 0, 100); KazuApp.StickerWorld.open('count:0'); });
          await page.waitForFunction(() => {
            const n = document.querySelector('.world-sticker[data-world-key="count:0"]'), a = n.getBoundingClientRect(), b = n.parentElement.getBoundingClientRect();
            return a.left >= b.left - .1 && a.right <= b.right + .1 && a.top >= b.top - .1 && a.bottom <= b.bottom + .1;
          });
          assert.deepEqual((await world(page)).items['count:0'], { x: 0, y: 100 }, 'view fitting preserves the saved logical edge');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.screenshot({ path: `/tmp/math-youji-island-editor-${size.width}-${format}.png`, animations: 'disabled' });
        }
      });
      await scenario(format, 'pending, gold, treasure and lap identities survive editing, backup and reload', async page => {
        await page.evaluate(() => {
          const K = KazuApp, S = K.Store; S.addPending('count:0'); S.addSticker('count:0:g'); S.addSticker('transfer:0');
          for (const g of K.Games.list.filter(g => g.world === 'shima')) for (let i = 0; i < g.levels.length; i++) S.addSticker(g.id + ':' + i + ':g');
          S.claimTreasure('shima'); S.unlockRoundTwo(); S.selectRound(2); S.addSticker('count:0');
          S.putWorldSticker('count:0', 25, 40); S.putWorldSticker('lap2:count:0', 75, 60); K.StickerWorld.open('count:0');
        });
        assert.equal(await page.locator('.world-selected [data-sticker-key]').getAttribute('data-sticker-key'), 'lap2:count:0');
        assert.equal(await page.locator('.world-sticker [data-sticker-key="count:0"]').count(), 1);
        assert.equal(await page.locator('.world-sticker [data-sticker-key="lap2:count:0"]').count(), 1);
        const before = await world(page);
        await page.evaluate(() => KazuApp.Store.flush()); await page.reload(); await open(page, 'lap2:count:0');
        assert.deepEqual(await world(page), before);
        const imported = await page.evaluate(() => {
          const S = KazuApp.Store, backup = S.exportText(); S.reset(); const result = S.importText(backup, 'replace');
          return { ok: result.ok, world: S.stickerWorld(), owned: S.ownedStickerKeys(), pending: S.ownedStickerPending('count:0'), gold: S.hasOwnedSticker('count:0:g'), treasure: S.hasOwnedSticker('treasure:shima'), transfer: S.hasOwnedSticker('transfer:0') };
        });
        assert.equal(imported.ok, true); assert.deepEqual(imported.world, before); assert.equal(imported.pending, true);
        assert.equal(imported.gold, true); assert.equal(imported.treasure, true); assert.equal(imported.transfer, true);
        assert.ok(imported.owned.includes('count:0') && imported.owned.includes('lap2:count:0'));
        await open(page, 'unearned:99'); assert.equal(await page.locator('.world-selected [data-sticker-key="unearned:99"]').count(), 0);
      });
    }
    assert.deepEqual(errors, []); console.log(`${passed} island editor scenarios passed; browser exceptions: 0`);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
