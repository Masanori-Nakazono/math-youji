#!/usr/bin/env node
'use strict';
// Isolated real-browser coverage: original clears -> hands-on problems -> foil
// sticker -> collection/island -> backup/reload. No access to the child's data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' });
    res.end(err ? 'not found' : body);
  });
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    // The regression suite tests the worker/offline shell. Keep this interaction
    // suite's network block effective even after a reload claims the page.
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`, { waitUntil: 'domcontentloaded' });
    const checks = await page.evaluate(() => {
      const K = KazuApp, store = K.Store, T = K.TransferAdventure, names = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); names.push(name); };
      const $ = s => document.querySelector(s);
      const click = s => { const n = $(s); if (!n) throw new Error('missing ' + s); n.click(); };
      const tapText = text => {
        const n = [...document.querySelectorAll('#transfer button')].find(n => n.textContent === text);
        if (!n) throw new Error('missing button: ' + text); n.click();
      };
      const move = n => { for (let i = 0; i < n; i++) click('#transfer [aria-label="１つ うごかす"]'); };
      const verify = () => click('.transfer-check');
      K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      store.reset();
      check('new child does not see or enter the post-clear adventure', !T.homeCard() && (T.open(), K.UI.currentName() !== 'transfer'));
      const old = JSON.parse(store.exportText()); delete old.data.transferReached; delete old.data.transferRecords;
      check('old backups import with new defaults', store.importText(JSON.stringify(old), 'replace').ok && !store.data.transferReached);
      const original = K.Games.list.flatMap(g => g.levels.map((lv, i) => g.id + ':' + i));
      const stickerArt = original.map(k => K.stickerFor(k));
      original.slice(0, -1).forEach(k => store.addSticker(k));
      store.addPending(original.at(-1));
      check('a provisional final clear does not prematurely open the adventure', !T.unlocked());
      store.confirmSticker(original.at(-1));
      check('all 60 confirmed clears open the adventure without gold', T.unlocked() && original.length === 60);
      K.Home.render(); K.UI.show('home'); click('.transfer-home');
      check('home entry opens six selectable adventures', document.querySelectorAll('.transfer-card').length === 6);
      check('existing sticker artwork stays identical', original.every((k, i) => K.stickerFor(k) === stickerArt[i]));
      const mastery = JSON.stringify([store.data.stars, store.data.facts, store.data.pending]);
      const random = Math.random; Math.random = () => .5; // total=8, add=4+4, sub=8-4
      try {
        click('[data-mission="0"]');
        click('#transfer .topbar button');
        check('first back tap asks before abandoning work', !!$('.transfer-exit') && !!$('.transfer-check'));
        click('#transfer .topbar button');
        check('leaving an unfinished adventure awards nothing', !store.hasSticker('transfer:0') && !!$('.transfer-map'));
        for (let id = 0; id < 6; id++){
          T.open(); click('[data-mission="' + id + '"]');
          for (let step = 0; step < 3; step++){
            if (id < 2){
              if (id === 1 && step === 0){
                verify(); check('empty answer is rejected', !$('.transfer-next'));
                move(5); verify(); check('too many objects are rejected', !$('.transfer-next'));
                click('#transfer [aria-label="１つ もどす"]');
              } else move(4);
              verify();
            } else if (id < 4){
              // 8 -> 1+7, then 2+6. Swapping to 7+1 must not pass.
              for (let i = 0; i < 7; i++) click('.transfer-plate:first-child .transfer-piece');
              verify();
              check('one partition is not enough to complete a problem', !$('.transfer-next'));
              if (id === 2 && step === 0){
                for (let i = 0; i < 6; i++) click('.transfer-plate:last-child .transfer-piece');
                verify(); check('swapping the same two counts is not a new partition', !$('.transfer-next'));
                for (let i = 0; i < 5; i++) click('.transfer-plate:first-child .transfer-piece');
              } else click('.transfer-plate:last-child .transfer-piece');
              verify();
            } else {
              if (id === 5 && step === 0){ tapText('👀 ヒント'); tapText('いっしょに つくる'); }
              else move(id === 4 ? 4 : 8);
              verify();
              check('story needs both starting count and change', !$('.transfer-next'));
              move(4); verify();
            }
            check('hands-on answer accepted: mission ' + id + ', question ' + step, !!$('.transfer-next'));
            if (step < 2) check('sticker not awarded before all three problems', !store.hasSticker('transfer:' + id));
            click('.transfer-next');
          }
          check('unique special sticker awarded for mission ' + id, store.hasSticker('transfer:' + id) && !!$('.transfer-result .transfer-sticker'));
        }
        check('six adventures count exactly eighteen completed problems', store.todayCount() === 18);
        check('clean, revised, and supported work remain distinct', store.data.transferRecords[0].independent === 3
          && store.data.transferRecords[1].supported === 1 && store.data.transferRecords[2].revised === 1
          && store.data.transferRecords[5].supported === 1);
        check('adventure completion does not modify level mastery', JSON.stringify([store.data.stars, store.data.facts, store.data.pending]) === mastery);
        // Replay with support cannot create duplicate stickers.
        T.open(); click('[data-mission="0"]');
        for (let i = 0; i < 3; i++){ tapText('👀 ヒント'); tapText('いっしょに つくる'); verify(); click('.transfer-next'); }
        check('replay awards no duplicates and records actual support', store.data.stickers.filter(k => k.startsWith('transfer:')).length === 6
          && store.data.transferRecords[0].supported === 3);
        tapText('じぶんの しまに かざる');
        check('result opens island with the special sticker selected', K.UI.currentName() === 'sticker-world'
          && !!$('.world-palette-sticker.selected .transfer-sticker'));
        const board = $('.sticker-world-board'), rect = board.getBoundingClientRect();
        board.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
        check('special sticker can be placed using the island UI', !!$('.world-sticker .transfer-sticker') && !!store.stickerWorld().items['transfer:0']);
        K.Book.open();
        check('book renders six unique foil stickers', document.querySelectorAll('#book .transfer-sticker').length === 6);
        check('parent summary distinguishes supported answers', T.parentSummary().textContent.includes('ヒント・見本を使用 3問'));
        const backup = store.exportText();
        store.reset();
        check('backup restores rewards, observations and placement', store.importText(backup, 'replace').ok
          && store.data.transferRecords[0].supported === 3 && store.hasSticker('transfer:0')
          && !!store.stickerWorld().items['transfer:0'] && T.unlocked());
        store.importText(backup); store.importText(backup);
        check('repeated backup merges are idempotent', store.data.stickers.filter(k => k.startsWith('transfer:')).length === 6);
        const bad = JSON.parse(backup); bad.data.transferRecords[0].supported = 4;
        check('malformed completion records are rejected without changing data', !store.importText(JSON.stringify(bad)).ok && store.data.transferRecords[0].supported === 3);
        store.flush();
      } finally { Math.random = random; }
      return names;
    });
    checks.forEach(n => console.log('PASS ' + n));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => KazuApp.Store.hasSticker('transfer:0')
      && KazuApp.Store.data.transferRecords[0].supported === 3
      && !!KazuApp.Store.stickerWorld().items['transfer:0']), true);
    console.log('PASS rewards, observations and island layout survive reload');
    const dir = process.env.TRANSFER_SCREENSHOT_DIR;
    if (dir) fs.mkdirSync(dir, { recursive: true });
    for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]){
      await page.setViewportSize(viewport);
      await page.evaluate(() => { KazuApp.Sound.voiceOn = false; KazuApp.Sound.sfxOn = false; KazuApp.TransferAdventure.open(); });
      assert.equal(await page.locator('.transfer-card').count(), 6);
      if (dir) await page.screenshot({ path: path.join(dir, `menu-${viewport.width}.png`) });
      for (const id of [0, 2, 4, 5]){
        await page.evaluate(() => KazuApp.TransferAdventure.open());
        await page.locator(`[data-mission="${id}"]`).click();
        assert.equal(await page.locator('.transfer-body').innerText().then(t => /\b(null|undefined)\b/.test(t)), false, 'child-facing text contains no placeholder values');
        await page.locator('.transfer-check').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('.transfer-check').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
          && document.querySelector('.transfer-body').scrollWidth <= document.querySelector('.transfer-body').clientWidth + 1), true);
        if (dir) await page.screenshot({ path: path.join(dir, `mission-${id}-${viewport.width}.png`) });
      }
    }
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.evaluate(() => { KazuApp.Book.open(); });
    if (dir) await page.screenshot({ path: path.join(dir, 'collection.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => KazuApp.TransferAdventure.open());
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#transfer')).color
      === getComputedStyle(document.querySelector('.transfer-card')).color), true, 'dark-mode headings inherit the readable foreground');
    if (dir) await page.screenshot({ path: path.join(dir, 'menu-dark.png') });
    assert.deepEqual(errors, []);
    console.log('PASS landscape, portrait, phone and dark layouts; no browser errors');
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
