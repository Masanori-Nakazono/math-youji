#!/usr/bin/env node
'use strict';
// Disposable profiles verify logical placement, its responsive view and explicit edits.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.env.ISLAND_LAYOUT_ROOT||path.join(__dirname,'..'));
const {chromium}=require(require.resolve('playwright',{paths:[root]}));
const html=path.resolve(process.env.ISLAND_LAYOUT_HTML||path.join(root,'dist/kazu-no-bouken.html'));
const shots=process.env.ISLAND_LAYOUT_SHOTS&&path.resolve(process.env.ISLAND_LAYOUT_SHOTS);if(shots)fs.mkdirSync(shots,{recursive:true});
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(html));});
(async()=>{
  let browser,passed=0;const errors=[];
  const settle=page=>page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  const quiet=page=>page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=()=>{};K.Sound.probeVoice=()=>Promise.resolve(true);});
  const seed=page=>page.evaluate(()=>{const K=KazuApp,S=K.Store;S.reset();for(const id of ['count','numeral','compare']){S.recordLevel(id,0,2,6,8,true);S.addSticker(id+':0');S.markIntroduced(id,0);}});
  const world=page=>page.evaluate(()=>KazuApp.Store.stickerWorld());
  const learning=page=>page.evaluate(()=>{const S=KazuApp.Store;return JSON.parse(JSON.stringify({stars:S.data.stars,plays:S.data.plays,
    facts:S.data.facts,pending:S.data.pending,stickers:S.data.stickers,today:S.todayCount(),milestones:S.milestones()}));});
  const spy=page=>page.evaluate(()=>{window.__islandWrites=[];const S=KazuApp.Store,original=S.putWorldSticker;
    S.putWorldSticker=function(...args){window.__islandWrites.push(args);return original.apply(this,args);};});
  const writes=page=>page.evaluate(()=>window.__islandWrites.slice());
  const open=async(page,key)=>{await page.evaluate(key=>KazuApp.StickerWorld.open(key),key);await settle(page);};
  const choose=async(page,key)=>{await page.locator('#sticker-world .world-choose').click();await page.locator('#sticker-world .world-picker [data-filter="all"]').click();
    await page.locator('#sticker-world .world-palette-sticker[data-world-key="'+key+'"]').click();await settle(page);};
  const fit=page=>page.locator('#sticker-world .sticker-world-board').evaluate(n=>{const b=n.getBoundingClientRect();return[...n.querySelectorAll('.world-sticker')].every(card=>{
    const r=card.getBoundingClientRect();return r.left>=b.left-.2&&r.right<=b.right+.2&&r.top>=b.top-.2&&r.bottom<=b.bottom+.2;});});
  const boxes=page=>page.locator('#sticker-world .world-sticker').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{key:n.dataset.worldKey,x:r.x,y:r.y,w:r.width,h:r.height};}));
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const draft=page=>page.locator('#sticker-world .world-position').evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));
  const pointer=async(page,x,y)=>{const board=page.locator('#sticker-world .sticker-world-board');await board.scrollIntoViewIfNeeded();await settle(page);
    const p=await board.evaluate((n,p)=>{const r=n.getBoundingClientRect();return{x:r.left+n.clientLeft+n.clientWidth*p.x/100,y:r.top+n.clientTop+n.clientHeight*p.y/100};},{x,y});await page.mouse.click(p.x,p.y);await settle(page);};
  const scenario=async(name,viewport,run)=>{const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(name+': '+e.stack));await page.route('https://**',r=>r.abort());
    try{await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});await quiet(page);await seed(page);await run(page);
      passed++;console.log('PASS '+name);}finally{await context.close();}};
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    await scenario('viewing, rotating, opening and reload preserve logical edge placement and learning records',{width:1024,height:768},async page=>{
      await open(page,'count:0');await pointer(page,92,45);await page.locator('.world-done').click();
      await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});await open(page);
      const before=await world(page),records=await learning(page);await spy(page);
      for(const size of [{width:390,height:844},{width:568,height:320},{width:320,height:568},{width:1024,height:768}]){
        await page.setViewportSize(size);await settle(page);assert.deepEqual(await world(page),before);assert.equal(await fit(page),true);assert.deepEqual(await learning(page),records);
        assert.deepEqual(await writes(page),[]);if(shots)await page.screenshot({path:path.join(shots,'view-'+size.width+'x'+size.height+'.png'),animations:'disabled'});
      }
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await open(page);assert.deepEqual(await world(page),before);assert.deepEqual(await learning(page),records);
    });
    await scenario('three new stickers have distinct visible default placements at phone and desktop sizes',{width:390,height:844},async page=>{
      for(const size of [{width:320,height:568},{width:390,height:844},{width:1024,height:768}]){
        await page.setViewportSize(size);await seed(page);const records=await learning(page);
        for(const key of ['count:0','numeral:0','compare:0']){
          await page.evaluate(()=>KazuApp.Book.open());await page.locator('#book [data-book-key="'+key+'"]').click();await page.locator('#book-detail .book-place').click();await settle(page);
          const before=await world(page);await choose(page,key);assert.deepEqual(await world(page),before,'choosing alone never saves');
          await page.locator('.world-place').click();await page.locator('.world-done').click();
        }
        const cards=await boxes(page);assert.equal(cards.length,3);for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)assert.ok(overlap(cards[i],cards[j])<1,JSON.stringify({size,cards}));
        assert.equal(await fit(page),true);assert.deepEqual(await learning(page),records);if(shots)await page.screenshot({path:path.join(shots,'defaults-'+size.width+'.png'),animations:'disabled'});
      }
      await page.setViewportSize({width:390,height:844});await seed(page);
      for(const key of ['count:0','numeral:0']){await open(page,key);await page.locator('.world-place').click();await page.locator('.world-done').click();}
      await open(page,'compare:0');await page.setViewportSize({width:320,height:568});await settle(page);await page.locator('.world-place').click();
      const rotated=await boxes(page),newCard=rotated.find(n=>n.key==='compare:0');
      rotated.filter(n=>n!==newCard).forEach(card=>assert.ok(overlap(card,newCard)<1,'unmoved new preview avoids overlap after rotation: '+JSON.stringify(rotated)));
    });
    await scenario('selecting an old stacked sticker brings its actual art forward without rewriting placements',{width:390,height:844},async page=>{
      await page.evaluate(()=>{const S=KazuApp.Store;for(const key of ['count:0','numeral:0','compare:0'])S.putWorldSticker(key,50,50);});await open(page);
      const before=await world(page),records=await learning(page);await spy(page);
      for(const size of [{width:320,height:568},{width:390,height:844},{width:1024,height:768}]){
        await page.setViewportSize(size);await choose(page,'count:0');
        const top=await page.locator('.world-sticker[data-world-key="count:0"]').evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.world-sticker')?.dataset.worldKey;});
        assert.equal(top,'count:0');assert.deepEqual(await world(page),before);assert.deepEqual(await writes(page),[]);await page.locator('.world-done').click();assert.deepEqual(await world(page),before);
        if(shots)await page.screenshot({path:path.join(shots,'stack-front-'+size.width+'.png'),animations:'disabled'});
      }
      assert.deepEqual(await learning(page),records);
    });
    await scenario('a clamped saved edge remains unchanged on selection, Enter, move-button and blocked arrows',{width:390,height:844},async page=>{
      await page.evaluate(()=>KazuApp.Store.putWorldSticker('count:0',0,100));await open(page,'count:0');const before=await world(page);await spy(page);
      await choose(page,'count:0');await page.locator('.sticker-world-board').focus();await page.keyboard.press('Enter');await page.locator('.world-place').click();
      await page.locator('.sticker-world-board').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
      assert.deepEqual(await world(page),before);assert.deepEqual(await writes(page),[]);assert.equal(await fit(page),true);
      await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');const moved=(await world(page)).items['count:0'];assert.ok(moved.x>0);assert.equal(moved.y,100,'horizontal editing preserves untouched logical y');
      await page.locator('.world-undo').click();assert.deepEqual(await world(page),before);await page.locator('.world-remove').click();assert.equal((await world(page)).items['count:0'],undefined);
      await page.locator('.world-undo').click();assert.deepEqual(await world(page),before);assert.equal(await fit(page),true);
    });
    await scenario('pointer and keyboard moves save explicitly; undo restores the exact prior logical coordinate',{width:390,height:844},async page=>{
      await open(page,'count:0');const records=await learning(page);await pointer(page,40,45);const before=await world(page);await spy(page);
      await page.locator('.sticker-world-board').focus();await page.keyboard.press('ArrowRight');assert.deepEqual(await world(page),before,'arrow preview does not save');
      const preview=await page.evaluate(()=>{const cursor=document.querySelector('.world-position'),card=document.querySelector('.world-sticker.selected'),a=cursor.getBoundingClientRect(),b=card.getBoundingClientRect();
        return{visible:!cursor.hidden,cursorZ:Number(getComputedStyle(cursor).zIndex),cardZ:Number(getComputedStyle(card).zIndex),
          overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};});
      assert.equal(preview.visible,true);assert.equal(preview.overlap,true);assert.ok(preview.cursorZ>preview.cardZ,JSON.stringify(preview));
      if(shots)await page.screenshot({path:path.join(shots,'keyboard-preview-front.png'),animations:'disabled'});
      await page.keyboard.press('Enter');assert.ok(Math.abs((await world(page)).items['count:0'].x-before.items['count:0'].x-5)<.1);
      await page.locator('.world-undo').click();assert.deepEqual(await world(page),before);await page.locator('.world-done').click();assert.deepEqual(await learning(page),records);
    });
    await scenario('a crowded canvas has a finite deterministic candidate and explicit overlap remains possible',{width:390,height:844},async page=>{
      const key=await page.evaluate(()=>{const K=KazuApp,S=K.Store,keys=K.Games.list.flatMap(g=>g.levels.map((lv,i)=>g.id+':'+i));S.reset();
        const positions=[];for(const y of [0,25,50,75,100])for(const x of [0,20,40,60,80,100])positions.push({x,y});
        positions.forEach((p,i)=>{S.addSticker(keys[i]);S.putWorldSticker(keys[i],p.x,p.y);});S.addSticker(keys[30]);return keys[30];});
      await open(page,key);const before=await world(page),first=await draft(page);await spy(page);await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});await open(page,key);
      assert.deepEqual(await draft(page),first);assert.deepEqual(await world(page),before);assert.deepEqual(await writes(page),[]);
      await page.locator('.world-place').click();assert.ok((await world(page)).items[key]);assert.equal(await fit(page),true);
      await page.evaluate(()=>{const S=KazuApp.Store;S.reset();S.addSticker('count:0');S.addSticker('numeral:0');S.putWorldSticker('count:0',50,50);});await open(page,'numeral:0');
      const board=page.locator('.sticker-world-board');await board.focus();
      for(const axis of ['x','y'])for(let i=0;i<25;i++){const p=await draft(page),delta=50-p[axis];if(Math.abs(delta)<=2.51)break;
        await page.keyboard.press(axis==='x'?(delta>0?'ArrowRight':'ArrowLeft'):(delta>0?'ArrowDown':'ArrowUp'));}
      await page.keyboard.press('Enter');const cards=await boxes(page);assert.equal(cards.length,2);assert.ok(overlap(cards[0],cards[1])>Math.min(cards[0].w*cards[0].h,cards[1].w*cards[1].h)*.5,'an explicit overlap is allowed');
    });
    await scenario('Book origin, selected card focus and view state survive island resizing',{width:390,height:844},async page=>{
      await page.evaluate(()=>{const K=KazuApp,S=K.Store;for(const g of K.Games.list.filter(g=>g.world==='shima'))for(let i=0;i<g.levels.length;i++)S.addSticker(g.id+':'+i+':g');S.putWorldSticker('count:0:g',0,100);K.Book.open();});
      await page.locator('#book [data-filter="gold"]').click();await page.locator('#book .book-world').selectOption('shima');const card=page.locator('#book [data-book-key="count:0:g"]');await card.scrollIntoViewIfNeeded();await card.focus();await settle(page);
      const scroll=await page.locator('#book .book').evaluate(n=>n.scrollTop),before=await world(page);await page.keyboard.press('Enter');await page.locator('.book-place').click();await settle(page);
      await page.setViewportSize({width:568,height:320});await settle(page);await page.setViewportSize({width:390,height:844});await settle(page);assert.deepEqual(await world(page),before);
      await page.locator('#sticker-world .topbar button').first().click();await settle(page);assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book-detail');await page.waitForFunction(()=>document.activeElement?.classList.contains('book-place'));
      await page.locator('.book-return').click();await settle(page);assert.equal(await page.locator('#book .book-world').inputValue(),'shima');assert.equal(await page.locator('#book [data-filter="gold"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#book .book').evaluate(n=>n.scrollTop),scroll);await page.waitForFunction(()=>document.activeElement?.dataset.bookKey==='count:0:g');
    });
    await scenario('both laps retain exact logical positions across view changes, export/import and reload',{width:1024,height:768},async page=>{
      await page.evaluate(()=>{const S=KazuApp.Store;S.putWorldSticker('count:0',0,100);S.unlockRoundTwo();S.selectRound(2);S.addSticker('count:0');S.putWorldSticker('lap2:count:0',100,0);});await open(page,'count:0');
      const before=await world(page),backup=await page.evaluate(()=>KazuApp.Store.exportText());await spy(page);
      for(const size of [{width:320,height:568},{width:568,height:320},{width:1024,height:768}]){await page.setViewportSize(size);await settle(page);await choose(page,'count:0');await choose(page,'lap2:count:0');assert.deepEqual(await world(page),before);assert.equal(await fit(page),true);assert.deepEqual(await writes(page),[]);}
      await page.evaluate(text=>{const S=KazuApp.Store;S.reset();if(!S.importText(text,'replace').ok)throw Error('import failed');S.flush();},backup);
      await page.reload({waitUntil:'domcontentloaded'});await quiet(page);await open(page,'count:0');assert.deepEqual(await world(page),before);assert.equal(await fit(page),true);assert.equal(await page.locator('.world-palette-sticker.selected').getAttribute('data-world-key'),'lap2:count:0');
    });
    assert.deepEqual(errors,[],'no browser exceptions');console.log('PASS '+passed+' island-layout scenarios; browser exceptions: 0');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
