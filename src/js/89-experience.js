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
  const resting = (id, i) => !cleared(id, i) && Store.plays(id, i) >= 3 && Store.daysSince(id, i) < REST_DAYS;

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
        && !cleared(first.gameId, first.levelIndex || 0)) return first;

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
    if (g && g.levels[r.levelIndex]) Session.startLevel(g, r.levelIndex);
    else Session.startDaily(10);
  }

  return { shouldRun, recommendFrom, current, startRecommended, nextUncleared };
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

  function yesterdayReview(){
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
    const m = Store.mission(key);
    return m && m.done && !m.reviewed ? m : null;
  }

  let node, titleEl, promptEl, noteEl, doneBtn;
  function build(){
    if (node) return node;
    titleEl = el('h2', { text: 'きょうの さんすう ミッション' });
    promptEl = el('div.mission-main');
    noteEl = el('div.mission-note');
    doneBtn = el('button.btn.btn-accent', { type: 'button' });
    node = el('div#mission', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', {
          'aria-label': 'もどる',
          onclick(){ Home.render(); UI.show('home', { replace: true }); }
        }, '←'),
        titleEl),
      el('div.mission-sheet', null, mascotSVG('happy', 'talk'), promptEl, noteEl,
        el('div.mission-actions', null, doneBtn,
          el('button.btn', {
            text: 'あとで',
            onclick(){ Home.render(); UI.show('home', { replace: true }); }
          }))));
    return UI.register('mission', node);
  }

  /* The adult's「できた」. It went through the full adult gate — two 2-digit ×
     1-digit sums in a row, and five seconds' wait after a slip — which is the lock
     on「記録をすべて消す」, for the lightest thing an adult does all day, often with
     a pan in the other hand. So it was mostly never pressed, and the next day's
     「どうやったか」never came. A two-second press says an adult was there; a tap
     only says how. */
  const HOLD_MS = 2000;
  let holdTimer = null, holdDone = null, held = false;
  function stopHold(){
    clearTimeout(holdTimer); holdTimer = null; holdDone = null;
    if (doneBtn) doneBtn.classList.remove('holding');
  }
  function holdToConfirm(onDone){
    doneBtn.classList.add('holdbtn');
    doneBtn.style.setProperty('--hold', HOLD_MS + 'ms');
    doneBtn.onpointerdown = e => {
      e.preventDefault();
      stopHold();
      doneBtn.classList.add('holding');
      holdDone = () => { stopHold(); held = true; onDone(); };
      holdTimer = setTimeout(holdDone, HOLD_MS);
    };
    doneBtn.onpointerup = doneBtn.onpointerleave = doneBtn.onpointercancel = stopHold;
    doneBtn.onclick = () => {
      if (held){ held = false; return; }             // the click that ends a finished press
      Sound.say('おうちの人が、2秒長押ししてね。', { delay: 60 });
    };
  }
  function plainButton(onclick){
    stopHold();
    doneBtn.classList.remove('holdbtn');
    doneBtn.onpointerdown = doneBtn.onpointerup = doneBtn.onpointerleave = doneBtn.onpointercancel = null;
    doneBtn.onclick = onclick;
  }

  function open(mission){
    build();
    titleEl.textContent = 'きょうの さんすう ミッション';
    promptEl.textContent = mission.text;
    noteEl.textContent = mission.prompt;
    doneBtn.textContent = 'おうちのひとが ながおし（2びょう）';
    holdToConfirm(() => {
      Store.completeMission(mission.day);
      Sound.sfx.finish();
      Home.render();
      UI.show('home', { replace: true });
    });
    UI.show('mission');
    Sound.say(mission.text + '。' + mission.prompt, { delay: 250 });
  }

  function openReview(mission){
    build();
    titleEl.textContent = 'きのうの ミッション';
    promptEl.textContent = mission.text;
    noteEl.textContent = 'どんな ふうに できたか、おうちのひとに おはなししよう';
    doneBtn.textContent = 'おはなし できた！';
    plainButton(() => {
      Store.reviewMission(mission.day);
      Sound.sfx.correct();
      Home.render();
      UI.show('home', { replace: true });
    });
    UI.show('mission');
    Sound.say('昨日のミッション、どんなふうにできたかお話ししよう。', { delay: 250 });
  }

  function resultCard(gameId){
    const m = forGame(gameId || 'count');
    const b = el('button.result-mission', { type: 'button', onclick(){ open(m); } },
      el('b', { text: 'きょうの さんすう ミッション' }),
      el('span', { text: m.text }),
      el('small', { text: m.done ? 'できました！' : 'おうちのひとと やってみよう' }));
    return b;
  }

  return { forGame, yesterdayReview, open, openReview, resultCard,
           /** test seam: end a press that has started, without waiting two seconds */
           _test: { finishHold(){ if (holdDone) holdDone(); } } };
})();
