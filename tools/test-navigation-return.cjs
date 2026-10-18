#!/usr/bin/env node
'use strict';
// Navigation uses disposable records and real controls; neither a visit nor a
// return may rewrite the child's unfinished learning checkpoint.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(fs.readFileSync(process.env.NAVIGATION_RETURN_HTML || path.join(root,'dist/kazu-no-bouken.html')));
});
(async () => {
  let browser, passed = 0; const errors = [];
  const shots = process.env.NAVIGATION_RETURN_SHOTS && path.resolve(process.env.NAVIGATION_RETURN_SHOTS);
  if(shots)fs.mkdirSync(shots,{recursive:true});
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
    const settle = page => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const name = page => page.evaluate(()=>KazuApp.UI.currentName());
    const back = (page,screen) => page.locator('#'+screen+' .topbar button[aria-label="もどる"]');
    const game = (page,id) => page.locator('#home .gamecard[data-game-id="'+id+'"]');
    const mapState = page => page.evaluate(()=>({scroll:document.querySelector('#home .home-content').scrollTop,
      details:[...document.querySelectorAll('#home details')].map(d=>[d.className,d.open]),
      focus:document.activeElement.dataset.gameId}));
    const openMap = async (page,id='clock') => {
      await page.locator('#home .home-more > summary').click();
      await page.locator('#home .sticker-mission > summary').click();
      await game(page,id).scrollIntoViewIfNeeded(); await settle(page);
      const state = await mapState(page); await game(page,id).click(); return state;
    };
    const expectMap = async (page,before,id='clock') => {
      await settle(page); assert.equal(await name(page),'home');
      const after = await mapState(page);
      assert.ok(Math.abs(after.scroll-before.scroll)<=1,JSON.stringify({before,after}));
      assert.deepEqual(after.details,before.details); assert.equal(after.focus,id);
    };
    for (const viewport of [{width:320,height:568},{width:1024,height:768}]){
      const scenario = async (label,run) => {
        const context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
        await context.addInitScript(()=>{
          const RealDate=Date, base=RealDate.parse('2026-10-18T03:00:00Z');window.__navDay=0;
          window.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[base+window.__navDay*86400000]));}
            static now(){return base+window.__navDay*86400000;} };
        });
        const page=await context.newPage();page.setDefaultTimeout(8000);
        page.on('pageerror',e=>errors.push(viewport.width+'px '+label+': '+e.stack));
        await page.route('https://**',r=>r.abort());
        try {
          await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
          await page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
            K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Sound.probeVoice=()=>Promise.resolve(true);
            K.Store.reset();K.Session._test.overview(false);K.Session._test.breaks(false);K.Session._test.autoAdvance(true);
            K.Home.render();K.UI.show('home');});await settle(page);
          await run(page);passed++;console.log('PASS '+viewport.width+'px '+label);
        } catch(error){
          if(errors.length)console.error('Browser errors:',errors);throw error;
        } finally {await context.close();}
      };
      await scenario('map returns to the chosen game, scroll and expanded details',async page=>{
        const before=await openMap(page);if(viewport.width===320)assert.ok(before.scroll>500);
        await back(page,'levels').click();await expectMap(page,before);
        if(shots)await page.screenshot({path:path.join(shots,'map-return-'+viewport.width+'.png'),animations:'disabled'});
      });
      await scenario('preview returns to its level control and then its original map',async page=>{
        await page.evaluate(()=>{const S=KazuApp.Store;S.recordLevel('clock',0,1,1,8);S.recordLevel('clock',1,1,1,8);});
        const map=await openMap(page);
        const preview=page.locator('#levels [data-level-index="2"][data-level-action="preview"]');
        await preview.scrollIntoViewIfNeeded();
        const scroll=await page.locator('#levels .levels').evaluate(n=>n.scrollTop);
        await preview.click();assert.equal(await name(page),'first-steps');
        await back(page,'first-steps').click();await settle(page);
        assert.equal(await name(page),'levels');assert.equal(await page.locator('#levels .levels').evaluate(n=>n.scrollTop),scroll);
        assert.equal(await preview.evaluate(n=>n===document.activeElement),true);
        if(shots)await page.screenshot({path:path.join(shots,'level-return-'+viewport.width+'.png'),animations:'disabled'});
        await back(page,'levels').click();await expectMap(page,map);
      });
      await scenario('an unintroduced level card returns focus to the same card',async page=>{
        await openMap(page,'count');
        const card=page.locator('#levels [data-level-index="0"][data-level-action="play"]');await card.click();
        assert.equal(await name(page),'first-steps');await back(page,'first-steps').click();await settle(page);
        assert.equal(await name(page),'levels');assert.equal(await card.evaluate(n=>n===document.activeElement),true);
      });
      await scenario('resting a regular course keeps its level and original map',async page=>{
        await page.evaluate(()=>KazuApp.Store.markIntroduced('count',0));
        const map=await openMap(page,'count');
        const card=page.locator('#levels [data-level-index="0"][data-level-action="play"]');await card.click();
        assert.equal(await name(page),'play');
        await page.locator('#play .obj').first().click();
        await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();await settle(page);
        assert.equal(await name(page),'levels');assert.equal(await card.evaluate(n=>n===document.activeElement),true);
        const saved=await page.evaluate(()=>KazuApp.Store.savedSession());assert.ok(saved);
        await back(page,'levels').click();await expectMap(page,map,'count');
        assert.deepEqual(await page.evaluate(()=>KazuApp.Store.savedSession()),saved);
        await page.locator('#home .home-primary').click();assert.equal(await name(page),'play');
        await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
        assert.equal(await name(page),'levels');await back(page,'levels').click();await expectMap(page,map,'count');
        // An explicit fresh entrance from the book must not inherit that map.
        await page.evaluate(()=>KazuApp.Book.open());
        await page.locator('#book [data-book-key="count:0"]').click();
        await page.locator('#book-detail .long-course > summary').click();
        await page.locator('#book-detail .long-course .btn').click();assert.equal(await name(page),'play');
        await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
        assert.equal(await name(page),'levels');await back(page,'levels').click();await settle(page);
        assert.equal(await name(page),'home');assert.equal((await mapState(page)).scroll,0);
        assert.equal(await page.evaluate(()=>document.activeElement.matches('#home h1')),true);
      });
      await scenario('a short gold entrance returns through its own control to the map',async page=>{
        await page.evaluate(()=>{const S=KazuApp.Store;S.markIntroduced('count',0);S.addSticker('count:0');});
        const map=await openMap(page,'count');
        const gold=page.locator('#levels [data-level-index="0"][data-level-action="gold"]');await gold.click();
        assert.equal(await name(page),'play');
        await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
        assert.equal(await name(page),'first-steps');await back(page,'first-steps').click();await settle(page);
        assert.equal(await name(page),'levels');assert.equal(await gold.evaluate(n=>n===document.activeElement),true);
        await back(page,'levels').click();await expectMap(page,map,'count');
      });
      await scenario('returning on an ended day keeps the explicitly opened map',async page=>{
        await page.evaluate(()=>KazuApp.Home.endToday());const before=await openMap(page);
        await back(page,'levels').click();await expectMap(page,before);
        assert.equal(await page.evaluate(()=>KazuApp.Store.endedToday()),true);
        assert.equal(await page.locator('#home .day-ending').isVisible(),true);
      });
      await scenario('returning after midnight refreshes today while keeping the chosen map',async page=>{
        await page.evaluate(()=>KazuApp.Home.endToday());const before=await openMap(page);
        await page.evaluate(()=>window.__navDay++);await back(page,'levels').click();await settle(page);
        assert.equal(await name(page),'home');assert.equal(await page.evaluate(()=>KazuApp.Store.endedToday()),false);
        assert.equal(await page.locator('#home .home-today > h2').textContent(),'きょうは ここから');
        assert.equal(await page.locator('#home .home-more').evaluate(n=>n.open),true);
        assert.equal((await mapState(page)).focus,'clock');assert.ok(before.scroll>0);
      });
      await scenario('a different lap cannot restore an old level origin',async page=>{
        await openMap(page);await page.locator('#levels .first-retry').first().click();
        await page.evaluate(()=>{KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);});
        await back(page,'first-steps').click();await settle(page);
        assert.equal(await name(page),'home');assert.equal(await page.evaluate(()=>KazuApp.Store.round()),2);
        assert.equal(await page.locator('#home').getAttribute('data-round'),'2');
        assert.equal(await page.evaluate(()=>document.activeElement.matches('#home h1')),true);
      });
      await scenario('map and preview visits preserve an unfinished question checkpoint',async page=>{
        await page.evaluate(()=>{const K=KazuApp;K.Session._test.intro(false);K.Session.startLevel(K.Games.byId.ten,2);});
        // Draft persistence has its own complete suite. Here the navigation must
        // preserve the whole checkpoint, including any input that is present.
        const five=page.locator('#play .padkey').filter({hasText:/^5$/});if(await five.count())await five.click();
        await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
        await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});await settle(page);
        const saved=await page.evaluate(()=>KazuApp.Store.savedSession());assert.ok(saved);
        const map=await openMap(page);await page.locator('#levels .first-retry').first().click();
        await back(page,'first-steps').click();await back(page,'levels').click();await expectMap(page,map);
        assert.deepEqual(await page.evaluate(()=>KazuApp.Store.savedSession()),saved);
      });
      await scenario('a home preview has no stale level return destination',async page=>{
        await openMap(page);await back(page,'levels').click();await settle(page);
        await page.locator('#home .first-card').click();assert.equal(await name(page),'first-steps');
        await back(page,'first-steps').click();assert.equal(await name(page),'home');
      });
      await scenario('a book course keeps its filter, scroll and selected sticker on return',async page=>{
        await page.evaluate(()=>{const K=KazuApp;K.Book.open();});
        await page.locator('#book [data-filter="gold"]').click();
        const sticker=page.locator('#book [data-book-key="count:0:g"]');await sticker.scrollIntoViewIfNeeded();
        const scroll=await page.locator('#book .book').evaluate(n=>n.scrollTop);await sticker.click();
        await page.locator('#book-detail .book-play').click();assert.equal(await name(page),'play');
        await page.locator('#play .backbtn').click();await page.locator('#play .backbtn').click();
        assert.equal(await name(page),'first-steps');await back(page,'first-steps').click();await settle(page);
        assert.equal(await name(page),'book');assert.equal(await page.locator('#book .book').evaluate(n=>n.scrollTop),scroll);
        assert.equal(await sticker.evaluate(n=>n===document.activeElement),true);
        assert.equal(await page.locator('#book [data-filter="gold"]').getAttribute('aria-pressed'),'true');
      });
    }
    assert.deepEqual(errors,[],'no browser exceptions');console.log(`PASS ${passed} navigation return scenarios; no browser exceptions`);
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
