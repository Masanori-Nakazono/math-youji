#!/usr/bin/env node
'use strict';
// Isolated Book workspace checks. Set REVIEW_WORKSPACE_HTML for either distribution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const css=['styles.css','sticker-world.css','mission-resume.css','progress-album.css','result-actions.css','resume-choices.css','review-workspace.css'].map(f=>read('src/'+f)).join('\n');
const js=fs.readdirSync(path.join(root,'src/js')).filter(f=>f.endsWith('.js')).sort().map(f=>read('src/js/'+f)).join('\n');
const html='<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'+read('src/body.html')+'<script>(function(){'+js.replace(/<\/script>/g,'<\\/script>')+'})();</script></body></html>';
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(process.env.REVIEW_WORKSPACE_HTML?fs.readFileSync(process.env.REVIEW_WORKSPACE_HTML):html);});
const sizes=[{width:320,height:568},{width:390,height:844},{width:1024,height:768},{width:844,height:390},{width:568,height:320}];
(async()=>{
  let browser;const errors=[];let passes=0;
  try{
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'}),page=await context.newPage();page.setDefaultTimeout(8000);
    const url='http://127.0.0.1:'+server.address().port;
    const attach=async p=>{p.on('pageerror',e=>errors.push(e.message));await p.route('https://**',r=>r.abort());};await attach(page);
    const quiet=async p=>p.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=()=>{};});
    const settle=async p=>p.evaluate(()=>{document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).forEach(a=>a.finish());return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);
    const start=async(id,p=page)=>{await p.evaluate(id=>{const K=KazuApp,S=K.Store;S.reset();S.setPref('secondRoundReached',true);for(let i=0;i<20;i++)S.addSticker('r2:'+i);const old=Math.random;Math.random=()=>.5;try{K.TextbookReview.open(id);}finally{Math.random=old;}},id);await settle(p);};
    const state=async(p=page)=>p.evaluate(()=>({visit:JSON.parse(JSON.stringify(KazuApp.TextbookReview.inspect())),saved:KazuApp.Store.reviewSession(),count:KazuApp.Store.todayCount(),screen:KazuApp.UI.currentName(),records:JSON.stringify(KazuApp.Store.data.reviewRecords)}));
    const click=async(sel,p=page)=>p.evaluate(sel=>{const b=document.querySelector('#review '+sel);if(!b)throw Error('Missing '+sel);b.click();},sel);
    const fill=async(p=page,wrong=false)=>p.evaluate(wrong=>{const R=KazuApp.TextbookReview,q=R.inspect().q,click=s=>document.querySelector('#review '+s).click();if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){click('[data-focus="field0"]');click('[data-number="'+q.a+'"]');click('[data-number="'+q.b+'"]');click('[data-number="'+(wrong?(q.answer+1)%11:q.answer)+'"]');click('[aria-label="'+(q.expectedOp==='＋'?'たす':'ひく')+'"]');}else click('[data-number="'+(wrong?(q.answer+1)%11:q.answer)+'"]');},wrong);
    const point=async locator=>{await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();return{x:box.x+box.width/2,y:box.y+box.height/2};};
    const fit=async(p=page)=>p.evaluate(()=>{const pane=document.querySelector('.review-body').getBoundingClientRect(),nodes=[...document.querySelectorAll('.review-field,.review-operator,.review-number')];return{visible:nodes.every(n=>{const r=n.getBoundingClientRect();return r.top>=pane.top-1&&r.bottom<=pane.bottom+1&&r.left>=0&&r.right<=innerWidth;}),keys:[...document.querySelectorAll('.review-number')].every(n=>{const r=n.getBoundingClientRect();return r.width>=63.9&&r.height>=63.9;}),overflow:document.documentElement.scrollWidth>innerWidth+1||document.querySelector('.review-body').scrollWidth>document.querySelector('.review-body').clientWidth+1};});
    const visibleStatus=async()=>assert.equal(await page.locator('.review-work-status').evaluate(n=>{const r=n.getBoundingClientRect(),button=n.closest('button').getBoundingClientRect(),overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;return r.top>=button.top&&r.bottom<=button.bottom&&r.left>=button.left&&r.right<=button.right&&button.bottom<=innerHeight&&r.width>0&&[...document.querySelectorAll('.review-field,.review-operator,.review-number')].every(key=>!overlap(r,key.getBoundingClientRect()));}),true,'feedback is visible inside the stable action and does not cover fields or keys');
    const passed=s=>{passes++;console.log('PASS '+s);};
    if(process.env.REVIEW_WORKSPACE_SHOTS)fs.mkdirSync(process.env.REVIEW_WORKSPACE_SHOTS,{recursive:true});
    for(const size of sizes){
      await page.setViewportSize(size);const label=size.width+'×'+size.height;
      await start(12);let s=await state();const a=s.visit.q.a;
      await page.locator('[data-number="'+a+'"]').dblclick({delay:80});await settle(page);s=await state();assert.deepEqual(s.visit.q.values,[a,null,null],label+' double gesture fills only one field');assert.equal(s.saved.q.active,1);
      assert.deepEqual(await fit(),{visible:true,keys:true,overflow:false},label+' equation and 64px keys fit together');
      const b=(a+1)%11;await page.locator('[data-number="'+b+'"]').click();assert.deepEqual((await state()).visit.q.values,[a,b,null],label+' a different fast key remains usable');
      await page.locator('[data-focus="field1"]').click();await page.locator('[data-number="'+a+'"]').click();assert.equal((await state()).visit.q.values[1],a,label+' explicit field switching allows the same number');
      if(process.env.REVIEW_WORKSPACE_SHOTS)await page.screenshot({path:path.join(process.env.REVIEW_WORKSPACE_SHOTS,'review-'+label+'.png')});
      passed(label+' one mouse gesture fills one field; distinct inputs and equation/key visibility remain usable');

      await start(12);await fill();const toolbar=await page.locator('.review-work-actions').boundingBox(),checkPoint=await point(page.locator('.review-check'));
      const oldCheck=await page.locator('.review-check').elementHandle();await page.mouse.dblclick(checkPoint.x,checkPoint.y,{delay:80});await settle(page);s=await state();assert.equal(s.visit.run.step,0);assert.equal(s.visit.q.done,true);assert.equal(s.count,1);assert.equal(s.screen,'review');
      await visibleStatus();
      if(process.env.REVIEW_WORKSPACE_SHOTS)await page.screenshot({path:path.join(process.env.REVIEW_WORKSPACE_SHOTS,'review-correct-'+label+'.png')});
      assert.deepEqual(await page.locator('.review-work-actions').boundingBox(),toolbar,label+' toolbar stays in place after correctness');
      await oldCheck.evaluate(n=>n.click());assert.equal((await state()).count,1,'detached check cannot grade again');
      const oldNext=await page.locator('.review-next').elementHandle();await click('.review-next');await oldNext.evaluate(n=>{n.click();n.click();});s=await state();assert.equal(s.visit.run.step,1);assert.equal(s.count,1,'detached Next cannot skip a question');
      await start(12);await fill(page,true);await page.locator('.review-check').dblclick({delay:80});s=await state();assert.equal(s.visit.q.wrongAttempts,1);assert.equal(s.visit.q.supported,false);assert.equal(await page.locator('.review-hint[open]').count(),0);
      await visibleStatus();
      if(process.env.REVIEW_WORKSPACE_SHOTS)await page.screenshot({path:path.join(process.env.REVIEW_WORKSPACE_SHOTS,'review-wrong-'+label+'.png')});
      await page.locator('.review-check').click();s=await state();assert.equal(s.visit.q.wrongAttempts,2,'a separate mouse activation remains an actual second try');assert.equal(s.visit.q.supported,true);assert.equal(await page.locator('.review-hint[open]').count(),1,'two separate tries still offer support');
      passed(label+' Check cannot become Next/Rest or two errors; detached controls cannot change another rendering');

      await start(12);await click('.review-check');s=await state();assert.match(s.visit.q.message,/さいしょの かず/);assert.equal(await page.locator('[data-focus="field0"]').evaluate(n=>document.activeElement===n),true);assert.equal(s.visit.q.wrongAttempts,0);
      await visibleStatus();
      if(process.env.REVIEW_WORKSPACE_SHOTS)await page.screenshot({path:path.join(process.env.REVIEW_WORKSPACE_SHOTS,'review-missing-'+label+'.png')});
      await fill();await page.evaluate(()=>{const q=KazuApp.TextbookReview.inspect().q;q.op=null;document.querySelector('.review-check').click();});s=await state();assert.match(s.visit.q.message,/＋か −/);assert.equal(await page.locator('[data-focus="op＋"]').evaluate(n=>document.activeElement===n),true);assert.deepEqual(await fit(),{visible:true,keys:true,overflow:false});
      await click('[aria-label="たす"]');await click('.review-check');assert.equal((await state()).visit.q.done,true);
      passed(label+' missing field/operator guidance focuses the needed control without a wrong answer');

      await start(12);await page.evaluate(()=>[...document.querySelectorAll('#review button')].find(b=>b.textContent==='👀 ヒント').click());await click('.review-try');await click('[data-number="3"]');
      const before=await state(),view=await page.evaluate(()=>{const body=document.querySelector('.review-body');return{scroll:body.scrollTop,height:body.clientHeight,scrollHeight:body.scrollHeight,max:body.scrollHeight-body.clientHeight,focus:document.activeElement.dataset.focus};});
      await click('.review-pause');assert.equal((await state()).screen,'home');await page.reload({waitUntil:'domcontentloaded'});await quiet(page);assert.equal(await page.evaluate(()=>KazuApp.TextbookReview.resume()),true);await settle(page);s=await state();
      assert.deepEqual(s.visit.q.values,before.visit.q.values);assert.equal(s.visit.q.supported,true);assert.equal(await page.locator('.review-hint[open]').count(),0);assert.equal(s.count,before.count);assert.equal(s.records,before.records);
      const afterView=await page.evaluate(()=>{const body=document.querySelector('.review-body');return{scroll:body.scrollTop,height:body.clientHeight,scrollHeight:body.scrollHeight,max:body.scrollHeight-body.clientHeight,focus:document.activeElement.dataset.focus};});
      const expectedScroll=Math.min(view.scroll,afterView.max);if(afterView.max<view.scroll)console.log('INFO valid scroll clamp '+label+' '+JSON.stringify({before:view,after:afterView,saved:s.saved.q.workspace}));
      assert.ok(Math.abs(afterView.scroll-expectedScroll)<=1,'working scroll survives rest: '+JSON.stringify({before:view,after:afterView,saved:s.saved.q.workspace}));assert.equal(afterView.focus,view.focus,'working focus survives rest');assert.deepEqual(await fit(),{visible:true,keys:true,overflow:false},'restored work remains visible');
      const closedBackup=await page.evaluate(()=>KazuApp.Store.exportText());await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.TextbookReview.resume());await settle(page);assert.equal(await page.locator('.review-hint[open]').count(),0,'direct reload keeps closed help closed');
      await page.evaluate(()=>[...document.querySelectorAll('#review button')].find(b=>b.textContent==='👀 ヒント').click());await page.evaluate(()=>KazuApp.Store.flush());await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.TextbookReview.resume());assert.equal(await page.locator('.review-hint[open]').count(),1,'open help stays open');await click('.review-try');
      await click('.topbar button');assert.equal((await state()).screen,'review');assert.equal(await page.locator('.review-menu-intro').count(),1);assert.ok((await state()).saved,'top Back saves the lesson and opens the contents');
      passed(label+' closed/open help, answer and working position survive rest/reload; Back returns to contents');

      const touchContext=await browser.newContext({viewport:size,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'}),touchPage=await touchContext.newPage();await attach(touchPage);await touchPage.goto(url,{waitUntil:'domcontentloaded'});await quiet(touchPage);await start(12,touchPage);
      const touchNumber=await point(touchPage.locator('[data-number="2"]'));await touchPage.touchscreen.tap(touchNumber.x,touchNumber.y);await touchPage.touchscreen.tap(touchNumber.x,touchNumber.y);assert.deepEqual((await state(touchPage)).visit.q.values,[2,null,null],'rapid real touchscreen taps do not spill into next field');
      await touchPage.locator('[data-number="3"]').tap();assert.deepEqual((await state(touchPage)).visit.q.values,[2,3,null],'a different fast touch key is accepted');
      await touchPage.locator('[data-focus="field1"]').tap();await touchPage.locator('[data-number="2"]').tap();assert.equal((await state(touchPage)).visit.q.values[1],2,'explicit touch field switch permits repeated value');
      await fill(touchPage);const touchCheck=await point(touchPage.locator('.review-check'));await touchPage.touchscreen.tap(touchCheck.x,touchCheck.y);await touchPage.touchscreen.tap(touchCheck.x,touchCheck.y);s=await state(touchPage);assert.equal(s.visit.q.done,true);assert.equal(s.visit.run.step,0);assert.equal(s.count,1);
      await start(12,touchPage);await fill(touchPage,true);const wrongTouch=await point(touchPage.locator('.review-check'));await touchPage.touchscreen.tap(wrongTouch.x,wrongTouch.y);await touchPage.touchscreen.tap(wrongTouch.x,wrongTouch.y);s=await state(touchPage);assert.equal(s.visit.q.wrongAttempts,1);assert.equal(s.visit.q.supported,false);await touchContext.close();
      passed(label+' real touchscreen repeated taps cannot cross keys or correctness; explicit field selection is accepted');

      if(size.width===320){
        const backup=JSON.parse(closedBackup),load=async value=>{assert.equal(await page.evaluate(value=>KazuApp.Store.importText(JSON.stringify(value),'replace').ok,value),true);await page.evaluate(()=>KazuApp.TextbookReview.resume());await settle(page);return state();};
        delete backup.data.reviewSession.q.workspace;s=await load(backup);assert.equal(s.visit.q.supported,true);assert.equal(await page.locator('.review-hint[open]').count(),0,'old backups default to a closed help entrance');
        for(const workspace of [null,[],{v:2,scrollTop:0,focusKey:null,supportOpen:false},{v:1,scrollTop:-1,focusKey:null,supportOpen:true},{v:1,scrollTop:1e20,focusKey:null,supportOpen:true},{v:1,scrollTop:0,focusKey:{},supportOpen:true},{v:1,scrollTop:0,focusKey:'number999',supportOpen:true},{v:1,scrollTop:0,focusKey:null,supportOpen:'yes'}]){const invalid=JSON.parse(JSON.stringify(backup));invalid.data.reviewSession.q.workspace=workspace;s=await load(invalid);assert.deepEqual(s.visit.q.values,backup.data.reviewSession.q.values);assert.equal(s.visit.q.supported,true);assert.equal(s.visit.q.wrongAttempts,0);assert.equal(s.count,0);}
        const forged=JSON.parse(JSON.stringify(backup));Object.assign(forged.data.reviewSession.q,{supported:false,showHint:false,supportStage:0,workspace:{v:1,scrollTop:0,focusKey:'object9',supportOpen:true}});s=await load(forged);assert.equal(s.visit.q.supported,false);assert.equal(await page.locator('.review-hint').count(),0,'optional UI does not reveal unsupported answer assistance');assert.equal(await page.locator('#review h2').evaluate(n=>document.activeElement===n),true,'unavailable restored focus falls back to the visible heading');
        await fill();await click('.review-check');assert.deepEqual((await state()).visit.run.outcomes,['independent']);
        passed('old backups and malformed UI keep answers/grading; forged UI cannot expose assistance as independent');
      }
    }
    await page.setViewportSize(sizes[2]);
    await start(12);await fill();await page.locator('.review-check').focus();await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');assert.equal((await state()).visit.run.step,0,'held Enter cannot advance after checking');await page.keyboard.press('Enter');assert.equal((await state()).visit.run.step,1,'a separate keyboard press can advance');
    await start(12);await fill();await click('.review-check');await click('.review-pause');await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.TextbookReview.resume());await settle(page);assert.equal(await page.locator('.review-next').evaluate(n=>document.activeElement===n),true,'an answered resume focuses Next');assert.equal((await state()).count,1);passed('held versus separate keyboard activation and answered-resume focus remain correct');
    const types=await page.evaluate(()=>{
      const K=KazuApp,S=K.Store,R=K.TextbookReview,types=new Set(),click=s=>document.querySelector('#review '+s).click();
      S.reset();S.setPref('secondRoundReached',true);for(let i=0;i<20;i++)S.addSticker('r2:'+i);
      for(let id=0;id<20;id++){
        S.clearReviewSession();R.open(id);
        for(let step=0;step<8;step++){
          const q=R.inspect().q;types.add(q.type);
          if(q.type==='match'){for(let i=0;i<q.a;i++){click('[data-focus="target'+i+'"]');click('[data-focus="pair'+i+'"]');}}
          else if(q.type==='group'||q.type==='sumCards')q.answer.forEach(i=>click('[data-focus="'+(q.type==='group'?'object':'card')+i+'"]'));
          else if(q.type==='splitSmall'||q.type==='splitLarge')for(let i=0;i<q.b;i++)click('[aria-label="ひだりへ １つ"]');
          else if(q.cardinality)for(let i=0;i<q.n;i++)click('[data-focus="order'+i+'"]');
          else if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))click('[data-focus="'+(q.type==='subStory'?'story':'order')+q.answer+'"]');
          else if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){click('[data-number="'+q.a+'"]');click('[data-number="'+q.b+'"]');click('[data-number="'+q.answer+'"]');click('[aria-label="'+(q.expectedOp==='＋'?'たす':'ひく')+'"]');}
          else click('[data-number="'+q.answer+'"]');
          click('.review-check');if(!R.inspect().q.done)throw Error('Not accepted '+q.type);click('.review-next');
        }
      }
      if(S.todayCount()!==160)throw Error('Each answer counted once');return[...types];
    });assert.equal(types.length,22);passed('all 20 lessons / 22 question types retain programmatic answering and count each of 160 answers once');
    await page.emulateMedia({colorScheme:'dark'});await start(12);await click('[data-number="2"]');assert.deepEqual(await fit(),{visible:true,keys:true,overflow:false});
    const colors=await page.evaluate(()=>({field:getComputedStyle(document.querySelector('.review-field')).color,body:getComputedStyle(document.querySelector('.review-body')).color}));assert.equal(colors.field,colors.body);if(process.env.REVIEW_WORKSPACE_SHOTS)await page.screenshot({path:path.join(process.env.REVIEW_WORKSPACE_SHOTS,'review-dark.png')});passed('dark theme retains token colors and visible equation/keys');
    assert.deepEqual(errors,[]);passed('browser exceptions: 0');console.log('Review workspace: '+passes+' checks passed');await context.close();
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
