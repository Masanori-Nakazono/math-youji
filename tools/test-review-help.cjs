#!/usr/bin/env node
'use strict';
// Real pointer clicks, silent audio and disposable storage: help must be usable
// immediately, including on questions whose answer controls are far down the page.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript'});res.end(e?'not found':b);});
});
const cases=[[0,0],[0,1],[1,0],[2,0],[3,0],[3,1],[4,0],[5,1],[6,0],[7,0],[7,1],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0]];
(async()=>{
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const page=await browser.newPage({viewport:{width:1024,height:768},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`,{waitUntil:'domcontentloaded'});
    const open=async(id,step=0,edit=null)=>page.evaluate(({id,step,edit})=>{
      const K=KazuApp,S=K.Store,R=K.TextbookReview;K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=()=>{};
      S.reset();S.setPref('secondRoundReached',true);if(id%4)S.addSticker('r2:'+(id-1));
      const q={...R.generate(id,step),lessonId:id,missed:false,supported:false,done:false,selected:[],pairs:[],active:0,values:[null,null,null],op:null,left:0,supportStage:0,wrongAttempts:0};
      if(edit)Object.assign(q,edit);
      if(!S.saveReviewSession({at:Date.now(),run:{id,chapter:null,kind:'lesson',step,total:8,outcomes:Array(step).fill('independent'),key:'r2:'+id},q})||!R.resume())throw Error('invalid fixture '+id+':'+step);
    },{id,step,edit});
    const state=()=>page.evaluate(()=>JSON.parse(JSON.stringify(KazuApp.TextbookReview.inspect())));
    const click=sel=>page.locator('#review '+sel).click();
    const help=()=>click('.review-actions .btn-ghost:not(.review-pause)');
    const visible=async(sel,label)=>assert.equal(await page.locator(sel).evaluate(n=>{
      const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;
    }),true,label);
    const helpFits=async(label)=>{
      await visible('.review-hint[open]',label+' sheet');
      await visible('.review-model, .review-reveal',label+' support action');
      await visible('.review-try',label+' return action');
      assert.equal(await page.locator('.review-help-content').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true,label+' no horizontal overflow');
      assert.equal(await page.evaluate(()=>document.activeElement.closest('.review-hint')!==null),true,label+' keyboard focus stays in help');
    };
    const answer=async()=>{
      const {q}=await state();
      if(q.type==='match'){
        for(let i=0;i<q.a;i++){
          const live=(await state()).q;if(live.pairs.some(p=>p[0]===i))continue;
          const j=Array.from({length:q.b},(_,j)=>j).find(j=>!live.pairs.some(p=>p[1]===j));
          await click('[data-focus="target'+i+'"]');await click('[data-focus="pair'+j+'"]');
        }
      }else if(q.type==='group'||q.type==='sumCards'){
        for(const i of q.answer)if(!(await state()).q.selected.includes(i))await click('[data-focus="'+(q.type==='group'?'object':'card')+i+'"]');
      }else if(q.type==='splitSmall'||q.type==='splitLarge'){
        while((await state()).q.left!==q.b)await click('[aria-label="'+((await state()).q.left<q.b?'ひだりへ １つ':'みぎへ １つ')+'"] >> nth=0');
      }else if(q.cardinality){for(let i=0;i<q.n;i++)if(!(await state()).q.selected.includes(i))await click('[data-focus="order'+i+'"]');}
      else if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))await click('[data-focus="'+(q.type==='subStory'?'story':'order')+q.answer+'"]');
      else if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){
        for(const [i,n] of [q.a,q.b,q.answer].entries()){await click('[data-focus="field'+i+'"]');await click('[data-number="'+n+'"]');}
        await click('[aria-label="'+(q.expectedOp==='＋'?'たす':'ひく')+'"]');
      }else await click('[data-number="'+q.answer+'"]');
      await click('.review-check');assert.equal((await state()).q.done,true,'child can answer '+q.type);
      assert.equal((await state()).run.outcomes.at(-1),'supported','help remains supported '+q.type);
    };
    for(const width of [1024,390]){
      await page.setViewportSize({width,height:width===1024?768:844});
      for(const [id,step] of cases){
        await open(id,step);const name=(await state()).q.type+' '+width;
        await help();await helpFits(name+' hint');
        assert.equal(await page.locator('#review-help-prompt').textContent(),(await state()).q.prompt);
        await click('.review-model');await helpFits(name+' model');
        assert.equal((await state()).q.supportStage,2);
        await click('.review-try');assert.equal(await page.locator('.review-hint[open]').count(),0);
        assert.equal(await page.evaluate(()=>{
          const n=document.activeElement,r=n.getBoundingClientRect();return n.closest('.review-scene,.review-keypad')!==null&&r.top>=0&&r.bottom<=innerHeight;
        }),true,name+' return focuses a visible real answer control');
        await answer();
      }
      console.log('PASS 23 silent hint/model/return/child-answer flows at '+width+'px');
    }
    // The support picture must follow the child's current plates, not a new split.
    await open(8,0,{a:5,b:1,answer:4,left:3,prompt:'ひだりを １こに しよう。'});
    const platesAgree=()=>page.evaluate(()=>{
      const q=KazuApp.TextbookReview.inspect().q;
      const parts=[...document.querySelectorAll('.review-support-part')].map(n=>n.querySelectorAll('.review-support-block').length);
      const original=[...document.querySelectorAll('.review-plate strong')].map(n=>Number(n.textContent.match(/\d+/)[0]));
      return JSON.stringify(parts)===JSON.stringify([q.left,q.a-q.left])&&JSON.stringify(parts)===JSON.stringify(original);
    });
    await help();assert.equal(await platesAgree(),true);
    await click('.review-model');assert.equal((await state()).q.left,2);assert.equal(await platesAgree(),true);
    await click('.review-try');await click('[aria-label="みぎへ １つ"] >> nth=0');await help();assert.equal(await platesAgree(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.review-hint[open]').count(),0);
    assert.equal((await state()).q.left,1);await click('.review-check');assert.equal((await state()).q.done,true);
    console.log('PASS plate help follows partial work, model, further child moves and Escape');
    // Help appearing automatically must be visible too, without consuming the answer.
    await open(1);const wrong=((await state()).q.answer+1)%11;
    await click('[data-number="'+wrong+'"]');await click('.review-check');await click('.review-check');
    await helpFits('automatic help');assert.equal((await state()).q.value,wrong);assert.equal((await state()).q.supportStage,1);
    await click('.review-model');const exact=(await state()).q;
    await page.evaluate(()=>KazuApp.Store.flush());await page.reload({waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{KazuApp.Sound.voiceOn=false;KazuApp.Sound.sfxOn=false;KazuApp.Sound.say=()=>{};KazuApp.TextbookReview.resume();});
    await helpFits('reloaded help');assert.deepEqual((await state()).q,exact);await click('.review-try');await answer();
    console.log('PASS automatic and reloaded help preserve exact work and supported grading');
    for(const width of [320,390,1024]){
      await page.setViewportSize({width,height:width===1024?600:568});
      await open(5,0,{a:10,n:8,answer:7,reverse:false,cardinality:false,prompt:'うえから ８ばんめを えらぼう。'});
      await help();await helpFits('long vertical help '+width);await click('.review-model');await helpFits('long vertical model '+width);
      if(process.env.REVIEW_HELP_SCREENSHOTS){fs.mkdirSync(process.env.REVIEW_HELP_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.REVIEW_HELP_SCREENSHOTS,'help-'+width+'.png')});}
    }
    assert.deepEqual(errors,[]);console.log('PASS long help keeps actions visible at 320/390/1024px; no browser errors');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
