#!/usr/bin/env node
'use strict';
// Real pointer and audio controls in disposable browser contexts; no child profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (error, body) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(error ? 'not found' : body);
  });
});

(async () => {
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    async function scenario(name, run, width = 1024, height = 768){
      const context = await browser.newContext({viewport:{width,height}, serviceWorkers:'block', reducedMotion:'reduce'});
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(name + ': ' + e.message));
      await page.route('https://**', route => route.abort());
      try {
        await page.goto(url, {waitUntil:'domcontentloaded'});
        await page.evaluate(() => {
          const K = KazuApp;
          K.Store.reset(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
          window.heard = [];
          K.Sound.say = (text, opts) => { heard.push(text); if (opts && opts.onend) opts.onend(); };
          K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.breaks(false);
        });
        await run(page);
        console.log('PASS ' + name);
      } finally { await context.close(); }
    }
    const story = page => page.evaluate(() => {
      const K = KazuApp;
      K.Store.setPref('g1Open',true);
      K.Session.startLevel(K.Games.byId.g1shiki,2);
      window.heard = [];
    });
    const state = page => page.evaluate(() => {
      const K=KazuApp,T=K.Session._test;
      return {idx:T.idx,wrong:T.wrongThisQ,helped:T.helped,taught:T.taughtQ,touched:T.touched,
        response:T.responseMs,count:K.Store.todayCount(),saved:K.Store.savedSession()};
    });
    const trace = async (page, digit) => {
      await page.evaluate(d => {
        const K=KazuApp,T=K.Session._test;
        for(let i=0;i<100;i++){
          K.Session.startLevel(K.Games.byId.trace, d <= 3 ? 0 : d <= 7 ? 1 : 2);
          if(T.item==='trace:trace:'+d) break;
        }
        if(T.item!=='trace:trace:'+d) throw new Error('Could not build trace '+d);
        window.tracePaths=Array.from(document.querySelectorAll('#play .trace-guide'),p=>{
          const nums=p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number),points=[];
          for(let i=0;i<nums.length;i+=2)points.push([nums[i],nums[i+1]]);
          return points;
        });
        window.traceClient=([x,y])=>{
          const m=document.querySelector('#play .tracebox svg').getScreenCTM();
          return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};
        };
        window.traceMoves=(stroke,from,to)=>{
          const box=document.querySelector('#play .tracebox'),pts=tracePaths[stroke];
          for(let i=from;i<=to;i++){
            const p=traceClient(pts[i]);
            box.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,cancelable:true,pointerId:1,isPrimary:true,buttons:1,clientX:p.x,clientY:p.y}));
          }
        };
      },digit);
    };
    const marker = page => page.evaluate(() => {
      const n=document.querySelector('#play .trace-start');
      return n ? {x:+n.getAttribute('cx'),y:+n.getAttribute('cy')} : null;
    });
    const down = async (page, point) => {
      const p=await page.evaluate(p=>traceClient([p.x,p.y]),point);
      await page.mouse.move(p.x,p.y);await page.mouse.down();
    };
    const move = (page,stroke,from,to) => page.evaluate(([s,f,t])=>traceMoves(s,f,t),[stroke,from,to]);
    const length = (page,stroke) => page.evaluate(s=>tracePaths[s].length,stroke);

    await scenario('each story has a separate audio control, and listening does not answer or request help', async page => {
      await story(page);
      assert.equal(await page.locator('#play .choice-audio.story-audio').count(),3);
      const before=await state(page), expected=await page.evaluate(()=>Array.from(document.querySelectorAll('#play .choice.story span'),s=>Array.from(s.childNodes,n=>n.nodeName==='BR'?'。':n.textContent).join('')));
      for(let i=0;i<3;i++) await page.locator('#play .choice-hear').nth(i).click();
      assert.deepEqual(await state(page),before);
      assert.deepEqual(await page.evaluate(()=>heard),expected);
      assert.equal(await page.locator('#play .choice.correct, #play .choice.tried').count(),0);
    });

    await scenario('hearing choices still allows one clean, independently scored answer', async page => {
      await story(page);await page.locator('#play .choice-hear').first().click();
      const correct=await page.evaluate(()=>{
        const m=/read([+-]):(\d+)_(\d+)$/.exec(KazuApp.Session._test.item);
        return Array.from(document.querySelectorAll('#play .choice.story')).findIndex(b=>{
          const nums=b.textContent.match(/\d+/g).map(Number);
          return nums[nums.length-1]===+m[3]&&b.textContent.includes(m[1]==='+'?'もらった':'たべた');
        });
      });
      assert.notEqual(correct,-1);
      await page.locator('#play .choice.story').nth(correct).click();
      const after=await state(page);
      assert.equal(after.count,1);assert.equal(after.wrong,0);assert.equal(after.helped,false);assert.equal(after.taught,false);
      assert.equal(after.saved.firstTryRight,1);
      const spoken=await page.evaluate(()=>heard.length);
      await page.locator('#play .choice-hear').first().click({force:true});
      assert.equal(await page.evaluate(()=>heard.length),spoken,'locked answer ignores a late audio tap');
    });

    await scenario('story audio and answer controls fit a narrow phone without overlap', async page => {
      await story(page);
      const layout=await page.evaluate(()=>{
        const boxes=Array.from(document.querySelectorAll('#play .choice-audio')).map(n=>{
          const r=n.getBoundingClientRect(),a=n.querySelector('.choice').getBoundingClientRect(),h=n.querySelector('.choice-hear').getBoundingClientRect();
          return {left:r.left,right:r.right,separate:a.right<=h.left+1,hearWidth:h.width,hearHeight:h.height};
        });
        return {boxes,width:innerWidth,scroll:document.documentElement.scrollWidth};
      });
      assert.ok(layout.boxes.every(r=>r.left>=-1&&r.right<=layout.width+1&&r.separate&&r.hearWidth>=44&&r.hearHeight>=44));
      assert.ok(layout.scroll<=layout.width+1);
      if(process.env.INPUT_QA_DIR){fs.mkdirSync(process.env.INPUT_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.INPUT_QA_DIR,'story-audio-320.png')});}
    },320,740);

    await scenario('lifting midway moves the red dot and continuing from it finishes the numeral', async page => {
      await trace(page,3);
      const start=await marker(page),n=await length(page,0),mid=Math.floor(n*.45);
      await down(page,start);await move(page,0,1,mid);await page.mouse.up();
      const next=await marker(page);
      assert.ok(Math.hypot(next.x-start.x,next.y-start.y)>22);
      assert.match(await page.locator('#play .trace-numlabel').textContent(),/つづけよう/);
      assert.ok((await page.evaluate(()=>heard)).includes('ここから、つづけよう。'));
      assert.ok(await page.evaluate(()=>{
        const board=document.querySelector('#play .tracebox').getBoundingClientRect(),cue=document.querySelector('#play .trace-numlabel').getBoundingClientRect();
        return cue.top>=board.bottom-1&&parseFloat(getComputedStyle(document.querySelector('#play .trace-numlabel')).fontSize)<=24;
      }),'continuation cue stays below the drawing');
      if(process.env.INPUT_QA_DIR){fs.mkdirSync(process.env.INPUT_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.INPUT_QA_DIR,'trace-resume-1024.png')});}
      await down(page,next);await move(page,0,mid,n-1);await page.mouse.up();
      await page.waitForFunction(()=>KazuApp.Store.todayCount()===1);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.mistakes),0);
    });

    await scenario('the original start accepts a fresh attempt without an error or lost guidance', async page => {
      await trace(page,3);
      const start=await marker(page),n=await length(page,0),mid=Math.floor(n*.5);
      await down(page,start);await move(page,0,1,mid);await page.mouse.up();
      await page.evaluate(()=>{const b=document.querySelector('#play .tracebox');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:0,clientY:0,pointerId:3}));b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:0,clientY:0,pointerId:3}));});
      assert.equal(await page.locator('#play .trace-ghost').count(),1);
      await down(page,start);
      assert.equal(await page.locator('#play .trace-live').count(),0);
      assert.equal(await page.locator('#play .trace-ghost').count(),1,'restarting keeps the visual hint');
      await move(page,0,1,n-1);await page.mouse.up();
      await page.waitForFunction(()=>KazuApp.Store.todayCount()===1);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.mistakes),0);
    });

    await scenario('pointer cancellation keeps completed strokes and resumes the unfinished stroke', async page => {
      await trace(page,4);
      const n=await length(page,0),start=await marker(page);
      await down(page,start);await move(page,0,1,n-1);await page.mouse.up();
      assert.equal(await page.locator('#play .trace-done').count(),1);
      const second=await marker(page),m=await length(page,1);
      await down(page,second);await move(page,1,1,Math.floor(m*.45));
      await page.evaluate(()=>document.querySelector('#play .tracebox').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
      await page.mouse.up();
      const resumed=await marker(page);
      assert.ok(Math.hypot(resumed.x-second.x,resumed.y-second.y)>22);
      assert.equal(await page.locator('#play .trace-done').count(),1);
      await down(page,resumed);await move(page,1,Math.floor(m*.45),m-1);await page.mouse.up();
      await page.waitForFunction(()=>KazuApp.Store.todayCount()===1);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.mistakes),0);
    });
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('Input accessibility: 6 scenarios passed.');
  } finally { if(browser)await browser.close();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
