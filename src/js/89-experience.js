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

  function current(){
    let weakest = null;
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      if (!levelOpen(g, i)) return;
      const n = Store.recentCount(g.id, i);
      if (n < 4) return;
      const acc = Store.recentAccuracy(g.id, i);
      if (!weakest || acc < weakest.acc) weakest = { gameId: g.id, levelIndex: i, acc };
    }));
    if (weakest && weakest.acc < .75) return weakest;

    const first = Store.data.diagnostic && Store.data.diagnostic.recommended;
    if (first && Games.byId[first.gameId]
        && levelOpen(Games.byId[first.gameId], first.levelIndex || 0)
        && Store.stars(first.gameId, first.levelIndex || 0) < 2) return first;

    /* Once the 入学前 half is finished there is nothing left under 2 stars to
       recommend there, so the queue continues into the classroom. */
    const order = Progress.g1Open()
      ? ['count', 'flash', 'numeral', 'seq', 'bond', 'g1set', 'g1pair', 'g1teen', 'g1shiki']
      : ['count', 'flash', 'numeral', 'seq', 'bond'];
    for (const id of order){
      const g = Games.byId[id];
      if (!g) continue;
      for (let i = 0; i < g.levels.length; i++){
        if (levelOpen(g, i) && Store.stars(id, i) < 2) return { gameId: id, levelIndex: i };
      }
    }
    return { gameId: 'bond', levelIndex: 0 };
  }

  function startRecommended(){
    const r = current(), g = r && Games.byId[r.gameId];
    if (g && g.levels[r.levelIndex]) Session.startLevel(g, r.levelIndex);
    else Session.startDaily(10);
  }

  return { shouldRun, recommendFrom, current, startRecommended };
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

  function open(mission){
    build();
    titleEl.textContent = 'きょうの さんすう ミッション';
    promptEl.textContent = mission.text;
    noteEl.textContent = mission.prompt;
    doneBtn.textContent = 'おうちのひとに かくにんしてもらう';
    doneBtn.onclick = () => {
      Parent.open(() => {
        Store.completeMission(mission.day);
        Sound.sfx.finish();
        Home.render();
        UI.show('home', { replace: true });
      });
    };
    UI.show('mission');
    Sound.say(mission.text + '。' + mission.prompt, { delay: 250 });
  }

  function openReview(mission){
    build();
    titleEl.textContent = 'きのうの ミッション';
    promptEl.textContent = mission.text;
    noteEl.textContent = 'どんな ふうに できたか、おうちのひとに おはなししよう';
    doneBtn.textContent = 'おはなし できた！';
    doneBtn.onclick = () => {
      Store.reviewMission(mission.day);
      Sound.sfx.correct();
      Home.render();
      UI.show('home', { replace: true });
    };
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

  return { forGame, yesterdayReview, open, openReview, resultCard };
})();
