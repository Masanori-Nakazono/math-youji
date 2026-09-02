/* ===========================================================
   05 — game registry & session runner
   =========================================================== */
'use strict';

const Games = {
  list: [],
  byId: {},
  add(def){ this.list.push(def); this.byId[def.id] = def; return def; }
};

const WORLDS = [
  { id: 'shima', name: 'かずの しま',    sub: 'かぞえる・すうじ',       color: 'var(--c-blue)' },
  { id: 'umi',   name: 'くらべる うみ',  sub: 'くらべる・じゅんばん',   color: 'var(--c-green)' },
  { id: 'yama',  name: 'けいさんの やま', sub: 'あわせる・のこりは',    color: 'var(--c-red)' },
  { id: 'mori',  name: 'かたちの もり',  sub: 'かたち・きまり・とけい', color: 'var(--c-purple)' }
];

const STICKER_POOL = ['🐰','🐻','🐼','🦊','🐯','🦁','🐨','🐸','🐵','🐧','🐤','🦉','🦄','🐢','🐬','🐳','🦋','🐝','🐞','🦕','🦖','🐙','🦀','🐡','🐘','🦒','🦓','🦔','🐿','🦥','🐠','🐟','🦈','🐌','🐛','🕊','🦩','🦜','🐴','🐑','🌻','🌸','🌈','🍎','🍓','🍇','🍑','🍉','🍌','🥕','🌽','🍄','🍒','🥝','🍍','🥥','🌷','🌼','🌺','🍀','🍰','🧁','🍩','🎂','🍬','🍭','🍦','🍪','🍫','🥐','🚀','🚂','⛵️','🎈','🎁','🏆','👑','💎','🔔','🎨','🎺','🪁','🧸','🪀','🎏','🎐','🛼','🎠','🎪','🏰','⚽️','🏀','🎾','🥁','🎹','⭐️','🌙','☀️','⛄️','🌟'];
/* Stickers are handed out by slot position, not by hash, so no level shares an
   emoji with another while the pool is large enough. */
let STICKER_INDEX = null;
function stickerSlots(){
  if (STICKER_INDEX) return STICKER_INDEX;
  STICKER_INDEX = {};
  let i = 0;
  Games.list.forEach(g => g.levels.forEach((lv, li) => {
    STICKER_INDEX[g.id + ':' + li] = i++;
    STICKER_INDEX[g.id + ':' + li + ':g'] = i++;
  }));
  return STICKER_INDEX;
}
function stickerFor(key){
  const slots = stickerSlots();
  if (key in slots) return STICKER_POOL[slots[key] % STICKER_POOL.length];
  let h = 0;                                   // daily-streak stickers etc.
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return STICKER_POOL[h % STICKER_POOL.length];
}

const Session = (() => {
  let node, titleEl, pipsEl, promptTxt, fieldEl, choicesEl, speakBtn, moodEl, feedbackEl;
  let plan = [];          // [{game, level, levelIndex}]
  let idx = 0, mistakes = 0, firstTryRight = 0, wrongThisQ = 0;
  let locked = false, mode = 'level', curGame = null, curLevelIdx = 0;
  let hintBtns = [], hintFn = null, hintShown = false, lastSpeech = '';
  /* What this question is *about*. Every generator names its item, so the app can
     avoid asking the same fact twice in one sitting, steer toward the facts this
     child keeps missing, and tell the parent which ones they are. */
  let curItem = null, curLabel = null;
  let usedItems = new Set();      // the shuffle bag for the current session
  let shaky = [];                 // facts missed this session, for the result screen

  /* ---------- timer lifecycle ----------
     Every delayed callback in a question is tied to an epoch. Leaving a question
     (next question, quit, a new level) bumps the epoch and clears the pending
     timers, so a slow animation from the previous question can never write into
     the current one — or, worse, answer it. */
  let epoch = 0;
  const timers = new Map();          // id -> { fn, epoch }, so tests can run them on demand
  function later(fn, ms){
    const mine = epoch;
    const id = setTimeout(() => { timers.delete(id); if (mine === epoch) fn(); }, ms);
    timers.set(id, { fn, epoch: mine });
    return id;
  }
  function killTimers(){
    epoch++;
    timers.forEach((v, id) => clearTimeout(id));
    timers.clear();
  }

  /** Test seam: run every pending question timer now instead of waiting for it.
      Lets the regression suite check what happens *after* an answer, which is where
      the interaction bugs live. */
  function flushTimers(limit){
    let ran = 0;
    for (let pass = 0; pass < (limit || 12) && timers.size; pass++){
      const due = Array.from(timers.entries());
      due.forEach(([id, t]) => { clearTimeout(id); timers.delete(id); if (t.epoch === epoch){ t.fn(); ran++; } });
    }
    return ran;
  }

  function build(){
    if (node) return node;
    titleEl   = el('h2');
    pipsEl    = el('div.pips');
    promptTxt = el('div.txt');
    fieldEl   = el('div.playfield');
    choicesEl = el('div.choices');
    feedbackEl = el('div.feedback', { hidden: true });
    speakBtn  = el('button.btn.btn-ghost.btn-round', {
      'aria-label': 'もういちど きく', title: 'もういちど きく',
      onclick(){ Sound.sfx.tap(); if (lastSpeech) Sound.say(lastSpeech, { delay: 40 }); }
    }, '🔊');
    moodEl = mascotSVG('idle', 'talk');
    moodEl.style.width = 'calc(var(--u)*4.6)';
    moodEl.style.height = 'calc(var(--u)*4.6)';

    node = el('div#play', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round.backbtn', { 'aria-label': 'もどる', onclick: quit }, '←'),
        titleEl, pipsEl),
      el('div.prompt', null, moodEl,
        el('div.txtwrap', null, promptTxt, feedbackEl), speakBtn),
      fieldEl, choicesEl);
    return UI.register('play', node);
  }

  function setMood(m){
    const fresh = mascotSVG(m, m === 'cheer' ? 'cheer' : 'talk');
    fresh.style.width = 'calc(var(--u)*4.6)';
    fresh.style.height = 'calc(var(--u)*4.6)';
    moodEl.replaceWith(fresh);
    moodEl = fresh;
  }

  /** Wrong answers have to be visible, not just audible: a device with no
      Japanese voice must still show the child that something happened. */
  function showFeedback(kind, text){
    feedbackEl.hidden = false;
    feedbackEl.className = 'feedback ' + kind;
    clear(feedbackEl);
    feedbackEl.append(el('span.mk', { text: kind === 'oops' ? '？' : '💡' }), text);
    feedbackEl.animate
      && feedbackEl.animate([{ transform: 'translateX(-.4em)' }, { transform: 'none' }], { duration: 260 });
  }
  function clearFeedback(){ feedbackEl.hidden = true; clear(feedbackEl); }

  function quit(){
    killTimers();
    Sound.hush();
    Sound.sfx.tap();
    if (mode === 'daily') Home.render(); else Levels.render(curGame);
    UI.show(mode === 'daily' ? 'home' : 'levels', { replace: true });
  }

  /* ---------- public entry points ---------- */
  function startLevel(game, levelIndex){
    build();
    killTimers();
    mode = 'level'; curGame = game; curLevelIdx = levelIndex;
    const lv = game.levels[levelIndex];
    const n = lv.n || 8;
    plan = [];
    for (let i = 0; i < n; i++) plan.push({ game, level: lv, levelIndex });
    titleEl.textContent = game.name + '　' + lv.t;
    begin();
  }

  function startDaily(count){
    build();
    killTimers();
    mode = 'daily'; curGame = null;
    const pool = [];
    Games.list.forEach(g => {
      g.levels.forEach((lv, i) => {
        if (Store.levelUnlocked(g.id, i)) pool.push({ game: g, level: lv, levelIndex: i });
      });
    });
    if (!pool.length){                       // nothing unlocked yet — never leave an empty plan
      Home.render();
      UI.show('home', { replace: true });
      return;
    }
    const n = count || 10;
    plan = drawDailyPlan(pool, n);
    titleEl.textContent = 'きょうの れんしゅう';
    begin();
  }

  /** How badly this child needs this level today.
      The old round-robin handed every game the same ~0.66 questions a day whether
      the child was at 10% or 97%, which made the daily set a sampler rather than
      practice. This is the same 10 questions, aimed. */
  function dailyWeight(p){
    const acc  = Store.recentAccuracy(p.game.id, p.levelIndex);
    const need = acc == null ? 1 : 1 - acc;                    // 0 solid … 1 struggling
    const cold = Math.min(1, Store.daysSince(p.game.id, p.levelIndex) / 14);
    const focus = p.game.focus || 1;                           // curriculum priority
    const done  = Store.stars(p.game.id, p.levelIndex) >= 3 ? 0.45 : 1;
    return (0.35 + need * 1.6 + cold * 0.8) * focus * done;
  }

  function drawDailyPlan(pool, n){
    const bag = pool.map(p => ({ p, w: dailyWeight(p) }));
    const out = [], perGame = {}, perLevel = {};
    // caps keep an aimed set from turning into a single-topic grind, and keep the
    // ten questions coming from at least four different games
    const MAX_GAME = 3, MAX_LEVEL = 2;
    for (let guard = 0; out.length < n && guard < n * 40; guard++){
      let total = 0;
      for (const x of bag) total += x.w;
      if (total <= 0) break;
      let r = Math.random() * total, hit = null;
      for (const x of bag){ r -= x.w; if (r <= 0){ hit = x; break; } }
      if (!hit) break;
      const gid = hit.p.game.id, lk = gid + ':' + hit.p.levelIndex;
      if ((perGame[gid] || 0) >= MAX_GAME || (perLevel[lk] || 0) >= MAX_LEVEL){ hit.w = 0; continue; }
      perGame[gid] = (perGame[gid] || 0) + 1;
      perLevel[lk] = (perLevel[lk] || 0) + 1;
      hit.w *= 0.45;                       // taper, so the weakest topic leads without owning the set
      out.push(hit.p);
    }
    while (out.length < n) out.push(pool[ri(0, pool.length - 1)]);
    return shuffle(out);                   // interleave: the same topic should not run in a block
  }

  function begin(){
    idx = 0; mistakes = 0; firstTryRight = 0;
    usedItems = new Set(); shaky = [];
    clear(pipsEl);
    plan.forEach(() => pipsEl.append(el('div.pip')));
    UI.show('play');
    nextQuestion();
  }

  /* ---------- question lifecycle ---------- */
  function api(){
    const mine = epoch;
    const stale = () => mine !== epoch;
    const a = {
      field: fieldEl,
      choices: choicesEl,
      level: plan[idx].level,
      levelIndex: plan[idx].levelIndex,
      game: plan[idx].game,
      setPrompt(html, speech){
        if (stale()) return;
        promptTxt.innerHTML = html;
        lastSpeech = speech != null ? speech : String(html).replace(/<[^>]*>/g, '');
        Sound.say(lastSpeech, { delay: 220 });
      },
      say(t, o){ if (stale()) return; lastSpeech = t; Sound.say(t, o); },
      /** Name the fact this question asks. `label` is what the result screen and
          the parent page will call it. Optional: a game that names nothing simply
          keeps the old purely-random behaviour. */
      item(key, label){
        if (stale() || key == null) return;
        curItem = a.game.id + ':' + key;
        curLabel = label || null;
      },
      onHint(fn){ if (!stale()) hintFn = fn; },
      correct(o){ if (!stale()) onCorrect(o || {}); },
      wrong(target){ if (!stale()) onWrong(target); },
      /** delayed work that dies with the question */
      later(fn, ms){ return later(fn, ms); },
      get locked(){ return locked; },

      /** Big tappable answer buttons.
          opts.onPick(value, button) runs on a correct pick; returning false keeps
          the question open (used by questions that ask for several answers). */
      buildChoices(values, answer, opts){
        if (stale()) return choicesEl;
        const o = opts || {};
        clear(choicesEl);
        choicesEl.dataset.built = '1';
        hintBtns = [];
        values.forEach(v => {
          const val = (v && typeof v === 'object' && 'v' in v) ? v.v : v;
          const b = el('button.choice' + (o.cls ? '.' + o.cls : ''), { type: 'button' });
          const content = o.render ? o.render(val, v) : String(val);
          if (content && content.nodeType) b.append(content); else b.textContent = content;
          const hit = o.match ? o.match(val, answer) : val === answer;
          b.addEventListener('click', () => {
            if (locked || stale()) return;
            if (hit){
              b.classList.add('correct');
              $$('.choice', choicesEl).forEach(x => { if (x !== b) x.disabled = true; });
              if (o.onPick && o.onPick(val, b) === false) return;
              a.correct(o.correctOpts);
            } else {
              b.classList.add('wrong', 'tried');
              later(() => b.classList.remove('wrong'), 460);
              a.wrong(b);
            }
          });
          if (!hit) hintBtns.push(b);
          choicesEl.append(b);
        });
        return choicesEl;
      }
    };
    return a;
  }

  function resetSurface(){
    locked = false; hintBtns = []; hintFn = null; hintShown = false;
    curItem = null; curLabel = null;
    clear(fieldEl); clear(choicesEl); delete choicesEl.dataset.built; clearFeedback();
    fieldEl.className = 'playfield';
  }

  /* How hard to look for a better question before settling.
     TRIES builds are cheap (the whole build-storm test does 25 per level), and a
     rejected build dies with its epoch, so nothing it scheduled can survive. */
  const TRIES = 6, PICKY = 3, DUE_ENOUGH = 0.55;

  /** Draw a question, re-rolling to avoid repeating a fact and to favour the ones
      this child owes practice to. The generator is random, so we cannot go back to
      an earlier draw — we accept the one that is on screen when we stop. */
  function drawQuestion(step){
    for (let t = 0; t < TRIES; t++){
      killTimers();
      resetSurface();
      try{
        step.level.make(api());
      }catch(err){
        console.error('question build failed', err);
        promptTxt.textContent = 'よみこみに しっぱいしました';
        return;
      }
      if (!curItem) return;                      // this game does not name its items
      if (t === TRIES - 1){
        // the bag is empty (every fact has come up already): start a fresh pass
        if (usedItems.has(curItem)) usedItems.clear();
        usedItems.add(curItem);
        return;
      }
      if (usedItems.has(curItem)) continue;
      if (t >= PICKY || Store.factDue(curItem) >= DUE_ENOUGH){
        usedItems.add(curItem);
        return;
      }
    }
  }

  function nextQuestion(){
    killTimers();
    wrongThisQ = 0;
    $$('.pip', pipsEl).forEach((p, i) => p.classList.toggle('now', i === idx));
    setMood('idle');
    const step = plan[idx];
    if (mode === 'daily') titleEl.textContent = 'きょうの れんしゅう　' + step.game.name;
    drawQuestion(step);
  }

  function onWrong(target){
    if (locked) return;
    wrongThisQ++;
    mistakes++;
    Sound.sfx.wrong();
    setMood('soft');
    if (target && target.classList){
      target.classList.add('wrong');
      later(() => target.classList.remove('wrong'), 460);
    }
    if (wrongThisQ === 1){
      showFeedback('oops', 'もういちど やってみよう');
      Sound.say('おしいね。もういちど やってみよう', { delay: 260 });
    } else if (wrongThisQ >= 2){
      // The game's own hint is preferred, but the choice-dimming fallback runs too:
      // a hint that only speaks would leave a muted device with no feedback at all.
      if (!hintShown){
        hintShown = true;
        showFeedback('hint', 'ヒントを だすね');
        Sound.say('ヒントを だすね', { delay: 260 });
        if (hintFn){ try{ hintFn(wrongThisQ); }catch(e){ console.error('hint failed', e); } }
      }
      const live = hintBtns.filter(b => !b.classList.contains('dim'));
      if (live.length > 1) live[ri(0, live.length - 1)].classList.add('dim');
    }
  }

  function onCorrect(o){
    if (locked) return;
    locked = true;
    clearFeedback();
    const clean = wrongThisQ === 0;
    if (clean) firstTryRight++;
    Store.noteOutcome(plan[idx].game.id, plan[idx].levelIndex, clean);
    if (curItem){
      Store.noteFact(curItem, clean);
      if (!clean && !shaky.some(x => x.key === curItem)){
        shaky.push({ key: curItem, label: curLabel || plan[idx].game.name });
      }
    }
    Sound.sfx.correct();
    setMood('happy');
    const pip = $$('.pip', pipsEl)[idx];
    if (pip){ pip.classList.remove('now'); pip.classList.add(wrongThisQ === 0 ? 'done' : 'miss'); }
    if (!o.quiet){
      UI.bigMark('◯');
      const praise = wrongThisQ === 0
        ? pick(['やったね', 'せいかい', 'すごい', 'じょうずだね', 'ばっちり', 'その ちょうし'])
        : pick(['できたね', 'よく がんばったね', 'そのとおり']);
      Sound.say(praise, { delay: 320 });
    }
    if ((idx + 1) % 4 === 0) UI.confetti(22);
    later(() => {
      idx++;
      if (idx >= plan.length) finish();
      else nextQuestion();
    }, o.delay || 950);
  }

  function finish(){
    killTimers();
    Sound.sfx.finish();
    UI.confetti(60);
    const total = plan.length;
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    let newSticker = null;
    if (mode === 'level'){
      const key = curGame.id + ':' + curLevelIdx;
      Store.recordLevel(curGame.id, curLevelIdx, stars, firstTryRight, total);
      if (Store.addSticker(key)) newSticker = { emoji: stickerFor(key), gold: stars === 3 };
      else if (stars === 3 && Store.addSticker(key + ':g')){
        newSticker = { emoji: stickerFor(key + ':g'), gold: true };
      }
    } else {
      Store.recordPractice(firstTryRight, total);
      const key = 'daily:' + Store.todayKey();   // one sticker per calendar day
      if (Store.addSticker(key)) newSticker = { emoji: stickerFor(key), gold: stars === 3 };
    }
    Result.show({ stars, right: firstTryRight, total, mode, game: curGame, levelIndex: curLevelIdx,
                  sticker: newSticker, shaky: shaky.slice(0, 3) });
  }

  return {
    startLevel, startDaily, build,
    _test: {
      flushTimers,
      get idx(){ return idx; },
      get planLength(){ return plan.length; },
      get planGames(){ return plan.map(p => p.game.id + ':' + p.levelIndex); },
      get item(){ return curItem; },
      get shaky(){ return shaky.slice(); },
      get locked(){ return locked; },
      get mistakes(){ return mistakes; },
      get pending(){ return timers.size; },
      get mode(){ return mode; }
    }
  };
})();
