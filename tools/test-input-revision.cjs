#!/usr/bin/env node
'use strict';
// Exercise real input in disposable profiles, with external assets unavailable.
// Run against current sources, or pass INPUT_REVISION_HTML for either built HTML.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js')).sort()
  .map(f => read('src/js/' + f)).join('\n');
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>[hidden]{display:none!important}html,body{margin:0}</style><style>' + read('src/styles.css')
  + '</style></head><body>' + read('src/body.html') + '<script>(function(){\n'
  + scripts.replace(/<\/script>/g, '<\\/script>') + '\n})();</script></body></html>';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(process.env.INPUT_REVISION_HTML ? fs.readFileSync(process.env.INPUT_REVISION_HTML) : source);
});
const viewports = [{width:320,height:568}, {width:390,height:844}, {width:768,height:1024},
  {width:1024,height:768}, {width:1366,height:1024}];

(async () => {
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
    const context = await browser.newContext({viewport:viewports[0], serviceWorkers:'block', reducedMotion:'reduce', timezoneId:'Asia/Tokyo'});
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'domcontentloaded'});
    await page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      K.Sound.say = (text, opts) => { if (opts && opts.onend) opts.onend(); };
      K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.breaks(false);
    });
    const flush = () => page.evaluate(() => KazuApp.Session._test.flushTimers(600));
    const settle = () => page.evaluate(() => new Promise(resolve => {
      document.getAnimations().forEach(a => { if (Number.isFinite(a.effect.getTiming().iterations)) try { a.finish(); } catch (e) {} });
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    const start = async (id, level, pattern = '') => {
      await page.evaluate(({id, level, pattern}) => {
        const K = KazuApp;
        for (let i = 0; i < 1200; i++) {
          K.Store.reset(); K.Store.setPref('g1Open', true);
          K.Session.startLevel(K.Games.byId[id], level);
          if (!pattern || new RegExp(pattern).test(K.Session._test.item)) return;
        }
        throw new Error('Could not generate ' + id + ' ' + pattern);
      }, {id, level, pattern});
      await settle();
    };
    const state = () => page.evaluate(() => {
      const K = KazuApp, T = K.Session._test;
      return {item:T.item, idx:T.idx, wrong:T.wrongThisQ, mistakes:T.mistakes, helped:T.helped,
        taught:T.taughtQ, locked:T.locked, count:K.Store.todayCount(), saved:K.Store.savedSession()};
    });
    const slots = () => page.locator('#play .three-sum-slot').allTextContents();
    const key = n => page.locator('#play .choices .padkey').filter({hasText:new RegExp('^' + n + '$')});
    const choose = async values => { for (const n of values) await key(n).click(); };
    const submit = () => page.locator('#play .three-submit');
    const revise = async (at, n) => {
      await page.locator('#play .three-sum-slot').nth(at).click(); await key(n).click();
    };
    const expectDraft = async (values, wrong = 0) => {
      assert.deepEqual((await slots()).map(s => s.trim().replace('？', '?')), values.map(String));
      const s = await state();
      assert.equal(s.wrong, wrong, 'draft edits do not create attempts');
      assert.equal(s.count, 0, 'filling all three terms does not submit');
      assert.equal(s.locked, false);
    };
    const pointOn = async (locator, corner = 'centre', minimum = 0) => {
      await settle();
      const box = await locator.boundingBox();
      assert.ok(box, 'target exists and is visible');
      const viewport = page.viewportSize();
      assert.ok(box.width >= minimum - .1 && box.height >= minimum - .1,
        'target is at least ' + minimum + 'px: ' + JSON.stringify(box));
      assert.ok(box.x >= -.5 && box.y >= -.5 && box.x + box.width <= viewport.width + .5
        && box.y + box.height <= viewport.height + .5, 'target stays fully on screen: ' + JSON.stringify(box));
      // Corners are inset enough to be inside the intentionally rounded plate.
      const ix = Math.min(18, box.width / 4), iy = Math.min(18, box.height / 4);
      const point = {x:box.x + (corner.includes('left') ? ix : corner.includes('right') ? box.width - ix : box.width / 2),
        y:box.y + (corner.includes('top') ? iy : corner.includes('bottom') ? box.height - iy : box.height / 2)};
      if (!await locator.isDisabled()) assert.equal(await locator.evaluate((node, p) => { const hit = document.elementFromPoint(p.x, p.y); return node === hit || node.contains(hit); }, point),
        true, corner + ' of target receives the pointer');
      return point;
    };
    const threeLayout = async () => {
      await settle();
      const builder = await page.locator('#play .three-builder').boundingBox();
      const prompt = await page.locator('#play .prompt').boundingBox();
      const pad = await page.locator('#play .choices').boundingBox();
      assert.ok(builder.y >= prompt.y + prompt.height - 2, 'the expression stays below the prompt');
      assert.ok(builder.y + builder.height <= pad.y + 2, 'the expression and its instruction stay above every number key');
      assert.equal(await page.locator('#play .three-sum > span').last().evaluate(node => {
        const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects().length;
      }), 1, 'the equality and total remain on one line');
      for (let i = 0; i < 3; i++) await pointOn(page.locator('#play .three-sum-slot').nth(i), 'centre', 48);
      await pointOn(page.locator('#play .three-undo'), 'centre', 48);
      await pointOn(submit(), 'centre', 48);
      for (let n = 0; n <= 9; n++) await pointOn(key(n), 'centre', 64);
    };

    // Rebuild each question before a tap: a wrong tap must be recorded, while a
    // correct one locks the question. This catches an invisible overlay even if
    // only the middle plate is affected at a particular offline screen size.
    let plateClicks = 0;
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const level of [0, 1]) for (const index of [0, 1, 2]) {
        for (const corner of ['centre', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) {
          await start('numeral', level, '^numeral:n2q:');
          const plate = page.locator('#play .choices > .plate').nth(index);
          const value = Number(await plate.getAttribute('data-count'));
          const answer = Number((await state()).item.split(':').at(-1));
          const point = await pointOn(plate, corner);
          await page.mouse.click(point.x, point.y);
          const s = await state(), right = value === answer;
          assert.equal(s.wrong, right ? 0 : 1, 'real ' + corner + ' click grades the selected plate');
          assert.equal(s.count, right ? 1 : 0, 'real plate click counts only a matching quantity');
          assert.equal(s.locked, right);
          plateClicks++;
        }
      }
      console.log('PASS ' + viewport.width + '×' + viewport.height + ' offline numeral L1/L2 plate centres and four corners');
    }
    assert.equal(plateClicks, 150);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await start('ten', 2, '^ten:three10$');
      assert.equal(await submit().isDisabled(), true);
      await threeLayout();
      if (viewport.width === 320) await page.screenshot({path:'/tmp/math-youji-input-revision-320-empty.png', animations:'disabled'});
      await choose([9, 9]); await expectDraft([9, 9, '?']);
      await page.locator('#play .three-undo').click(); await expectDraft([9, '?', '?']);
      await choose([2, 3]); await expectDraft([9, 2, 3]);
      await threeLayout();
      if (viewport.width === 320) await page.screenshot({path:'/tmp/math-youji-input-revision-320-filled.png', animations:'disabled'});
      assert.equal(await submit().isEnabled(), true);
      assert.equal(await key(5).isDisabled(), true, 'a full draft waits for a term selection or submission');
      await revise(0, 5); await expectDraft([5, 2, 3]);
      await page.locator('#play .three-undo').click(); await expectDraft([9, 2, 3]);
      await revise(0, 5); await revise(1, 3); await revise(2, 2);
      await expectDraft([5, 3, 2]);
      const submitPoint = await pointOn(submit(), 'centre', 48);
      await page.mouse.click(submitPoint.x, submitPoint.y);
      const s = await state();
      assert.equal(s.count, 1); assert.equal(s.wrong, 0); assert.equal(s.saved.firstTryRight, 1);
      assert.notEqual(s.saved.results[0], 'miss');
      await page.evaluate(() => document.querySelector('#play .three-submit').click());
      assert.equal((await state()).count, 1, 'a second submit cannot duplicate a completed question');
      console.log('PASS ' + viewport.width + '×' + viewport.height + ' editable three-term draft, insertion/replacement undo and explicit clean submission');
    }

    await page.setViewportSize({width:320,height:568});
    await start('ten', 2, '^ten:three10$'); await choose([9, 9, 0]);
    await submit().click(); await flush();
    await threeLayout();
    let s = await state();
    assert.equal(s.wrong, 1); assert.equal(s.mistakes, 1); assert.equal(s.count, 0);
    assert.deepEqual((await slots()).map(s => s.trim()), ['9', '9', '0'], 'an incorrect submitted expression remains available to edit');
    await revise(0, 1); await expectDraft([1, 9, 0], 1);
    await page.locator('#play .three-undo').click(); await expectDraft([9, 9, 0], 1);
    await revise(0, 1); await submit().click();
    s = await state(); assert.equal(s.count, 1); assert.equal(s.wrong, 1);
    assert.equal(s.saved.firstTryRight, 0); assert.equal(s.saved.results[0], 'miss');
    console.log('PASS a real wrong submission stays recorded through subsequent editing and undo');

    for (const viewport of [{width:320,height:568}, {width:1024,height:768}]) {
      await page.setViewportSize(viewport);
      await start('ten', 2, '^ten:three10$');
      await page.locator('#play .showbtn').click(); await threeLayout();
      await choose([5, 2, 3]); await threeLayout();
      if (viewport.width === 320) await page.screenshot({path:'/tmp/math-youji-input-revision-320-hint.png', animations:'disabled'});
      await submit().click();
      s = await state(); assert.equal(s.helped, true); assert.equal(s.saved.firstTryRight, 0); assert.equal(s.saved.results[0], 'miss');
    }
    console.log('PASS phone/tablet hinted constructions stay operable and keep supported grading');

    await page.setViewportSize({width:320,height:568});
    await start('ten', 2, '^ten:three10$'); await choose([9, 9, 0]);
    for (let i = 0; i < 5; i++) {
      if (i) await revise(2, i);
      await submit().click(); await flush();
      await threeLayout();
    }
    assert.equal((await state()).wrong, 5);
    await page.screenshot({path:'/tmp/math-youji-input-revision-320-teach-ready.png', animations:'disabled'});
    await page.locator('#play .teachbtn').click(); await flush();
    s = await state(); assert.equal(s.taught, true); assert.equal(s.count, 1);
    assert.equal(s.saved.firstTryRight, 0); assert.equal(s.saved.results[0], 'miss');
    assert.deepEqual((await slots()).map(s => s.trim()), ['5', '2', '3'], 'answer demonstration constructs a visible valid expression despite disabled keys');
    console.log('PASS answer demonstration builds and submits 5＋2＋3 while preserving taught/mistake records');

    await page.evaluate(() => KazuApp.Session._test.intro(true));
    await start('ten', 2, '^ten:three10$'); await flush();
    assert.equal(await page.evaluate(() => KazuApp.Session._test.idx), 1);
    assert.equal(await page.evaluate(() => KazuApp.Session._test.introStep), 'together');
    assert.equal((await state()).saved.results[0], 'introdone');
    assert.equal((await state()).saved.firstTryRight, 0);
    await page.evaluate(() => KazuApp.Session._test.intro(false));
    console.log('PASS first-time three-term demonstration completes and hands control to the child');

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await start('count', 2, '^count:give:');
      const target = Number((await state()).item.split(':').at(-1));
      for (let i = 0; i < target; i++) await page.locator('#play .collect-field .obj').nth(i).click();
      const done = page.getByRole('button', {name:'できた！', exact:true});
      const point = await pointOn(done, 'centre', 48); await page.mouse.click(point.x, point.y);
      assert.equal((await state()).count, 1);
      for (const mode of ['set', 'sethalf']) {
        await start('clock', 2, '^clock:' + mode + ':');
        const hour = Number((await state()).item.split(':').at(-1));
        if (mode === 'sethalf') await page.getByRole('button', {name:'ながい はりを 6に', exact:true}).click();
        else {
          for (let i = 0; i < 12; i++) {
            const current = Number((await page.locator('#play .clock-readout').textContent()).match(/\d+/)[0]);
            if (current === hour) break;
            await page.getByRole('button', {name:'1じ すすめる', exact:true}).click();
          }
        }
        const check = page.getByRole('button', {name:'これで いい？', exact:true});
        const p = await pointOn(check, 'centre', 48); await page.mouse.click(p.x, p.y);
        assert.equal((await state()).count, 1, mode + ' is completed using the visible large confirmation');
      }
      console.log('PASS ' + viewport.width + '×' + viewport.height + ' collection and both clock modes have reachable 48px confirmations');
    }
    assert.deepEqual(errors, []);
    console.log('PASS all input revision scenarios; browser exceptions: 0');
  } catch (error) {
    const page = browser && browser.contexts()[0]?.pages()[0];
    if (page) {
      await page.screenshot({path:'/tmp/math-youji-input-revision-failure.png', animations:'disabled'}).catch(() => {});
      console.error(await page.evaluate(() => ({item:KazuApp.Session._test.item, prompt:document.querySelector('#play .prompt')?.textContent,
        slots:[...document.querySelectorAll('#play .three-sum-slot')].map(n => n.textContent), choices:document.querySelector('#play .choices')?.textContent,
        geometry:['.prompt', '.three-builder', '.choices', '.teachbtn'].map(selector => {
          const n = document.querySelector('#play ' + selector), r = n?.getBoundingClientRect();
          return {selector, top:r?.top, bottom:r?.bottom, height:r?.height};
        })})).catch(() => ({})));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
