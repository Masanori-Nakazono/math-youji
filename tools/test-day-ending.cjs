#!/usr/bin/env node
'use strict';
// Voluntary endings are presentation state, never new grades or lost checkpoints.
// Store fixtures and browser contexts are disposable; no real child record is read.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const storeSource=['02-store.js','06-miss.js'].map(f=>fs.readFileSync(path.join(root,'src/js',f),'utf8')).join('\n')+'\nglobalThis.S=Store;';
const clone=v=>JSON.parse(JSON.stringify(v));
const raw=s=>JSON.parse(s.exportText()).data;
const report=name=>console.log('PASS '+name);
function load(initial,initialTime=Date.parse('2026-10-18T14:59:00Z')){
  const values=new Map(initial===undefined?[]:[['kazu-no-bouken.v1',JSON.stringify(initial)]]);
  let now=initialTime;
  class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
  const context={Date:Clock,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))},
    setTimeout(){return 1;},clearTimeout(){},addEventListener(){},document:{hidden:false},location:{origin:'test://day-ending'},
    clamp:(n,a,b)=>Math.max(a,Math.min(b,n))};
  vm.runInNewContext(storeSource,context);
  return{store:context.S,values,advance:ms=>now+=ms,time:()=>now};
}
function checkpoint(){return{v:1,id:'day-ending-visit',at:Date.now(),mode:'level',title:'かぞえよう',gameId:'count',levelIndex:0,
  index:1,plan:[{gameId:'count',levelIndex:0,seed:1},{gameId:'count',levelIndex:0,seed:2}],firstTryRight:1,mistakes:0,swiftCount:0,
  results:['done'],sessionOutcomes:[{gameId:'count',levelIndex:0,clean:true}],shaky:[],focusKeys:[],usedItems:['count:countL:3'],
  announced:[],checkTally:{},rewardKey:null,adventureTarget:null,firstTarget:null,firstPhase:null,visitMilestone:null,question:null};}
function storeChecks(){
  const a=load(),S=a.store;
  assert.equal(S.endedToday(),false);S.countToday(1);S.noteFact('count:countL:3',false,'3こ','count:0');
  assert.equal(S.saveSession(checkpoint()),true);
  const before=raw(S);assert.equal(S.endToday(),true);assert.equal(S.endToday(),false);assert.equal(S.endedToday(),true);
  const after=raw(S);after.endedDay=before.endedDay;assert.deepEqual(after,before);
  S.flush();assert.equal(load(raw(S),a.time()).store.endedToday(),true);assert.equal(S.todayCount(),1);
  assert.equal(S.savedSession().id,'day-ending-visit');
  report('ending is idempotent, persists, and changes no answer, reward, course or interrupted visit');

  const ended=S.exportText(),old=JSON.parse(ended);delete old.data.endedDay;
  assert.equal(S.importText(JSON.stringify(old)).ok,true);assert.equal(S.endedToday(),true);
  const fresh=load(undefined,a.time()).store;
  assert.equal(fresh.importText(ended).ok,true);assert.equal(fresh.endedToday(),false);
  assert.equal(fresh.importText(ended,'replace').ok,true);assert.equal(fresh.endedToday(),true);
  assert.equal(fresh.importText(JSON.stringify(old),'replace').ok,true);assert.equal(fresh.endedToday(),false);
  const stable=fresh.exportText();
  for(const bad of [-1,.5,'today',{},[],true,1e20]){
    const broken=JSON.parse(stable);broken.data.endedDay=bad;
    assert.equal(fresh.importText(JSON.stringify(broken),'replace').ok,false);assert.equal(fresh.exportText(),stable);
    const recovered=load(broken.data,a.time()).store;
    assert.equal(recovered.endedToday(),false);assert.equal(recovered.fact('count:countL:3')[0],1);
  }
  report('replacement restores an ending, merges preserve this device choice, and malformed or legacy endings preserve valid progress');

  const b=load(undefined,Date.parse('2026-10-17T06:00:00Z')),B=b.store;
  B.recordMilestone('count',0,'independent','きのうの3こ');b.advance(86400000);
  B.noteFact('count:countL:3',false,'きょうの3こ','count:0');B.countToday(1);
  B.recordReview('r2:0',Array(8).fill('supported'),'lesson');
  B.unlockRoundTwo();B.selectRound(2);B.noteFact('count:countL:4',true,'4こ','count:0');B.countToday(2);
  B.recordMilestone('count',0,'together','4こ');B.recordMilestone('count',0,'independent','4こ');B.endToday();
  const summary=clone(B.todaySummary());assert.equal(summary.total,3);
  const first=summary.entries.find(e=>e.round===1&&e.gameId==='count');
  assert.equal(first.type,'practice');assert.equal(first.kind,undefined);assert.equal(first.label,'きょうの3こ');
  assert.equal(summary.entries.find(e=>e.round===2&&e.gameId==='count').kind,'independent');
  assert.ok(summary.entries.some(e=>e.round===1&&e.type==='review'&&e.key==='r2:0'));
  assert.equal(Object.hasOwn(B.roundData(2),'endedDay'),false);B.selectRound(1);assert.equal(B.endedToday(),true);
  const progress=raw(B),answers=B.todayCount();b.advance(86400000);
  assert.equal(B.endedToday(),false);assert.equal(B.todayCount(),0);assert.equal(B.todaySummary().entries.length,0);
  assert.deepEqual(raw(B),progress);assert.equal(answers,3);
  report('today reflection distinguishes actual milestones from familiar practice, includes book and both laps, and expires without erasing history');
}

const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(e?'':b);});
});
(async()=>{
  storeChecks();let browser,passed=0;const errors=[];
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch();
    const url=`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet=page=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;window.__said=[];
      K.Sound.say=(t,o)=>{window.__said.push(t);if(o&&o.onend)o.onend();};K.Session._test.overview(false);K.Session._test.breaks(false);K.Session._test.intro(false);});
    const scenario=async(name,run)=>{
      const c=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      await c.addInitScript(()=>{const RD=Date,base=RD.parse('2026-10-18T14:59:00Z');window.__advance=0;
        window.Date=class extends RD{constructor(...a){super(...(a.length?a:[base+window.__advance]));}static now(){return base+window.__advance;}};});
      const p=await c.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));await p.route('https://**',r=>r.abort());
      try{await p.goto(url,{waitUntil:'domcontentloaded'});await quiet(p);await p.evaluate(()=>KazuApp.Store.reset());
        await run(p);passed++;report(name);}finally{await c.close();}
    };
    const showHome=p=>p.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home',{focus:false});});
    const solveCount=p=>p.evaluate(()=>{const T=KazuApp.Session._test;document.querySelectorAll('#play .obj').forEach(b=>b.click());T.flushTimers();
      const answer=Number(T.item.split(':').at(-1));const b=[...document.querySelectorAll('#play .choices .choice')].find(b=>Number(b.textContent)===answer);
      if(!b)throw Error('missing answer '+T.item);b.click();T.flushTimers();});
    const startShort=p=>p.evaluate(()=>KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true));
    const assertEnded=async(p,total)=>{
      assert.equal(await p.evaluate(()=>KazuApp.Store.endedToday()),true);assert.equal(await p.locator('#home .day-ending').isVisible(),true);
      assert.equal(await p.locator('#home .home-more').evaluate(n=>n.open),false);assert.equal(await p.locator('#home .home-primary').isVisible(),false);
      assert.match(await p.locator('#home .day-ending').textContent(),new RegExp(total+'もん あそんだね'));
      assert.equal(await p.evaluate(()=>KazuApp.Store.todayCount()),total);
    };
    await scenario('one-question stop remains a quiet ending through reload while explicitly chosen extra play remains available',async p=>{
      await startShort(p);await solveCount(p);await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();await assertEnded(p,1);
      assert.match(await p.locator('#home .day-ending-entry').textContent(),/ひとりで こたえたね/);
      assert.match(await p.evaluate(()=>window.__said.at(-1)),/今日はここまで/);
      await p.reload({waitUntil:'domcontentloaded'});await quiet(p);await showHome(p);await assertEnded(p,1);
      await p.locator('#home .home-more > summary').click();await p.locator('#home .home-primary').click();await solveCount(p);
      assert.equal(await p.evaluate(()=>KazuApp.Store.endedToday()),true);
      await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();await assertEnded(p,2);
    });
    await scenario('midnight restores ordinary recommendations without consuming the short course or yesterday ending',async p=>{
      await startShort(p);await solveCount(p);await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();
      const previous=await p.evaluate(()=>({status:KazuApp.Store.shortStatus('count',0),day:KazuApp.Store.data.endedDay}));
      await p.locator('#home .home-more > summary').click();
      await p.evaluate(()=>{window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
      assert.equal(await p.locator('#home .home-more').evaluate(n=>n.open),true,'same-day foreground events preserve explicit extra-play choice');
      await p.evaluate(()=>{window.__advance=120000;window.dispatchEvent(new Event('focus'));});
      assert.equal(await p.evaluate(()=>KazuApp.Store.endedToday()),false);assert.equal(await p.locator('#home .day-ending').isVisible(),false);
      assert.equal(await p.locator('#home .home-primary').isVisible(),true);assert.equal(await p.evaluate(()=>KazuApp.Store.todayCount()),0);
      assert.equal(await p.evaluate(()=>KazuApp.Store.data.endedDay),previous.day);
      assert.equal(await p.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered),previous.status.answered);
    });
    await scenario('returning from the sticker book or parent gate after midnight refreshes Home without interrupting that screen',async p=>{
      await startShort(p);await solveCount(p);
      const answered=await p.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered);
      for(const target of [{button:'シールブック',screen:'book'},{button:'おうちのかたへ',screen:'gate'}]){
        await p.evaluate(()=>KazuApp.Home.endToday());
        await p.getByRole('button',{name:target.button,exact:true}).click();
        await p.evaluate(()=>{window.__advance+=86400000;window.dispatchEvent(new Event('focus'));});
        assert.equal(await p.evaluate(()=>KazuApp.UI.currentName()),target.screen);
        await p.locator('#'+target.screen+' .topbar button').first().click();
        assert.equal(await p.evaluate(()=>KazuApp.UI.currentName()),'home');
        assert.equal(await p.locator('#home .day-ending').isVisible(),false);
        assert.equal(await p.locator('#home .home-primary').isVisible(),true);
        assert.equal(await p.evaluate(()=>KazuApp.Store.todayCount()),0);
        assert.equal(await p.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered),answered);
      }
    });
    await scenario('ordinary and daily result stops use the same ending even before the long-day threshold',async p=>{
      await p.evaluate(()=>{KazuApp.Store.markIntroduced('count',0);KazuApp.Session.startLevel(KazuApp.Games.byId.count,0);});
      for(let i=0;i<8;i++)await solveCount(p);
      await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();await assertEnded(p,8);
      await p.locator('#home .home-more > summary').click();await p.locator('#home .dailies .daily:not(.recommended):not(.reviewmission):not(.focusset)').click();
      for(let i=0;i<10;i++)await solveCount(p);
      await p.getByRole('button',{name:'きょうは おしまい',exact:true}).click();await assertEnded(p,18);
      assert.equal(await p.evaluate(()=>KazuApp.Store.practiceDoneToday()),true);
    });
    await scenario('ending keeps an unanswered ordinary checkpoint available inside optional play',async p=>{
      await p.evaluate(()=>{KazuApp.Store.markIntroduced('count',0);KazuApp.Session.startLevel(KazuApp.Games.byId.count,0);});
      await solveCount(p);
      await p.locator('#play .topbar button').first().click();await p.locator('#play .topbar button').first().click();
      const saved=await p.evaluate(()=>KazuApp.Store.savedSession());assert.equal(saved.index,1);
      await p.evaluate(()=>KazuApp.Home.endToday());await assertEnded(p,1);
      assert.deepEqual(await p.evaluate(()=>KazuApp.Store.savedSession()),saved);
      await p.reload({waitUntil:'domcontentloaded'});await quiet(p);await showHome(p);await assertEnded(p,1);
      await p.locator('#home .home-more > summary').click();assert.equal(await p.locator('#home .home-primary').getAttribute('data-action'),'resume');
      await p.locator('#home .home-primary').click();assert.equal(await p.evaluate(()=>KazuApp.Session._test.idx),1);
      assert.equal(await p.evaluate(()=>KazuApp.Store.todayCount()),1);assert.equal(await p.evaluate(()=>KazuApp.Session._test.planLength),8);
    });
    await scenario('book and hands-on adventure result stops produce their own honest activity reflections',async p=>{
      await p.evaluate(()=>{const K=KazuApp;K.TextbookReview.preparation(0).forEach(t=>{for(let i=0;i<6;i++)K.Store.noteOutcome(t.game.id,t.levelIndex,true);});K.TextbookReview.open(0);});
      for(let n=0;n<8;n++)await p.evaluate(()=>{const R=KazuApp.TextbookReview,q=R.inspect().q;
        const click=s=>{const b=document.querySelector('#review '+s);if(!b)throw Error('missing '+s);b.click();};
        if(q.type==='group')q.answer.forEach(i=>click('[data-focus="object'+i+'"]'));
        else if(q.type==='match'){for(let i=0;i<q.a;i++){click('[data-focus="target'+i+'"]');click('[data-focus="pair'+i+'"]');}}
        else if(q.cardinality){for(let i=0;i<q.n;i++)click('[data-focus="order'+i+'"]');}
        else if(['horizontal','vertical','train','cardinal'].includes(q.type))click('[data-focus="order'+q.answer+'"]');
        else click('[data-number="'+q.answer+'"]');click('.review-check');click('.review-next');});
      await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();await assertEnded(p,8);
      assert.match(await p.locator('#home .day-ending-entry[data-kind="review"]').textContent(),/ほんで とりくんだね/);
      await p.evaluate(()=>{
        const K=KazuApp;K.Store.setPref('transferReached',true);K.TransferAdventure.open();
        const prior=Math.random;Math.random=()=>.5;
        try{document.querySelector('#transfer [data-mission="0"]').click();
          for(let step=0;step<5;step++){for(let i=0;i<4;i++)document.querySelector('#transfer [aria-label="１つ うごかす"]').click();
            document.querySelector('#transfer .transfer-check').click();document.querySelector('#transfer .transfer-next').click();}
        }finally{Math.random=prior;}
      });
      await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();await assertEnded(p,13);
      assert.match(await p.locator('#home .day-ending-entry[data-kind="transfer"]').textContent(),/ぼうけんに とりくんだね/);
    });
    await scenario('the ending is shared across laps and remains within phone and tablet widths',async p=>{
      await startShort(p);await solveCount(p);await p.getByRole('button',{name:'きょうは ここまで',exact:true}).click();
      await p.evaluate(()=>{KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);});await showHome(p);await assertEnded(p,1);
      await p.evaluate(()=>{KazuApp.Store.countToday(1);KazuApp.Store.noteFact('count:countL:4',false,'4こ を かぞえる','count:0');});await showHome(p);await assertEnded(p,2);
      assert.match(await p.locator('#home .day-ending-entry[data-round="2"]').textContent(),/２しゅうめで.*とりくんだね/);
      assert.doesNotMatch(await p.locator('#home .day-ending-entry[data-round="2"]').textContent(),/ひとりで/);
      for(const width of [320,1024]){
        await p.setViewportSize({width,height:width===320?740:768});
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const box=await p.locator('#home .home-more > summary').boundingBox();assert.ok(box.width>=44&&box.height>=44);
        await p.locator('#home .home-more > summary').click({trial:true});
        await p.screenshot({path:`/tmp/math-youji-day-ending-${width}.png`,animations:'disabled'});
      }
    });
    assert.deepEqual(errors,[],'no browser exceptions');console.log(`PASS ${passed} day-ending browser scenarios; no browser exceptions`);
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
