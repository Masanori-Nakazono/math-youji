#!/usr/bin/env node
'use strict';
// Disposable profiles follow the child's chosen sticker through actual controls.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const html=path.resolve(process.env.COLLECTION_JOURNEY_HTML||path.join(root,'dist/kazu-no-bouken.html'));
const shots=process.env.COLLECTION_JOURNEY_SHOTS&&path.resolve(process.env.COLLECTION_JOURNEY_SHOTS);
if(shots)fs.mkdirSync(shots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(html));});
(async()=>{
  let browser,passed=0;const errors=[];
  const settle=page=>page.evaluate(async()=>{
    await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  });
  const current=page=>page.evaluate(()=>KazuApp.UI.currentName());
  const evidence=page=>page.evaluate(()=>{const S=KazuApp.Store;return JSON.parse(JSON.stringify({today:S.todayCount(),stars:S.data.stars,
    facts:S.data.facts,plays:S.data.plays,stickers:S.data.stickers,pending:S.data.pending,milestones:S.milestones(),transferRecords:S.data.transferRecords}));});
  const collection=(page,id)=>page.locator('#book [data-collection-key="transfer:'+id+'"]');
  const openBook=async page=>{
    await page.evaluate(()=>KazuApp.Book.open());
    if(!await page.locator('#book .book-extras').evaluate(n=>n.open))await page.locator('#book .book-extras > summary').click();
    await settle(page);
  };
  const sourceState=page=>page.locator('#book .book').evaluate(n=>({scroll:n.scrollTop,filter:document.querySelector('#book .book-filter[aria-pressed="true"]').dataset.filter,
    world:document.querySelector('#book .book-world').value,extras:document.querySelector('#book .book-extras').open}));
  const pause=async page=>{for(let i=0;i<3;i++)await page.locator('#transfer .topbar button').first().click();await settle(page);};
  const solveFill=async(page,steps=5,lastNext=true)=>{
    for(let i=0;i<steps;i++){
      // Deterministic total=8 and initial=4; all four taps use the real handlers.
      for(let n=0;n<4;n++)await page.locator('#transfer [data-work="increase"]').click();
      await page.locator('#transfer .transfer-check').click();
      if(i<steps-1||lastNext)await page.locator('#transfer .transfer-next').click();
    }
  };
  const backWorld=async page=>{await page.locator('#sticker-world .topbar button[aria-label="もどる"]').click();await settle(page);};
  const assertBookSource=async(page,id,before,top)=>{
    await settle(page);
    assert.equal(await current(page),'book');
    const after=await sourceState(page);assert.equal(after.filter,before.filter);assert.equal(after.world,before.world);assert.equal(after.extras,true);
    await page.waitForFunction(id=>document.activeElement?.dataset.collectionKey==='transfer:'+id,id);
    const position=await collection(page,id).evaluate(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,screen:innerHeight}));
    assert.ok(Math.abs(position.top-top)<3,JSON.stringify({before:top,position}));
    assert.ok(position.bottom>0&&position.top<position.screen,JSON.stringify(position));
  };
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1024,height:768}]){
      const scenario=async(label,run)=>{
        const context=await browser.newContext({viewport,reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
        const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(viewport.width+' '+label+': '+e.stack));
        await page.route('https://**',r=>r.abort());
        try{
          await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
          await page.evaluate(()=>{const K=KazuApp;K.Store.reset();K.Store.setPref('transferReached',true);K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
            K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Sound.probeVoice=()=>Promise.resolve(true);Math.random=()=>.5;});
          await run(page);passed++;console.log('PASS '+viewport.width+' '+label);
        }finally{await context.close();}
      };
      await scenario('each unearned special sticker starts its own adventure without an intervening menu',async page=>{
        const learning=await evidence(page);
        for(let id=0;id<6;id++){
          await page.evaluate(()=>{const K=KazuApp;K.Store.setPref('transferSession',null);K.Home.render();K.UI.show('home');});
          await openBook(page);await collection(page,id).click();await settle(page);
          assert.equal(await current(page),'transfer');assert.equal(await page.locator('#transfer .transfer-map').count(),0);
          assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.run.id),id);
          assert.equal(await page.locator('#transfer .topbar h2').textContent(),await page.evaluate(id=>KazuApp.TransferAdventure.missionFor('transfer:'+id).title,id));
          assert.deepEqual(await evidence(page),learning);
        }
      });
      await scenario('saved work can be cancelled to its card, explicitly resumed, or replaced by the selected adventure',async page=>{
        await page.evaluate(()=>KazuApp.TransferAdventure.open());await page.locator('#transfer [data-mission="0"]').click();
        await page.locator('#transfer [data-work="increase"]').click();await page.locator('#transfer [data-work="hint"]').click();await pause(page);
        const previous=await page.evaluate(()=>JSON.parse(JSON.stringify(KazuApp.Store.data.transferSession))),learning=await evidence(page);
        await openBook(page);await page.locator('#book [data-filter="gold"]').click();await page.locator('#book .book-world').selectOption('mori');
        const target=collection(page,4);await target.scrollIntoViewIfNeeded();await target.focus();await settle(page);
        const before=await sourceState(page),top=await target.evaluate(n=>n.getBoundingClientRect().top);await page.keyboard.press('Enter');
        assert.match(await page.locator('#transfer .transfer-body').textContent(),/ピクニック.*あつまる/s);
        assert.deepEqual(await page.evaluate(()=>KazuApp.Store.data.transferSession),previous);
        await page.locator('#transfer').getByRole('button',{name:'シールブックに もどる',exact:true}).click();
        await assertBookSource(page,4,before,top);assert.deepEqual(await page.evaluate(()=>KazuApp.Store.data.transferSession),previous);
        await collection(page,4).click();await page.locator('#transfer').getByRole('button',{name:'まえの つづきから',exact:true}).click();
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.run.id),0);
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.q.value),1);
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.q.supported),true);
        assert.equal(await page.locator('#transfer .transfer-example').isVisible(),true);
        await pause(page);assert.equal(await current(page),'book');
        await collection(page,4).click();await page.locator('#transfer').getByRole('button',{name:'あたらしく はじめる',exact:true}).click();
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.run.id),4);assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.q.value),0);
        assert.deepEqual(await evidence(page),learning);
      });
      await scenario('even untouched saved scenes require a choice from a desired sticker',async page=>{
        await page.evaluate(()=>KazuApp.TransferAdventure.open());await page.locator('#transfer [data-mission="0"]').click();await pause(page);
        const previous=await page.evaluate(()=>KazuApp.Store.data.transferSession);await openBook(page);await collection(page,5).click();
        assert.equal(await page.locator('#transfer').getByRole('button',{name:'まえの つづきから',exact:true}).count(),1);
        assert.deepEqual(await page.evaluate(()=>KazuApp.Store.data.transferSession),previous);
      });
      await scenario('five actual answers earn the chosen sticker, island placement returns to its refreshed Book card',async page=>{
        await openBook(page);await page.locator('#book [data-filter="owned"]').click();await page.locator('#book .book-world').selectOption('all');
        const target=collection(page,1);await target.scrollIntoViewIfNeeded();await target.focus();await settle(page);
        const before=await sourceState(page),top=await target.evaluate(n=>n.getBoundingClientRect().top);await page.keyboard.press('Enter');
        await solveFill(page);assert.equal(await page.evaluate(()=>KazuApp.Store.hasSticker('transfer:1')),true);
        assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),5);
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferRecords[1].independent),5);
        const learning=await evidence(page);assert.equal(await page.locator('#transfer > .result-dock').count(),1);
        if(shots)await page.screenshot({path:path.join(shots,'earned-'+viewport.width+'.png'),animations:'disabled'});
        await page.locator('#transfer').getByRole('button',{name:'じぶんの しまに かざる',exact:true}).click();
        assert.equal(await current(page),'sticker-world');assert.equal(await page.locator('#sticker-world .world-palette-sticker.selected').getAttribute('data-world-key'),'transfer:1');
        await page.locator('#sticker-world .world-place').click();assert.ok(await page.evaluate(()=>KazuApp.Store.stickerWorld().items['transfer:1']));
        await backWorld(page);await assertBookSource(page,1,before,top);
        assert.equal(await collection(page,1).locator('.unearned').count(),0);assert.deepEqual(await evidence(page),learning);
        if(shots)await page.screenshot({path:path.join(shots,'returned-'+viewport.width+'.png'),animations:'disabled'});
      });
      await scenario('owned detail and catalog retain filters, scroll, selected focus and internal island-job return',async page=>{
        await page.evaluate(()=>{const K=KazuApp;for(const g of K.Games.list.filter(g=>g.world==='shima'))for(let i=0;i<g.levels.length;i++)K.Store.addSticker(g.id+':'+i+':g');});
        await page.evaluate(()=>KazuApp.Book.open());await page.locator('#book [data-filter="gold"]').click();await page.locator('#book .book-world').selectOption('shima');
        const slot=page.locator('#book [data-book-key="count:0:g"]');await slot.scrollIntoViewIfNeeded();await slot.focus();await settle(page);
        const before=await sourceState(page);await page.keyboard.press('Enter');
        await page.locator('#book-detail .book-place').scrollIntoViewIfNeeded();const detailScroll=await page.locator('#book-detail .book-detail-body').evaluate(n=>n.scrollTop);
        const learning=await evidence(page);await page.locator('#book-detail .book-place').click();await page.locator('#sticker-world .world-place').click();
        await page.locator('#sticker-world .world-other-tools > summary').click();await page.locator('#sticker-world .world-job-open').click();
        await page.locator('#island-jobs .topbar button').first().click();assert.equal(await current(page),'sticker-world');
        await backWorld(page);assert.equal(await current(page),'book-detail');await page.waitForFunction(()=>document.activeElement?.classList.contains('book-place'));
        assert.equal(await page.locator('#book-detail .book-detail-body').evaluate(n=>n.scrollTop),detailScroll);
        await page.locator('#book-detail .book-return').click();await settle(page);
        assert.deepEqual(await sourceState(page),before);await page.waitForFunction(()=>document.activeElement?.dataset.bookKey==='count:0:g');
        assert.deepEqual(await evidence(page),learning);assert.equal(await page.evaluate(()=>!!KazuApp.Store.stickerWorld().items['count:0:g']),true);
      });
      await scenario('a Book collectible restores its own card when pointer activation leaves focus on an old filter',async page=>{
        await page.evaluate(()=>{KazuApp.Store.setPref('secondRoundReached',true);KazuApp.Store.addSticker('r2:0');});await openBook(page);
        await page.locator('#book [data-filter="owned"]').click();
        const target=page.locator('#book .review-collectible').filter({has:page.locator('[data-sticker-key="r2:0"]')});
        await target.scrollIntoViewIfNeeded();await settle(page);const top=await target.evaluate(n=>n.getBoundingClientRect().top),before=await sourceState(page);
        await target.evaluate(n=>{
          n.addEventListener('mousedown',e=>e.preventDefault());
          n.addEventListener('click',()=>{
            const body=document.querySelector('#book .book'),r=body.getBoundingClientRect(),scale=r.height/body.offsetHeight;
            window.__collectionPointerView={top:(n.getBoundingClientRect().top-r.top)/scale,screenTop:n.getBoundingClientRect().top,
              bodyScroll:body.scrollTop,bodyTop:r.top,bodyHeight:r.height,offsetHeight:body.offsetHeight,
              transform:getComputedStyle(document.querySelector('#book')).transform,focus:document.activeElement?.className};
          },true);
        });
        await page.locator('#book [data-filter="owned"]').evaluate(n=>n.focus({preventScroll:true}));
        await target.click();assert.equal(await current(page),'sticker-world');await backWorld(page);
        assert.equal(await current(page),'book');assert.equal((await sourceState(page)).filter,before.filter);
        await page.waitForFunction(()=>document.activeElement?.classList.contains('review-collectible')&&document.activeElement.querySelector('[data-sticker-key="r2:0"]'));
        const restored=await target.evaluate(n=>{const body=document.querySelector('#book .book'),r=body.getBoundingClientRect(),scale=r.height/body.offsetHeight;
          return {top:(n.getBoundingClientRect().top-r.top)/scale,screenTop:n.getBoundingClientRect().top,
            bodyScroll:body.scrollTop,bodyTop:r.top,bodyHeight:r.height,offsetHeight:body.offsetHeight,
            transform:getComputedStyle(document.querySelector('#book')).transform,focus:document.activeElement?.className};});
        const clicked=await page.evaluate(()=>window.__collectionPointerView);
        assert.ok(Math.abs(restored.top-clicked.top)<3,JSON.stringify({beforePointer:top,clicked,restored,viewport}));
      });
      await scenario('other entrances, new Book visits and round changes cannot reuse an old return ticket',async page=>{
        await page.evaluate(()=>KazuApp.Store.addSticker('count:0'));
        const enter=async()=>{await page.evaluate(()=>KazuApp.Book.open());await page.locator('#book [data-book-key="count:0"]').click();await page.locator('#book-detail .book-place').click();};
        await enter();await page.evaluate(()=>{const K=KazuApp;K.Home.render();K.UI.show('home');K.StickerWorld.open('count:0');});await backWorld(page);assert.equal(await current(page),'home');
        await enter();await page.evaluate(()=>{const K=KazuApp;K.Result.build();K.UI.show('result');K.StickerWorld.open('count:0');});await backWorld(page);assert.equal(await current(page),'home');
        await page.evaluate(()=>{const K=KazuApp;K.Book.open();window.__collectionOrigin=K.Book.captureReturn(null,'count:0');K.Book.open();K.TransferAdventure.open();K.StickerWorld.open('count:0',{bookOrigin:window.__collectionOrigin});});
        await backWorld(page);assert.equal(await current(page),'home');
        await enter();await page.evaluate(()=>{KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);});await backWorld(page);assert.equal(await current(page),'home');assert.equal(await page.evaluate(()=>KazuApp.Store.round()),2);
        await page.evaluate(()=>{const K=KazuApp;K.Store.setPref('transferReached',true);K.Store.addSticker('transfer:3');});await openBook(page);await collection(page,3).click();
        assert.equal(await page.locator('#sticker-world .world-palette-sticker.selected').getAttribute('data-world-key'),'lap2:transfer:3');
        await page.locator('#sticker-world .world-place').click();await backWorld(page);assert.equal(await current(page),'book');
        assert.equal(await page.evaluate(()=>!!KazuApp.Store.stickerWorld().items['lap2:transfer:3']),true);
      });
      await scenario('a completed saved cursor finishes its original adventure once before any replacement',async page=>{
        await page.evaluate(()=>KazuApp.TransferAdventure.open());await page.locator('#transfer [data-mission="0"]').click();await solveFill(page,5,false);
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession.run.step),5);assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),5);
        await openBook(page);await collection(page,5).click();assert.equal(await page.locator('#transfer .transfer-result').count(),1);
        assert.equal(await page.evaluate(()=>KazuApp.Store.hasSticker('transfer:0')),true);assert.equal(await page.evaluate(()=>KazuApp.Store.hasSticker('transfer:5')),false);
        assert.equal(await page.evaluate(()=>KazuApp.Store.data.transferSession),null);const learning=await evidence(page);
        await page.locator('#transfer').getByRole('button',{name:'じぶんの しまに かざる',exact:true}).click();await backWorld(page);
        assert.equal(await current(page),'book');assert.deepEqual(await evidence(page),learning);assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),5);
      });
    }
    assert.deepEqual(errors,[],'no browser exceptions');console.log('PASS '+passed+' collection-journey scenarios; no browser exceptions');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
