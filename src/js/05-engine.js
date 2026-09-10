/* ===========================================================
   05 — game registry & session runner
   =========================================================== */
'use strict';

const Games = {
  list: [],
  byId: {},
  add(def){ this.list.push(def); this.byId[def.id] = def; return def; }
};

/* `stage` says which half of the app a world belongs to. Everything the app
   shipped with is 入学前 ('pre'); 'g1' is the 小学1年生 classroom, which stays shut
   until every 入学前 level is cleared. A world with no stage is 'pre', so nothing that
   existed before has to say so. */
const WORLDS = [
  { id: 'shima', name: 'かずの しま',    sub: 'かぞえる・すうじ',       color: 'var(--c-blue)' },
  { id: 'umi',   name: 'くらべる うみ',  sub: 'くらべる・じゅんばん',   color: 'var(--c-green)' },
  { id: 'yama',  name: 'けいさんの やま', sub: 'あわせる・のこりは',    color: 'var(--c-red)' },
  { id: 'mori',  name: 'かたちの もり',  sub: 'かたち・きまり・とけい', color: 'var(--c-purple)' },
  { id: 'kyoshitsu', name: '1ねんせいの きょうしつ', sub: 'なかま・1たい1・20までの かず・しき',
    color: 'var(--c-orange)', stage: 'g1' }
];

const STICKER_POOL = ['🐰','🐻','🐼','🦊','🐯','🦁','🐨','🐸','🐵','🐧','🐤','🦉','🦄','🐢','🐬','🐳','🦋','🐝','🐞','🦕','🦖','🐙','🦀','🐡','🐘','🦒','🦓','🦔','🐿','🦥','🐠','🐟','🦈','🐌','🐛','🕊','🦩','🦜','🐴','🐑','🌻','🌸','🌈','🍎','🍓','🍇','🍑','🍉','🍌','🥕','🌽','🍄','🍒','🥝','🍍','🥥','🌷','🌼','🌺','🍀','🍰','🧁','🍩','🎂','🍬','🍭','🍦','🍪','🍫','🥐','🚀','🚂','⛵️','🎈','🎁','🏆','👑','💎','🔔','🎨','🎺','🪁','🧸','🪀','🎏','🎐','🛼','🎠','🎪','🏰','⚽️','🏀','🎾','🥁','🎹','⭐️','🌙','☀️','⛄️','🌟',
/* the 小1 classroom adds 12 levels, and a sticker slot must never reuse an emoji another slot already has */
'🦭','🦦','🦫','🦃','🕊️','🦚','🦢','🐖','🐄','🦌','🐫','🦙','🐊','🦎','🦂','🪰','🍋','🍈','🥭','🫐','🍅','🥦','🌰','🥨','🍿','🍮','🍯','🧃','🎃','🎄','🪗','🪄','🧭','🔭','🎲','🪩','🛴','🚁','🚤','🗿'];
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

/* ===========================================================
   stages — what has to be finished before 小学1年生 opens
   ===========================================================
   The 入学前 half of the app is 48 levels and 96 sticker slots: one sticker for
   clearing a level, a gold one for clearing it with every answer right first time.
   Clearing all 48 — the plain stickers — is the 小1 classroom's entrance
   requirement, so the goal a child is already working towards is the same goal
   that opens the next room: no separate test, no adult judgement.

   The gold stickers are NOT part of the key. Each one needs a run with every
   answer right first time, and needing forty-eight of those put the classroom
   somewhere around the three-hundredth day of use for a child working at the
   pace this app recommends (one level a day) — which is to say, after 1年生 had
   already started, and after the material in the classroom had stopped being
   preparation. They stay on the shelf as something to come back for; they are
   not a door the child has to get through.

   Two things this deliberately does NOT do. It never counts 小1's own stickers
   (that would be circular), and it never *closes* again: a shelf cannot lose a
   sticker, but a future release could add a 入学前 level, and a child who walked
   through the door must not find it locked afterwards. */
const Progress = (() => {
  const stageOf = g => g.stage || 'pre';

  /** every sticker slot belonging to one stage, plain and gold — what the book draws */
  function slots(stage){
    const out = [];
    Games.list.forEach(g => {
      if (stageOf(g) !== stage) return;
      g.levels.forEach((lv, i) => out.push(g.id + ':' + i, g.id + ':' + i + ':g'));
    });
    return out;
  }

  /** the slots the door actually counts: one per level, earned by clearing it */
  function gateSlots(stage){
    const out = [];
    Games.list.forEach(g => {
      if (stageOf(g) !== stage) return;
      g.levels.forEach((lv, i) => out.push(g.id + ':' + i));
    });
    return out;
  }

  function count(stage){
    const all = gateSlots(stage);
    let got = 0;
    all.forEach(k => { if (Store.hasSticker(k)) got++; });
    return { got, total: all.length };
  }

  /** true once every 入学前 level is cleared — or once a parent opened the door by hand */
  function g1Open(){
    if (Store.data.g1Open) return true;
    const c = count('pre');
    return c.total > 0 && c.got >= c.total;
  }

  return {
    stageOf,
    slots,
    gateSlots,
    /** { got, total } over the levels the door counts — cleared levels, not stickers */
    preStickers: () => count('pre'),
    g1Open,
    /** opened by hand from the parent page; never reversible */
    openG1(){ Store.setPref('g1Open', true); }
  };
})();

/** Is this game's half of the app open at all? */
function stageOpen(g){ return Progress.stageOf(g) === 'pre' || Progress.g1Open(); }
/** The gate every question-drawing surface asks: open stage AND unlocked level. */
function levelOpen(g, i){ return stageOpen(g) && Store.levelUnlocked(g.id, i); }

const Session = (() => {
  let node, titleEl, pipsEl, promptTxt, fieldEl, choicesEl, speakBtn, backBtn, moodEl, feedbackEl;
  let refit = () => {};
  let plan = [];          // [{game, level, levelIndex}]
  let idx = 0, mistakes = 0, firstTryRight = 0, wrongThisQ = 0;
  let locked = false, mode = 'level', curGame = null, curLevelIdx = 0;
  let hintBtns = [], hintFn = null, hintExtras = [], hintShown = false, lastSpeech = '';
  /* Most questions keep their hint back until a second mistake, so the child
     gets a real second try first. A question whose picture is already hidden
     (ぱっと みて いくつ) has nothing to try with: 「もういちど」 over a covered
     board is an invitation to guess. Those games ask for their hint at 1. */
  let hintAfter = 2, extrasShown = false;
  /* ---------- the help ladder ----------
     One hint used to be the whole of it. After that the screen stopped answering:
     the game's own hint fires once, and the choice-dimming fallback only has
     something to dim when the question was built with `buildChoices` — 28 of the
     60 levels never build one (every keypad, every hand-made answer surface), so
     the third, fourth and fifth mistake there changed nothing at all, down to the
     pixel, with the speech bubble still reading「ヒントを だすね」.

     Now every mistake past the first moves something, and the bottom of the ladder
     is a way out: 「こたえを みる」 appears, and if it is not taken the app takes it
     itself. Reaching the answer that way is recorded as `taught` — it is not a
     first-try success, it does not earn ★, and 「にがて あつめ」 comes back for it.
     Same reasoning as「3回まじめに挑戦すれば次のレベルは開く」: a five-year-old must
     never be left in front of a door they cannot move. */
  const STRONG_AFTER = 2, TEACH_AFTER = 4;   // mistakes past the game's own hint
  let hintStrongFns = [], showFn = null, answerBtn = null, answerText = null, taught = false;
  /* What this question is *about*. Every generator names its item, so the app can
     avoid asking the same fact twice in one sitting, steer toward the facts this
     child keeps missing, and tell the parent which ones they are. */
  let curItem = null, curLabel = null;
  /* What the answer was, and what kind of wrong the first mistake was. Right/wrong
     is one bit; it cannot separate 「見えている方を言った」 from 「1つ ずれた」, and those
     are different children. See 06-miss.js. */
  let curAnswer = null, missType = null;
  let focusKeys = [];             // the facts a 集中練習 session is aimed at
  /* ---------- how long the answer took ----------
     けいさんの やま is named for「考えずに言える」— an answer that arrives rather than
     one that is worked out. Right-first-time cannot tell those apart: a child who
     counts eight empty cells for nine seconds and a child who remembers both score a
     clean answer, and only the second makes a carry sum fast. So time the first
     response, and only where speed is actually the goal (`game.fluent`). */
  let askedAt = 0, respondedMs = null, swiftCount = 0;
  function markResponse(){
    if (respondedMs == null && askedAt) respondedMs = Math.round(performance.now() - askedAt);
  }
  let usedItems = new Set();      // the shuffle bag for the current session
  let shaky = [];                 // facts missed this session, for the result screen
  let sessionOutcomes = [];       // [{ gameId, levelIndex, clean }] for diagnostic/recommendation
  let quitArmed = false, quitTimer = null;

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
    promptTxt = el('div.txt', { 'aria-live': 'polite', 'aria-atomic': 'true' });
    fieldEl   = el('div.playfield');
    choicesEl = el('div.choices');
    feedbackEl = el('div.feedback', {
      hidden: true, 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status'
    });
    speakBtn  = el('button.btn.btn-ghost.btn-round', {
      'aria-label': 'もういちど きく', title: 'もういちど きく',
      onclick(){ Sound.sfx.tap(); if (lastSpeech) Sound.say(lastSpeech, { delay: 40 }); }
    }, '🔊');
    moodEl = mascotSVG('idle', 'talk');
    moodEl.style.width = 'calc(var(--u)*4.6)';
    moodEl.style.height = 'calc(var(--u)*4.6)';

    backBtn = el('button.btn.btn-ghost.btn-round.backbtn', {
      'aria-label': 'もどる', onclick: quit
    }, '←');
    node = el('div#play', null,
      el('div.topbar', null,
        backBtn,
        titleEl, pipsEl),
      el('div.prompt', null, moodEl,
        el('div.txtwrap', null, promptTxt, feedbackEl), speakBtn),
      fieldEl, choicesEl);
    UI.register('play', node);
    refit = UI.watchFit(fieldEl);
    return node;
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
  function showFeedback(kind, text, extra){
    feedbackEl.hidden = false;
    feedbackEl.className = 'feedback ' + kind;
    clear(feedbackEl);
    feedbackEl.append(el('span.mk', { text: kind === 'oops' ? '？' : '💡' }), text);
    if (extra) feedbackEl.append(extra);
    feedbackEl.animate
      && feedbackEl.animate([{ transform: 'translateX(-.4em)' }, { transform: 'none' }], { duration: 260 });
  }
  function clearFeedback(){ feedbackEl.hidden = true; clear(feedbackEl); }
  function disarmQuit(){
    quitArmed = false;
    clearTimeout(quitTimer);
    if (backBtn){
      backBtn.textContent = '←';
      backBtn.setAttribute('aria-label', 'もどる');
    }
  }

  function quit(){
    if (!quitArmed){
      quitArmed = true;
      backBtn.textContent = '？';
      backBtn.setAttribute('aria-label', 'もういちど おすと おわる');
      showFeedback('oops', 'もういちど おすと おわるよ');
      clearTimeout(quitTimer);
      quitTimer = setTimeout(() => {
        disarmQuit();
        clearFeedback();
      }, 2600);
      return;
    }
    disarmQuit();
    killTimers();
    Sound.hush();
    Sound.sfx.tap();
    if (mode === 'level') Levels.render(curGame); else Home.render();
    UI.show(mode === 'level' ? 'levels' : 'home', { replace: true });
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
        if (levelOpen(g, i)) pool.push({ game: g, level: lv, levelIndex: i });
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

  /** A short first-run sampler. It chooses a starting point; it never locks content
      or labels a child. Every game remains available from Home. */
  function startDiagnostic(){
    build();
    killTimers();
    mode = 'diagnostic'; curGame = null;
    const picks = [
      ['count', 0], ['numeral', 0], ['seq', 0], ['compare', 0], ['ordinal', 0],
      ['measure', 0], ['bond', 0], ['shape', 0], ['pattern', 0], ['clock', 0]
    ];
    plan = picks.map(([id, levelIndex]) => {
      const game = Games.byId[id];
      return game && game.levels[levelIndex]
        ? { game, level: game.levels[levelIndex], levelIndex }
        : null;
    }).filter(Boolean);
    titleEl.textContent = 'はじめの ぼうけん';
    begin();
  }

  /* Three or four facts, ten questions: enough for each of them to come round
     several times in one sitting. More than four and it is another sampler. */
  const MAX_FOCUS_FACTS = 4;

  /** Practise the handful of facts this child keeps missing, several times each.

      きょうの れんしゅう is a *review* instrument: ten questions spread over every
      unlocked level. Measured over three weeks, that gives one particular fact
      —「4と6で10」— about one turn a fortnight, and leaves two or three of the nine
      make-ten facts untouched entirely. Nothing in the app could ask the same fact
      twice in one sitting, because the shuffle bag that stops a level repeating
      itself also stops it concentrating. This is the other half of the pair: the
      bag is drawn from the weak set instead of from the level. */
  function startFocus(keys, opts){
    build();
    killTimers();
    const o = opts || {};
    const want = [];
    (keys || []).forEach(k => {
      if (want.length >= MAX_FOCUS_FACTS || want.some(x => x.want === k)) return;
      const at = Store.factOrigin(k);
      if (!at) return;                                   // never met: nowhere to ask it
      const cut = at.lastIndexOf(':');
      const g = Games.byId[at.slice(0, cut)], li = Number(at.slice(cut + 1));
      if (!g || !g.levels[li] || !levelOpen(g, li)) return;
      want.push({ game: g, level: g.levels[li], levelIndex: li, want: k });
    });
    if (!want.length){ startDaily(10); return; }         // nothing to aim at yet
    mode = 'focus'; curGame = null;
    focusKeys = want.map(x => x.want);
    plan = [];
    /* Round-robin, not shuffled. A B C A B C spaces each fact out inside the
       sitting, which is what retrieval practice wants; massing them back to back
       would let the child copy the last answer instead of retrieving it. */
    const n = o.n || 10;
    for (let i = 0; i < n; i++) plan.push(want[i % want.length]);
    titleEl.textContent = 'にがて あつめ';
    begin();
  }

  /** How badly this child needs this level today.
      The old round-robin handed every game the same ~0.66 questions a day whether
      the child was at 10% or 97%, which made the daily set a sampler rather than
      practice. This is the same 10 questions, aimed. */
  /* Where a child with no record yet should start. The README's roadmap says the
     first two months belong to かずの しま; until this, the roadmap existed only as
     prose on the parent page. */
  const STARTER_WORLD = { shima: 1.7, umi: 0.85, yama: 0.5, mori: 0.7 };

  function dailyWeight(p){
    const acc  = Store.recentAccuracy(p.game.id, p.levelIndex);
    const seen = Store.recentCount(p.game.id, p.levelIndex);
    const need = acc == null ? 1 : 1 - acc;                    // 0 solid … 1 struggling
    const cold = Math.min(1, Store.daysSince(p.game.id, p.levelIndex) / 14);
    /* On day one every level scores the same on need (1) and cold (1), so `focus`
       was the only thing separating them — which put いくつと いくつ, the hardest
       thing in the app, in front of a child who could not yet count to ten. Ramp
       the priority in with the evidence that earns it. */
    const focus = 1 + ((p.game.focus || 1) - 1) * Math.min(1, seen / 8);
    const done  = Store.stars(p.game.id, p.levelIndex) >= 3 ? 0.45 : 1;
    const start = seen ? 1 : (STARTER_WORLD[p.game.world] || 0.8);
    return (0.35 + need * 1.6 + cold * 0.8) * focus * done * start;
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
    disarmQuit();
    idx = 0; mistakes = 0; firstTryRight = 0; swiftCount = 0;
    if (mode !== 'focus') focusKeys = [];
    usedItems = new Set(); shaky = []; sessionOutcomes = [];
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
      /** In a 集中練習 session, the fact this question is supposed to ask (the part
          of the item key after the game id), or null in a normal session.

          A generator that reads this hits the requested fact on its first build.
          One that ignores it still works: the engine re-rolls it and settles for
          the same level, which is the right topic if not the exact fact. */
      get want(){
        const w = plan[idx] && plan[idx].want;
        if (!w) return null;
        const p = a.game.id + ':';
        return w.indexOf(p) === 0 ? w.slice(p.length) : null;
      },
      /** `after` = how many mistakes before it fires (default 2, minimum 1). */
      onHint(fn, after){ if (stale()) return; hintFn = fn; if (after) hintAfter = Math.max(1, after); },
      /** Show (and take) the correct action, for the bottom rung of the ladder.
          `buildChoices` / `buildPad` questions need nothing: the engine presses the
          right button, which runs the question's own reveal. A hand-made answer
          surface has to say how — usually one line, tapping its own right element.
          Optional: without it the engine still ends the question rather than
          leaving the child pressing wrong things forever. */
      onShow(fn){ if (!stale()) showFn = fn; },
      correct(o){ if (!stale()) onCorrect(o || {}); },
      /** `given` is what the child actually chose: a value the engine can read
          against the answer, or a tag a generator supplies for something the item
          key cannot say ('looks', 'rev'). Optional — omitting it only costs the
          diagnosis, never the behaviour. */
      wrong(target, given){ if (!stale()) onWrong(target, given); },
      /** delayed work that dies with the question */
      later(fn, ms){ return later(fn, ms); },
      get locked(){ return locked; },

      /** A fixed 0–10 keypad.

          Picking the answer out of three options is recognition; the goal these
          levels are named for ("考えずに言える") is retrieval, and the two are not
          the same skill. Eleven keys that never change position ask the child to
          produce the number instead of discriminating between three candidates —
          and drop what guessing alone is worth from 33% to 9%.

          Facing eleven blank keys with no idea is discouraging, so the keypad
          registers its own hint: after two wrong answers it dims everything more
          than two away, leaving a handful to think between. */
      buildPad(answer, opts){
        if (stale()) return choicesEl;
        const o = opts || {};
        const lo = o.lo == null ? 0 : o.lo, hi = o.hi == null ? 10 : o.hi;
        clear(choicesEl);
        askedAt = performance.now();     // a story animation is not thinking time
        curAnswer = answer;
        newSurface();
        choicesEl.classList.add('pad');
        choicesEl.dataset.built = '1';
        /* No hintBtns: the engine's fallback dims one more wrong answer on every
           mistake, and stacked on the narrowing below that left just two keys —
           a coin flip, which is the opposite of what the keypad is for. The
           narrowing is the visible response to a second wrong answer. */
        hintBtns = [];
        const keys = [];
        let settled = false;
        for (let v = lo; v <= hi; v++){
          const b = el('button.choice.padkey', { type: 'button', text: String(v) });
          const val = v;
          b.addEventListener('click', () => {
            if (locked || stale()) return;
            markResponse();
            if (val === answer){
              if (settled) return;
              settled = true;
              b.classList.add('correct');
              keys.forEach(x => { if (x !== b) x.disabled = true; });
              if (o.onPick && o.onPick(val, b) === false) return;
              a.correct(o.correctOpts);
            } else {
              b.classList.add('wrong', 'tried');
              later(() => b.classList.remove('wrong'), 460);
              a.wrong(b, val);
            }
          });
          if (v === answer){ answerBtn = b; answerText = String(v); }
          keys.push(b);
          choicesEl.append(b);
        }
        hintExtras.push(() => {
          keys.forEach(b => {
            if (Math.abs(Number(b.textContent) - answer) > 2) b.classList.add('dim');
          });
        });
        // one more rung: eleven keys → five → three. Still a choice, not a coin flip.
        hintStrongFns.push(() => {
          keys.forEach(b => {
            if (Math.abs(Number(b.textContent) - answer) > 1) b.classList.add('dim');
          });
        });
        return choicesEl;
      },

      /** Big tappable answer buttons.
          opts.onPick(value, button) runs on a correct pick; returning false keeps
          the question open (used by questions that ask for several answers). */
      buildChoices(values, answer, opts){
        if (stale()) return choicesEl;
        const o = opts || {};
        clear(choicesEl);
        askedAt = performance.now();
        curAnswer = answer;
        newSurface();
        choicesEl.dataset.built = '1';
        hintBtns = [];
        let settled = false;              // one accepted answer per set of buttons
        values.forEach(v => {
          const val = (v && typeof v === 'object' && 'v' in v) ? v.v : v;
          const b = el('button.choice' + (o.cls ? '.' + o.cls : ''), { type: 'button' });
          const content = o.render ? o.render(val, v) : String(val);
          if (content && content.nodeType) b.append(content); else b.textContent = content;
          const hit = o.match ? o.match(val, answer) : val === answer;
          b.addEventListener('click', () => {
            if (locked || stale()) return;
            markResponse();
            if (hit){
              /* A five-year-old taps twice. The picked button was never disabled —
                 only its neighbours were — so a second tap ran onPick again. In a
                 question with several blanks that skipped a blank and then threw,
                 leaving the child on a question they could no longer finish.
                 `settled` belongs to this set of buttons: the next set (the next
                 blank) gets a fresh one. */
              if (settled) return;
              settled = true;
              b.classList.add('correct');
              $$('.choice', choicesEl).forEach(x => { if (x !== b) x.disabled = true; });
              if (o.onPick && o.onPick(val, b) === false) return;
              a.correct(o.correctOpts);
            } else {
              b.classList.add('wrong', 'tried');
              later(() => b.classList.remove('wrong'), 460);
              a.wrong(b, val);
            }
          });
          if (hit && !answerBtn){ answerBtn = b; answerText = typeof content === 'string' ? content : String(val); }
          if (!hit) hintBtns.push(b);
          choicesEl.append(b);
        });
        return choicesEl;
      }
    };
    return a;
  }

  /* A question with several blanks builds a new set of buttons for each one. The
     rungs of the ladder belong to the *surface*, not the question: pointing
     「こたえを みる」 at the button that answered the previous blank leaves the child
     on a board where nothing works. Mistakes keep accumulating across the blanks,
     so a child who needed showing on the first one is shown the next one quickly. */
  function newSurface(){
    answerBtn = null; answerText = null; hintStrongFns = []; taught = false;
  }

  function resetSurface(){
    locked = false; hintBtns = []; hintFn = null; hintExtras = []; hintShown = false;
    hintAfter = 2; extrasShown = false;
    askedAt = 0; respondedMs = null;
    curItem = null; curLabel = null; curAnswer = null; missType = null;
    hintStrongFns = []; showFn = null; answerBtn = null; answerText = null; taught = false;
    clear(fieldEl); clear(choicesEl); delete choicesEl.dataset.built;
    choicesEl.classList.remove('pad');
    clearFeedback();
    fieldEl.className = 'playfield';
  }

  /* How hard to look for a better question before settling.
     TRIES builds are cheap (the whole build-storm test does 25 per level), and a
     rejected build dies with its epoch, so nothing it scheduled can survive. */
  const TRIES = 7, PICKY = 2, DUE_ENOUGH = 0.55;
  /* A generator that ignores api.want has to be re-rolled onto the fact. Levels
     name between five and forty-five facts, so this lands most of the time and
     falls back to the same level when it does not. */
  const FOCUS_TRIES = 24;

  /** Draw a question, re-rolling to avoid repeating a fact and to favour the ones
      this child owes practice to. The generator is random, so we cannot go back to
      an earlier draw — we accept the one that is on screen when we stop. */
  function drawQuestion(step){
    const tries = step.want ? FOCUS_TRIES : TRIES;
    for (let t = 0; t < tries; t++){
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
      if (step.want){
        // the shuffle bag is deliberately out of the way here: repeating the fact
        // inside one sitting is the entire point of a 集中練習 session
        if (curItem === step.want || t === tries - 1) return;
        continue;
      }
      if (t === tries - 1){
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
    disarmQuit();
    killTimers();
    wrongThisQ = 0;
    $$('.pip', pipsEl).forEach((p, i) => p.classList.toggle('now', i === idx));
    setMood('idle');
    const step = plan[idx];
    if (mode !== 'level'){
      const modeName = mode === 'daily' ? 'きょうの れんしゅう'
                     : mode === 'focus' ? 'にがて あつめ' : 'はじめの ぼうけん';
      titleEl.textContent = modeName + '　' + step.game.name;
    }
    drawQuestion(step);
    // hand-built answer surfaces (plates, a queue of animals, the clock hand) never
    // call buildChoices, so start their clock here
    if (!askedAt) askedAt = performance.now();
    UI.fitPlayfield(fieldEl);     // size this question to the room it has
    refit();                      // and again next frame, once fonts/SVGs have settled
  }

  /** Dim one more wrong choice, so a repeated mistake is never met by a still screen. */
  function dimOne(){
    const live = hintBtns.filter(b => !b.classList.contains('dim'));
    if (live.length > 1) live[ri(0, live.length - 1)].classList.add('dim');
  }

  function runExtras(){
    if (extrasShown) return;
    extrasShown = true;
    hintExtras.forEach(fn => { try{ fn(); }catch(e){ console.error('hint failed', e); } });
  }

  /** Second rung: narrow much harder, and put the way out on screen. */
  function strongHint(){
    runExtras();
    hintStrongFns.forEach(fn => { try{ fn(); }catch(e){ console.error('hint failed', e); } });
    // leave exactly one wrong answer standing beside the right one
    for (let i = 0; i < 12 && hintBtns.filter(b => !b.classList.contains('dim')).length > 1; i++) dimOne();
    showFeedback('hint', 'もう ちょっと ヒントを だすね', teachButton());
    Sound.say('もう少し、ヒントを出すね。', { delay: 260 });
  }

  /** The way out, offered before it is taken. */
  function teachButton(){
    return el('button.btn.btn-ghost.teachbtn', {
      type: 'button', text: 'こたえを みる',
      onclick(e){ e.stopPropagation(); teach(); }
    });
  }

  /** Bottom rung. Press the right button if there is one — that runs the question's
      own reveal, so the answer lands inside the sentence the child was reading —
      otherwise let the game show it, and end the question either way. */
  function teach(){
    if (locked || taught) return;
    taught = true;
    // stop the child racking up misses on a board that is already being answered
    $$('.choice', choicesEl).forEach(b => { if (b !== answerBtn) b.disabled = true; });
    clearFeedback();
    showFeedback('hint', 'いっしょに やってみよう');
    Sound.say(answerText != null ? `こたえは、${answerText}。いっしょに見てみよう。`
                                 : 'いっしょに、やってみよう。', { delay: 200 });
    if (answerBtn && answerBtn.isConnected && !answerBtn.disabled){
      answerBtn.classList.add('showme');
      later(() => { if (!locked) answerBtn.click(); }, 900);
      return;
    }
    if (showFn){ try{ showFn(); }catch(e){ console.error('show failed', e); } }
    later(() => { if (!locked) onCorrect({ quiet: true, delay: 1400 }); }, 1000);
  }

  function onWrong(target, given){
    // once the answer is being shown, taps on the old surface are not attempts
    if (locked || taught) return;
    markResponse();
    wrongThisQ++;
    mistakes++;
    /* The first mistake is the diagnostic one — later ones are increasingly guided,
       so they say less about what the child was thinking. */
    if (!missType){
      missType = (typeof given === 'string' && MISS_KINDS[given])
        ? given
        : classifyMiss(curItem, curAnswer, given);
    }
    Sound.sfx.wrong();
    setMood('soft');
    if (target && target.classList){
      target.classList.add('wrong');
      later(() => target.classList.remove('wrong'), 460);
    }

    if (wrongThisQ >= 2) runExtras();

    if (wrongThisQ === hintAfter && !hintShown){
      hintShown = true;
      showFeedback('hint', 'ヒントを だすね');
      Sound.say('ヒントを出すね。', { delay: 260 });
      if (hintFn){ try{ hintFn(wrongThisQ); }catch(e){ console.error('hint failed', e); } }
      if (wrongThisQ >= 2) dimOne();
      return;
    }
    if (wrongThisQ >= hintAfter + TEACH_AFTER){ teach(); return; }
    if (wrongThisQ === hintAfter + STRONG_AFTER){ strongHint(); return; }
    if (wrongThisQ > hintAfter){
      // between the rungs: still say something new, and keep narrowing
      dimOne();
      showFeedback('hint', 'まだ ちがうね。よく みて みよう',
        wrongThisQ > hintAfter + STRONG_AFTER ? teachButton() : null);
      return;
    }
    /* Before the hint: name the mistake if we can read it. 「1つ多く数えた」 and
       「見えている方を言った」 need different words, and the generic line said neither. */
    const line = missChild(missType);
    showFeedback('oops', line || 'もういちど やってみよう');
    Sound.say(line ? line.replace(/\s+/g, '') : '惜しいね。もう一度やってみよう。', { delay: 260 });
  }

  function onCorrect(o){
    if (locked) return;
    locked = true;
    markResponse();
    clearFeedback();
    const clean = wrongThisQ === 0;
    sessionOutcomes.push({
      gameId: plan[idx].game.id, levelIndex: plan[idx].levelIndex, clean
    });
    if (clean) firstTryRight++;
    const g = plan[idx].game;
    const timed = g.fluent && clean ? respondedMs : null;
    if (timed != null && timed <= FLUENT_FAST_MS) swiftCount++;
    if (mode !== 'diagnostic'){
      Store.noteOutcome(g.id, plan[idx].levelIndex, clean);
      if (curItem){
        /* 'taught' outranks the reading of the first mistake: what matters about
           this question is that the child did not get there on their own. */
        Store.noteFact(curItem, clean, curLabel, g.id + ':' + plan[idx].levelIndex, timed,
                       taught ? 'taught' : missType);
        if (!clean && !shaky.some(x => x.key === curItem)){
          shaky.push({ key: curItem, label: curLabel || plan[idx].game.name });
        }
      }
    }
    Sound.sfx.correct();
    setMood('happy');
    const pip = $$('.pip', pipsEl)[idx];
    if (pip){ pip.classList.remove('now'); pip.classList.add(wrongThisQ === 0 ? 'done' : 'miss'); }
    if (!o.quiet){
      UI.bigMark('◯');
      const praise = wrongThisQ === 0
        ? pick(['やったね！', '正解！', 'すごい！', '上手だね！', 'ばっちり！', 'その調子！'])
        : pick(['できたね！', 'よく頑張ったね！', 'その通り！']);
      Sound.say(praise, { delay: 320 });
    }
    if ((idx + 1) % 4 === 0) UI.confetti(22);
    later(() => {
      idx++;
      if (idx >= plan.length) finish();
      else nextQuestion();
    }, o.delay || 950);
  }

  /** 3 = every question right first time, 0 = under half. Levels vary in length,
      so grade the share, not the count. */
  function starsFor(right, total){
    if (!total) return 0;
    const r = right / total;
    return r >= 1 ? 3 : r >= 0.75 ? 2 : r >= 0.5 ? 1 : 0;
  }

  function finish(){
    killTimers();
    const total = plan.length;
    /* Stars used to be `mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1` — one star was
       guaranteed for finishing, so the unlock gate really only asked whether the
       child had sat through the level. Grade the questions answered right first
       time instead, and let a session score nothing. */
    const stars = mode === 'diagnostic' ? 3 : starsFor(firstTryRight, total);
    /* ★★★ says every answer was right first time. This says they arrived — which is
       the thing these levels are actually for, and the thing three stars could not
       distinguish from nine seconds of counting. Only on the games where speed is
       the stated goal, and never on きょうの れんしゅう, which mixes them all. */
    const swift = stars === 3 && total > 0 && mode !== 'daily'
                  && plan.every(p => p.game.fluent) && swiftCount / total >= 0.75;
    // a session that did not pass should not get a party; it gets an invitation
    if (stars >= 1){ Sound.sfx.finish(); UI.confetti(60); }
    else Sound.sfx.place();
    let newSticker = null;
    /* The last sticker on the shelf is the moment the 小1 classroom opens, and the
       child has to be told so on the screen they are already looking at. Read the
       gate before the sticker is handed out, so「もう開いていた」and「いま開いた」
       stay distinguishable. */
    const wasOpen = Progress.g1Open();
    if (mode === 'level'){
      const key = curGame.id + ':' + curLevelIdx;
      Store.recordLevel(curGame.id, curLevelIdx, stars, firstTryRight, total);
      if (swift) Store.recordSwift(curGame.id, curLevelIdx);
      // a sticker means "cleared", so it waits for a pass
      if (stars >= 1){
        if (Store.addSticker(key)) newSticker = { emoji: stickerFor(key), gold: stars === 3 };
        else if (stars === 3 && Store.addSticker(key + ':g')){
          newSticker = { emoji: stickerFor(key + ':g'), gold: true };
        }
      }
    } else if (mode === 'diagnostic'){
      const recommended = Diagnostic.recommendFrom(sessionOutcomes);
      Store.recordDiagnostic(sessionOutcomes, recommended);
    } else {
      if (mode === 'daily') Store.recordPractice(firstTryRight, total);
      else Store.recordFocus(firstTryRight, total);
      // one sticker per calendar day, per set
      const key = (mode === 'daily' ? 'daily:' : 'focus:') + Store.todayKey();
      if (Store.addSticker(key)) newSticker = { emoji: stickerFor(key), gold: stars === 3 };
    }
    const justOpenedG1 = !wasOpen && Progress.g1Open();
    if (justOpenedG1){
      Sound.sfx.unlockSfx();
      UI.confetti(90);
    }
    const gameCounts = {};
    plan.forEach(x => { gameCounts[x.game.id] = (gameCounts[x.game.id] || 0) + 1; });
    const primaryGameId = mode === 'level' && curGame ? curGame.id
      : Object.keys(gameCounts).sort((a, b) => gameCounts[b] - gameCounts[a])[0] || null;
    Result.show({ stars, right: firstTryRight, total, mode, game: curGame, levelIndex: curLevelIdx,
                  sticker: newSticker, shaky: mode === 'diagnostic' ? [] : shaky.slice(0, 3),
                  focusKeys: focusKeys.slice(), swift, unlockedG1: justOpenedG1,
                  recommended: mode === 'diagnostic' ? Diagnostic.recommendFrom(sessionOutcomes) : null,
                  lastGameId: primaryGameId });
  }

  return {
    startLevel, startDaily, startFocus, startDiagnostic, build,
    _test: {
      flushTimers,
      get idx(){ return idx; },
      get planLength(){ return plan.length; },
      get planGames(){ return plan.map(p => p.game.id + ':' + p.levelIndex); },
      get item(){ return curItem; },
      /** Test seam: finish the current question without using its own input.
          Lets the suite measure what the engine *draws* for levels it cannot
          drive by clicking (tracing, dragging, turning the clock hand). */
      forceCorrect(){ onCorrect({ quiet: true, delay: 0 }); },
      get shaky(){ return shaky.slice(); },
      get locked(){ return locked; },
      get mistakes(){ return mistakes; },
      get pending(){ return timers.size; },
      get mode(){ return mode; },
      get responseMs(){ return respondedMs; },
      get missType(){ return missType; },
      get taught(){ return taught; },
      get wrongThisQ(){ return wrongThisQ; },
      get planItems(){ return plan.map(p => p.want || null); }
    }
  };
})();
