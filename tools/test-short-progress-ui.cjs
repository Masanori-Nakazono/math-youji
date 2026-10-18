#!/usr/bin/env node
'use strict';
// Progress is checked across the child's actual screens in disposable profiles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403);res.end();return; }
  fs.readFile(file, (err, body) => {
    res.writeHead(err ? 404 : 200, {'Content-Type':file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream','Cache-Control':'no-store'});
    res.end(err ? '' : body);
  });
});
(async () => {
  let browser, passed = 0;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
    browser = await chromium.launch();
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet = page => page.evaluate(() => {
      const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;window.__progressSaid=[];
      K.Sound.say=(text,opts)=>{window.__progressSaid.push(text);if(opts&&opts.onend)opts.onend();};
      K.Session._test.overview(false); K.Session._test.autoAdvance(true);K.Session._test.breaks(false);
    });
    const reload = async page => {
      await page.evaluate(()=>KazuApp.Store.flush());
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);
    };
    const day = (page,n) => page.evaluate(n=>{window.__progressDay=n;sessionStorage.setItem('progress-test-day',String(n));},n);
    const home = page => page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home',{focus:false});});
    const levels = page => page.evaluate(()=>{KazuApp.Levels.render(KazuApp.Games.byId.count);KazuApp.UI.show('levels',{focus:false});});
    const start = page => page.evaluate(()=>KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true));
    const solve = async (page,{help=false,wrong=false}={}) => {
      const objects=page.locator('#play .obj');
      for(let i=0,n=await objects.count();i<n;i++)await objects.nth(i).click();
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());
      if(help)await page.locator('#play .showbtn').click();
      const answer=await page.evaluate(()=>Number(KazuApp.Session._test.item.split(':').at(-1)));
      if(wrong)await page.locator('#play .choices .choice').filter({hasNotText:new RegExp('^'+answer+'$')}).first().click();
      await page.locator('#play .choices .choice').filter({hasText:new RegExp('^'+answer+'$')}).click();
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'first-finish');
    };
    const fixture = (page,bits) => page.evaluate(bits=>{
      const S=KazuApp.Store;S.markIntroduced('count',0);
      for(let i=0;i<bits.length;i++){
        const clean=bits[i]==='1';S.recordShortAnswer('count',0,clean,'progress-fixture-'+Date.now()+'-'+i,S.shortStatus('count',0).phase);
        S.noteOutcome('count',0,clean,false);
      }
    },bits);
    const ordinary = page => page.evaluate(()=>{
      const S=KazuApp.Store;S.recordLevel('count',0,2,6,8,true);S.addSticker('count:0');S.markIntroduced('count',0);
    });
    const state = page => page.evaluate(()=>{
      const S=KazuApp.Store;return {status:S.shortStatus('count',0),stars:S.stars('count',0),normal:S.hasConfirmed('count:0'),gold:S.hasSticker('count:0:g'),plays:S.plays('count',0),today:S.todayCount()};
    });
    const progress = (page,screen) => page.locator(screen+' .short-progress[data-short-key="count:0"]');
    const scenario = async (name,run) => {
      if(process.env.SHORT_PROGRESS_TEST_FILTER&&!new RegExp(process.env.SHORT_PROGRESS_TEST_FILTER).test(name))return;
      const context=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(()=>{
        const RealDate=Date,base=RealDate.parse('2026-10-18T03:00:00Z');window.__progressDay=Number(sessionStorage.getItem('progress-test-day'))||0;
        window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[base+window.__progressDay*86400000]));}static now(){return base+window.__progressDay*86400000;}};
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));
      await page.route('https://**',route=>route.abort());
      try {await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.Store.reset());await run(page);passed++;console.log('PASS '+name);}
      finally {await context.close();}
    };

    await scenario('four actual visits show the same saved progress on result, Home and lesson choices',async page=>{
      for(let i=0;i<4;i++){await start(page);await solve(page);}
      const saved=await state(page);assert.equal(saved.status.answered,4);assert.equal(saved.status.right,4);
      const copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));
      assert.equal(copy.visible,true);assert.equal(copy.goal,'normal');assert.equal(copy.stage,'prepare');
      const check=async screen=>{
        const node=progress(page,screen);assert.equal(await node.count(),1);assert.equal(await node.isVisible(),true);
        assert.equal(await node.getAttribute('data-stage'),'prepare');
        assert.equal(await node.locator('.short-progress-title').textContent(),copy.title);
        assert.equal(await node.locator('.short-progress-detail').textContent(),copy.detail);
        assert.equal(await node.locator('.short-progress-step').count(),3);
        assert.match(await node.textContent(),/4\s*[／/]\s*8/);
      };
      await check('#first-finish');await home(page);await check('#home');await levels(page);await check('#levels');
      await reload(page);await home(page);await check('#home');
      assert.deepEqual(await state(page),saved);
      await progress(page,'#home').locator('button.short-progress-speak').click();
      const said=await page.evaluate(()=>window.__progressSaid.at(-1));assert.equal(said,copy.speech);
      assert.match(said,/4/);
    });
    await scenario('an incomplete rolling eight shows actual recent independent work and offers a next question',async page=>{
      await fixture(page,'11011010');
      const before=await state(page);assert.equal(before.status.answered,8);assert.equal(before.status.right,5);assert.equal(before.status.readyDay,null);
      const copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));
      assert.equal(copy.stage,'prepare');assert.match(copy.title+' '+copy.detail,/5/);assert.match(copy.title+' '+copy.detail,/8/);
      assert.doesNotMatch(copy.title+' '+copy.detail,/あと\s*0|じゅんび.*できた|シール.*ゲット/);
      assert.match(copy.nextLabel,/1もん/);
      await home(page);assert.equal(await progress(page,'#home').getAttribute('data-stage'),'prepare');
      await levels(page);assert.equal(await progress(page,'#levels').getAttribute('data-stage'),'prepare');
      await start(page);await solve(page);const after=await state(page);
      assert.equal(after.status.answered,8);assert.equal(after.status.right,5);assert.equal(after.status.readyDay,null);
      assert.equal(after.stars,0);assert.equal(after.normal,false);
      assert.equal(await progress(page,'#first-finish').getAttribute('data-stage'),'prepare');
    });
    await scenario('ordinary preparation waits honestly and the next day reveals three confirmation visits',async page=>{
      await fixture(page,'11111111');await home(page);
      let copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));
      assert.equal(copy.stage,'waiting');assert.match(copy.title+' '+copy.detail,/じゅんび.*できた|じゅんび.*おわ/);
      assert.match(copy.detail,/べつのひ/);assert.match(copy.nextLabel,/れんしゅう/);
      assert.equal(await progress(page,'#home').getAttribute('data-stage'),'waiting');
      const before=await state(page);await start(page);await solve(page);const after=await state(page);
      assert.equal(after.status.answered,before.status.answered);assert.equal(after.status.right,before.status.right);
      assert.equal(after.status.readyDay,before.status.readyDay);assert.equal(after.status.checks,0);assert.equal(after.gold,false);
      assert.equal(await progress(page,'#first-finish').getAttribute('data-stage'),'waiting');
      await day(page,1);await reload(page);await levels(page);
      copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));assert.equal(copy.stage,'check');assert.match(copy.nextLabel,/たしかめ/);
      assert.equal(await progress(page,'#levels').getAttribute('data-stage'),'check');
      await start(page);await solve(page);assert.match(await progress(page,'#first-finish').textContent(),/1\s*[／/]\s*3/);
      for(let i=0;i<2;i++){await start(page);await solve(page);}
      const done=await state(page);assert.equal(done.normal,true);assert.equal(done.gold,true);assert.equal(done.stars,3);assert.equal(done.plays,1);
      assert.equal(await progress(page,'#first-finish').getAttribute('data-stage'),'complete');
      assert.equal(await progress(page,'#first-finish').getAttribute('data-goal'),'gold');
      assert.match(await progress(page,'#first-finish').locator('.short-progress-title').textContent(),/きん.*シール/);
    });
    await scenario('gold preparation counts a fresh streak and same-day gold actions offer optional practice',async page=>{
      await ordinary(page);await levels(page);await page.locator('#levels .gold-short-start').click();await solve(page,{help:true});
      for(let i=0;i<3;i++){await start(page);await solve(page);}
      let copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));
      assert.equal(copy.goal,'gold');assert.equal(copy.stage,'prepare');assert.match(copy.title+' '+copy.detail,/3\s*[／/]\s*8/);
      assert.match(copy.title+' '+copy.detail,/つづけて/);assert.equal((await state(page)).stars,2);
      await fixture(page,'11111');await levels(page);copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));
      assert.equal(copy.stage,'waiting');assert.match(copy.nextLabel,/れんしゅう/);assert.doesNotMatch(copy.nextLabel,/つづき|きんへ/);
      assert.equal(await progress(page,'#levels').getAttribute('data-stage'),'waiting');
      assert.match(await page.locator('#levels .gold-short-start').textContent(),/れんしゅう/);
      assert.doesNotMatch(await page.locator('#levels .gold-short-start').textContent(),/きんへ.*つづき/);
      const before=await state(page);await page.locator('#levels .gold-short-start').click();await solve(page);const after=await state(page);
      assert.equal(after.status.goldStatus.independentRun,8);assert.equal(after.status.readyDay,before.status.readyDay);
      assert.equal(after.status.checks,0);assert.equal(after.gold,false);assert.equal(after.stars,2);assert.equal(after.plays,1);
      await page.evaluate(()=>KazuApp.FirstSteps.open(KazuApp.Games.byId.count,0));
      const goldButtons=page.locator('#first-steps .first-actions button').filter({hasText:/れんしゅう/});
      assert.equal(await goldButtons.count(),1);await goldButtons.click();await solve(page);
      assert.equal((await state(page)).status.checks,0);
      await day(page,1);await levels(page);assert.match(await page.locator('#levels .gold-short-start').textContent(),/たしかめ/);
      await page.locator('#levels .gold-short-start').click();await solve(page);
      assert.equal((await state(page)).status.checks,1);assert.match(await progress(page,'#first-finish').textContent(),/1\s*[／/]\s*3/);
      for(let i=0;i<2;i++){await start(page);await solve(page);}
      const done=await state(page);assert.equal(done.gold,true);assert.equal(done.normal,true);assert.equal(done.stars,3);assert.equal(done.plays,1);
      assert.equal(await progress(page,'#first-finish').getAttribute('data-stage'),'complete');
      assert.equal(await progress(page,'#first-finish').getAttribute('data-goal'),'gold');
      assert.match(await progress(page,'#first-finish').locator('.short-progress-title').textContent(),/きん.*シール/);
    });
    await scenario('a failed gold check waits for another day and resumes from a fresh three without lowering the clear',async page=>{
      await ordinary(page);await page.evaluate(()=>KazuApp.Store.startShortGold('count',0));await fixture(page,'11111111');await day(page,1);await fixture(page,'011');
      let copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));assert.equal(copy.stage,'waiting');assert.match(copy.detail,/べつのひ/);
      await home(page);assert.equal(await progress(page,'#home').getAttribute('data-stage'),'waiting');
      const before=await state(page);assert.equal(before.status.checks,3);assert.equal(before.normal,true);assert.equal(before.gold,false);assert.equal(before.stars,2);
      await day(page,2);await reload(page);await levels(page);copy=await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0));
      assert.equal(copy.stage,'check');assert.equal(copy.status.checks,0);assert.match(copy.title+' '+copy.detail,/0\s*[／/]\s*3/);
      assert.equal(await progress(page,'#levels').getAttribute('data-stage'),'check');
      await page.locator('#levels .gold-short-start').click();await solve(page);
      assert.equal((await state(page)).status.checks,1);assert.equal((await state(page)).plays,1);
    });
    await scenario('progress rendering preserves storage, the ended-day boundary, and each lap',async page=>{
      await fixture(page,'1111');
      const raw=await page.evaluate(()=>KazuApp.Store.exportText());
      await home(page);await levels(page);await page.evaluate(()=>KazuApp.FirstSteps.open(KazuApp.Games.byId.count,0));
      const current=await page.evaluate(()=>KazuApp.Store.exportText());assert.equal(current,raw);
      await page.evaluate(()=>KazuApp.Home.endToday());
      assert.equal(await progress(page,'#home').isVisible(),false);
      assert.equal(await progress(page,'#home').evaluate(n=>!!n.closest('.home-more-content')),true);
      assert.equal(await page.locator('#home .home-more').evaluate(n=>n.open),false);
      await page.locator('#home .home-more > summary').click();assert.equal(await progress(page,'#home').isVisible(),true);
      await page.evaluate(()=>{KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);KazuApp.Home.render();});
      assert.equal(await page.locator('#home .short-progress[data-short-key="count:0"]').count(),0);
      await page.evaluate(()=>{KazuApp.Store.selectRound(1);KazuApp.Home.render();});
      assert.match(await progress(page,'#home').textContent(),/4\s*[／/]\s*8/);
      assert.equal(await progress(page,'#home').isVisible(),false);
      await reload(page);await home(page);assert.match(await progress(page,'#home').textContent(),/4\s*[／/]\s*8/);
      assert.equal(await progress(page,'#home').isVisible(),false);
      await day(page,1);await home(page);assert.equal(await progress(page,'#home').isVisible(),true);
      const unknown=await page.evaluate(()=>{
        const S=KazuApp.Store,b=JSON.parse(S.exportText());b.data.shortCourses['futuregame:0']=b.data.shortCourses['count:0'];
        const ok=S.importText(JSON.stringify(b),'replace').ok;KazuApp.Home.render();
        return {ok,unknown:!!KazuApp.ShortProgress.describe('futuregame',0)?.visible,count:S.shortStatus('count',0).answered};
      });assert.deepEqual(unknown,{ok:true,unknown:false,count:4});
    });
    await scenario('the shared three-stage explanation and speech stay usable at phone and tablet widths',async page=>{
      await fixture(page,'1111');
      for(const width of [320,390,768,1024]){
        await page.setViewportSize({width,height:width<768?740:1024});
        for(const screen of ['#home','#levels','#first-finish']){
          if(screen==='#home')await home(page);else if(screen==='#levels')await levels(page);
          else await page.evaluate(()=>KazuApp.FirstSteps.finish(KazuApp.Games.byId.count,0,'independent',null));
          await page.locator(screen).evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));
          const node=progress(page,screen);assert.equal(await node.isVisible(),true);
          assert.equal(await node.locator('.short-progress-step').count(),3);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,screen+' viewport '+width);
          const clipped=await node.evaluate(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5;});
          assert.equal(clipped,false,screen+' progress viewport '+width);
          const speak=node.locator('button.short-progress-speak');const box=await speak.boundingBox();assert.ok(box&&box.width>=43.9&&box.height>=43.9,screen+' '+width+' speak button '+JSON.stringify(box));
          await speak.click();assert.equal(await page.evaluate(()=>window.__progressSaid.at(-1)),await page.evaluate(()=>KazuApp.ShortProgress.describe('count',0).speech));
        }
        await page.locator('#first-finish').screenshot({path:`/tmp/math-youji-short-progress-${width}.png`,animations:'disabled'});
      }
    });
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('PASS '+passed+' short-progress UI scenarios; no browser exceptions');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
