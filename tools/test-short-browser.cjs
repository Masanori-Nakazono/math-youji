#!/usr/bin/env node
'use strict';
// Short visits use real answer controls in isolated, disposable browser storage.
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
    res.writeHead(err ? 404 : 200, {'Content-Type':file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'});
    res.end(err ? '' : data);
  });
});
(async () => {
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
    browser = await chromium.launch();
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet = page => page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
      K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};
      K.Session._test.overview(false);K.Session._test.breaks(false);
    });
    const reload = async page => {
      await page.evaluate(()=>KazuApp.Store.flush());
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);
    };
    const start = page => page.evaluate(()=>KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true));
    const solve = async (page, {help=false, wrong=false, finish=true}={}) => {
      await page.evaluate(() => {
        document.querySelectorAll('#play .obj').forEach(n=>n.click());
        KazuApp.Session._test.flushTimers();
      });
      if (help) await page.locator('#play .showbtn').click();
      await page.evaluate(wrong => {
        const T=KazuApp.Session._test, answer=Number(T.item.split(':').at(-1));
        const choices=[...document.querySelectorAll('#play .choices .choice')];
        if(wrong)choices.find(b=>Number(b.textContent)!==answer).click();
        choices.find(b=>Number(b.textContent)===answer).click();
      },wrong);
      if(finish)await page.evaluate(()=>KazuApp.Session._test.flushTimers());
    };
    const snapshot = page => page.evaluate(() => {
      const K=KazuApp,S=K.Store;
      return {status:S.shortStatus('count',0),today:S.todayCount(),recent:S.recentCount('count',0),
        ready:K.Progress.levelReady('count',0),stars:S.stars('count',0),plain:S.hasConfirmed('count:0'),
        gold:S.hasSticker('count:0:g'),plays:S.plays('count',0),screen:K.UI.currentName()};
    });
    const scenario = async (name, run) => {
      const context=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(() => {
        const RealDate=Date,base=RealDate.parse('2026-10-17T06:00:00Z');
        window.__testDay=0;
        window.Date=class extends RealDate {
          constructor(...a){super(...(a.length?a:[base+window.__testDay*86400000]));}
          static now(){return base+window.__testDay*86400000;}
        };
      });
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(name+': '+e.message));
      await page.route('https://**',r=>r.abort());
      try {
        await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);
        await page.evaluate(()=>KazuApp.Store.reset());
        await run(page);console.log('PASS '+name);
      } finally {await context.close();}
    };
    await scenario('supported entry leads to one independent question and stays on the same subject',async page=>{
      await page.evaluate(()=>{
        const K=KazuApp;K.FirstSteps.startOne(K.Games.byId.count,0);
        K.Session._test.forceCorrect();K.Session._test.flushTimers();
      });
      assert.equal((await snapshot(page)).recent,0);
      await page.getByRole('button',{name:'きょうは ここまで',exact:true}).click();
      assert.equal(await page.locator('#home .home-primary').getAttribute('data-action'),'short');
      await reload(page);
      await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});
      await page.locator('#home .home-primary').click();
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),1);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),null);
      await solve(page);
      const a=await snapshot(page);
      assert.equal(a.today,2);assert.equal(a.recent,1);assert.equal(a.stars,0);assert.equal(a.gold,false);
      assert.equal(a.status.answered,1);assert.equal(a.status.right,1);
      await page.getByRole('button',{name:'きょうは ここまで',exact:true}).click();
      assert.equal(await page.locator('#home .home-primary').getAttribute('data-action'),'short');
      assert.equal(await page.evaluate(()=>KazuApp.FirstSteps.oneTarget().game.id),'count');
      await reload(page);
      await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});
      await page.locator('#home .home-primary').click();
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),null);
    });
    await scenario('eight independent visits wait for a later day, then three single checks confirm the course',async page=>{
      for(let i=0;i<8;i++){await start(page);await solve(page);}
      const waiting=await snapshot(page);
      assert.equal(waiting.status.waiting,true);assert.equal(waiting.ready,false);
      assert.equal(waiting.stars,0);assert.equal(waiting.plain,false);assert.equal(waiting.gold,false);
      await start(page);await solve(page);
      assert.equal((await snapshot(page)).status.checks,0);
      await page.evaluate(()=>window.__testDay++);
      for(let i=0;i<3;i++){
        await start(page);
        assert.match(await page.locator('#play .session-count').textContent(),/たしかめ/);
        await solve(page);
        if(i===0){await reload(page);await page.evaluate(()=>window.__testDay=1);}
      }
      const done=await snapshot(page);
      assert.equal(done.status.confirmed,true);assert.equal(done.ready,true);
      assert.equal(done.stars,3);assert.equal(done.plain,true);assert.equal(done.gold,true);assert.equal(done.plays,1);
      assert.match(await page.locator('#first-finish').textContent(),/べつのひも できたね/);
    });
    await scenario('hints and corrected answers count as supported progress and prevent a perfect reward',async page=>{
      for(let i=0;i<8;i++){await start(page);await solve(page,{help:i===0,wrong:i===1});}
      const before=await snapshot(page);assert.equal(before.status.right,6);assert.equal(before.ready,false);
      await page.evaluate(()=>window.__testDay++);
      for(let i=0;i<3;i++){await start(page);await solve(page,{help:i===0});}
      const done=await snapshot(page);
      assert.equal(done.plain,true);assert.equal(done.stars,2);assert.equal(done.gold,false);
      assert.equal(await page.evaluate(()=>KazuApp.Store.data.firstTry.count[0]),8);
    });
    await scenario('reload after the answer but before its animation neither repeats nor loses the visit',async page=>{
      await start(page);await solve(page,{finish:false});
      const before=await snapshot(page);assert.equal(before.status.answered,1);
      assert.equal(await page.evaluate(()=>KazuApp.Store.savedSession().index),1);
      await reload(page);
      await page.evaluate(()=>KazuApp.Session.resume());
      const after=await snapshot(page);
      assert.equal(after.today,1);assert.equal(after.recent,1);assert.equal(after.status.answered,1);
      assert.equal(after.screen,'first-finish');
      assert.equal(await page.evaluate(()=>KazuApp.Session.resume()),false);
    });
    await scenario('help and the unfinished question survive reload without becoming independent evidence',async page=>{
      await start(page);
      await page.evaluate(()=>{
        document.querySelectorAll('#play .obj').forEach(n=>n.click());KazuApp.Session._test.flushTimers();
      });
      await page.locator('#play .showbtn').click();
      const item=await page.evaluate(()=>KazuApp.Session._test.item);
      await reload(page);await page.evaluate(()=>KazuApp.Session.resume());
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.item),item);
      await solve(page);
      const after=await snapshot(page);
      assert.equal(after.status.answered,1);assert.equal(after.status.right,0);assert.equal(after.ready,false);
    });
    await scenario('failed checks retain practice and allow another check on a later day',async page=>{
      for(let i=0;i<8;i++){await start(page);await solve(page);}
      await page.evaluate(()=>window.__testDay=1);
      for(let i=0;i<3;i++){await start(page);await solve(page,{wrong:true});}
      const failed=await snapshot(page);
      assert.equal(failed.status.lastResult,'retry');assert.equal(failed.status.waiting,true);assert.equal(failed.plain,false);
      await start(page);await solve(page);assert.equal((await snapshot(page)).status.checks,3);
      await page.evaluate(()=>window.__testDay=2);
      assert.equal((await snapshot(page)).status.checks,0);
      for(let i=0;i<3;i++){await start(page);await solve(page);}
      assert.equal((await snapshot(page)).plain,true);
    });
    await scenario('a short later-day check uses the same three-way assessment format after reload',async page=>{
      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;
        for(let i=0;i<8;i++){
          S.recordShortAnswer('compare',0,true,'fixture-'+i,'independent');
          S.noteOutcome('compare',0,true,false);
        }
        window.__testDay=1;
        K.FirstSteps.startOne(K.Games.byId.compare,0,true);
      });
      assert.equal(await page.locator('#play .plate').count(),3);
      const saved=await page.evaluate(()=>KazuApp.Store.savedSession());
      const item=await page.evaluate(()=>KazuApp.Session._test.item);
      assert.equal(saved.firstPhase,'check');assert.equal(saved.plan[0].check,undefined);
      await reload(page);await page.evaluate(()=>{window.__testDay=1;KazuApp.Session.resume();});
      assert.equal(await page.locator('#play .plate').count(),3);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.item),item);
    });
    await scenario('short results and parent guidance fit a phone and an iPad',async page=>{
      await start(page);await solve(page);
      for(const width of [320,1024]){
        await page.setViewportSize({width,height:width===320?740:768});
        await page.screenshot({path:`/tmp/math-youji-short-${width}.png`,animations:'disabled'});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.equal(await page.getByRole('button',{name:'きょうは ここまで',exact:true}).isVisible(),true);
      }
      await page.evaluate(()=>{KazuApp.Parent.render();KazuApp.UI.show('parent');});
      const text=await page.locator('#parent').textContent();
      assert.match(text,/1問ずつのコース/);assert.doesNotMatch(text,/8問を最後までやりきれば十分/);
    });
    await scenario('obsolete short-course references do not prevent Home or damage valid progress',async page=>{
      await start(page);await solve(page);
      const restored=await page.evaluate(()=>{
        const K=KazuApp,S=K.Store,backup=JSON.parse(S.exportText());
        backup.data.shortCourses['constructor:0']=backup.data.shortCourses['count:0'];
        backup.data.shortCourses['futuregame:0']=backup.data.shortCourses['count:0'];
        const ok=S.importText(JSON.stringify(backup),'replace').ok;
        K.Home.render();K.UI.show('home');
        return {ok,game:K.FirstSteps.shortTarget().game.id,answers:S.shortStatus('count',0).answered,today:S.todayCount()};
      });
      assert.deepEqual(restored,{ok:true,game:'count',answers:1,today:1});
    });
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('PASS 9 short-learning browser scenarios; no browser exceptions');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
