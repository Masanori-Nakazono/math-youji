#!/usr/bin/env node
'use strict';
// Parent advice uses the same observed recovery and rest as the child's entry.
// Every scenario owns a disposable browser origin; no saved child record is read.
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
const key = 'count:countL:3';
(async () => {
  let browser, passed = 0;
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
    const showParent = page => page.evaluate(() => {KazuApp.Parent.render();KazuApp.UI.show('parent',{focus:false});});
    const note = (page, bits, options={}) => page.evaluate(({bits,options}) => {
      const S=KazuApp.Store, game=options.game || 'count', level=options.level || 0;
      const fact=options.key || 'count:countL:3';
      for (const bit of bits){
        const clean=bit==='1';
        S.noteFact(fact,clean,options.label || '3こ',options.at || game+':'+level,
          options.ms == null ? null : options.ms,clean ? null : 'up');
        if(options.levelRecord !== false)S.noteOutcome(game,level,clean);
      }
    },{bits,options});
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
        await run(page);passed++;console.log('PASS '+name);
      } finally {await context.close();}
    };
    const card = (page,state) => page.locator(`.parent-next [data-fact-state="${state}"][data-fact-key="${key}"]`);
    const currentItem = page => page.evaluate(() => ({length:KazuApp.Session._test.planLength,
      item:KazuApp.Session._test.item,mode:KazuApp.Session._test.mode,targets:KazuApp.Session._test.planItems}));
    const expectCountFocus = async page => {
      const state=await currentItem(page);
      assert.equal(state.length,1);assert.equal(state.mode,'focus');assert.deepEqual(state.targets,[key]);
      assert.match(state.item,/^count:countL:/);
      assert.deepEqual(await page.evaluate(()=>KazuApp.Session._test.planGames),['count:0']);
      return state;
    };
    const solveCount = page => page.evaluate(() => {
      document.querySelectorAll('#play .obj').forEach(n=>n.click());
      const T=KazuApp.Session._test;T.flushTimers();
      const answer=Number(T.item.split(':').at(-1));
      [...document.querySelectorAll('#play .choices .choice')].find(b=>Number(b.textContent)===answer).click();
      T.flushTimers();
    });

    await scenario('recovered facts leave both current support lists and prioritise their fact in a one-question revisit',async page=>{
      await note(page,'0'.repeat(12));await note(page,'1'.repeat(12));await showParent(page);
      const s=await page.evaluate(k=>({status:KazuApp.Store.factStatus(k),weak:KazuApp.Diagnostic.weakFacts().map(x=>x.key)}),key);
      assert.equal(s.status.accuracy,.5);assert.equal(s.status.recovered,true);assert.equal(s.status.needsPractice,false);
      assert.equal(s.weak.includes(key),false);assert.equal(await card(page,'need').count(),0);
      assert.equal(await card(page,'recovered').count(),1);
      assert.match(await card(page,'recovered').textContent(),/直近12問.*100%/);
      assert.doesNotMatch(await page.locator('.parent-next').textContent(),/とっくん.*拾って|つまずいている中身|1つ多く数えています/);
      await card(page,'recovered').getByRole('button').click();
      const actual=await expectCountFocus(page);
      const before=await page.evaluate(k=>(KazuApp.Store.factStatus(k)||{n:0}).n,actual.item);
      await solveCount(page);
      assert.equal(await page.evaluate(k=>KazuApp.Store.factStatus(k).n,actual.item),before+1);
      assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),1);
      assert.equal(await page.evaluate(()=>KazuApp.Store.stars('count',0)),0);
    });
    await scenario('item support appears before eight level answers and returns if recent independent answers become shaky',async page=>{
      await note(page,'00');await showParent(page);
      assert.equal(await card(page,'need').count(),1);
      assert.equal(await page.evaluate(()=>KazuApp.Store.recentCount('count',0)),2);
      await note(page,'1'.repeat(12));await showParent(page);
      assert.equal(await card(page,'recovered').count(),1);assert.equal(await card(page,'need').count(),0);
      await note(page,'0'.repeat(12));await showParent(page);
      assert.equal(await card(page,'need').count(),1);assert.equal(await card(page,'recovered').count(),0);
      assert.equal(await page.evaluate(k=>KazuApp.Diagnostic.weakFacts().some(x=>x.key===k),key),true);
      await card(page,'need').getByRole('button').click();
      await expectCountFocus(page);
    });
    await scenario('a resting short course is shared with parent advice while its explicit item action remains optional',async page=>{
      await page.evaluate(k=>{
        const S=KazuApp.Store;
        for(let i=0;i<3;i++){
          S.recordShortAnswer('count',0,false,'parent-rest-'+i,'independent',[k],{kind:'supported'});
          S.noteOutcome('count',0,false,false);S.noteFact(k,false,'3こ','count:0',null,'up');
        }
      },key);
      await showParent(page);
      assert.equal(await page.locator('.parent-recommendation').getAttribute('data-parent-plan'),'support');
      assert.equal(await card(page,'need').count(),0);assert.equal(await card(page,'rest').count(),1);
      assert.equal(await page.evaluate(k=>KazuApp.Diagnostic.weakFacts().some(x=>x.key===k),key),false);
      assert.match(await page.locator('.parent-next').textContent(),/この内容を少し休み/);
      await page.locator('.parent-plan-start').click();
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'together');
      await solveCount(page);await showParent(page);
      const changed=await page.evaluate(()=>({kind:KazuApp.FirstSteps.shortPlan().kind,
        rest:KazuApp.Diagnostic.resting('count',0),stars:KazuApp.Store.stars('count',0),plays:KazuApp.Store.plays('count',0)}));
      assert.equal(changed.rest,true);assert.notEqual(changed.kind,'support');assert.equal(changed.stars,0);assert.equal(changed.plays,0);
      await card(page,'rest').getByRole('button').click();
      await expectCountFocus(page);
    });
    await scenario('stable items become optional reminders after a week without being labelled as current difficulty',async page=>{
      await note(page,'1'.repeat(12));await page.evaluate(()=>window.__testDay=8);await showParent(page);
      assert.equal(await card(page,'stale').count(),1);assert.equal(await card(page,'need').count(),0);
      assert.equal(await card(page,'recovered').count(),0);assert.match(await card(page,'stale').textContent(),/8日ふれていません/);
      await card(page,'stale').getByRole('button').click();
      await expectCountFocus(page);
    });
    await scenario('parent next action follows the child planner from active work to a due later-day check',async page=>{
      await page.evaluate(()=>{
        const S=KazuApp.Store;
        for(let i=0;i<8;i++){S.recordShortAnswer('count',0,true,'parent-wait-'+i,'independent');S.noteOutcome('count',0,true,false);}
        S.recordShortAnswer('flash',0,true,'parent-newer','independent');S.noteOutcome('flash',0,true,false);
      });
      await showParent(page);
      assert.equal(await page.locator('.parent-recommendation').getAttribute('data-parent-plan'),'resume');
      assert.match(await page.locator('.parent-recommendation').textContent(),/ぱっと みて/);
      await page.evaluate(()=>window.__testDay=1);await showParent(page);
      assert.equal(await page.locator('.parent-recommendation').getAttribute('data-parent-plan'),'check');
      await page.locator('.parent-plan-start').click();
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),1);
      assert.deepEqual(await page.evaluate(()=>KazuApp.Session._test.planGames),['count:0']);
      assert.match(await page.locator('#play .session-count').textContent(),/たしかめ/);
    });
    await scenario('unknown and prototype-like fact origins survive import without hiding valid progress',async page=>{
      await note(page,'0'.repeat(12));await note(page,'1'.repeat(12));
      const imported=await page.evaluate(()=>{
        const S=KazuApp.Store;
        S.noteFact('futuregame:item',false,'未来の内容','futuregame:0');
        S.noteFact('legacy:constructor',false,'以前の内容','constructor:0');
        const backup=S.exportText();S.reset();return S.importText(backup,'replace');
      });
      assert.equal(imported.ok,true);await showParent(page);
      assert.equal(await card(page,'recovered').count(),1);
      assert.equal(await page.locator('.parent-next [data-fact-key="futuregame:item"]').count(),0);
      assert.equal(await page.locator('.parent-next [data-fact-key="legacy:constructor"]').count(),0);
      assert.equal(await page.evaluate(k=>KazuApp.Store.factStatus(k).n,key),24);
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await showParent(page);
      assert.equal(await card(page,'recovered').count(),1);
    });
    await scenario('a random set generator keeps the one-question promise within its game when its preferred fact is not drawn',async page=>{
      await page.evaluate(()=>{
        KazuApp.Store.markG1GameOpen('g1set');
        for(let i=0;i<3;i++)KazuApp.Store.noteFact('g1set:same:animal:3',false,'どうぶつのなかま3こ','g1set:0');
      });
      await showParent(page);
      const setCard=page.locator('.parent-next [data-fact-key="g1set:same:animal:3"]');
      assert.match(await setCard.textContent(),/この項目を優先して、同じ遊びから1問/);
      assert.doesNotMatch(await setCard.getByRole('button').textContent(),/この内容|この項目/);
      assert.equal(await setCard.getByRole('button').getAttribute('aria-label'),'なかまづくりを1問');
      // Hold each candidate generation on another valid seed. The engine's
      // bounded re-roll then exercises its same-level fallback deterministically.
      await page.evaluate(()=>{
        const real=Math.random;
        for(let seed=1;seed<100;seed++){
          Math.random=()=>seed/4294967296;
          KazuApp.Session.startFocus(['g1set:same:animal:3'],{n:1});
          if(KazuApp.Session._test.item!=='g1set:same:animal:3'){
            window.__parentFallbackSeed=seed;
            break;
          }
        }
        Math.random=real;
      });
      await showParent(page);
      await page.evaluate(()=>{
        window.__parentRealRandom=Math.random;
        Math.random=()=>window.__parentFallbackSeed/4294967296;
      });
      await setCard.getByRole('button').click();
      await page.evaluate(()=>{Math.random=window.__parentRealRandom;});
      const fallback=await page.evaluate(()=>({item:KazuApp.Session._test.item,
        found:window.__parentFallbackSeed,plan:KazuApp.Session._test.planGames,n:KazuApp.Session._test.planLength}));
      assert.ok(fallback.found);assert.notEqual(fallback.item,'g1set:same:animal:3');
      assert.deepEqual(fallback.plan,['g1set:0']);assert.equal(fallback.n,1);
      assert.match(fallback.item,/^g1set:same:/);
    });
    await scenario('current item support and whole-page short-study guidance fit phone and tablet widths',async page=>{
      await note(page,'0'.repeat(12));await note(page,'1'.repeat(12));
      await note(page,'00',{key:'count:countL:4',label:'4こ'});await showParent(page);
      const text=await page.locator('#parent').textContent();
      assert.match(text,/ヒントなしで初回正解した割合/);
      assert.match(text,/1日で1レベルを終える必要はありません/);
      assert.doesNotMatch(text,/1回目のタップ|毎日1回、最後まで|これがそのまま1日1レベル|1日10分・1レベル|1レベル8問・1日10分/);
      for(const width of [320,1024]){
        await page.setViewportSize({width,height:width===320?740:768});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const bounds=await page.locator('.parent-next .parent-fact').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}));
        assert.ok(bounds.every(r=>r.left>=0&&r.right<=width));
        const actions=await page.locator('.parent-next button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {width:r.width,height:r.height};}));
        assert.ok(actions.length&&actions.every(r=>r.width>=44&&r.height>=44),'parent actions remain touchable at '+width);
        await page.locator('.parent-next').screenshot({path:`/tmp/math-youji-parent-guidance-${width}.png`,animations:'disabled'});
      }
    });
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log(`PASS ${passed} parent-guidance browser scenarios; no browser exceptions`);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
