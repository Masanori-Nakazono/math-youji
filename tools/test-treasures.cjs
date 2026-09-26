#!/usr/bin/env node
'use strict';

// Real app, isolated browser storage: exercise the chest -> keepsake -> island flow.
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
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', r => r.abort()); // all new artwork must work offline
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`);
    const checks = await page.evaluate(() => {
      const K = window.KazuApp, store = K.Store, T = K.Treasures, names = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); names.push(name); };
      const goldKeys = id => K.Games.list.filter(g => g.world === id)
        .flatMap(g => g.levels.map((lv, i) => g.id + ':' + i + ':g'));
      K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      store.reset();
      K.Home.render(); K.UI.show('home');
      check('all five worlds have a discoverable chest', document.querySelectorAll('#home .world-chest').length === 5);
      check('unknown or empty worlds cannot award a treasure', !store.claimTreasure('unknown') && !T.status('unknown').ready);
      check('unearned treasures cannot be placed', !store.putWorldSticker('treasure:shima', 50, 50));
      const oldBackup = JSON.parse(store.exportText());
      delete oldBackup.data.treasures;
      check('older backups remain importable', store.importText(JSON.stringify(oldBackup)).ok && store.data.treasures.length === 0);
      K.Games.list.forEach(g => g.levels.forEach((lv, i) => { store.addSticker(g.id + ':' + i); store.recordLevel(g.id, i, 3, 8, 8); }));
      check('ordinary stickers and three stars alone do not open chests', K.WORLDS.every(w => !T.status(w.id).ready && !store.claimTreasure(w.id)));
      store.addSticker('daily:gold'); store.addSticker('adventure:gold');
      check('daily and adventure stickers cannot replace level gold', !T.status('shima').ready);
      store.reset();
      K.WORLDS.forEach(w => {
        const keys = goldKeys(w.id);
        keys.slice(0, -1).forEach(k => store.addSticker(k));
        T.open(w.id);
        check(w.id + ': one missing gold keeps the chest locked', !T.status(w.id).ready && !store.claimTreasure(w.id)
          && !document.querySelector('#treasure .treasure-open') && T.status(w.id).got === keys.length - 1);
        check(w.id + ': other worlds cannot supply the missing gold', !store.hasTreasure(w.id));
        store.addSticker(keys[keys.length - 1]);
        T.open(w.id);
        check(w.id + ': all gold makes the open button available', T.status(w.id).ready && !!document.querySelector('#treasure .treasure-open'));
        const stickerCount = store.data.stickers.length, stars = store.totalStars();
        document.querySelector('#treasure .treasure-open').click();
        check(w.id + ': opening awards one separate keepsake', store.hasTreasure(w.id)
          && !document.querySelector('#treasure .treasure-open') && !!document.querySelector('#treasure .treasure-art'));
        check(w.id + ': repeated openings do not duplicate or change learning records', !store.claimTreasure(w.id)
          && store.data.treasures.filter(id => id === w.id).length === 1 && store.data.stickers.length === stickerCount && store.totalStars() === stars);
      });
      K.Book.render();
      check('keepsakes use a separate collection in the book', document.querySelectorAll('#book .treasure-keepsake.owned').length === 5
        && !store.data.stickers.some(k => k.startsWith('treasure:')));
      T.open('shima');
      document.querySelector('#treasure .treasure-sheet button').click();
      check('decorate action preselects the earned treasure', K.UI.currentName() === 'sticker-world'
        && document.querySelector('#sticker-world .world-palette-treasure.selected')?.getAttribute('aria-label').includes(T.name('shima')));
      const board = document.querySelector('#sticker-world .sticker-world-board'), r = board.getBoundingClientRect();
      board.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width * .6, clientY: r.top + r.height * .5 }));
      check('treasure can actually be placed on the island', !!document.querySelector('#sticker-world .world-treasure')
        && Math.abs(store.stickerWorld().items['treasure:shima'].x - 60) < 1);
      store.putWorldSticker('treasure:umi', 30, 40);
      const backup = store.exportText();
      store.reset();
      check('backup restores acquisition and placement', store.importText(backup).ok && store.data.treasures.length === 5
        && store.stickerWorld().items['treasure:umi'].x === 30);
      check('merging the same backup twice cannot duplicate keepsakes', store.importText(backup).ok && store.data.treasures.length === 5);
      const bad = JSON.parse(backup); bad.data.treasures.push('__proto__');
      check('invalid treasure IDs reject the entire import safely', !store.importText(JSON.stringify(bad)).ok && store.data.treasures.length === 5);
      bad.data.treasures = 'shima';
      check('invalid collection shape is rejected', !store.importText(JSON.stringify(bad)).ok);
      store.reset();
      const keys = goldKeys('shima'); keys.forEach(k => store.addSticker(k)); store.claimTreasure('shima');
      store.putWorldSticker('treasure:shima', 60, 50);
      const first = store.exportText();
      store.reset(); goldKeys('umi').forEach(k => store.addSticker(k)); store.claimTreasure('umi');
      store.putWorldSticker('treasure:umi', 30, 40);
      check('merging different devices keeps both treasures and positions', store.importText(first).ok
        && store.data.treasures.length === 2 && store.stickerWorld().items['treasure:shima'].x === 60
        && store.stickerWorld().items['treasure:umi'].x === 30);
      store.flush();
      return names;
    });
    checks.forEach(name => console.log('PASS ' + name));
    await page.reload();
    assert.equal(await page.evaluate(() => {
      const K = window.KazuApp;
      return K.Store.hasTreasure('shima') && K.Store.hasTreasure('umi') && K.Store.stickerWorld().items['treasure:shima'].x === 60;
    }), true, 'acquisition and placement survive a real reload');
    console.log('PASS acquisition and placement survive a real reload');

    // Complete a real level for the last gold, then use the result screen's chest.
    await page.evaluate(() => {
      const K = window.KazuApp, store = K.Store;
      store.reset(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      K.Sound.say = (text, opts) => { if (opts?.onend) opts.onend(); };
      K.Session._test.intro(false);
      K.Games.list.filter(g => g.world === 'shima').forEach(g => g.levels.forEach((lv, i) => {
        if (g.id !== 'count' || i !== 0) store.addSticker(g.id + ':' + i + ':g');
      }));
      K.Session.startLevel(K.Games.byId.count, 0);
      const S = K.Session._test;
      for (let guard = 0; K.UI.currentName() === 'play' && guard < 40; guard++){
        const answer = Number(S.item.split(':').pop());
        document.querySelectorAll('#play .obj:not(.counted)').forEach(n => n.click());
        S.flushTimers(6);
        const choice = [...document.querySelectorAll('#play .choices .choice')].find(n => Number(n.textContent) === answer);
        if (choice) choice.click();
        S.flushTimers(6);
      }
      if (K.UI.currentName() !== 'result' || !document.querySelector('#result .result-treasure .world-chest.ready'))
        throw new Error('the real final gold must show a ready chest on the result screen: ' + JSON.stringify({ screen: K.UI.currentName(), idx: S.idx, item: S.item, pending: S.pending, locked: S.locked, gold: store.hasSticker('count:0:g'), text: document.querySelector('#play .choices').textContent }));
      document.querySelector('#result .result-treasure .world-chest').click();
      document.querySelector('#treasure .treasure-open').click();
      if (!store.hasTreasure('shima')) throw new Error('the result -> chest -> treasure flow failed');
      K.Home.render(); K.UI.show('home'); store.flush();
      document.querySelectorAll('.bigmark').forEach(n => n.remove());
    });
    console.log('PASS real last-gold level -> result -> chest -> treasure');
    if (process.env.TREASURE_SCREENSHOT_DIR) fs.mkdirSync(process.env.TREASURE_SCREENSHOT_DIR, { recursive: true });
    for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]){
      await page.setViewportSize(viewport);
      await page.evaluate(() => { KazuApp.Home.render(); KazuApp.UI.show('home'); });
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'home stays within viewport');
      if (process.env.TREASURE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.TREASURE_SCREENSHOT_DIR, `home-${viewport.width}.png`) });
      await page.evaluate(() => KazuApp.Treasures.open('shima'));
      await page.waitForTimeout(400);
      if (process.env.TREASURE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.TREASURE_SCREENSHOT_DIR, `treasure-${viewport.width}.png`) });
      assert.equal(await page.locator('#treasure .treasure-sheet button').isVisible(), true);
    }
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.evaluate(() => {
      const K = window.KazuApp;
      K.WORLDS.forEach(w => {
        K.Games.list.filter(g => g.world === w.id).forEach(g => g.levels.forEach((lv, i) => K.Store.addSticker(g.id + ':' + i + ':g')));
        K.Store.claimTreasure(w.id);
      });
      K.Book.open();
    });
    if (process.env.TREASURE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.TREASURE_SCREENSHOT_DIR, 'collection.png') });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(400);
    if (process.env.TREASURE_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.TREASURE_SCREENSHOT_DIR, 'collection-dark.png') });
    assert.deepEqual(errors, []);
    console.log('PASS landscape, portrait and phone layouts; no browser errors');
    console.log('Treasure checks passed');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
