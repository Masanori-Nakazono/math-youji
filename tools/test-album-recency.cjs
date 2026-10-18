#!/usr/bin/env node
'use strict';
// Repeated actual learning -> dated album, and result -> selected achievement ->
// the unchanged result DOM. Set ALBUM_RECENCY_HTML to check one portable output.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
let activeFile;
const server=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end(fs.readFileSync(activeFile));
});
const report=t=>console.log('PASS '+t);
(async()=>{
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const errors=[],files=process.env.ALBUM_RECENCY_HTML?[path.resolve(process.env.ALBUM_RECENCY_HTML)]
      :['kazu-no-bouken.html','artifact.html'].map(f=>path.join(root,'dist',f));
    for(const file of files){
      activeFile=file;const label=path.basename(file);
      const context=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      await context.addInitScript(()=>{const D=Date;window.__albumTime=0;
        window.Date=class extends D{constructor(...a){super(...(a.length?a:[D.parse('2026-10-18T06:00:00Z')+window.__albumTime]));}
          static now(){return D.parse('2026-10-18T06:00:00Z')+window.__albumTime;}};
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(label+': '+e.message));
      await page.route('https://**',r=>r.abort());
      await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{
        const K=KazuApp;K.Store.reset();K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;window.__albumSaid=[];
        K.Sound.say=(s,o)=>{window.__albumSaid.push(s);if(o?.onend)o.onend();};
        K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);K.Session._test.autoAdvance(true);
        window.finishAlbumCount=()=>{
          K.Session.startLevel(K.Games.byId.count,0);
          for(let guard=0;K.UI.currentName()==='play'&&guard<30;guard++){
            document.querySelectorAll('#play .obj:not(.counted)').forEach(n=>n.click());K.Session._test.flushTimers(600);
            const answer=Number(K.Session._test.item.split(':').at(-1));
            [...document.querySelectorAll('#play .choices .choice')].find(n=>Number(n.textContent)===answer)?.click();
            K.Session._test.flushTimers(600);
          }
          if(K.UI.currentName()!=='result')throw Error('real count course did not finish');
        };
        // Populate other genuine-shaped records so the result's target would
        // otherwise be buried in the alphabetically sorted same-day collection.
        K.Games.list.forEach(g=>g.levels.forEach((lv,i)=>{if(g.id!=='count'||i!==0)K.Store.recordMilestone(g.id,i,'independent','まえからの きろく');}));
        window.finishAlbumCount();
      });
      const milestone=page.locator('#result .result-milestone');
      await milestone.scrollIntoViewIfNeeded();await milestone.focus();
      await page.evaluate(()=>{
        const button=document.querySelector('#result .result-milestone'),screen=document.querySelector('#result'),scroll=[];
        for(let n=button.parentElement;n;n=n.parentElement){scroll.push({node:n,top:n.scrollTop,left:n.scrollLeft});if(n===screen)break;}
        window.__albumResult={button,screen,scroll,text:screen.textContent,store:JSON.stringify(KazuApp.Store.roundData(1))};
      });
      await page.keyboard.press('Enter');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const target=page.locator('[data-album-key="play:count:0"]');
      assert.equal(await target.evaluate(n=>n.open),true);
      assert.equal(await target.evaluate(n=>n.classList.contains('album-highlight')),true);
      assert.equal(await target.locator('summary').evaluate(n=>document.activeElement===n),true);
      assert.equal(await target.locator('summary').evaluate(n=>{const r=n.getBoundingClientRect(),l=n.closest('.album-cards').getBoundingClientRect();return r.top>=l.top-1&&r.bottom<=l.bottom+1;}),true,'target summary is in the album viewport');
      assert.equal(await page.evaluate(()=>JSON.stringify(KazuApp.Store.roundData(1))===window.__albumResult.store),true);
      if(process.env.ALBUM_RECENCY_SCREENSHOT_DIR){
        fs.mkdirSync(process.env.ALBUM_RECENCY_SCREENSHOT_DIR,{recursive:true});await page.waitForTimeout(1100);
        await page.screenshot({path:path.join(process.env.ALBUM_RECENCY_SCREENSHOT_DIR,label+'-result-target-320.png')});
      }
      await page.locator('#progress-album .topbar button').first().click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(()=>{
        const x=window.__albumResult;return KazuApp.UI.currentName()==='result'&&document.querySelector('#result')===x.screen
          &&document.querySelector('#result .result-milestone')===x.button&&document.activeElement===x.button
          &&x.screen.textContent===x.text&&x.scroll.every(s=>Math.abs(s.node.scrollTop-s.top)<1&&Math.abs(s.node.scrollLeft-s.left)<1)
          &&JSON.stringify(KazuApp.Store.roundData(1))===x.store&&KazuApp.Store.todayCount()===8;
      }),true,'return restores the same DOM, scroll, focus, and exactly the earned records');
      report(label+': real result opens its exact achievement and returns to the unchanged result, scroll and focus');

      // An ordinary opening cannot inherit the former result's return location.
      await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home');KazuApp.ProgressAlbum.open();});
      await page.locator('#progress-album .topbar button').first().click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');
      // Nor may an origin cross laps, or point at a replaced result button.
      await page.evaluate(()=>{KazuApp.UI.show('result');document.querySelector('#result .result-milestone').click();KazuApp.Store.unlockRoundTwo();KazuApp.Store.selectRound(2);});
      await page.locator('#progress-album .topbar button').first().click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()==='home'&&KazuApp.Store.round()===2),true);
      await page.evaluate(()=>{
        const K=KazuApp;K.Store.selectRound(1);K.UI.show('result');document.querySelector('#result .result-milestone').click();
        document.querySelector('#result .result-milestone').remove();
      });
      await page.locator('#progress-album .topbar button').first().click();
      assert.equal(await page.evaluate(()=>KazuApp.UI.currentName()),'home');
      report(label+': ordinary openings, changed laps and removed result buttons discard stale origins safely');


      await page.evaluate(()=>{window.__albumTime=86400000;window.finishAlbumCount();window.__albumRepeatBefore=JSON.stringify(KazuApp.Store.roundData(1));KazuApp.ProgressAlbum.open();});
      assert.equal(await page.locator('#progress-album .album-card').first().getAttribute('data-album-key'),'play:count:0');
      assert.match(await target.locator('.album-date').textContent(),/さいごに あそんだひ/);
      assert.equal(await target.locator('.album-date > time').getAttribute('datetime'),'2026-10-19');
      await target.locator('summary').click();
      assert.equal(await target.locator('.album-first-date time').getAttribute('datetime'),'2026-10-18');
      assert.equal(await target.locator('.album-entry time').getAttribute('datetime'),'2026-10-18');
      assert.equal(await target.locator('.album-entry').count(),1,'repeat practice is not fabricated as a new independent milestone');
      assert.equal(await target.locator('.album-last-played').count(),1);
      await target.locator('.album-read').click();
      assert.match(await page.evaluate(()=>window.__albumSaid.at(-1)),/さいごに.*2026年10月19日/);
      assert.match(await page.evaluate(()=>window.__albumSaid.at(-1)),/2026年10月18日.*ひとりで こたえたね/);
      assert.equal(await page.evaluate(()=>JSON.stringify(KazuApp.Store.roundData(1))===window.__albumRepeatBefore&&KazuApp.Store.plays('count',0)===2&&KazuApp.Store.todayCount()===8),true);
      await page.locator('[data-album-filter="play"]').click();
      assert.equal(await page.locator('#progress-album .album-card').first().getAttribute('data-album-key'),'play:count:0');
      report(label+': actual next-day replay changes recency while first milestone dates and learning records remain intact');



      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;S.reset();
        // Old backups can contain observed last dates without milestones.
        S.data.last['count:0']=20000;S.data.plays['count:0']=2;
        window.__albumLegacy=S.exportText();S.reset();if(!S.importText(window.__albumLegacy,'replace').ok)throw Error('legacy fixture import');
        window.__albumLegacyBefore=JSON.stringify(S.roundData(1));K.ProgressAlbum.open();
      });
      assert.equal(await page.locator('#progress-album .album-card').count(),1);
      assert.equal(await target.locator('.album-date > time').getAttribute('datetime'),'2024-10-04');
      await target.locator('summary').click();
      assert.equal(await target.locator('.album-entry').count(),0);
      assert.equal(await target.locator('.album-first-date').count(),0);
      assert.doesNotMatch(await target.textContent(),/ひとりで|こたえなおして|ヒント・みほんと|2かい|2回/,'last-only records imply neither accuracy nor total visits');
      await target.locator('.album-read').click();
      assert.doesNotMatch(await page.evaluate(()=>window.__albumSaid.at(-1)),/ひとりで|こたえなおして|ヒント・みほんと/);
      assert.equal(await page.evaluate(()=>JSON.stringify(KazuApp.Store.roundData(1))===window.__albumLegacyBefore),true);
      report(label+': last-only legacy backup renders a dated neutral observation without fabricated milestones or visit counts');

      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;S.reset();
        S.recordMilestone('count',0,'viewed','みほんを みたね');S.data.milestones['count:0:viewed'].day=20000;S.data.last['count:0']=20005;
        S.unlockRoundTwo();S.selectRound(2);S.recordMilestone('count',0,'independent','２しゅうめの きろく');
        S.data.milestones['count:0:independent'].day=20001;S.data.last['count:0']=20010;S.selectRound(1);
        S.flush();window.__albumBothBefore=JSON.stringify(S.roundData(1));window.__albumBothBackup=S.exportText();K.ProgressAlbum.open();
      });
      await target.locator('summary').click();
      assert.equal(await target.locator('.album-entry').count(),2);
      assert.equal(await target.locator('.album-last-played').count(),2);
      assert.equal(await target.locator('.album-last-played[data-round="1"] time').getAttribute('datetime'),'2024-10-09');
      assert.equal(await target.locator('.album-last-played[data-round="2"] time').getAttribute('datetime'),'2024-10-14');
      assert.equal(await target.locator('.album-date > time').getAttribute('datetime'),'2024-10-14');
      assert.equal(await target.locator('.album-first-date time').getAttribute('datetime'),'2024-10-04');
      assert.equal(await page.evaluate(()=>JSON.stringify(KazuApp.Store.roundData(1))===window.__albumBothBefore&&KazuApp.Store.round()===1),true);
      report(label+': both laps keep their actual last dates and original milestone dates within one material');

      if(process.env.ALBUM_RECENCY_SCREENSHOT_DIR)await page.waitForTimeout(1100);
      for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
        await page.setViewportSize(viewport);
        const geometry=await page.evaluate(()=>{
          const root=document.querySelector('#progress-album'),list=root.querySelector('.album-cards');
          return {overflow:document.documentElement.scrollWidth>innerWidth||list.scrollWidth>list.clientWidth+1,
            heights:[...root.querySelectorAll('.album-filter,.album-summary,.album-read')].filter(n=>n.getBoundingClientRect().height).map(n=>n.getBoundingClientRect().height)};
        });
        assert.equal(geometry.overflow,false,JSON.stringify(viewport));assert.ok(geometry.heights.every(h=>h>=48));
        if(process.env.ALBUM_RECENCY_SCREENSHOT_DIR){fs.mkdirSync(process.env.ALBUM_RECENCY_SCREENSHOT_DIR,{recursive:true});
          await page.screenshot({path:path.join(process.env.ALBUM_RECENCY_SCREENSHOT_DIR,label+'-'+viewport.width+'.png')});}
      }
      await page.evaluate(()=>{const S=KazuApp.Store;S.reset();if(!S.importText(window.__albumBothBackup,'replace').ok)throw Error('backup restore');S.flush();});
      await page.reload({waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{KazuApp.Sound.voiceOn=false;KazuApp.Sound.sfxOn=false;KazuApp.ProgressAlbum.open();});
      assert.equal(await target.locator('.album-date > time').getAttribute('datetime'),'2024-10-14');
      assert.equal(await target.locator('.album-last-played').count(),2);
      report(label+': four layouts, large controls, backup replacement and real reload preserve factual recency');
      await context.close();
    }
    assert.deepEqual(errors,[]);report('album recency and result navigation produce no browser exceptions');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
