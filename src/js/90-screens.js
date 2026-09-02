/* ===========================================================
   90 — shell screens: title, home, levels, result, sticker book, parents
   =========================================================== */
'use strict';

/* ---------------------------------------------------------- TITLE */
const Title = (() => {
  let node;
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
        Sound.unlock();
        Sound.sfx.unlockSfx();
        Sound.say('かずの ぼうけんへ ようこそ', { delay: 260 });
        Home.render();
        UI.show('home', { replace: true });
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
  let node, worldsEl, starEl, dailyEl, shelfEl;

  function build(){
    if (node) return node;
    starEl   = el('span', { text: '0' });
    worldsEl = el('div.worlds');
    dailyEl  = el('button.daily', { type: 'button', onclick(){ Sound.sfx.tap(); Session.startDaily(10); } });
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
    shelfEl = el('button.shelf', { type: 'button',
      onclick(){ Sound.sfx.tap(); Book.render(); UI.show('book'); } });
    node.append(dailyEl, worldsEl, shelfEl);
    return UI.register('home', node);
  }

  function gameCard(g){
    const done = g.levels.filter((_, i) => Store.stars(g.id, i) > 0).length;
    const perfect = g.levels.every((_, i) => Store.stars(g.id, i) === 3);
    const st = el('div.st');
    for (let i = 0; i < 3; i++) st.append(starSVG(i < done));
    return el('button.gamecard', {
      type: 'button',
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
          if (!unlocked){ Sound.say('まえの レベルを クリアすると あそべるよ', { delay: 120 }); return; }
          Session.startLevel(g, i);
        }
      },
        el('div.num', { text: unlocked ? String(i + 1) : '🔒' }),
        el('div.body', null, el('div.t', { text: lv.t }), el('div.d', { text: lv.d })),
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
    const msg = r.stars === 3 ? 'パーフェクト！' : r.stars === 2 ? 'よく できました！' : 'さいごまで がんばったね！';
    inner.append(
      mascotSVG('cheer', 'cheer'),
      UI.stars(r.stars, true),
      el('div.result-msg', { text: msg }),
      el('div.result-sub', { text: `${r.total}もん中 ${r.right}もん を いっかいめで せいかい` }));
    if (r.sticker){
      inner.append(el('div.newsticker' + (r.sticker.gold ? '.gold' : ''), null,
        el('div.e', { text: r.sticker.emoji }),
        el('div.l', { text: r.sticker.gold ? 'きんの シール を ゲット！' : 'シール を ゲット！' })));
    }
    const actions = el('div.result-actions');
    if (r.mode === 'level'){
      actions.append(el('button.btn', { text: 'もういちど',
        onclick(){ Sound.sfx.tap(); Session.startLevel(r.game, r.levelIndex); } }));
      const nxt = r.levelIndex + 1;
      if (nxt < r.game.levels.length && Store.levelUnlocked(r.game.id, nxt)){
        actions.append(el('button.btn.btn-accent.primary', { text: 'つぎの レベルへ',
          onclick(){ Sound.sfx.tap(); Session.startLevel(r.game, nxt); } }));
      }
    } else {
      actions.append(el('button.btn', { text: 'もういちど', onclick(){ Sound.sfx.tap(); Session.startDaily(10); } }));
    }
    actions.append(el('button.btn' + (r.mode === 'level' ? '' : '.btn-accent'), { text: 'あそびを えらぶ',
      onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }));
    inner.append(actions);
    UI.show('result', { replace: true });
    Sound.say(msg, { delay: 700 });
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
    Store.data.stickers.filter(k => k.indexOf('daily:') === 0).forEach(k => {
      got++;
      grid.append(el('div.sticker.got.gold', { text: stickerFor(k) }));
    });
    count.innerHTML = `<b>${got}まい</b> あつめたよ　･　レベルを クリアすると シールが 1まい。ぜんぶ せいかい で きんいろの シール`;
  }
  return { build, render };
})();
