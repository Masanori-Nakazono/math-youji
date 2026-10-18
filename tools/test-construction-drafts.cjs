#!/usr/bin/env node
'use strict';
// Exercise real input in disposable profiles, with external assets unavailable.
// Run against current sources, or pass CONSTRUCTION_DRAFT_HTML for either built HTML.
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
  res.end(process.env.CONSTRUCTION_DRAFT_HTML ? fs.readFileSync(process.env.CONSTRUCTION_DRAFT_HTML) : source);
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
    const complete=async()=>{await flush();assert.equal((await state()).count,1,'the restored construction counts once');assert.equal((await state()).saved.results.length,1);};
    const directResume=async()=>{const before=await state();await page.reload({waitUntil:'domcontentloaded'});await quiet();await page.evaluate(()=>KazuApp.Session.resume());await settle();
      const after=await state();for(const name of ['item','idx','wrong','helped','taught','count'])assert.deepEqual(after[name],before[name],name+' survives direct reload');assert.equal(after.locked,false);};
    const countMarks=()=>page.locator('#play .ctag').evaluateAll(xs=>xs.map(x=>({text:x.textContent,index:Array.from(x.parentElement.parentElement.children).indexOf(x.parentElement)})));
    const ordinalTap=async index=>{const button=page.locator('#play .ordinal-choice').nth(index);if(await button.isVisible())await button.click();else await page.locator('#play .queue .qi').nth(index).click();};
    const placePuzzle=async(tileIndex,slotIndex)=>{
      await page.locator('#play .shapetile[data-idx="'+tileIndex+'"]').click();
      await page.locator('#play .shapeslot').nth(slotIndex).focus();await page.keyboard.press('Enter');
    };
    const solvePuzzle=async()=>{
      const pairs=await page.locator('#play .shapeslot').evaluateAll(xs=>xs.flatMap((x,i)=>x.dataset.filled==='1'?[]:[{slot:i,tile:Number([...document.querySelectorAll('#play .shapetile:not(.used)')].find(t=>t.dataset.sig===x.dataset.sig).dataset.idx)}]));
      for(const p of pairs)await placePuzzle(p.tile,p.slot);await complete();
    };
    const sortTile=async index=>{
      const tile=page.locator('#play .tray .tile').nth(index),cat=await tile.getAttribute('data-cat');
      await tile.click();await page.locator('#play .bin[data-cat="'+cat+'"]').click();
    };
    for(const viewport of viewports){
      await page.setViewportSize(viewport);
      await start('measure',2,'^measure:order:');
      const sizeOrder=await page.locator('#play .mrow').evaluateAll(xs=>xs.map((x,i)=>({i,width:parseFloat(x.querySelector('.stickbar').style.width)})));
      const ascending=(await state()).item.includes(':asc:');sizeOrder.sort((a,b)=>ascending?a.width-b.width:b.width-a.width);
      await page.locator('#play .mrow').nth(sizeOrder[0].i).click();
      const firstBar=await page.locator('#play .mrow.picked').innerText();await rest();assert.equal(await page.locator('#play .mrow.picked').innerText(),firstBar);
      await directResume();assert.equal(await page.locator('#play .mrow.picked').innerText(),firstBar);
      for(const r of sizeOrder.slice(1))await page.locator('#play .mrow').nth(r.i).click();await complete();
      console.log('PASS '+viewport.width+'px length-order first bar, numbering and remaining order survive rest/direct reload');

      await start('ordinal',1,'^ordinal:ovc:ko:');
      const n=Number((await state()).item.split(':').at(-1));await ordinalTap(0);
      await rest(true);assert.equal(await page.locator('#play .queue .qi.marked').count(),1);assert.equal(await page.locator('#play .ordinal-choice.picked').count(),1);
      for(let i=1;i<n;i++)await ordinalTap(i);await complete();
      console.log('PASS '+viewport.width+'px count-mode ordinal preserves its partial selection in both answer surfaces');

      await start('shape',0,'^shape:find:');await page.locator('#play .shapebtn[data-hit="1"]').first().click();
      const found=await page.locator('#play .shapebtn').evaluateAll(xs=>xs.flatMap((x,i)=>x.classList.contains('picked')?[i]:[]));
      await rest(true);assert.deepEqual(await page.locator('#play .shapebtn').evaluateAll(xs=>xs.flatMap((x,i)=>x.classList.contains('picked')?[i]:[])),found);
      await page.locator('#play .shapebtn[data-hit="1"]:not(.picked)').evaluateAll(xs=>xs.forEach(x=>x.click()));await complete();
      console.log('PASS '+viewport.width+'px found shapes and tally survive while remaining shapes still grade once');

      await start('shape',2,'^shape:puz:ロケット$');
      const first=await page.locator('#play .shapeslot').first().evaluate(x=>Number([...document.querySelectorAll('#play .shapetile')].find(t=>t.dataset.sig===x.dataset.sig).dataset.idx));
      await placePuzzle(first,0);await page.locator('#play .showbtn').click();await page.locator('#play .shapetile:not(.used)').last().click();
      const puzzle=await page.evaluate(()=>({placed:[...document.querySelectorAll('#play .shapeslot')].flatMap((x,i)=>x.dataset.filled==='1'?[{slot:i,tile:x.dataset.tile}]:[]),selected:document.querySelector('#play .shapetile.sel')?.dataset.idx,colours:[...document.querySelectorAll('#play .shape-picture polygon')].map(x=>x.getAttribute('fill'))}));
      await rest(true);assert.deepEqual(await page.evaluate(()=>({placed:[...document.querySelectorAll('#play .shapeslot')].flatMap((x,i)=>x.dataset.filled==='1'?[{slot:i,tile:x.dataset.tile}]:[]),selected:document.querySelector('#play .shapetile.sel')?.dataset.idx,colours:[...document.querySelectorAll('#play .shape-picture polygon')].map(x=>x.getAttribute('fill'))})),puzzle);
      // Finish the currently selected tile without selecting it twice (which would put it down).
      const chosen=page.locator('#play .shapetile.sel'),sig=await chosen.getAttribute('data-sig');
      const selectedSlot=await page.locator('#play .shapeslot').evaluateAll((xs,sig)=>xs.findIndex(x=>x.dataset.filled!=='1'&&x.dataset.sig===sig),sig);
      await page.locator('#play .shapeslot').nth(selectedSlot).focus();await page.keyboard.press('Enter');await solvePuzzle();
      console.log('PASS '+viewport.width+'px shape puzzle keeps placed tile identity, colour and selected piece through reload');

      for(const level of [0,1]){
        await start('sort',level,'^sort:sort:');await sortTile(1);await sortTile(3);await page.locator('#play .showbtn').click();await page.locator('#play .tray .tile:not(.gone)').last().click();
        const sorting=await page.evaluate(()=>({bins:[...document.querySelectorAll('#play .bin')].map(x=>({cat:x.dataset.cat,contents:x.querySelector('.hold').innerHTML})),gone:[...document.querySelectorAll('#play .tray .tile')].flatMap((x,i)=>x.classList.contains('gone')?[i]:[]),selected:[...document.querySelectorAll('#play .tray .tile')].findIndex(x=>x.classList.contains('sel'))}));
        await rest(true);assert.deepEqual(await page.evaluate(()=>({bins:[...document.querySelectorAll('#play .bin')].map(x=>({cat:x.dataset.cat,contents:x.querySelector('.hold').innerHTML})),gone:[...document.querySelectorAll('#play .tray .tile')].flatMap((x,i)=>x.classList.contains('gone')?[i]:[]),selected:[...document.querySelectorAll('#play .tray .tile')].findIndex(x=>x.classList.contains('sel'))})),sorting);
        const selected=page.locator('#play .tray .tile.sel'),cat=await selected.getAttribute('data-cat');await page.locator('#play .bin[data-cat="'+cat+'"]').click();
        const remaining=await page.locator('#play .tray .tile').evaluateAll(xs=>xs.flatMap((x,i)=>x.classList.contains('gone')?[]:[i]));for(const i of remaining)await sortTile(i);await complete();
        console.log('PASS '+viewport.width+'px '+(level?'category':'colour')+' sorting preserves bin contents, order and selected next tile');
      }

      await start('pattern',2,'^pattern:pat:.*:2$');
      const kind=(await state()).item.split(':')[2],unit=await page.locator('#play .car').allTextContents();
      const answerAt=i=>unit[i%kind.length];let hole=await page.locator('#play .car').evaluateAll(xs=>xs.findIndex(x=>x.classList.contains('now')));
      await choose(answerAt(hole));await flush();const train=await page.locator('#play .car').allTextContents();await rest(true);assert.deepEqual(await page.locator('#play .car').allTextContents(),train);
      hole=await page.locator('#play .car').evaluateAll(xs=>xs.findIndex(x=>x.classList.contains('now')));await choose(answerAt(hole));await complete();
      console.log('PASS '+viewport.width+'px two-hole pattern resumes its second hole and completes once');

      await start('pattern',2,'^pattern:create:');await page.locator('#play .choices > .choice').first().click();
      const created=await page.locator('#play .car').allTextContents(),firstPicture=await page.locator('#play .choice.picked').textContent();await rest(true);
      assert.deepEqual(await page.locator('#play .car').allTextContents(),created);assert.equal(await page.locator('#play .choice.picked').textContent(),firstPicture);
      await page.locator('#play .choices > .choice:not(.picked)').first().click();await complete();
      console.log('PASS '+viewport.width+'px authored pattern keeps the first picture before choosing its second');

      for(const hand of ['hour','minute']){
        await start('clock',2,hand==='hour'?'^clock:set:':'^clock:sethalf:');
        if(hand==='hour')await page.locator('#play .clock-adjust').filter({hasText:'1じ すすめる'}).click();
        else {const r=await page.locator('#play svg.pickable').boundingBox();await page.mouse.click(r.x+r.width-15,r.y+r.height/2);}
        const hands=await page.locator('#play .hand-h, #play .hand-m').evaluateAll(xs=>xs.map(x=>[x.getAttribute('x2'),x.getAttribute('y2')]));const reading=await page.locator('#play .clock-readout').textContent();
        await rest(true);assert.deepEqual(await page.locator('#play .hand-h, #play .hand-m').evaluateAll(xs=>xs.map(x=>[x.getAttribute('x2'),x.getAttribute('y2')])),hands);assert.equal(await page.locator('#play .clock-readout').textContent(),reading);
        if(hand==='minute')await page.locator('#play .clock-adjust').filter({hasText:'ながい はりを 6に'}).click();
        else {const target=Number((await state()).item.split(':').at(-1));for(let i=0;i<12&&!((await page.locator('#play .clock-readout').textContent()).includes(' '+target+'じ'));i++)await page.locator('#play .clock-adjust').filter({hasText:'1じ すすめる'}).click();}
        await page.locator('#play .answer-submit').click();await complete();
        console.log('PASS '+viewport.width+'px '+hand+' hand geometry and accessible readout resume before explicit checking');
      }

      await start('numeral',0,'^numeral:q2n:[3-5]$');await page.locator('#play .showbtn').click();
      await page.locator('#play .item.coachable').nth(2).click();await page.locator('#play .item.coachable').first().click();const marks=await countMarks();
      await rest(true);assert.deepEqual(await countMarks(),marks);assert.equal((await state()).helped,true);
      await page.locator('#play .item.coachable:not(.coachcounted)').evaluateAll(xs=>xs.forEach(x=>x.click()));
      const total=Number((await state()).item.split(':').at(-1));await choose(total);await complete();assert.equal((await state()).saved.firstTryRight,0);assert.equal((await state()).saved.results[0],'miss');
      console.log('PASS '+viewport.width+'px Coach count tool retains exact count order and supported grading');

      await start('bond',2,'^bond:dec:10-[1-6]$');await page.locator('#play .showbtn').click();
      await page.locator('#play .cell.coachhole').last().click();const redCells=await page.locator('#play .cell').evaluateAll(xs=>xs.flatMap((x,i)=>x.querySelector('.dot.b')?[i]:[]));
      await rest(true);assert.deepEqual(await page.locator('#play .cell').evaluateAll(xs=>xs.flatMap((x,i)=>x.querySelector('.dot.b')?[i]:[])),redCells);
      await page.locator('#play .cell.coachhole').evaluateAll(xs=>xs.forEach(x=>x.click()));await rest(true);assert.equal(await page.locator('#play .answer-submit').count(),0,'a filled counting aid keeps the number-answer surface');const known=Number((await state()).item.split('-').at(-1));await key(10-known).click();await complete();assert.equal((await state()).saved.firstTryRight,0);
      console.log('PASS '+viewport.width+'px Coach fill tool retains exact added cells and supported grading');
    }
    await start('ten',2,'^ten:three10$');await key(5).click();await key(2).click();
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
    assert.equal(await page.evaluate(()=>localStorage.getItem('kazu-no-bouken.v1').includes('"picked":[5,2]')),true,'background visibility flushes latest input to disk');
    const draft=await three();await directResume();assert.deepEqual(await three(),draft);await key(3).click();await page.locator('#play .three-submit').click();await complete();
    console.log('PASS visibility/pagehide save 5＋2 without the back button and direct reload resumes it cleanly');
    assert.deepEqual(errors,[],'browser exceptions');console.log('PASS no browser exceptions');
    await context.close();
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
