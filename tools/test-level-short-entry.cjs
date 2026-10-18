#!/usr/bin/env node
'use strict';
// Course choices use disposable histories and the real level/answer controls.
// Historical state fixtures use the same store APIs as completed short visits.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const html=process.env.LEVEL_SHORT_HTML||path.join(root,'dist/kazu-no-bouken.html');
const shots=process.env.LEVEL_SHORT_SHOTS&&path.resolve(process.env.LEVEL_SHORT_SHOTS);
if(shots)fs.mkdirSync(shots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(html));});
(async()=>{
 let browser,passed=0;const errors=[];
 const settle=page=>page.evaluate(()=>{document.getAnimations().filter(a=>a.effect&&Number.isFinite(a.effect.getTiming().iterations)).forEach(a=>a.finish());return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
 const quiet=page=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Sound.probeVoice=()=>Promise.resolve(true);K.Session._test.overview(false);K.Session._test.breaks(false);K.Session._test.autoAdvance(true);});
 const state=page=>page.evaluate(()=>{const S=KazuApp.Store;return {status:S.shortStatus('count',0),today:S.todayCount(),stars:S.stars('count',0),plays:S.plays('count',0),saved:S.savedSession(),round:S.round()};});
 const primary=page=>page.locator('#levels .levelcard[data-level-index="0"]');
 const name=page=>page.evaluate(()=>KazuApp.UI.currentName());
 const levels=async page=>{await page.evaluate(()=>{KazuApp.Levels.render(KazuApp.Games.byId.count);KazuApp.UI.show('levels');});await settle(page);};
 const fixture=async(page,bits,day=0,gold=false)=>{
  await page.evaluate(({bits,day,gold})=>{const S=KazuApp.Store;S.reset();window.__levelDay=0;sessionStorage.setItem('level-day','0');S.markIntroduced('count',0);
   if(gold){S.recordLevel('count',0,2,6,8,true);S.addSticker('count:0');S.startShortGold('count',0);}
   for(let i=0;i<bits.length;i++)S.recordShortAnswer('count',0,bits[i]==='1','level-fixture-'+i,S.shortStatus('count',0).phase);
   window.__levelDay=day;sessionStorage.setItem('level-day',String(day));S.flush();
  },{bits,day,gold});await levels(page);
 };
 const solve=async page=>{
  await page.evaluate(()=>{const K=KazuApp;document.querySelectorAll('#play .obj:not(.counted)').forEach(n=>n.click());K.Session._test.flushTimers(600);
   const answer=Number(K.Session._test.item.split(':').at(-1)),choice=[...document.querySelectorAll('#play .choices .choice')].find(n=>Number(n.textContent)===answer);
   if(!choice)throw Error('count answer unavailable');choice.click();K.Session._test.flushTimers(600);});
  const next=page.locator('#play .answer-next');if(await name(page)==='play'&&await next.isVisible()&&await next.isEnabled())await next.click();await settle(page);
 };
 const openMap=async(page,id='count')=>{
  await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});
  if(!await page.locator('#home .home-more').evaluate(n=>n.open))await page.locator('#home .home-more > summary').click();
  const sticker=page.locator('#home .sticker-mission');if(await sticker.count()&&!await sticker.evaluate(n=>n.open))await sticker.locator(':scope > summary').click();
  const card=page.locator('#home [data-game-id="'+id+'"]');await card.scrollIntoViewIfNeeded();await settle(page);
  const saved=await page.evaluate(()=>({scroll:document.querySelector('#home .home-content').scrollTop,details:[...document.querySelectorAll('#home details')].map(n=>[n.className,n.open])}));
  await card.click();await settle(page);return saved;
 };
 const pauseShort=async page=>{
  await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();assert.equal(await name(page),'first-steps');
  await page.locator('#first-steps .topbar button[aria-label="もどる"]').click();await settle(page);assert.equal(await name(page),'levels');
 };
 const expectOne=async(page,phase)=>{assert.equal(await name(page),'play');assert.equal(await page.evaluate(()=>KazuApp.Session._test.mode),'first');assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),1);
  if(phase)assert.equal((await state(page)).saved.firstPhase,phase);};
 const tracePoints=page=>page.locator('#play .trace-guide').evaluateAll(paths=>paths.map(n=>{
  const values=n.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number),m=n.ownerSVGElement.getScreenCTM(),points=[];
  for(let i=0;i<values.length;i+=2)points.push({x:m.a*values[i]+m.c*values[i+1]+m.e,y:m.b*values[i]+m.d*values[i+1]+m.f});return points;
 }));
 const drawTrace=async(page,points)=>{
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
  await page.evaluate(points=>{const box=document.querySelector('#play .tracebox');points.forEach(p=>box.dispatchEvent(new PointerEvent('pointermove',{
   bubbles:true,cancelable:true,pointerId:1,isPrimary:true,buttons:1,clientX:p.x,clientY:p.y})));},points.slice(1));
  await page.mouse.up();await settle(page);
 };
 try{
  await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
  for(const viewport of[{width:320,height:568},{width:390,height:844},{width:1024,height:768},{width:568,height:320}]){
   const scenario=async(label,run)=>{
    if(process.env.LEVEL_SHORT_FILTER&&!new RegExp(process.env.LEVEL_SHORT_FILTER).test(label))return;
    const c=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
    await c.addInitScript(()=>{const D=Date,base=D.parse('2026-10-18T03:00:00Z');window.__levelDay=Number(sessionStorage.getItem('level-day'))||0;
     window.Date=class extends D{constructor(...a){super(...(a.length?a:[base+window.__levelDay*86400000]));}static now(){return base+window.__levelDay*86400000;}};});
    const p=await c.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(viewport.width+' '+label+': '+e.stack));await p.route('https://**',r=>r.abort());
    try{await p.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});await quiet(p);await p.evaluate(()=>KazuApp.Store.reset());await run(p);passed++;console.log('PASS '+viewport.width+'x'+viewport.height+' '+label);}
    finally{await c.close();}
   };
   await scenario('three actual short visits continue as one; the explicit full course keeps its separate grading',async p=>{
    await p.evaluate(()=>{KazuApp.Session._test.autoAdvance(false);KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true);});
    for(let i=0;i<3;i++){await solve(p);assert.equal(await name(p),'first-finish');if(i<2)await p.locator('#first-finish .first-next').click();}
    assert.equal((await state(p)).status.answered,3);await openMap(p);
    assert.match(await primary(p).textContent(),/つづきの 1もん/);assert.equal(await primary(p).getAttribute('data-level-kind'),'short');
    const course=p.locator('#levels .level-entry').first().locator('.level-normal-course');assert.equal(await course.evaluate(n=>n.open),false);assert.match(await course.locator('summary').textContent(),/8もん/);
    await primary(p).scrollIntoViewIfNeeded();await settle(p);const box=await primary(p).boundingBox();assert.ok(box.height>=64&&box.width>=64);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    for(const theme of ['light','dark']){
     const ratio=await p.evaluate(theme=>{document.documentElement.dataset.theme=theme;const n=document.querySelector('#levels .level-next-action'),card=n.closest('button');
      const lum=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const a=lum(getComputedStyle(n).color),b=lum(getComputedStyle(card).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);},theme);
     assert.ok(ratio>=4.5,theme+' primary action text contrast '+ratio);
    }
    await p.evaluate(()=>delete document.documentElement.dataset.theme);
    if(shots)await p.screenshot({path:path.join(shots,'short-level-'+viewport.width+'x'+viewport.height+'.png'),animations:'disabled'});
    await primary(p).click();await expectOne(p,'independent');await solve(p);let s=await state(p);assert.equal(s.status.answered,4);assert.equal(s.today,4);assert.equal(s.plays,0);assert.equal(s.stars,0);
    await levels(p);await course.locator(':scope > summary').click();assert.match(await course.textContent(),/べつの コース/);
    const normal=course.locator('[data-level-action="course"]');await normal.scrollIntoViewIfNeeded();assert.ok((await normal.boundingBox()).height>=64);
    await normal.click();assert.equal(await p.evaluate(()=>KazuApp.Session._test.mode),'level');assert.equal(await p.evaluate(()=>KazuApp.Session._test.planLength),8);
    await p.evaluate(()=>KazuApp.Session._test.autoAdvance(true));for(let i=0;i<8;i++)await solve(p);
    s=await state(p);assert.equal(await name(p),'result');assert.equal(s.status.answered,4);assert.equal(s.plays,1);assert.equal(s.stars,3);assert.equal(s.today,12);
   });
   await scenario('same-day practice and next-day checks advance the displayed short phase after reload',async p=>{
    await fixture(p,'11111110');const ready=(await state(p)).status.readyDay;assert.match(await primary(p).textContent(),/れんしゅうを 1もん/);
    await primary(p).click();await expectOne(p,'independent');await solve(p);assert.equal((await state(p)).status.checks,0);assert.equal((await state(p)).status.readyDay,ready);
    await p.evaluate(()=>{window.__levelDay=1;sessionStorage.setItem('level-day','1');KazuApp.Store.flush();});await p.reload({waitUntil:'domcontentloaded'});await quiet(p);await openMap(p);
    assert.match(await primary(p).textContent(),/たしかめを 1もん/);await primary(p).click();await expectOne(p,'check');await solve(p);
    let s=await state(p);assert.equal(s.status.checks,1);assert.equal(s.plays,0);assert.equal(s.today,1);
    await p.reload({waitUntil:'domcontentloaded'});await quiet(p);await openMap(p);await primary(p).click();await expectOne(p,'check');await solve(p);
    s=await state(p);assert.equal(s.status.checks,2);assert.equal(s.today,2);
   });
   await scenario('supported relief and deliberate practice during a rest keep the short-course policy',async p=>{
    await fixture(p,'000');assert.equal((await state(p)).status.supportNeeded,true);assert.match(await primary(p).textContent(),/いっしょに 1もん/);
    await primary(p).click();await expectOne(p,'together');assert.equal(await p.evaluate(()=>KazuApp.Session._test.introStep),'together');await solve(p);
    let s=await state(p);assert.equal(s.status.supportNeeded,false);assert.equal(s.status.resting,true);assert.equal(s.plays,0);
    await levels(p);assert.match(await primary(p).textContent(),/このあそびを 1もん/);await primary(p).click();await expectOne(p,'independent');await solve(p);
    s=await state(p);assert.equal(s.status.resting,true);assert.equal(s.status.checks,0);assert.equal(s.stars,0);assert.equal(s.plays,0);
   });
   await scenario('gold preparation, later-day check and completed practice use the matching primary action',async p=>{
    await fixture(p,'111',0,true);assert.match(await primary(p).textContent(),/きんへ つづきの 1もん/);await primary(p).click();await expectOne(p,'independent');await solve(p);
    let s=await state(p);assert.equal(s.status.goldStatus.independentRun,4);assert.equal(s.stars,2);assert.equal(s.plays,1);
    await fixture(p,'11111111',1,true);assert.match(await primary(p).textContent(),/きんへの たしかめを 1もん/);
    for(let i=0;i<3;i++){if(i)await levels(p);await primary(p).click();await expectOne(p,'check');await solve(p);}
    s=await state(p);assert.equal(s.status.goldActive,false);assert.equal(s.stars,3);assert.equal(s.plays,1);
    await levels(p);assert.match(await primary(p).textContent(),/れんしゅうを 1もん/);const before=await state(p);await primary(p).click();await expectOne(p,'independent');await solve(p);s=await state(p);
    assert.equal(s.plays,before.plays);assert.equal(s.stars,before.stars);assert.equal(s.today,before.today+1);
   });
   await scenario('same short checkpoint keeps its draft after reload and returns focus through Levels to its map',async p=>{
    await fixture(p,'111');await openMap(p);await primary(p).click();await p.locator('#play .obj').first().click();
    const before=await state(p),item=await p.evaluate(()=>KazuApp.Session._test.item);assert.equal(before.saved.question.draft.touched,true);
    await pauseShort(p);assert.equal(await primary(p).evaluate(n=>n===document.activeElement),true);assert.equal((await state(p)).saved.id,before.saved.id);
    await p.reload({waitUntil:'domcontentloaded'});await quiet(p);const map=await openMap(p);await primary(p).click();await expectOne(p,'independent');
    assert.equal((await state(p)).saved.id,before.saved.id);assert.equal(await p.evaluate(()=>KazuApp.Session._test.item),item);assert.ok(await p.locator('#play .obj.counted').count()>0);
    await pauseShort(p);assert.equal(await primary(p).evaluate(n=>n===document.activeElement),true);
    const preview=p.locator('#levels [data-level-index="0"][data-level-action="preview"]');const checkpoint=(await state(p)).saved;
    await preview.click();await p.locator('#first-steps .topbar button[aria-label="もどる"]').click();await settle(p);
    assert.equal(await preview.evaluate(n=>n===document.activeElement),true);assert.deepEqual((await state(p)).saved,checkpoint);
    await p.locator('#levels .topbar button[aria-label="もどる"]').click();await settle(p);
    assert.equal(await name(p),'home');assert.equal(await p.evaluate(()=>document.activeElement.dataset.gameId),'count');
    assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('#home details')].map(n=>[n.className,n.open])),map.details);
    assert.ok(Math.abs(await p.locator('#home .home-content').evaluate(n=>n.scrollTop)-map.scroll)<=1);
    await openMap(p);await p.evaluate(()=>{const K=KazuApp,c=K.Session.pendingSummaries().find(c=>c.kind==='session');K.FirstSteps.resume({...c,revision:'stale'},K.Games.byId.count,0);});
    assert.equal(await p.evaluate(()=>KazuApp.FirstSteps.active),null);assert.equal((await state(p)).saved.id,before.saved.id);assert.equal(await name(p),'home');
   });
   await scenario('the explicit regular checkpoint resumes after reload with its open course and map return intact',async p=>{
    await fixture(p,'111');await openMap(p);
    const course=p.locator('#levels .level-entry').first().locator('.level-normal-course'),button=course.locator('[data-level-action="course"]');
    await course.locator(':scope > summary').click();await button.click();assert.equal(await p.evaluate(()=>KazuApp.Session._test.mode),'level');
    await p.locator('#play .obj').first().click();const saved=(await state(p)).saved,item=await p.evaluate(()=>KazuApp.Session._test.item);
    await p.locator('#play .backbtn').click();await p.locator('#play .backbtn').click();await settle(p);
    assert.equal(await course.evaluate(n=>n.open),true);assert.equal(await button.evaluate(n=>n===document.activeElement),true);
    await p.reload({waitUntil:'domcontentloaded'});await quiet(p);const map=await openMap(p);
    await course.locator(':scope > summary').click();assert.match(await button.textContent(),/コースの つづき/);await button.click();
    assert.equal((await state(p)).saved.id,saved.id);assert.equal(await p.evaluate(()=>KazuApp.Session._test.item),item);assert.ok(await p.locator('#play .obj.counted').count()>0);
    await p.locator('#play .backbtn').click();await p.locator('#play .backbtn').click();await settle(p);
    assert.equal(await course.evaluate(n=>n.open),true);assert.equal(await button.evaluate(n=>n===document.activeElement),true);
    await p.locator('#levels .topbar button[aria-label="もどる"]').click();await settle(p);
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.gameId),'count');
    assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('#home details')].map(n=>[n.className,n.open])),map.details);
    assert.ok(Math.abs(await p.locator('#home .home-content').evaluate(n=>n.scrollTop)-map.scroll)<=1);
    assert.equal((await state(p)).status.answered,3);assert.equal((await state(p)).today,0);
   });
   await scenario('new, legacy regular, locked, intro-free and stale-round entries retain their stated routes',async p=>{
    await levels(p);assert.equal(await primary(p).getAttribute('data-level-kind'),'preview');await primary(p).click();assert.equal(await name(p),'first-steps');await p.locator('#first-steps .topbar button[aria-label="もどる"]').click();
    await p.locator('#levels [data-level-index="1"][data-level-action="play"]').click();assert.equal(await name(p),'levels');assert.equal((await state(p)).saved,null);
    await p.evaluate(()=>KazuApp.Store.markIntroduced('count',0));await levels(p);assert.match(await primary(p).textContent(),/8もんの コース/);await primary(p).click();
    assert.equal(await p.evaluate(()=>KazuApp.Session._test.mode),'level');assert.equal(await p.evaluate(()=>KazuApp.Session._test.planLength),8);await p.locator('#play .obj').first().click();const saved=(await state(p)).saved;
    await p.locator('#play .backbtn').click();await p.locator('#play .backbtn').click();assert.match(await primary(p).textContent(),/コースの つづき/);await primary(p).click();assert.equal((await state(p)).saved.id,saved.id);assert.ok(await p.locator('#play .obj.counted').count()>0);
    const noIntro=await p.evaluate(()=>{const K=KazuApp;K.Store.reset();const g=K.Games.list.find(g=>g.intro===false&&K.Progress.stageOf(g)==='pre');if(!g)throw Error('no intro-free game');K.Levels.render(g);K.UI.show('levels');return{id:g.id,n:g.levels[0].n||8};});
    const direct=p.locator('#levels .levelcard').first();assert.match(await direct.textContent(),new RegExp(noIntro.n+'もんの コース'));await direct.click();assert.equal(await p.evaluate(()=>KazuApp.Session._test.mode),'level');assert.equal((await state(p)).saved.gameId,noIntro.id);
    await p.evaluate(()=>{const S=KazuApp.Store;S.reset();S.recordLevel('trace',0,2,4,6,true);S.addSticker('trace:0');S.startShortGold('trace',0);
     for(let i=0;i<3;i++)S.recordShortAnswer('trace',0,true,'trace-gold-'+i,'independent');});
    await openMap(p,'trace');assert.equal(await p.locator('#levels [data-level-action="preview"]').count(),0);assert.match(await primary(p).textContent(),/きんへ つづきの 1もん/);
    await primary(p).click();await expectOne(p,'independent');const strokes=await tracePoints(p);await drawTrace(p,strokes[0].slice(0,Math.max(3,Math.floor(strokes[0].length/4))));
    const traceSaved=(await state(p)).saved,ink=await p.locator('#play .trace-live').getAttribute('d');assert.equal(traceSaved.gameId,'trace');assert.equal(traceSaved.question.draft.touched,true);
    await pauseShort(p);await p.reload({waitUntil:'domcontentloaded'});await quiet(p);const traceMap=await openMap(p,'trace');
    await primary(p).click();await expectOne(p,'independent');assert.equal((await state(p)).saved.id,traceSaved.id);assert.equal(await p.locator('#play .trace-live').getAttribute('d'),ink);
    await pauseShort(p);assert.equal(await primary(p).evaluate(n=>n===document.activeElement),true);await p.locator('#levels .topbar button[aria-label="もどる"]').click();await settle(p);
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.gameId),'trace');assert.ok(Math.abs(await p.locator('#home .home-content').evaluate(n=>n.scrollTop)-traceMap.scroll)<=1);
    // Legacy completed records need no invented teaching flag for intro-free tracing.
    await p.evaluate(()=>{const S=KazuApp.Store;S.reset();S.recordLevel('trace',0,3,6,6,true);S.addSticker('trace:0');S.addSticker('trace:0:g');S.startShortCourse('trace',0);});
    await openMap(p,'trace');assert.match(await primary(p).textContent(),/れんしゅうを 1もん/);await primary(p).click();await expectOne(p,'independent');
    for(const points of await tracePoints(p))await drawTrace(p,points);await p.evaluate(()=>KazuApp.Session._test.flushTimers(600));await settle(p);
    assert.equal(await name(p),'first-finish');assert.deepEqual(await p.evaluate(()=>({today:KazuApp.Store.todayCount(),plays:KazuApp.Store.plays('trace',0),stars:KazuApp.Store.stars('trace',0),stickers:KazuApp.Store.data.stickers})),{today:1,plays:1,stars:3,stickers:['trace:0','trace:0:g']});
    await fixture(p,'111');const stale=await primary(p).elementHandle();await p.evaluate(()=>{KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);});await stale.evaluate(n=>n.click());
    assert.equal(await name(p),'levels');assert.equal((await state(p)).round,2);assert.equal((await state(p)).saved,null);assert.equal(await primary(p).getAttribute('data-level-kind'),'preview');
    await p.evaluate(()=>KazuApp.Rounds.go(1));await openMap(p);assert.equal((await state(p)).status.answered,3);assert.match(await primary(p).textContent(),/つづきの 1もん/);
   });
  }
  assert.deepEqual(errors,[],'no browser exceptions');console.log('PASS '+passed+' level short-entry scenarios; no browser exceptions');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
