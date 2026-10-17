#!/usr/bin/env node
'use strict';
// The collection is a browsable way into one actual question, using isolated records.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright'), root = path.resolve(__dirname,'..');
const server = http.createServer((req,res) => {
  const file = path.resolve(root,'.' + new URL(req.url,'http://local').pathname);
  if (!file.startsWith(root + path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(error,data) => {res.writeHead(error?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(error?'':data);});
});
(async () => {
  let browser, passed = 0; const errors = [];
  try {
    await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser = await chromium.launch();
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet = page => page.evaluate(() => {const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=(text,options)=>{if(options&&options.onend)options.onend();};K.Session._test.overview(false);K.Session._test.breaks(false);});
    const scenario = async (name,run) => {
      const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(() => {const D=Date;window.__bookDay=0;const base=D.parse('2026-10-18T03:00:00Z');window.Date=class extends D{constructor(...a){super(...(a.length?a:[base+window.__bookDay*86400000]));}static now(){return base+window.__bookDay*86400000;}};});
      const page = await context.newPage(); page.on('pageerror',error=>errors.push(name+': '+error.message));
      await page.route('https://**',route=>route.abort());
      try {await page.goto(url,{waitUntil:'domcontentloaded'});await quiet(page);await page.evaluate(()=>KazuApp.Store.reset());await run(page);passed++;console.log('PASS '+name);}
      finally {await context.close();}
    };
    const open = page => page.evaluate(()=>KazuApp.Book.open());
    const slot = (page,key) => page.locator('#book .book-slot[data-book-key="'+key+'"]');
    const normal = page => page.evaluate(()=>{const S=KazuApp.Store;S.recordLevel('count',0,2,6,8,true);S.addSticker('count:0');S.markIntroduced('count',0);});
    const solve = async page => {
      await page.evaluate(()=>{document.querySelectorAll('#play .obj').forEach(n=>n.click());KazuApp.Session._test.flushTimers();});
      const answer=await page.evaluate(()=>Number(KazuApp.Session._test.item.split(':').at(-1)));
      await page.locator('#play .choices .choice').filter({hasText:new RegExp('^'+answer+'$')}).click();
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());
    };
    await scenario('owned artwork is in the first screen at phone and tablet sizes; explanations start collapsed', async page => {
      await page.evaluate(()=>KazuApp.Store.addSticker('count:0'));
      for (const size of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
        await page.setViewportSize(size);await open(page);
        assert.equal(await slot(page,'count:0').locator('.pokemon-name').textContent(),'ピカチュウ');
        const fit = await slot(page,'count:0').evaluate(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:b.width,height:b.height,screen:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
        assert.equal(fit.overflow,false);assert.ok(fit.top>=0&&fit.bottom<=fit.screen,JSON.stringify({size,fit}));assert.ok(fit.width>=64&&fit.height>=64);
        assert.equal(await page.locator('#book .book-extras').evaluate(n=>n.open),false);
        assert.equal(await page.locator('#book .book-slot').first().getAttribute('data-book-key'),'count:0');
        await page.screenshot({path:`/tmp/math-youji-sticker-book-${size.width}.png`,animations:'disabled'});
      }
    });
    await scenario('all 120 named normal and gold lesson slots are buttons; filters keep owned order and world boundaries', async page => {
      await page.evaluate(()=>{const S=KazuApp.Store;S.addSticker('count:0');S.addSticker('compare:0');S.addSticker('count:0:g');S.addSticker('daily:2026-10-18');});await open(page);
      assert.equal(await page.locator('#book .book-slot').count(),121);
      assert.equal(await page.locator('#book .book-slot').first().getAttribute('data-book-key'),'daily:2026-10-18');
      await page.locator('#book [data-filter="owned"]').click();assert.equal(await page.locator('#book .book-slot').count(),4);
      assert.deepEqual(await page.locator('#book .book-slot').evaluateAll(ns=>ns.map(n=>n.dataset.bookKey)),['daily:2026-10-18','count:0:g','compare:0','count:0']);
      await page.locator('#book .book-world').selectOption('shima');assert.equal(await page.locator('#book .book-slot').count(),2);
      await page.locator('#book [data-filter="gold"]').click();
      assert.equal(await page.locator('#book .book-slot').count(),15);assert.equal(await slot(page,'count:0:g').count(),1);
      assert.equal(await page.locator('#book .book-slot').evaluateAll(ns=>ns.every(n=>n.dataset.bookKey.endsWith(':g'))),true);
      await page.locator('#book .book-world').selectOption('mori');await page.locator('#book [data-filter="recent"]').click();
      assert.equal(await page.locator('#book .book-slot').count(),0);assert.match(await page.locator('#book .book-empty').textContent(),/ぜんぶ/);
      await page.locator('#book [data-filter="all"]').click();assert.equal(await page.locator('#book .book-slot').count(),24);
      await page.evaluate(()=>{KazuApp.Store.addSticker('constructor:0');KazuApp.Book.open();});await page.locator('#book .book-world').selectOption('all');
      assert.equal(await slot(page,'constructor:0').count(),1);await slot(page,'constructor:0').click();assert.equal(await page.locator('#book-detail .book-place').count(),1);assert.equal(await page.locator('#book-detail .book-play').count(),0);
    });
    await scenario('keyboard detail returns to the same filter, scroll and focused sticker; ownership opens the selected island art', async page => {
      await normal(page);await page.evaluate(()=>{for(const g of KazuApp.Games.list)for(let i=0;i<g.levels.length;i++)KazuApp.Store.addSticker(g.id+':'+i);});await open(page);
      await page.locator('#book [data-filter="recent"]').click();assert.equal(await page.locator('#book .book-slot').count(),6);
      assert.equal(await page.locator('#book .book-slot').evaluateAll(ns=>ns.every(n=>KazuApp.Store.hasSticker(n.dataset.bookKey))),true);
      await page.locator('#book [data-filter="owned"]').click();await page.locator('#book .book-world').selectOption('shima');
      const target=slot(page,'count:0');await target.scrollIntoViewIfNeeded();await target.focus();
      const scroll=await page.locator('#book .book').evaluate(n=>n.scrollTop);await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book-detail');assert.equal(await page.locator('#book-detail h2').textContent(),'ピカチュウ');
      assert.equal(await page.locator('#book-detail .book-place').count(),1);assert.equal(await page.locator('#book-detail .book-play').count(),0);
      await page.locator('#book-detail .book-return').click();
      assert.equal(await page.locator('#book [data-filter="owned"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#book .book-world').inputValue(),'shima');
      assert.equal(await page.locator('#book .book').evaluate(n=>n.scrollTop),scroll);
      await page.waitForFunction(()=>document.activeElement?.dataset.bookKey==='count:0');
      await target.click();await page.locator('#book-detail .book-place').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'sticker-world');
      assert.equal(await page.locator('.world-palette-sticker.selected [data-sticker-key="count:0"]').count(),1);
    });
    await scenario('an unearned normal sticker starts one guided question, then one independent question without conflating the records', async page => {
      await open(page);await slot(page,'count:0').click();assert.match(await page.locator('#book-detail').textContent(),/ピカチュウ/);
      await page.locator('#book-detail .book-play').click();assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'play');
      await solve(page);assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'first-finish');
      assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),1);assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered),0);
      await open(page);await slot(page,'count:0').click();await page.locator('#book-detail .book-play').click();await solve(page);
      assert.equal(await page.evaluate(()=>KazuApp.Store.todayCount()),2);assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered),1);
      assert.equal(await page.evaluate(()=>KazuApp.Store.hasSticker('count:0')),false);
    });
    await scenario('gold waits for the normal clear, then has a direct optional one-question challenge even when all normal stickers are owned', async page => {
      await open(page);await slot(page,'count:0:g').click();assert.match(await page.locator('#book-detail .book-detail-copy').textContent(),/まず.*ピカチュウ/);
      await page.locator('#book-detail .book-play').click();assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).goldActive),false);
      await normal(page);await page.evaluate(()=>{const S=KazuApp.Store;for(const g of KazuApp.Games.list)for(let i=0;i<g.levels.length;i++)S.addSticker(g.id+':'+i);});
      await open(page);await page.locator('#book [data-filter="gold"]').click();await slot(page,'count:0:g').click();
      await page.locator('#book-detail .book-play').click();assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'play');
      assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).goldActive),true);await solve(page);
      assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).answered),1);assert.equal(await page.evaluate(()=>KazuApp.Store.stars('count',0)),2);
    });
    await scenario('same-day gold readiness explains the later-day check and labels extra play as practice', async page => {
      await page.evaluate(()=>{KazuApp.Sound.say=(text,options)=>{window.__bookLastSpeech=text;if(options&&options.onend)options.onend();};});
      await normal(page);await page.evaluate(()=>{const S=KazuApp.Store;S.startShortGold('count',0);for(let i=0;i<8;i++)S.recordShortAnswer('count',0,true,'book-ready-'+i,'independent');});
      await open(page);await slot(page,'count:0:g').click();assert.match(await page.locator('#book-detail .book-detail-copy').textContent(),/べつの.?ひ/);
      const speech=await page.evaluate(()=>window.__bookLastSpeech);assert.match(speech,/別の日/);assert.doesNotMatch(speech,/[🌱☀️✨🔊]/u);
      assert.match(await page.locator('#book-detail .book-play').textContent(),/れんしゅう/);await page.locator('#book-detail .book-play').click();await solve(page);
      assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).waiting),true);assert.equal(await page.evaluate(()=>KazuApp.Store.hasSticker('count:0:g')),false);
      await page.evaluate(()=>{window.__bookDay=1;});await open(page);await slot(page,'count:0:g').click();assert.match(await page.locator('#book-detail .book-play').textContent(),/たしかめ/);
      await page.locator('#book-detail .book-play').click();await solve(page);assert.equal(await page.evaluate(()=>KazuApp.Store.shortStatus('count',0).checkRight),1);
    });
    await scenario('pending, locked levels and classroom preparation retain their true state and named routes', async page => {
      await page.evaluate(()=>KazuApp.Store.addPending('count:0'));await open(page);await slot(page,'count:0').click();
      assert.match(await page.locator('#book-detail .book-detail-copy').textContent(),/かりの シール/);assert.equal(await page.locator('#book-detail .book-place').count(),1);assert.equal(await page.evaluate(()=>KazuApp.Store.hasConfirmed('count:0')),false);
      await page.locator('#book-detail .book-return').click();await slot(page,'count:2').click();await page.locator('#book-detail .book-prepare').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'levels');
      await open(page);await page.locator('#book .book-world').selectOption('kyoshitsu');await slot(page,'g1set:0').click();
      assert.match(await page.locator('#book-detail .book-prepare').textContent(),/じゅんび/);await page.locator('#book-detail .book-prepare').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'g1-preparation');assert.match(await page.locator('#g1-preparation').textContent(),/かぞえる|すうじ/);
      assert.equal(await page.evaluate(()=>KazuApp.Store.hasSticker('g1set:0')),false);
    });
    await scenario('special collections and counts stay available; lap records and artwork stay separate', async page => {
      await normal(page);await page.evaluate(()=>{const K=KazuApp,S=K.Store;S.addSticker('daily:2026-10-18');for(const g of K.Games.list.filter(g=>g.world==='shima'))for(let i=0;i<g.levels.length;i++)S.addSticker(g.id+':'+i+':g');S.claimTreasure('shima');});await open(page);
      assert.equal(await page.locator('#book .aim b').textContent(),'18まい');
      await page.evaluate(()=>KazuApp.Rounds.go(2));assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book');
      assert.equal(await page.locator('#book .book-extras').evaluate(n=>n.open),true);assert.match(await page.locator('#book .round-collection').innerText(),/156/);
      await page.evaluate(()=>KazuApp.TextbookReview.open());assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book');assert.equal(await page.locator('#book .review-gate').isVisible(),true);
      assert.equal(await page.locator('#book .treasure-keepsake.owned').count(),1);assert.equal(await page.locator('#book .round-collection').count(),1);assert.equal(await page.locator('#book .book-preparation [data-preparation]').count(),4);
      const pokemon=await slot(page,'count:0').locator('.pokemon-name').textContent();
      await page.evaluate(()=>{const S=KazuApp.Store;S.unlockRoundTwo();S.selectRound(2);});await open(page);
      assert.equal(await page.locator('#book .book-slot.got').count(),0);assert.notEqual(await slot(page,'count:0').locator('.pokemon-name').textContent(),pokemon);
      await page.evaluate(()=>KazuApp.Store.selectRound(1));await open(page);assert.equal(await page.locator('#book .aim b').textContent(),'18まい');
      assert.equal(await slot(page,'count:0').locator('.pokemon-name').textContent(),pokemon);assert.equal(await page.evaluate(()=>KazuApp.Store.hasTreasure('shima')),true);
    });
    assert.deepEqual(errors,[]);console.log('PASS '+passed+' sticker-book browser scenarios; no browser exceptions');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
