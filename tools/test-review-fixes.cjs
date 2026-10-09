#!/usr/bin/env node
'use strict';
// Review regressions in an isolated browser profile; never use a child's records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
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
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`, { waitUntil: 'domcontentloaded' });
    const setup = async () => page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      K.Sound.say = (text, opts) => { if (opts && opts.onend) opts.onend(); };
      K.Store.reset(); K.Session._test.intro(false);
      document.querySelectorAll('.bigmark').forEach(node => node.remove());
    });
    const passed = name => console.log('PASS ' + name);
    const settleScreen = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const screenshotDir = process.env.REVIEW_FIX_SCREENSHOTS;
    if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = async name => { if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, name + '.png') }); };

    await setup();
    const backup = await page.evaluate(() => {
      const S = KazuApp.Store;
      S.completeOrientation();
      for (let i = 0; i < 8; i++) S.noteFact('ten:ten:4', false, '4と6で10', 'ten:1');
      for (let i = 0; i < 12; i++) S.noteFact('ten:ten:4', true, '4と6で10', 'ten:1');
      const text = S.exportText();
      const before = { recent: S.data.factRecent['ten:ten:4'], weak: S.weakFacts().length, orientation: S.data.orientation };
      const result = S.importText(text, 'replace');
      const after = { recent: S.data.factRecent['ten:ten:4'], weak: S.weakFacts().length, orientation: S.data.orientation };
      S.reset();
      S.importText(text); S.importText(text);
      const merged = { recent: S.data.factRecent['ten:ten:4'], weak: S.weakFacts().length, orientation: S.data.orientation, asked: S.fact('ten:ten:4')[0] };
      const snapshot = S.exportText();
      const invalid = JSON.parse(text); invalid.data.factRecent['ten:ten:4'] = '1?0';
      const badRecent = S.importText(JSON.stringify(invalid), 'replace');
      const invalidOrientation = JSON.parse(text); invalidOrientation.data.orientation = 'yes';
      const badOrientation = S.importText(JSON.stringify(invalidOrientation), 'replace');
      const unchanged = JSON.stringify(JSON.parse(snapshot).data) === JSON.stringify(JSON.parse(S.exportText()).data);
      const older = JSON.parse(text); delete older.data.factRecent; delete older.data.orientation;
      S.importText(JSON.stringify(older));
      return { before, after, result, merged, badRecent, badOrientation, unchanged, oldMergeRecent: S.data.factRecent['ten:ten:4'] };
    });
    assert.equal(backup.result.ok, true);
    assert.deepEqual(backup.before, { recent: '111111111111', weak: 0, orientation: true });
    assert.deepEqual(backup.after, backup.before);
    assert.deepEqual(backup.merged, { ...backup.before, asked: 20 });
    assert.equal(backup.badRecent.ok, false); assert.equal(backup.badOrientation.ok, false);
    assert.equal(backup.unchanged, true); assert.equal(backup.oldMergeRecent, backup.before.recent);
    passed('backup replace/merge preserves recovered facts and onboarding; invalid records are rejected atomically');

    await setup();
    const latch = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, game = K.Games.byId.g1set;
      for (let i = 0; i < 6; i++){ S.noteOutcome('count', 0, true); S.noteOutcome('numeral', 0, true); }
      const opened = K.levelOpen(game, 0);
      S.addSticker('g1set:0');
      for (let i = 0; i < 3; i++) S.noteOutcome('count', 0, false);
      const stayedOpen = K.levelOpen(game, 0), unrelatedLocked = !K.levelOpen(K.Games.byId.g1pair, 0);
      const text = S.exportText();
      S.reset(); S.importText(text, 'replace');
      const restored = K.levelOpen(game, 0);
      const old = JSON.parse(S.exportText()); delete old.data.g1GamesOpen;
      S.reset(); S.importText(JSON.stringify(old), 'replace');
      const migrated = K.levelOpen(game, 0), onlyPlayedGame = !K.levelOpen(K.Games.byId.g1pair, 0);
      const empty = JSON.parse(S.exportText()); empty.data.g1GamesOpen = {}; empty.data.stickers = [];
      S.importText(JSON.stringify(empty)); S.flush();
      return { opened, stayedOpen, unrelatedLocked, restored, migrated, onlyPlayedGame, merged: K.levelOpen(game, 0) };
    });
    assert.ok(Object.values(latch).every(Boolean), JSON.stringify(latch));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => KazuApp.levelOpen(KazuApp.Games.byId.g1set, 0) && !KazuApp.levelOpen(KazuApp.Games.byId.g1pair, 0)), true);
    passed('each unlocked classroom stays open after errors, old backup migration, merge and reload');

    await setup();
    await page.evaluate(() => { KazuApp.Home.render(); KazuApp.UI.show('home'); });
    await page.getByRole('button', { name: /^🎒 なかまづくり/ }).click();
    assert.equal(await page.locator('#g1-preparation').isVisible(), true);
    const preparation = await page.locator('#g1-preparation .preparation-level').evaluateAll(nodes => nodes.map(n => ({ game: n.dataset.game, level: n.dataset.level, text: n.textContent })));
    assert.deepEqual(preparation.map(p => [p.game, p.level]), [['count', '0'], ['numeral', '0']]);
    assert.ok(preparation[0].text.includes('かぞえよう') && preparation[1].text.includes('すうじ どれかな'));
    await screenshot('preparation-landscape');
    await page.setViewportSize({ width: 768, height: 1024 });
    assert.equal(await page.evaluate(() => document.querySelector('#g1-preparation').scrollWidth <= innerWidth), true);
    await screenshot('preparation-portrait');
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.locator('#g1-preparation .preparation-level').first().click();
    assert.equal(await page.evaluate(() => KazuApp.FirstSteps.active.game.id === 'count' && KazuApp.FirstSteps.active.levelIndex === 0), true);
    const guidance = await page.evaluate(() => {
      const K = KazuApp; K.Book.render(); K.Parent.render();
      return { book: document.querySelector('#book .aim').textContent, speech: K.Book.speech(), parent: document.querySelector('#parent').textContent };
    });
    assert.doesNotMatch(guidance.book, /あと\s*48レベル.*ひらく/);
    assert.doesNotMatch(guidance.speech, /あと48レベル/);
    assert.doesNotMatch(guidance.parent, /扉の鍵は「色のついたクリアのシール48枚」/);
    assert.doesNotMatch(guidance.parent, /入学前の(?:\d+)?レベルを(?:すべて|全部)クリア[^。]*開/);
    assert.match(guidance.parent, /各遊びに関連する2〜3レベルの準備ができると、その遊びから開きます/);
    passed('locked classroom names its own preparation and starts it; book/parent/speech use current unlock rules');

    await setup();
    const daily = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, T = K.Session._test;
      T.intro(true); K.Session.startLevel(K.Games.byId.count, 0);
      const initialLength = T.planLength;
      for (let guard = 0; K.UI.currentName() === 'play' && guard < 20; guard++){ T.forceCorrect(); T.flushTimers(); }
      K.Home.render();
      const label = () => document.querySelector('#home .dailies > .daily:not(.recommended):not(.reviewmission):not(.focusset) .t').textContent;
      const before = { count: S.todayCount(), practice: S.data.practice.slice(), done: S.practiceDoneToday(), label: label() };
      K.Session.startDaily(10); T.forceCorrect(); T.flushTimers();
      const back = document.querySelector('#play .backbtn'); back.click(); back.click();
      const abandoned = S.practiceDoneToday();
      K.Session.startDaily(10);
      for (let guard = 0; K.UI.currentName() === 'play' && guard < 20; guard++){ T.forceCorrect(); T.flushTimers(); }
      K.Home.render();
      const after = { done: S.practiceDoneToday(), label: label(), practice: S.data.practice.slice() };
      const text = S.exportText(); S.reset(); S.importText(text, 'replace');
      const replaced = S.practiceDoneToday(); S.reset(); S.importText(text); S.importText(text); S.flush();
      return { initialLength, before, abandoned, after, replaced, merged: S.practiceDoneToday() };
    });
    assert.equal(daily.initialLength, 10); assert.equal(daily.before.count, 10);
    assert.deepEqual(daily.before.practice, [0, 0]); assert.equal(daily.before.done, false);
    assert.doesNotMatch(daily.before.label, /おわり/); assert.equal(daily.abandoned, false);
    assert.equal(daily.after.done, true); assert.match(daily.after.label, /おわり/);
    assert.equal(daily.after.practice[1], 10); assert.ok(daily.replaced && daily.merged);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => KazuApp.Store.practiceDoneToday()), true);
    passed('ten level questions do not complete daily practice; only a finished daily set survives backup and reload');

    await setup();
    const support = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, T = K.Session._test;
      const start = () => { S.reset(); K.Session.startLevel(K.Games.byId.ten, 1); };
      const key = n => [...document.querySelectorAll('#play .padkey')].find(b => Number(b.textContent) === n);
      const answer = () => 10 - Number(T.item.split(':').at(-1));
      const kinds = () => S.milestones().map(m => m.kind);
      start(); let right = answer(); key((right + 1) % 11).click(); key((right + 1) % 11).click(); key(right).click();
      const auto = { kinds: kinds(), clean: S.data.recent['ten:1'] };
      start(); right = answer(); key((right + 1) % 11).click(); key(right).click(); const revised = kinds();
      start(); document.querySelector('#play .showbtn').click(); key(answer()).click(); const manual = kinds();
      start(); key(answer()).click(); const independent = kinds();
      // A real two-surface story: choose its operation, then answer the arithmetic.
      S.reset(); S.setPref('g1Open', true); K.Session.startLevel(K.Games.byId.g1shiki, 1);
      const m = /word([+-]):(\d+)_(\d+)/.exec(T.item);
      if (!m) throw new Error('Missing story question');
      document.querySelector('#play .showbtn').click();
      const op = m[1] === '+' ? '＋' : '−';
      [...document.querySelectorAll('#play .choice')].find(b => b.textContent === op).click();
      T.flushTimers();
      const stillHelped = T.helped && T.idx === 0;
      key(m[1] === '+' ? Number(m[2]) + Number(m[3]) : Number(m[2]) - Number(m[3])).click();
      const multi = kinds();
      start(); right = answer();
      for (let i = 0; i < 6; i++) key((right + 1) % 11).click();
      T.flushTimers(); const taught = kinds();
      return { auto, revised, manual, independent, multi, stillHelped, taught };
    });
    assert.deepEqual(support.auto.kinds, ['supported']); assert.equal(support.auto.clean, '0');
    assert.deepEqual(support.revised, ['revised']); assert.deepEqual(support.manual, ['supported']);
    assert.deepEqual(support.independent, ['independent']); assert.deepEqual(support.multi, ['supported']);
    assert.equal(support.stillHelped, true); assert.deepEqual(support.taught, ['viewed']);
    passed('automatic/manual support, unaided revisions and independent answers remain distinct');

    // Use real keyboard events, rather than dispatching clicks on unfocusable divs.
    for (const [game, level, pieceSelector, targetSelector, identity, consumed] of [
      ['sort', 0, '.tile', '.bin', 'cat', 'gone'],
      ['sort', 1, '.tile', '.bin', 'cat', 'gone'],
      ['shape', 2, '.shapetile', '.shapeslot', 'sig', 'used']
    ]) {
      await setup();
      await page.evaluate(([id, index]) => { KazuApp.Session.startLevel(KazuApp.Games.byId[id], index); }, [game, level]);
      await settleScreen(); // Let screen-heading focus and playfield fitting finish.
      const pieces = page.locator('#play ' + pieceSelector);
      const targets = page.locator('#play ' + targetSelector);
      const pieceCount = await pieces.count();
      assert.ok(pieceCount > 0); assert.ok(await targets.count() > 0);
      assert.equal(await pieces.evaluateAll(nodes => nodes.every(n => n.tagName === 'BUTTON' && !!n.getAttribute('aria-label'))), true);
      assert.equal(await targets.evaluateAll(nodes => nodes.every(n => n.tagName === 'BUTTON' && !!n.getAttribute('aria-label'))), true);
      for (let i = 0; i < pieceCount; i++) {
        const piece = pieces.nth(i);
        const value = await piece.getAttribute('data-' + identity);
        const targetIndex = await targets.evaluateAll((nodes, data) => nodes.findIndex(n => n.dataset[data.identity] === data.value && n.dataset.filled !== '1'), { identity, value });
        assert.ok(targetIndex >= 0);
        await piece.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        assert.equal(await piece.evaluate(node => document.activeElement === node), true, game + ' piece is reachable with Tab');
        await piece.press(i % 2 ? 'Space' : 'Enter');
        assert.equal(await piece.getAttribute('aria-pressed'), 'true');
        await targets.nth(targetIndex).press(i % 2 ? 'Enter' : 'Space');
        assert.match(await piece.getAttribute('class'), new RegExp(consumed));
        assert.equal(await piece.getAttribute('aria-pressed'), 'false');
      }
      await page.evaluate(() => KazuApp.Session._test.flushTimers());
      assert.equal(await page.evaluate(() => KazuApp.Session._test.idx), 1, game + ' keyboard answer completes exactly one question');
      assert.equal(await page.evaluate(() => KazuApp.Session._test.mistakes), 0);
      await screenshot(game + '-keyboard');
      passed(game + ' L' + (level + 1) + ' is solvable using Tab, Enter and Space without pointer input');
    }

    await setup();
    await page.evaluate(() => KazuApp.Session.startLevel(KazuApp.Games.byId.sort, 0));
    await settleScreen();
    const piece = page.locator('#play .tile').first();
    const category = await piece.getAttribute('data-cat');
    const bin = page.locator('#play .bin[data-cat="' + category + '"]');
    await piece.click(); assert.equal(await piece.getAttribute('aria-pressed'), 'true');
    await piece.click(); assert.equal(await piece.getAttribute('aria-pressed'), 'false');
    await piece.click(); await bin.click();
    assert.equal(await bin.locator('.hold .item').count(), 1);
    const otherIndex = await page.locator('#play .tile').evaluateAll(nodes => nodes.findIndex(node => !node.classList.contains('gone')));
    const other = page.locator('#play .tile').nth(otherIndex);
    const otherCategory = await other.getAttribute('data-cat');
    const destination = page.locator('#play .bin[data-cat="' + otherCategory + '"]');
    const before = await destination.locator('.hold .item').count();
    const from = await other.boundingBox(), to = await destination.boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.match(await other.getAttribute('class'), /gone/);
    assert.equal(await destination.locator('.hold .item').count(), before + 1);
    assert.equal(await page.evaluate(() => KazuApp.Session._test.mistakes), 0);
    passed('pointer tap toggles once and dragging places one item without duplicate answers');

    // Every picture has different adjacent/overlapping hole bounds. Correct
    // mouse clicks must still reach the visible hole, including the tree canopy.
    for (const [orientation, viewport] of [
      ['landscape', { width: 1024, height: 768 }], ['portrait', { width: 768, height: 1024 }]
    ]) {
      await page.setViewportSize(viewport);
      for (const seed of [.05, .25, .45, .65, .85]) {
        await setup();
        await page.evaluate(seed => {
          const random = Math.random; Math.random = () => seed;
          try { KazuApp.Session.startLevel(KazuApp.Games.byId.shape, 2); }
          finally { Math.random = random; }
        }, seed);
        await settleScreen();
        const pieces = page.locator('#play .shapetile');
        const slots = page.locator('#play .shapeslot');
        await screenshot('shape-pointer-' + orientation + '-' + seed);
        for (let i = 0, n = await pieces.count(); i < n; i++) {
          const tile = pieces.nth(i), sig = await tile.getAttribute('data-sig');
          const index = await slots.evaluateAll((nodes, sig) => nodes.findIndex(n => n.dataset.sig === sig && n.dataset.filled !== '1'), sig);
          assert.ok(index >= 0);
          await tile.click();
          const point = await slots.nth(index).evaluate(node => {
            const r = node.getBoundingClientRect();
            // A triangle's bounding-box center can fall on its slanted edge.
            // Find an interior point that really hits this visible native target.
            for (const y of [.25, .5, .75]) for (const x of [.25, .5, .75]) {
              const px = r.left + r.width * x, py = r.top + r.height * y;
              if (document.elementFromPoint(px, py) === node) return { x: px, y: py };
            }
            return null;
          });
          assert.ok(point, orientation + ' picture ' + seed + ' has a visible pointer target for hole ' + index);
          await page.mouse.click(point.x, point.y);
          assert.match(await tile.getAttribute('class'), /used/);
        }
        await page.evaluate(() => KazuApp.Session._test.flushTimers());
        assert.equal(await page.evaluate(() => KazuApp.Session._test.idx), 1);
        assert.equal(await page.evaluate(() => KazuApp.Session._test.mistakes), 0);
        passed(orientation + ' shape picture ' + seed + ' accepts pointer placement for every piece');
      }
    }
    passed('all five shape pictures keep correct pointer targets after adding keyboard controls');

    assert.deepEqual(errors, []);
    console.log('All six review fixes verified; no browser errors');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
