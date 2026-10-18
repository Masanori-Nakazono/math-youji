#!/usr/bin/env node
'use strict';
// Exercise the child's current stage in disposable storage. Serve current sources
// by default so this suite can also run before distribution files are rebuilt.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const script = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js')).sort()
  .map(f => read('src/js/' + f)).join('\n');
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>[hidden]{display:none!important}html,body{margin:0}</style><style>' + read('src/styles.css')
  + '</style></head><body>' + read('src/body.html') + '<script>(function(){\n'
  + script.replace(/<\/script>/g, '<\\/script>') + '\n})();</script></body></html>';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(process.env.STAGE_COACH_HTML ? fs.readFileSync(process.env.STAGE_COACH_HTML) : source);
});

(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://**', r => r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      window.stageSpeech = [];
      K.Sound.say = (text, opts) => { window.stageSpeech.push(text); if (opts && opts.onend) opts.onend(); };
      K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.breaks(false);
    });
    const flush = () => page.evaluate(() => KazuApp.Session._test.flushTimers(150));
    const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const start = async (id, level, item = '', holes = null) => {
      await page.evaluate(({ id, level, item, holes }) => {
        const K = KazuApp, T = K.Session._test;
        for (let i = 0; i < 1800; i++) {
          K.Store.reset(); K.Store.setPref('g1Open', true);
          K.Session.startLevel(K.Games.byId[id], level);
          T.flushTimers();
          if (item && !new RegExp(item).test(T.item)) continue;
          if (holes) {
            const nodes = [...document.querySelectorAll('#play .numline .nn')], lo = Number(nodes[0]?.textContent);
            const actual = nodes.flatMap((n, j) => n.classList.contains('gap') ? [lo + j] : []);
            if (JSON.stringify(actual) !== JSON.stringify(holes)) continue;
          }
          window.stageSpeech = [];
          return;
        }
        throw new Error('Could not draw ' + id + ' ' + item + ' ' + holes);
      }, { id, level, item, holes });
      await settle();
    };
    const help = async () => { await page.locator('#play .showbtn').click(); await settle(); };
    const choose = value => page.locator('#play .choices > .choice').filter({ hasText: new RegExp('^' + value + '$') }).click();
    const feedback = () => page.locator('#play .feedback').textContent();
    const state = () => page.evaluate(() => {
      const K = KazuApp, T = K.Session._test;
      return { helped: T.helped, taught: T.taughtQ, wrong: T.wrongThisQ, count: K.Store.todayCount(), saved: K.Store.savedSession() };
    });
    const passed = name => console.log('PASS ' + name);

    // Reproduce the reported 10 → 16 case. Both text and replayed speech must
    // refer to the new hole, while a previous mistake/support stays recorded.
    await start('seq', 1, '^seq:fill:', [10, 16]);
    const wrongChoice = await page.locator('#play .choices > .choice').allTextContents();
    await choose(wrongChoice.find(v => v !== '10'));
    await help(); assert.match(await feedback(), /9の つぎ/);
    await help(); await flush();
    await choose(10); await flush();
    assert.equal(await page.locator('#play .feedback').isHidden(), true);
    assert.equal(await page.locator('#play .nn.near').count(), 0, 'old neighbour emphasis clears');
    await help(); assert.match(await feedback(), /15の つぎ/);
    await page.evaluate(() => { window.stageSpeech = []; });
    await page.locator('#play button[aria-label="もういちど きく"]').click();
    const replay = await page.evaluate(() => window.stageSpeech.join(' '));
    assert.match(replay, /じゅうご/); assert.doesNotMatch(replay, /きゅうの/);
    assert.equal((await state()).wrong, 1); assert.equal((await state()).helped, true);
    await choose(16);
    let answer = await state();
    assert.equal(answer.count, 1); assert.equal(answer.saved.firstTryRight, 0); assert.equal(answer.saved.results[0], 'miss');
    passed('sequence 10 → 16 updates text, emphasis and replay; wrong/support grading survives');

    // A shown first blank must not prevent help or independent input on the next
    // blank, and it must keep the whole question marked as taught.
    await start('seq', 1, '^seq:fill:', [10, 16]);
    const wrongAgain = await page.locator('#play .choices > .choice').allTextContents();
    await choose(wrongAgain.find(v => v !== '10')); await choose(wrongAgain.find(v => v !== '10'));
    await choose(wrongAgain.find(v => v !== '10')); await choose(wrongAgain.find(v => v !== '10')); await flush();
    await page.locator('#play .teachbtn').click(); await flush();
    assert.equal((await state()).taught, true);
    await help(); assert.match(await feedback(), /15の つぎ/);
    await choose(16); answer = await state();
    assert.equal(answer.saved.firstTryRight, 0); assert.equal(answer.saved.results[0], 'miss');
    passed('showing the first blank preserves taught scoring and enables the second stage hint');

    for (const width of [320, 1024]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 768 });
      await start('ten', 0, '^ten:fill10:6$');
      await help();
      for (let i = 6; i < 10; i++) await page.locator('#play .tenframe .cell').nth(i).click();
      await flush();
      assert.match(await page.locator('#play .prompt .txt').textContent(), /いくつ たした/);
      assert.equal(await page.locator('#play .feedback').isHidden(), true);
      await help(); assert.match(await feedback(), /あかい まるだけ/); assert.doesNotMatch(await feedback(), /あと 0/);
      assert.equal(await page.locator('#play .cell.coachable').count(), 4, 'only added red cells can be counted');
      for (let i = 6; i < 10; i++) await page.locator('#play .tenframe .cell').nth(i).click();
      assert.deepEqual(await page.locator('#play .cell .ctag').allTextContents(), ['1', '2', '3', '4']);
      await choose(4); answer = await state();
      assert.equal(answer.count, 1); assert.equal(answer.saved.firstTryRight, 0);
      passed(width + 'px fill-to-ten changes from filling to counting only the four added dots');

      for (const op of ['+', '-']) {
        await start('g1shiki', 1, op === '+' ? width === 320 ? '^g1shiki:word\\+:6_4$' : '^g1shiki:word\\+:' : '^g1shiki:word-:');
        await help(); assert.match(await feedback(), op === '+' ? /→ ＋/ : /→ −/);
        await choose(op === '+' ? '＋' : '−'); await flush();
        assert.equal(await page.locator('#play .feedback').isHidden(), true);
        await help(); assert.match(await feedback(), op === '+' ? /あわせて かぞえよう/ : /のこりの まる/);
        assert.doesNotMatch(await feedback(), /→/);
        const summary = page.locator('#play .story-recap > summary');
        assert.ok((await summary.boundingBox()).height >= 48, 'the story control remains a full-sized tap target');
        const padTop = (await page.locator('#play .choices').boundingBox()).y;
        const diagram = await page.locator('#play .frameset').boundingBox();
        assert.ok(diagram.y + diagram.height <= padTop + 2, 'the hint picture stays above the keypad');
        await page.locator('#play .story-recap > summary').click(); await settle();
        assert.equal(await page.locator('#play .storycard').isVisible(), true, 'the child can return to the original story');
        assert.equal(await page.locator('#play .eq').isHidden(), true, 'the original story has room above the keypad before the answer');
        assert.equal(await page.locator('#play .frameset').isHidden(), true, 'story and picture take turns fitting above the keypad');
        const story = await page.locator('#play .storycard').boundingBox();
        assert.ok(story.y + story.height <= padTop + 2, 'the original story stays above the keypad');
        await page.locator('#play .story-recap > summary').click(); await settle();
        assert.equal(await page.locator('#play .frameset').isVisible(), true);
        const item = await page.evaluate(() => KazuApp.Session._test.item);
        const numbers = item.match(/:(\d+)_(\d+)$/).slice(1).map(Number);
        const result = numbers[0] + (op === '+' ? numbers[1] : -numbers[1]);
        assert.equal(await page.locator('#play .cell.coachable').count(), result);
        if (op === '-') assert.equal(await page.locator('#play .cell.coachgone').count(), numbers[1]);
        for (let i = 0; i < result; i++) await page.locator('#play .cell.coachable').nth(i).click();
        assert.equal(await page.locator('#play .cell.coachable .ctag').count(), result);
        await choose(result); answer = await state();
        assert.equal(answer.count, 1); assert.equal(answer.saved.firstTryRight, 0);
        assert.equal(await page.locator('#play .eq').isVisible(), true, 'the completed equation is visible after an answer');
        assert.equal(await page.locator('#play .eq .box').textContent(), String(result));
        await summary.click(); await settle();
        assert.equal(await page.locator('#play .storycard').isVisible(), true, 'the completed answer still permits original-story review');
        assert.equal(await page.locator('#play .eq .box').textContent(), String(result));
        const next = page.locator('#play .answer-next');
        if (await next.isVisible()){
          const equation = await page.locator('#play .eq').boundingBox(), nextBox = await next.boundingBox();
          assert.ok(equation.y + equation.height <= nextBox.y + 2, 'the completed story and equation leave Next reachable');
        }
        await summary.click(); await settle();
        assert.equal(await page.locator('#play .frameset').isVisible(), true, 'the child can return to the completed picture');
        passed(width + 'px story ' + op + ' changes from operation coaching to the current calculation');
      }
    }

    await page.setViewportSize({ width: 1024, height: 768 });
    await start('count', 0); await help(); await flush();
    await help(); assert.match(await feedback(), /さいごの かず/);
    assert.equal(await page.locator('#play .obj.counted').count(), 0, 'the new counting tool recounts rather than retaining the gather instructions');
    passed('counting walk can finish its callback and hand over the new cardinality tool');

    await start('g1set', 0); await help(); await help(); await flush();
    await help(); assert.match(await feedback(), /あつめた かず/);
    assert.equal(await page.locator('#play .obj.glow').count(), 0);
    passed('group collection clears old category emphasis and enables the total-count hint');

    await start('g1set', 0);
    for (let i = 0; i < 4; i++) await page.locator('#play .obj[data-hit="0"]').first().click();
    await flush();
    assert.ok(await page.locator('#play .choices > .choice').count(), 'the strong collection walk reaches the number question');
    assert.equal(await page.locator('#play .choices .dim').count(), 0, 'the old walk callback must not narrow the new answer surface');
    await help(); assert.match(await feedback(), /あつめた かず/);
    assert.equal((await state()).wrong, 4); assert.equal((await state()).helped, true);
    passed('a strong first-stage walk keeps its mistakes and leaves the new-stage choices intact');

    await start('g1set', 2, '^g1set:own:'); await help();
    assert.match(await feedback(), /ひとつ えらんで/);
    await page.locator('#play .choices > .choice').first().click();
    assert.equal(await page.locator('#play .feedback').isHidden(), true);
    await help(); assert.doesNotMatch(await feedback(), /ひとつ えらんで/);
    assert.equal(await page.locator('#play .obj.glow').count(), 1);
    passed('choosing a grouping rule enables the current category hint');

    await start('pattern', 2, '^pattern:pat:.*:2$'); await help(); await help(); await flush();
    const firstPatternAnswer = await page.evaluate(() => {
      const cars = [...document.querySelectorAll('#play .pattern-train .car')];
      const kind = KazuApp.Session._test.item.split(':')[2], units = { ABC: 3, ABBA: 4, AAB: 3 };
      const at = cars.findIndex(c => c.classList.contains('now'));
      return cars[at % units[kind]].textContent;
    });
    await choose(firstPatternAnswer); await flush(); await help();
    assert.match(await feedback(), /くりかえして/); await help(); await flush();
    assert.equal(await page.locator('#play').evaluate(n => n.classList.contains('walking')), false);
    passed('two-hole patterns can repeat the method for the second hole');

    await start('pattern', 2, '^pattern:create:'); await help();
    await page.locator('#play .choices > .choice').first().click();
    assert.equal(await page.locator('#play .feedback').isHidden(), true);
    await help(); assert.match(await feedback(), /つぎに くるもの/);
    passed('a self-authored pattern changes from choosing two pictures to the next picture');

    await start('bond', 1, '^bond:ways:'); await help();
    const firstWay = await feedback(); await choose(1); await flush();
    await help(); assert.notEqual(await feedback(), firstWay); assert.match(await feedback(), /わけることも/);
    passed('a second number-bond construction describes an unused split');

    await start('measure', 2, '^measure:order:'); await help(); await help(); await flush();
    await page.locator('#play .mrow.nexthint').click();
    assert.equal(await page.locator('#play .feedback').isHidden(), true);
    await help(); assert.match(await feedback(), /のこりの なかで/);
    await help(); await flush();
    assert.equal(await page.locator('#play .mrow.nexthint:not(.picked)').count(), 1);
    assert.equal(await page.locator('#play .mrow.picked').count(), 1);
    passed('ordering lengths offers the next remaining bar after a supported first choice');

    // Every affected first lesson must finish its walk callback rather than
    // getting stuck when the phase replaces the old coaching object.
    for (const [id, level] of [['count', 0], ['seq', 0], ['ten', 0], ['pattern', 2], ['g1set', 0], ['g1shiki', 1]]) {
      await page.evaluate(({ id, level }) => {
        const K = KazuApp; K.Store.reset(); K.Store.setPref('g1Open', true); K.Session._test.intro(true);
        K.Session.startLevel(K.Games.byId[id], level); K.Session._test.flushTimers(600);
      }, { id, level });
      assert.equal(await page.evaluate(() => KazuApp.Session._test.idx), 1, id + ' initial demonstration completes');
      assert.equal(await page.evaluate(() => KazuApp.Session._test.introStep), 'together', id + ' continues into together');
      assert.equal(await page.locator('#play').evaluate(n => n.classList.contains('walking')), false, id + ' accepts child input');
      assert.deepEqual(await page.evaluate(() => ({ firstTry: KazuApp.Store.savedSession().firstTryRight, result: KazuApp.Store.savedSession().results[0] })), { firstTry: 0, result: 'introdone' }, id + ' demonstration is not independent progress');
    }
    await page.evaluate(() => KazuApp.Session._test.intro(false));
    passed('six multi-stage first lessons complete show → together without false progress or blocked input');
    assert.deepEqual(errors, []); passed('browser exceptions: 0');
  } catch (error) {
    const page = browser && browser.contexts()[0]?.pages()[0];
    if (page) {
      await page.screenshot({ path: '/tmp/math-youji-stage-coaching-failure.png' }).catch(() => {});
      console.error(await page.evaluate(() => ({ item: KazuApp.Session._test.item, prompt: document.querySelector('#play .prompt')?.textContent, choices: document.querySelector('#play .choices')?.textContent })).catch(() => ({})));
    }
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
