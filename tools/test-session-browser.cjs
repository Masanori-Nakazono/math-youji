#!/usr/bin/env node
'use strict';
// Run the real saved-visit flow in fresh browser contexts. No user profile is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    res.writeHead(err ? 404 : 200, {
      'Content-Type':file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      'Cache-Control':'no-store'
    });
    res.end(err ? 'not found' : body);
  });
});

(async () => {
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {});
    const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
    const quiet = page => page.evaluate(() => {
      const K = KazuApp;
      K.Sound.hush(); K.Sound.voiceOn = false; K.Sound.sfxOn = false;
      K.Sound.say = (text, opts) => { if (opts && opts.onend) opts.onend(); };
      K.Session._test.intro(false); K.Session._test.overview(false); K.Session._test.autoAdvance(true); K.Session._test.breaks(false);
    });
    const reload = async page => {
      await page.evaluate(() => KazuApp.Store.flush());
      await page.reload({waitUntil:'domcontentloaded'});
      await quiet(page);
    };
    const solve = page => page.evaluate(() => {
      const K = KazuApp, T = K.Session._test;
      let turns = 0;
      while (K.UI.currentName() === 'play' && turns++ < 100){ T.forceCorrect(); T.flushTimers(); }
      return {turns, screen:K.UI.currentName(), today:K.Store.todayCount(), checkpoint:K.Store.savedSession(),
        stars:K.Store.stars('count',0), plays:K.Store.plays('count',0), gold:K.Store.hasSticker('count:0:g')};
    });
    const scenario = async (name, run) => {
      if (process.env.SESSION_TEST_FILTER && !new RegExp(process.env.SESSION_TEST_FILTER).test(name)) return;
      const context = await browser.newContext({viewport:{width:1024,height:768}, reducedMotion:'reduce',
        serviceWorkers:'block', timezoneId:'Asia/Tokyo'});
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(name + ': ' + error.message));
      await page.route('https://**', route => route.abort());
      try {
        await page.goto(url, {waitUntil:'domcontentloaded'});
        await quiet(page);
        await page.evaluate(() => KazuApp.Store.reset());
        await run(page);
        console.log('PASS ' + name);
      } finally { await context.close(); }
    };

    await scenario('an answer saved before its animation resumes at the next question and counts once', async page => {
      const before = await page.evaluate(() => {
        const K = KazuApp, S = K.Store, T = K.Session._test;
        K.Session.startLevel(K.Games.byId.count, 0); T.forceCorrect();
        return {cursor:S.savedSession().index, today:S.todayCount(), visualIndex:T.idx, locked:T.locked};
      });
      assert.deepEqual(before, {cursor:1,today:1,visualIndex:0,locked:true});
      await reload(page);
      const resumed = await page.evaluate(() => {
        const K = KazuApp, before = K.Session.pendingSummary();
        const ok = K.Session.resume();
        return {before,ok,index:K.Session._test.idx,count:document.querySelector('#play .session-count').textContent};
      });
      assert.equal(resumed.ok, true); assert.equal(resumed.index, 1); assert.equal(resumed.before.remaining, 7);
      assert.match(resumed.count, /^2／8もん/);
      const done = await solve(page);
      assert.equal(done.screen, 'result'); assert.equal(done.today, 8); assert.equal(done.plays, 1);
      assert.equal(done.stars, 3); assert.equal(done.gold, true); assert.equal(done.checkpoint, null);
    });

    await scenario('wrong answers and help survive reload with the same generated question and prevent gold', async page => {
      const before = await page.evaluate(() => {
        const K = KazuApp, T = K.Session._test;
        K.Session.startLevel(K.Games.byId.numeral,0);
        const answer = Number(T.item.split(':').at(-1));
        [...document.querySelectorAll('#play .plate, #play .choice')]
          .find(p => Number(p.dataset.count || p.textContent) !== answer).click();
        document.querySelector('#play .showbtn').click();
        return {item:T.item, question:K.Store.savedSession().question,
          seed:K.Store.savedSession().plan[0].seed,
          choices:[...document.querySelectorAll('#play .plate, #play .choice')].map(p => p.dataset.count || p.textContent)};
      });
      assert.equal(before.question.wrongThisQ, 1); assert.equal(before.question.helped, true);
      await reload(page);
      const after = await page.evaluate(() => {
        const K = KazuApp; K.Session.resume();
        return {item:K.Session._test.item, question:K.Store.savedSession().question,
          seed:K.Store.savedSession().plan[0].seed,
          choices:[...document.querySelectorAll('#play .plate, #play .choice')].map(p => p.dataset.count || p.textContent)};
      });
      assert.deepEqual(after, before);
      await solve(page);
      const result = await page.evaluate(() => ({gold:KazuApp.Store.hasSticker('numeral:0:g'),
        stars:KazuApp.Store.stars('numeral',0),today:KazuApp.Store.todayCount(),recent:KazuApp.Store.data.recent['numeral:0']}));
      assert.equal(result.gold, false); assert.equal(result.stars, 2); assert.equal(result.today, 8);
      assert.equal(result.recent[0], '0');
    });

    await scenario('the overview includes lessons and checks while grading only the eight main questions', async page => {
      const overview = await page.evaluate(() => {
        const K = KazuApp, S = K.Store, T = K.Session._test;
        S.markIntroduced('numeral',0); S.addPending('numeral:0');
        S.data.pending['numeral:0'] = [S.dayNumber()-1,0,0];
        T.intro(true); T.overview(true);
        K.Session.startLevel(K.Games.byId.count,0);
        return {screen:K.UI.currentName(), text:document.querySelector('#session-overview').textContent,
          today:S.todayCount(),plan:T.planLength,intros:T.planIntro.filter(Boolean).length,checks:T.planChecks.filter(Boolean).length};
      });
      assert.equal(overview.screen,'session-overview'); assert.equal(overview.plan,13);
      assert.equal(overview.intros,2); assert.equal(overview.checks,3); assert.equal(overview.today,0);
      assert.match(overview.text,/ぜんぶで 13もん/); assert.match(overview.text,/ほんばん 8もん/);
      await page.locator('#session-overview .session-continue').click();
      assert.equal(await page.evaluate(() => KazuApp.UI.currentName()),'play');
      const done = await solve(page);
      assert.equal(done.screen,'result'); assert.equal(done.today,13); assert.equal(done.stars,3);
      const grades = await page.evaluate(() => ({seen:KazuApp.Store.data.seen.count,
        firstTry:KazuApp.Store.data.firstTry.count,pending:KazuApp.Store.isPending('numeral:0')}));
      assert.equal(grades.seen,8); assert.deepEqual(grades.firstTry,[8,8]); assert.equal(grades.pending,false);
    });

    await scenario('four answered questions offer rest and retain the remaining four on Home', async page => {
      await page.evaluate(() => {
        const K = KazuApp, T = K.Session._test; T.breaks(true);
        K.Session.startLevel(K.Games.byId.count,0);
        for(let i=0;i<4;i++){T.forceCorrect();T.flushTimers();}
      });
      assert.equal(await page.evaluate(() => KazuApp.UI.currentName()),'session-overview');
      await page.getByRole('button',{name:'ここで やすむ',exact:true}).click();
      const resting = await page.evaluate(() => ({screen:KazuApp.UI.currentName(),today:KazuApp.Store.todayCount(),
        summary:KazuApp.Session.pendingSummary(),home:document.querySelector('#home').textContent}));
      assert.equal(resting.screen,'home'); assert.equal(resting.today,4); assert.equal(resting.summary.remaining,4);
      assert.match(resting.home,/つづきから/);
      await reload(page);
      await page.evaluate(() => { KazuApp.Home.render(); KazuApp.UI.show('home'); });
      assert.equal(await page.locator('#home .home-primary').getAttribute('data-action'),'resume');
      await page.locator('#home .home-primary').click();
      assert.equal(await page.evaluate(() => KazuApp.Session._test.idx),4);
      const done = await solve(page);
      assert.equal(done.screen,'result'); assert.equal(done.today,8); assert.equal(done.plays,1);
    });

    await scenario('a completed checkpoint finishes exactly once after reload before the final animation', async page => {
      const last = await page.evaluate(() => {
        const K = KazuApp, T = K.Session._test;
        K.Session.startLevel(K.Games.byId.count,0);
        for(let i=0;i<7;i++){T.forceCorrect();T.flushTimers();}
        T.forceCorrect();
        return {cursor:K.Store.savedSession().index,today:K.Store.todayCount(),plays:K.Store.plays('count',0)};
      });
      assert.deepEqual(last,{cursor:8,today:8,plays:0});
      await reload(page);
      const finished = await page.evaluate(() => {
        const K = KazuApp, first=K.Session.resume(), second=K.Session.resume();
        return {first,second,screen:K.UI.currentName(),today:K.Store.todayCount(),plays:K.Store.plays('count',0),checkpoint:K.Store.savedSession()};
      });
      assert.deepEqual(finished,{first:true,second:false,screen:'result',today:8,plays:1,checkpoint:null});
      await reload(page);
      assert.deepEqual(await page.evaluate(() => ({resume:KazuApp.Session.resume(),plays:KazuApp.Store.plays('count',0),today:KazuApp.Store.todayCount()})),
        {resume:false,plays:1,today:8});
    });

    await scenario('leaving the final animation settles the completed visit before another lesson starts', async page => {
      const result=await page.evaluate(()=>{
        const K=KazuApp,S=K.Store,T=K.Session._test;
        K.Session.startLevel(K.Games.byId.count,0);
        for(let i=0;i<7;i++){T.forceCorrect();T.flushTimers();}
        T.forceCorrect();
        const checkpoint=S.savedSession();
        const back=document.querySelector('#play .backbtn');back.click();back.click();
        const left=K.UI.currentName();
        K.Session.startLevel(K.Games.byId.numeral,0);
        T.flushTimers();
        return {savedIndex:checkpoint.index,left,screen:K.UI.currentName(),today:S.todayCount(),
          plays:S.plays('count',0),stars:S.stars('count',0),plain:S.hasSticker('count:0'),gold:S.hasSticker('count:0:g'),
          checkpoint:S.savedSession(),newPlays:S.plays('numeral',0),plan:T.planGames};
      });
      assert.equal(result.savedIndex,8);assert.equal(result.left,'levels');assert.equal(result.screen,'result');
      assert.equal(result.today,8);assert.equal(result.plays,1);assert.equal(result.stars,3);
      assert.equal(result.plain,true);assert.equal(result.gold,true);assert.equal(result.checkpoint,null);
      assert.equal(result.newPlays,0);assert.ok(result.plan.every(p=>p==='count:0'));
    });

    await scenario('obsolete checkpoint references are discarded without changing lasting learning records', async page => {
      const outcomes=await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;
        S.recordLevel('count',0,3,8,8);S.addSticker('count:0');S.setName('はな');
        K.Session.startLevel(K.Games.byId.count,0);
        const good=S.savedSession();
        const history=()=>JSON.stringify({stars:S.data.stars,plays:S.data.plays,firstTry:S.data.firstTry,
          daily:S.data.daily,stickers:S.data.stickers,name:S.name});
        const before=history(),results=[];
        const changes=[
          s=>{s.gameId='futuregame';},s=>{s.levelIndex=100;},s=>{s.gameId=null;},
          s=>{s.plan[0].gameId='futuregame';},s=>{s.plan[0].levelIndex=100;},
          s=>{s.firstTarget={gameId:'futuregame',levelIndex:0};},
          s=>{s.adventureTarget={gameId:'futuregame',levelIndex:0,want:null};},
          s=>{s.mode='first';s.firstTarget=null;s.firstPhase='show';},
          s=>{s.mode='first';s.firstTarget={gameId:'count',levelIndex:0};s.firstPhase=null;},
          s=>{s.mode='first';s.gameId=null;s.firstTarget={gameId:'count',levelIndex:0};s.firstPhase='show';},
          s=>{s.mode='adventure';s.gameId=null;s.adventureTarget=null;}
        ];
        for(const change of changes){
          const bad=JSON.parse(JSON.stringify(good));change(bad);
          const saved=S.saveSession(bad),summary=K.Session.pendingSummary(),resumed=K.Session.resume();
          results.push({saved,summary,resumed,checkpoint:S.savedSession(),historyUnchanged:history()===before});
        }
        return results;
      });
      assert.equal(outcomes.length,11);
      for(const result of outcomes)assert.deepEqual(result,{saved:true,summary:null,resumed:false,checkpoint:null,historyUnchanged:true});
    });

    await scenario('lap checkpoints remain independent and replace restores the selected lap', async page => {
      const backup = await page.evaluate(() => {
        const K = KazuApp, S = K.Store, T = K.Session._test;
        K.Session.startLevel(K.Games.byId.count,0);T.forceCorrect();T.flushTimers();
        const first=S.savedSession().id;
        S.unlockRoundTwo();S.selectRound(2);
        K.Session.startLevel(K.Games.byId.numeral,0);
        for(let i=0;i<2;i++){T.forceCorrect();T.flushTimers();}
        return {text:S.exportText(),first,second:S.savedSession().id,firstIndex:S.roundData(1).savedSession.index,secondIndex:S.roundData(2).savedSession.index};
      });
      assert.notEqual(backup.first,backup.second);assert.equal(backup.firstIndex,1);assert.equal(backup.secondIndex,2);
      await reload(page);
      const restored=await page.evaluate(text=>{
        const K=KazuApp,S=K.Store;
        S.reset();const result=S.importText(text,'replace');K.Session.resume();
        return {ok:result.ok,round:S.round(),index:K.Session._test.idx,mode:K.Session._test.mode,
          first:S.roundData(1).savedSession.index,second:S.roundData(2).savedSession.index,today:S.todayCount()};
      },backup.text);
      assert.deepEqual(restored,{ok:true,round:2,index:2,mode:'level',first:1,second:2,today:3});
      await solve(page);
      const end=await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;
        const lap2={gold:S.hasSticker('numeral:0:g'),checkpoint:S.savedSession(),today:S.todayCount()};
        S.selectRound(1);K.Session.resume();
        return {lap2,index:K.Session._test.idx,firstGold:S.hasSticker('numeral:0:g')};
      });
      assert.deepEqual(end,{lap2:{gold:true,checkpoint:null,today:9},index:1,firstGold:false});
    });

    await scenario('answers on either side of midnight stay on their actual day', async page => {
      await page.clock.setFixedTime(new Date('2026-10-17T23:59:00+09:00'));
      const first=await page.evaluate(()=>{
        const K=KazuApp;K.Session.startLevel(K.Games.byId.count,0);K.Session._test.forceCorrect();K.Session._test.flushTimers();
        return {day:K.Store.todayKey(),count:K.Store.todayCount()};
      });
      assert.deepEqual(first,{day:'2026-10-17',count:1});
      await page.clock.setFixedTime(new Date('2026-10-18T00:01:00+09:00'));
      await reload(page);
      await page.evaluate(()=>KazuApp.Session.resume());
      const done=await solve(page);
      assert.equal(done.screen,'result');assert.equal(done.today,7);
      assert.deepEqual(await page.evaluate(()=>KazuApp.Store.data.daily),{'2026-10-17':1,'2026-10-18':7});
    });

    for(const mode of ['daily','adventure','first']) await scenario(mode + ' visits resume without converting participation into level stars', async page => {
      const saved=await page.evaluate(mode=>{
        const K=KazuApp,T=K.Session._test,S=K.Store;
        if(mode==='daily'){
          S.markIntroduced('count',0);K.Session.startDaily(4);
        }else if(mode==='adventure'){
          const game=K.Games.byId.numeral;
          K.Session.startAdventure({game,level:game.levels[0],levelIndex:0,want:null});
        }else K.Session.startFirst(K.Games.byId.count,0,'together');
        T.forceCorrect();T.flushTimers();
        const checkpoint=S.savedSession();
        return {mode:checkpoint && checkpoint.mode,index:checkpoint && checkpoint.index,length:T.planLength,today:S.todayCount()};
      },mode);
      assert.equal(saved.mode,mode);assert.equal(saved.index,1);assert.equal(saved.today,1);
      await reload(page);
      assert.equal(await page.evaluate(()=>KazuApp.Session.resume()),true);
      await solve(page);
      const done=await page.evaluate(()=>{
        const K=KazuApp,S=K.Store;
        return {checkpoint:S.savedSession(),today:S.todayCount(),stars:S.totalStars(),practice:S.data.practice,
          practiceDone:S.practiceDoneToday(),adventure:S.hasSticker('adventure:'+S.todayKey())};
      });
      assert.equal(done.checkpoint,null);assert.equal(done.today,saved.length);assert.equal(done.stars,0);
      if(mode==='daily'){assert.deepEqual(done.practice,[4,4]);assert.equal(done.practiceDone,true);}
      if(mode==='adventure')assert.equal(done.adventure,true);
    });
    await scenario('home keeps its main action and explanations readable across tablet and phone layouts',async page=>{
      await page.evaluate(()=>{KazuApp.Home.render();KazuApp.UI.show('home',{focus:false});});
      const dir=process.env.SESSION_SCREENSHOT_DIR;
      if(dir)fs.mkdirSync(dir,{recursive:true});
      for(const viewport of [{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:568}]){
        await page.setViewportSize(viewport);
        for(const colorScheme of ['light','dark']){
          await page.emulateMedia({colorScheme});
          const state=await page.evaluate(()=>{
            const primary=document.querySelector('#home .home-primary'),copy=primary.querySelector('.s');
            return {overflow:document.documentElement.scrollWidth>innerWidth,
              readable:getComputedStyle(copy).display!=='none'&&copy.scrollHeight<=copy.clientHeight+1,
              height:primary.getBoundingClientRect().height,more:document.querySelector('#home .home-more').open};
          });
          assert.equal(state.overflow,false);assert.equal(state.readable,true);assert.ok(state.height>=64);assert.equal(state.more,false);
          if(dir)await page.screenshot({path:path.join(dir,`home-${viewport.width}-${colorScheme}.png`),animations:'disabled'});
        }
      }
    });
    assert.deepEqual(errors,[],'no browser exceptions');
  } finally {
    if(browser)await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
