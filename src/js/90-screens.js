/* ===========================================================
   90 — shell screens: title, home, levels, result, sticker book, parents
   =========================================================== */
'use strict';

/* ---------------------------------------------------------- TITLE */
const Title = (() => {
  let node, starting = false;
  function build(){
    if (node) return node;
    const logo = el('h1.big', null,
      el('span', { text: 'か', style: { color: 'var(--c-red)' } }),
      el('span', { text: 'ず', style: { color: 'var(--c-orange)' } }),
      el('span', { text: 'の', style: { color: 'var(--c-green)' } }),
      el('span', { text: 'ぼ', style: { color: 'var(--c-blue)' } }),
      el('span', { text: 'う', style: { color: 'var(--c-purple)' } }),
      el('span', { text: 'けん', style: { color: 'var(--c-pink)' } }));
    const start = el('button.btn.btn-accent', {
      text: 'はじめる',
      onclick(){
        if (starting) return;
        starting = true;
        Sound.unlock();
        Sound.sfx.unlockSfx();
        Sound.say('数の冒険へ、ようこそ！', { delay: 260 });
        Sound.probeVoice(1200).then(hasVoice => {
          starting = false;
          if (Sound.voiceOn && !hasVoice){
            Home.render();
            UI.show('home', { replace: true });
          } else if (Diagnostic.shouldRun()) Session.startDiagnostic();
          else {
            Home.render();
            UI.show('home', { replace: true });
          }
        });
      }
    });
    node = el('div#title', null,
      mascotSVG('happy', 'talk'),
      logo,
      el('div.tag', { text: 'しょうがっこうへ いく まえに　さんすうの ちからを あそんで つける' }),
      start,
      el('div.foot', { text: 'おと が でます。iPad は よこむき が おすすめ です' }));
    return UI.register('title', node);
  }
  return { build };
})();

/* ---------------------------------------------------------- HOME */
const Home = (() => {
  let node, worldsEl, starEl, dailyEl, focusEl, recommendEl, reviewEl, voiceWarnEl, shelfEl;

  function build(){
    if (node) return node;
    starEl   = el('span', { text: '0' });
    worldsEl = el('div.worlds');
    dailyEl  = el('button.daily', { type: 'button', onclick(){ Sound.sfx.tap(); Session.startDaily(10); } });
    recommendEl = el('button.daily.recommended', {
      type: 'button', onclick(){ Sound.sfx.tap(); Diagnostic.startRecommended(); }
    });
    reviewEl = el('button.daily.reviewmission', { type: 'button', hidden: true });
    voiceWarnEl = el('div.voice-warning', {
      hidden: true, role: 'status', 'aria-live': 'polite'
    });
    node = el('div#home', null,
      el('div.home-head', null,
        el('h1.logo', null,
          el('span.k', { text: 'かず' }), el('span.n', { text: 'の' }), el('span.b', { text: 'ぼうけん' })),
        el('div.spacer'),
        el('div.starcount', null, starSVG(true), starEl),
        el('button.btn.btn-round', { 'aria-label': 'シールブック', title: 'シールブック',
          onclick(){ Sound.sfx.tap(); Book.render(); UI.show('book'); } }, '📖'),
        el('button.btn.btn-round', { 'aria-label': 'おうちのかたへ', title: 'おうちのかたへ',
          onclick(){ Sound.sfx.tap(); Parent.open(); } }, '👤')));
    /* きょうの れんしゅう reviews everything the child has unlocked, which means a
       single weak fact comes round about once a fortnight. This is the aimed set:
       three or four facts, ten questions, each fact several times. */
    focusEl = el('button.daily.focusset', { type: 'button', hidden: true });
    shelfEl = el('button.shelf', { type: 'button',
      onclick(){ Sound.sfx.tap(); Book.render(); UI.show('book'); } });
    node.append(voiceWarnEl, recommendEl, dailyEl, reviewEl, focusEl, worldsEl, shelfEl);
    return UI.register('home', node);
  }

  function gameCard(g){
    /* These used to count "levels with any star at all", so three scraped passes
       looked exactly like three perfect ones — and did not match the 3/9 the
       parent page showed for the same child. Same arithmetic on both screens now. */
    const earned = Store.gameStars(g.id, g.levels.length);
    const max = g.levels.length * 3;
    const perfect = earned === max;
    const done = earned === 0 ? 0 : Math.max(1, Math.round((earned / max) * 3));
    const st = el('div.st');
    for (let i = 0; i < 3; i++) st.append(starSVG(i < done));
    return el('button.gamecard', {
      type: 'button', title: g.name + '　★ ' + earned + '/' + max,
      onclick(){ Sound.sfx.tap(); Levels.render(g); UI.show('levels'); }
    },
      el('div.ico', { text: perfect ? '👑' : g.ico }),
      el('div.nm', { text: g.name }),
      st);
  }

  function render(){
    build();
    starEl.textContent = String(Store.totalStars());
    const n = Store.todayCount(), streak = Store.streak();
    const firstRun = Diagnostic.shouldRun();
    const rec = Diagnostic.current();
    const recGame = rec && Games.byId[rec.gameId];
    clear(recommendEl);
    recommendEl.hidden = !recGame;
    if (recGame){
      const lv = recGame.levels[rec.levelIndex] || recGame.levels[0];
      recommendEl.append(
        mascotSVG('happy', 'talk'),
        el('div.grow', null,
          el('div.t', { text: firstRun ? 'はじめの ぼうけん' : 'いまの おすすめ' }),
          el('div.s', { text: firstRun
            ? '10もんで ぴったりの はじまりを みつけよう'
            : recGame.name + '　《' + lv.t + '》' })),
        el('div', { class: 'go', text: '▶' }));
      recommendEl.onclick = () => {
        Sound.sfx.tap();
        if (firstRun) Session.startDiagnostic(); else Diagnostic.startRecommended();
      };
    }
    voiceWarnEl.hidden = !Sound.voiceOn || (!!window.speechSynthesis && Sound.hasVoice);
    voiceWarnEl.textContent = voiceWarnEl.hidden ? ''
      : 'よみあげる こえが みつかりません。おうちの ひとと せっていを みてね。';
    if (!voiceWarnEl.hidden){
      Sound.probeVoice(3000).then(ok => {
        if (ok){ voiceWarnEl.hidden = true; voiceWarnEl.textContent = ''; }
      });
    }
    const review = Missions.yesterdayReview();
    reviewEl.hidden = !review;
    if (review){
      clear(reviewEl);
      reviewEl.append(
        el('div.grow', null,
          el('div.t', { text: 'きのうの ミッション' }),
          el('div.s', { text: 'どんな ふうに できたか おはなししよう' })),
        el('div', { class: 'go', text: '▶' }));
      reviewEl.onclick = () => Missions.openReview(review);
    }
    clear(dailyEl);
    dailyEl.classList.toggle('done', n >= 10);
    dailyEl.append(
      mascotSVG(n >= 10 ? 'cheer' : 'happy', 'talk'),
      el('div.grow', null,
        el('div.t', { text: n >= 10 ? 'きょうの れんしゅう おわり！' : 'きょうの れんしゅう' }),
        el('div.s', { text: n >= 10
          ? `きょうは ${n}もん がんばったね　･　${streak}にち れんぞく`
          : 'ぜんぶの あそびから 10もん でるよ' })),
      el('div', { style: { fontSize: 'calc(var(--u)*3)' }, text: n >= 10 ? '🎉' : '▶' }));

    const weak = Store.weakFacts(4);
    focusEl.hidden = weak.length < 2;      // one wobbly fact is not a practice set
    if (!focusEl.hidden){
      clear(focusEl);
      focusEl.append(
        mascotSVG('soft', 'talk'),
        el('div.grow', null,
          el('div.t', { text: 'にがて あつめ' }),
          el('div.s', { text: weak.slice(0, 2).map(w => w.label).join('　･　')
                              + (weak.length > 2 ? '　ほか' : '') })),
        el('div', { style: { fontSize: 'calc(var(--u)*3)' }, text: '▶' }));
      focusEl.onclick = () => { Sound.sfx.tap(); Session.startFocus(weak.map(w => w.key), { n: 10 }); };
    }

    const got = Store.data.stickers;
    clear(shelfEl);
    const strip = el('div.strip');
    if (got.length){
      got.slice(-16).reverse().forEach(k => strip.append(el('span', { text: stickerFor(k) })));
    } else {
      strip.append(el('span.empty', { text: 'レベルを クリアすると シールが たまるよ' }));
    }
    shelfEl.append(
      el('span.bk', { text: '📖' }),
      el('div.lbl', null, 'シール ' + got.length + 'まい', el('small', { text: 'タップで シールブック' })),
      strip);

    clear(worldsEl);
    WORLDS.forEach(w => {
      const games = Games.list.filter(g => g.world === w.id);
      if (!games.length) return;
      const grid = el('div.gamegrid');
      games.forEach(g => grid.append(gameCard(g)));
      worldsEl.append(el('div.world', { style: { '--wc': w.color } },
        el('h3', null, el('span.chip', { text: w.name }), el('span.sub', { text: w.sub })), grid));
    });
  }
  return { build, render };
})();

/* ---------------------------------------------------------- LEVELS */
const Levels = (() => {
  let node, titleEl, listEl, game = null;
  function build(){
    if (node) return node;
    titleEl = el('h2');
    listEl  = el('div.levels');
    node = el('div#levels', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        titleEl),
      listEl);
    return UI.register('levels', node);
  }
  function render(g){
    build();
    game = g;
    titleEl.textContent = g.ico + '　' + g.name;
    clear(listEl);
    g.levels.forEach((lv, i) => {
      const stars = Store.stars(g.id, i);
      const unlocked = Store.levelUnlocked(g.id, i);
      const card = el('button.levelcard' + (unlocked ? '' : '.locked'), {
        type: 'button', style: { '--lc': g.color },
        onclick(){
          Sound.sfx.tap();
          if (!unlocked){ Sound.say('前のレベルをクリアすると、遊べるよ。', { delay: 120 }); return; }
          Session.startLevel(g, i);
        }
      },
        el('div.num', { text: unlocked ? String(i + 1) : '🔒' }),
        el('div.body', null, el('div.t', { text: lv.t }), el('div.d', { text: lv.d })),
        // ★★★ is "all right first time"; this is "and without counting"
        Store.isSwift(g.id, i) ? el('span.swiftmark', { title: 'すぐ こたえられた', text: '⚡️' }) : null,
        UI.stars(stars));
      listEl.append(card);
    });

  }
  return { build, render, get game(){ return game; } };
})();

/* ---------------------------------------------------------- RESULT */
const Result = (() => {
  let node, inner;
  function build(){
    if (node) return node;
    inner = el('div.inner');
    node = el('div#result', null, inner);
    return UI.register('result', node);
  }
  function show(r){
    build();
    clear(inner);
    const msg = r.mode === 'diagnostic' ? 'さいしょの ぼうけん クリア！'
              : r.stars === 3 ? 'パーフェクト！'
              : r.stars === 2 ? 'よく できました！'
              : r.stars === 1 ? 'クリア！'
              : 'おしい！ もう いちど やってみよう';
    // the children read `msg`, so it stays hiragana; the voice gets kanji, which
    // is what lets a Japanese engine phrase it instead of droning it out
    const spoken = (r.mode === 'diagnostic' ? '最初の冒険、クリア！おすすめを見つけたよ。'
                 : r.swift ? 'パーフェクト！すぐ答えられたね！'
                 : r.stars === 3 ? 'パーフェクト！'
                 : r.stars === 2 ? 'よくできました！'
                 : r.stars === 1 ? 'クリア！'
                 : '惜しい！もう一度やってみよう。');
    inner.append(
      mascotSVG(r.stars === 0 ? 'soft' : 'cheer', r.stars === 0 ? 'talk' : 'cheer'),
      r.mode === 'diagnostic'
        ? el('div.diagnostic-badge', { text: '10もん たんけん できたね' })
        : UI.stars(r.stars, true),
      el('div.result-msg', { text: msg }),
      el('div.result-sub', { text: r.mode === 'diagnostic'
        ? 'ぴったりの はじまりを みつけたよ'
        : `${r.total}もん中 ${r.right}もん を いっかいめで せいかい` }));
    /* The thing ★★★ could never say. These levels are for an answer that arrives,
       and a child who counted their way to every right answer used to get exactly
       the same three stars as one who remembered. */
    if (r.swift){
      inner.append(el('div.swift', null,
        el('span.mk', { text: '⚡️' }), 'かぞえないで こたえられたね！'));
    }
    /* Name what went wrong. "62%" tells a child nothing; "3と7" is something they
       can carry to tomorrow — and it is exactly what the app will bring back.

       The names are also the way back to them. This screen used to list the facts
       and then offer「つぎの レベルへ」as the only bright button: it named the gap
       and walked the child straight past it. */
    const shakyKeys = (r.shaky || []).map(x => x.key).filter(k => Store.factOrigin(k));
    const aimed = r.mode === 'focus' ? (r.focusKeys || []) : shakyKeys;
    const runFocus = () => { Sound.sfx.tap(); Session.startFocus(aimed, { n: 10 }); };
    if (r.shaky && r.shaky.length){
      const list = el('div.shakylist');
      r.shaky.forEach(x => {
        const usable = aimed.indexOf(x.key) >= 0 || (r.mode !== 'focus' && shakyKeys.indexOf(x.key) >= 0);
        list.append(usable
          ? el('button.shakyitem', { type: 'button', text: x.label, onclick: runFocus })
          : el('span.shakyitem', { text: x.label }));
      });
      inner.append(el('div.shaky', null,
        el('div.l', { text: aimed.length ? 'つぎは これを もういちど（タップで れんしゅう）'
                                         : 'つぎは これを もういちど' }), list));
    }
    if (r.sticker){
      inner.append(el('div.newsticker' + (r.sticker.gold ? '.gold' : ''), null,
        el('div.e', { text: r.sticker.emoji }),
        el('div.l', { text: r.sticker.gold ? 'きんの シール を ゲット！' : 'シール を ゲット！' })));
    }
    if (r.mode === 'diagnostic' && r.recommended){
      const g = Games.byId[r.recommended.gameId];
      if (g){
        const lv = g.levels[r.recommended.levelIndex] || g.levels[0];
        inner.append(el('div.diagnostic-next', null,
          el('div.l', { text: 'つぎの おすすめ' }),
          el('b', { text: g.name + '　《' + lv.t + '》' })));
      }
    } else if (r.mode === 'daily' || (r.mode === 'level' && r.stars >= 1)) {
      inner.append(Missions.resultCard(r.lastGameId));
    }
    const actions = el('div.result-actions');
    // practising the facts that just went wrong outranks anything else on offer
    const lead = aimed.length > 0 && r.mode !== 'diagnostic';
    if (r.mode === 'focus'){
      actions.append(el('button.btn.btn-accent.primary', { text: 'もういちど', onclick: runFocus }));
    } else if (lead){
      actions.append(el('button.btn.btn-accent.primary', { text: 'にがてを れんしゅう', onclick: runFocus }));
    }
    if (r.mode === 'diagnostic'){
      actions.append(el('button.btn.btn-accent.primary', {
        text: 'おすすめで あそぶ',
        onclick(){ Sound.sfx.tap(); Diagnostic.startRecommended(); }
      }));
    } else if (r.mode === 'level'){
      // when nothing was earned, another go is the obvious next step, not a footnote
      actions.append(el('button.btn' + (r.stars === 0 && !lead ? '.btn-accent.primary' : ''), { text: 'もういちど',
        onclick(){ Sound.sfx.tap(); Session.startLevel(r.game, r.levelIndex); } }));
      const nxt = r.levelIndex + 1;
      if (nxt < r.game.levels.length && Store.levelUnlocked(r.game.id, nxt)){
        actions.append(el('button.btn' + (lead ? '' : '.btn-accent.primary'), { text: 'つぎの レベルへ',
          onclick(){ Sound.sfx.tap(); Session.startLevel(r.game, nxt); } }));
      }
    } else if (r.mode === 'daily'){
      actions.append(el('button.btn', { text: 'もういちど', onclick(){ Sound.sfx.tap(); Session.startDaily(10); } }));
    }
    actions.append(el('button.btn' + (r.mode === 'level' || r.mode === 'diagnostic' || lead || r.mode === 'focus' ? '' : '.btn-accent'),
      { text: 'あそびを えらぶ',
        onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }));
    inner.append(actions);
    UI.show('result', { replace: true });
    Sound.say(spoken, { delay: 700 });
    for (let i = 0; i < r.stars; i++) setTimeout(() => Sound.sfx.star(i), 400 + i * 260);
  }
  return { show, build };
})();

/* ---------------------------------------------------------- STICKER BOOK */
const Book = (() => {
  let node, grid, count;
  function build(){
    if (node) return node;
    grid = el('div.book');
    count = el('div.aim');
    node = el('div#book', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: '📖　シールブック' })),
      count, grid);
    return UI.register('book', node);
  }
  function render(){
    build();
    clear(grid);
    const slots = [];
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      slots.push({ key: g.id + ':' + i, gold: false });
      slots.push({ key: g.id + ':' + i + ':g', gold: true });
    }));
    let got = 0;
    slots.forEach(s => {
      const has = Store.hasSticker(s.key);
      if (has) got++;
      grid.append(el('div.sticker' + (has ? (s.gold ? '.got.gold' : '.got') : ''),
        { text: has ? stickerFor(s.key) : '･' }));
    });
    Store.data.stickers.filter(k => k.indexOf('daily:') === 0 || k.indexOf('focus:') === 0).forEach(k => {
      got++;
      grid.append(el('div.sticker.got.gold', { text: stickerFor(k) }));
    });
    count.innerHTML = `<b>${got}まい</b> あつめたよ　･　レベルを クリアすると シールが 1まい。ぜんぶ せいかい で きんいろの シール`;
  }
  return { build, render };
})();
