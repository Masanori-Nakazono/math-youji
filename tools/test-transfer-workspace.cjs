#!/usr/bin/env node
'use strict';
// Keep transfer constructions, help and their working position stable in disposable profiles.
// Run against current sources, or pass TRANSFER_WORKSPACE_HTML for either built HTML.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const scripts = fs.readdirSync(path.join(root, 'src/js')).filter(f => f.endsWith('.js')).sort()
  .map(f => read('src/js/' + f)).join('\n');
const source = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>[hidden]{display:none!important}html,body{margin:0}</style><style>' + read('src/styles.css')
  + '</style></head><body>' + read('src/body.html') + '<script>(function(){\n'
  + scripts.replace(/<\/script>/g, '<\\/script>') + '\n})();</script></body></html>';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(process.env.TRANSFER_WORKSPACE_HTML ? fs.readFileSync(process.env.TRANSFER_WORKSPACE_HTML) : source);
});
const viewports=[{width:320,height:568},{width:390,height:844},{width:1024,height:768},{width:844,height:390}];
(async()=>{
  let browser;const errors=[];
  try{
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
    const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
    const quiet=()=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await quiet();
    const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const start=async id=>{await page.evaluate(id=>{const K=KazuApp;K.Store.reset();K.Store.setPref('transferReached',true);const random=Math.random;Math.random=()=>.5;try{K.TransferAdventure.open();document.querySelector('#transfer [data-mission="'+id+'"]').click();}finally{Math.random=random;}},id);await settle();};
    const state=()=>page.evaluate(()=>({saved:JSON.parse(JSON.stringify(KazuApp.Store.data.transferSession)),count:KazuApp.Store.todayCount(),records:JSON.stringify(KazuApp.Store.data.transferRecords),facts:JSON.stringify(KazuApp.Store.data.facts),stars:JSON.stringify(KazuApp.Store.data.stars)}));
    const plus=()=>page.locator('#transfer [aria-label="１つ うごかす"]'),minus=()=>page.locator('#transfer [aria-label="１つ もどす"]');
    const check=()=>page.locator('#transfer .transfer-check'),hint=()=>page.getByRole('button',{name:'👀 ヒント',exact:true});
    const hintText=()=>page.locator('#transfer .transfer-feedback').textContent();
    const position=locator=>locator.evaluate(node=>{const r=node.getBoundingClientRect(),pane=document.querySelector('#transfer .transfer-body'),p=pane.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scroll:pane.scrollTop,top:p.top,bottom:p.bottom,focus:document.activeElement===node};});
    const prepareTap=async locator=>{await locator.scrollIntoViewIfNeeded();await settle();const r=await position(locator);assert.ok(r.y>=r.top-1&&r.y+r.height<=r.bottom+1,'control is completely visible before input');return {x:r.x+r.width/2,y:r.y+r.height/2,top:r.y};};
    const workView=()=>page.evaluate(()=>{const b=document.querySelector('#transfer .transfer-body'),a=document.activeElement;return {scroll:b.scrollTop,focus:b.contains(a)?a.getAttribute('aria-label')||a.textContent:null};});
    const assertWorkingView=async before=>{const after=await workView();if(before.focus)assert.equal(after.focus,before.focus,'the working control regains focus');if(before.scroll>1)assert.ok(after.scroll>1,'a scrolled working area does not restart at the top');};
    const assertUnderFinger=async(locator,point)=>assert.equal(await locator.evaluate((node,p)=>{const hit=document.elementFromPoint(p.x,p.y);return hit===node||node.contains(hit);},point),true,'the same control still receives the next tap');
    const directResume=async()=>{const before=await state(),view=await workView();await page.reload({waitUntil:'domcontentloaded'});await quiet();assert.equal(await page.evaluate(()=>KazuApp.TransferAdventure.resume()),true);await settle();const after=await state();
      for(const key of ['count','facts','stars','records'])assert.deepEqual(after[key],before[key],key+' is unchanged by restoring');
      for(const key of ['value','left','phase','previous','supported','mistakes','subject'])assert.deepEqual(after.saved.q[key],before.saved.q[key],key+' survives reload');await assertWorkingView(view);return after;};
    const rest=async()=>{const before=await state(),view=await workView();await page.locator('#transfer .topbar button').first().click();await page.locator('#transfer .topbar button').first().click();await page.reload({waitUntil:'domcontentloaded'});await quiet();await page.evaluate(()=>KazuApp.TransferAdventure.resume());await settle();const after=await state();
      assert.equal(after.count,before.count);for(const key of ['value','left','phase','previous','supported','mistakes','subject'])assert.deepEqual(after.saved.q[key],before.saved.q[key],key+' survives rest');await assertWorkingView(view);return after;};
    const verifyHelp=async pattern=>{assert.match(await hintText(),pattern);assert.equal(await page.locator('#transfer .transfer-example').count(),1,'example remains available');assert.equal((await state()).saved.q.supported,true);};
    const passed=name=>console.log('PASS '+name);

    for(const viewport of viewports){
      await page.setViewportSize(viewport);
      for(const id of [4,5]){
        await start(id);const anchor=await prepareTap(plus());
        for(let n=1;n<=5;n++){
          await page.mouse.click(anchor.x,anchor.y);await settle();assert.equal((await state()).saved.q.value,n,'consecutive physical taps reach the same plus control');const p=await position(plus());assert.ok(Math.abs(p.y-anchor.top)<=2,'plus remains under the finger while objects wrap');
        }
        const back=await prepareTap(minus());for(let n=4;n>=2;n--){await page.mouse.click(back.x,back.y);await settle();assert.equal((await state()).saved.q.value,n);assert.ok(Math.abs((await position(minus())).y-back.top)<=2,'minus remains under the finger');}
        assert.equal((await state()).count,0,'draft construction is not graded');
        passed(viewport.width+'×'+viewport.height+' '+(id===4?'add':'subtract')+' story supports uninterrupted plus/minus taps and a stable working position');
      }

      await start(0);await hint().click();await verifyHelp(/はじめの 4 から、8/);await plus().click();await verifyHelp(/はじめの 4 から、8/);
      await rest();assert.equal((await state()).saved.q.value,1);await verifyHelp(/はじめの 4 から、8/);
      await directResume();await verifyHelp(/はじめの 4 から、8/);await page.locator('#transfer .transfer-example').click();assert.equal((await state()).saved.q.value,4);assert.equal((await state()).count,0,'restored example only constructs the answer');
      const oldCheck=await check().elementHandle();await oldCheck.evaluate(node=>{node.click();node.click();});assert.equal((await state()).count,1,'repeated check is idempotent');assert.deepEqual((await state()).saved.run.results,['supported']);
      const oldNext=await page.locator('#transfer .transfer-next').elementHandle();await oldNext.evaluate(node=>{node.click();node.click();});await settle();assert.equal((await state()).saved.run.step,1,'a detached Next cannot skip another question');assert.equal((await state()).count,1);
      passed(viewport.width+'×'+viewport.height+' fill hint and example survive input/rest/reload; checking and advancing remain idempotent');

      await start(4);await hint().click();await verifyHelp(/しきの はじめ/);for(let n=0;n<4;n++)await plus().click();await check().click();await settle();let s=await state();assert.equal(s.saved.q.phase,1);assert.equal(s.saved.q.value,0);assert.equal(s.count,0);await verifyHelp(/＋は あそびにくる かず/);assert.doesNotMatch(await hintText(),/しきの はじめ/);
      await plus().click();await verifyHelp(/＋は あそびにくる かず/);await rest();await verifyHelp(/＋は あそびにくる かず/);assert.equal((await state()).saved.q.value,1);
      await page.locator('#transfer .transfer-example').click();assert.equal((await state()).saved.q.value,4);await check().click();assert.equal((await state()).count,1);assert.deepEqual((await state()).saved.run.results,['supported']);
      passed(viewport.width+'×'+viewport.height+' story phase transition updates visible help, retains support and resumes the current phase');

      await start(2);await hint().click();await verifyHelp(/おさらの １つ/);const source=()=>page.locator('#transfer .transfer-plate').first().locator('.transfer-piece');
      const target=await prepareTap(source().first());for(let n=7;n>=5;n--){await page.mouse.click(target.x,target.y);await settle();assert.equal((await state()).saved.q.left,n);await assertUnderFinger(source().first(),target);}
      await rest();assert.equal((await state()).saved.q.left,5);await verifyHelp(/おさらの １つ/);await check().click();await settle();assert.equal((await state()).saved.q.previous,5);assert.equal((await state()).count,0);await verifyHelp(/さっきと ちがう/);
      await source().first().click();await verifyHelp(/さっきと ちがう/);await directResume();assert.equal((await state()).saved.q.left,4);assert.equal((await state()).saved.q.previous,5);await verifyHelp(/さっきと ちがう/);await check().click();assert.equal((await state()).count,1);assert.deepEqual((await state()).saved.run.results,['supported']);
      passed(viewport.width+'×'+viewport.height+' split construction, second way, current help and exact plate counts survive rest/reload');
    }

    await start(0);await hint().click();await plus().click();await plus().click();
    const legacy=await page.evaluate(()=>{const backup=JSON.parse(KazuApp.Store.exportText());delete backup.data.transferSession.q.workspace;return backup;});
    const load=async backup=>{const result=await page.evaluate(backup=>{KazuApp.TransferAdventure.open();return KazuApp.Store.importText(JSON.stringify(backup),'replace');},backup);assert.equal(result.ok,true);await page.evaluate(()=>KazuApp.TransferAdventure.resume());await settle();return state();};
    let restored=await load(legacy);assert.equal(restored.saved.q.value,2);assert.equal(restored.saved.q.supported,true);assert.equal(restored.count,0);await verifyHelp(/はじめの 4 から、8/);
    passed('old backups without workspace remain compatible and keep input/support grading');
    for(const workspace of [null,[],{v:2,scrollTop:0,focusKey:null,hintVisible:true},{v:1,scrollTop:-1,focusKey:null,hintVisible:true},{v:1,scrollTop:1e20,focusKey:'increase',hintVisible:true},{v:1,scrollTop:0,focusKey:{nested:'invalid'},hintVisible:true},{v:1,scrollTop:0,focusKey:'increase',hintVisible:'yes'}]){
      const backup=JSON.parse(JSON.stringify(legacy));backup.data.transferSession.q.workspace=workspace;restored=await load(backup);assert.equal(restored.saved.q.value,2);assert.equal(restored.saved.q.supported,true);assert.equal(restored.saved.q.mistakes,0);assert.equal(restored.count,0);await verifyHelp(/はじめの 4 から、8/);
    }
    passed('invalid optional workspace values are discarded without dropping construction or grading evidence');
    const forged=JSON.parse(JSON.stringify(legacy));forged.data.transferSession.q.supported=false;forged.data.transferSession.q.workspace={v:1,scrollTop:0,focusKey:null,hintVisible:true};restored=await load(forged);assert.equal(restored.saved.q.supported,false);assert.equal(await page.locator('#transfer .transfer-example').count(),0,'optional UI data cannot expose help while retaining independent grading');
    passed('optional UI state cannot show answer support without an existing supported-answer record');
    assert.deepEqual(errors,[]);passed('browser exceptions: 0');await context.close();
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
