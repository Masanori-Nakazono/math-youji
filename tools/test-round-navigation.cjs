#!/usr/bin/env node
'use strict';
// A lap includes the whole existing map, adventures and textbook review.
// Fresh browser contexts keep every fixture separate from the child's records.
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
    res.writeHead(err ? 404 : 200, {
      'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(err ? 'not found' : body);
  });
});

(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const errors = [], url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const newPage = async () => {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://**', route => route.abort());
      return page;
    };
    const quiet = page => page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      K.Sound.say = () => {}; K.Sound.probeVoice = () => Promise.resolve(true);
      K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.autoAdvance(true); K.Session._test.breaks(false);
    });
    const passed = name => console.log('PASS ' + name);
    const solveAdultGate = async page => {
      for (let n = 0; n < 2; n++) await page.evaluate(() => {
        const [a, b] = document.querySelector('#gate .q').textContent.match(/\d+/g).map(Number);
        [...document.querySelectorAll('#gate .choice')].find(node => Number(node.textContent) === a * b).click();
      });
    };
    const expectRound = async (page, name, round) => {
      const state = await page.evaluate(() => {
        const K = KazuApp, name = K.UI.currentName(), node = K.UI.screens[name], label = node.querySelector('.round-status');
        return { name, current: K.Rounds.current(), selected: K.Store.data.selectedRound,
          round: node.dataset.round, label: label && label.textContent, count: node.querySelectorAll('.round-status').length,
          theme: label && [getComputedStyle(label).backgroundColor, getComputedStyle(label).borderColor].join('|') };
      });
      assert.equal(state.name, name, JSON.stringify(state));
      assert.equal(state.current, round, JSON.stringify(state));
      assert.equal(state.selected, round, JSON.stringify(state));
      assert.equal(state.round, String(round), JSON.stringify(state));
      assert.equal(state.count, 1, 'one lap status on ' + name);
      assert.match(state.label, round === 1 ? /１しゅうめ/ : /２しゅうめ/);
      assert.equal(await page.locator('#' + name + ' .round-status').isVisible(), true);
      return state;
    };
    const shots = process.env.ROUND_SHOTS && path.resolve(process.env.ROUND_SHOTS);
    if (shots) fs.mkdirSync(shots, { recursive: true });
    const capture = async (page, name) => {
      if (!shots) return;
      for (const [device, viewport] of [['tablet', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]){
        await page.setViewportSize(viewport);
        for (const colorScheme of ['light', 'dark']){
          await page.emulateMedia({ colorScheme });
          await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
          await page.screenshot({ path: path.join(shots, `${name}-${device}-${colorScheme}.png`), animations: 'disabled' });
        }
      }
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setViewportSize({ width: 1024, height: 768 });
    };
    const page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await quiet(page);
    const blank = await page.evaluate(() => { KazuApp.Store.reset(); return JSON.parse(KazuApp.Store.exportText()).data; });

    // Startup must migrate the old, incorrectly named "second round" to lap 1.
    const legacy = JSON.parse(JSON.stringify(blank));
    for (const key of ['roundSchema', 'roundTwoReached', 'roundTwo']) delete legacy[key];
    legacy.selectedRound = 2; legacy.secondRoundReached = true;
    legacy.stars = { 'count:0': 3 }; legacy.intro = { 'count:0': 1 };
    legacy.stickers = ['count:0', 'r2:0', 'r2chapter:0'];
    legacy.reviewRecords = { 'r2:0': { day: 1, at: 100, runs: 2, kind: 'lesson', independent: 8, revised: 0, supported: 0 } };
    legacy.stickerWorld.items = { 'r2:0': { x: 25, y: 35 } };
    const migratedPage = await newPage();
    await migratedPage.addInitScript(data => localStorage.setItem('kazu-no-bouken.v1', JSON.stringify(data)), legacy);
    await migratedPage.goto(url, { waitUntil: 'domcontentloaded' }); await quiet(migratedPage);
    const migrated = await migratedPage.evaluate(() => {
      const K = KazuApp, S = K.Store; K.Rounds.go(1); K.TextbookReview.open();
      return { round: S.round(), root: JSON.parse(S.exportText()).data,
        badge: !!document.querySelector('#review [data-sticker-key="r2:0"] .pokemon-round-badge'), unlocked: K.Rounds.unlocked() };
    });
    assert.equal(migrated.round, 1); assert.equal(migrated.unlocked, false);
    for (const key of ['stars', 'intro', 'stickers', 'reviewRecords']) assert.deepEqual(migrated.root[key], legacy[key]);
    assert.deepEqual(migrated.root.stickerWorld.items, legacy.stickerWorld.items);
    assert.equal(migrated.root.secondRoundReached, true); assert.equal(migrated.root.roundTwo, null);
    assert.equal(migrated.badge, false);
    await expectRound(migratedPage, 'review', 1); await capture(migratedPage, 'textbook1'); await migratedPage.close();
    passed('legacy selectedRound 2 becomes lap 1 while retaining textbook records, stickers and island placement');

    await page.evaluate(() => KazuApp.Rounds.go(1));
    const firstTheme = (await expectRound(page, 'home', 1)).theme;
    await capture(page, 'home1');
    await page.locator('#home .home-more').evaluate(node => { node.open = true; });
    await page.locator('#home [data-round-target="2"]').click();
    await expectRound(page, 'book', 1);
    assert.match(await page.locator('#book .round-collection').innerText(), /156/);
    const gate = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, R = K.TextbookReview;
      R.progress().groups.flatMap(g => g.keys).filter(k => !k.startsWith('treasure:')).forEach(k => S.addSticker(k));
      K.WORLDS.forEach(w => S.claimTreasure(w.id)); K.Rounds.go(1); R.open();
      return { count: R.progress().got, unlocked: R.unlocked(), repeat: K.Rounds.unlocked(),
        lessons: document.querySelectorAll('#review .review-lesson').length, summaries: document.querySelectorAll('#review .review-summary').length };
    });
    assert.deepEqual(gate, { count: 131, unlocked: true, repeat: false, lessons: 20, summaries: 5 });
    await expectRound(page, 'review', 1);
    const complete = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, keys = K.TextbookReview.rewardKeys();
      keys.slice(0, -1).forEach(k => S.addSticker(k)); S.addPending(keys.at(-1));
      const pending = { progress: K.Rounds.progress(1).got, open: K.Rounds.unlocked() };
      S.confirmSticker(keys.at(-1)); S.recordLevel('count', 0, 3, 8, 8); S.markIntroduced('count', 0);
      S.recordReview('r2:0', Array(8).fill('independent'), 'lesson'); S.completeOrientation();
      S.setPref('createdAt', Date.now() - 120 * 86400000); K.Rounds.go(1);
      return { pending, progress: K.Rounds.progress(1).got, open: K.Rounds.unlocked(), keys: K.Rounds.rewardKeys(),
        first: K.Rounds.rewardKeys().map(k => K.PokemonStickers.reward(k, 1).id), second: K.Rounds.rewardKeys().map(k => K.PokemonStickers.reward(k, 2).id) };
    });
    assert.deepEqual(complete.pending, { progress: 155, open: false });
    assert.equal(complete.progress, 156); assert.equal(complete.open, true); assert.equal(complete.keys.length, 156);
    assert.equal(new Set(complete.first.concat(complete.second)).size, 312, 'all 312 fixed species are different');
    passed('related preparation opens textbook chapters within lap 1; all 156 confirmed collection rewards unlock the true second lap');

    await page.locator('#home .home-more').evaluate(node => { node.open = true; });
    await page.locator('#home [data-round-target="2"]').click();
    assert.notEqual((await expectRound(page, 'home', 2)).theme, firstTheme);
    assert.equal(await page.locator('#home .gamecard').count(), 20, 'lap 2 opens the complete map');
    const fresh = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, data = S.roundData(2);
      return { levels: K.Games.list.reduce((n, g) => n + g.levels.length, 0), stars: S.totalStars(), stickers: data.stickers.length,
        review: data.reviewRecords, recommended: K.Diagnostic.current(), introduced: S.introduced('count', 0), nextLevel: S.levelUnlocked('count', 1),
        classroom: K.Progress.g1Open(), transfer: K.TransferAdventure.unlocked(), textbook: K.TextbookReview.unlocked(),
        treasure: K.Treasures.status('shima'), first: JSON.stringify(Object.fromEntries(Object.keys(data).map(k => [k, S.roundData(1)[k]]))) };
    });
    assert.equal(fresh.levels, 60); assert.equal(fresh.stars, 0); assert.equal(fresh.stickers, 0); assert.deepEqual(fresh.review, {});
    assert.deepEqual(fresh.recommended, { gameId: 'count', levelIndex: 0 });
    for (const key of ['introduced', 'nextLevel', 'classroom', 'transfer', 'textbook']) assert.equal(fresh[key], false, key + ' starts fresh');
    assert.equal(fresh.treasure.ready, false); assert.equal(fresh.treasure.opened, false); await capture(page, 'home2');
    for (const width of [390, 320]){
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'map fits ' + width + 'px');
      assert.equal(await page.locator('#home .round-choice').count(), 2);
    }
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.evaluate(() => KazuApp.Parent.open()); await expectRound(page, 'gate', 2);
    await solveAdultGate(page); await expectRound(page, 'parent', 2);
    assert.match(await page.locator('#parent').innerText(), /1周目の入学前48レベルはすべてクリア済み/);
    assert.equal(await page.locator('#parent .schedule').innerText().then(text => text.includes('48 / 48 レベル')), true);
    await page.locator('#parent .topbar button').first().click(); await expectRound(page, 'home', 2);
    await page.evaluate(() => { KazuApp.Levels.render(KazuApp.Games.byId.count); KazuApp.UI.show('levels'); });
    await expectRound(page, 'levels', 2);
    await page.evaluate(() => KazuApp.FirstSteps.open(KazuApp.Games.byId.count, 0)); await expectRound(page, 'first-steps', 2);
    await page.evaluate(() => { KazuApp.Rounds.go(2); KazuApp.Store.flush(); });
    await page.reload({ waitUntil: 'domcontentloaded' }); await quiet(page);
    assert.equal(await page.evaluate(() => KazuApp.Store.round()), 2);
    await page.locator('#title button').filter({ hasText: 'はじめる' }).click();
    await page.waitForFunction(() => KazuApp.UI.currentName() === 'home'); await expectRound(page, 'home', 2);
    passed('all 60 levels restart with fresh introductions and gates; reload and Start resume the second-lap home map');

    // Drive the actual count controls, engine result, earned art and return button.
    await page.evaluate(() => KazuApp.Session.startLevel(KazuApp.Games.byId.count, 0)); await expectRound(page, 'play', 2);
    const played = await page.evaluate(() => {
      const K = KazuApp, S = K.Session._test;
      for (let guard = 0; K.UI.currentName() === 'play' && guard < 40; guard++){
        const answer = Number(S.item.split(':').pop());
        document.querySelectorAll('#play .obj:not(.counted)').forEach(n => n.click()); S.flushTimers(6);
        const choice = [...document.querySelectorAll('#play .choices .choice')].find(n => Number(n.textContent) === answer);
        if (choice) choice.click(); S.flushTimers(6);
      }
      return { screen: K.UI.currentName(), stars: K.Store.stars('count', 0), normal: K.Store.hasConfirmed('count:0'), gold: K.Store.hasConfirmed('count:0:g'),
        first: JSON.stringify(Object.fromEntries(Object.keys(K.Store.roundData(2)).map(k => [k, K.Store.roundData(1)[k]]))) };
    });
    assert.equal(played.screen, 'result'); assert.equal(played.stars, 3); assert.equal(played.normal, true); assert.equal(played.gold, true);
    assert.equal(played.first, fresh.first); await expectRound(page, 'result', 2);
    assert.ok(await page.locator('#result .pokemon-second-round .pokemon-round-badge').count() > 0); await capture(page, 'sticker2');
    await page.locator('#result .result-actions button').filter({ hasText: /きょうは ここまで|きょうは おしまい/ }).click();
    await expectRound(page, 'home', 2);
    passed('a replayed level earns distinct lap 2 normal and gold stickers without changing any first-lap learning field');

    // Controlled progress fixtures open the later modules only within lap 2.
    await page.evaluate(() => {
      const K = KazuApp, S = K.Store;
      K.Games.list.forEach(g => g.levels.forEach((lv, i) => { S.addSticker(g.id + ':' + i); S.addSticker(g.id + ':' + i + ':g'); }));
      K.Treasures.open('shima');
    });
    await expectRound(page, 'treasure', 2); await page.locator('#treasure .treasure-open').click();
    assert.equal(await page.locator('#treasure .treasure-art.pokemon-second-round').count(), 1);
    await page.locator('#treasure .topbar button').first().click(); await expectRound(page, 'home', 2);
    await page.evaluate(() => KazuApp.TransferAdventure.open()); await expectRound(page, 'transfer', 2);
    assert.equal(await page.locator('#transfer .transfer-card').count(), 6);
    await page.evaluate(() => {
      const oldRandom = Math.random; Math.random = () => .5;
      try {
        document.querySelector('#transfer [data-mission="0"]').click();
        for (let step = 0; step < 5; step++){
          for (let i = 0; i < 4; i++) document.querySelector('#transfer [aria-label="１つ うごかす"]').click();
          document.querySelector('#transfer .transfer-check').click(); document.querySelector('#transfer .transfer-next').click();
        }
      } finally { Math.random = oldRandom; }
    });
    assert.equal(await page.evaluate(() => KazuApp.Store.hasConfirmed('transfer:0') && KazuApp.Store.data.transferRecords[0].independent === 5), true);
    assert.equal(await page.locator('#transfer .transfer-result .pokemon-second-round').count(), 1);
    await page.locator('#transfer button').filter({ hasText: 'きょうは ここまで' }).click(); await expectRound(page, 'home', 2);
    await page.evaluate(() => {
      const K = KazuApp, S = K.Store;
      K.TextbookReview.progress().groups.flatMap(g => g.keys).filter(k => !k.startsWith('treasure:')).forEach(k => S.addSticker(k));
      K.WORLDS.forEach(w => S.claimTreasure(w.id)); K.TextbookReview.open();
    });
    await expectRound(page, 'review', 2);
    assert.equal(await page.locator('#review .review-lesson').count(), 20); assert.equal(await page.locator('#review .review-summary').count(), 5);
    assert.deepEqual(await page.locator('#review .review-lesson:not([disabled])').evaluateAll(nodes => nodes.map(n => Number(n.dataset.lesson))),
      [0, 4, 8, 12, 16], 'each prepared chapter restarts with only its own first lesson available');
    assert.equal(await page.locator('#review .review-summary:not([disabled])').count(), 0, 'summaries still wait for four confirmed lessons in their own chapter');
    const review = await page.evaluate(() => {
      const K = KazuApp, R = K.TextbookReview, S = K.Store;
      const click = sel => { const n = document.querySelector('#review ' + sel); if (!n) throw new Error('Missing review control ' + sel); n.click(); };
      // Only the first chapter is needed here; test-review covers every format.
      const finish = () => {
        const total = R.inspect().run.total;
        for (let step = 0; step < total; step++){
          const { q } = R.inspect();
          if (q.type === 'group') q.answer.forEach(i => click('[data-focus="object' + i + '"]'));
          else if (q.type === 'match') for (let i = 0; i < q.a; i++){ click('[data-focus="target' + i + '"]'); click('[data-focus="pair' + i + '"]'); }
          else click('[data-number="' + q.answer + '"]');
          click('.review-check'); click('.review-next');
        }
      };
      R.open(0); finish(); for (let i = 1; i < 4; i++) S.addSticker('r2:' + i);
      R.open(null, 0); finish();
      return { lesson: S.hasConfirmed('r2:0'), summary: S.hasConfirmed('r2chapter:0'), runs: S.data.reviewRecords['r2:0'].runs,
        chapter: S.data.reviewRecords['r2chapter:0'].kind, first: JSON.stringify(Object.fromEntries(Object.keys(S.roundData(2)).map(k => [k, S.roundData(1)[k]]))) };
    });
    assert.equal(review.lesson, true); assert.equal(review.summary, true); assert.equal(review.runs, 1); assert.equal(review.chapter, 'chapter');
    assert.equal(review.first, fresh.first); assert.equal(await page.locator('#review .review-result .pokemon-second-round-chapter').count(), 1);
    await page.locator('#review .topbar button').first().click(); await page.locator('#review .topbar button').first().click();
    await expectRound(page, 'home', 2);
    passed('lap 2 independently replays chests, six adventures, 20 textbook lessons and five summaries with new rewards');

    const island = await page.evaluate(() => {
      const K = KazuApp, S = K.Store;
      S.putWorldSticker('count:0', 20, 30); S.putWorldSticker('lap2:count:0', 70, 60); K.StickerWorld.open('count:0');
      return { selected: document.querySelector('#sticker-world .world-palette-sticker.selected [data-sticker-key]').dataset.stickerKey,
        keys: S.ownedStickerKeys(), items: S.stickerWorld().items,
        first: document.querySelector('#sticker-world .world-sticker [data-sticker-key="count:0"]').dataset.pokemon,
        second: document.querySelector('#sticker-world .world-sticker [data-sticker-key="lap2:count:0"]').dataset.pokemon };
    });
    await expectRound(page, 'sticker-world', 2);
    assert.equal(island.selected, 'lap2:count:0'); assert.ok(island.keys.includes('count:0') && island.keys.includes('lap2:count:0'));
    assert.deepEqual(island.items['count:0'], { x: 20, y: 30 }); assert.deepEqual(island.items['lap2:count:0'], { x: 70, y: 60 });
    assert.notEqual(island.first, island.second);
    await page.locator('#sticker-world .topbar button').first().click(); await expectRound(page, 'home', 2);
    await page.evaluate(() => KazuApp.Book.open()); await expectRound(page, 'book', 2);
    await page.locator('#book .topbar button').first().click(); await expectRound(page, 'home', 2);
    await page.evaluate(() => KazuApp.Parent.open()); await expectRound(page, 'gate', 2);
    await solveAdultGate(page);
    await expectRound(page, 'parent', 2);
    await page.locator('#parent .topbar button').first().click(); await expectRound(page, 'home', 2);
    passed('shared book, island and parent pages retain the lap; both generations of stickers coexist on the island');

    const backup = await page.evaluate(legacy => {
      const K = KazuApp, S = K.Store, second = S.exportText(), original = JSON.parse(second);
      const fingerprint = () => JSON.stringify(JSON.parse(S.exportText()).data);
      const replace = S.importText(second, 'replace').ok && S.round() === 2;
      S.importText(second); S.importText(second); const idempotent = fingerprint() === JSON.stringify(original.data);
      K.Rounds.go(1); const firstSelected = S.exportText(); S.importText(second); const mergeFirst = S.round();
      K.Rounds.go(2); S.importText(firstSelected); const mergeSecond = S.round();
      S.importText(firstSelected, 'replace'); const replaceFirst = S.round(); S.importText(second, 'replace');
      const before = fingerprint(), invalid = [];
      for (const mutate of [
        data => { data.roundTwo.stars['count:0'] = 99; },
        data => { data.roundTwo.reviewRecords['r2:0'].supported = 9; },
        data => { data.roundTwo = []; }, data => { data.selectedRound = '2'; }
      ]){
        const bad = JSON.parse(second); mutate(bad.data);
        invalid.push(!S.importText(JSON.stringify(bad), 'replace').ok && fingerprint() === before);
      }
      const laneBefore = JSON.stringify(S.roundData(2));
      const legacyMerge = S.importText(JSON.stringify({ app: 'kazu-no-bouken', v: 1, data: legacy })).ok;
      const legacySafe = laneBefore === JSON.stringify(S.roundData(2)) && S.round() === 2;
      S.importText(second, 'replace'); S.flush();
      return { replace, idempotent, mergeFirst, mergeSecond, replaceFirst, invalid, legacyMerge, legacySafe,
        firstRuns: original.data.reviewRecords['r2:0'].runs, secondRuns: original.data.roundTwo.reviewRecords['r2:0'].runs };
    }, legacy);
    assert.equal(backup.replace, true); assert.equal(backup.idempotent, true);
    assert.deepEqual([backup.mergeFirst, backup.mergeSecond, backup.replaceFirst], [1, 2, 1]);
    assert.ok(backup.invalid.every(Boolean), 'invalid nested data rejects the whole backup atomically');
    assert.equal(backup.legacyMerge, true); assert.equal(backup.legacySafe, true); assert.equal(backup.firstRuns, 1); assert.equal(backup.secondRuns, 1);
    await page.reload({ waitUntil: 'domcontentloaded' }); await quiet(page);
    const restored = await page.evaluate(({ keys, first }) => {
      const K = KazuApp, S = K.Store; K.Rounds.go(2); K.StickerWorld.open();
      return { round: S.round(), plays: [S.roundData(1).plays['count:0'], S.roundData(2).plays['count:0']], items: S.stickerWorld().items,
        stable: keys.every((k, i) => K.PokemonStickers.reward(k, 1).id === first[i]),
        firstBadge: !!document.querySelector('#sticker-world [data-sticker-key="count:0"] .pokemon-round-badge'),
        secondBadge: !!document.querySelector('#sticker-world [data-sticker-key="lap2:count:0"] .pokemon-round-badge') };
    }, complete);
    assert.equal(restored.round, 2); assert.deepEqual(restored.plays, [1, 1]); assert.equal(restored.stable, true);
    assert.deepEqual(restored.items, island.items); assert.equal(restored.firstBadge, false); assert.equal(restored.secondBadge, true);
    await page.evaluate(() => KazuApp.Rounds.go(1)); await expectRound(page, 'home', 1);
    assert.equal(await page.evaluate(() => KazuApp.Store.hasConfirmed('r2chapter:4')), true);
    await page.evaluate(() => KazuApp.Rounds.go(2)); await expectRound(page, 'home', 2);
    assert.equal(await page.evaluate(() => KazuApp.Store.hasSticker('r2chapter:4')), false);
    assert.deepEqual(errors, []);
    passed('backup replace, idempotent merge and reload preserve both laps; legacy imports cannot change lap 2; invalid nested data is atomic');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
