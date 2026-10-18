#!/usr/bin/env node
'use strict';
// Use disposable browser storage. Tasks are optional, resumable, and never grades.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const scripts = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js')).sort()
  .map(f => read('src/js/' + f)).join('\n');
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>html,body{margin:0}[hidden]{display:none!important}'
  + ['src/styles.css','src/sticker-world.css','src/mission-resume.css'].map(read).join('\n')
  + '</style></head><body>' + read('src/body.html') + '<script>(function(){\n'
  + scripts.replace(/<\/script>/g, '<\\/script>') + '\n})();</script></body></html>';
const server = http.createServer((req, res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
  res.end(process.env.MISSION_RESUME_HTML ? read(process.env.MISSION_RESUME_HTML) : source);
});

(async () => {
  let browser, passed = 0;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
    const quiet = page => page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      window.missionSpeech = [];
      K.Sound.say = (t, o) => {window.missionSpeech.push(t); if (o && o.onend) o.onend();};
      K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.breaks(false);
    });
    const scenario = async (name, run) => {
      const context = await browser.newContext({viewport:{width:390,height:844}, serviceWorkers:'block', reducedMotion:'reduce', timezoneId:'Asia/Tokyo'});
      await context.addInitScript(() => {
        const NativeDate = Date, base = NativeDate.parse('2026-10-18T03:00:00Z');
        window.missionDays = 0;
        window.Date = class extends NativeDate {
          constructor(...a){super(...(a.length ? a : [base + window.missionDays * 86400000]));}
          static now(){return base + window.missionDays * 86400000;}
        };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      page.on('pageerror', e => errors.push(name + ': ' + e.message));
      await page.route('https://**', route => route.abort());
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil:'domcontentloaded'});
        await quiet(page); await page.evaluate(() => KazuApp.Store.reset());
        await run(page); passed++; console.log('PASS ' + name);
      } finally {await context.close();}
    };
    const showHome = page => page.evaluate(() => {KazuApp.Home.render(); KazuApp.UI.show('home');});
    const more = async page => {
      const details = page.locator('#home .home-more');
      if (!await details.evaluate(n => n.open)) await details.locator(':scope > summary').click();
    };
    const seed = (page, mission) => page.evaluate(m => {
      const S = KazuApp.Store;
      S.recordMission(Object.assign({day:S.todayKey(), id:'count:fixture', gameId:'count',
        text:'3にんぶんの スプーンを もってこよう', prompt:'ひとりに 1ぽんずつ あるかな？'}, m));
      if (m.done) S.completeMission(m.day || S.todayKey());
      if (m.reviewed) S.reviewMission(m.day || S.todayKey());
    }, mission || {});
    const openToday = async page => {
      await page.evaluate(() => KazuApp.Missions.open(KazuApp.Store.mission(KazuApp.Store.todayKey())));
      // Screen headings receive focus on the next animation frame; let that finish before holding a key.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const missionState = page => page.evaluate(() => KazuApp.Store.mission(KazuApp.Store.todayKey()));
    const learning = page => page.evaluate(() => {
      const exported = JSON.parse(KazuApp.Store.exportText()).data;
      delete exported.missions;
      if (exported.rounds) for (const lap of Object.values(exported.rounds)) delete lap.missions;
      return exported;
    });
    const done = page => page.locator('#mission .mission-done');

    await scenario('only the latest deferred task and recent unreviewed completion are selected, including after rest days', async page => {
      await seed(page, {day:'2026-10-10', id:'old-pending'});
      await seed(page, {day:'2026-10-12', id:'latest-pending'});
      await seed(page, {day:'2026-10-13', id:'old-done', done:true});
      await seed(page, {day:'2026-10-14', id:'latest-done', done:true});
      await seed(page, {day:'2026-10-15', id:'already-reviewed', done:true, reviewed:true});
      await seed(page, {day:'2026-11-01', id:'future'});
      await seed(page, {day:'not-a-date', id:'invalid'});
      const selected = await page.evaluate(() => {
        const M = KazuApp.Missions;
        return {pending:M.pending().id, review:M.recentReview().id, alias:M.yesterdayReview().id,
          date:M.dateLabel(M.recentReview()), leap:M.dateLabel('2024-02-29')};
      });
      assert.deepEqual(selected, {pending:'latest-pending', review:'latest-done', alias:'latest-done',
        date:'2026ねん 10がつ 14にち', leap:'2024ねん 2がつ 29にち'});
      const before = await page.evaluate(() => JSON.parse(KazuApp.Store.exportText()).data);
      await showHome(page); await more(page);
      assert.equal(await page.locator('#home .mission-resume').count(), 1);
      assert.equal(await page.locator('#home .reviewmission').count(), 1);
      assert.match(await page.locator('#home .mission-resume').textContent(), /10がつ 12にち/);
      assert.match(await page.locator('#home .reviewmission').textContent(), /10がつ 14にち/);
      const after = await page.evaluate(() => JSON.parse(KazuApp.Store.exportText()).data);
      assert.deepEqual(after, before, 'showing optional entries creates no task or learning record');
    });

    await scenario('a chosen task survives Later, reload and a two-day break with its actual date', async page => {
      await page.evaluate(() => {
        const K = KazuApp;
        document.querySelector('#home').append(K.Missions.resultCard('count'));
      });
      await showHome(page);
      assert.equal(await page.evaluate(() => Object.keys(KazuApp.Store.data.missions).length), 0);
      await page.locator('#home > .result-mission').click();
      const original = await missionState(page);
      assert.ok(original && !original.done);
      await page.locator('#mission .mission-later').click();
      await page.reload({waitUntil:'domcontentloaded'}); await quiet(page);
      await page.evaluate(() => {window.missionDays = 2;});
      await showHome(page); await more(page);
      await page.locator('#home .mission-resume').click();
      assert.equal(await page.locator('#mission .mission-main').textContent(), original.text);
      assert.equal(await page.locator('#mission .mission-date').textContent(), '2026ねん 10がつ 18にち のミッション');
      await page.locator('#mission .mission-speak').click();
      assert.match(await page.evaluate(() => window.missionSpeech.at(-1)), /2026ねん 10がつ 18にち/);
      assert.equal(await page.evaluate(() => Object.keys(KazuApp.Store.data.missions).length), 1);
      assert.equal(await page.evaluate(() => KazuApp.Store.mission('2026-10-18').done), false);
    });

    await scenario('short taps and interrupted keyboard holds do not complete a task', async page => {
      await seed(page); await openToday(page);
      await done(page).click(); assert.equal((await missionState(page)).done, false);
      await done(page).focus();
      await page.keyboard.down('Space'); await page.keyboard.up('Space');
      await page.waitForTimeout(2100);
      assert.equal((await missionState(page)).done, false);
      await page.keyboard.down('Enter'); await page.locator('#mission .mission-later').focus();
      await page.keyboard.up('Enter'); await page.waitForTimeout(2100);
      assert.equal((await missionState(page)).done, false);
      assert.equal(await done(page).evaluate(n => n.classList.contains('holding')), false);
    });

    await scenario('Space and Enter use the full two-second adult confirmation and never alter grades or rewards', async page => {
      await seed(page);
      for (const key of ['Space','Enter']){
        await page.evaluate(() => {
          const S = KazuApp.Store;
          S.recordMission(Object.assign({}, S.mission(S.todayKey())));
        });
        const before = await learning(page);
        await openToday(page); await done(page).focus();
        await page.keyboard.down(key);
        await page.waitForTimeout(300);
        assert.equal((await missionState(page)).done, false, 'a short hold is insufficient');
        assert.equal(await done(page).evaluate(n => n.classList.contains('holding')), true, key + ' starts a hold');
        await page.waitForFunction(() => KazuApp.Store.mission(KazuApp.Store.todayKey()).done, null, {timeout:3000});
        await page.keyboard.up(key);
        assert.equal(await page.evaluate(() => KazuApp.UI.currentName()), 'home');
        assert.deepEqual(await learning(page), before);
        assert.equal((await missionState(page)).reviewed, false);
      }
    });

    await scenario('pointer leave and leaving the screen cancel a hold; a full pointer hold completes once', async page => {
      await seed(page); await openToday(page);
      let box = await done(page).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.mouse.move(1, 1); await page.mouse.up();
      await page.waitForTimeout(2100); assert.equal((await missionState(page)).done, false);
      await done(page).focus(); await page.keyboard.down('Space');
      await page.locator('#mission .mission-later').click(); await page.keyboard.up('Space');
      await page.waitForTimeout(2100); assert.equal((await missionState(page)).done, false);
      const before = await learning(page);
      await openToday(page); box = await done(page).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
      await page.waitForFunction(() => KazuApp.Store.mission(KazuApp.Store.todayKey()).done, null, {timeout:3000});
      await page.mouse.up();
      assert.deepEqual(await learning(page), before);
      await more(page); assert.equal(await page.locator('#home .mission-resume').isHidden(), true);
    });

    await scenario('a completed task is available after skipped days, and reviewing it only changes reviewed', async page => {
      await seed(page, {done:true}); await page.evaluate(() => {window.missionDays = 3;});
      await showHome(page); await more(page);
      await page.locator('#home .reviewmission').click();
      assert.equal(await page.locator('#mission h2').textContent(), 'できたことの おはなし');
      assert.equal(await page.locator('#mission .mission-date').textContent(), '2026ねん 10がつ 18にち のミッション');
      assert.equal(await page.locator('#mission .mission-hold-help').isHidden(), true);
      const before = await learning(page);
      await done(page).click();
      assert.equal(await page.evaluate(() => KazuApp.Store.mission('2026-10-18').reviewed), true);
      assert.deepEqual(await learning(page), before);
      await more(page); assert.equal(await page.locator('#home .reviewmission').isHidden(), true);
      await page.reload({waitUntil:'domcontentloaded'}); await quiet(page);
      assert.equal(await page.evaluate(() => KazuApp.Store.mission('2026-10-18').reviewed), true);
    });

    await scenario('an actual one-question result offers voluntary real-world play without scheduling it on display', async page => {
      await page.evaluate(() => {
        const K = KazuApp;
        K.FirstSteps.startOne(K.Games.byId.count, 0, true);
        document.querySelectorAll('#play .obj').forEach(n => n.click());
        K.Session._test.flushTimers();
        const answer = Number(K.Session._test.item.split(':').at(-1));
        [...document.querySelectorAll('#play .choices .choice')].find(n => Number(n.textContent) === answer).click();
        K.Session._test.flushTimers();
      });
      await page.locator('#play .answer-next').click();
      assert.equal(await page.evaluate(() => KazuApp.UI.currentName()), 'first-finish');
      assert.equal(await page.evaluate(() => Object.keys(KazuApp.Store.data.missions).length), 0);
      assert.equal(await page.locator('#first-finish .result-mission').count(), 1);
      assert.equal(await page.locator('#first-finish .first-home-mission').evaluate(n => n.open), false);
      const before = await learning(page);
      await page.locator('#first-finish .first-home-mission > summary').click();
      await page.locator('#first-finish .result-mission').click();
      assert.equal(await page.evaluate(() => KazuApp.UI.currentName()), 'mission');
      assert.deepEqual(await learning(page), before);
      assert.equal((await missionState(page)).done, false);
      await page.locator('#mission .mission-later').click();
      await more(page); assert.equal(await page.locator('#home .mission-resume').isVisible(), true);
    });

    await scenario('ending remains quiet and optional mission play never reopens study or changes the ending', async page => {
      await seed(page); await page.evaluate(() => {KazuApp.Store.countToday(1); KazuApp.Home.endToday();});
      assert.equal(await page.locator('#home .home-more').evaluate(n => n.open), false);
      assert.equal(await page.locator('#home .mission-resume').isVisible(), false);
      assert.equal(await page.locator('#home .day-ending').isVisible(), true);
      assert.equal(await page.locator('#home .day-ending-mission').evaluate(n => n.open), false);
      assert.equal(await page.locator('#home .day-ending-mission .result-mission').isVisible(), false);
      const before = await learning(page);
      await page.locator('#home .day-ending-mission > summary').click();
      await page.locator('#home .day-ending-mission .result-mission').click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await done(page).focus(); await page.keyboard.down('Enter');
      await page.waitForFunction(() => KazuApp.Store.mission(KazuApp.Store.todayKey()).done, null, {timeout:3000});
      await page.keyboard.up('Enter');
      assert.equal(await page.evaluate(() => KazuApp.Store.endedToday()), true);
      assert.equal(await page.locator('#home .day-ending').isVisible(), true);
      assert.deepEqual(await learning(page), before);
    });

    await scenario('dates and existing mission flags round-trip through backup across a year boundary', async page => {
      await seed(page, {day:'2025-12-31', done:true});
      await seed(page, {day:'2026-01-01'});
      await seed(page, {day:'2026-01-02', done:true, reviewed:true});
      const expected = await page.evaluate(() => KazuApp.Store.data.missions);
      const restored = await page.evaluate(() => {
        const S = KazuApp.Store, backup = S.exportText(); S.reset();
        if (!S.importText(backup, 'replace').ok) throw Error('mission backup rejected');
        return {missions:S.data.missions, pending:KazuApp.Missions.pending().day,
          review:KazuApp.Missions.recentReview().day, label:KazuApp.Missions.dateLabel(KazuApp.Missions.recentReview())};
      });
      assert.deepEqual(restored.missions, expected);
      assert.equal(restored.pending, '2026-01-01'); assert.equal(restored.review, '2025-12-31');
      assert.equal(restored.label, '2025ねん 12がつ 31にち');
    });

    await scenario('offline illustrations, readable dates and 48px controls fit phone and tablet widths', async page => {
      await seed(page);
      for (const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
        await page.setViewportSize(viewport); await openToday(page);
        assert.equal(await page.locator('#mission .mission-illustration svg').count(), 1);
        assert.equal(await page.locator('#mission').evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
        assert.equal(await page.locator('#mission .mission-sheet').evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
        assert.equal(await done(page).evaluate(n => {
          const labels = n.querySelectorAll(':scope > span'), a = labels[0].getBoundingClientRect(), b = labels[1].getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(labels[0]);
          return range.getClientRects().length === 1 && b.top >= a.bottom - 1;
        }), true, 'the hold label and duration use two intentional lines without an orphan character');
        for (const selector of ['.mission-done','.mission-later','.mission-speak','.topbar > button:first-child']){
          const button = page.locator('#mission ' + selector);
          await button.scrollIntoViewIfNeeded(); const box = await button.boundingBox();
          assert.ok(box.width >= 48 && box.height >= 48, selector + ': ' + JSON.stringify(box));
          assert.ok(box.x >= -.5 && box.x + box.width <= viewport.width + .5, JSON.stringify(box));
          const receivesPointer = await button.evaluate(n => {
            const b = n.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return hit === n || n.contains(hit);
          });
          assert.equal(receivesPointer, true, selector + ' is reachable');
        }
        await page.locator('#mission').screenshot({path:`/tmp/math-youji-mission-resume-${viewport.width}.png`, animations:'disabled'});
      }
    });
    assert.deepEqual(errors, []);
    console.log(`PASS ${passed} mission-resume browser scenarios; no browser exceptions`);
  } finally {if (browser) await browser.close(); server.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
