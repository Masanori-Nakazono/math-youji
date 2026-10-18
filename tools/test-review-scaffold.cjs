#!/usr/bin/env node
'use strict';
// Disposable browser storage only: exercise the child-facing support controls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript'});res.end(e?'not found':b);});
});
(async()=>{
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const page=await browser.newPage({viewport:{width:1024,height:768},serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`,{waitUntil:'domcontentloaded'});
    const checks=await page.evaluate(()=>{
      const K=KazuApp,S=K.Store,R=K.TextbookReview,names=[],spoken=[];
      K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=text=>spoken.push(text);
      const check=(name,ok)=>{if(!ok)throw new Error(name);names.push(name);};
      const learningState=q=>{const {workspace,...learning}=q;return JSON.stringify(learning);};
      const click=sel=>{const b=document.querySelector('#review '+sel);if(!b)throw new Error('Missing '+sel);b.click();};
      const open=(id,step=0,edit=()=>{})=>{
        S.reset();S.setPref('secondRoundReached',true);if(id%4)S.addSticker('r2:'+(id-1));
        const q={...R.generate(id,step),lessonId:id,missed:false,supported:false,done:false,selected:[],pairs:[],active:0,values:[null,null,null],op:null,left:0,supportStage:0,wrongAttempts:0};edit(q);
        if(!S.saveReviewSession({at:Date.now(),run:{id,chapter:null,kind:'lesson',step,total:8,outcomes:Array(step).fill('independent'),key:'r2:'+id},q})||!R.resume())throw new Error('Invalid fixture '+id+':'+step);
      };
      const answer=()=>{
        if(document.querySelector('.review-hint[open]'))click('.review-try');
        let {q}=R.inspect();
        if(q.type==='match'){
          for(let i=0;i<q.a;i++)if(!q.pairs.some(p=>p[0]===i)){
            const j=Array.from({length:q.b},(_,j)=>j).find(j=>!q.pairs.some(p=>p[1]===j));
            click('[data-focus="target'+i+'"]');click('[data-focus="pair'+j+'"]');
          }
        }else if(q.type==='group'||q.type==='sumCards'){
          q.answer.forEach(i=>{if(!R.inspect().q.selected.includes(i))click('[data-focus="'+(q.type==='group'?'object':'card')+i+'"]');});
        }else if(q.type==='splitSmall'||q.type==='splitLarge'){
          while(R.inspect().q.left!==q.b)click('[aria-label="'+(R.inspect().q.left<q.b?'ひだりへ １つ':'みぎへ １つ')+'"]');
        }else if(q.cardinality){for(let i=0;i<q.n;i++)if(!R.inspect().q.selected.includes(i))click('[data-focus="order'+i+'"]');}
        else if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))click('[data-focus="'+(q.type==='subStory'?'story':'order')+q.answer+'"]');
        else if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){
          [q.a,q.b,q.answer].forEach((n,i)=>{click('[data-focus="field'+i+'"]');click('[data-number="'+n+'"]');});click('[aria-label="'+(q.expectedOp==='＋'?'たす':'ひく')+'"]');
        }else click('[data-number="'+q.answer+'"]');
        click('.review-check');
      };
      const quantityMeaning=()=>{
        const {q}=R.inspect(),scene=document.querySelector('.review-support-scene'),all=[...scene.querySelectorAll('.review-support-block')],aside=all.filter(b=>b.classList.contains('aside'));
        if(['count','zeroCount'].includes(q.type))return all.length===q.answer;
        if(q.type==='five'){
          const parts=[...scene.querySelectorAll('.review-support-part')];
          return parts[0].querySelectorAll('.review-support-block').length===5&&parts[1].querySelectorAll('.review-support-block').length===q.answer&&aside.length===0;
        }
        if(['hidden','makeTen','take'].includes(q.type))return all.length===q.a&&aside.length===q.b&&all.length-aside.length===q.answer;
        if(q.type==='subStory')return all.length===q.a&&aside.length===q.b&&q.stories[q.answer].text===q.a+'こ あって、'+q.b+'こ とりました。'&&!scene.textContent.includes('のこりを かぞえよう');
        if(q.type==='sequence'){
          const start=q.reverse?q.a+1:q.a-1;
          return q.supportStage<2?all.length===start:all.length-aside.length===q.answer&&aside.length===(q.reverse?1:0);
        }
        if(q.type==='difference'){
          const pairs=[...scene.querySelectorAll('.review-support-pair')];
          return pairs.length===q.a&&pairs.filter(p=>p.querySelectorAll('i').length===2).length===q.b&&pairs.filter(p=>p.querySelectorAll('i').length===1).length===q.answer;
        }
        if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){
          const parts=[...scene.querySelectorAll('.review-support-part')].map(p=>p.querySelectorAll('.review-support-block').length);
          return parts[0]===q.a&&parts[1]===q.b&&(q.expectedOp==='＋'?parts[0]+parts[1]:parts[0]-parts[1])===q.answer;
        }
        if(q.type==='sumCards')return all.length===q.a&&q.answer.every(i=>q.cards[i].a+q.cards[i].b===all.length);
        if(q.type==='splitSmall'||q.type==='splitLarge'){
          const parts=[...scene.querySelectorAll('.review-support-part')].map(p=>p.querySelectorAll('.review-support-block').length);
          return parts[0]===q.left&&parts[1]===q.a-q.left;
        }
        if(['horizontal','vertical','train','cardinal'].includes(q.type)){
          const cells=[...scene.querySelectorAll('.review-support-order>span')],first=cells.findIndex(n=>n.classList.contains('first'));
          return cells.length===q.a&&(q.supportStage<2||first===(q.reverse&&!q.cardinality?q.a-1:0))&&(q.cardinality||q.answer===(q.reverse?q.a-q.n:q.n-1));
        }
        return true;
      };
      const cases=[[0,0],[0,1],[1,0],[2,0],[3,0],[3,1],[4,0],[5,1],[6,0],[7,0],[7,1],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],[14,0],[15,0],[16,0],[17,0],[18,0],[19,0]];
      for(const [id,step] of cases){
        open(id,step);const type=R.inspect().q.type+(R.inspect().q.cardinality?'-quantity':''),before=S.todayCount();
        click('.review-actions .btn-ghost');
        check(type+': concrete hint opens without answering',R.inspect().q.supportStage===1&&!!document.querySelector('.review-support-scene')&&!R.inspect().q.done);
        check(type+': hint quantities describe the generated question',quantityMeaning());
        click('.review-model');
        const partial=learningState(S.reviewSession().q);
        check(type+': one-step support is checkpointed',S.reviewSession().q.supportStage===2&&R.inspect().q.supported&&!!document.querySelector('.review-reveal'));
        check(type+': model quantities still describe the correct operation',quantityMeaning());
        click('.review-try');click('.review-pause');const backup=S.exportText();S.reset();
        check(type+': backup and resume keep the exact support step and closed help',S.importText(backup,'replace').ok&&R.resume()&&learningState(R.inspect().q)===partial&&!document.querySelector('.review-hint[open]'));
        click('.review-check');
        check(type+': the example leaves an answer for the child',!R.inspect().q.done&&R.inspect().run.outcomes.length===step&&S.todayCount()===before);
        answer();
        check(type+': completing the child action records supported success',R.inspect().q.done&&R.inspect().run.outcomes.at(-1)==='supported'&&S.todayCount()===before+1);
        click('.review-pause');R.resume();check(type+': answered resume does not recount',S.todayCount()===before+1&&R.inspect().q.done);
      }
      for(const a of [6,10]){
        open(2,0,q=>{q.a=a;q.answer=a-5;q.prompt='５と あと いくつで '+a+'に なるかな？';});click('.review-actions .btn-ghost');click('.review-model');
        check('five '+a+' asks for the extra part, with five grouped separately',quantityMeaning()&&R.inspect().q.value===undefined&&R.inspect().q.hintText.includes('「あと」の ぶん')&&spoken.at(-1).endsWith(R.inspect().q.hintText)&&!document.querySelector('.review-support-scene').textContent.includes('よけた'));
        answer();check('five '+a+' accepts the extra count instead of the whole',R.inspect().q.done);
      }
      for(const reverse of [false,true])for(const a of [1,9]){
        open(3,reverse?3:1,q=>{q.a=a;q.answer=a;});click('.review-actions .btn-ghost');
        const start=reverse?a+1:a-1;
        check('sequence '+start+' begins with the displayed neighboring quantity',quantityMeaning()&&R.inspect().q.hintText.includes(start+'から、ひとつ '+(reverse?'へらして':'ふやして'))&&spoken.at(-1)===R.inspect().q.hintText);
        click('.review-model');check('sequence '+start+' changes exactly one block and leaves the numeric answer to the child',quantityMeaning()&&R.inspect().q.value===undefined);
        answer();check('sequence '+start+' reaches the missing number',R.inspect().q.done);
      }
      open(19);click('.review-actions .btn-ghost');click('.review-model');
      check('subtraction-story support depicts the starting and taken counts and requests a story',quantityMeaning()&&R.inspect().q.hintText.includes('おはなしを きいて えらぼう')&&spoken.at(-1).endsWith(R.inspect().q.hintText)&&R.inspect().q.selected.length===0&&!document.querySelector('.review-keypad'));
      open(8,0,q=>{q.b=1;q.answer=q.a-1;});click('.review-actions .btn-ghost');click('.review-model');
      check('a one-move split keeps the current plates and leaves the move to the child',R.inspect().q.left===0&&!document.querySelector('.review-keypad')&&quantityMeaning());
      answer();check('the child can finish the one-move split with the original controls',R.inspect().q.done&&R.inspect().run.outcomes.at(-1)==='supported');
      open(8,0,q=>{q.b=3;q.answer=q.a-3;});click('.review-actions .btn-ghost');click('.review-model');
      check('a longer split moves exactly one object',R.inspect().q.left===1);
      open(8,0,q=>{q.b=1;q.answer=q.a-1;q.left=3;});click('.review-actions .btn-ghost');click('.review-model');
      check('an overfilled left plate demonstrates a move back to the right',R.inspect().q.left===2&&document.querySelector('.review-support-spatial>span').textContent==='→'&&quantityMeaning());
      open(0);const q=R.inspect().q;q.answer.slice(0,2).forEach(i=>click('[data-focus="object'+i+'"]'));const already=R.inspect().q.selected.slice();
      click('.review-actions .btn-ghost');click('.review-model');check('a model preserves correct selections already made by the child',already.every(i=>R.inspect().q.selected.includes(i)));
      open(12);click('[data-number="'+R.inspect().q.a+'"]');const first=R.inspect().q.values[0];click('.review-actions .btn-ghost');click('.review-model');check('a model preserves a correct first operand and leaves other fields empty',R.inspect().q.values[0]===first&&R.inspect().q.values[1]===null&&R.inspect().q.values[2]===null&&R.inspect().q.op===null);
      click('.review-reveal');click('.review-try');click('.review-check');check('seeing all answers is a separate explicit supported action',R.inspect().q.done&&R.inspect().q.supportStage===3&&R.inspect().run.outcomes.at(-1)==='supported');
      open(0);const wrong=R.inspect().q.things.findIndex(v=>v!==R.inspect().q.thing);click('[data-focus="object'+wrong+'"]');
      click('.review-check');check('one wrong try gives specific feedback without automatically taking over',R.inspect().q.wrongAttempts===1&&!R.inspect().q.showHint&&document.querySelector('.review-feedback').textContent.includes('ちがう なかま'));
      click('.review-check');check('two wrong tries open concrete support without changing the answer',R.inspect().q.wrongAttempts===2&&R.inspect().q.supportStage===1&&R.inspect().q.selected.length===1&&R.inspect().q.selected[0]===wrong&&!!document.querySelector('.review-model'));
      click('.review-try');click('.review-check');click('.review-check');check('four wrong tries invite one-step support without executing it',R.inspect().q.wrongAttempts===4&&R.inspect().q.supportStage===1&&document.querySelector('.review-feedback').textContent.includes('ひとつ みてみる'));
      click('.review-model');const backup=S.exportText(),bad=JSON.parse(backup);bad.data.reviewSession.q.supportStage=4;
      check('an unknown support stage is rejected atomically',!S.importText(JSON.stringify(bad),'replace').ok&&S.reviewSession().q.supportStage===2);
      const badAttempts=JSON.parse(backup);badAttempts.data.reviewSession.q.wrongAttempts=-1;check('invalid support attempt counters are rejected',!S.importText(JSON.stringify(badAttempts),'replace').ok);
      const legacy=JSON.parse(backup);delete legacy.data.reviewSession.q.supportStage;delete legacy.data.reviewSession.q.wrongAttempts;
      check('old hint checkpoints remain readable',S.importText(JSON.stringify(legacy),'replace').ok&&R.resume()&&R.inspect().q.supported&&!!document.querySelector('.review-model'));
      answer();check('legacy supported work never becomes independent after resume',R.inspect().run.outcomes.at(-1)==='supported');
      open(1);for(let i=0;i<3;i++)click('.review-check');check('incomplete input does not escalate hints or count as a wrong answer',!R.inspect().q.missed&&R.inspect().q.wrongAttempts===0&&!R.inspect().q.supported);
      open(0);click('.review-actions .btn-ghost');click('.review-model');S.flush();
      return names;
    });
    console.log('PASS one-step support and supported grading for 23 question variants');
    checks.filter(n=>!n.includes(':')).forEach(n=>console.log('PASS '+n));
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>KazuApp.TextbookReview.resume()&&KazuApp.TextbookReview.inspect().q.supportStage===2&&!!document.querySelector('.review-reveal')),true);
    console.log('PASS one-step support survives an actual page reload');
    for(const width of [1024,390,320]){
      await page.setViewportSize({width,height:844});
      for(const id of [0,2,3,4,5,8,10,12,18,19]){
        await page.evaluate(id=>{
          const K=KazuApp,S=K.Store,R=K.TextbookReview;K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=()=>{};
          S.clearReviewSession();S.setPref('secondRoundReached',true);if(id%4)S.addSticker('r2:'+(id-1));R.open(id);
          if(id===3){document.querySelector('#review [data-number="0"]').click();document.querySelector('.review-check').click();document.querySelector('.review-next').click();}
          document.querySelector('#review .review-actions .btn-ghost').click();document.querySelector('.review-model').click();
        },id);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.review-body').scrollWidth<=document.querySelector('.review-body').clientWidth+1),true,'no support overflow '+width+' lesson '+id);
        if([2,8,12].includes(id))assert.equal(await page.evaluate(()=>{
          const parts=[...document.querySelectorAll('.review-support-spatial .review-support-part')].map(n=>n.getBoundingClientRect());
          return parts.length===2&&parts[1].left>=parts[0].right;
        }),true,'spatial hints preserve left and right '+width+' lesson '+id);
        await page.locator('.review-reveal').scrollIntoViewIfNeeded();assert.equal(await page.locator('.review-reveal').isVisible(),true);
        if(process.env.REVIEW_SCREENSHOTS){fs.mkdirSync(process.env.REVIEW_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.REVIEW_SCREENSHOTS,`support-${width}-${id}.png`)});}
      }
    }
    assert.deepEqual(errors,[]);console.log('PASS support controls fit desktop and 390/320px phones; no browser errors');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
