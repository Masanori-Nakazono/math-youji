#!/usr/bin/env node
'use strict';
// Exercise real input in disposable profiles, with external assets unavailable.
// Run against current sources, or pass QUESTION_DRAFT_HTML for either built HTML.
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
  res.end(process.env.QUESTION_DRAFT_HTML ? fs.readFileSync(process.env.QUESTION_DRAFT_HTML) : source);
});
const viewports = [{width:320,height:568}, {width:1024,height:768}];
(async () => {
  let browser; const errors = [];
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
    const page=await context.newPage(); page.setDefaultTimeout(8000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**',r=>r.abort());
    const quiet=()=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
      K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});await quiet();
    const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const flush=()=>page.evaluate(()=>KazuApp.Session._test.flushTimers(600));
    const start=async(id,level,pattern='',condition='')=>{
      await page.evaluate(({id,level,pattern,condition})=>{const K=KazuApp;
        for(let n=0;n<2000;n++){K.Store.reset();K.Store.setPref('g1Open',true);K.Session.startLevel(K.Games.byId[id],level);
          if((!pattern||new RegExp(pattern).test(K.Session._test.item))&&(!condition||new Function('return '+condition)()))return;
        }throw Error('missing fixture '+id+' '+pattern);
      },{id,level,pattern,condition});await settle();
    };
    const state=()=>page.evaluate(()=>{const K=KazuApp,T=K.Session._test;return {item:T.item,idx:T.idx,wrong:T.wrongThisQ,
      helped:T.helped,taught:T.taughtQ,count:K.Store.todayCount(),saved:K.Store.savedSession(),locked:T.locked};});
    const rest=async(reload=false)=>{
      const before=await state();
      await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
      if(reload){await page.reload({waitUntil:'domcontentloaded'});await quiet();}
      await page.evaluate(()=>KazuApp.Session.resume());await settle();
      const after=await state();
      for(const name of ['item','idx','wrong','helped','taught','count'])assert.deepEqual(after[name],before[name],name+' survives rest/reload');
      assert.equal(after.locked,false,'restoring does not submit an answer');
      assert.deepEqual(after.saved.results,before.saved.results,'restoring creates no result');
    };
    const choose=n=>page.locator('#play .choices > .choice').filter({hasText:new RegExp('^'+n+'$')}).click();
    const key=n=>page.locator('#play .padkey').filter({hasText:new RegExp('^'+n+'$')});
    const three=()=>page.locator('#play .three-sum-slot').allTextContents();
    const counted=()=>page.locator('#play .obj').evaluateAll(xs=>xs.map((x,i)=>({i,n:Number(x.querySelector('.tag')?.textContent)})).filter(x=>x.n).sort((a,b)=>a.n-b.n));
    const pairs=()=>page.locator('#play .pairitem').evaluateAll(xs=>xs.map(x=>({side:x.dataset.side,text:x.textContent,marked:x.classList.contains('marked'),paired:x.classList.contains('paired')})));
    for(const viewport of viewports){
      await page.setViewportSize(viewport);
      await start('ten',2,'^ten:three10$');
      await key(5).click();await key(2).click();const partial=await three();
      await rest();assert.deepEqual(await three(),partial);await rest(true);assert.deepEqual(await three(),partial);
      await page.locator('#play .three-undo').click();assert.deepEqual((await three()).map(s=>s.trim()),['5','？','？']);
      await key(2).click();await key(3).click();await page.locator('#play .three-submit').click();
      assert.equal((await state()).count,1);assert.equal((await state()).saved.firstTryRight,1);
      console.log('PASS '+viewport.width+'px three-term draft, selected slot, undo history and single clean grading survive two rests/reload');

      await start('ten',2,'^ten:three10$');
      for(const n of [9,9,0])await key(n).click();await page.locator('#play .three-submit').click();
      await page.locator('#play .showbtn').click();const supported=await three();
      await rest(true);assert.deepEqual(await three(),supported);assert.equal((await state()).wrong,1);assert.equal((await state()).helped,true);
      console.log('PASS '+viewport.width+'px submitted errors and requested help persist independently of draft editing');

      await start('seq',1,'^seq:fill:',"document.querySelectorAll('#play .nn.gap').length===2");
      const holes=await page.locator('#play .nn').evaluateAll(xs=>xs.map((x,i)=>x.classList.contains('gap')?Number(xs[0].textContent)+i:null).filter(x=>x!==null));
      await choose(holes[0]);await flush();const filled=await page.locator('#play .nn.filled').allTextContents();
      await rest(true);assert.deepEqual(await page.locator('#play .nn.filled').allTextContents(),filled);
      await choose(holes[1]);assert.equal((await state()).count,1);assert.equal((await state()).saved.firstTryRight,1);
      console.log('PASS '+viewport.width+'px sequence resumes its second hole and grades the whole question once');

      await start('count',0,'^count:countL:[3-5]$');
      await page.locator('#play .obj').nth(2).click();await page.locator('#play .obj').nth(0).click();const order=await counted();
      await rest(true);assert.deepEqual(await counted(),order);assert.equal((await state()).count,0);
      await page.locator('#play .obj:not(.counted)').evaluateAll(xs=>xs.forEach(x=>x.click()));await flush();
      assert.match(await page.locator('#play .prompt .txt').textContent(),/ぜんぶ/);
      await rest(true);assert.match(await page.locator('#play .prompt .txt').textContent(),/ぜんぶ/);
      const amount=Number((await state()).item.split(':').at(-1));await choose(amount);assert.equal((await state()).count,1);
      console.log('PASS '+viewport.width+'px count order, all-counted question stage and no duplicate count');

      await start('count',2,'^count:give:');await page.locator('#play .obj').nth(1).click();await page.locator('#play .obj').nth(3).click();
      const selected=await page.locator('#play .obj.picked').evaluateAll(xs=>xs.map(x=>x.dataset.i));
      await rest(true);assert.deepEqual(await page.locator('#play .obj.picked').evaluateAll(xs=>xs.map(x=>x.dataset.i)),selected);
      await page.locator('#play .obj').nth(1).click();assert.equal(await page.locator('#play .obj.picked').count(),1);
      console.log('PASS '+viewport.width+'px basket keeps the exact selected objects and can still remove them');

      await start('bond',1,'^bond:ways:');await choose(1);await flush();
      await rest(true);assert.equal(await page.locator('#play .way').count(),1);await choose(2);await flush();
      assert.equal((await state()).count,1);console.log('PASS '+viewport.width+'px first number split persists before constructing the second');

      await start('ten',0,'^ten:fill10:[2-7]$');await page.locator('#play .cell.tappable').last().click();
      const red=await page.locator('#play .cell').evaluateAll(xs=>xs.map((x,i)=>x.querySelector('.dot.b')?i:-1).filter(x=>x>=0));
      await rest(true);assert.deepEqual(await page.locator('#play .cell').evaluateAll(xs=>xs.map((x,i)=>x.querySelector('.dot.b')?i:-1).filter(x=>x>=0)),red);
      await page.locator('#play .cell.tappable').evaluateAll(xs=>xs.filter(x=>!x.firstChild).forEach(x=>x.click()));await flush();await rest(true);
      assert.match(await page.locator('#play .prompt .txt').textContent(),/いくつ たした/);
      console.log('PASS '+viewport.width+'px filled-to-ten cells and the added-count stage resume');

      await start('ten',2,'^ten:pair:');await page.locator('#play .choices > .choice').nth(2).click();
      const held=await page.locator('#play .choices > .choice').evaluateAll(xs=>xs.map(x=>x.style.borderColor));
      await rest(true);assert.deepEqual(await page.locator('#play .choices > .choice').evaluateAll(xs=>xs.map(x=>x.style.borderColor)),held);
      console.log('PASS '+viewport.width+'px one selected make-ten card stays held');

      await start('g1set',0,'^g1set:same:');await page.locator('#play .obj[data-hit="1"]').nth(1).click();
      const gathered=await counted();await rest(true);assert.deepEqual(await counted(),gathered);
      await page.locator('#play .obj[data-hit="1"]:not(.counted)').evaluateAll(xs=>xs.forEach(x=>x.click()));await flush();await rest(true);
      assert.match(await page.locator('#play .prompt .txt').textContent(),/ぜんぶ/);
      console.log('PASS '+viewport.width+'px named set keeps gathered members and its final total question');

      await start('g1set',2,'^g1set:own:');await page.locator('#play .choices > .choice').first().click();
      const chosen=await page.locator('#play .prompt .txt').textContent();
      const cats=await page.locator('#play .obj').evaluateAll(xs=>[...new Set(xs.map(x=>x.dataset.cat))]);
      const ownDraft=await page.evaluate(()=>JSON.stringify(KazuApp.Store.savedSession().question));
      const chosenKey=cats.find(k=>ownDraft.includes('"chosen":"'+k+'"'));
      assert.ok(chosenKey,'chosen rule is serialized');await page.locator('#play .obj[data-cat="'+chosenKey+'"]').first().click();
      const own=await counted();await rest(true);assert.equal(await page.locator('#play .prompt .txt').textContent(),chosen);assert.deepEqual(await counted(),own);
      console.log('PASS '+viewport.width+'px self-selected grouping rule and gathered member persist');

      await start('g1pair',0,'^g1pair:more:');
      await page.locator('#play .pairitem[data-side="a"]').nth(1).click();await page.locator('#play .pairitem[data-side="b"]').nth(0).click();
      await page.locator('#play .pairitem[data-side="a"]').nth(0).click();const paired=await pairs();
      await rest(true);assert.deepEqual(await pairs(),paired);
      await page.evaluate(()=>{const a=[...document.querySelectorAll('#play .pairitem[data-side="a"]:not(.paired)')],b=[...document.querySelectorAll('#play .pairitem[data-side="b"]:not(.paired)')];for(let i=0;i<Math.min(a.length,b.length);i++){a[i].click();b[i].click();}});await flush();await rest(true);
      assert.match(await page.locator('#play .prompt .txt').textContent(),/おおい/);
      console.log('PASS '+viewport.width+'px exact pair positions, pending selection and leftover stage persist');

      await start('g1pair',2,'^g1pair:same1to1:',"(()=>{const a=[...document.querySelectorAll('#play .pairitem[data-side=\"a\"]')],b=[...document.querySelectorAll('#play .pairitem[data-side=\"b\"]')];for(let i=0;i<Math.min(a.length,b.length);i++){a[i].click();b[i].click();}KazuApp.Session._test.flushTimers(600);return document.querySelectorAll('#play .pairslot').length>=4;})()");
      await page.locator('#play .pairslot').last().click();
      const added=await page.locator('#play .pairslot[data-filled="1"]').evaluateAll(xs=>xs.map(x=>x.dataset.slot));
      await rest(true);assert.deepEqual(await page.locator('#play .pairslot[data-filled="1"]').evaluateAll(xs=>xs.map(x=>x.dataset.slot)),added);
      await page.evaluate(()=>{const item=KazuApp.Session._test.item,nums=item.split(':').at(-1).split('-').map(Number),need=nums[0]-nums[1];
        const filled=document.querySelectorAll('#play .pairslot[data-filled="1"]').length;
        [...document.querySelectorAll('#play .pairslot:not([data-filled="1"])')].slice(0,need-filled).forEach(x=>x.click());
        const back=document.querySelector('#play .backbtn');back.click();back.click();});
      await page.reload({waitUntil:'domcontentloaded'});await quiet();await page.evaluate(()=>KazuApp.Session.resume());await settle();
      assert.equal((await state()).count,0,'restoring completed added slots does not grade');
      await page.locator('#play .answer-submit').click();assert.equal((await state()).count,1);
      console.log('PASS '+viewport.width+'px make-same keeps exact added slots, including completion before delayed grading');

      await start('g1shiki',1,'^g1shiki:word\\+:');await choose('＋');await flush();await rest(true);
      assert.equal(await page.locator('#play .choices.pad').count(),1);assert.equal(await page.locator('#play .opbox').textContent(),'＋');
      console.log('PASS '+viewport.width+'px story operation stage survives before calculation');

      await start('trace',1,'^trace:trace:4$');
      const strokePoints=()=>page.locator('#play .trace-guide').evaluateAll(xs=>xs.map(x=>{const v=x.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number),m=x.ownerSVGElement.getScreenCTM(),out=[];
        for(let i=0;i<v.length;i+=2)out.push({x:m.a*v[i]+m.c*v[i+1]+m.e,y:m.b*v[i]+m.d*v[i+1]+m.f});return out;}));
      const draw=async(points)=>{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();};
      let strokes=await strokePoints();await draw(strokes[0]);
      assert.equal(await page.locator('#play .trace-done').count(),1);await rest(true);assert.equal(await page.locator('#play .trace-done').count(),1);
      strokes=await strokePoints();const half=strokes[1].slice(0,Math.floor(strokes[1].length/2));await draw(half);
      const ink=await page.locator('#play .trace-live').getAttribute('d');await rest(true);assert.equal(await page.locator('#play .trace-live').getAttribute('d'),ink);
      const startAt=await page.locator('#play .trace-start').evaluate(x=>{const m=x.ownerSVGElement.getScreenCTM();return {x:m.a*Number(x.getAttribute('cx'))+m.e,y:m.d*Number(x.getAttribute('cy'))+m.f};});
      strokes=await strokePoints();await draw([startAt,...strokes[1].slice(half.length)]);await flush();assert.equal((await state()).count,1);
      console.log('PASS '+viewport.width+'px completed trace stroke, live ink and moved start dot survive reload, then grade once');
    }
    // Pause in the delay between the final physical input and accepted grading.
    await start('trace',0,'^trace:trace:1$');
    await page.evaluate(()=>{const path=document.querySelector('#play .trace-guide'),values=path.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number),m=path.ownerSVGElement.getScreenCTM(),box=document.querySelector('#play .tracebox');
      const event=(type,i)=>box.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,clientX:m.a*values[i]+m.c*values[i+1]+m.e,clientY:m.b*values[i]+m.d*values[i+1]+m.f}));
      event('pointerdown',0);for(let i=2;i<values.length;i+=2)event('pointermove',i);event('pointerup',values.length-2);
      const back=document.querySelector('#play .backbtn');back.click();back.click();});
    await page.reload({waitUntil:'domcontentloaded'});await quiet();await page.evaluate(()=>KazuApp.Session.resume());await settle();
    assert.equal((await state()).count,0);assert.equal(await page.locator('#play .trace-done').count(),1);
    await page.locator('#play .answer-submit').click();assert.equal((await state()).count,1);
    console.log('PASS completed tracing paused before grading resumes with explicit confirmation and counts once');

    await page.evaluate(()=>{const K=KazuApp;K.Store.reset();K.Session._test.intro(true);K.Session.startLevel(K.Games.byId.count,0);K.Session._test.flushTimers(400);});
    assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'together');
    await page.locator('#play .obj').first().click();const together=await counted(), togetherCount=(await state()).count;
    await rest(true);assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'together');assert.deepEqual(await counted(),together);
    assert.equal((await state()).count,togetherCount,'restoring together does not add a completed question');
    console.log('PASS together-stage board is retained through rest and reload without demonstration replay or grading');
    assert.deepEqual(errors,[],'browser exceptions');console.log('PASS no browser exceptions');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
