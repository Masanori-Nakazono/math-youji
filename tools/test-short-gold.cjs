#!/usr/bin/env node
'use strict';
// Optional gold goals use real one-question controls and disposable records.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(err?'':data);});});
(async()=>{let browser,passed=0;const errors=[];try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch();
 const url=`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
 const quiet=page=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Session._test.overview(false); K.Session._test.autoAdvance(true);K.Session._test.breaks(false);});
 const reload=async page=>{await page.evaluate(()=>KazuApp.Store.flush());await page.reload({waitUntil:'domcontentloaded'});await quiet(page);};
 const day=(page,n)=>page.evaluate(n=>{window.__goldDay=n;sessionStorage.setItem('gold-test-day',n);},n);
 const start=page=>page.evaluate(()=>KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true));
 const solve=async(page,{help=false,wrong=false,finish=true}={})=>{
  await page.evaluate(()=>{document.querySelectorAll('#play .obj').forEach(n=>n.click());KazuApp.Session._test.flushTimers();});
  if(help)await page.locator('#play .showbtn').click();
  const answer=await page.evaluate(()=>Number(KazuApp.Session._test.item.split(':').at(-1)));
  if(wrong)await page.locator('#play .choices .choice').filter({hasNotText:new RegExp('^'+answer+'$')}).first().click();
  await page.locator('#play .choices .choice').filter({hasText:new RegExp('^'+answer+'$')}).click();
  if(finish)await page.evaluate(()=>KazuApp.Session._test.flushTimers());
 };
 const state=page=>page.evaluate(()=>{const S=KazuApp.Store;return {status:S.shortStatus('count',0),stars:S.stars('count',0),normal:S.hasConfirmed('count:0'),gold:S.hasSticker('count:0:g'),plays:S.plays('count',0),today:S.todayCount()};});
 const ordinary=page=>page.evaluate(()=>{const K=KazuApp,S=K.Store;S.recordLevel('count',0,2,6,8,true);S.addSticker('count:0');S.markIntroduced('count',0);K.Levels.render(K.Games.byId.count);K.UI.show('levels');});
 const fixtureAnswer=(page,bits)=>page.evaluate(bits=>{const S=KazuApp.Store;for(let i=0;i<bits.length;i++){const clean=bits[i]==='1';S.recordShortAnswer('count',0,clean,'gold-fixture-'+Date.now()+'-'+i,S.shortStatus('count',0).phase);S.noteOutcome('count',0,clean,false);}},bits);
 const scenario=async(name,run)=>{const context=await browser.newContext({viewport:{width:1024,height:768},reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});await context.addInitScript(()=>{const D=Date,base=D.parse('2026-10-18T03:00:00Z');window.__goldDay=Number(sessionStorage.getItem('gold-test-day'))||0;window.Date=class extends D{constructor(...a){super(...(a.length?a:[base+window.__goldDay*86400000]));}static now(){return base+window.__goldDay*86400000;}};});const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));await page.route('https://**',r=>r.abort());try{await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.Store.reset());await run(page);passed++;console.log('PASS '+name);}finally{await context.close();}};
 await scenario('first short mastery shows the actual normal and gold rewards and offers optional island placement',async page=>{
  for(let i=0;i<8;i++){await start(page);await solve(page);}await day(page,1);for(let i=0;i<3;i++){await start(page);await solve(page);}
  const s=await state(page);assert.equal(s.gold,true);assert.equal(s.stars,3);assert.equal(s.plays,1);
  assert.deepEqual(await page.locator('#first-finish .short-rewards .pokemon-sticker').evaluateAll(ns=>ns.map(n=>n.dataset.stickerKey)),['count:0','count:0:g']);
  assert.equal(await page.locator('#first-finish .short-rewards .pokemon-name').count(),2);
  await page.locator('#first-finish .result-more > summary').click();
  await page.getByRole('button',{name:'しまに はる',exact:true}).click();assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'sticker-world');
  assert.equal(await page.locator('.world-palette-sticker.selected [data-sticker-key="count:0:g"]').count(),1);
 });
 await scenario('an ordinary confirmed lesson offers a fresh optional gold course without changing its clear',async page=>{
  await ordinary(page);await page.locator('.gold-short-start').click();let s=await state(page);assert.equal(s.status.goldActive,true);assert.equal(s.status.answered,0);assert.equal(s.stars,2);assert.equal(s.normal,true);assert.equal(s.plays,1);
  assert.match(await page.locator('#play .topbar h2').textContent(),/きんへ 1もんずつ/);
  assert.match(await page.evaluate(()=>KazuApp.Store.savedSession().title),/きんへ 1もんずつ/);
  for(let i=0;i<8;i++){if(i)await start(page);await solve(page);}s=await state(page);assert.equal(s.status.waiting,true);assert.equal(s.gold,false);assert.equal(s.stars,2);
  await day(page,1);for(let i=0;i<3;i++){await start(page);assert.match(await page.locator('#play .session-count').textContent(),/たしかめ/);await solve(page);}
  s=await state(page);assert.equal(s.gold,true);assert.equal(s.stars,3);assert.equal(s.plays,1);assert.equal(s.status.goldActive,false);assert.deepEqual(s.status.rewardKeys,['count:0:g']);
  assert.equal(await page.locator('#first-finish .short-rewards [data-sticker-key="count:0:g"]').count(),1);
  assert.equal(await page.locator('#first-finish .short-rewards [data-sticker-key="count:0"]').count(),0);
 });
 await scenario('a supported answer needs eight fresh independent answers before a gold check',async page=>{
  await ordinary(page);await page.locator('.gold-short-start').click();await solve(page,{help:true});
  assert.equal((await state(page)).status.goldStatus.independentRun,0);
  for(let i=0;i<7;i++){await start(page);await solve(page);}assert.equal((await state(page)).status.readyDay,null);
  assert.equal((await state(page)).status.goldStatus.independentRun,7);
  await start(page);await solve(page);const s=await state(page);assert.equal(s.status.right,8);assert.equal(s.status.waiting,true);assert.equal(s.gold,false);assert.equal(s.stars,2);
  await day(page,1);for(let i=0;i<3;i++){await start(page);await solve(page);}assert.equal((await state(page)).gold,true);
 });
 await scenario('a failed gold check retains the owned clear and permits a later-day check',async page=>{
  await ordinary(page);await page.evaluate(()=>KazuApp.FirstSteps.startGold(KazuApp.Games.byId.count,0));await fixtureAnswer(page,'11111111');await day(page,1);
  for(let i=0;i<3;i++){await start(page);await solve(page,{wrong:i===0});}let s=await state(page);assert.equal(s.gold,false);assert.equal(s.normal,true);assert.equal(s.stars,2);assert.equal(s.status.waiting,true);
  await day(page,2);for(let i=0;i<3;i++){await start(page);await solve(page);}s=await state(page);assert.equal(s.gold,true);assert.equal(s.plays,1);
 });
 await scenario('gold progress, question help and a final reward survive reload without duplicate answers',async page=>{
  await ordinary(page);await page.locator('.gold-short-start').click();await page.locator('#play .showbtn').click();const item=await page.evaluate(()=>KazuApp.Session._test.item);await reload(page);await page.evaluate(()=>KazuApp.Session.resume());assert.equal(await page.evaluate(()=>KazuApp.Session._test.item),item);await solve(page);assert.equal((await state(page)).status.right,0);
  await fixtureAnswer(page,'11111111');await day(page,1);await fixtureAnswer(page,'11');await start(page);await solve(page,{finish:false});const before=await state(page);assert.equal(before.gold,true);
  await reload(page);await page.evaluate(()=>KazuApp.Session.resume());const after=await state(page);assert.equal(after.today,before.today);assert.equal(after.plays,before.plays);assert.equal(after.stars,3);assert.deepEqual(after.status.rewardKeys,['count:0:g']);
  assert.equal(await page.locator('#first-finish .short-rewards .pokemon-sticker').count(),1);
  assert.equal(await page.evaluate(()=>KazuApp.Session.resume()),false);
 });
 await scenario('gold support uses the shared rest planner and both lap records stay independent',async page=>{
  await ordinary(page);await page.locator('.gold-short-start').click();for(let i=0;i<3;i++){if(i)await start(page);await solve(page,{help:true});}
  let s=await state(page);assert.equal(s.status.confirmed,true);assert.equal(s.status.resting,true);assert.equal(await page.evaluate(()=>KazuApp.Diagnostic.resting('count',0)),true);assert.equal(await page.evaluate(()=>KazuApp.FirstSteps.shortPlan().kind),'support');
  await page.evaluate(()=>KazuApp.FirstSteps.startPlan(KazuApp.FirstSteps.shortPlan()));await solve(page);assert.notEqual(await page.evaluate(()=>KazuApp.FirstSteps.shortPlan().kind),'support');assert.equal((await state(page)).normal,true);
  const backup=await page.evaluate(()=>{const S=KazuApp.Store,backup=S.exportText();S.unlockRoundTwo();S.selectRound(2);return backup;});assert.equal((await state(page)).status.goldActive,false);
  await page.evaluate(backup=>{KazuApp.Store.importText(backup,'replace');},backup);s=await state(page);assert.equal(s.status.goldActive,true);assert.equal(s.status.answered,3);assert.equal(s.stars,2);
 });
 await scenario('gold rewards and retry controls fit a phone and a tablet',async page=>{
  await ordinary(page);await page.locator('.gold-short-start').click();await fixtureAnswer(page,'11111111');await day(page,1);await fixtureAnswer(page,'11');await start(page);await solve(page);
  await page.locator('#first-finish .result-more > summary').click();
  for(const width of [320,390,1024]){await page.setViewportSize({width,height:width===1024?768:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.getByRole('button',{name:'しまに はる',exact:true}).isVisible(),true);await page.locator('#first-finish').screenshot({path:`/tmp/math-youji-short-gold-${width}.png`,animations:'disabled'});}
 });
 assert.deepEqual(errors,[]);console.log('PASS '+passed+' short-gold browser scenarios; no browser exceptions');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
