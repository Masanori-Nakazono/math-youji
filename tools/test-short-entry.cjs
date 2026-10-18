#!/usr/bin/env node
'use strict';
// Entrances are exercised through real controls in disposable browser profiles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://local').pathname;
  const file = pathname === '/dist/kazu-no-bouken.html' && process.env.SHORT_ENTRY_HTML
    ? path.resolve(process.env.SHORT_ENTRY_HTML) : path.resolve(root,'.'+pathname);
  if (!file.startsWith(root+path.sep) && file !== path.resolve(process.env.SHORT_ENTRY_HTML || '.')){
    res.writeHead(403);res.end();return;
  }
  fs.readFile(file,(error,data) => {
    res.writeHead(error?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream','Cache-Control':'no-store'});
    res.end(error?'':data);
  });
});
(async () => {
  let browser,passed=0;
  const errors=[];
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch();
    const url=`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const scenario=async(name,run)=>{
      if(process.env.SHORT_ENTRY_FILTER&&!new RegExp(process.env.SHORT_ENTRY_FILTER).test(name))return;
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(()=>{
        const RealDate=Date,base=RealDate.parse('2026-10-18T03:00:00Z');window.__entryDay=0;
        window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[base+window.__entryDay*86400000]));}static now(){return base+window.__entryDay*86400000;}};
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(name+': '+error.message));
      await page.route('https://**',route=>route.abort());
      try {
        await page.goto(url,{waitUntil:'domcontentloaded'});
        await page.evaluate(()=>{const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;K.Sound.say=(t,o)=>{if(o&&o.onend)o.onend();};K.Session._test.overview(false);K.Session._test.breaks(false);K.Store.reset();});
        await run(page);passed++;console.log('PASS '+name);
      } finally {await context.close();}
    };
    const flush=page=>page.evaluate(()=>KazuApp.Session._test.flushTimers());
    const solve=async page=>{
      const objects=page.locator('#play .obj');
      for(let i=0,n=await objects.count();i<n;i++)await objects.nth(i).click();
      await flush(page);
      const answer=await page.evaluate(()=>Number(KazuApp.Session._test.item.split(':').at(-1)));
      await page.locator('#play .choices .choice').filter({hasText:new RegExp('^'+answer+'$')}).click();
      await flush(page);
      // The default pacing is intentionally kept: advance only by the child's tap.
      const next=page.locator('#play .answer-next');
      if(await next.count()&&await next.isVisible())await next.click();
      await flush(page);
    };
    const mission=async page=>{
      await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');});
      await page.locator('#home .sticker-mission > summary').click();
      await page.locator('#home [data-mission-key="count:0"]').click();
    };
    const book=async(page,key='count:0')=>{
      await page.evaluate(()=>KazuApp.Book.open());
      await page.locator('#book [data-book-key="'+key+'"]').click();
    };
    const fixture=(page,bits)=>page.evaluate(bits=>{
      const S=KazuApp.Store;S.markIntroduced('count',0);
      for(let i=0;i<bits.length;i++)S.recordShortAnswer('count',0,bits[i]==='1','entry-fixture-'+Date.now()+'-'+i,S.shortStatus('count',0).phase);
    },bits);
    const state=page=>page.evaluate(()=>{const S=KazuApp.Store;return {status:S.shortStatus('count',0),today:S.todayCount(),stars:S.stars('count',0),plays:S.plays('count',0),ended:S.endedToday()};});
    const progress=(page,screen)=>page.locator(screen+' .short-progress[data-short-key="count:0"]');

    await scenario('Home and book start the same one supported question, then one independent question',async page=>{
      await mission(page);
      const title=await progress(page,'#sticker-mission').locator('.short-progress-title').textContent();
      const label=await page.locator('#sticker-mission .sticker-mission-go').textContent();
      await book(page);assert.equal(await progress(page,'#book-detail').locator('.short-progress-title').textContent(),title);
      assert.equal(await page.locator('#book-detail .book-play').textContent(),label);
      for(const entrance of ['home','book']){
        await page.evaluate(()=>KazuApp.Store.reset());
        if(entrance==='home'){await mission(page);await page.locator('#sticker-mission .sticker-mission-go').click();}
        else {await book(page);await page.locator('#book-detail .book-play').click();}
        assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),1);
        assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'together');
        await solve(page);assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'first-finish');
        assert.equal((await state(page)).status.answered,0);
        assert.equal((await state(page)).today,1);
        const recommendation=page.locator('#first-finish .first-next');
        assert.match(await recommendation.textContent(),/かぞえよう.*1〜5/);
        assert.equal(await recommendation.locator('.bi').textContent(),'🍎');
        await recommendation.click();assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),1);
        assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),null);
        await solve(page);assert.equal((await state(page)).status.answered,1);
        assert.equal((await state(page)).stars,0);assert.equal((await state(page)).plays,0);
        if(entrance==='book'){
          await page.locator('#first-finish .first-choose').click();
          assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book');
        }
      }
    });
    await scenario('saved preparation, same-day practice and next-day check agree at both entrances',async page=>{
      for(const bits of ['1111','11111111']){
        await page.evaluate(()=>KazuApp.Store.reset());await fixture(page,bits);await mission(page);
        const homeCopy=await progress(page,'#sticker-mission').textContent();
        const homeLabel=await page.locator('#sticker-mission .sticker-mission-go').textContent();
        await book(page);assert.equal(await progress(page,'#book-detail').textContent(),homeCopy);
        assert.equal(await page.locator('#book-detail .book-play').textContent(),homeLabel);
        if(bits.length===8){
          assert.match(homeLabel,/れんしゅう/);const before=await state(page);
          await mission(page);await page.locator('#sticker-mission .sticker-mission-go').click();await solve(page);
          assert.equal((await state(page)).status.checks,0);assert.equal((await state(page)).status.readyDay,before.status.readyDay);
          await page.evaluate(()=>window.__entryDay=1);await mission(page);
          assert.match(await page.locator('#sticker-mission .sticker-mission-go').textContent(),/たしかめ/);
          await page.locator('#sticker-mission .sticker-mission-go').click();await solve(page);
          assert.equal((await state(page)).status.checks,1);assert.equal((await state(page)).plays,0);
        } else assert.match(homeLabel,/つづき/);
      }
    });
    await scenario('the longer course is an explicit counted choice and retains its own level record',async page=>{
      await fixture(page,'1111');await mission(page);
      const details=page.locator('#sticker-mission .long-course');assert.equal(await details.evaluate(n=>n.open),false);
      await details.locator('summary').click();assert.match(await details.textContent(),/8もん.*ほしや シール/);
      assert.match(await details.textContent(),/じゅんびとは べつ/);
      await details.getByRole('button',{name:/8もんの コース/}).click();
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.mode),'level');
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.planLength),8);
      for(let i=0;i<8;i++)await solve(page);
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'result');
      const after=await state(page);assert.equal(after.status.answered,4);assert.equal(after.plays,1);assert.equal(after.stars,3);
      assert.match(await page.locator('#result').textContent(),/えらんだ シールを ゲット/);
    });
    await scenario('the longer preparation screen names extra later-day checks before starting',async page=>{
      await page.evaluate(()=>{const K=KazuApp,S=K.Store;S.markIntroduced('count',0);S.markIntroduced('compare',0);S.addPending('compare:0');window.__entryDay=1;K.Session._test.overview(true);});
      await mission(page);await page.locator('#sticker-mission .long-course > summary').click();
      await page.locator('#sticker-mission .long-course button').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'session-overview');
      assert.match(await page.locator('#session-overview').textContent(),/ぜんぶで 11もん/);
      assert.match(await page.locator('#session-overview').textContent(),/たしかめ 3もん/);
      assert.equal(await page.evaluate(()=>KazuApp.Session._test.planGames.filter(k=>k==='count:0').length),8);
    });
    await scenario('choosing another activity never marks the day ended and an ended day stays ended',async page=>{
      await page.evaluate(()=>KazuApp.Store.markIntroduced('count',0));await mission(page);
      await page.locator('#sticker-mission .sticker-mission-go').click();await solve(page);
      await page.locator('#first-finish .first-choose').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');assert.equal((await state(page)).ended,false);
      assert.equal(await page.locator('#home .home-more').evaluate(n=>n.open),true);
      await page.evaluate(()=>{KazuApp.Home.endToday();KazuApp.FirstSteps.startOne(KazuApp.Games.byId.count,0,true);});await solve(page);
      await page.locator('#first-finish .first-choose').click();assert.equal((await state(page)).ended,true);
      await page.evaluate(()=>KazuApp.Home.render());assert.equal(await page.locator('#home .home-more').evaluate(n=>n.open),false);
      assert.equal(await page.locator('#home .home-primary').isVisible(),false);
    });
    await scenario('a book-origin gold visit returns to the same filter, place, scroll and focused sticker',async page=>{
      await page.setViewportSize({width:320,height:568});
      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;S.recordLevel('count',0,2,6,8,true);S.addSticker('count:0');S.markIntroduced('count',0);
        for(const game of K.Games.list)for(let i=0;i<game.levels.length;i++)if(game.id!=='count'||i!==0)S.addSticker(game.id+':'+i+':g');
        K.Book.open();
      });
      await page.locator('#book [data-filter="gold"]').click();await page.locator('#book .book-world').selectOption('shima');
      const target=page.locator('#book [data-book-key="count:0:g"]');await target.scrollIntoViewIfNeeded();
      const saved=await page.locator('#book .book').evaluate(n=>n.scrollTop);assert.ok(saved>0);
      await target.click();await page.locator('#book-detail .book-play').click();await solve(page);
      assert.equal((await state(page)).status.goldStatus.independentRun,1);assert.equal((await state(page)).stars,2);
      await page.locator('#first-finish .first-choose').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book');
      assert.equal(await page.locator('#book [data-filter="gold"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#book .book-world').inputValue(),'shima');
      assert.equal(await page.locator('#book .book').evaluate(n=>n.scrollTop),saved);
      await page.waitForFunction(()=>document.activeElement?.dataset.bookKey==='count:0:g');
      assert.equal((await state(page)).ended,false);
    });
    await scenario('returning from the last short check refreshes newly earned catalog artwork and count',async page=>{
      await fixture(page,'11111111');await page.evaluate(()=>window.__entryDay=1);await fixture(page,'11');
      await book(page);await page.locator('#book-detail .book-play').click();await solve(page);
      assert.equal((await state(page)).status.confirmed,true);
      await page.locator('#first-finish .first-choose').click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'book');
      assert.equal(await page.locator('#book [data-book-key="count:0"]').evaluate(n=>n.classList.contains('got')),true);
      assert.equal(await page.locator('#book .book-count b').textContent(),'2まい');
    });
    await scenario('the one-question action and all progress remain readable at phone and tablet sizes',async page=>{
      await fixture(page,'1111');
      for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
        await page.setViewportSize(viewport);await mission(page);
        const button=page.locator('#sticker-mission .sticker-mission-go');const box=await button.boundingBox();
        assert.ok(box&&box.width>=48&&box.height>=48&&box.y>=0&&box.y+box.height<=viewport.height,JSON.stringify({viewport,box}));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const node=progress(page,'#sticker-mission');await node.scrollIntoViewIfNeeded();
        assert.equal(await node.locator('.short-progress-step').count(),3);
        const clipped=await node.evaluate(n=>{const r=n.getBoundingClientRect();return r.left<0||r.right>innerWidth+.5;});assert.equal(clipped,false);
        await page.locator('#sticker-mission').screenshot({path:`/tmp/math-youji-short-entry-${viewport.width}.png`,animations:'disabled'});
      }
    });
    assert.deepEqual(errors,[],'no browser exceptions');console.log('PASS '+passed+' short-entry scenarios; no browser exceptions');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
