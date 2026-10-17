#!/usr/bin/env node
'use strict';
// Adaptive short visits: exercise the real answer controls in disposable profiles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file, (err, data) => {
    res.writeHead(err ? 404 : 200, {'Content-Type':file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      'Cache-Control':'no-store'});
    res.end(err ? '' : data);
  });
});
(async () => {
  let browser, count = 0;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
    browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet = page => page.evaluate(() => {
      const K=KazuApp;
      K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
      K.Sound.say=(text,opts)=>{if(opts&&opts.onend)opts.onend();};
      K.Session._test.overview(false);K.Session._test.breaks(false);
    });
    const reload = async page => {
      await page.evaluate(()=>KazuApp.Store.flush());
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);
    };
    const plan = page => page.evaluate(() => {
      const t=KazuApp.FirstSteps.shortPlan();
      return t ? {kind:t.kind,gameId:t.game.id,levelIndex:t.levelIndex} : null;
    });
    const snapshot = page => page.evaluate(() => {
      const S=KazuApp.Store;
      return {status:S.shortStatus('count',0),stars:S.stars('count',0),plays:S.plays('count',0),
        today:S.todayCount(),readiness:S.readiness('count',0),course:S.data.shortCourses['count:0']
          ? JSON.parse(JSON.stringify(S.data.shortCourses['count:0'])) : null};
    });
    const solveCount = async (page, {help=false,wrong=false}={}) => {
      // Count the visible objects, then use this problem's actual answer buttons.
      const objects=page.locator('#play .obj');
      for(let i=0,n=await objects.count();i<n;i++)await objects.nth(i).click();
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());
      if(help)await page.locator('#play .showbtn').click();
      const answer=await page.evaluate(()=>Number(KazuApp.Session._test.item.split(':').at(-1)));
      let miss=null;
      if(wrong){
        const bad=page.locator('#play .choices .choice').filter({hasNotText:new RegExp('^'+answer+'$')}).first();
        await bad.click();
        miss=await page.evaluate(()=>KazuApp.Session._test.missType);
      }
      await page.locator('#play .choices .choice').filter({hasText:new RegExp('^'+answer+'$')}).click();
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'first-finish');
      return miss;
    };
    const startCount = page => page.evaluate(()=>KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true));
    const fixture = (page, script) => page.evaluate(script);
    const scenario = async (name, run) => {
      if(process.env.ADAPTIVE_TEST_FILTER&&!new RegExp(process.env.ADAPTIVE_TEST_FILTER).test(name))return;
      const context=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce',
        serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(() => {
        const RealDate=Date,base=RealDate.parse('2026-10-17T06:00:00Z');
        window.__testDay=Number(sessionStorage.getItem('adaptive-test-day'))||0;
        window.__testTick=0;
        window.Date=class extends RealDate {
          constructor(...a){super(...(a.length?a:[base+window.__testDay*86400000+window.__testTick]));}
          static now(){return base+window.__testDay*86400000+window.__testTick;}
        };
      });
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(name+': '+e.message));
      await page.route('https://**',route=>route.abort());
      try {
        await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);
        await page.evaluate(()=>KazuApp.Store.reset());
        await run(page);count++;console.log('PASS '+name);
      } finally {await context.close();}
    };

    await scenario('three supported answers lead through one guided visit to another topic, preserving the original course',async page=>{
      for(let i=0;i<3;i++){await startCount(page);await solveCount(page,{help:true});}
      const before=await snapshot(page);
      assert.equal(before.status.supportNeeded,true);assert.equal(before.status.resting,true);
      assert.deepEqual(await plan(page),{kind:'support',gameId:'count',levelIndex:0});
      await page.getByRole('button',{name:'きょうは ここまで',exact:true}).click();
      assert.match(await page.locator('#home .home-primary').textContent(),/いっしょに 1もん/);
      await page.locator('#home .home-primary').click();
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'together');
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),1);
      await solveCount(page);
      const after=await snapshot(page), next=await plan(page);
      assert.equal(after.status.supportNeeded,false);assert.equal(after.status.resting,true);
      assert.equal(after.status.answered,3);assert.equal(after.today,before.today+1);
      assert.deepEqual(after.readiness,{count:0,accuracy:null});
      assert.equal(after.stars,0);assert.equal(after.plays,0);
      assert.notEqual(next.gameId,'count');assert.ok(['known','new'].includes(next.kind));
      assert.match(await page.locator('#first-finish').textContent(),/あたらしい|できる あそび/);
      await reload(page);
      const persisted=await snapshot(page);
      assert.equal(persisted.status.supportNeeded,false);assert.equal(persisted.status.answered,3);
      assert.deepEqual(await plan(page),next);
    });

    await scenario('free practice during rest remains available without extending it and the old topic returns after three days',async page=>{
      await fixture(page,()=>{
        const S=KazuApp.Store;
        for(let i=0;i<3;i++){S.recordShortAnswer('count',0,false,'rest-'+i,'independent');S.noteOutcome('count',0,false,false);}
        S.noteShortSupport('count',0);
      });
      const before=await snapshot(page);
      await startCount(page);await solveCount(page,{help:true});
      const free=await snapshot(page);
      assert.equal(free.status.restUntil,before.status.restUntil);assert.equal(free.status.answered,4);
      assert.equal(free.status.supportNeeded,false);assert.equal(free.stars,0);assert.equal(free.plays,0);
      assert.notEqual((await plan(page)).gameId,'count');
      await page.evaluate(()=>{window.__testDay=3;sessionStorage.setItem('adaptive-test-day','3');});
      assert.deepEqual(await plan(page),{kind:'return',gameId:'count',levelIndex:0});
      await reload(page);
      assert.deepEqual(await plan(page),{kind:'return',gameId:'count',levelIndex:0});
      await page.evaluate(()=>KazuApp.FirstSteps.startPlan(KazuApp.FirstSteps.shortPlan()));
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),null);
      await solveCount(page);
      assert.equal((await snapshot(page)).status.answered,5);
      assert.equal((await plan(page)).kind,'resume');
    });

    await scenario('a same-day waiting course yields to the latest unfinished course and due checks take priority on another day',async page=>{
      await fixture(page,()=>{
        const S=KazuApp.Store;
        for(let i=0;i<8;i++){S.recordShortAnswer('count',0,true,'ready-'+i,'independent');S.noteOutcome('count',0,true,false);}
        window.__testTick=100;
        S.recordShortAnswer('numeral',0,true,'recent-numeral','independent');S.noteOutcome('numeral',0,true,false);
      });
      assert.deepEqual(await plan(page),{kind:'resume',gameId:'numeral',levelIndex:0});
      assert.equal((await snapshot(page)).status.waiting,true);
      await page.evaluate(()=>{window.__testDay=1;sessionStorage.setItem('adaptive-test-day','1');});
      assert.deepEqual(await plan(page),{kind:'check',gameId:'count',levelIndex:0});
      await reload(page);
      assert.deepEqual(await plan(page),{kind:'check',gameId:'count',levelIndex:0});
      await page.evaluate(()=>KazuApp.FirstSteps.startPlan(KazuApp.FirstSteps.shortPlan()));
      assert.match(await page.locator('#play .session-count').textContent(),/たしかめ/);
      await solveCount(page);
      assert.equal((await snapshot(page)).status.checks,1);
      assert.equal((await snapshot(page)).stars,0);
    });

    await scenario('unfinished courses follow actual timestamps rather than insertion order',async page=>{
      await fixture(page,()=>{
        const S=KazuApp.Store;
        S.recordShortAnswer('count',0,true,'older-count','independent');
        window.__testTick=100;
        S.recordShortAnswer('numeral',0,true,'newer-numeral','independent');
      });
      assert.deepEqual(await plan(page),{kind:'resume',gameId:'numeral',levelIndex:0});
      await page.evaluate(()=>{
        window.__testTick=200;
        KazuApp.Store.recordShortAnswer('count',0,true,'newest-count','independent');
      });
      assert.deepEqual(await plan(page),{kind:'resume',gameId:'count',levelIndex:0});
      await reload(page);
      assert.deepEqual(await plan(page),{kind:'resume',gameId:'count',levelIndex:0});
    });

    await scenario('a resting topic prefers a known easier level and otherwise a known different topic',async page=>{
      await fixture(page,()=>{
        const S=KazuApp.Store;
        S.recordLevel('count',0,3,8,8);S.addSticker('count:0');S.markIntroduced('count',0);
        for(let i=0;i<3;i++)S.recordShortAnswer('count',1,false,'harder-'+i,'independent');
        S.noteShortSupport('count',1);
      });
      assert.deepEqual(await plan(page),{kind:'easier',gameId:'count',levelIndex:0});
      assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',1).answered),3);
      await page.evaluate(()=>{
        const S=KazuApp.Store;S.reset();
        S.addSticker('numeral:0');S.markIntroduced('numeral',0);
        for(let i=0;i<3;i++)S.recordShortAnswer('count',0,false,'first-'+i,'independent');
        S.noteShortSupport('count',0);
      });
      assert.deepEqual(await plan(page),{kind:'known',gameId:'numeral',levelIndex:0});
      assert.equal((await snapshot(page)).status.answered,3);
      assert.equal((await snapshot(page)).plays,0);
    });

    await scenario('the engine preserves actual supported and revised kinds and the first mistake in short-course observations',async page=>{
      await startCount(page);await solveCount(page,{help:true});
      let stored=await snapshot(page);
      assert.equal(stored.course.adaptive.kinds,'s');assert.equal(stored.course.adaptive.recent,'0');
      await startCount(page);const miss=await solveCount(page,{wrong:true});
      assert.ok(miss);
      stored=await snapshot(page);
      assert.equal(stored.course.adaptive.kinds,'sr');assert.equal(stored.course.adaptive.misses[1],miss);
      await startCount(page);await solveCount(page);
      stored=await snapshot(page);
      assert.equal(stored.course.adaptive.kinds,'sri');assert.equal(stored.course.adaptive.misses[2],'');
      assert.equal(stored.course.adaptive.recent,'001');assert.equal(stored.status.resting,false);
    });

    await scenario('adaptive recommendations survive reload and backup replacement while remaining separate in lap two',async page=>{
      await fixture(page,()=>{
        const S=KazuApp.Store;
        for(let i=0;i<3;i++)S.recordShortAnswer('count',0,false,'backup-'+i,'independent');
      });
      const backup=await page.evaluate(()=>KazuApp.Store.exportText());
      assert.deepEqual(await plan(page),{kind:'support',gameId:'count',levelIndex:0});
      await reload(page);
      assert.deepEqual(await plan(page),{kind:'support',gameId:'count',levelIndex:0});
      await page.evaluate(()=>{KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);});
      assert.equal(await plan(page),null);
      assert.equal((await snapshot(page)).status.resting,false);
      assert.equal(await page.evaluate(text=>KazuApp.Store.importText(text,'replace').ok,backup),true);
      assert.equal(await page.evaluate(()=>KazuApp.Store.round()),1);
      assert.deepEqual(await plan(page),{kind:'support',gameId:'count',levelIndex:0});
      await page.evaluate(()=>KazuApp.Store.noteShortSupport('count',0));
      assert.equal(await page.evaluate(text=>KazuApp.Store.importText(text).ok,backup),true);
      assert.equal((await snapshot(page)).status.supportNeeded,false);
      assert.notEqual((await plan(page)).gameId,'count');
    });

    await scenario('a guided visit completed by an automatic demonstration still moves on without claiming independent learning',async page=>{
      await fixture(page,()=>{
        const K=KazuApp,S=K.Store;
        for(let i=0;i<3;i++)S.recordShortAnswer('count',0,false,'needs-demo-'+i,'independent');
        K.FirstSteps.startPlan(K.FirstSteps.shortPlan());
        document.querySelectorAll('#play .obj').forEach(o=>o.click());
        K.Session._test.flushTimers();
        const answer=Number(K.Session._test.item.split(':').at(-1));
        const bad=[...document.querySelectorAll('#play .choice')].find(b=>Number(b.textContent)!==answer);
        for(let i=0;i<6;i++)bad.click();
      });
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.taughtQ),true);
      await page.evaluate(()=>KazuApp.Session._test.flushTimers(50));
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'first-finish');
      const after=await snapshot(page), next=await plan(page);
      assert.equal(after.status.supportNeeded,false);assert.equal(after.status.resting,true);
      assert.equal(after.status.answered,3);assert.equal(after.stars,0);assert.equal(after.plays,0);
      assert.equal(after.today,1);assert.deepEqual(after.readiness,{count:0,accuracy:null});
      assert.equal(await page.evaluate(()=>KazuApp.Store.introduced('count',0)),false);
      assert.notEqual(next.gameId,'count');
      assert.match(await page.locator('#first-finish').textContent(),/やりかたを みたね/);
    });

    await scenario('adaptive support and rest screens fit phone and tablet widths with reachable large primary actions',async page=>{
      for(let i=0;i<3;i++){await startCount(page);await solveCount(page,{help:true});}
      for(const width of [320,390,1024]){
        await page.setViewportSize({width,height:width===320?740:width===390?844:768});
        await page.evaluate(()=>{
          const K=KazuApp;
          K.FirstSteps.finish(K.Games.byId.count,0,'independent',{kind:'supported',label:'ひとつずつ かぞえる'});
        });
        const stop=page.getByRole('button',{name:'きょうは ここまで',exact:true});
        const continueButton=page.getByRole('button',{name:'いっしょに 1もん',exact:true});
        for(const button of [stop,continueButton]){
          await button.click({trial:true});
          const box=await button.boundingBox();
          assert.ok(box.width>=44&&box.height>=44,`large finish action at ${width}px`);
        }
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        await page.screenshot({path:`/tmp/math-youji-adaptive-finish-${width}.png`,animations:'disabled'});
        await stop.click();
        const primary=page.locator('#home .home-primary'), box=await primary.boundingBox();
        assert.ok(box.width>=44&&box.height>=44,`large home action at ${width}px`);
        const height=await page.evaluate(()=>innerHeight);
        assert.ok(box.y>=0&&box.y+box.height<=height,`home primary within viewport at ${width}px`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.match(await primary.textContent(),/いっしょに 1もん/);
        await page.screenshot({path:`/tmp/math-youji-adaptive-home-${width}.png`,animations:'disabled'});
      }
      // Finish that support visit, then verify the resting-topic alternative uses
      // the same usable controls at the narrowest size.
      await page.locator('#home .home-primary').click();await solveCount(page);
      await page.setViewportSize({width:320,height:740});
      assert.match(await page.locator('#first-finish').textContent(),/すこし おやすみ/);
      await page.getByRole('button',{name:'きょうは ここまで',exact:true}).click();
      assert.doesNotMatch(await page.locator('#home .home-primary').textContent(),/いっしょに 1もん/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:'/tmp/math-youji-adaptive-rest-320.png',animations:'disabled'});
    });

    assert.deepEqual(errors,[],'no browser exceptions');
    console.log(`PASS ${count} adaptive short-learning browser scenarios; no browser exceptions`);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
