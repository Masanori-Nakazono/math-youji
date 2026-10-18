#!/usr/bin/env node
'use strict';
// Real answers and progression in disposable browser contexts. Existing grading
// suites select automatic pacing explicitly; these cases exercise the default.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
function store(initial) {
  const values = new Map(initial ? [['kazu-no-bouken.v1', JSON.stringify(initial)]] : []);
  // Every export gets a different timestamp, including on fast local machines.
  // Atomic rejection protects the stored record, not the export's savedAt time.
  let tick=Date.parse('2026-10-18T03:00:00Z');
  class Clock extends Date {constructor(...args){super(...(args.length?args:[tick++]));}static now(){return tick++;}}
  const context = { Date:Clock, localStorage: {getItem:k=>values.get(k)||null, setItem:(k,v)=>values.set(k,v)},
    setTimeout(){return 1;}, clearTimeout(){}, addEventListener(){}, document:{hidden:false}, location:{origin:'test://pacing'},
    clamp:(n,a,b)=>Math.max(a,Math.min(b,n)) };
  vm.runInNewContext(['02-store.js','06-miss.js'].map(f=>fs.readFileSync(path.join(root,'src/js',f),'utf8')).join('\n')+'\nglobalThis.S=Store;',context);
  return context.S;
}
function checkPreferences() {
  const S=store(); assert.equal(S.data.autoAdvance,false);
  S.setPref('autoAdvance',true); S.flush();
  const exported=S.exportText(), data=JSON.parse(exported).data;
  assert.equal(store(data).data.autoAdvance,true);
  S.unlockRoundTwo(); S.selectRound(2); assert.equal(S.data.autoAdvance,true);
  assert.equal(Object.hasOwn(S.roundData(2),'autoAdvance'),false);
  S.setPref('autoAdvance',false); assert.equal(S.importText(exported).ok,true); assert.equal(S.data.autoAdvance,false);
  assert.equal(S.importText(exported,'replace').ok,true); assert.equal(S.data.autoAdvance,true);
  const legacy=JSON.parse(exported); delete legacy.data.autoAdvance;
  assert.equal(S.importText(JSON.stringify(legacy),'replace').ok,true); assert.equal(S.data.autoAdvance,false);
  for(const bad of [null,1,'true',{},[]]){
    const backup=JSON.parse(exported); backup.data.autoAdvance=bad;
    const before=JSON.parse(S.exportText()).data; assert.equal(S.importText(JSON.stringify(backup),'replace').ok,false);
    assert.deepEqual(JSON.parse(S.exportText()).data,before); assert.equal(store(backup.data).data.autoAdvance,false);
  }
  S.setPref('autoAdvance',true);S.reset();assert.equal(S.data.autoAdvance,false);
  console.log('PASS pacing preference survives reload/replacement, stays shared across laps, and validates legacy/malformed backups');
}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  const file=pathname==='/dist/kazu-no-bouken.html'&&process.env.PACING_HTML
    ? path.resolve(process.env.PACING_HTML) : path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)&&file!==path.resolve(process.env.PACING_HTML||'.')){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream','Cache-Control':'no-store'});res.end(e?'':b);});
});
(async()=>{
  checkPreferences();let browser;const errors=[];let passed=0;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const url=`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet=page=>page.evaluate(()=>{
      const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.unlock();
      window.heard=[];K.Sound.say=(t,o)=>{heard.push(t);if(o&&o.onend)o.onend();};
      K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);
    });
    const scenario=async(name,run)=>{
      const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(name+': '+e.message));
      await page.route('https://**',r=>r.abort());
      try{await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.Store.reset());await run(page);passed++;console.log('PASS '+name);}
      finally{await context.close();}
    };
    const flush=page=>page.evaluate(()=>KazuApp.Session._test.flushTimers(100));
    const state=page=>page.evaluate(()=>({idx:KazuApp.Session._test.idx,item:KazuApp.Session._test.item,count:KazuApp.Store.todayCount(),saved:KazuApp.Store.savedSession(),screen:KazuApp.UI.currentName()}));
    const prepareCount=async(page,short=false)=>{
      await page.evaluate(short=>{const K=KazuApp;K.Store.markIntroduced('count',0);if(short)K.FirstSteps.startOne(K.Games.byId.count,0,true);else K.Session.startLevel(K.Games.byId.count,0);},short);
      await page.evaluate(()=>document.querySelectorAll('#play .obj').forEach(n=>n.click()));await flush(page);
    };
    const answerCount=async(page)=>{
      const answer=await page.evaluate(()=>KazuApp.Session._test.item.split(':').at(-1));
      await page.locator('#play .choices .choice').filter({hasText:new RegExp('^'+answer+'$')}).click();
    };
    const next=page=>page.locator('#play .answer-next');

    await scenario('default holds the complete maximum decomposition until the child chooses Next',async page=>{
      await page.evaluate(()=>{const K=KazuApp;for(let i=0;i<300;i++){K.Session.startLevel(K.Games.byId.bond,2);if(K.Session._test.item==='bond:dec:10-1')return;}throw Error('maximum decomposition');});
      const before=await state(page);await page.getByRole('button',{name:'9',exact:true}).click();
      assert.equal(await next(page).isDisabled(),true);
      await page.waitForTimeout(1650);assert.equal(await page.locator('#play .dot.b').count(),9);
      assert.equal((await state(page)).item,before.item);await next(page).waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('#play .answer-next').disabled);
      await page.waitForTimeout(400);assert.equal((await state(page)).idx,0);assert.equal((await state(page)).count,1);
      await page.locator('#play [aria-label="こたえを もういちど きく"]').click();
      assert.match(await page.evaluate(()=>heard.at(-1)),/10.*1.*9/);assert.equal((await state(page)).idx,0);
      await next(page).click();assert.equal((await state(page)).idx,1);assert.equal((await state(page)).count,1);
    });
    await scenario('a repeated answer and a double Next do not count or answer the following question',async page=>{
      await prepareCount(page);await answerCount(page);
      await page.evaluate(()=>document.querySelector('#play .choice.correct').click());await flush(page);
      assert.equal((await state(page)).count,1);await next(page).dblclick();
      assert.equal((await state(page)).idx,1);assert.equal((await state(page)).count,1);
      assert.equal((await state(page)).saved.question.wrongThisQ,0);
    });
    await scenario('reload after an accepted answer resumes the following question without a duplicate',async page=>{
      await prepareCount(page);await answerCount(page);
      assert.equal((await state(page)).saved.index,1);await page.evaluate(()=>KazuApp.Store.flush());
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.Session.resume());
      assert.equal((await state(page)).idx,1);assert.equal((await state(page)).count,1);
      assert.equal(await next(page).isVisible(),false);
    });
    await scenario('leaving a completed final question settles its result before a new course',async page=>{
      await prepareCount(page,true);await answerCount(page);await flush(page);
      assert.equal((await state(page)).screen,'play');assert.equal((await state(page)).saved.index,1);
      await page.evaluate(()=>KazuApp.Session.startLevel(KazuApp.Games.byId.flash,0));
      assert.equal((await state(page)).screen,'first-finish');assert.equal((await state(page)).saved,null);
      assert.equal((await state(page)).count,1);assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered),1);
    });
    await scenario('automatic pacing still waits for every dot and then advances once',async page=>{
      await page.evaluate(()=>{const K=KazuApp;K.Store.setPref('autoAdvance',true);for(let i=0;i<300;i++){K.Session.startLevel(K.Games.byId.bond,2);if(K.Session._test.item==='bond:dec:10-1')return;}throw Error('maximum decomposition');});
      await page.getByRole('button',{name:'9',exact:true}).click();await page.waitForTimeout(1650);
      assert.equal((await state(page)).idx,0);assert.equal(await page.locator('#play .dot.b').count(),9);
      await page.waitForFunction(()=>KazuApp.Session._test.idx===1);assert.equal((await state(page)).count,1);
    });
    await scenario('the Next button remains disabled until narration has completed',async page=>{
      await prepareCount(page);
      await page.evaluate(()=>{window.originalAfterSpeech=KazuApp.Sound.afterSpeech;window.narrationWaiters=[];KazuApp.Sound.afterSpeech=fn=>{narrationWaiters.push(fn);return()=>{};};});
      await answerCount(page);await flush(page);assert.equal(await next(page).isDisabled(),true);
      await page.evaluate(()=>{KazuApp.Sound.afterSpeech=originalAfterSpeech;while(narrationWaiters.length)narrationWaiters.shift()();});
      assert.equal(await next(page).isEnabled(),true);await next(page).click();assert.equal((await state(page)).idx,1);
    });
    await scenario('first-time demonstrations continue automatically while the child controls a supported answer',async page=>{
      await page.evaluate(()=>{const K=KazuApp;K.Session._test.intro(true);K.Session.startLevel(K.Games.byId.count,0);K.Session._test.flushTimers(400);});
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'together');
      await page.evaluate(()=>document.querySelectorAll('#play .obj').forEach(n=>n.click()));await flush(page);
      await answerCount(page);await flush(page);assert.equal((await state(page)).idx,1);
      assert.equal((await state(page)).saved.results[1],'introdone');assert.equal(await next(page).isEnabled(),true);
      await next(page).click();assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),null);
    });
    await scenario('supported answers keep their grading and the child can rest after answering',async page=>{
      await prepareCount(page);await page.locator('#play .showbtn').click();await answerCount(page);await flush(page);
      assert.equal((await state(page)).saved.results[0],'miss');assert.equal((await state(page)).saved.firstTryRight,0);
      await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
      assert.equal((await state(page)).screen,'levels');assert.equal((await state(page)).saved.index,1);
      await page.evaluate(()=>KazuApp.Session.resume());assert.equal((await state(page)).idx,1);assert.equal((await state(page)).count,1);
    });
    await scenario('tracing completes by real pointer and reaches Next without waiting for idle reminders',async page=>{
      await page.evaluate(()=>{const K=KazuApp;for(let i=0;i<100;i++){K.Session.startLevel(K.Games.byId.trace,0);if(K.Session._test.item==='trace:trace:1')return;}throw Error('trace one');});
      const strokes=await page.locator('#play .trace-guide').evaluateAll(nodes=>nodes.map(n=>{
        const values=n.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number),points=[],m=n.ownerSVGElement.getScreenCTM();
        for(let i=0;i<values.length;i+=2)points.push({x:m.a*values[i]+m.c*values[i+1]+m.e,y:m.b*values[i]+m.d*values[i+1]+m.f});
        return points;
      }));
      for(const points of strokes){
        await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();
        for(const p of points.slice(1))await page.mouse.move(p.x,p.y,{steps:3});
        await page.mouse.up();
      }
      await page.waitForFunction(()=>KazuApp.Session._test.locked);
      await page.waitForFunction(()=>!document.querySelector('#play .answer-next').disabled,{},{timeout:4000});
      assert.equal((await state(page)).count,1);assert.equal((await state(page)).idx,0);
      await next(page).click();assert.equal((await state(page)).idx,1);
    });
    await scenario('an answer shown by the app waits for Next and remains a viewed, supported result',async page=>{
      await prepareCount(page);
      const answer=await page.evaluate(()=>KazuApp.Session._test.item.split(':').at(-1));
      for(let i=0;i<4;i++){
        await page.locator('#play .choices .choice').filter({hasNotText:new RegExp('^'+answer+'$')}).first().click();
        await flush(page);
      }
      await page.locator('#play .teachbtn').click();await flush(page);
      assert.equal((await state(page)).idx,0);assert.equal((await state(page)).count,1);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.taughtQ),true);
      assert.equal((await state(page)).saved.results[0],'miss');assert.equal((await state(page)).saved.firstTryRight,0);
      assert.equal(await page.evaluate(()=>KazuApp.Store.milestones().find(m=>m.gameId==='count'&&m.levelIndex===0).kind),'viewed');
      assert.equal(await next(page).isEnabled(),true);await next(page).click();assert.equal((await state(page)).idx,1);
    });
    await scenario('a completed picture and a 64px Next remain visible and operable at four screen sizes',async page=>{
      for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
        await page.setViewportSize(viewport);await page.evaluate(()=>KazuApp.Store.reset());
        await page.evaluate(()=>{const K=KazuApp;for(let i=0;i<500;i++){K.Session.startLevel(K.Games.byId.count,2);if(K.Session._test.item==='count:give:10'&&document.querySelectorAll('#play .obj').length===14)return;}throw Error('maximum collection');});
        await page.evaluate(()=>[...document.querySelectorAll('#play .obj')].slice(0,10).forEach(n=>n.click()));
        await page.locator('#play .choices > button').click();await flush(page);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const box=await next(page).boundingBox();assert.ok(box.width>=64&&box.height>=64);
        assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+.5&&box.y+box.height<=viewport.height+.5);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const picture=await page.locator('#play .give-board').boundingBox();assert.ok(picture.y+picture.height<=box.y+.5);
        await page.screenshot({path:`/tmp/math-youji-answer-pacing-${viewport.width}.png`,animations:'disabled'});
        await next(page).focus();await page.keyboard.press('Enter');assert.equal((await state(page)).idx,1);
      }
    });
    await scenario('the real parent setting persists and restores the automatic mode',async page=>{
      await page.evaluate(()=>{KazuApp.Parent.render();KazuApp.UI.show('parent');});
      const control=page.getByRole('button',{name:'正解後に自動で進む：オフ',exact:true});
      await control.scrollIntoViewIfNeeded();await control.click();assert.equal(await page.evaluate(()=>KazuApp.Store.data.autoAdvance),true);
      await page.evaluate(()=>KazuApp.Store.flush());await page.reload({waitUntil:'domcontentloaded'});await quiet(page);
      assert.equal(await page.evaluate(()=>KazuApp.Store.data.autoAdvance),true);
      await prepareCount(page);await answerCount(page);await flush(page);assert.equal((await state(page)).idx,1);
    });
    assert.deepEqual(errors,[]);console.log(`PASS ${passed} answer-pacing browser scenarios; browser exceptions: 0`);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
