/* ===========================================================
   89 — first-run diagnostic, recommendations, and real-world missions
   =========================================================== */
'use strict';

const Diagnostic = (() => {
  const ORDER = ['count', 'numeral', 'seq', 'compare', 'ordinal', 'measure',
                 'bond', 'shape', 'pattern', 'clock'];

  function shouldRun(){
    return !Store.data.diagnostic
      && Store.totalStars() === 0
      && Object.keys(Store.data.recent || {}).length === 0;
  }

  function recommendFrom(outcomes){
    const xs = outcomes || [];
    for (const id of ORDER){
      const x = xs.find(o => o.gameId === id);
      if (x && !x.clean) return { gameId: id, levelIndex: 0 };
    }
    return { gameId: 'flash', levelIndex: 0 };
  }

  /* The order the six-month roadmap actually walks. 「いまの おすすめ」 used to know
     only five of the sixteen 入学前 games, so a child who followed it every day was
     told to replay いくつと いくつ L1 for the rest of the year: 180 simulated days of
     きょうの れんしゅう + おすすめ cleared 15 of the 48 levels at 95% accuracy and 33 at
     75% — the door that opens 小学1年生 never opened, and the *more* accurate the
     child, the less they were moved on, because the only way past those five games
     was the「struggling」rescue below, which an accurate child never trips.

     Everything registered is walked, in curriculum order; a game added later and
     not named here still lands at the end rather than dropping out. */
  const ROADMAP = ['count', 'flash', 'numeral', 'seq', 'trace',
                   'compare', 'ordinal', 'measure',
                   'bond', 'ten', 'add', 'sub',
                   'shape', 'sort', 'pattern', 'clock',
                   'g1set', 'g1pair', 'g1teen', 'g1shiki'];
  function roadmap(){
    const seen = new Set(), out = [];
    ROADMAP.forEach(id => { if (Games.byId[id]){ out.push(id); seen.add(id); } });
    Games.list.forEach(g => { if (!seen.has(g.id)) out.push(g.id); });
    return out;
  }

  /* Done with a level = it has its clear sticker. Deliberately the same thing the
     door counts, so the level おすすめ names is always a level the door is waiting
     for — and a ★★★ level can never be recommended again. */
  /* A provisional clear counts as done here — the day it was earned, naming it again
     would send the child straight back — until a check on another day fails. Then
     the gap is real, and おすすめ goes back for it. */
  const cleared = (id, i) => Store.hasSticker(id + ':' + i) && !Store.checkFailed(id + ':' + i);

  /* A level tried three times without a pass has already opened the next one — the
     rule that no child is left at a padlock. おすすめ did not follow it: it named the
     first uncleared level, so one level a child could not yet pass was named every
     day and nothing after it ever came up. Once it has had its three goes it rests
     for a few days, and the roadmap moves on; it comes back afterwards, and it comes
     back at once if there is nothing else left to name. */
  const REST_DAYS = 3;
  // Short visits have their own observations: they need relief even though they
  // never invent a completed ordinary attempt just to open the next level.
  const resting = (id, i) => Store.shortStatus(id, i).resting
    || !cleared(id, i) && Store.plays(id, i) >= 3 && Store.daysSince(id, i) < REST_DAYS;

  /* All automatically chosen entrances honour the same breathing space.
     A child may still choose any open lesson from the map. */
  function weakFacts(limit){
    const facts = Store.weakFacts().filter(f => {
      const cut = f.at.lastIndexOf(':');
      return !resting(f.at.slice(0, cut), Number(f.at.slice(cut + 1)));
    });
    return limit ? facts.slice(0, limit) : facts;
  }

  function nextUncleared(){
    for (const skipResting of [true, false]){
      for (const id of roadmap()){
        const g = Games.byId[id];
        if (!g) continue;
        for (let i = 0; i < g.levels.length; i++){
          if (!levelOpen(g, i) || cleared(id, i)) continue;
          if (skipResting && resting(id, i)) continue;
          return { gameId: id, levelIndex: i };
        }
      }
    }
    return null;
  }

  /** The weakest open level with enough evidence to say so, or null.
      `unclearedOnly` leaves out levels that already have their clear sticker. */
  function weakestLevel(unclearedOnly){
    let weakest = null;
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      if (!levelOpen(g, i)) return;
      if (unclearedOnly && (cleared(g.id, i) || resting(g.id, i))) return;
      const n = Store.recentCount(g.id, i);
      if (n < 4) return;
      const acc = Store.recentAccuracy(g.id, i);
      if (!weakest || acc < weakest.acc) weakest = { gameId: g.id, levelIndex: i, acc };
    }));
    return weakest;
  }

  /* Below this, the child is not making progress and the day is better spent going
     back. It used to be .75 — but 75% first-try is a pass (★★), so an ordinary child
     was held on the same level instead of being shown the next one. Rescue is for
     being stuck, not for being imperfect. */
  const STUCK = 0.60;

  function current(){
    /* Rescue is for a level the child has not got past yet. A cleared level that
       has gone shaky is what きょうの れんしゅう and にがて あつめ are for — rescuing it
       here had no exit: a child at 40% on a cleared level was named it day after day
       (a median of 49 days in simulation) while nothing new came up. An uncleared
       level does have one: clearing it takes it out of here. */
    const stuck = weakestLevel(true);
    if (stuck && stuck.acc < STUCK) return stuck;

    /* はじめの ぼうけん picked a starting point; honour it until it is cleared. */
    const first = Store.data.diagnostic && Store.data.diagnostic.recommended;
    if (first && Games.byId[first.gameId]
        && levelOpen(Games.byId[first.gameId], first.levelIndex || 0)
        && !cleared(first.gameId, first.levelIndex || 0)
        && !resting(first.gameId, first.levelIndex || 0)) return first;

    const next = nextUncleared();
    if (next) return next;

    // everything open is cleared: go back to whatever is shakiest rather than
    // naming a level that has nothing left to give
    const weakest = weakestLevel();
    if (weakest) return weakest;
    let lowest = null;
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      if (!levelOpen(g, i)) return;
      const s = Store.stars(g.id, i);
      if (!lowest || s < lowest.stars) lowest = { gameId: g.id, levelIndex: i, stars: s };
    }));
    return lowest || { gameId: 'count', levelIndex: 0 };
  }

  function startRecommended(){
    const r = current(), g = r && Games.byId[r.gameId];
    if (g && g.levels[r.levelIndex]){
      if (g.intro !== false && !Store.introduced(g.id, r.levelIndex)) FirstSteps.open(g, r.levelIndex);
      else Session.startLevel(g, r.levelIndex);
    }
    else Session.startDaily(10);
  }

  return { shouldRun, recommendFrom, current, startRecommended, nextUncleared, resting, weakFacts };
})();

const Missions = (() => {
  const BANK = [
    ['count', 'おうちの なかから ものを 5こ あつめよう', 'ひとつずつ ゆびを さして かぞえてみよう'],
    ['count', '3にんぶんの スプーンを もってこよう', 'ひとりに 1ぽんずつ あるかな？'],
    ['flash', 'おはじきや おかしを 5こと 2こに ならべよう', 'ぜんぶを かぞえる まえに いくつか いってみよう'],
    ['flash', 'サイコロを 3かい ふって ぱっと かずを いおう', 'てんを ひとつずつ かぞえないで みてみよう'],
    ['numeral', '1から10の すうじを いえの なかで 3つ さがそう', 'みつけた すうじを こえに だそう'],
    ['numeral', 'カレンダーで きょうの すうじを さがそう', 'おなじ すうじが ほかにも あるかな？'],
    ['seq', 'カレンダーの 1から10を じゅんばんに ゆびで たどろう', 'こんどは 10から ぎゃくに たどってみよう'],
    ['seq', 'おふろで 10から 1まで ぎゃくに かぞえよう', '0まで いえたら おしまい'],
    ['compare', 'おなじ おもちゃを 2つの ばしょに ならべよう', 'ひろげても かずは おなじか たしかめよう'],
    ['compare', 'くだものと おかしを ならべて どちらが おおいか くらべよう', '1つずつ ペアに してみよう'],
    ['ordinal', 'ぬいぐるみを 5こ ならべて まえから 3ばんめを さがそう', 'うしろからだと なんばんめ？'],
    ['ordinal', 'かぞくで ならんで みぎから 2ばんめを いおう', 'どちらから かぞえたかも はなそう'],
    ['measure', 'えんぴつを 3ぼん はしを そろえて ならべよう', 'ながい じゅんに できるかな？'],
    ['measure', 'おうちのひとと、ちがう かたちの コップの みずを くらべよう', 'せが たかいだけで きめないでね'],
    ['bond', '7この おかしを 2つの おさらに わけよう', 'ちがう わけかたも できるかな？'],
    ['bond', '5この ものを みぎてと ひだりてに かくそう', 'なんこと なんこに わかれた？'],
    ['ten', '10この おかしを 2にんで わけよう', '5と5 いがいの わけかたも ためそう'],
    ['ten', '10になる すうじの ペアを 3つ いおう', 'ゆびや おはじきを つかっても いいよ'],
    ['add', 'おさらに 2こと 3この ものを おいて あわせよう', 'ぜんぶで いくつに なった？'],
    ['add', 'おもちゃを 1つ ふやして なんこに なったか いおう', 'ふえる まえの かずも おぼえておこう'],
    ['sub', '6この ものから 2こ かたづけよう', 'のこりを かぞえる まえに よそうしよう'],
    ['sub', 'ふたつの おさらに ものを おいて ちがいを くらべよう', '1つずつ ペアに すると いくつ あまる？'],
    ['shape', 'まるい ものを おうちで 4つ さがそう', 'おおきさや いろが ちがっても まるかな？'],
    ['shape', 'しかくと さんかくを つかって えを つくろう', 'なんの かたちを いくつ つかった？'],
    ['sort', 'おもちゃを じぶんで 2つの なかまに わけよう', 'どうして その なかまに したか おしえてね'],
    ['sort', 'おなじ ものを こんどは ちがう きまりで わけよう', 'いろ・かたち・つかいかた どれにする？'],
    ['pattern', 'スプーンと フォークで きまりの ならびを つくろう', 'つぎに くるものを おうちのひとに あててもらおう'],
    ['pattern', '3つの ものを つかって くりかえしを つくろう', 'どこから おなじ ならびが はじまる？'],
    ['clock', 'ながい はりが 6に きたら なにを するか きめよう', '「はん」の ときの はりを みよう'],
    ['clock', 'おやつの じかんを とけいで さがそう', 'みじかい はりと ながい はりを りょうほう みよう'],
    ['g1set', 'だいどころから 「まるい もの」を ぜんぶ あつめよう', 'あつめてから いくつか かぞえてね'],
    ['g1set', 'おもちゃばこから じぶんで きめた なかまを あつめよう', 'どういう なかまに したか おしえてね'],
    ['g1pair', 'おさらと コップを 1つずつ ペアに して ならべよう', 'どちらが あまった？ いくつ あまった？'],
    ['g1pair', 'かぞくの かずと おはしの かずを ペアに してみよう', 'たりない ときは あと いくつ？'],
    ['g1teen', 'おはじきを 10こ まとめて、そのあと ばらを たそう', '「10と いくつ」で いえるかな？'],
    ['g1teen', 'カレンダーで 11から 20を じゅんばんに さがそう', 'どれも 「10と いくつ」だね'],
    ['g1shiki', 'おやつを もらった ときの しきを いってみよう', '「3と 2で 5」より「3たす2は5」で いえるかな'],
    ['g1shiki', '「5ひく2」に なる おはなしを つくって みよう', 'たべた・あげた・かえった、どれでも いいよ']
  ];

  const today = () => Store.todayKey();
  const hash = s => {
    let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };

  function forGame(gameId){
    const day = today();
    let m = Store.mission(day);
    if (m) return m;
    const pool = BANK.filter(x => x[0] === gameId);
    const src = (pool.length ? pool : BANK)[hash(day + ':' + gameId) % (pool.length || BANK.length)];
    m = { day, id: src[0] + ':' + hash(day + src[1]), gameId: src[0], text: src[1], prompt: src[2] };
    Store.recordMission(m);
    return Store.mission(day);
  }

  function dateParts(day){
    const m = typeof day === 'string' && day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? [y, mo, d] : null;
  }
  function dateLabel(mission){
    const p = dateParts(typeof mission === 'string' ? mission : mission && mission.day);
    return p ? p[0] + 'ねん ' + p[1] + 'がつ ' + p[2] + 'にち' : 'ひづけのない';
  }
  function recent(){
    return Object.values(Store.data.missions || {}).filter(m => m && dateParts(m.day) && m.day <= today());
  }
  function pending(){
    return recent().filter(m => !m.done).sort((a, b) => b.day.localeCompare(a.day))[0] || null;
  }
  function recentReview(){
    return recent().filter(m => m.done && !m.reviewed).sort((a, b) =>
      (b.doneDay || 0) - (a.doneDay || 0) || b.day.localeCompare(a.day))[0] || null;
  }
  // Keep the old API for portable copies and callers; a rest day no longer loses the conversation.
  const yesterdayReview = recentReview;

  let node, titleEl, dateEl, artEl, promptEl, noteEl, doneBtn, laterBtn, holdHelpEl, speech = '';
  function goHome(){
    stopHold();
    Home.render();
    UI.show('home', { replace: true });
  }
  // Small, offline pictures identify the objects to look for without giving a numerical answer.
  function illustration(mission){
    const image = svg('svg', {viewBox:'0 0 160 88', 'aria-hidden':'true', focusable:'false'});
    const stroke = {stroke:'var(--ink)', 'stroke-width':3, 'stroke-linecap':'round', 'stroke-linejoin':'round'};
    if (/スプーン|フォーク|おさら|おはし|コップ/.test(mission.text)){
      image.append(svg('ellipse', {...stroke, cx:65, cy:48, rx:43, ry:26, fill:'var(--c-blue)'}),
        svg('ellipse', {...stroke, cx:65, cy:48, rx:29, ry:16, fill:'var(--card)'}),
        svg('path', {...stroke, d:'M126 37 V76', fill:'none'}),
        svg('ellipse', {...stroke, cx:126, cy:25, rx:10, ry:15, fill:'var(--c-yellow)'}));
    } else if (mission.gameId === 'clock'){
      image.append(svg('circle', {...stroke, cx:80, cy:44, r:35, fill:'var(--card)'}),
        svg('path', {...stroke, d:'M80 20 V44 L96 50', fill:'none'}),
        svg('circle', {cx:80, cy:44, r:3, fill:'var(--ink)'}));
    } else if (/カレンダー|すうじ/.test(mission.text)){
      image.append(svg('rect', {...stroke, x:38, y:12, width:84, height:66, rx:8, fill:'var(--card)'}),
        svg('path', {...stroke, d:'M38 32 H122 M56 6 V20 M104 6 V20', fill:'none'}));
      [54,80,106].forEach(x => [45,63].forEach(y => image.append(svg('rect', {x:x-5, y:y-4, width:10, height:8, rx:2, fill:'var(--c-blue)'}))));
    } else if (/えんぴつ/.test(mission.text)){
      image.append(svg('path', {...stroke, d:'M32 59 L111 14 L124 37 L45 82 L25 82 Z', fill:'var(--c-yellow)'}),
        svg('path', {...stroke, d:'M32 59 L45 82 M109 16 L122 38', fill:'none'}));
    } else {
      image.append(svg('rect', {...stroke, x:17, y:33, width:45, height:43, rx:5, fill:'var(--c-blue)'}),
        svg('circle', {...stroke, cx:83, cy:30, r:22, fill:'var(--c-yellow)'}),
        svg('path', {...stroke, d:'M122 30 L148 76 H96 Z', fill:'var(--c-pink)'}));
    }
    return image;
  }
  function build(){
    if (node) return node;
    titleEl = el('h2', { text: 'おうちの ミッション' });
    dateEl = el('p.mission-date');
    artEl = el('div.mission-illustration', {'aria-hidden':'true'});
    promptEl = el('div.mission-main');
    noteEl = el('div.mission-note');
    holdHelpEl = el('p#mission-hold-help.mission-hold-help', {
      text:'おうちのひとへ：ボタン、または スペース・エンターを 2びょう おしてね'
    });
    doneBtn = el('button.btn.btn-accent.mission-done', { type: 'button' });
    laterBtn = el('button.btn.mission-later', {type:'button', text:'あとで', onclick:goHome});
    node = el('div#mission', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', {
          'aria-label': 'もどる',
          onclick:goHome
        }, '←'),
        titleEl,
        el('button.btn.btn-round.mission-speak', {type:'button', 'aria-label':'ミッションを よむ',
          onclick(){ Sound.say(speech, {delay:60}); }}, '🔊')),
      el('div.mission-sheet', null, dateEl, artEl, promptEl, noteEl,
        el('div.mission-actions', null, doneBtn, laterBtn), holdHelpEl));
    window.addEventListener('blur', stopHold);
    return UI.register('mission', node);
  }

  // A two-second adult confirmation is the same with a finger, Space or Enter.
  const HOLD_MS = 2000;
  let holdTimer = null, holdDone = null, held = false;
  function stopHold(){
    clearTimeout(holdTimer); holdTimer = null; holdDone = null;
    if (doneBtn) doneBtn.classList.remove('holding');
  }
  function holdToConfirm(onDone){
    stopHold(); held = false;
    doneBtn.classList.add('holdbtn');
    doneBtn.setAttribute('aria-describedby', 'mission-hold-help');
    doneBtn.style.setProperty('--hold', HOLD_MS + 'ms');
    const start = () => {
      if (holdTimer !== null) return;
      held = false;
      doneBtn.classList.add('holding');
      holdDone = () => {
        if (UI.currentName() !== 'mission' || node.hidden){ stopHold(); return; }
        stopHold(); held = true; onDone();
      };
      holdTimer = setTimeout(holdDone, HOLD_MS);
    };
    doneBtn.onpointerdown = e => {
      if (e.button !== 0) return;
      e.preventDefault();
      start();
    };
    doneBtn.onpointerup = doneBtn.onpointerleave = doneBtn.onpointercancel = stopHold;
    doneBtn.onkeydown = e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) start();
    };
    doneBtn.onkeyup = e => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault(); stopHold();
    };
    doneBtn.onblur = stopHold;
    doneBtn.onclick = () => {
      if (held){ held = false; return; }
      Sound.say('おうちの人が、ボタンか、スペース、エンターを2秒長押ししてね。', { delay: 60 });
    };
  }
  function plainButton(onclick){
    stopHold(); held = false;
    doneBtn.classList.remove('holdbtn');
    doneBtn.removeAttribute('aria-describedby');
    doneBtn.onpointerdown = doneBtn.onpointerup = doneBtn.onpointerleave = doneBtn.onpointercancel = null;
    doneBtn.onkeydown = doneBtn.onkeyup = doneBtn.onblur = null;
    doneBtn.onclick = onclick;
  }

  function showMission(mission, review){
    build();
    titleEl.textContent = review ? 'できたことの おはなし' : 'おうちの ミッション';
    dateEl.textContent = dateLabel(mission) + ' のミッション';
    clear(artEl).append(illustration(mission));
    promptEl.textContent = mission.text;
    noteEl.textContent = review ? 'どんな ふうに できたか、おうちのひとに おはなししよう' : mission.prompt;
    laterBtn.textContent = review ? 'また あとで' : 'あとで';
    holdHelpEl.hidden = review;
    speech = dateEl.textContent + '。' + mission.text + '。' + noteEl.textContent;
  }
  function open(mission){
    if (!mission) return;
    if (mission.done){ openReview(mission); return; }
    showMission(mission, false);
    doneBtn.replaceChildren(el('span', {text:'おうちのひとが ながおし'}),
      el('span.mission-hold-duration', {text:'（2びょう）'}));
    holdToConfirm(() => {
      Store.completeMission(mission.day);
      Sound.sfx.finish();
      goHome();
    });
    UI.show('mission');
    Sound.say(speech, { delay: 250 });
  }

  function openReview(mission){
    if (!mission || !mission.done) return;
    showMission(mission, true);
    doneBtn.textContent = 'おはなし できた！';
    plainButton(() => {
      Store.reviewMission(mission.day);
      Sound.sfx.correct();
      goHome();
    });
    UI.show('mission');
    Sound.say(speech, { delay: 250 });
  }

  function resultCard(gameId){
    const m = pending() || Store.mission(today());
    return el('button.result-mission', { type: 'button', onclick(){
      // Merely finishing a question never adds a task to the Home screen.
      open(pending() || Store.mission(today()) || forGame(gameId || 'count'));
    } },
      el('b', { text: m && m.done ? 'できたことの おはなし' : 'おうちで やってみる' }),
      el('span', { text: m ? m.text : 'みのまわりの もので あそぼう' }),
      el('small', { text: m ? dateLabel(m) + '・やりたい ときに' : 'おうちのひとと、やりたい ときに' }));
  }

  return { forGame, pending, recentReview, dateLabel, yesterdayReview, open, openReview, resultCard,
           /** test seam: end a press that has started, without waiting two seconds */
           _test: { finishHold(){ if (holdDone) holdDone(); } } };
})();
