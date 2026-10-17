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
      const K=KazuApp,S=K.Store,R=K.TextbookReview,names=[];
      K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=()=>{};
      const check=(name,ok)=>{if(!ok)throw new Error(name);names.push(name);};
      const click=sel=>{const b=document.querySelector('#review '+sel);if(!b)throw new Error('Missing '+sel);b.click();};
      const text=t=>{const b=[...document.querySelectorAll('#review button')].find(b=>b.textContent===t);if(!b)throw new Error('Missing '+t);b.click();};
      const answer=()=>{
        const {q}=R.inspect();
        check('checkpoint supports '+q.type,S.reviewSession()?.q.type===q.type);
        if(q.type==='match'){for(let i=0;i<q.a;i++){click('[data-focus="target'+i+'"]');click('[data-focus="pair'+i+'"]');}}
        else if(q.type==='group'||q.type==='sumCards')q.answer.forEach(i=>click('[data-focus="'+(q.type==='group'?'object':'card')+i+'"]'));
        else if(q.type==='splitSmall'||q.type==='splitLarge'){for(let i=0;i<q.b;i++)click('[aria-label="ひだりへ １つ"]');}
        else if(q.cardinality){for(let i=0;i<q.n;i++)click('[data-focus="order'+i+'"]');}
        else if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))click('[data-focus="'+(q.type==='subStory'?'story':'order')+q.answer+'"]');
        else if(['combine','increase','zeroAdd','subEquation'].includes(q.type)){
          click('[data-focus="field0"]');click('[data-number="'+q.a+'"]');click('[data-number="'+q.b+'"]');click('[data-number="'+q.answer+'"]');click('[aria-label="'+(q.expectedOp==='＋'?'たす':'ひく')+'"]');
        }else click('[data-number="'+q.answer+'"]');
        click('.review-check');check('accepted '+q.type,!!document.querySelector('.review-next'));check('checkpoint keeps answered '+q.type,S.reviewSession()?.q.done===true);
      };
      const finish=(supported=0,wrong=0)=>{
        const total=R.inspect().run.total;
        for(let step=0;step<total;step++){
          if(step<supported){text('👀 ヒント');text('ひとつ みてみる');text('こたえを みる');click('.review-try');click('.review-check');}
          else {if(step<supported+wrong){const {q}=R.inspect();click('[data-number="'+((q.answer+1)%11)+'"]');click('.review-check');}answer();}
          click('.review-next');
        }
      };
      S.reset();R.open();check('new child cannot bypass related preparation',K.UI.currentName()!=='review'&&!R.unlocked());
      const gate=R.progress().groups.flatMap(g=>g.keys),oldNames=gate.map(K.stickerFor),normal=gate.filter(k=>!k.endsWith(':g')&&!/^(treasure|transfer):/.test(k));
      check('frozen gate has exactly 60 normal, 60 gold, 5 treasure and 6 special slots',new Set(gate).size===131&&JSON.stringify(R.progress().groups.map(g=>g.total))==='[60,60,5,6]');
      const old=JSON.parse(S.exportText());delete old.data.secondRoundReached;delete old.data.reviewRecords;delete old.data.reviewChaptersOpen;delete old.data.reviewSession;
      check('legacy backup uses safe review defaults',S.importText(JSON.stringify(old),'replace').ok&&!S.data.secondRoundReached&&Object.keys(S.data.reviewRecords).length===0);
      R.preparation(0).forEach(p=>{S.addSticker(p.game.id+':'+p.levelIndex+':g');S.addPending(p.game.id+':'+p.levelIndex);});
      check('gold and provisional collection alone do not open related preparation',!R.unlocked());
      S.reset();R.preparation(0).forEach(p=>{S.data.recent[p.game.id+':'+p.levelIndex]='111111';});
      check('sustained retrieval opens a chapter without collecting gold or ordinary rewards',R.chapterOpen(0)&&R.lessonOpen(0)&&!R.lessonOpen(1)&&!R.chapterOpen(1)&&S.data.stickers.length===0&&!S.data.secondRoundReached);
      R.open(4);check('direct calls cannot bypass another chapter preparation',!R.inspect());
      const early=S.exportText();S.data.recent={};check('opened chapter remains available after later errors',R.chapterOpen(0));
      S.reset();S.importText(early,'replace');S.data.recent={};S.importText(JSON.stringify(old));check('backup replacement and merging preserve opened chapter entrances',R.chapterOpen(0));
      const malformed=JSON.parse(early);malformed.data.reviewChaptersOpen['5']=1;check('unknown chapter entrances are rejected atomically',!S.importText(JSON.stringify(malformed),'replace').ok&&R.chapterOpen(0));
      for(let i=0;i<5;i++){
        S.reset();R.preparation(i).forEach(p=>S.addSticker(p.game.id+':'+p.levelIndex));
        check('chapter '+i+' opens independently from its related preparation',R.chapterOpen(i)&&R.lessonOpen(i*4)&&!R.lessonOpen(i*4+1)&&!S.data.secondRoundReached);
        check('chapter '+i+' does not open unrelated chapters',R.chapters.every((c,j)=>i===j||!R.chapterOpen(j)));
      }
      S.reset();S.setPref('secondRoundReached',true);check('legacy whole-book entrances remain open',R.chapters.every((c,i)=>R.chapterOpen(i)));
      S.reset();S.addSticker('r2:9');check('legacy textbook work preserves its own chapter and lesson',R.chapterOpen(2)&&R.lessonOpen(9)&&!R.chapterOpen(0));
      S.reset();
      gate.filter(k=>!k.startsWith('treasure:')&&k!==normal.at(-1)).forEach(k=>S.addSticker(k));
      S.addPending(normal.at(-1));S.addSticker('daily:extra');S.addSticker('r2:19');
      check('provisional normal and participation/new rewards do not count toward 131',R.progress().got===125);
      K.WORLDS.forEach(w=>S.claimTreasure(w.id));
      check('collection remains at 130 while the final normal is provisional',R.progress().got===130&&R.unlocked());
      S.confirmSticker(normal.at(-1));check('all 131 originals remain part of full-lap collection',R.progress().got===131&&!K.Rounds.unlocked());
      S.setPref('stickers',S.data.stickers.filter(k=>k!=='r2:19'));
      check('original Pokémon identities are unchanged',gate.every((k,i)=>K.stickerFor(k)===oldNames[i]));
      K.PokemonStickers.manifest.slots['future:0']={id:9999,rarity:2};
      check('catalog additions cannot change the original gate',R.progress().total===131&&R.unlocked());delete K.PokemonStickers.manifest.slots['future:0'];
      const front=JSON.stringify([S.data.stars,S.data.facts,S.data.recent,S.data.firstTry]);
      K.Home.render();K.UI.show('home');document.querySelector('.review-home').click();
      check('home opens 20 lessons in five textbook chapters ('+document.querySelectorAll('.review-lesson').length+'/'+document.querySelectorAll('.review-summary').length+')',document.querySelectorAll('.review-lesson').length===20&&document.querySelectorAll('.review-summary').length===5);
      check('later lesson cannot be entered by a direct call',!R.lessonOpen(1));R.open(1);check('locked direct call keeps the menu visible',!R.inspect());
      const beforeResume=S.exportText();
      R.open(0);const exact=JSON.parse(JSON.stringify(R.inspect().q));click('.review-pause');check('pausing saves a lesson without awarding mastery',!!R.pendingSummary()&&!S.hasSticker('r2:0')&&!S.data.reviewRecords['r2:0']);
      const protectedVisit=JSON.stringify(S.reviewSession());R.open(4);
      check('choosing another lesson preserves the old visit while asking what to do',!R.inspect()&&!!document.querySelector('.review-start-choice')&&JSON.stringify(S.reviewSession())===protectedVisit);
      click('.review-start-cancel');check('canceling a new lesson keeps the original checkpoint',!!document.querySelector('.review-menu-intro')&&JSON.stringify(S.reviewSession())===protectedVisit);
      R.open(4);click('.review-start-resume');check('the choice can return to the original lesson',R.inspect().run.id===0);
      click('.review-pause');
      check('resuming restores the same original question',R.resume()&&JSON.stringify(R.inspect().q,Object.keys(exact).sort())===JSON.stringify(exact,Object.keys(exact).sort()));
      text('👀 ヒント');click('.review-try');click('.topbar button');const paused=S.exportText();S.reset();S.importText(paused,'replace');
      check('backup replacement restores hint and unfinished lesson',R.resume()&&R.inspect().q.supported&&R.inspect().q.showHint);
      text('ひとつ みてみる');text('こたえを みる');click('.review-try');click('.review-check');const one=S.todayCount();click('.review-pause');R.resume();
      check('resuming an answered question does not count it twice',R.inspect().q.done&&S.todayCount()===one&&R.pendingSummary().remaining===7);
      click('.review-pause');R.open(4);click('.review-start-new');
      check('only an explicit new choice replaces a saved lesson without removing answered effort',R.inspect().run.id===4&&S.reviewSession().run.id===4&&S.todayCount()===one);
      S.importText(paused,'replace');R.resume();text('ひとつ みてみる');text('こたえを みる');click('.review-try');click('.review-check');
      const damaged=JSON.parse(S.exportText());damaged.data.reviewSession.run.outcomes=[];
      check('malformed resumed outcomes are rejected without losing history',!S.importText(JSON.stringify(damaged),'replace').ok&&S.todayCount()===one);
      S.clearReviewSession();S.importText(paused);check('merging an old backup cannot resurrect a finished or dismissed visit',!R.pendingSummary());
      S.importText(beforeResume,'replace');
      R.open(0);for(let step=0;step<8;step++){answer();if(step<7)click('.review-next');}
      check('a fully answered lesson keeps its final cursor until the result is received',R.pendingSummary().remaining===0&&!S.hasSticker('r2:0')&&S.todayCount()===8);
      R.open(4);check('choosing a new lesson first completes the old final cursor and awards its earned sticker',!!document.querySelector('.review-result')&&S.hasConfirmed('r2:0')&&S.data.reviewRecords['r2:0'].independent===8&&!R.pendingSummary()&&S.todayCount()===8);
      R.open(4);check('after receiving the result a new lesson can start normally',R.inspect().run.id===4);
      S.importText(beforeResume,'replace');
      R.open(0);click('.topbar button');check('back saves an unfinished lesson and returns home',K.UI.currentName()==='home'&&!!R.pendingSummary());
      check('pausing awards no sticker or completed review record',!S.hasSticker('r2:0')&&!S.data.reviewRecords['r2:0']);
      R.open(0);click('.review-start-new');finish(8);check('all-supported completion earns no sticker but keeps the observations',!S.hasSticker('r2:0')&&S.data.reviewRecords['r2:0'].supported===8);
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
      for(let i=0;i<5;i++){check('summary waits for four confirmed lessons '+i,R.chapterReady(i));R.open(null,i);const seen=[];for(let n=0;n<5;n++){seen.push(R.inspect().q.lessonId);if(n===0){text('👀 ヒント');text('ひとつ みてみる');text('こたえを みる');click('.review-try');click('.review-check');}else answer();click('.review-next');}check('4/5 clean answers earn chapter '+i,S.hasSticker('r2chapter:'+i));check('summary revisits an earlier chapter '+i,i===0||seen[4]===i*4-1);}
      check('textbook review does not rewrite map mastery',front===JSON.stringify([S.data.stars,S.data.facts,S.data.recent,S.data.firstTry]));
      check('25 textbook species are unique and absent from the original map slots',R.rewardKeys().length===25&&new Set(R.rewardKeys().map(k=>K.PokemonStickers.reward(k).id)).size===25&&R.rewardKeys().every(k=>!gate.some(o=>K.PokemonStickers.reward(k).id===K.PokemonStickers.reward(o).id)));
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
      const firstVisit=JSON.stringify(S.reviewSession());
      check('all 156 confirmed collection rewards still open the true second lap',K.Rounds.unlocked()&&K.Rounds.select(2));
      check('repeat lap starts with fresh chapter readiness and no textbook checkpoint',!R.unlocked()&&!R.pendingSummary()&&Object.keys(S.data.reviewChaptersOpen).length===0);
      R.preparation(3).forEach(p=>S.addSticker(p.game.id+':'+p.levelIndex));R.open(12);text('👀 ヒント');click('.review-try');click('.review-pause');
      const bothRounds=S.exportText();S.reset();S.importText(bothRounds,'replace');
      check('second-lap replacement restores its own unfinished textbook question',S.round()===2&&R.resume()&&R.inspect().run.id===12&&R.inspect().q.supported);
      K.Rounds.select(1);check('first-lap textbook checkpoint survives second-lap work',JSON.stringify(S.reviewSession())===firstVisit&&R.pendingSummary().title===R.lessons[10].title);
      S.setPref('stickers',S.data.stickers.filter(k=>!gate.includes(k)));check('once-open chapter entrances survive catalog growth and merged older data',R.unlocked());S.importText(backup);S.flush();
      return names;
    });
    // Keep output compact despite exercising every question through the UI.
    checks.filter(n=>!n.startsWith('accepted ')&&!n.startsWith('checkpoint ')).forEach(n=>console.log('PASS '+n));
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.evaluate(()=>KazuApp.TextbookReview.chapters.every((c,i)=>KazuApp.TextbookReview.chapterOpen(i))&&KazuApp.Store.hasSticker('r2:19')&&!!KazuApp.Store.stickerWorld().items['r2chapter:0']),true);
    assert.equal(await page.evaluate(()=>KazuApp.TextbookReview.resume()&&KazuApp.TextbookReview.inspect().run.id===10&&KazuApp.TextbookReview.inspect().run.step===1),true);
    console.log('PASS review progress, unfinished exact question and island placement survive reload');
    const dir=process.env.REVIEW_SCREENSHOTS;if(dir)fs.mkdirSync(dir,{recursive:true});
    // Always exercise the largest generated groups, so layout checks cannot
    // pass just because this run happened to draw fewer objects.
    await page.evaluate(()=>{Math.random=()=>0.999999;});
    for(const size of [{width:1024,height:768},{width:901,height:900},{width:900,height:900},{width:768,height:1024},{width:390,height:844},{width:320,height:740}]){
      await page.setViewportSize(size);
      for(const id of [null,0,3,4,5,6,7,8,10,12,14,18,19]){
        await page.evaluate(id=>{KazuApp.Sound.voiceOn=false;KazuApp.Sound.sfxOn=false;KazuApp.TextbookReview.open(id);document.querySelector('#review .review-start-new')?.click();},id);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('.review-body').scrollWidth<=document.querySelector('.review-body').clientWidth+1),true,'no body overflow '+size.width+' lesson '+id);
        if(id!==null){await page.locator('.review-check').scrollIntoViewIfNeeded();assert.equal(await page.locator('.review-check').isVisible(),true);}
        if(dir)await page.screenshot({path:path.join(dir,`${size.width}-${id===null?'menu':id}.png`)});
        if([0,3,7].includes(id)){
          await page.evaluate(()=>{const tap=t=>[...document.querySelectorAll('#review button')].find(b=>b.textContent===t).click();tap('👀 ヒント');tap('ひとつ みてみる');tap('こたえを みる');document.querySelector('.review-try').click();document.querySelector('.review-check').click();document.querySelector('.review-next').click();});
          assert.equal(await page.evaluate(()=>document.querySelector('.review-body').scrollWidth<=document.querySelector('.review-body').clientWidth+1),true,'alternate representation fits '+size.width+' lesson '+id);
          if(dir)await page.screenshot({path:path.join(dir,`${size.width}-${id}-variant.png`)});
        }
      }
    }
    const lightInk=await page.evaluate(()=>getComputedStyle(document.querySelector('.review-body')).color);
    await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>{KazuApp.TextbookReview.open(12);document.querySelector('#review .review-start-new')?.click();});
    // Wait for the new color scheme to reach existing elements, independently
    // of whether optional screenshots give the browser time to repaint.
    await page.waitForFunction(()=>matchMedia('(prefers-color-scheme: dark)').matches&&getComputedStyle(document.querySelector('.review-body')).color===getComputedStyle(document.querySelector('.review-field')).color,null,{timeout:3000});
    if(dir)await page.screenshot({path:path.join(dir,'dark.png')});
    const dark=await page.evaluate(()=>({body:getComputedStyle(document.querySelector('.review-body')).color,field:getComputedStyle(document.querySelector('.review-field')).color,heading:getComputedStyle(document.querySelector('#review h2')).color,tray:getComputedStyle(document.querySelector('.review-tray-label')).color,progress:getComputedStyle(document.querySelector('.review-progress')).color}));
    assert.notEqual(dark.body,lightInk,'dark mode actually updates the ink');
    assert.equal(dark.body,dark.field,JSON.stringify(dark));assert.equal(dark.body,dark.heading,JSON.stringify(dark));assert.equal(dark.body,dark.tray,JSON.stringify(dark));assert.equal(dark.body,dark.progress,JSON.stringify(dark));
    if(dir)await page.screenshot({path:path.join(dir,'dark.png')});
    assert.deepEqual(errors,[]);console.log('PASS tablet, phone, narrow phone and dark layouts; no browser errors');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
