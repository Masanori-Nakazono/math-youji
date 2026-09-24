/* ===========================================================
   88 — a chosen sticker, a small adventure, and a world of one's own

   The three pieces deliberately use different kinds of recognition:
   - a level sticker still means a level was cleared;
   - an adventure sticker means the child stayed with a short, supported attempt;
   - arranging a sticker is play, with no score at all.
   Keeping those meanings apart avoids turning every pleasant thing into a test.
   =========================================================== */
'use strict';

const StickerMissions = (() => {
  let node, prizeEl, detailEl, goBtn, backBtn, active = null;

  function available(){
    const rec = Diagnostic.current() || {};
    const all = [];
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      const key = g.id + ':' + i;
      if (!levelOpen(g, i) || Store.hasSticker(key)) return;
      all.push({ game: g, levelIndex: i, level: lv, key,
        recommended: rec.gameId === g.id && rec.levelIndex === i,
        known: Store.introduced(g.id, i), plays: Store.plays(g.id, i) });
    }));
    /* One clear next step, then two genuinely available alternatives.  A child
       never sees a prize that is behind a padlock, and we spread the alternatives
       across games where possible so the three pictures represent choices. */
    all.sort((a, b) => Number(b.recommended) - Number(a.recommended)
      || Number(b.known) - Number(a.known) || b.plays - a.plays
      || a.levelIndex - b.levelIndex || a.game.name.localeCompare(b.game.name, 'ja'));
    const out = [], usedGames = new Set();
    for (const pass of [true, false]){
      for (const x of all){
        if (out.length >= 3) break;
        if (out.includes(x) || (pass && usedGames.has(x.game.id))) continue;
        out.push(x); usedGames.add(x.game.id);
      }
    }
    return out;
  }

  function homeCard(){
    const choices = available();
    if (!choices.length) return null;
    const row = el('div.sticker-mission-picks');
    choices.forEach(choice => row.append(el('button.sticker-mission-pick', {
      type: 'button', title: choice.game.name + '　' + choice.level.t,
      onclick(){ Sound.sfx.tap(); open(choice); }
    },
      el('span.prize', { text: stickerFor(choice.key), 'aria-hidden': 'true' }),
      el('span.name', { text: choice.game.name }),
      el('span.go', { text: '▶', 'aria-hidden': 'true' }))));
    return el('section.home-quest.sticker-mission', { 'aria-label': 'ほしいシールをえらぶ' },
      el('div.quest-title', null, el('span', { text: '✨', 'aria-hidden': 'true' }),
        el('span', { text: 'ほしい シールを えらぼう' })), row);
  }

  function build(){
    if (node) return node;
    prizeEl = el('div.sticker-mission-prize');
    detailEl = el('div.sticker-mission-detail');
    goBtn = el('button.btn.btn-accent', { type: 'button', text: 'あそびに いく ▶' });
    backBtn = el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
      onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←');
    node = el('div#sticker-mission', null,
      el('div.topbar', null, backBtn, el('h2', { text: 'シールミッション' })),
      el('div.reward-sheet', null, mascotSVG('happy', 'talk'), prizeEl, detailEl, goBtn));
    return UI.register('sticker-mission', node);
  }

  function open(choice){
    if (!choice || !choice.game || !choice.level) return;
    build(); active = choice;
    prizeEl.textContent = stickerFor(choice.key);
    clear(detailEl);
    detailEl.append(
      el('b', { text: choice.game.name + '　《' + choice.level.t + '》' }),
      el('span', { text: 'クリアすると この シールが もらえるよ' }),
      el('small', { text: 'いろが つくのは、べつの ひに たしかめてから' }));
    goBtn.onclick = () => {
      Sound.sfx.tap();
      Session.startLevel(choice.game, choice.levelIndex, { stickerMission: choice });
    };
    UI.show('sticker-mission');
    Sound.say('このシールを取りに行こう。' + choice.game.name + 'の、' + choice.level.t + 'をクリアすると、もらえるよ。', { delay: 180 });
  }

  return { available, homeCard, build, open, get active(){ return active; } };
})();

const Adventures = (() => {
  let node, targetEl, goBtn, active = null;

  function fromOrigin(origin, want){
    if (!origin) return null;
    const at = origin.lastIndexOf(':');
    const game = Games.byId[origin.slice(0, at)], levelIndex = Number(origin.slice(at + 1));
    if (!game || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return null;
    return { game, levelIndex, level: game.levels[levelIndex], want: want || null };
  }

  function target(){
    const weak = Store.weakFacts(1)[0];
    const aimed = weak && fromOrigin(weak.at, weak.key);
    if (aimed) return aimed;
    const rec = Diagnostic.current();
    const game = rec && Games.byId[rec.gameId];
    if (game && game.levels[rec.levelIndex] && levelOpen(game, rec.levelIndex)){
      return { game, levelIndex: rec.levelIndex, level: game.levels[rec.levelIndex], want: null };
    }
    for (const g of Games.list){
      for (let i = 0; i < g.levels.length; i++) if (levelOpen(g, i)) return { game: g, levelIndex: i, level: g.levels[i], want: null };
    }
    return null;
  }

  function homeCard(){
    const t = target();
    if (!t) return null;
    return el('button.home-quest.adventure-card', { type: 'button',
      onclick(){ Sound.sfx.tap(); open(t); } },
      el('span.icon', { text: '🧭', 'aria-hidden': 'true' }),
      el('span.copy', null, el('b', { text: 'ちいさな ぼうけん' }),
        el('small', { text: t.game.name + '　4もんだけ' })),
      el('span.arrow', { text: '▶', 'aria-hidden': 'true' }));
  }

  function build(){
    if (node) return node;
    targetEl = el('div.adventure-target');
    goBtn = el('button.btn.btn-accent', { type: 'button', text: 'ぼうけんを はじめる ▶' });
    node = el('div#adventure', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'ちいさな ぼうけん' })),
      el('div.reward-sheet', null, mascotSVG('happy', 'talk'),
        el('div.adventure-badge', { text: '🧭' }), targetEl,
        el('div.adventure-rules', null,
          el('span', { text: '4もんだけ' }), el('span', { text: '👀 ヒントを つかって いいよ' }),
          el('span', { text: 'おわると ぼうけんシール' })), goBtn));
    return UI.register('adventure', node);
  }

  function open(t){
    if (!t) return;
    build(); active = t;
    targetEl.textContent = t.game.ico + '　' + t.game.name + '　《' + t.level.t + '》';
    goBtn.onclick = () => { Sound.sfx.tap(); Session.startAdventure(t); };
    UI.show('adventure');
    Sound.say('ちいさな冒険だよ。' + t.game.name + 'を、4問だけやってみよう。ヒントを使っても大丈夫。', { delay: 180 });
  }
  return { target, homeCard, build, open, get active(){ return active; } };
})();

const StickerWorld = (() => {
  const BACKGROUNDS = [
    { id: 'meadow', label: 'はらっぱ', icon: '🌳' },
    { id: 'sea', label: 'うみ', icon: '🌊' },
    { id: 'sky', label: 'そら', icon: '☁️' }
  ];
  let node, board, palette, hint, selected = null;

  function owned(){
    return Store.data.stickers.filter(k => /^[a-z0-9]+:\d+$/.test(k));
  }
  function build(){
    if (node) return node;
    board = el('div.sticker-world-board', { role: 'application', 'aria-label': 'じぶんの しま' });
    palette = el('div.sticker-world-palette');
    hint = el('div.sticker-world-hint');
    board.onclick = e => {
      if (e.target.closest('.world-sticker')) return;
      if (!selected){
        Sound.say('下から、置きたいシールをえらんでね。', { delay: 40 });
        return;
      }
      const r = board.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      if (Store.putWorldSticker(selected, x, y)){
        Sound.sfx.place();
        render();
        Sound.say('おけたね。ほかのばしょにも、うごかせるよ。', { delay: 80 });
      }
    };
    node = el('div#sticker-world', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'じぶんの しま' }),
        speakBtn(() => '集めたシールを、好きな場所に置けるよ。下から選んで、島をタップしよう。')),
      el('div.sticker-world-tools', null,
        el('span', { text: 'ばしょを えらぶ' }),
        BACKGROUNDS.map(bg => el('button.world-background', { type: 'button', dataset: { background: bg.id },
          onclick(){ Store.setStickerWorldBackground(bg.id); Sound.sfx.tap(); render(); }
        }, bg.icon + ' ' + bg.label))),
      board, hint, palette);
    return UI.register('sticker-world', node);
  }
  function render(){
    build();
    const world = Store.stickerWorld(), keys = owned();
    if (selected && keys.indexOf(selected) < 0) selected = null;
    board.className = 'sticker-world-board ' + world.background;
    clear(board);
    board.append(el('span.world-starter.sun', { text: '☀️', 'aria-hidden': 'true' }),
      el('span.world-starter.home', { text: '🏡', 'aria-hidden': 'true' }));
    Object.keys(world.items).filter(k => keys.indexOf(k) >= 0).forEach(k => {
      const p = world.items[k];
      board.append(el('button.world-sticker', { type: 'button', text: stickerFor(k),
        title: 'このシールを うごかす', style: { left: p.x + '%', top: p.y + '%' },
        onclick(e){ e.stopPropagation(); selected = k; render(); Sound.sfx.tap(); }
      }));
    });
    $$('.world-background', node).forEach(b => b.classList.toggle('selected', b.dataset.background === world.background));
    clear(palette);
    keys.forEach(k => palette.append(el('button.world-palette-sticker' + (selected === k ? '.selected' : ''), {
      type: 'button', text: stickerFor(k), title: 'このシールを おく',
      onclick(){ selected = k; Sound.sfx.tap(); render(); Sound.say('島の置きたい場所をタップしてね。', { delay: 60 }); }
    })));
    hint.textContent = keys.length
      ? (selected ? '🌟　しまの おきたい ばしょを タップしてね' : '下の シールを えらんで、しまに おこう')
      : 'さいしょの シールを もらったら、ここに おけるよ';
  }
  function open(){ render(); UI.show('sticker-world'); Sound.say('自分の島だよ。集めたシールを、好きな場所に置けるよ。', { delay: 150 }); }
  return { build, render, open };
})();
