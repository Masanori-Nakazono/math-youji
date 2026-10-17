#!/usr/bin/env node
'use strict';
// A keypad key can exist in the DOM while being entirely outside a phone.
// Check its complete bounds and real pointer input, using disposable storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript'});res.end(e?'not found':b);});
});
const viewports=[{width:320,height:568},{width:375,height:667},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1024,height:768}];
(async()=>{
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
      K.Sound.say=(text,opts)=>{if(opts&&opts.onend)opts.onend();};
      K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);
    });
    const settle=()=>page.evaluate(()=>new Promise(resolve=>{
      // End finite entry/answer animations before measuring the resting layout.
      document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect.getTiming().iterations))try{a.finish();}catch(e){}});
      requestAnimationFrame(()=>requestAnimationFrame(resolve));
    }));
    const start=async range=>{
      await page.evaluate(range=>{
        const K=KazuApp,S=K.Store;S.reset();S.setPref('g1Open',true);S.setPref('stars',{'ten:0':3});
        const key=range===0?'ten:ten:5':'g1teen:teen:15',at=range===0?'ten:1':'g1teen:0';
        S.noteFact(key,false,range===0?'5と5で10':'10と5で15',at);
        K.Session.startFocus([key],{n:1});
      },range);await settle();
      return page.evaluate(range=>range===0?10-Number(KazuApp.Session._test.item.split(':').at(-1)):Number(KazuApp.Session._test.item.split(':').at(-1)),range);
    };
    const geometry=()=>page.evaluate(()=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      const field=document.querySelector('#play .playfield'),pad=document.querySelector('#play .choices.pad'),prompt=document.querySelector('#play .prompt');
      return {viewport:{width:innerWidth,height:innerHeight},field:rect(field),pad:rect(pad),prompt:rect(prompt),
        controls:[...pad.querySelectorAll('button')].map(n=>{
          const r=rect(n),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),style=getComputedStyle(n);
          return {...r,text:n.textContent,active:!n.disabled&&style.pointerEvents!=='none',hit:top===n||n.contains(top)};
        }),fieldChildren:[...field.children].map(rect)};
    });
    const expectGeometry=async label=>{
      await settle();const g=await geometry();
      for(const key of g.controls){
        assert.ok(key.width>=63.9&&key.height>=63.9,label+' target stays at least 64px: '+key.text);
        assert.ok(key.x>=-.5&&key.y>=-.5&&key.right<=g.viewport.width+.5&&key.bottom<=g.viewport.height+.5,label+' key fully on screen: '+key.text+' '+JSON.stringify(key));
        if(key.active)assert.equal(key.hit,true,label+' active key centre receives pointer: '+key.text);
      }
      assert.ok(g.prompt.bottom<=g.field.y+1,label+' prompt stays above the problem');
      assert.ok(g.field.bottom<=g.pad.y+1,label+' problem and keypad do not overlap');
      for(const child of g.fieldChildren)assert.ok(child.y>=g.field.y-2&&child.bottom<=g.pad.y+2,label+' problem picture stays above keypad: '+JSON.stringify(g));
      return g;
    };
    let clicks=0;
    for(const viewport of viewports){
      await page.setViewportSize(viewport);
      for(const range of [0,10]){
        for(let key=range;key<=range+10;key++){
          const answer=await start(range),label=viewport.width+'px '+range+'–'+(range+10)+' key '+key;
          const g=await expectGeometry(label),target=g.controls.find(n=>n.text===String(key));
          await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
          assert.equal(await page.evaluate(()=>KazuApp.Session._test.wrongThisQ),key===answer?0:1,label+' real centre click is accepted');
          assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),key===answer?1:0,label+' correct click counts exactly once');
          await page.evaluate(()=>KazuApp.Session._test.flushTimers());clicks++;
        }
        await start(range);await page.locator('#play .showbtn').click();
        await expectGeometry(viewport.width+'px '+range+'–'+(range+10)+' manual hint');
        const answer=await page.evaluate(range=>range===0?10-Number(KazuApp.Session._test.item.split(':').at(-1)):Number(KazuApp.Session._test.item.split(':').at(-1)),range);
        const wrong=answer===range?answer+1:answer-1;
        for(let i=0;i<5;i++){
          await page.getByRole('button',{name:String(wrong),exact:true}).click();await page.evaluate(()=>KazuApp.Session._test.flushTimers());
        }
        assert.equal(await page.locator('#play .teachbtn').count(),1);
        await expectGeometry(viewport.width+'px '+range+'–'+(range+10)+' answer demonstration button');
        if(process.env.KEYPAD_SCREENSHOTS){fs.mkdirSync(process.env.KEYPAD_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.KEYPAD_SCREENSHOTS,`keypad-${viewport.width}-${range}.png`)});}
        await page.locator('#play .teachbtn').click();await page.evaluate(()=>KazuApp.Session._test.flushTimers());
        assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),1,'demonstration completes only one question');
      }
      console.log('PASS '+viewport.width+'×'+viewport.height+' both numeric ranges, hint and demonstration controls');
    }
    assert.equal(clicks,132);assert.deepEqual(errors,[]);
    console.log('PASS all 132 real key-centre clicks, sufficient tap targets and no browser errors');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
