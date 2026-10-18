#!/usr/bin/env node
'use strict';
// Finish the actual courses through their answer controls, then use the child's
// result controls. Every scenario has disposable storage and blocked assets.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(fs.readFileSync(process.env.RESULT_ACTIONS_HTML||path.join(root,'dist/kazu-no-bouken.html')));
});
const screens={regular:'#result',short:'#first-finish',book:'#review',transfer:'#transfer'};
(async()=>{
  let browser,passed=0;const errors=[];
  const shots=process.env.RESULT_ACTIONS_SHOTS&&path.resolve(process.env.RESULT_ACTIONS_SHOTS);
  if(shots)fs.mkdirSync(shots,{recursive:true});
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const learning=page=>page.evaluate(()=>{const S=KazuApp.Store;return JSON.parse(JSON.stringify({today:S.todayCount(),
      stars:S.data.stars,plays:S.data.plays,stickers:S.data.stickers,pending:S.data.pending,daily:S.data.daily,
      shortCourses:S.data.shortCourses,milestones:S.data.milestones,reviewRecords:S.data.reviewRecords,transferRecords:S.data.transferRecords}));});
    const finish=async(page,kind)=>{
      await page.evaluate(kind=>{const K=KazuApp,S=K.Store;
        if(window.__restoreResultSpies)window.__restoreResultSpies();
        S.reset();K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
        K.Sound.say=(text,opts)=>{if(opts&&opts.onend)opts.onend();};K.Sound.probeVoice=()=>Promise.resolve(true);
        K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);K.Session._test.autoAdvance(true);
        const click=selector=>{const n=document.querySelector(selector);if(!n)throw Error('missing '+selector);n.click();};
        if(kind==='regular'||kind==='short'){
          S.markIntroduced('count',0);
          if(kind==='short')K.FirstSteps.startOne(K.Games.byId.count,0,true);
          else K.Session.startLevel(K.Games.byId.count,0);
          let limit=0;
          while(K.UI.currentName()==='play'&&limit++<20){
            document.querySelectorAll('#play .obj:not(.counted)').forEach(n=>n.click());K.Session._test.flushTimers(600);
            const answer=Number(K.Session._test.item.split(':').at(-1));
            const choice=[...document.querySelectorAll('#play .choices .choice')].find(n=>Number(n.textContent)===answer);
            if(!choice)throw Error('count answer missing');choice.click();K.Session._test.flushTimers(600);
          }
          if(K.UI.currentName()!==(kind==='short'?'first-finish':'result'))throw Error('count course did not finish');
          if(S.todayCount()!==(kind==='short'?1:8))throw Error('count course question count');
          if(kind==='regular'&&(!S.hasSticker('count:0')||!S.hasSticker('count:0:g')||S.plays('count',0)!==1))throw Error('regular rewards');
          if(kind==='short'&&(S.plays('count',0)!==0||S.shortStatus('count',0).answered!==1))throw Error('short record');
        }else if(kind==='book'){
          S.setPref('secondRoundReached',true);K.TextbookReview.open(0);
          for(let step=0;step<8;step++){
            const {q}=K.TextbookReview.inspect();
            if(q.type==='match')for(let i=0;i<q.a;i++){click('#review [data-focus="target'+i+'"]');click('#review [data-focus="pair'+i+'"]');}
            else q.answer.forEach(i=>click('#review [data-focus="object'+i+'"]'));
            click('#review .review-check');click('#review .review-next');
          }
          if(!document.querySelector('#review .review-result')||S.todayCount()!==8||S.data.reviewRecords['r2:0'].independent!==8||!S.hasConfirmed('r2:0'))throw Error('book course or rewards');
        }else{
          S.setPref('transferReached',true);const random=Math.random;Math.random=()=>.5;
          try{K.TransferAdventure.open();click('#transfer [data-mission="0"]');
            for(let step=0;step<5;step++){
              for(let n=0;n<4;n++)click('#transfer [aria-label="１つ うごかす"]');
              click('#transfer .transfer-check');click('#transfer .transfer-next');
            }
          }finally{Math.random=random;}
          if(!document.querySelector('#transfer .transfer-result')||S.todayCount()!==5||S.data.transferRecords[0].independent!==5||!S.hasSticker('transfer:0'))throw Error('adventure course or rewards');
        }
      },kind);await settle(page);
    };
    const geometry=async(page,scope)=>page.locator(scope).evaluate(node=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const buttons=[...node.querySelectorAll('.result-dock-row [data-result-action]')];
      return {viewport:{width:innerWidth,height:innerHeight},dock:rect(node.querySelector('.result-dock')),
        buttons:buttons.map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {label:n.textContent,action:n.dataset.resultAction,rect:rect(n),hit:!!hit&&(hit===n||n.contains(hit))};}),
        scrollers:[...node.querySelectorAll('.inner,.reward-sheet,.review-body,.transfer-body')].filter(n=>n.clientHeight>0).map(n=>({rect:rect(n),scroll:n.scrollTop,height:n.clientHeight,content:n.scrollHeight})),
        overflow:document.documentElement.scrollWidth>innerWidth};
    });
    const visibleDock=async(page,scope,label)=>{
      const g=await geometry(page,scope);assert.equal(g.overflow,false,label+' horizontal overflow');assert.equal(g.buttons.length,2,label+' has exactly two primary actions');
      assert.deepEqual(g.buttons.map(b=>b.action).sort(),['continue','end']);
      for(const b of g.buttons){const r=b.rect;assert.ok(r.height>=63.5&&r.width>=63.5,label+' target '+JSON.stringify(b));
        assert.ok(r.x>=-1&&r.y>=-1&&r.right<=g.viewport.width+1&&r.bottom<=g.viewport.height+1,label+' visible '+JSON.stringify(g));
        assert.equal(b.hit,true,label+' unobstructed '+b.label);}
      const [a,b]=g.buttons.map(b=>b.rect);const overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
      assert.equal(overlap,0,label+' primary actions do not overlap');
      for(const s of g.scrollers)assert.ok(s.rect.bottom<=g.dock.y+1,label+' scroll content is laid out above the dock '+JSON.stringify(g));
      return g;
    };
    const spy=async(page,kind,role,label)=>page.evaluate(({kind,role,label})=>{
      const K=KazuApp,undo=[];window.__resultEffectCalls=0;
      const wrap=(owner,key,filter)=>{const original=owner[key];owner[key]=function(...args){if(!filter||filter(...args))window.__resultEffectCalls++;return original.apply(this,args);};undo.push(()=>owner[key]=original);};
      if(role==='end')wrap(K.Home,'endToday');
      else if(/しま/.test(label))wrap(K.StickerWorld,'open');
      else if(/べつの あそび/.test(label))wrap(K.Home,'choosePlay');
      else if(/つぎの レベル/.test(label)){wrap(K.FirstSteps,'open');wrap(K.Session,'startLevel');}
      else if(/もんの コース/.test(label))wrap(K.Session,'startLevel');
      else if(kind==='regular')wrap(K.Session,'startLevel');
      else if(kind==='short')wrap(K.Session,'startFirst');
      else if(kind==='book')wrap(K.Store,'saveReviewSession');
      else if(/ぼうけんを えらぶ/.test(label))wrap(K.Sound,'say',text=>text.startsWith('できることを使ってみよう。'));
      else wrap(K.Store,'setPref',(key,value)=>key==='transferSession'&&value&&value.q);
      window.__restoreResultSpies=()=>{undo.forEach(fn=>fn());window.__restoreResultSpies=null;};
    },{kind,role,label});
    const clickOnce=async(page,button,kind,role)=>{
      const text=(await button.textContent()).trim(),before=await learning(page),handle=await button.elementHandle();
      await spy(page,kind,role,text);await button.click();await handle.evaluate(n=>n.click());await settle(page);
      assert.equal(await page.evaluate(()=>window.__resultEffectCalls),1,kind+' '+role+' acts once: '+text);
      assert.deepEqual(await learning(page),before,kind+' '+role+' does not change learning or rewards');
      if(role==='end'){
        assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');assert.equal(await page.evaluate(()=>KazuApp.Store.endedToday()),true);
      }else{
        assert.equal(await page.evaluate(()=>KazuApp.Store.endedToday()),false,kind+' continuation/option does not end the day');
        const destination=await page.evaluate(()=>{const K=KazuApp;return {screen:K.UI.currentName(),saved:K.Store.savedSession(),
          first:K.FirstSteps.active&&{game:K.FirstSteps.active.game.id,level:K.FirstSteps.active.levelIndex},
          book:K.TextbookReview.inspect()&&K.TextbookReview.inspect().run.id};});
        if(/しま/.test(text))assert.equal(destination.screen,'sticker-world');
        else if(/べつの あそび/.test(text)){
          assert.equal(destination.screen,'home');assert.equal(await page.locator('#home .home-more').evaluate(n=>n.open),true);
        }else if(kind==='regular'&&/つぎの レベル/.test(text)){
          assert.equal(destination.screen,'first-steps');assert.deepEqual(destination.first,{game:'count',level:1});
        }else if(kind==='book'&&/つぎの レッスン/.test(text)){
          assert.equal(destination.screen,'review');assert.equal(destination.book,1);
        }else if(kind==='transfer'&&/ぼうけんを えらぶ/.test(text)){
          assert.equal(destination.screen,'transfer');assert.equal(await page.locator('#transfer .transfer-card').count(),6);
        }else if(kind==='regular'||kind==='short'){
          assert.equal(destination.screen,'play');assert.equal(destination.saved.gameId,'count');assert.equal(destination.saved.levelIndex,0);
        }
      }
    };
    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1024,height:768},{width:568,height:320}]){
      for(const kind of Object.keys(screens)){
        const label=kind+' '+viewport.width+'x'+viewport.height,scope=screens[kind];
        const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
        const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(label+': '+e.stack));
        await page.route('https://**',r=>r.abort());
        try{
          await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
          await finish(page,kind);const before=await learning(page);await visibleDock(page,scope,label+' initial');
          if(shots)await page.screenshot({path:path.join(shots,kind+'-'+viewport.width+'x'+viewport.height+'-initial.png'),animations:'disabled'});
          const original=await geometry(page,scope);
          await page.locator(scope).evaluate(n=>n.querySelectorAll('.inner,.reward-sheet,.review-body,.transfer-body').forEach(n=>n.scrollTop=n.scrollHeight));await settle(page);
          const scrolled=await visibleDock(page,scope,label+' scrolled');
          assert.ok(Math.abs(original.dock.y-scrolled.dock.y)<=1,label+' dock stays in place while reading');
          assert.deepEqual(await learning(page),before,label+' viewing does not change learning');
          if(shots)await page.screenshot({path:path.join(shots,kind+'-'+viewport.width+'x'+viewport.height+'-scrolled.png'),animations:'disabled'});
          await clickOnce(page,page.locator(scope+' [data-result-action="end"]'),kind,'end');
          await finish(page,kind);await clickOnce(page,page.locator(scope+' [data-result-action="continue"]'),kind,'continue');
          await finish(page,kind);const more=page.locator(scope+' .result-more');await more.locator(':scope > summary').click();await settle(page);
          await visibleDock(page,scope,label+' more options');assert.equal(await more.evaluate(n=>n.open),true);
          const pattern=kind==='regular'?/^↻\s*もういちど$/:kind==='short'?/べつの あそびを えらぶ/:kind==='transfer'?/ぼうけんを えらぶ/:/しま/;
          const option=more.locator('.result-options button').filter({hasText:pattern}).first();
          await option.scrollIntoViewIfNeeded();await visibleDock(page,scope,label+' option scrolled');await clickOnce(page,option,kind,'option');
          if(kind==='short'){
            await finish(page,kind);const more=page.locator(scope+' .result-more');await more.locator(':scope > summary').click();
            const course=more.locator('details.long-course');assert.equal(await course.count(),1,'long-course entrance remains available');
            await course.locator(':scope > summary').click();const start=course.locator('button');await start.scrollIntoViewIfNeeded();
            await visibleDock(page,scope,label+' long-course option');await clickOnce(page,start,kind,'option');
          }
          passed++;console.log('PASS '+label+': finished course, visible dock, scrolling and one-shot actions keep rewards/counts');
        }catch(error){if(errors.length)console.error('Browser errors:',errors);throw error;}finally{await context.close();}
      }
    }
    assert.deepEqual(errors,[],'no browser exceptions');console.log('PASS '+passed+' result-action scenarios; no browser exceptions');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
