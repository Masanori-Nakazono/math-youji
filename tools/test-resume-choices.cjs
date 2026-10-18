#!/usr/bin/env node
'use strict';
// Each profile is disposable. The three unfinished courses are made through
// their real controls, so choosing a checkpoint must retain the child's work.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),html=process.env.RESUME_CHOICES_HTML||path.join(root,'dist/kazu-no-bouken.html');
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(html));});
const shots=process.env.RESUME_CHOICES_SHOTS&&path.resolve(process.env.RESUME_CHOICES_SHOTS);
if(shots)fs.mkdirSync(shots,{recursive:true});
(async()=>{
  let browser,passed=0;const errors=[];
  const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const quiet=page=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
    K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Sound.probeVoice=()=>Promise.resolve(true);
    K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);K.Session._test.autoAdvance(true);});
  const records=page=>page.evaluate(()=>{const S=KazuApp.Store;return {session:S.savedSession(),review:S.reviewSession(),transfer:S.data.transferSession};});
  const evidence=page=>page.evaluate(()=>{const S=KazuApp.Store;return JSON.parse(JSON.stringify({today:S.todayCount(),stars:S.data.stars,
    plays:S.data.plays,stickers:S.data.stickers,pending:S.data.pending,daily:S.data.daily,facts:S.data.facts,
    reviewRecords:S.data.reviewRecords,transferRecords:S.data.transferRecords}));});
  const home=async page=>{await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});await settle(page);};
  const choices=page=>page.evaluate(()=>KazuApp.Session.pendingSummaries());
  const choose=async(page,kind)=>{
    const primary=page.locator('#home .home-primary');
    if(await primary.getAttribute('data-resume-kind')===kind)return primary.click();
    const more=page.locator('#home .resume-more');if(!await more.evaluate(n=>n.open))await more.locator(':scope > summary').click();
    await more.locator('[data-resume-kind="'+kind+'"]').click();
  };
  const expectRestored=async(page,kind)=>{
    await settle(page);
    assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),{session:'play',review:'review',transfer:'transfer'}[kind]);
    if(kind==='session')assert.ok(await page.locator('#play .obj.counted').count()>0,'ordinary draft is restored');
    if(kind==='review')assert.deepEqual(await page.evaluate(()=>KazuApp.TextbookReview.inspect().q.selected),[0],'book selection is restored');
    if(kind==='transfer')assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.q.value),1,'adventure input is restored');
  };
  const pause=async(page,kind)=>{
    if(kind==='session'){
      await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
      await page.locator('#levels .topbar button[aria-label="もどる"]').click();
    }else if(kind==='review')await page.locator('#review .review-pause').click();
    else for(let n=0;n<3;n++)await page.locator('#transfer .topbar button').first().click();
    await settle(page);assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');
  };
  const makeThree=async page=>{
    await page.evaluate(()=>{const K=KazuApp;K.Store.reset();K.Store.markIntroduced('count',0);K.Session.startLevel(K.Games.byId.count,0);});
    await page.locator('#play .obj').first().click();await pause(page,'session');
    await page.evaluate(()=>{window.__resumeTick+=1000;const K=KazuApp;K.Store.setPref('secondRoundReached',true);K.TextbookReview.open(0);});
    await page.locator('#review [data-focus]').first().click();await pause(page,'review');
    await page.evaluate(()=>{window.__resumeTick+=1000;const K=KazuApp;K.Store.setPref('transferReached',true);K.TransferAdventure.open();});
    await page.locator('#transfer [data-mission="0"]').click();await page.locator('#transfer [aria-label="１つ うごかす"]').click();await pause(page,'transfer');
    assert.equal((await choices(page)).length,3);assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),0);
  };
  const unchangedOthers=(before,after,chosen)=>{for(const kind of ['session','review','transfer'])if(kind!==chosen)assert.deepEqual(after[kind],before[kind],chosen+' does not rewrite '+kind);};
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1024,height:768},{width:568,height:320}]){
      const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(()=>{const D=Date,base=D.parse('2026-10-18T03:00:00Z');window.__resumeTick=0;
        window.Date=class extends D{constructor(...a){super(...(a.length?a:[base+window.__resumeTick]));}static now(){return base+window.__resumeTick;}};});
      const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(viewport.width+'px '+e.stack));
      await page.route('https://**',r=>r.abort());
      const check=async(label,run)=>{await run();passed++;console.log('PASS '+viewport.width+'x'+viewport.height+' '+label);};
      try{
        await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});await quiet(page);
        await check('three real checkpoints, reload, explicit choices and intact other records',async()=>{
          await makeThree(page);const original=await records(page),learning=await evidence(page);
          assert.equal(await page.locator('#home .home-primary').getAttribute('data-resume-kind'),'transfer');
          await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await home(page);assert.deepEqual(await records(page),original);
          const more=page.locator('#home .resume-more');await more.locator(':scope > summary').focus();await page.keyboard.press('Enter');
          const geometry=await more.evaluate(node=>({overflow:document.documentElement.scrollWidth>innerWidth,
            buttons:[...node.querySelectorAll('button')].map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}));
          assert.equal(geometry.overflow,false);assert.equal(geometry.buttons.length,2);
          geometry.buttons.forEach(b=>{assert.ok(b.width>=64&&b.height>=64,JSON.stringify(b));assert.match(b.text,/あと 8もん/);});
          if(shots)await page.screenshot({path:path.join(shots,'choices-'+viewport.width+'x'+viewport.height+'.png'),animations:'disabled'});
          for(const kind of ['session','review','transfer']){
            const before=await records(page);await choose(page,kind);await expectRestored(page,kind);
            unchangedOthers(before,await records(page),kind);assert.deepEqual(await evidence(page),learning);
            await page.evaluate(()=>window.__resumeTick+=1000);await pause(page,kind);
          }
        });
        await check('preparation names and resumes the ordinary checkpoint, latest/true compatibility',async()=>{
          await makeThree(page);const before=await records(page),learning=await evidence(page);
          await page.evaluate(()=>KazuApp.Session._test.overview(true));
          await page.locator('#home .home-more > summary').click();await page.locator('#home [data-game-id="count"]').click();
          await page.locator('#levels [data-level-index="0"][data-level-action="play"]').click();
          assert.match(await page.locator('#session-overview .session-previous').textContent(),new RegExp(before.session.title));
          await page.locator('#session-overview').getByRole('button',{name:'まえの つづきから',exact:true}).click();
          await expectRestored(page,'session');unchangedOthers(before,await records(page),'session');assert.deepEqual(await evidence(page),learning);
          await quiet(page);await pause(page,'session');
          await page.evaluate(()=>{window.__resumeTick+=1000;const S=KazuApp.Session;S.resume(S.pendingSummaries().find(c=>c.kind==='transfer'));});
          await pause(page,'transfer');
          await page.evaluate(()=>KazuApp.Session.resume());await expectRestored(page,'transfer');await pause(page,'transfer');
          await page.evaluate(()=>KazuApp.Session.resume(true));await expectRestored(page,'session');await pause(page,'session');
        });
        await check('stale replaced/deleted/other-round choices never select a different course',async()=>{
          await makeThree(page);
          await page.evaluate(()=>{const K=KazuApp;window.__oldChoice=K.Session.pendingSummaries().find(c=>c.kind==='session');
            const s=K.Store.savedSession();s.question.draft.touched=false;K.Store.saveSession(s);});
          assert.equal(await page.evaluate(()=>KazuApp.Session.resume(window.__oldChoice)),false);
          assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');await page.locator('#home .resume-notice').waitFor({state:'visible'});
          const before=await records(page),learning=await evidence(page);
          await page.evaluate(()=>{window.__oldChoice=KazuApp.Session.pendingSummaries().find(c=>c.kind==='transfer');KazuApp.Store.setPref('transferSession',null);});
          await page.locator('#home .home-primary').click();assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');
          assert.equal((await choices(page)).length,2);assert.deepEqual((await records(page)).session,before.session);assert.deepEqual((await records(page)).review,before.review);
          await page.evaluate(()=>{const K=KazuApp;window.__oldChoice=K.Session.pendingSummaries()[0];K.Store.unlockRoundTwo();K.Store.selectRound(2);});
          const second=await records(page);assert.equal(await page.evaluate(()=>KazuApp.Session.resume(window.__oldChoice)),false);
          assert.equal(await page.evaluate(()=>KazuApp.Store.round()),2);assert.deepEqual(await records(page),second);
          await page.evaluate(()=>KazuApp.Store.selectRound(1));assert.deepEqual(await evidence(page),learning);
        });
        await check('ending/day refresh keeps every saved choice optional and old snapshots resumable',async()=>{
          await makeThree(page);
          await page.evaluate(()=>{const K=KazuApp,S=K.Store;const t=JSON.parse(JSON.stringify(S.data.transferSession));delete t.q.workspace;S.setPref('transferSession',t);
            const r=S.reviewSession();delete r.q.workspace;S.saveReviewSession(r);K.Home.endToday();});
          assert.equal(await page.locator('#home .home-more').evaluate(n=>n.open),false);
          assert.equal(await page.locator('#home .resume-more').evaluate(n=>!!n.closest('.home-more-content')),true);
          assert.equal(await page.locator('#home .home-primary').isVisible(),false);
          const old=await records(page);await page.locator('#home .home-more > summary').click();await choose(page,'transfer');await expectRestored(page,'transfer');
          unchangedOthers(old,await records(page),'transfer');await pause(page,'transfer');assert.equal(await page.evaluate(()=>KazuApp.Store.endedToday()),true);
          await page.evaluate(()=>{window.__resumeTick+=86400000;window.dispatchEvent(new Event('focus'));});await settle(page);
          assert.equal(await page.locator('#home .home-primary').isVisible(),true);assert.equal(await page.locator('#home .resume-more').evaluate(n=>!!n.closest('.home-today')),true);
          assert.equal((await choices(page)).length,3);
        });
        if(viewport.width===320)await check('dark theme keeps choice names and changed-checkpoint notice readable',async()=>{
          await makeThree(page);const before=await records(page);
          await page.evaluate(()=>{document.documentElement.dataset.theme='dark';KazuApp.Home.resumeChanged();});
          await page.locator('#home .resume-more > summary').click();
          const contrast=await page.evaluate(()=>{
            const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255)
              .map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
            return [...document.querySelectorAll('#home .resume-choice,#home .resume-more,#home .resume-notice')].map(n=>{
              const s=getComputedStyle(n),a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
          });
          contrast.forEach(r=>assert.ok(r>=4.5,'dark theme text contrast '+r));assert.deepEqual(await records(page),before);
          if(shots)await page.screenshot({path:path.join(shots,'choices-dark-320.png'),animations:'disabled'});
          await page.evaluate(()=>delete document.documentElement.dataset.theme);
        });
        await check('completed ordinary checkpoint opens results once without regrading',async()=>{
          await makeThree(page);const before=await records(page);
          await page.evaluate(()=>{const K=KazuApp;K.Session.resume(true);K.Session._test.autoAdvance(true);
            for(let i=0;i<8;i++){
              if(i===7)K.Session._test.autoAdvance(false);
              document.querySelectorAll('#play .obj:not(.counted)').forEach(n=>n.click());K.Session._test.flushTimers(600);
              const answer=Number(K.Session._test.item.split(':').at(-1));
              [...document.querySelectorAll('#play .choices .choice')].find(n=>Number(n.textContent)===answer).click();K.Session._test.flushTimers(600);
            }
            K.Home.render();K.UI.show('home');});
          const completed=await records(page);assert.equal(completed.session.index,completed.session.plan.length);
          assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),8);const handle=await page.locator('#home [data-resume-kind="session"]').elementHandle();
          await choose(page,'session');assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'result');
          const learning=await evidence(page);await handle.evaluate(n=>n.click());assert.deepEqual(await evidence(page),learning);
          assert.equal(await page.evaluate(()=>KazuApp.Store.plays('count',0)),1);assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),8);
          const after=await records(page);assert.equal(after.session,null);unchangedOthers(before,after,'session');
          assert.equal(await page.evaluate(()=>KazuApp.Session.resume(true)),false);assert.deepEqual(await evidence(page),learning);
        });
        await check('completed book/adventure checkpoints retain counts and award each result once',async()=>{
          for(const kind of ['review','transfer']){
            await makeThree(page);const before=await records(page);
            await page.evaluate(kind=>{
              const K=KazuApp;window.__resumeTick+=10000;
              K.Session.resume(K.Session.pendingSummaries().find(c=>c.kind===kind));
              const click=selector=>{const node=document.querySelector(selector);if(!node)throw Error('missing '+selector);node.click();};
              if(kind==='review'){
                for(let i=0;i<8;i++){
                  const {q}=K.TextbookReview.inspect();
                  if(q.type==='match')for(let j=0;j<q.a;j++){click('#review [data-focus="target'+j+'"]');click('#review [data-focus="pair'+j+'"]');}
                  else{q.selected.slice().forEach(j=>click('#review [data-focus="object'+j+'"]'));q.answer.forEach(j=>click('#review [data-focus="object'+j+'"]'));}
                  click('#review .review-check');if(i<7)click('#review .review-next');
                }
              }else{
                const random=Math.random;Math.random=()=>.5;
                try{for(let i=0;i<5;i++){
                  const q=K.Store.data.transferSession.q;for(let n=q.value;n<q.b;n++)click('#transfer [aria-label="１つ うごかす"]');
                  click('#transfer .transfer-check');if(i<4)click('#transfer .transfer-next');
                }}finally{Math.random=random;}
              }
            },kind);
            await pause(page,kind);const learning=await evidence(page);
            assert.equal((await choices(page)).find(c=>c.kind===kind).remaining,0);
            const handle=await page.locator('#home [data-resume-kind="'+kind+'"]').elementHandle();
            await choose(page,kind);await settle(page);
            if(kind==='review'){
              assert.equal(await page.evaluate(()=>KazuApp.TextbookReview.inspect().q.done),true);
              assert.deepEqual(await evidence(page),learning,'book final answer is not graded again');
              await page.locator('#review .review-next').click();await page.locator('#review .review-result').waitFor({state:'visible'});
              assert.equal(await page.evaluate(()=>KazuApp.Store.data.reviewRecords['r2:0'].runs),1);
            }else await page.locator('#transfer .transfer-result').waitFor({state:'visible'});
            assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),kind==='review'?8:5);
            const after=await evidence(page);await handle.evaluate(n=>n.click());assert.deepEqual(await evidence(page),after,'old continuation cannot award twice');
            const snapshots=await records(page);assert.equal(snapshots[kind],null);unchangedOthers(before,snapshots,kind);
          }
        });
      }finally{await context.close();}
    }
    assert.deepEqual(errors,[],'no browser exceptions');console.log('PASS '+passed+' resume-choice scenarios; no browser exceptions');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
