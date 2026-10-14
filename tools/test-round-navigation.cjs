#!/usr/bin/env node
'use strict';
// Isolated browser coverage for lap selection, storage, and the new rewards.
// Fixtures live only in this test profile; no child's local records are read.
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
    const errors = [];
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const newPage = async () => {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://**', route => route.abort());
      return page;
    };
    const quiet = async page => page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      K.Sound.say = () => {}; K.Sound.probeVoice = () => Promise.resolve(true);
      K.Session._test.intro(false);
    });
    const passed = name => console.log('PASS ' + name);
    const solveAdultGate = async page => {
      for (let n = 0; n < 2; n++){
        await page.evaluate(() => {
          const [a, b] = document.querySelector('#gate .q').textContent.match(/\d+/g).map(Number);
          [...document.querySelectorAll('#gate .choice')].find(node => Number(node.textContent) === a * b).click();
        });
      }
    };
    const checkNarrowSwitcher = async page => {
      const originalViewport = page.viewportSize();
      try {
        for (const width of [390, 320]){
          await page.setViewportSize({ width, height: 844 });
          const cards = await page.locator('.screen:not([hidden]) .round-switcher .round-choice').evaluateAll(nodes => nodes.map(card => {
            const strong = card.querySelector('strong'), range = document.createRange();
            range.selectNodeContents(strong);
            const lines = [...range.getClientRects()].filter(rect => rect.width && rect.height);
            const cardRect = card.getBoundingClientRect(), labelRect = strong.getBoundingClientRect();
            return {
              text: strong.textContent, lines: lines.length,
              fits: labelRect.left >= cardRect.left && labelRect.right <= cardRect.right,
              overflow: card.scrollWidth > card.clientWidth + 1
            };
          }));
          assert.equal(cards.length, 2, 'both lap choices remain visible at ' + width + 'px');
          assert.ok(cards.every(card => card.lines === 1 && card.fits && !card.overflow), 'lap names stay on one line inside their cards at ' + width + 'px: ' + JSON.stringify(cards));
        }
      } finally { await page.setViewportSize(originalViewport); }
    };
    const screenshotDir = process.env.ROUND_SHOTS && path.resolve(process.env.ROUND_SHOTS);
    if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
    const capture = async (page, name) => {
      if (!screenshotDir) return;
      const originalViewport = page.viewportSize();
      try {
        for (const [device, viewport] of [['tablet', { width: 1024, height: 768 }], ['phone', { width: 390, height: 844 }]]){
          await page.setViewportSize(viewport);
          for (const colorScheme of ['light', 'dark']){
            await page.emulateMedia({ colorScheme });
            await page.evaluate(async () => {
              await document.fonts.ready;
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            });
            const file = path.join(screenshotDir, `${name}-${device}-${colorScheme}.png`);
            await page.screenshot({ path: file, animations: 'disabled' });
          }
        }
      } finally {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.setViewportSize(originalViewport);
      }
    };
    const roundState = page => page.evaluate(() => {
      const K = KazuApp, name = K.UI.currentName(), node = K.UI.screens[name];
      const status = node && node.querySelector('.round-status');
      const style = status && getComputedStyle(status);
      return {
        name, current: K.Rounds.current(), selected: K.Store.data.selectedRound,
        round: node && node.dataset.round, label: status && status.textContent,
        count: node && node.querySelectorAll('.round-status').length,
        theme: style && [style.backgroundColor, style.borderColor, style.color].join('|')
      };
    });
    const expectRound = async (page, name, round) => {
      const state = await roundState(page);
      assert.equal(state.name, name, JSON.stringify(state));
      assert.equal(state.current, round, JSON.stringify(state));
      assert.equal(state.selected, round, JSON.stringify(state));
      assert.equal(state.round, String(round), JSON.stringify(state));
      assert.equal(state.count, 1, 'one persistent lap label per visible screen');
      assert.match(state.label, round === 1 ? /１しゅうめ/ : /２しゅうめ/);
      assert.equal(await page.locator('#' + name + ' .round-status').isVisible(), true, name + ' lap label is visible');
      return state;
    };

    const page = await newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await quiet(page);
    const blank = await page.evaluate(() => {
      const K = KazuApp; K.Store.reset();
      if (!K.Rounds) throw new Error('KazuApp.Rounds is missing');
      K.Rounds.go(1);
      return JSON.parse(K.Store.exportText()).data;
    });
    const firstTheme = (await expectRound(page, 'home', 1)).theme;
    await checkNarrowSwitcher(page);
    await capture(page, 'home1');
    assert.deepEqual(await page.locator('#home .round-switcher [data-round-target]').evaluateAll(nodes => nodes.map(n => n.dataset.roundTarget).sort()), ['1', '2']);
    const lockedButton = page.locator('#home .round-switcher [data-round-target="2"]');
    assert.equal(await lockedButton.isEnabled(), true, 'locked second lap explains its gate when tapped');
    await lockedButton.click();
    await expectRound(page, 'book', 1);
    assert.equal(await page.locator('#book .review-gate').isVisible(), true);
    assert.match(await page.locator('#book .review-gate').innerText(), /131/);
    await page.locator('#book .topbar button').first().click();
    await expectRound(page, 'home', 1);
    await page.evaluate(() => KazuApp.SecondRound.open(0));
    await expectRound(page, 'book', 1);
    assert.equal(await page.evaluate(() => KazuApp.SecondRound.inspect()), null);
    passed('fresh records start on lap 1; the visible locked lap 2 button explains the original 131-sticker gate');

    const validation = await page.evaluate(() => {
      const S = KazuApp.Store, backup = JSON.parse(S.exportText());
      const before = JSON.stringify(backup.data), invalid = [];
      for (const value of [0, 3, -1, 1.5, '2', true, null, {}, []]){
        const incoming = JSON.parse(JSON.stringify(backup)); incoming.data.selectedRound = value;
        const result = S.importText(JSON.stringify(incoming), 'replace');
        invalid.push(!result.ok && JSON.stringify(JSON.parse(S.exportText()).data) === before);
      }
      delete backup.data.selectedRound;
      const legacy = S.importText(JSON.stringify(backup), 'replace');
      return { invalid, legacy: legacy.ok, selected: S.data.selectedRound };
    });
    assert.ok(validation.invalid.every(Boolean), 'invalid preference backups are rejected without changing any records');
    assert.ok(validation.legacy); assert.equal(validation.selected, 1);
    // Raw device storage is less strict than an explicit import: recover the app
    // with a safe preference even when a previous version saved malformed data.
    for (const value of [0, 3, '2', null]){
      const rawPage = await newPage();
      await rawPage.addInitScript(data => localStorage.setItem('kazu-no-bouken.v1', JSON.stringify(data)), { ...blank, selectedRound: value });
      await rawPage.goto(url, { waitUntil: 'domcontentloaded' });
      await quiet(rawPage);
      await rawPage.evaluate(() => { KazuApp.Home.render(); KazuApp.UI.show('home'); });
      await expectRound(rawPage, 'home', 1);
      await rawPage.close();
    }
    passed('legacy preferences default to lap 1; malformed imports are atomic and malformed raw storage recovers safely');

    const original = await page.evaluate(() => {
      const K = KazuApp, S = K.Store, R = K.SecondRound;
      S.reset(); S.completeOrientation(); S.recordDiagnostic([], { gameId: 'count', levelIndex: 0 });
      S.setPref('stars', { 'count:0': 3 });
      S.noteFact('count:count:3', true, '３こ', 'count:0');
      for (const k of R.progress().groups.flatMap(g => g.keys)) if (!k.startsWith('treasure:')) S.addSticker(k);
      K.WORLDS.forEach(w => S.claimTreasure(w.id));
      if (R.progress().got !== 131 || !R.unlocked()) throw new Error('original collection fixture did not open lap 2');
      const keys = R.progress().groups.flatMap(g => g.keys);
      K.Rounds.go(1);
      return {
        keys, art: keys.map(k => K.PokemonStickers.reward(k).id),
        mastery: JSON.stringify([S.data.stars, S.data.facts, S.data.recent, S.data.firstTry, S.data.intro, S.data.pending])
      };
    });
    await expectRound(page, 'home', 1);
    await page.locator('#home .round-switcher [data-round-target="2"]').click();
    const secondTheme = (await expectRound(page, 'review', 2)).theme;
    assert.notEqual(secondTheme, firstTheme, 'lap labels have distinct rendered themes as well as text');
    assert.equal(await page.locator('#review .review-lesson').count(), 20);
    assert.equal(await page.locator('#review .review-summary').count(), 5);
    assert.deepEqual(await page.locator('#review .round-switcher [data-round-target]').evaluateAll(nodes => nodes.map(n => n.dataset.roundTarget).sort()), ['1', '2']);
    await page.locator('#review .round-switcher [data-round-target="1"]').click();
    await expectRound(page, 'home', 1);
    await page.locator('#home .round-switcher [data-round-target="2"]').click();
    await page.evaluate(() => { KazuApp.Home.render(); KazuApp.UI.show('home'); });
    await expectRound(page, 'review', 2);
    await checkNarrowSwitcher(page);
    await capture(page, 'menu2');
    passed('both lap menus expose the switcher; lap 2 has a distinct theme and retains 20 lessons plus five summaries');

    // The same status strip must remain visible while the second-round module
    // replaces its body for questions and results.
    await page.locator('#review [data-lesson="0"]').click();
    await expectRound(page, 'review', 2);
    await capture(page, 'question2');
    const completion = await page.evaluate(() => {
      const K = KazuApp, R = K.SecondRound;
      const click = selector => {
        const node = document.querySelector('#review ' + selector);
        if (!node) throw new Error('Missing review control: ' + selector);
        node.click();
      };
      for (let n = 0; n < 8; n++){
        const { q } = R.inspect();
        if (q.type === 'group') q.answer.forEach(i => click('[data-focus="object' + i + '"]'));
        else if (q.type === 'match') for (let i = 0; i < q.a; i++){
          click('[data-focus="target' + i + '"]'); click('[data-focus="pair' + i + '"]');
        }
        else throw new Error('Unexpected first lesson question: ' + q.type);
        click('.review-check'); click('.review-next');
      }
      return {
        earned: K.Store.hasConfirmed('r2:0'), record: K.Store.data.reviewRecords['r2:0'],
        mastery: JSON.stringify([K.Store.data.stars, K.Store.data.facts, K.Store.data.recent, K.Store.data.firstTry, K.Store.data.intro, K.Store.data.pending]),
        rewardKeys: R.rewardKeys(), rewardIds: R.rewardKeys().map(k => K.PokemonStickers.reward(k).id)
      };
    });
    await expectRound(page, 'review', 2);
    assert.equal(await page.locator('#review .review-result').isVisible(), true);
    assert.ok(completion.earned); assert.equal(completion.record.independent, 8);
    assert.equal(completion.mastery, original.mastery, 'lap 2 preserves first-lap mastery');
    assert.equal(completion.rewardKeys.length, 25); assert.equal(new Set(completion.rewardIds).size, 25);
    assert.ok(completion.rewardIds.every(id => !original.art.includes(id)), 'new stickers use species absent from every original slot');
    const resultSticker = page.locator('#review .review-result .pokemon-second-round');
    assert.equal(await resultSticker.isVisible(), true);
    assert.match(await resultSticker.getAttribute('aria-label'), /２しゅうめ/);
    assert.equal(await resultSticker.locator('.pokemon-round-badge').isVisible(), true);
    await capture(page, 'result2');
    passed('lap 2 questions and results keep their lap label; clean play earns a visibly distinct new sticker without changing lap 1 mastery');

    // Shared destinations preserve which adventure the child was playing and
    // return to its menu using their actual back buttons.
    for (const round of [2, 1]){
      await page.evaluate(round => KazuApp.Rounds.go(round), round);
      if (round === 2) await page.locator('#review .review-tools button').filter({ hasText: 'シールブック' }).click();
      else await page.evaluate(() => KazuApp.Book.open());
      await expectRound(page, 'book', round);
      assert.equal(await page.locator('#book .review-collectible .pokemon-second-round').count(), 25);
      assert.equal(await page.locator('#book .pokemon-second-round-chapter').count(), 5);
      assert.equal(await page.locator('#book .pokemon-sticker[data-sticker-key="count:0"]').evaluate(node => node.classList.contains('pokemon-second-round') || !!node.querySelector('.pokemon-round-badge')), false);
      await page.locator('#book .topbar button').first().click();
      await expectRound(page, round === 2 ? 'review' : 'home', round);
      if (round === 2){
        await page.locator('#review .review-tools button').filter({ hasText: 'じぶんの しま' }).click();
        await page.locator('#sticker-world .world-palette-sticker').filter({ has: page.locator('[data-sticker-key="r2:0"]') }).click();
      } else await page.evaluate(() => KazuApp.StickerWorld.open('r2:0'));
      await expectRound(page, 'sticker-world', round);
      assert.equal(await page.locator('#sticker-world .world-palette-sticker.selected .pokemon-second-round .pokemon-round-badge').isVisible(), true);
      await page.locator('#sticker-world .topbar button').first().click();
      await expectRound(page, round === 2 ? 'review' : 'home', round);
      if (round === 2) await page.locator('#review .review-tools button').filter({ hasText: 'おうちのかたへ' }).click();
      else await page.evaluate(() => KazuApp.Parent.open());
      await expectRound(page, 'gate', round);
      // Solve the adult gate as presented, so this covers its real transition.
      await solveAdultGate(page);
      await expectRound(page, 'parent', round);
      await page.locator('#parent .topbar button').first().click();
      await expectRound(page, round === 2 ? 'review' : 'home', round);
    }
    passed('the shared sticker book, island, adult gate and parent page preserve the lap and return to its correct menu');

    for (const name of ['levels', 'first-steps', 'first-finish', 'play']){
      await page.evaluate(name => {
        const K = KazuApp, game = K.Games.byId.count; K.Rounds.go(2);
        if (name === 'levels'){ K.Levels.render(game); K.UI.show('levels'); }
        if (name === 'first-steps') K.FirstSteps.open(game, 0);
        if (name === 'first-finish') K.FirstSteps.finish(game, 0, 'show');
        if (name === 'play') K.Session.startLevel(game, 0);
      }, name);
      await expectRound(page, name, 1);
    }
    await page.evaluate(() => {
      const K = KazuApp;
      for (let guard = 0; K.UI.currentName() === 'play' && guard < 30; guard++){
        K.Session._test.forceCorrect(); K.Session._test.flushTimers();
      }
    });
    await expectRound(page, 'result', 1);
    await page.locator('#result .result-actions button').filter({ hasText: /あそびを えらぶ|きょうは おしまい/ }).click();
    await expectRound(page, 'home', 1);
    passed('opening first-lap levels, introductions or play explicitly selects lap 1 through the real result and return flow');

    const persistence = await page.evaluate(() => {
      const K = KazuApp, S = K.Store;
      K.Rounds.go(2); const second = S.exportText();
      K.Rounds.go(1); const first = S.exportText();
      S.importText(second); const localFirst = S.data.selectedRound;
      K.Rounds.go(2); S.importText(first); const localSecond = S.data.selectedRound;
      S.importText(first, 'replace'); const replacedFirst = S.data.selectedRound;
      S.importText(second, 'replace'); const replacedSecond = S.data.selectedRound;
      const legacy = JSON.parse(second); delete legacy.data.selectedRound;
      S.importText(JSON.stringify(legacy), 'replace'); const legacyFirst = S.data.selectedRound;
      S.importText(second, 'replace'); K.UI.show('home'); S.flush();
      return { localFirst, localSecond, replacedFirst, replacedSecond, legacyFirst, second };
    });
    assert.deepEqual([persistence.localFirst, persistence.localSecond, persistence.replacedFirst, persistence.replacedSecond, persistence.legacyFirst], [1, 2, 1, 2, 1]);
    await expectRound(page, 'review', 2);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await quiet(page);
    assert.equal(await page.evaluate(() => KazuApp.Store.data.selectedRound), 2);
    assert.equal(await page.evaluate(() => KazuApp.Store.hasConfirmed('r2:0')), true);
    await page.locator('#title button').filter({ hasText: 'はじめる' }).click();
    await page.waitForFunction(() => KazuApp.UI.currentName() === 'review');
    await expectRound(page, 'review', 2);
    assert.equal(await page.evaluate(({ keys, art }) => keys.every((k, i) => KazuApp.PokemonStickers.reward(k).id === art[i]), original), true);
    passed('reload and the title Start button resume lap 2; replace restores selection, merge keeps local selection, and original sticker identities stay fixed');

    // Parent import/reset redraw the existing screen in place rather than
    // calling UI.show again: its lap strip must update in that same redraw.
    await page.locator('#review .review-tools button').filter({ hasText: 'おうちのかたへ' }).click();
    await solveAdultGate(page);
    await expectRound(page, 'parent', 2);
    for (const round of [1, 2]){
      const backup = JSON.parse(persistence.second); backup.data.selectedRound = round;
      await page.locator('#parent .backupbox').fill(JSON.stringify(backup));
      await page.getByRole('button', { name: '読み込み方：合体する', exact: true }).click();
      await page.getByRole('button', { name: '貼り付けから読み込む', exact: true }).click();
      await expectRound(page, 'parent', round);
    }
    await page.getByRole('button', { name: '記録をすべて消す', exact: true }).click();
    await page.getByRole('button', { name: '本当に消しますか？（もう一度タップ）', exact: true }).click();
    await expectRound(page, 'parent', 1);
    assert.equal(await page.getByRole('button', { name: '消しました', exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => KazuApp.Store.hasSticker('r2:0')), false);
    passed('parent backup replacement and confirmed reset immediately redraw the current lap; phone and narrow-phone switcher names stay on one line');

    // A valid preference in an edited/old backup cannot bypass the gate.
    await page.evaluate(blank => {
      const K = KazuApp;
      const backup = { app: 'kazu-no-bouken', v: 1, data: { ...blank, selectedRound: 2 } };
      if (!K.Store.importText(JSON.stringify(backup), 'replace').ok) throw new Error('valid lap preference import failed');
      K.Home.render(); K.UI.show('home');
    }, blank);
    const clamped = await roundState(page);
    assert.equal(clamped.name, 'home'); assert.equal(clamped.current, 1); assert.equal(clamped.round, '1');
    assert.equal(await page.locator('#home .round-status').isVisible(), true);
    await page.evaluate(() => KazuApp.Rounds.go(2));
    assert.notEqual(await page.evaluate(() => KazuApp.UI.currentName()), 'review');
    assert.equal(await page.evaluate(() => KazuApp.Rounds.current()), 1);
    await page.evaluate(() => { KazuApp.Store.reset(); KazuApp.Rounds.go(1); });
    await expectRound(page, 'home', 1);
    assert.deepEqual(errors, []);
    passed('a saved lap 2 preference cannot bypass a locked collection; reset returns to lap 1 and no browser errors occurred');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
