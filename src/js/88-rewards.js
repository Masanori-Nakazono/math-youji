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
      el('span.prize', null, PokemonStickers.artwork(choice.key, { rarity: false })),
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
    clear(prizeEl).append(PokemonStickers.artwork(choice.key));
    clear(detailEl);
    detailEl.append(
      el('b', { text: choice.game.name + '　《' + choice.level.t + '》' }),
      el('span', { text: 'クリアすると「' + stickerFor(choice.key) + '」の シールが もらえるよ' }),
      el('small', { text: '★3つなら すぐ なかま。ボールに はいったら、べつの ひに たしかめて でてくるよ' }));
    goBtn.onclick = () => {
      Sound.sfx.tap();
      if (choice.game.intro !== false && !Store.introduced(choice.game.id, choice.levelIndex))
        FirstSteps.open(choice.game, choice.levelIndex, { stickerMission: choice });
      else Session.startLevel(choice.game, choice.levelIndex, { stickerMission: choice });
    };
    UI.show('sticker-mission');
    Sound.say(stickerFor(choice.key) + 'のシールを取りに行こう。' + choice.game.name + 'の、' + choice.level.t + 'をクリアすると、もらえるよ。', { delay: 180 });
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

const FirstSteps = (() => {
  let node, detail, choices, result, active = null, finishSpeech = '';
  function target(){
    const rec = Diagnostic.current();
    const g = rec && Games.byId[rec.gameId];
    if (g && g.intro !== false && g.levels[rec.levelIndex]
        && levelOpen(g, rec.levelIndex) && !Store.introduced(g.id, rec.levelIndex))
      return { game: g, levelIndex: rec.levelIndex };
    for (const game of Games.list){
      if (game.intro === false) continue;
      for (let i = 0; i < game.levels.length; i++)
        if (levelOpen(game, i) && !Store.introduced(game.id, i)) return { game, levelIndex: i };
    }
    return null;
  }
  function homeCard(){
    const t = target();
    if (!t) return null;
    return el('button.home-quest.adventure-card.first-card', { type: 'button',
      onclick(){ Sound.sfx.tap(); open(t.game, t.levelIndex); } },
      el('span.icon', { text: '👀', 'aria-hidden': 'true' }),
      el('span.copy', null, el('b', { text: 'まず みてみる' }),
        el('small', { text: t.game.name + '　ひとつから' })),
      el('span.arrow', { text: '▶', 'aria-hidden': 'true' }));
  }
  const button = (icon, label, fn, accent) => el('button.btn' + (accent ? '.btn-accent' : ''),
    { type: 'button', onclick(){ Sound.sfx.tap(); fn(); } },
    el('span.bi', { text: icon, 'aria-hidden': 'true' }), el('span.bl', { text: label }));
  function build(){
    if (node) return node;
    detail = el('div.first-detail'); choices = el('div.first-actions');
    node = el('div#first-steps', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'はじめてコース' }), speakBtn(() => 'まず、見るだけでもいいよ。ひとつやったら、そこで終われるよ。')),
      el('div.reward-sheet', null, mascotSVG('happy', 'talk'), detail, choices));
    UI.register('first-steps', node);
    result = el('div#first-finish', null,
      speakBtn(() => finishSpeech),
      el('div.reward-sheet', null, mascotSVG('happy', 'talk'),
        el('h2', { text: 'きょうは ここまででも いいよ' }),
        el('div.first-detail'), el('div.first-actions')));
    UI.register('first-finish', result);
    return node;
  }
  function open(game, levelIndex, opts){
    if (!game || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return;
    build(); active = { game, levelIndex, opts: opts || null };
    detail.textContent = game.ico + '　' + game.name + '　《' + game.levels[levelIndex].t + '》';
    const previous = Store.milestones().find(m => m.gameId === game.id && m.levelIndex < levelIndex);
    if (previous) detail.append(el('small', { text: '📒 まえは「' + Store.milestoneText(previous.kind) + '」' }));
    clear(choices);
    choices.append(
      button('👀', 'まず みてみる', () => Session.startFirst(game, levelIndex, 'show'), true),
      button('🤝', 'みてから ひとつ', () => Session.startFirst(game, levelIndex, 'together')),
      button('▶', 'じぶんで あそぶ', () => Session.startLevel(game, levelIndex, active.opts)));
    UI.show('first-steps');
    Sound.say('初めてのことは、まず見るだけでもいいよ。一つやったら、そこで終われるよ。', { delay: 180 });
  }
  function finish(game, levelIndex, phase, milestone){
    build();
    const info = $('.first-detail', result), actions = $('.first-actions', result);
    const answered = milestone && milestone.kind === 'together';
    info.textContent = phase === 'show' || !answered ? 'やりかたを みたね' : 'いっしょに ひとつ できたね';
    clear(actions);
    if (phase === 'show') actions.append(button('🤝', 'いっしょに ひとつ',
      () => Session.startFirst(game, levelIndex, 'afterShow'), true));
    actions.append(button('🏠', 'きょうは ここまで', () => {
      Home.render(); UI.show('home', { replace: true });
    }, phase !== 'show'));
    actions.append(button('▶', 'もっと あそぶ', () => Session.startLevel(game, levelIndex, active && active.opts)));
    if (milestone && milestone.label) info.append(el('small', { text: '📒 ' + milestone.label }));
    UI.show('first-finish', { replace: true });
    finishSpeech = phase === 'show' || !answered ? 'やり方を見たね。今日はここまででもいいよ。'
      : '一緒に一つできたね。今日はここまででもいいよ。';
    Sound.say(finishSpeech, { delay: 200 });
  }
  return { target, homeCard, build, open, finish, get active(){ return active; } };
})();

const ProgressAlbum = (() => {
  let node, cards;
  function build(){
    if (node) return node;
    cards = el('div.album-cards');
    node = el('div#progress-album', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'できたアルバム' }),
        speakBtn(() => 'できたことを、いっしょに見てみよう。')),
      el('p.album-intro', { text: 'ちいさな「できた」を あつめたよ' }), cards);
    return UI.register('progress-album', node);
  }
  function open(){
    build(); clear(cards);
    const entries = Store.milestones();
    if (!entries.length) cards.append(el('div.album-empty', { text: 'まだ からっぽ。 まずは みるだけでも いいよ 👀' }));
    entries.forEach(m => {
      const g = Games.byId[m.gameId], lv = g && g.levels[m.levelIndex];
      if (!lv) return;
      cards.append(el('button.album-card', { type: 'button',
        onclick(){ Sound.sfx.tap(); Sound.say(g.name + '。' + (m.label || lv.t) + '。'
          + Store.milestoneText(m.kind), { delay: 80 }); } },
        el('span.album-icon', { text: g.ico, 'aria-hidden': 'true' }),
        el('div', null, el('b', { text: g.name + '　' + (m.label || lv.t) }),
          el('span', { text: Store.milestoneText(m.kind) }))));
    });
    UI.show('progress-album');
    Sound.say(entries.length ? 'できたことを、いっしょに見てみよう。'
      : 'まだ空っぽだよ。まずは見るだけでもいいよ。', { delay: 150 });
  }
  return { build, open };
})();

const IslandJobs = (() => {
  const SCENES = {
    boat: { icon: '⛵️', item: '🐥', label: 'ふねに のせる', unit: 'ひき' },
    snack: { icon: '🧺', item: '🍎', label: 'おやつを つめる', unit: 'こ' }
  };
  let node, sceneButtons, prompt, slots, actions, message, scene = 'boat';
  function build(){
    if (node) return node;
    sceneButtons = el('div.job-scenes'); prompt = el('div.job-prompt');
    slots = el('div.job-slots'); actions = el('div.job-actions');
    message = el('div.job-message', { role: 'status', 'aria-live': 'polite' });
    node = el('div#island-jobs', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'しまに もどる',
          onclick(){ Sound.sfx.tap(); StickerWorld.open(); } }, '←'),
        el('h2', { text: 'しまの おしごと' }), speakBtn(() => jobSpeech())),
      sceneButtons, prompt, slots, message, actions);
    Object.keys(SCENES).forEach(k => sceneButtons.append(el('button.btn.job-scene', {
      type: 'button', onclick(){ Sound.sfx.tap(); scene = k; Store.startIslandJob(k); render(); Sound.say(jobSpeech(), { delay: 120 }); }
    }, SCENES[k].icon + ' ' + SCENES[k].label)));
    return UI.register('island-jobs', node);
  }
  function jobSpeech(){
    const j = Store.islandJob(scene), s = SCENES[scene];
    if (!j) return '島のお仕事を選んでね。';
    if (j.done) return j.start + 'と' + (j.size - j.start) + 'で' + j.size + '。できた場面が島に残ったよ。';
    if (j.placed === j.size - j.start) return 'いくつ増やしたかな。新しく置いたものを数えてね。';
    return j.size + 'この場所に、' + j.start + s.unit + 'いるよ。空いているところに一つずつ置こう。';
  }
  const action = (label, fn, accent) => el('button.btn' + (accent ? '.btn-accent' : ''),
    { type: 'button', onclick(){ Sound.sfx.tap(); fn(); } }, label);
  function render(){
    build();
    const j = Store.startIslandJob(scene), s = SCENES[scene];
    $$('.job-scene', sceneButtons).forEach((b, i) => b.classList.toggle('selected',
      Object.keys(SCENES)[i] === scene));
    prompt.textContent = j.done ? s.icon + '　' + s.label + '　かんせい！'
      : j.placed === j.size - j.start ? 'あたらしく いくつ いれたかな？'
      : s.icon + '　' + j.size + 'この ばしょに ' + j.start + s.unit + '。あいた ところに いれよう';
    clear(slots);
    for (let i = 0; i < j.size; i++){
      const next = !j.done && i === j.start + j.placed && j.placed < j.size - j.start;
      slots.append(el((next ? 'button' : 'span') + '.job-slot' + (i >= j.start ? '.new' : '')
        + (next ? '.next' : ''), {
        type: next ? 'button' : undefined,
        text: i < j.start + j.placed ? s.item : '·',
        'aria-label': next ? 'ここに ひとつ いれる'
          : i < j.start + j.placed ? (i < j.start ? 'はじめから いた' : 'あたらしく いれた') : 'あいている',
        onclick: next ? () => { Store.addIslandJobPiece(scene); Sound.sfx.place(); render();
          Sound.say(jobSpeech(), { delay: 100 }); } : undefined
      }));
    }
    clear(actions); message.textContent = '';
    if (j.done){
      message.textContent = j.start + ' と ' + (j.size - j.start) + ' で ' + j.size + '！';
      actions.append(action('🏡 しまを みる', () => StickerWorld.open(), true),
        action('🔄 あたらしい おしごと', () => { Store.startIslandJob(scene, true); render(); Sound.say(jobSpeech(), { delay: 120 }); }));
    } else if (j.placed < j.size - j.start){
      actions.append(action('+1 ' + s.item + ' ひとつ いれる', () => {
        Store.addIslandJobPiece(scene); render(); Sound.say(jobSpeech(), { delay: 100 });
      }, true));
    } else {
      const answer = j.size - j.start;
      const options = [answer, answer - 1, answer + 1].filter(x => x >= 1 && x <= 10).sort((a, b) => a - b);
      options.forEach(n => actions.append(action(n + s.unit, () => {
        if (n !== answer){
          message.textContent = 'あたらしく いれた ' + s.item + ' を かぞえてみよう';
          Sound.say('新しく入れたものを数えてみよう。', { delay: 100 });
          return;
        }
        Store.finishIslandJob(scene); Sound.sfx.finish(); render();
        Sound.say(jobSpeech(), { delay: 180 });
      }, false)));
    }
  }
  function open(which){
    if (SCENES[which]) scene = which;
    render(); UI.show('island-jobs'); Sound.say(jobSpeech(), { delay: 150 });
  }
  return { build, render, open };
})();

const StickerWorld = (() => {
  const BACKGROUNDS = [
    { id: 'meadow', label: 'はらっぱ', icon: '🌳' },
    { id: 'sea', label: 'うみ', icon: '🌊' },
    { id: 'sky', label: 'そら', icon: '☁️' }
  ];
  let node, board, palette, hint, selected = null, hopKey = null;
  /* ---------- a place that is alive ----------
     The island was two bands of colour with a sun and a house: a Pokémon put down
     anywhere did the same thing, and nothing on it ever changed. Three additions,
     none of which is scored or can be lost:
       places  — where a Pokémon is put decides what it does (it floats in the sky,
                 bobs in the pond, rustles in the forest, hops on the mountain);
       berries — a finished sitting earns one, and a Pokémon given one is glad;
       scenery — the island gains something as the number of Pokémon out of their
                 balls grows, so half a year of play can be seen from here. */
  const PLACES = {
    sky:      { say: 'お空を、飛んでるよ。' },
    water:    { say: '水で、泳いでるよ。' },
    forest:   { say: '森で、遊んでるよ。' },
    mountain: { say: '山に、登ってるよ。' },
    grass:    { say: '' }
  };
  /** which place a point of the board belongs to; a pure function of the picture */
  function placeAt(background, x, y){
    if (background === 'sky') return 'sky';
    if (background === 'sea') return y < 35 ? 'sky' : 'water';
    if (y < 38) return 'sky';
    if (Math.pow((x - 72) / 17, 2) + Math.pow((y - 80) / 13, 2) <= 1) return 'water';
    if (x < 30 && y < 78) return 'forest';
    if (x >= 40 && x <= 66 && y < 60) return 'mountain';
    return 'grass';
  }
  /* What the island gains, by how many Pokémon are out of their balls. Ground
     things belong to the meadow; things in the sky show over any background. */
  const SCENERY = [
    { at: 3,   e: '🌷', name: 'おはな',     x: 36, y: 90 },
    { at: 6,   e: '🌻', name: 'ひまわり',   x: 90, y: 62 },
    { at: 10,  e: '🌈', name: 'にじ',       x: 30, y: 16, sky: true, big: true },
    { at: 15,  e: '⛲', name: 'ふんすい',   x: 50, y: 70 },
    { at: 25,  e: '🎪', name: 'テント',     x: 86, y: 44 },
    { at: 40,  e: '🎡', name: 'かんらんしゃ', x: 14, y: 44, big: true },
    { at: 60,  e: '🏰', name: 'おしろ',     x: 53, y: 40, big: true },
    { at: 100, e: '🎆', name: 'はなび',     x: 62, y: 12, sky: true, big: true }
  ];
  let feeding = false, fedKey = null, grewNow = [];
  const onIsland = k => !!(k && Store.stickerWorld().items[k]);
  function feed(k){
    if (!onIsland(k) || !Store.useBerry()) return false;
    feeding = false; fedKey = k; selected = k;
    render();
    Sound.sfx.correct();
    Sound.say(itemName(k) + '、喜んでるよ！', { delay: 60 });
    return true;
  }
  function berryTap(){
    Sound.sfx.tap();
    if (!Store.berries()){
      Sound.say('問題をやると、きのみがもらえるよ。', { delay: 40 });
      return;
    }
    if (!Object.keys(Store.stickerWorld().items).length){
      Sound.say('まず、ポケモンを島に置いてね。', { delay: 40 });
      return;
    }
    if (onIsland(selected)){ feed(selected); return; }   // a Pokémon is already chosen: it gets it
    feeding = !feeding;
    render();
    if (feeding) Sound.say('きのみをあげたいポケモンを、タップしてね。', { delay: 40 });
  }
  /* ---------- a finger moves a sticker ----------
     Placing was「pick below, then tap the island」and nothing else: a five-year-old
     puts a finger on the Pokémon and pulls, and nothing happened. A sticker on the
     island follows the finger now and stays where it is let go. A plain tap still
     selects it, and it answers — a hop and its name. */
  const DRAG_START = 12;
  let draggedAt = 0;
  function bindSticker(btn, k){
    let id = null, sx = 0, sy = 0, moved = false;
    const pos = e => {
      const r = board.getBoundingClientRect();
      return { x: Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)),
               y: Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) };
    };
    btn.addEventListener('pointerdown', e => {
      if (id != null || (e.button != null && e.button > 0)) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
      try{ btn.setPointerCapture(id); }catch(err){}
    });
    btn.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < DRAG_START) return;
      if (!moved){ moved = true; btn.classList.add('dragging'); }
      e.preventDefault();
      const p = pos(e);
      btn.style.left = p.x + '%'; btn.style.top = p.y + '%';
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null;
      if (!moved) return;
      btn.classList.remove('dragging');
      const p = pos(e);
      const before = (Store.stickerWorld().items[k] || null);
      const was = before ? placeAt(Store.stickerWorld().background, before.x, before.y) : null;
      if (e.type === 'pointerup' && Store.putWorldSticker(k, p.x, p.y)){
        Sound.sfx.place(); selected = k;
        arrive(k, was);
      }
      draggedAt = Date.now();             // the click that follows a drag is not a tap
      render();
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (Date.now() - draggedAt < 400) return;
      if (feeding && feed(k)) return;
      selected = k; hopKey = k; render(); Sound.sfx.tap();
      Sound.say(itemName(k) + '！', { delay: 40 });
    });
  }
  /** a Pokémon has just been put somewhere: say what it does there, when that is new */
  function arrive(k, was){
    const p = Store.stickerWorld().items[k];
    if (!p || isTreasure(k)) return;
    const now = placeAt(Store.stickerWorld().background, p.x, p.y);
    if (now !== was && PLACES[now].say) Sound.say(itemName(k) + '、' + PLACES[now].say, { delay: 80 });
  }

  function owned(){
    return Store.ownedStickerKeys().filter(k => {
      const base = k.replace(/^lap2:/,'');
      return /^[a-z0-9]+:\d+(?::g)?$/.test(base) || /^(daily|focus|adventure|treasure):/.test(base);
    });
  }
  const isTreasure = k => k.replace(/^lap2:/,'').startsWith('treasure:');
  const itemRound = k => k.startsWith('lap2:') ? 2 : 1;
  const itemName = k => PokemonStickers.reward(k, itemRound(k)).name;
  const itemArt = k => {
    const art = PokemonStickers.artwork(k, {round:itemRound(k), rarity:false});
    if (isTreasure(k)) art.classList.add('treasure-art');
    if (k.replace(/^lap2:/,'').startsWith('transfer:')) art.classList.add('transfer-sticker');
    return art;
  };
  function build(){
    if (node) return node;
    board = el('div.sticker-world-board', { role: 'application', 'aria-label': 'じぶんの しま' });
    palette = el('div.sticker-world-palette');
    hint = el('div.sticker-world-hint');
    board.onclick = e => {
      if (e.target.closest('.world-sticker') || Date.now() - draggedAt < 400) return;
      if (!selected){
        Sound.say('下から、置きたいシールや宝物をえらんでね。', { delay: 40 });
        return;
      }
      const r = board.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 100, y = (e.clientY - r.top) / r.height * 100;
      const before = Store.stickerWorld().items[selected] || null;
      const was = before ? placeAt(Store.stickerWorld().background, before.x, before.y) : null;
      if (Store.putWorldSticker(selected, x, y)){
        Sound.sfx.place();
        render();
        const now = placeAt(Store.stickerWorld().background, Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
        if (!isTreasure(selected) && now !== was && PLACES[now].say) arrive(selected, was);
        else Sound.say('おけたね。ほかのばしょにも、うごかせるよ。', { delay: 80 });
      }
    };
    node = el('div#sticker-world', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'じぶんの しま' }),
        speakBtn(() => '集めたシールや宝物を、好きな場所に置けるよ。下から選んで、島をタップしよう。')),
      el('div.sticker-world-tools', null,
        el('span', { text: 'ばしょを えらぶ' }),
        BACKGROUNDS.map(bg => el('button.world-background', { type: 'button', dataset: { background: bg.id },
          onclick(){ Store.setStickerWorldBackground(bg.id); Sound.sfx.tap(); render(); }
        }, bg.icon + ' ' + bg.label)),
        el('button.btn.btn-accent.world-job-open', { type: 'button',
          onclick(){ Sound.sfx.tap(); IslandJobs.open(); } }, '⛵️ しまの おしごと')),
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
    /* the places, drawn behind everything a finger can move */
    board.append(el('span.world-place.cloud.c1', { text: '☁️', 'aria-hidden': 'true' }),
      el('span.world-place.cloud.c2', { text: '☁️', 'aria-hidden': 'true' }));
    if (world.background === 'meadow') board.append(
      el('span.world-place.mountain', { text: '⛰️', 'aria-hidden': 'true' }),
      el('span.world-place.forest', { text: '🌲🌳🌲', 'aria-hidden': 'true' }),
      el('span.world-place.pond', { 'aria-hidden': 'true' }));
    const friends = Store.islandFriends();
    SCENERY.forEach(s => {
      if (friends < s.at || (!s.sky && world.background !== 'meadow')) return;
      board.append(el('span.world-scenery' + (s.big ? '.big' : '') + (grewNow.indexOf(s) >= 0 ? '.new' : ''), {
        text: s.e, title: s.name, 'aria-hidden': 'true', dataset: { scenery: String(s.at) },
        style: { left: s.x + '%', top: s.y + '%' } }));
    });
    const berries = Store.berries();
    board.append(el('button.berry-tray' + (feeding ? '.feeding' : '') + (berries ? '' : '.empty'), {
      type: 'button', 'aria-label': 'きのみ ' + berries + 'こ', 'aria-pressed': String(feeding),
      onclick(e){ e.stopPropagation(); berryTap(); } },
      el('span.berry', { text: '🍓', 'aria-hidden': 'true' }),
      el('b', { text: '×' + berries })));
    if (Store.islandJob('boat') && Store.islandJob('boat').completed)
      board.append(el('span.world-job.boat', { text: '⛵️', title: 'つくった ふね' }));
    if (Store.islandJob('snack') && Store.islandJob('snack').completed)
      board.append(el('span.world-job.snack', { text: '🧺', title: 'つくった おやつ' }));
    Object.keys(world.items).filter(k => keys.indexOf(k) >= 0).forEach(k => {
      const p = world.items[k];
      const btn = el('button.world-sticker' + (isTreasure(k) ? '.world-treasure' : '.at-' + placeAt(world.background, p.x, p.y))
        + (hopKey === k ? '.hop' : '') + (selected === k ? '.held' : '') + (fedKey === k ? '.fed' : ''), { type: 'button',
        dataset: { place: isTreasure(k) ? '' : placeAt(world.background, p.x, p.y) },
        'aria-label': itemName(k) + 'を うごかす', title: itemName(k) + 'を うごかす', style: { left: p.x + '%', top: p.y + '%' }
      }, itemArt(k));
      bindSticker(btn, k);
      board.append(btn);
    });
    hopKey = null; fedKey = null;
    $$('.world-background', node).forEach(b => b.classList.toggle('selected', b.dataset.background === world.background));
    clear(palette);
    keys.forEach(k => palette.append(el('button.world-palette-sticker' + (isTreasure(k) ? '.world-palette-treasure' : '') + (selected === k ? '.selected' : ''), {
      type: 'button', title: itemName(k) + 'を おく', 'aria-label': itemName(k) + 'を おく', 'aria-pressed': String(selected === k),
      onclick(){ selected = k; Sound.sfx.tap(); render(); Sound.say('島の置きたい場所をタップしてね。', { delay: 60 }); }
    }, itemArt(k))));
    const next = SCENERY.find(s => friends < s.at);
    hint.textContent = feeding ? '🍓　きのみを あげたい ポケモンを タップしてね'
      : keys.length
      ? (selected ? '🌟　しまの おきたい ばしょを タップしてね。おいた シールは ゆびで うごかせるよ' : '下の シールや たからものを えらんで、しまに おこう')
        + (next ? '　･　ポケモンが あと ' + (next.at - friends) + 'ひきで ' + next.e + ' が ふえるよ' : '')
      : 'さいしょの シールを もらったら、ここに おけるよ';
  }
  function open(item){
    if (item) item = Store.worldKey(item);
    if (item && owned().includes(item)) selected = item;
    feeding = false;
    /* what the island gained since it was last looked at — shown arriving, once */
    const friends = Store.islandFriends(), seen = Store.islandSeen();
    grewNow = SCENERY.filter(s => s.at > seen && s.at <= friends);
    Store.setIslandSeen(Math.max(seen, friends));
    render(); UI.show('sticker-world');
    const grew = grewNow.length ? '島に、' + grewNow.map(s => s.name).join('と、') + 'が増えたよ！' : '';
    if (grewNow.length) Sound.sfx.star(1);
    Sound.say(grew + (item && selected === item ? itemName(item) + 'を、島の好きな場所に置いてね。'
      : grew ? '' : '自分の島だよ。集めたシールや宝物を、好きな場所に置けるよ。'), { delay: 150 });
    grewNow = [];
  }
  return { build, render, open, placeAt, _test: { scenery: SCENERY } };
})();
