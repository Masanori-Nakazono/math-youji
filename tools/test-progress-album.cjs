#!/usr/bin/env node
'use strict';
// Real learning records -> compact album, without writing any learning data on
// viewing. Both portable outputs use isolated storage and blocked remote assets.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'});res.end(e?'':b);});
});
const report=t=>console.log('PASS '+t);
(async()=>{
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const errors=[];
    for(const file of ['kazu-no-bouken.html','artifact.html']){
      const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'});
      const page=await context.newPage();page.on('pageerror',e=>errors.push(file+': '+e.message));
      await page.route('https://**',r=>r.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/dist/${file}`,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;S.reset();K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
        window.__albumSpeech=[];K.Sound.say=(t,o)=>{window.__albumSpeech.push(t);if(o&&o.onend)o.onend();};
        K.ProgressAlbum.open();
      });
      assert.equal(await page.locator('#progress-album .album-card').count(),0);
      assert.match(await page.locator('#progress-album .album-empty').textContent(),/からっぽ/);
      report(file+': empty album is a usable, quiet starting state');
      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;
        const click=sel=>{const b=document.querySelector(sel);if(!b)throw Error('missing '+sel);b.click();};
        S.setPref('transferReached',true);
        const previous=Math.random;Math.random=()=>.5;
        try{
          K.TransferAdventure.open();click('#transfer [data-mission="0"]');
          for(let step=0;step<5;step++){
            for(let i=0;i<4;i++)click('#transfer [aria-label="１つ うごかす"]');
            click('#transfer .transfer-check');click('#transfer .transfer-next');
          }
        }finally{Math.random=previous;}
        if(S.data.transferRecords[0].independent!==5||!S.hasSticker('transfer:0'))throw Error('real 5-question adventure failed');
        // The normal book entrance opens from actual related preparation. Solve
        // the original eight questions through the same controls as the child.
        K.TextbookReview.preparation(0).forEach(p=>S.addSticker(p.game.id+':'+p.levelIndex));
        K.TextbookReview.open(0);
        for(let step=0;step<8;step++){
          const {q}=K.TextbookReview.inspect();
          if(q.type==='match')for(let i=0;i<q.a;i++){
            click('#review [data-focus="target'+i+'"]');click('#review [data-focus="pair'+i+'"]');
          }
          else q.answer.forEach(i=>click('#review [data-focus="object'+i+'"]'));
          click('#review .review-check');click('#review .review-next');
        }
        if(S.data.reviewRecords['r2:0'].independent!==8)throw Error('real book lesson failed');
        window.__albumBefore=JSON.stringify(S.roundData(1));K.ProgressAlbum.open();
      });
      assert.equal(await page.locator('[data-album-key="adventure:0"]').count(),1);
      assert.equal(await page.locator('[data-album-key="book:r2:0"]').count(),1);
      await page.locator('[data-album-key="adventure:0"] > summary').click();
      await page.locator('[data-album-key="adventure:0"] .album-read').click();
      assert.match(await page.locator('[data-album-key="adventure:0"] .album-entry').textContent(),/さいしょから ひとりで 5もん/);
      assert.match(await page.evaluate(()=>window.__albumSpeech.at(-1)),/年.*月.*日。1しゅうめ。.*ひとりで 5もん/);
      assert.equal(await page.evaluate(()=>JSON.stringify(KazuApp.Store.roundData(1))===window.__albumBefore),true);
      report(file+': real five-question adventure and eight-question book completion appear; reading keeps data unchanged');

      // Dense historical fixture includes every kind and two genuine laps; the
      // view must not invent attempts, overwrite last-run observations, or mutate
      // the current lap while reading records from the other lap.
      await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;S.reset();
        const kinds=['viewed','together','supported','revised','independent'];
        K.Games.list.forEach(g=>g.levels.forEach((lv,i)=>kinds.forEach((kind,n)=>{
          S.recordMilestone(g.id,i,kind,'じっさいの '+g.name+' '+n);
          S.data.milestones[g.id+':'+i+':'+kind].day=20000+n;
        })));
        S.setPref('transferRecords',{
          0:{day:20008,independent:3,revised:1,supported:1},
          1:{day:20007,independent:0,revised:0,supported:3}
        });
        S.recordReview('r2:0',['independent','independent','revised','supported','supported','supported','supported','supported'],'lesson');
        S.data.reviewRecords['r2:0'].day=20009;
        S.recordReview('r2chapter:0',['independent','independent','independent','independent','supported'],'chapter');
        S.data.reviewRecords['r2chapter:0'].day=20006;
        S.unlockRoundTwo();S.selectRound(2);
        S.recordMilestone('count',0,'together','２しゅうめの じっさいの もんだい');S.data.milestones['count:0:together'].day=20010;
        S.recordReview('r2:0',Array(8).fill('supported'),'lesson');S.data.reviewRecords['r2:0'].day=20011;
        S.setPref('transferRecords',{0:{day:20012,independent:0,revised:2,supported:3}});
        S.selectRound(1);S.flush();window.__albumDenseBefore=JSON.stringify(S.roundData(1));
        window.__albumBackup=S.exportText();K.ProgressAlbum.open();
      });
      assert.equal(await page.locator('#progress-album .album-card').count(),64);
      assert.equal(await page.locator('#progress-album .album-card').first().getAttribute('data-album-key'),'adventure:0');
      await page.locator('[data-album-filter="play"]').click();
      assert.equal(await page.locator('#progress-album .album-card').count(),60,'300 milestones compact to 60 materials');
      assert.equal(await page.locator('#progress-album .album-card').evaluateAll(ns=>ns.every(n=>n.getBoundingClientRect().height>=n.querySelector('summary').getBoundingClientRect().height)),true,'dense cards retain their full touch area instead of compressing over one another');
      const countCard=page.locator('[data-album-key="play:count:0"]');
      if(process.env.ALBUM_SCREENSHOT_DIR){
        fs.mkdirSync(process.env.ALBUM_SCREENSHOT_DIR,{recursive:true});
        await countCard.locator('summary').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(process.env.ALBUM_SCREENSHOT_DIR,file+'-dense.png')});
      }
      await countCard.locator('summary').click();
      assert.equal(await countCard.locator('.album-entry').count(),6);
      assert.match(await countCard.textContent(),/1しゅうめ/);assert.match(await countCard.textContent(),/2しゅうめ/);
      const dates=await countCard.locator('time').evaluateAll(ns=>ns.map(n=>n.getAttribute('datetime')));
      assert.ok(dates.includes('2024-10-04'));assert.ok(dates.includes('2024-10-14'));
      await countCard.locator('.album-read').click();
      const said=await page.evaluate(()=>window.__albumSpeech.at(-1));
      for(const text of ['2024年10月4日','やりかたを みたね','いっしょに こたえたね','ヒントを つかって','もういちど ためして','ひとりで こたえたね','2しゅうめ'])assert.ok(said.includes(text),text);
      await page.locator('[data-album-filter="adventure"]').click();
      assert.equal(await page.locator('#progress-album .album-card').count(),2);
      assert.equal(await page.locator('[data-album-key="adventure:0"] .album-entry').count(),2);
      assert.match(await page.locator('[data-album-key="adventure:0"] .album-history').textContent(),/さいしょから ひとりで 3もん.*こたえなおして 1もん.*ヒント・みほんと 1もん.*こたえなおして 2もん.*ヒント・みほんと 3もん/s);
      assert.doesNotMatch(await page.locator('[data-album-key="adventure:1"] .album-history').textContent(),/ひとりで/,'legacy supported 3-question run must stay supported');
      await page.locator('[data-album-filter="book"]').click();
      assert.equal(await page.locator('#progress-album .album-card').count(),2);
      assert.match(await page.locator('[data-album-key="book:r2:0"] .album-history').textContent(),/さいごの きろく・レッスン/);
      assert.match(await page.locator('[data-album-key="book:r2:0"] .album-history').textContent(),/ヒント・みほんと 8もん/);
      assert.equal(await page.evaluate(()=>KazuApp.Store.round()===1&&JSON.stringify(KazuApp.Store.roundData(1))===window.__albumDenseBefore),true);
      report(file+': 300 stages compact to 60 materials; actual dates, outcomes, latest records, and both laps remain distinct');

      for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}]){
        await page.setViewportSize(viewport);
        await page.locator('[data-album-filter="recent"]').click();
        const first=page.locator('#progress-album .album-card').first();
        await first.locator('summary').click();
        const layout=await page.evaluate(()=>{
          const root=document.querySelector('#progress-album'),list=root.querySelector('.album-cards');
          return {overflow:document.documentElement.scrollWidth>innerWidth||list.scrollWidth>list.clientWidth+1,
            controls:[...root.querySelectorAll('.album-filter, .album-summary, .album-read')].filter(n=>n.getBoundingClientRect().height>0).map(n=>n.getBoundingClientRect().height),
            area:list.getBoundingClientRect().height};
        });
        assert.equal(layout.overflow,false,JSON.stringify(viewport));assert.ok(layout.area>120);
        assert.ok(layout.controls.every(h=>h>=48),JSON.stringify({viewport,heights:layout.controls}));
        await first.locator('.album-read').focus();await page.keyboard.press('Enter');
        assert.match(await page.evaluate(()=>window.__albumSpeech.at(-1)),/2しゅうめ/);
        if(process.env.ALBUM_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ALBUM_SCREENSHOT_DIR,file+'-'+viewport.width+'-open.png')});
        await first.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await first.evaluate(n=>n.open),false);
        if(process.env.ALBUM_SCREENSHOT_DIR){fs.mkdirSync(process.env.ALBUM_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ALBUM_SCREENSHOT_DIR,file+'-'+viewport.width+'.png')});}
      }
      report(file+': four screen widths, large targets, keyboard reading and native expand/collapse work');
      await page.evaluate(()=>{
        const S=KazuApp.Store;S.reset();if(!S.importText(window.__albumBackup,'replace').ok)throw Error('backup restore failed');
        window.__albumRestoredBefore=JSON.stringify(S.roundData(1));KazuApp.ProgressAlbum.open();
      });
      assert.equal(await page.locator('#progress-album .album-card').count(),64);
      assert.equal(await page.evaluate(()=>JSON.stringify(KazuApp.Store.roundData(1))===window.__albumRestoredBefore),true);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.evaluate(()=>{KazuApp.Sound.voiceOn=false;KazuApp.Sound.sfxOn=false;KazuApp.ProgressAlbum.open();});
      assert.equal(await page.locator('#progress-album .album-card').count(),64);
      report(file+': backup replacement and real reload reproduce all compact records');
      await context.close();
    }
    assert.deepEqual(errors,[]);report('both outputs have zero browser exceptions');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
