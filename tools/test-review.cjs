#!/usr/bin/env node
'use strict';
// Drive the portable app in isolated storage with external network blocked.
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
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
    page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER '+e.message);});await page.route('https://**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`,{waitUntil:'domcontentloaded'});
    const checks=await page.evaluate(()=>{
      const K=KazuApp,S=K.Store,R=K.SecondRound,names=[];
      K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=()=>{};
      const check=(name,ok)=>{if(!ok)throw new Error(name);names.push(name);};
      const click=sel=>{const b=document.querySelector('#review '+sel);if(!b)throw new Error('Missing '+sel);b.click();};
      const text=t=>{const b=[...document.querySelectorAll('#review button')].find(b=>b.textContent===t);if(!b)throw new Error('Missing '+t);b.click();};
      const answer=()=>{
        const {q}=R.inspect();
        if(q.type==='match'){for(let i=0;i<q.a;i++){click('[data-focus="target'+i+'"]');click('[data-focus="pair'+i+'"]');}}
        else if(q.type==='group'||q.type==='sumCards')q.answer.forEach(i=>click('[data-focus="'+(q.type==='group'?'object':'card')+i+'"]'));
        else if(q.type==='splitSmall'||q.type==='splitLarge'){for(let i=0;i<q.b;i++)click('[aria-label="ひだりへ １つ"]');}
        else if(q.cardinality){for(let i=0;i<q.n;i++)click('[data-focus="order'+i+'"]');}
        else if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))click('[data-focus="'+(q.type==='subStory'?'story':'order')+q.answer+'"]');
        else if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){
          click('[data-focus="field0"]');click('[data-number="'+q.a+'"]');click('[data-number="'+q.b+'"]');click('[data-number="'+q.answer+'"]');click('[aria-label="'+(q.expectedOp==='＋'?'たす':'ひく')+'"]');
        }else click('[data-number="'+q.answer+'"]');
        click('.review-check');check('accepted '+q.type,!!document.querySelector('.review-next'));
      };
      const finish=(supported=0,wrong=0)=>{
        const total=R.inspect().run.total;
        for(let step=0;step<total;step++){
          if(step<supported){text('👀 ヒント');text('いっしょに やってみる');click('.review-check');}
          else {if(step<supported+wrong){const {q}=R.inspect();click('[data-number="'+((q.answer+1)%11)+'"]');click('.review-check');}answer();}
          click('.review-next');
        }
      };
      S.reset();R.open();check('new child cannot bypass the original collection gate',K.UI.currentName()!=='review'&&!R.unlocked());
      const gate=R.progress().groups.flatMap(g=>g.keys),oldNames=gate.map(K.stickerFor),normal=gate.filter(k=>!k.endsWith(':g')&&!/^(treasure|transfer):/.test(k));
      check('frozen gate has exactly 60 normal, 60 gold, 5 treasure and 6 special slots',new Set(gate).size===131&&JSON.stringify(R.progress().groups.map(g=>g.total))==='[60,60,5,6]');
      const old=JSON.parse(S.exportText());delete old.data.secondRoundReached;delete old.data.reviewRecords;
      check('legacy backup uses safe review defaults',S.importText(JSON.stringify(old),'replace').ok&&!S.data.secondRoundReached&&Object.keys(S.data.reviewRecords).length===0);
      gate.filter(k=>!k.startsWith('treasure:')&&k!==normal.at(-1)).forEach(k=>S.addSticker(k));
      S.addPending(normal.at(-1));S.addSticker('daily:extra');S.addSticker('r2:19');
      check('provisional normal and participation/new rewards do not count toward 131',R.progress().got===125&&!R.unlocked());
      K.WORLDS.forEach(w=>S.claimTreasure(w.id));
      check('all rewards but a provisional final normal remains locked at 130',R.progress().got===130&&!R.unlocked());
      S.confirmSticker(normal.at(-1));check('all 131 confirmed originals open the back',R.unlocked()&&S.data.secondRoundReached);
      S.setPref('stickers',S.data.stickers.filter(k=>k!=='r2:19'));
      check('original Pokémon identities are unchanged',gate.every((k,i)=>K.stickerFor(k)===oldNames[i]));
      K.PokemonStickers.manifest.slots['future:0']={id:9999,rarity:2};
      check('catalog additions cannot change the original gate',R.progress().total===131&&R.unlocked());delete K.PokemonStickers.manifest.slots['future:0'];
      const front=JSON.stringify([S.data.stars,S.data.facts,S.data.recent,S.data.firstTry]);
      K.Home.render();K.UI.show('home');document.querySelector('.review-home').click();
      check('home opens 20 lessons in five textbook chapters ('+document.querySelectorAll('.review-lesson').length+'/'+document.querySelectorAll('.review-summary').length+')',document.querySelectorAll('.review-lesson').length===20&&document.querySelectorAll('.review-summary').length===5);
      check('later lesson cannot be entered by a direct call',!R.lessonOpen(1));R.open(1);check('locked direct call keeps the menu visible',!R.inspect());
      R.open(0);click('.topbar button');check('back asks before abandoning an unfinished lesson',!!document.querySelector('.review-exit'));click('.topbar button');check('abandoning awards nothing',!S.hasSticker('r2:0')&&!S.data.reviewRecords['r2:0']);
      R.open(0);finish(8);check('all-supported completion earns no sticker but keeps the observations',!S.hasSticker('r2:0')&&S.data.reviewRecords['r2:0'].supported===8);
      R.open(0);finish(4);check('4/8 clean answers award a provisional sticker',S.isPending('r2:0')&&S.data.reviewRecords['r2:0'].independent===4);R.open();check('provisional menu cards wait for color',!!document.querySelector('.review-lesson-slot.pending'));check('summary stays locked while a chapter has provisional lessons',!R.chapterReady(0));
      R.open(0);finish(4);check('same-day partial replay cannot confirm a provisional sticker',S.isPending('r2:0'));
      S.data.pending['r2:0'][0]=S.dayNumber()-1;R.open();text('３もん たしかめる');finish(2);check('failed next-day check keeps the sticker provisional',S.isPending('r2:0')&&S.checkFailed('r2:0'));
      R.open(0);finish();check('all 8 clean answers confirm a provisional sticker',S.hasConfirmed('r2:0'));
      R.open(1);click('.review-check');check('empty answer asks for input without marking a mistake',!R.inspect().q.missed);
      finish(1,1);check('hints and answer revisions are separate observations',S.data.reviewRecords['r2:1'].supported===1&&S.data.reviewRecords['r2:1'].revised===1&&S.isPending('r2:1'));
      R.open(1);finish();
      for(let id=2;id<20;id++){
        check('lesson progression opens '+id,R.lessonOpen(id));R.open(id);finish();check('lesson '+id+' earns its unique confirmed reward',S.hasConfirmed('r2:'+id));
        if(id===3){R.open(null,0);finish(2);check('3/5 clean chapter answers earn no summary medal',!S.hasSticker('r2chapter:0'));}
      }
      for(let i=0;i<5;i++){check('summary waits for four confirmed lessons '+i,R.chapterReady(i));R.open(null,i);const seen=[];for(let n=0;n<5;n++){seen.push(R.inspect().q.lessonId);if(n===0){text('👀 ヒント');text('いっしょに やってみる');click('.review-check');}else answer();click('.review-next');}check('4/5 clean answers earn chapter '+i,S.hasSticker('r2chapter:'+i));check('summary revisits an earlier chapter '+i,i===0||seen[4]===i*4-1);}
      check('second round never rewrites first-round mastery',front===JSON.stringify([S.data.stars,S.data.facts,S.data.recent,S.data.firstTry]));
      check('25 new species are unique and absent from all original slots',R.rewardKeys().length===25&&new Set(R.rewardKeys().map(k=>K.PokemonStickers.reward(k).id)).size===25&&R.rewardKeys().every(k=>!gate.some(o=>K.PokemonStickers.reward(k).id===K.PokemonStickers.reward(o).id)));
      check('every solved question contributes once to today',S.todayCount()===8*24+3+5*6); // 24 lesson runs, one check, six summaries
      R.open(10);const width=document.querySelector('.review-hidden').getBoundingClientRect().width;const q1=R.inspect().q;check('hidden answer is absent from hidden DOM before solving',document.querySelector('.review-hidden').textContent==='？');answer();check('hidden cover has fixed capacity before and after reveal',width===document.querySelector('.review-hidden').getBoundingClientRect().width);click('.review-next');check('the next hidden problem uses the same capacity',width===document.querySelector('.review-hidden').getBoundingClientRect().width);
      const backup=S.exportText();S.reset();check('backup restores review rewards, progress and unlock latch',S.importText(backup,'replace').ok&&R.unlocked()&&S.hasConfirmed('r2:19')&&S.data.reviewRecords['r2chapter:4'].independent===4);
      S.importText(backup);S.importText(backup);check('repeated merges do not inflate review attempts or rewards',S.data.reviewRecords['r2:0'].runs===5&&R.rewardKeys().filter(k=>S.hasSticker(k)).length===25);
      const bad=JSON.parse(backup);bad.data.reviewRecords['r2:0'].supported=9;check('malformed review records are rejected atomically',!S.importText(JSON.stringify(bad),'replace').ok&&S.data.reviewRecords['r2:0'].independent===8);
      const unknown=JSON.parse(backup);unknown.data.reviewRecords['r2:99']=unknown.data.reviewRecords['r2:0'];check('unknown lesson records cannot corrupt the parent page',!S.importText(JSON.stringify(unknown)).ok);
      const newer=JSON.parse(backup);newer.data.reviewRecords['r2:0']={...newer.data.reviewRecords['r2:0'],at:Date.now()+10000,independent:0,supported:8};S.importText(JSON.stringify(newer));check('newest actual run wins a same-day merge without losing acquired progress',S.data.reviewRecords['r2:0'].supported===8&&S.hasConfirmed('r2:0'));
      S.putWorldSticker('r2chapter:0',40,40);K.StickerWorld.open('r2chapter:0');check('new chapter Pokémon can decorate the island',!!document.querySelector('.world-sticker [data-sticker-key="r2chapter:0"]'));
      K.Book.open();check('book contains the 25 new reward cards',document.querySelectorAll('.review-collectible').length===25);check('book count includes the five opened chest rewards',document.querySelector('#book .aim b').textContent==='157まい');
      check('parent page reports actual supported runs',R.parentSummary().textContent.includes('ヒント・見本を使用 8問'));
      let hasZero=false,hasZeroZero=false;
      for(let id=0;id<20;id++)for(let step=0;step<40;step++){
        const p=R.generate(id,step);if(p.type==='zeroCount'&&p.a===0)hasZero=true;if(p.type==='zeroAdd'&&p.a===0&&p.b===0)hasZeroZero=true;
        if(p.type==='sumCards'&&p.answer.length!==2)throw new Error('ambiguous matching cards');
        if(typeof p.answer==='number'&&(p.answer<0||p.answer>10))throw new Error('out of range answer');
      }
      check('problem bank includes zero and 0+0; generated answers stay in range',hasZero&&hasZeroZero);
      S.setPref('stickers',S.data.stickers.filter(k=>!gate.includes(k)));check('once-unlocked latch survives catalog growth and merged older data',R.unlocked());S.importText(backup);S.flush();
      return names;
    });
    // Keep output compact despite exercising every question through the UI.
    checks.filter(n=>!n.startsWith('accepted ')).forEach(n=>console.log('PASS '+n));
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>KazuApp.Store.data.secondRoundReached&&KazuApp.Store.hasSticker('r2:19')&&!!KazuApp.Store.stickerWorld().items['r2chapter:0']),true);
    console.log('PASS review progress and island placement survive reload');
    const dir=process.env.REVIEW_SCREENSHOTS;if(dir)fs.mkdirSync(dir,{recursive:true});
    for(const size of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:740}]){
      await page.setViewportSize(size);
      for(const id of [null,0,3,4,5,8,10,12,14,18,19]){
        await page.evaluate(id=>{KazuApp.Sound.voiceOn=false;KazuApp.Sound.sfxOn=false;KazuApp.SecondRound.open(id);},id);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.review-body').scrollWidth<=document.querySelector('.review-body').clientWidth+1),true,'no body overflow '+size.width+' lesson '+id);
        if(id!==null){await page.locator('.review-check').scrollIntoViewIfNeeded();assert.equal(await page.locator('.review-check').isVisible(),true);}
        if(dir)await page.screenshot({path:path.join(dir,`${size.width}-${id===null?'menu':id}.png`)});
        if([0,3,7].includes(id)){
          await page.evaluate(()=>{const tap=t=>[...document.querySelectorAll('#review button')].find(b=>b.textContent===t).click();tap('👀 ヒント');tap('いっしょに やってみる');document.querySelector('.review-check').click();document.querySelector('.review-next').click();});
          assert.equal(await page.evaluate(()=>document.querySelector('.review-body').scrollWidth<=document.querySelector('.review-body').clientWidth+1),true,'alternate representation fits '+size.width+' lesson '+id);
          if(dir)await page.screenshot({path:path.join(dir,`${size.width}-${id}-variant.png`)});
        }
      }
    }
    await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>KazuApp.SecondRound.open(12));
    if(dir)await page.screenshot({path:path.join(dir,'dark.png')});
    const dark=await page.evaluate(()=>({body:getComputedStyle(document.querySelector('.review-body')).color,field:getComputedStyle(document.querySelector('.review-field')).color,heading:getComputedStyle(document.querySelector('#review h2')).color,tray:getComputedStyle(document.querySelector('.review-tray-label')).color,progress:getComputedStyle(document.querySelector('.review-progress')).color}));
    assert.equal(dark.body,dark.field,JSON.stringify(dark));assert.equal(dark.body,dark.heading,JSON.stringify(dark));assert.equal(dark.body,dark.tray,JSON.stringify(dark));assert.equal(dark.body,dark.progress,JSON.stringify(dark));
    if(dir)await page.screenshot({path:path.join(dir,'dark.png')});
    assert.deepEqual(errors,[]);console.log('PASS tablet, phone, narrow phone and dark layouts; no browser errors');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
