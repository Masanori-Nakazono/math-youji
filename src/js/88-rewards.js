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
  let node, prizeEl, detailEl, progressEl, courseEl, goBtn, backBtn, active = null;

  function available(){
    const rec = Diagnostic.current() || {};
    const all = [];
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      const key = g.id + ':' + i;
      if (!levelOpen(g, i) || Diagnostic.resting(g.id, i) || Store.hasSticker(key)) return;
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
      dataset:{missionKey:choice.key},
      onclick(){ Sound.sfx.tap(); open(choice); }
    },
      el('span.prize', null, PokemonStickers.artwork(choice.key, { rarity: false })),
      el('span.name', { text: choice.game.name }),
      el('span.go', { text: '▶', 'aria-hidden': 'true' }))));
    return el('details.home-quest.sticker-mission', { 'aria-label': 'ほしいシールをえらぶ' },
      el('summary.quest-title', null, el('span', { text: '✨', 'aria-hidden': 'true' }),
        el('span', { text: 'ほしい シールから えらぶ' })), row);
  }

  function build(){
    if (node) return node;
    prizeEl = el('div.sticker-mission-prize');
    detailEl = el('div.sticker-mission-detail');
    progressEl = el('div.sticker-mission-progress');
    courseEl = el('div.sticker-mission-course');
    goBtn = el('button.btn.btn-accent.sticker-mission-go', { type: 'button' });
    backBtn = el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
      onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←');
    node = el('div#sticker-mission', null,
      el('div.topbar', null, backBtn, el('h2', { text: 'シールミッション' })),
      el('div.reward-sheet', null,
        el('div.sticker-mission-intro', null, prizeEl, detailEl), goBtn, progressEl, courseEl));
    return UI.register('sticker-mission', node);
  }

  function open(choice){
    if (!choice || !choice.game || !choice.level || !levelOpen(choice.game, choice.levelIndex)) return;
    build(); active = choice;
    clear(prizeEl).append(PokemonStickers.artwork(choice.key));
    clear(detailEl);
    detailEl.append(
      el('b', { text: choice.game.ico + '　' + choice.game.name }),
      el('span', { text: '《' + choice.level.t + '》' }),
      el('small', { text: 'この シールへ、1もんずつで いいよ' }));
    const progress = ShortProgress.describe(choice.game.id, choice.levelIndex, {gold:false, preview:true});
    clear(progressEl).append(ShortProgress.render(choice.game.id, choice.levelIndex, {gold:false, preview:true}));
    clear(courseEl).append(FirstSteps.longCourse(choice.game, choice.levelIndex, {stickerMission:choice}));
    goBtn.textContent = progress.nextLabel;
    goBtn.onclick = () => {
      Sound.sfx.tap();
      ShortProgress.start(choice.game, choice.levelIndex, {gold:false, stickerMission:choice});
    };
    UI.show('sticker-mission');
    Sound.say(stickerFor(choice.key) + 'のシールへの遊びだよ。' + progress.speech + '1問ずつでいいよ。', { delay: 180 });
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
    const weak = Diagnostic.weakFacts(1)[0];
    const aimed = weak && fromOrigin(weak.at, weak.key);
    if (aimed) return aimed;
    const rec = Diagnostic.current();
    const game = rec && Games.byId[rec.gameId];
    if (game && game.levels[rec.levelIndex] && levelOpen(game, rec.levelIndex)
        && !Diagnostic.resting(game.id, rec.levelIndex)){
      return { game, levelIndex: rec.levelIndex, level: game.levels[rec.levelIndex], want: null };
    }
    for (const g of Games.list){
      for (let i = 0; i < g.levels.length; i++) if (levelOpen(g, i) && !Diagnostic.resting(g.id, i)) return { game: g, levelIndex: i, level: g.levels[i], want: null };
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
  function withOrigin(game, levelIndex, opts){
    return UI.currentName() === 'levels' && Levels.game === game
      ? Object.assign({}, opts, {returnToLevels:Levels.captureReturn(levelIndex)}) : opts || null;
  }
  function target(){
    const rec = Diagnostic.current();
    const g = rec && Games.byId[rec.gameId];
    if (g && g.intro !== false && g.levels[rec.levelIndex]
        && levelOpen(g, rec.levelIndex) && !Diagnostic.resting(g.id, rec.levelIndex)
        && !Store.introduced(g.id, rec.levelIndex))
      return { game: g, levelIndex: rec.levelIndex };
    for (const game of Games.list){
      if (game.intro === false) continue;
      for (let i = 0; i < game.levels.length; i++)
        if (levelOpen(game, i) && !Diagnostic.resting(game.id, i) && !Store.introduced(game.id, i)) return { game, levelIndex: i };
    }
    return null;
  }
  function shortCourses(){
    return Object.keys(Store.data.shortCourses || {}).map(key => {
      const [id, index] = key.split(':'), game = Games.byId[id], levelIndex = Number(index);
      if (!game || !Array.isArray(game.levels) || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return null;
      const status = Store.shortStatus(id, levelIndex);
      return { game, levelIndex, status };
    }).filter(Boolean).sort((a, b) => b.status.at - a.status.at);
  }
  function shortTarget(){
    return shortCourses().filter(t => (!t.status.confirmed || t.status.goldActive) && !t.status.waiting
      && !Diagnostic.resting(t.game.id, t.levelIndex))
      .sort((a, b) => Number(b.status.phase === 'check') - Number(a.status.phase === 'check')
        || b.status.at - a.status.at)[0] || null;
  }
  function shortPlan(){
    const courses = shortCourses();
    if (!courses.length) return null;
    const unfinished = courses.filter(t => !t.status.confirmed || t.status.goldActive);
    const available = t => !Diagnostic.resting(t.game.id, t.levelIndex);
    const due = unfinished.find(t => t.status.phase === 'check' && available(t));
    if (due) return {...due, kind:'check'};
    const support = unfinished.find(t => t.status.resting && t.status.supportNeeded);
    if (support) return {...support, kind:'support'};
    const returning = unfinished.find(t => available(t) && !t.status.waiting
      && t.status.restUntil !== null && t.status.lastDay < t.status.restUntil);
    if (returning) return {...returning, kind:'return'};
    const current = unfinished.find(t => available(t) && !t.status.waiting);
    if (current) return {...current, kind:'resume'};
    const rest = unfinished.find(t => !available(t));
    const known = (game, i) => levelOpen(game, i) && !Diagnostic.resting(game.id, i)
      && (Store.introduced(game.id, i) || Store.hasConfirmed(game.id + ':' + i))
      && !Store.shortStatus(game.id, i).waiting;
    if (rest){
      for (let i = rest.levelIndex - 1; i >= 0; i--)
        if (known(rest.game, i)) return {game:rest.game, levelIndex:i, kind:'easier'};
      for (const game of Games.list){
        if (game.intro === false || game.id === rest.game.id) continue;
        for (let i = 0; i < game.levels.length; i++)
          if (known(game, i)) return {game, levelIndex:i, kind:'known'};
      }
    }
    const next = target();
    if (next) return {...next, kind:'new'};
    for (const game of Games.list){
      if (game.intro === false) continue;
      for (let i = 0; i < game.levels.length; i++)
        if (known(game, i)) return {game, levelIndex:i, kind:'review'};
    }
    const waiting = unfinished.find(available);
    return waiting ? {...waiting, kind:'review'} : null;
  }
  function planCopy(t){
    const titles = {check:'べつのひの たしかめを 1もん', support:'いっしょに 1もん',
      return:'まえの あそびを 1もん', resume:'つづきの 1もん', easier:'やさしい もんだいを 1もん',
      known:'できる あそびを 1もん', new:'あたらしい あそびを 1もん', review:'ふくしゅうを 1もん'};
    const reasons = {check:'べつのひにも できるかな', support:'やりかたを みてから。このあそびは あとで また',
      return:'すこし やすんだ あそびを ためそう', resume:'1もんずつでも すすむよ',
      easier:'できる ところから ためそう', known:'できる ところから ためそう',
      new:'1もんだけ。ヒントも あるよ', review:'たしかめは また べつのひでも いいよ'};
    const gold = t.status && t.status.goldActive;
    return {title:gold && t.kind === 'check' ? 'きんへの たしかめを 1もん'
      : gold && (t.kind === 'resume' || t.kind === 'return') ? 'きんへ つづきの 1もん' : titles[t.kind] || titles.resume,
      reason:gold && t.kind === 'resume' ? 'できた シールを のこして、きんに チャレンジ' : reasons[t.kind] || reasons.resume};
  }
  function startPlan(t, opts){
    if (!t) return;
    if (t.kind === 'support'){
      build(); active = {game:t.game, levelIndex:t.levelIndex, opts:withOrigin(t.game, t.levelIndex, opts)};
      Session.startFirst(t.game, t.levelIndex, 'afterShow');
    } else startOne(t.game, t.levelIndex, t.kind ? t.kind !== 'new' : undefined, opts);
  }
  function oneTarget(){
    const current = shortPlan();
    if (current) return current;
    const rec = Diagnostic.current(), g = rec && Games.byId[rec.gameId];
    if (g && g.intro !== false && levelOpen(g, rec.levelIndex) && !Diagnostic.resting(g.id, rec.levelIndex))
      return { game:g, levelIndex:rec.levelIndex };
    for (const game of Games.list){
      if (game.intro === false) continue;
      for (let i = 0; i < game.levels.length; i++)
        if (levelOpen(game, i) && !Diagnostic.resting(game.id, i)) return { game, levelIndex:i };
    }
    return null;
  }
  function homeCard(opts){
    const one = opts && opts.one, t = one ? oneTarget() : target();
    if (!t) return null;
    return el('button.home-quest.adventure-card.first-card', { type: 'button',
      onclick(){ Sound.sfx.tap(); if (one) startPlan(t); else open(t.game, t.levelIndex); } },
      el('span.icon', { text: one ? '👆' : '👀', 'aria-hidden': 'true' }),
      el('span.copy', null, el('b', { text: one ? 'ひとつだけ やってみる' : 'まず みてみる' }),
        el('small', { text: t.game.name + (one && t.kind ? '　' + planCopy(t).title : one ? Store.introduced(t.game.id, t.levelIndex)
          ? Store.shortStatus(t.game.id, t.levelIndex).phase === 'check' ? '　べつのひの たしかめ 1もん' : '　じぶんで 1もん。ヒントも あるよ'
          : '　ヒントつきの 1もん' : '　みるだけでも いいよ') })),
      el('span.arrow', { text: '▶', 'aria-hidden': 'true' }));
  }
  const button = (icon, label, fn, accent) => el('button.btn' + (accent ? '.btn-accent' : ''),
    { type: 'button', onclick(){ Sound.sfx.tap(); fn(); } },
    el('span.bi', { text: icon, 'aria-hidden': 'true' }), el('span.bl', { text: label }));
  // The longer course remains a deliberate choice. Its scored question count is
  // stable; the engine's preparation screen names any teaching/check additions.
  function longCourse(game, levelIndex, opts){
    const n = game.levels[levelIndex].n || 8;
    return el('details.long-course', null,
      el('summary', {text:'まとめて あそびたいとき'}),
      el('p', {text:n + 'もんで レベルに チャレンジ。せいかいに あわせて、ほしや シールが のこるよ。'}),
      el('p', {text:'1もんずつの じゅんびとは べつの コースだよ。みほんや、ほかの シールの たしかめが くわわることも あるよ。'}),
      el('small', {text:'つぎの がめんで、ぜんぶの もんすうを みられるよ。とちゅうで やすんでも いいよ。'}),
      button('▶', n + 'もんの コース', () => Session.startLevel(game, levelIndex, opts)));
  }
  function build(){
    if (node) return node;
    detail = el('div.first-detail'); choices = el('div.first-actions');
    node = el('div#first-steps', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){
            Sound.sfx.tap();
            const origin = active && active.opts;
            if (origin && origin.returnToBook) Book.returnToBook();
            else if (origin && origin.returnToLevels) Levels.returnToList(origin.returnToLevels);
            else { Home.render(); UI.show('home', { replace: true }); }
          } }, '←'),
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
  function startOne(game, levelIndex, independent, opts){
    if (!game || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return;
    build(); active = { game, levelIndex, opts:withOrigin(game, levelIndex, opts) };
    Session.startFirst(game, levelIndex, independent || Store.introduced(game.id, levelIndex)
      ? Store.shortStatus(game.id, levelIndex).phase : 'afterShow');
  }
  function startGold(game, levelIndex, opts){
    if (!game || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return;
    build(); active = {game, levelIndex, opts:withOrigin(game, levelIndex, opts)};
    // The engine settles any completed checkpoint before starting a fresh goal.
    Session.startFirst(game, levelIndex, 'independent', {gold:true});
  }
  function open(game, levelIndex, opts){
    if (!game || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return;
    build(); active = { game, levelIndex, opts:withOrigin(game, levelIndex, opts) };
    detail.textContent = game.ico + '　' + game.name + '　《' + game.levels[levelIndex].t + '》';
    const previous = Store.milestones().find(m => m.gameId === game.id && m.levelIndex < levelIndex);
    if (previous) detail.append(el('small', { text: '📒 まえは「' + Store.milestoneText(previous.kind) + '」' }));
    clear(choices);
    choices.append(
      button('👀', 'まず みてみる', () => Session.startFirst(game, levelIndex, 'show'), true),
      button('🤝', 'みてから ひとつ', () => Session.startFirst(game, levelIndex, 'together')),
      button('👆', 'じぶんで 1もん', () => startOne(game, levelIndex, true, active.opts)));
    const status = Store.shortStatus(game.id, levelIndex);
    if (status.canStartGold || status.goldActive) choices.append(button('✨',
      ShortProgress.describe(game.id, levelIndex, {gold:true}).nextLabel,
      () => ShortProgress.start(game, levelIndex, Object.assign({}, active.opts, {gold:true}))));
    choices.append(longCourse(game, levelIndex, active.opts));
    const progress = ShortProgress.render(game.id, levelIndex);
    if (progress) detail.append(progress);
    UI.show('first-steps');
    Sound.say('初めてのことは、まず見るだけでもいいよ。一つやったら、そこで終われるよ。', { delay: 180 });
  }
  function finish(game, levelIndex, phase, milestone){
    build();
    // Keep the selected prize only for this course; the book return remains useful
    // even if the child follows a recommendation for another activity.
    const origin = active && active.game === game && active.levelIndex === levelIndex ? active.opts : null;
    const info = $('.first-detail', result), actions = $('.first-actions', result);
    const short = phase === 'independent' || phase === 'check';
    const status = Store.shortStatus(game.id, levelIndex);
    const rewards = short ? status.rewardKeys || [] : [];
    const newGold = rewards.includes(game.id + ':' + levelIndex + ':g');
    const answered = milestone && milestone.kind === 'together';
    const doneText = short ? milestone ? Store.milestoneText(milestone.kind) : 'ひとつ ためしたね'
      : phase === 'show' || !answered ? 'やりかたを みたね' : 'いっしょに ひとつ できたね';
    info.textContent = doneText;
    if (short){
      if (newGold) info.append(el('p.first-progress', {text:'🌟　きんの シールを ゲット！ べつのひも できたね'}));
      else if (status.lastResult === 'confirmed') info.append(el('p.first-progress', {text:'🌟　べつのひも できたね！ シールが かんせいしたよ'}));
      info.append(ShortProgress.render(game.id, levelIndex));
    }
    if (rewards.length) info.append(el('div.short-rewards', {'aria-label':'もらった シール'},
      rewards.map(key => PokemonStickers.artwork(key))));
    if (status.resting) info.append(el('p.first-progress', {text:status.supportNeeded
      ? 'いっしょに やりかたを みよう。そのあとは べつの あそびに しよう'
      : 'このあそびは すこし おやすみ。また あとで もどれるよ'}));
    clear(actions);
    if (phase === 'show') actions.append(button('🤝', 'いっしょに ひとつ',
      () => Session.startFirst(game, levelIndex, 'afterShow'), true));
    actions.append(button('🏠', 'きょうは ここまで', () => {
      Home.endToday();
    }, phase !== 'show'));
    const choose = button('🗺️', 'べつの あそびを えらぶ', () => {
      if (origin && origin.returnToBook) Book.returnToBook();
      else Home.choosePlay();
    });
    choose.classList.add('first-choose'); actions.append(choose);
    if (rewards.length) actions.append(button('🏡', 'しまに はる', () => StickerWorld.open(rewards[rewards.length - 1])));
    if (phase !== 'show'){
      const next = shortPlan() || {game, levelIndex, kind:'resume'};
      const same = next.game.id === game.id && next.levelIndex === levelIndex;
      const nextOrigin = same ? origin : origin && origin.returnToBook ? {returnToBook:true} : null;
      const nextButton = button(next.game.ico, same && next.kind === 'resume' && !status.goldActive
        ? 'じぶんで もう 1もん' : planCopy(next).title, () => startPlan(next, nextOrigin));
      nextButton.classList.add('first-next');
      $('.bl', nextButton).append(el('small', {text:next.game.name + '　《' + next.game.levels[next.levelIndex].t + '》'}));
      actions.append(nextButton);
    }
    if (phase !== 'show' && status.canStartGold) actions.append(button('✨', 'きんへ 1もんずつ',
      () => startGold(game, levelIndex, origin)));
    actions.append(longCourse(game, levelIndex, origin));
    if (milestone && milestone.label) info.append(el('small', { text: '📒 ' + milestone.label }));
    if (short) info.append(el('details.first-home-mission', null,
      el('summary', { text: '🏡 おうちで あそぶ（やりたい ときに）' }), Missions.resultCard(game.id)));
    UI.show('first-finish', { replace: true });
    finishSpeech = doneText + '。' + (short && status.lastResult === 'confirmed'
      ? '別の日もできたね。シールが完成したよ。' : short && status.waiting ? '確かめは、また別の日にしよう。' : '')
      + (short ? ShortProgress.describe(game.id, levelIndex).speech : '')
      + '今日はここまででもいいよ。';
    if (rewards.length){
      finishSpeech = doneText + '。' + rewards.map(key => PokemonStickers.reward(key).name).join('と')
        + 'のシールをもらったよ。島に貼っても、今日はここまででもいいよ。';
      Sound.sfx.finish(); UI.confetti(40);
    }
    Sound.say(finishSpeech, { delay: 200 });
  }
  return { target, shortTarget, shortPlan, planCopy, startPlan, oneTarget, homeCard, longCourse, build, open, startOne, startGold, finish, get active(){ return active; } };
})();

const ProgressAlbum = (() => {
  const FILTERS = [ ['recent', 'さいきん'], ['play', 'あそび'], ['adventure', 'ぼうけん'], ['book', 'ほん'] ];
  let node, cards, filters, count, selected = 'recent';
  /* day is a local calendar date encoded as a UTC day number by Store. Reading
     its UTC components preserves that actual date even after changing zones. */
  function date(day){
    const d = new Date(day * 86400000), year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, n = d.getUTCDate();
    return { iso: year + '-' + String(month).padStart(2, '0') + '-' + String(n).padStart(2, '0'),
      text: year + '/' + month + '/' + n, speech: year + '年' + month + '月' + n + '日' };
  }
  const validDay = day => Number.isSafeInteger(day) && day >= 0 && Number.isFinite(new Date(day * 86400000).getTime());
  const roundText = round => round + 'しゅうめ';
  function outcomes(r){
    return [ ['independent', 'さいしょから ひとりで'], ['revised', 'こたえなおして'], ['supported', 'ヒント・みほんと'] ]
      .filter(([key]) => r[key] > 0).map(([key, label]) => label + ' ' + r[key] + 'もん').join(' ／ ');
  }
  function collect(){
    const groups = new Map();
    const add = (key, type, title, icon, entry) => {
      if (!validDay(entry.day)) return;
      if (!groups.has(key)) groups.set(key, {key, type, title, icon, entries:[]});
      groups.get(key).entries.push(entry);
    };
    [1, 2].forEach(round => {
      const source = Store.roundData(round);
      if (!source) return;
      Object.entries(source.milestones || {}).forEach(([key, m]) => {
        const match = /^([a-z0-9]+):(\d+):(viewed|together|supported|revised|independent)$/.exec(key);
        const g = match && Games.byId[match[1]], lv = g && g.levels[Number(match[2])];
        if (!lv || !m) return;
        add('play:' + match[1] + ':' + match[2], 'play', g.name + '　' + lv.t, g.ico,
          {round, day:m.day, rank:Store.milestoneRank(match[3]), text:Store.milestoneText(match[3]),
            label:typeof m.label === 'string' ? m.label : ''});
      });
      Object.entries(source.transferRecords || {}).forEach(([key, r]) => {
        const mission = TransferAdventure.missionFor('transfer:' + key);
        if (!mission || !r) return;
        add('adventure:' + key, 'adventure', mission.title, mission.icon,
          {round, day:r.day, rank:0, text:outcomes(r), label:'さいごの きろく',
            note:(r.independent + r.revised + r.supported) + 'もん やりとげたね'});
      });
      Object.entries(source.reviewRecords || {}).forEach(([key, r]) => {
        const match = /^(r2|r2chapter):(\d+)$/.exec(key);
        const item = match && (match[1] === 'r2' ? TextbookReview.lessons : TextbookReview.chapters)[Number(match[2])];
        if (!item || !r) return;
        const kind = {lesson:'レッスン', check:'べつのひの たしかめ', chapter:'まとめ'}[r.kind];
        if (!kind) return;
        add('book:' + key, 'book', item.title + (match[1] === 'r2chapter' ? 'の まとめ' : ''), '📘',
          {round, day:r.day, rank:0, text:outcomes(r), label:'さいごの きろく・' + kind,
            note:(r.independent + r.revised + r.supported) + 'もん あそんだね'});
      });
    });
    return Array.from(groups.values()).map(group => {
      group.entries.sort((a, b) => a.day - b.day || a.round - b.round || a.rank - b.rank);
      group.latest = group.entries[group.entries.length - 1];
      return group;
    }).sort((a, b) => b.latest.day - a.latest.day || a.title.localeCompare(b.title, 'ja'));
  }
  function entrySpeech(entry){
    return date(entry.day).speech + '。' + roundText(entry.round) + '。'
      + (entry.label ? entry.label + '。' : '') + entry.text + '。';
  }
  function card(group){
    const latest = group.latest, d = date(latest.day);
    const rounds = Array.from(new Set(group.entries.map(e => e.round))).sort().map(roundText);
    const history = el('div.album-history');
    group.entries.forEach(entry => {
      const ed = date(entry.day);
      history.append(el('div.album-entry', {dataset:{round:entry.round}},
        el('div.album-entry-date', null, el('time', {datetime:ed.iso, text:ed.text}), el('span', {text:roundText(entry.round)})),
        entry.label ? el('small.album-entry-label', {text:entry.label}) : null,
        el('p', {text:entry.text})));
    });
    return el('details.album-card', {dataset:{albumKey:group.key, albumType:group.type}, ontoggle(event){
      $('.album-expand', event.currentTarget).textContent = event.currentTarget.open ? 'きろくを とじる ▴' : 'きろくを みる ▾';
    }},
      el('summary.album-summary', null,
        el('span.album-icon', {text:group.icon, 'aria-hidden':'true'}),
        el('span.album-card-copy', null, el('b', {text:group.title}),
          el('span.album-latest', {text:latest.note || latest.text}),
          el('span.album-date', null, el('time', {datetime:d.iso, text:d.text}),
            rounds.map(text => el('span.album-round', {text}))),
          el('span.album-expand', {text:'きろくを みる ▾'}))),
      el('div.album-card-body', null,
        el('button.album-read.btn.btn-ghost', {type:'button', text:'🔊 きろくを よむ',
          'aria-label':group.title + 'の きろくを よむ', onclick(){
            Sound.sfx.tap(); Sound.say(group.title + '。' + group.entries.map(entrySpeech).join(''), {delay:80});
          }}),
        history,
        group.type !== 'play' ? el('p.album-record-note', {text:'それぞれの しゅうの、さいごに あそんだ きろくだよ'}) : null));
  }
  function render(){
    const all = collect(), entries = selected === 'recent' ? all : all.filter(e => e.type === selected);
    $$('button', filters).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.albumFilter === selected)));
    count.textContent = entries.length ? entries.length + 'この あそびの きろく' : 'この きろくは まだ ないよ';
    clear(cards); cards.scrollTop = 0;
    if (!entries.length) cards.append(el('div.album-empty', {text:all.length
      ? 'ここは まだ からっぽ。ほかの きろくも みられるよ'
      : 'まだ からっぽ。 まずは みるだけでも いいよ 👀'}));
    entries.forEach(group => cards.append(card(group)));
    return entries.length;
  }
  function build(){
    if (node) return node;
    cards = el('div.album-cards');
    count = el('p.album-count', {role:'status', 'aria-live':'polite'});
    filters = el('div.album-filters', {role:'group', 'aria-label':'きろくの しゅるい'});
    FILTERS.forEach(([key, label]) => filters.append(el('button.album-filter', {type:'button', text:label,
      dataset:{albumFilter:key}, 'aria-pressed':String(key === selected), onclick(){
        Sound.sfx.tap(); selected = key; const n = render();
        Sound.say(label + '。' + (n ? n + 'このあそびの記録があるよ。' : 'この記録はまだないよ。'), {delay:80});
      }})));
    node = el('div#progress-album', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'できたアルバム' }),
        speakBtn(() => 'できたことを、いっしょに見てみよう。')),
      el('p.album-intro', { text: 'ちいさな「できた」を あつめたよ' }), filters, count, cards);
    return UI.register('progress-album', node);
  }
  function open(){
    build(); selected = 'recent'; const n = render();
    UI.show('progress-album');
    Sound.say(n ? 'できたことを、いっしょに見てみよう。あそびを選ぶと、記録が見られるよ。'
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
  let node, board, palette, hint, selectedBar, picker, pickerSummary, filterBar, empty, actions;
  let placeButton, removeButton, undoButton, doneButton, selected = null, draft = null, undo = null;
  let filter = 'recent';

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
  function say(text){ hint.textContent = text; Sound.say(text, { delay: 60 }); }
  function stickerButton(k){
    return el('button.world-sticker' + (isTreasure(k) ? '.world-treasure' : '') + (selected === k ? '.selected' : ''), {
      type: 'button', dataset: { worldKey: k }, 'aria-label': itemName(k) + 'を うごかす',
      title: itemName(k) + 'を うごかす',
      onclick(e){ e.stopPropagation(); choose(k); board.focus({ preventScroll: true }); }
    }, itemArt(k));
  }
  // A percentage describes the centre of the card. Its actual artwork, name and
  // round badge must all fit, including when a saved island opens on a phone.
  function safePosition(k, x, y){
    const w = board.clientWidth, h = board.clientHeight;
    if (!w || !h) return { x, y };
    let art = Array.from(board.querySelectorAll('.world-sticker')).find(n => n.dataset.worldKey === k), probe;
    if (!art){
      probe = stickerButton(k); probe.tabIndex = -1; probe.style.visibility = 'hidden';
      board.append(probe); art = probe;
    }
    const edgeX = Math.min(50, (art.offsetWidth / 2 + 5) / w * 100);
    const edgeY = Math.min(50, (art.offsetHeight / 2 + 5) / h * 100);
    if (probe) probe.remove();
    return { x: clamp(x, edgeX, 100 - edgeX), y: clamp(y, edgeY, 100 - edgeY) };
  }
  function fitPlaced(){
    if (!board || !board.clientWidth || !board.clientHeight) return;
    const items = Store.stickerWorld().items;
    board.querySelectorAll('.world-sticker').forEach(n => {
      const k = n.dataset.worldKey, p = items[k];
      if (!p) return;
      const safe = safePosition(k, p.x, p.y);
      n.style.left = safe.x + '%'; n.style.top = safe.y + '%';
      if (Math.abs(safe.x - p.x) > .01 || Math.abs(safe.y - p.y) > .01) Store.putWorldSticker(k, safe.x, safe.y);
    });
    moveCursor();
  }
  function moveCursor(){
    const cursor = board.querySelector('.world-position');
    if (!cursor || !selected || !draft) return;
    draft = safePosition(selected, draft.x, draft.y);
    const placed = Store.stickerWorld().items[selected];
    cursor.hidden = !!placed && Math.abs(placed.x - draft.x) < .01 && Math.abs(placed.y - draft.y) < .01;
    cursor.style.left = draft.x + '%'; cursor.style.top = draft.y + '%';
    board.setAttribute('aria-label', itemName(selected) + 'の おきばしょ。やじるしで うごかして、エンターで おく');
  }
  function paintBoard(){
    const world = Store.stickerWorld(), keys = owned();
    board.className = 'sticker-world-board ' + world.background;
    clear(board);
    board.append(el('span.world-starter.sun', { text: '☀️', 'aria-hidden': 'true' }),
      el('span.world-starter.home', { text: '🏡', 'aria-hidden': 'true' }));
    if (Store.islandJob('boat') && Store.islandJob('boat').completed)
      board.append(el('span.world-job.boat', { text: '⛵️', title: 'つくった ふね' }));
    if (Store.islandJob('snack') && Store.islandJob('snack').completed)
      board.append(el('span.world-job.snack', { text: '🧺', title: 'つくった おやつ' }));
    Object.keys(world.items).filter(k => keys.includes(k)).forEach(k => {
      const p = world.items[k], n = stickerButton(k);
      n.style.left = p.x + '%'; n.style.top = p.y + '%'; board.append(n);
    });
    if (selected && draft) board.append(el('span.world-position', { 'aria-hidden': 'true', text: '＋' }));
    else board.setAttribute('aria-label', 'じぶんの しま。うごかす シールを えらべるよ');
    $$('.world-background', node).forEach(b => b.classList.toggle('selected', b.dataset.background === world.background));
    fitPlaced();
  }
  function updateSelection(){
    clear(selectedBar);
    selectedBar.append(selected
      ? el('div.world-selection', null, itemArt(selected), el('div.world-selection-name', null,
        el('small', { text: 'えらんだ シール' }), el('b', { text: itemName(selected) }),
        Store.ownedStickerPending(selected) ? el('small', { text: 'かりの シール' }) : null))
      : el('b.world-selection-empty', { text: 'すきな シールを かざろう' }));
    selectedBar.append(el('button.btn.world-choose', { type: 'button', text: selected ? 'えらびなおす' : 'シールを えらぶ',
      onclick(){ picker.open = true; picker.scrollIntoView({ block: 'start', behavior: 'auto' });
        const target = palette.querySelector('.selected') || palette.querySelector('button');
        if (target) target.focus({ preventScroll: true }); scrollSelected(); }
    }));
    placeButton.hidden = removeButton.hidden = doneButton.hidden = !selected;
    removeButton.disabled = !selected || !Store.stickerWorld().items[selected];
    placeButton.textContent = selected && Store.stickerWorld().items[selected] ? 'ここに うごかす' : 'ここに おく';
    undoButton.hidden = !undo; actions.hidden = !selected && !undo;
    $$('.world-palette-sticker', palette).forEach(n => {
      const active = n.dataset.worldKey === selected;
      n.classList.toggle('selected', active); n.setAttribute('aria-pressed', String(active));
    });
  }
  function scrollSelected(){
    if (!picker.open) return;
    const tile = palette.querySelector('.selected');
    if (tile) palette.scrollTop = Math.max(0, tile.offsetTop - 6);
  }
  function paintPalette(){
    const world = Store.stickerWorld(), keys = owned();
    // Each lap appends new stickers to its own acquisition list. Keepsakes have
    // no acquisition timestamp, so the recent filter does not invent their age.
    const recent = Store.data.stickers.slice().reverse().map(k => Store.worldKey(k)).filter(k => keys.includes(k)).slice(0, 6);
    const all = keys.slice().reverse();
    const visible = filter === 'recent' ? recent : filter === 'unplaced' ? all.filter(k => !world.items[k]) : all;
    clear(palette);
    visible.forEach(k => palette.append(el('button.world-palette-sticker' + (isTreasure(k) ? '.world-palette-treasure' : '') + (selected === k ? '.selected' : ''), {
      type: 'button', dataset: { worldKey: k }, title: itemName(k) + 'を おく',
      'aria-label': itemName(k) + 'を おく', 'aria-pressed': String(selected === k),
      onclick(){ choose(k); board.focus({ preventScroll: true }); board.scrollIntoView({ block: 'center', behavior: 'auto' }); }
    }, itemArt(k))));
    empty.hidden = visible.length > 0;
    empty.textContent = !keys.length ? 'さいしょの シールを もらったら、ここに おけるよ'
      : filter === 'unplaced' ? 'どの シールも しまに かざってあるよ。「ぜんぶ」から えらびなおせるよ' : 'ここには まだ シールが ないよ';
    pickerSummary.textContent = '🎨 シールを えらぶ（' + keys.length + 'まい）';
    $$('button', filterBar).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
  }
  function choose(k){
    if (!owned().includes(k)) return;
    selected = k; draft = Store.stickerWorld().items[k] || { x: 50, y: 50 };
    picker.open = false; paintBoard(); updateSelection();
    say(itemName(k) + '。しまを タップするか、やじるしで ばしょを えらぼう');
    Sound.sfx.tap();
  }
  function place(x, y){
    if (!selected || !owned().includes(selected)) return;
    const before = Store.stickerWorld().items[selected] || null, p = safePosition(selected, x, y);
    if (before && Math.abs(before.x - p.x) < .01 && Math.abs(before.y - p.y) < .01){
      say('ここに かざってあるよ。できあがりなら「できあがり」を おしてね'); return;
    }
    if (!Store.putWorldSticker(selected, p.x, p.y)) return;
    undo = { key: selected, before }; draft = p;
    Sound.sfx.place(); paintBoard(); paintPalette(); updateSelection();
    say('おけたね。うごかしたり、ひとつ もどしたり できるよ');
  }
  function undoEdit(){
    if (!undo) return;
    const previous = undo; undo = null;
    if (previous.background) Store.setStickerWorldBackground(previous.background);
    else if (owned().includes(previous.key)){
      if (previous.before) Store.putWorldSticker(previous.key, previous.before.x, previous.before.y);
      else Store.removeWorldSticker(previous.key);
      selected = previous.key; draft = previous.before || { x: 50, y: 50 };
    }
    paintBoard(); paintPalette(); updateSelection(); say('ひとつ もどしたよ');
  }
  function build(){
    if (node) return node;
    board = el('div.sticker-world-board', { role: 'application', tabindex: '0', 'aria-label': 'じぶんの しま',
      'aria-describedby': 'world-instructions',
      onkeydown(e){
        if (e.target !== board || !selected || !draft) return;
        const step = e.shiftKey ? 10 : 5;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (delta){ e.preventDefault(); draft = safePosition(selected, draft.x + delta[0], draft.y + delta[1]); moveCursor(); }
        else if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); place(draft.x, draft.y); }
      }
    });
    palette = el('div.sticker-world-palette', { 'aria-label': 'かざれる シール' });
    hint = el('div#world-instructions.sticker-world-hint', { role: 'status', 'aria-live': 'polite' });
    selectedBar = el('div.world-selected');
    empty = el('p.world-picker-empty'); filterBar = el('div.world-picker-filters', { 'aria-label': 'シールの えらびかた' });
    [{ id: 'recent', label: 'さいきん もらった' }, { id: 'unplaced', label: 'まだ かざっていない' }, { id: 'all', label: 'ぜんぶ' }].forEach(f =>
      filterBar.append(el('button.btn', { type: 'button', text: f.label, dataset: { filter: f.id },
        onclick(){ filter = f.id; paintPalette(); palette.scrollTop = 0; Sound.sfx.tap(); }
      })));
    pickerSummary = el('summary');
    picker = el('details.world-picker', { ontoggle(){ if (picker.open) scrollSelected(); } }, pickerSummary, filterBar, palette, empty);
    placeButton = el('button.btn.btn-accent.world-place', { type: 'button', onclick(){ if (draft) place(draft.x, draft.y); } });
    removeButton = el('button.btn.world-remove', { type: 'button', text: '📦 しまう', onclick(){
      const before = selected && Store.stickerWorld().items[selected];
      if (!before || !Store.removeWorldSticker(selected)) return;
      undo = { key: selected, before }; draft = { x: 50, y: 50 };
      paintBoard(); paintPalette(); updateSelection(); say('シールを しまったよ。また かざれるよ');
    } });
    undoButton = el('button.btn.world-undo', { type: 'button', text: '↶ ひとつ もどす', onclick: undoEdit });
    doneButton = el('button.btn.world-done', { type: 'button', text: '✨ できあがり', onclick(){
      selected = null; draft = null; picker.open = false; paintBoard(); updateSelection();
      say('すてきな しまに なったね。また いつでも かざれるよ');
    } });
    actions = el('div.world-edit-actions', null, placeButton, removeButton, undoButton, doneButton);
    board.onclick = e => {
      if (e.target.closest('.world-sticker')) return;
      if (!selected){
        say('「シールを えらぶ」から、かざしたい シールを えらんでね');
        return;
      }
      const r = board.getBoundingClientRect();
      place((e.clientX - r.left - board.clientLeft) / board.clientWidth * 100,
        (e.clientY - r.top - board.clientTop) / board.clientHeight * 100);
    };
    node = el('div#sticker-world', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'じぶんの しま' }),
        speakBtn(() => '集めたシールや宝物を、好きな場所に置けるよ。シールを選んで、島をタップしよう。矢印で動かして、エンターでも置けるよ。')),
      el('div.world-workspace', null, selectedBar, board, hint, actions, picker,
      el('details.world-other-tools', null, el('summary', { text: '🌳 ばしょ・しまの おしごと' }),
      el('div.sticker-world-tools', null,
        el('span', { text: 'ばしょを えらぶ' }),
        BACKGROUNDS.map(bg => el('button.world-background', { type: 'button', dataset: { background: bg.id },
          onclick(){
            const before = Store.stickerWorld().background;
            if (before !== bg.id){ undo = { background: before }; Store.setStickerWorldBackground(bg.id); }
            Sound.sfx.tap(); paintBoard(); updateSelection();
          }
        }, bg.icon + ' ' + bg.label)),
        el('button.btn.btn-accent.world-job-open', { type: 'button',
          onclick(){ Sound.sfx.tap(); IslandJobs.open(); } }, '⛵️ しまの おしごと')))));
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitPlaced).observe(board);
    return UI.register('sticker-world', node);
  }
  function render(){
    build();
    if (selected && !owned().includes(selected)){ selected = null; draft = null; undo = null; }
    paintBoard(); paintPalette(); updateSelection();
    hint.textContent = selected ? 'しまを タップ。やじるしと エンターでも おけるよ'
      : '「シールを えらぶ」から、すきな シールを えらぼう';
  }
  function open(item){
    if (item) item = Store.worldKey(item);
    undo = null;
    if (item && owned().includes(item)){
      selected = item; draft = Store.stickerWorld().items[item] || { x: 50, y: 50 }; filter = 'all';
    }
    render(); UI.show('sticker-world');
    picker.open = !selected;
    requestAnimationFrame(() => { if (!node.hidden){ fitPlaced(); scrollSelected(); } });
    Sound.say(item && selected === item ? itemName(item) + 'を、島の好きな場所に置いてね。'
      : '自分の島だよ。集めたシールや宝物を、好きな場所に置けるよ。', { delay: 150 });
  }
  return { build, render, open };
})();
