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

// The stable reward key remains the storage identity; artwork is a display layer.
const STICKER_POOL = Object.values(POKEMON_MANIFEST.pokemon).map(p => p.name);
function stickerFor(key){ return PokemonStickers.reward(key).name; }

/* ===========================================================
   stages — relevant preparation for each 小学1年生 game
   ===========================================================
   Each classroom game opens after its own short preparation route: confirmed
   clears or sustained unaided first answers. Collection progress is counted
   separately. Once a game opens, its saved entrance stays open through errors,
   backup restoration and future catalog changes. Legacy global entrances and
   a parent's manual entrance continue to open the whole classroom. */
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

  /** one plain sticker per level, used by collection progress and named gaps */
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
    // confirmed clears only: a provisional one has not yet been shown on another day
    all.forEach(k => { if (Store.hasConfirmed(k)) got++; });
    return { got, total: all.length };
  }

  /* Each 小1 game has a short, relevant preparation route. Clearing a level
     confirms it; sustained daily retrieval can confirm readiness as well. */
  const G1_PATHS = {
    g1set:   [['count', 0], ['numeral', 0]],
    g1pair:  [['count', 1], ['compare', 1]],
    g1teen:  [['numeral', 2], ['bond', 2], ['ten', 1]],
    g1shiki: [['add', 0], ['sub', 0]]
  };
  function levelReady(id, i){
    if (Store.hasConfirmed(id + ':' + i)) return true;
    const evidence = Store.readiness(id, i);
    return evidence.count >= 6 && evidence.accuracy >= .75;
  }
  function g1GameOpen(g){
    if (stageOf(g) !== 'g1') return false;
    if (Store.data.g1Open || Store.data.g1Reached) return true;
    if (Store.hasG1GameOpen(g.id)) return true;
    // Older records have no per-game latch. Actual lessons/checks already met
    // are evidence that this game was open; preserve only that game's entrance.
    const previouslyMet = g.levels.some((lv, i) => Store.hasSticker(g.id + ':' + i)
      || Store.stars(g.id, i) > 0 || Store.plays(g.id, i) > 0
      || Store.recentCount(g.id, i) > 0 || Store.introduced(g.id, i))
      || Store.milestones().some(m => m.gameId === g.id);
    const path = G1_PATHS[g.id] || [];
    if (!previouslyMet && (!path.length || !path.every(([id, i]) => levelReady(id, i)))) return false;
    Store.markG1GameOpen(g.id);
    return true;
  }
  function preparation(g){
    return (G1_PATHS[g.id] || []).map(([id, levelIndex]) => ({
      game: Games.byId[id], levelIndex, ready: levelReady(id, levelIndex)
    })).filter(p => p.game);
  }
  function pathProgress(g){
    const path = G1_PATHS[g.id] || [];
    return { got: path.filter(([id, i]) => levelReady(id, i)).length, total: path.length };
  }
  function unlockHint(g){
    const p = pathProgress(g);
    return p.total ? 'じゅんびの あそびを ' + p.got + '／' + p.total + ' できたら ひらくよ' : 'じゅんびが できたら ひらくよ';
  }

  /** true when at least one classroom game is open, including legacy/manual entrances */
  function g1Open(){
    if (Store.data.g1Open || Store.data.g1Reached) return true;
    return Games.list.some(g => stageOf(g) === 'g1' && g1GameOpen(g));
  }

  return {
    stageOf,
    slots,
    gateSlots,
    /** { got, total } over confirmed 入学前 clears, separate from classroom readiness */
    preStickers: () => count('pre'),
    levelReady,
    g1GameOpen,
    preparation,
    pathProgress,
    unlockHint,
    /** levels cleared provisionally, waiting for another day */
    pendingCount: stage => gateSlots(stage).filter(k => Store.isPending(k)).length,
    g1Open,
    /** opened by hand from the parent page; never reversible */
    openG1(){ Store.setPref('g1Open', true); }
  };
})();

/** Is this game's half of the app open at all? */
function stageOpen(g){ return Progress.stageOf(g) === 'pre' || Progress.g1GameOpen(g); }
/** The gate every question-drawing surface asks: open stage AND unlocked level. */
function levelOpen(g, i){ return stageOpen(g) && Store.levelUnlocked(g.id, i); }

const Session = (() => {
  let node, titleEl, pipsEl, promptTxt, fieldEl, choicesEl, speakBtn, showBtn, backBtn, moodEl, feedbackEl;
  let answerControls, nextBtn, answerSpeech = '', advancePending = null;
  let autoAdvanceOverride = null, blockAnswerUntil = 0;
  let lastAnswerGesture = null, lastTouchPointer = null, surfaceVersion = 0;
  let refit = () => {};
  let plan = [];          // [{game, level, levelIndex}]
  let idx = 0, mistakes = 0, firstTryRight = 0, wrongThisQ = 0;
  let locked = false, mode = 'level', curGame = null, curLevelIdx = 0;
  /* A chosen level sticker is a visual destination for this run.  An adventure
     is a separate short practice path.  Neither is written as a learning result. */
  let rewardTarget = null, adventureTarget = null;
  let firstTarget = null, firstPhase = null, visitMilestone = null;
  let runId = '', runRound = 1, results = [], resumeQuestion = null;
  // Navigation stays in memory and belongs to one run, never to its score or backup.
  let levelReturn = null;
  let draftAdapters = new Map(), restoringDraft = false;
  let overviewNode, overviewBody, countEl, overviewOn = true, breaksOn = true;
  let hintBtns = [], hintExtras = [], hintShown = false, lastSpeech = '';
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
  /* `taught` guards one answer surface and is reset with it; this one is the
     record, and belongs to the whole question. With several blanks, the next blank
     used to wipe it, and a question the app had answered was saved as the child's
     own mistake. */
  let taughtQ = false;
  /* ---------- the coach ----------
     What the game hands over when the child gets stuck. `tool` changes the board
     into something to work with (dots to count, holes to fill, bars lined up);
     `text`/`say` are the words for it, in the bubble and out loud; `walk` returns the
     steps the hand goes through to show the method. The hint used to be a line of
     small text in the playfield that nothing read out, so a child who cannot read
     yet was told「ヒントを だすね」and then shown nothing they could use. */
  let coach = null, hintSpeech = '', walkToken = 0, walked = false;
  /* ---------- meeting a level for the first time ----------
     A new idea used to arrive as a test: the first「なんじはん」a child ever saw was a
     question to get right, and the explanation of「はん」only came as a hint after two
     misses. The first time a level is opened, two questions go in front of it:
       'show'     — the hand goes through the method and answers; input waits
       'together' — the tool is on the board from the start and the child answers
     Neither is recorded or graded: they are the lesson, not the child's work.
     `helped` records both requested and automatic hints, so the answer is recorded
     as supported even when the child first tried it without help. */
  let introOn = true, demo = null, demoRunning = false, demoWalked = null, demoWaits = 0;
  // Help belongs to the whole question; a new answer surface must not erase it.
  let touched = false, helped = false;
  /* ---------- checking a clear on another day ----------
     Three questions from a provisionally cleared level, asked on a later day, first
     thing: two right first time confirms the sticker. They are not graded as the
     level being played. See `pending` in 02-store.js. */
  const CHECK_N = 3, CHECK_PASS = 2;
  let checkTally = {}, announced = new Set();
  function checkSteps(exceptKey, maxLevels){
    const out = [];
    for (const key of Store.pendingDue()){
      if (out.length >= maxLevels * CHECK_N) break;
      if (key === exceptKey) continue;               // replaying it is the check
      const cut = key.lastIndexOf(':');
      const g = Games.byId[key.slice(0, cut)], li = Number(key.slice(cut + 1));
      if (!g || !g.levels[li] || !levelOpen(g, li) || !Store.introduced(g.id, li)) continue;
      for (let i = 0; i < CHECK_N; i++) out.push({ game: g, level: g.levels[li], levelIndex: li, check: key });
    }
    return out;
  }
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
  /* When the question had finished being read out (0 while it still is). Timing
     from the moment it appeared counted the reading as thinking: with the voice on,
     「3秒以内」was nearly out of reach and「9秒以上 = 数えている」came easily, and that
     bias went straight into the parent page and into what gets practised. An answer
     given before the reading ends counts as instant — the child did not need it. */
  let spokenAt = 0;
  function markResponse(){
    if (respondedMs != null || !askedAt) return;
    const now = performance.now();
    respondedMs = Math.round(Math.max(0, now - Math.max(askedAt, spokenAt || now)));
  }
  /* A keypad key sits beside the keys one either side of it, so a finger that
     lands a key over reads exactly like「1つ多く数えた」. A ±1 miss put right at
     once is taken as the finger, not the counting: the question still is not a
     first-try right, but the parent page is not told the child counts one too many. */
  const PAD_SLIP_MS = 1500;
  let slipAt = 0;
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
  /** Automatic teaching waits for both the board's animation and its narration.
      Observe speech after the minimum delay: an action can replace the prompt,
      and that replacement must finish too. Leaving a question invalidates even
      callbacks whose audio has already begun. */
  function afterNarration(fn, ms, valid){
    const mine = epoch;
    later(() => Sound.afterSpeech(() => {
      if (mine === epoch && (!valid || valid())) fn();
    }), ms);
  }
  function killTimers(){
    epoch++;
    timers.forEach((v, id) => clearTimeout(id));
    timers.clear();
    advancePending = null;
    if (nextBtn) nextBtn.disabled = true;
    if (answerControls) answerControls.hidden = true;
    if (node) node.classList.remove('answer-review');
    endWalk();
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
      // the question, and the hint if one is up: a child who missed the hint's words
      // has no other way to hear them again
      onclick(){
        Sound.sfx.tap();
        const text = locked && answerSpeech ? answerSpeech : lastSpeech + hintSpeech;
        if (text) Sound.say(text, { delay: 40 });
      }
    }, '🔊');
    /* 👀: the help a child can ask for before getting it wrong. Help that only ever
       arrives after two mistakes teaches that being wrong is how you get help. */
    showBtn = el('button.btn.btn-ghost.btn-round.showbtn', {
      type: 'button', 'aria-label': 'みせて', title: 'みせて',
      onclick(){ Sound.sfx.tap(); askForHelp(); }
    }, '👀');
    moodEl = mascotSVG('idle', 'talk');
    moodEl.style.width = 'calc(var(--u)*4.6)';
    moodEl.style.height = 'calc(var(--u)*4.6)';

    backBtn = el('button.btn.btn-ghost.btn-round.backbtn', {
      'aria-label': 'もどる', onclick: quit
    }, '←');
    nextBtn = el('button.btn.btn-accent.answer-next', {
      type: 'button', disabled: true,
      onclick(){ if (advancePending){ Sound.sfx.tap(); advancePending(); } }
    }, 'つぎへ ▶');
    answerControls = el('div.answer-controls', {hidden:true},
      el('span.answer-state', {text:'◯ できたね', role:'status'}), nextBtn);
    node = el('div#play', null,
      el('div.topbar', null,
        backBtn,
        titleEl, pipsEl),
      el('div.prompt', null, moodEl,
        el('div.txtwrap', null, promptTxt, feedbackEl), speakBtn, showBtn),
      countEl = el('div.session-count',{'aria-live':'polite'}), fieldEl, choicesEl, answerControls);
    UI.register('play', node);
    const explicitField = target => target && target.closest && target.closest('.three-sum-slot');
    const answerAction = target => target && target.closest && target.closest('.playfield button,.playfield [role="button"],.choices button,.choices [role="button"],.answer-next');
    const nativeGesture = e => {
      if (!e.isTrusted) return;
      const control = answerAction(e.target), active = UI.currentName() === 'play';
      const previous = lastAnswerGesture, elapsed = previous ? e.timeStamp - previous.at : Infinity;
      if (!active && elapsed >= 1200) return;
      if (explicitField(e.target)){ lastAnswerGesture = null; return; }
      if (e.type === 'click' && e.detail === 0) return;
      const touch = e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents
        || lastTouchPointer && e.timeStamp - lastTouchPointer.at < 100
          && Math.hypot(e.clientX-lastTouchPointer.x,e.clientY-lastTouchPointer.y) < 4;
      const same = previous && elapsed < 1200
        && Math.hypot(e.clientX-previous.x,e.clientY-previous.y) < 20;
      const handoff = previous && (previous.numeric || wrongThisQ > previous.wrong || previous.epoch !== epoch || previous.surface !== surfaceVersion);
      if (same && (e.detail > 1 || touch && handoff && elapsed < 450)){
        e.preventDefault();e.stopImmediatePropagation();return;
      }
      if (e.type === 'click' && active && control) lastAnswerGesture = {
        at:e.timeStamp,x:e.clientX,y:e.clientY,epoch,surface:surfaceVersion,wrong:wrongThisQ,
        numeric:control.matches('.padkey,.answer-submit,.answer-next,.three-undo')
      };
    };
    document.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') lastTouchPointer = {at:e.timeStamp,x:e.clientX,y:e.clientY};
      nativeGesture(e);
    }, true);
    document.addEventListener('click', nativeGesture, true);
    node.addEventListener('keydown', e => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ') && answerAction(e.target)){
        e.preventDefault();e.stopImmediatePropagation();
      }
    }, true);
    // has a finger been on this question yet — the together-tool must not wipe the child's own work
    const touch = e => {
      // The second tap of a double tap on Next must not land on the new answer
      // surface that has just appeared in the same place.
      if (e.detail > 1 && performance.now() < blockAnswerUntil && e.target.closest
          && e.target.closest('.playfield, .choices')){
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
      // Listening is part of reading the question, not the child's first answer.
      // This listener runs in capture phase, before the audio button can stop it.
      if (e.target.closest && e.target.closest('.choice-hear')) return;
      touched = true;
    };
    node.addEventListener('pointerdown', touch, true);
    node.addEventListener('click', touch, true);
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
    feedbackEl.animate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)
      && feedbackEl.animate([{ transform: 'translateX(-.4em)' }, { transform: 'none' }], { duration: 260 });
  }
  function clearFeedback(){ feedbackEl.hidden = true; clear(feedbackEl); }

  function checkpoint(nextIndex = idx, question){
    if (restoringDraft || !runId || Store.round() !== runRound || !plan.length) return;
    const currentQuestion = {wrongThisQ, helped, taughtQ, missType};
    if (question === undefined && demo !== 'show' && curItem && draftAdapters.size){
      const parts = [];
      for (const [id, adapter] of draftAdapters){
        try{
          const data = adapter.read();
          if (data !== undefined) parts.push({id, data});
        }catch(e){ /* A failed optional draft must not lose the scored visit. */ }
      }
      if (parts.length) currentQuestion.draft = {v:1, item:curItem, touched, parts};
    }
    const target = t => t ? { gameId:t.game.id, levelIndex:t.levelIndex, want:t.want || null } : null;
    Store.saveSession({ v:1, id:runId, at:Date.now(), mode, title:titleEl.textContent,
      gameId:curGame ? curGame.id : null, levelIndex:curLevelIdx, index:nextIndex,
      plan:plan.map(p => ({gameId:p.game.id, levelIndex:p.levelIndex,
        ...(p.intro ? {intro:p.intro} : {}), ...(p.check ? {check:p.check} : {}),
        ...(p.want ? {want:p.want} : {}), ...(p.seed !== undefined ? {seed:p.seed} : {})})),
      firstTryRight, mistakes, swiftCount, results:results.slice(), sessionOutcomes:sessionOutcomes.slice(),
      shaky:shaky.slice(), focusKeys:focusKeys.slice(), usedItems:Array.from(usedItems),
      checkTally, announced:Array.from(announced), rewardKey:rewardTarget ? rewardTarget.key : null,
      adventureTarget:target(adventureTarget), firstTarget:target(firstTarget), firstPhase,
      visitMilestone, question:question === undefined
        ? currentQuestion : question });
  }

  function restoreDraft(draft, step){
    if (!draft || !draft.touched || draft.item !== curItem || demo === 'show') return false;
    const oldSay = Sound.say, oldSfx = Sound.sfxOn;
    const restored = new Set(), attempted = new Set();
    let restoredHelp = false;
    restoringDraft = true;
    Sound.say = () => {}; Sound.sfxOn = false;
    try{
      const restoreKnown = () => {
        for (const part of draft.parts){
          const adapter = draftAdapters.get(part.id);
          if (!adapter || attempted.has(part.id)) continue;
          attempted.add(part.id);
          try{ if (adapter.restore(part.data) !== false) restored.add(part.id); }catch(e){ /* Ignore invalid game data. */ }
        }
      };
      withRandomSeed(step.seed, restoreKnown);
      if (helped || wrongThisQ >= hintAfter){ hint(); restoredHelp = true; }
      // A hint may register a counting tool belonging to the restored stage.
      restoreKnown();
      if (restored.size){
        // Keep the epoch: newly built controls still belong to this question.
        // Cancel only animations that would overwrite its restored stage.
        timers.forEach((v, id) => clearTimeout(id)); timers.clear(); endWalk();
      }
      for (const part of draft.parts){
        const adapter = draftAdapters.get(part.id);
        if (restored.has(part.id) && adapter && adapter.afterHelp){
          try{ adapter.afterHelp(part.data); }catch(e){}
        }
      }
      if (restored.size) touched = draft.touched;
    }finally{
      Sound.say = oldSay; Sound.sfxOn = oldSfx; restoringDraft = false;
    }
    // The child hears the current question once, after its whole board is ready.
    if (restored.size || restoredHelp) Sound.say(lastSpeech + (hintShown ? hintSpeech : ''), {delay:180});
    return restored.size > 0 || restoredHelp;
  }

  function saveBeforeLeaving(){
    if (!restoringDraft && UI.currentName() === 'play' && !locked){ checkpoint(); Store.flush(); }
  }
  window.addEventListener('pagehide', saveBeforeLeaving);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveBeforeLeaving(); });

  function enginePendingSummary(saved = Store.savedSession()){
    if (!saved) return null;
    const exists = p => p && Games.byId[p.gameId] && Games.byId[p.gameId].levels[p.levelIndex];
    if (saved.plan.some(p => !exists(p)) || (saved.gameId && !exists({gameId:saved.gameId,levelIndex:saved.levelIndex}))
      || (['level','first'].includes(saved.mode) && !saved.gameId)
      || (saved.firstTarget && !exists(saved.firstTarget)) || (saved.adventureTarget && !exists(saved.adventureTarget))
      || (saved.mode==='first' && (!saved.firstTarget || !saved.firstPhase))
      || (saved.mode==='adventure' && !saved.adventureTarget)){
      Store.clearSavedSession(); return null;
    }
    return { kind:'session',at:saved.at,title:saved.title, remaining:saved.plan.length-saved.index, done:saved.index,
      mode:saved.mode, gameId:saved.gameId, levelIndex:saved.levelIndex };
  }

  // A choice describes one checkpoint in the current lap. Keep its revision in
  // memory only: opening Home must never rewrite a learning record.
  function pendingSummaries(){
    const saved = Store.savedSession(), review = Store.reviewSession();
    const transfer = normalizeTransferSession(Store.data.transferSession);
    const session = enginePendingSummary(saved);
    const entries = [session && {summary:session,saved,icon:session.gameId ? Games.byId[session.gameId].ico : '🧭'},
      review && typeof TextbookReview!=='undefined' && {summary:TextbookReview.pendingSummary(),saved:review,icon:'📘'},
      transfer && typeof TransferAdventure!=='undefined' && {summary:TransferAdventure.pendingSummary(),saved:transfer,
        icon:(TransferAdventure.missionFor('transfer:'+transfer.run.id)||{}).icon || '🧭'}];
    return entries.filter(e=>e && e.summary).map(e=>Object.assign({},e.summary,
      {round:Store.round(),icon:e.icon,revision:JSON.stringify(e.saved)})).sort((a,b)=>b.at-a.at);
  }
  function pendingSummary(){ return pendingSummaries()[0] || null; }
  function resumeUnavailable(){
    if (typeof Home!=='undefined' && Home.resumeChanged) Home.resumeChanged();
    return false;
  }

  function showOverview(resting, previous){
    killTimers(); Sound.hush();
    if (!overviewNode){
      overviewBody = el('div.session-overview-body');
      overviewNode = el('div#session-overview', null,
        el('div.topbar',null,el('h2',{text:'ぼうけんの じゅんび'})),overviewBody);
      UI.register('session-overview',overviewNode);
    }
    clear(overviewBody);
    const remaining = plan.length-idx, intros = plan.filter(p=>p.intro).length, checks = plan.filter(p=>p.check).length;
    overviewBody.append(mascotSVG('happy','talk'),el('h3',{text:resting ? 'ここまで '+idx+'もん できたね' : titleEl.textContent}),
      el('p',{text:resting ? 'つづきは あと '+remaining+'もん。ここで やすんでも だいじょうぶ。'
        : 'ぜんぶで '+plan.length+'もん'+(intros || checks ? '（'+(intros ? 'みほん・いっしょに '+intros+'もん　' : '')+(checks ? 'たしかめ '+checks+'もん　' : '')+'ほんばん '+(plan.length-intros-checks)+'もん）' : '')}));
    if (previous){
      const choice = {kind:'session',round:Store.round(),revision:JSON.stringify(previous)};
      overviewBody.append(el('p.session-previous',{text:'まえの つづき：'+previous.title+'　あと '+(previous.plan.length-previous.index)+'もん'}),
        el('button.btn',{text:'まえの つづきから',onclick(){
          if (this.disabled || !this.isConnected || UI.currentName()!=='session-overview') return;
          this.disabled=true; resume(choice);
        }}));
    }
    overviewBody.append(el('button.btn.btn-accent.session-continue',{text:resting ? 'つづける' : previous ? 'あたらしく はじめる' : 'はじめる',onclick(){
      checkpoint(idx,null); UI.show('play'); nextQuestion();
    }}),el('button.btn.btn-ghost',{text:resting ? 'ここで やすむ' : 'ホームに もどる',onclick(){
      if (resting || !previous) checkpoint(idx,null);
      Home.render(); UI.show('home',{replace:true});
    }}),el('p.session-save-note',{text:Store.storage === 'ok' ? 'つづきは この たんまつに のこるよ' : 'この たんまつに ほぞんできません。おうちのひとに つたえてね'}));
    UI.show('session-overview');
    Sound.say(resting ? 'ここまで、'+idx+'問できたね。続ける？ここで休んでも大丈夫。'
      : '全部で、'+plan.length+'問だよ。途中で休んでも、続きから遊べるよ。',{delay:100});
  }

  function resume(target){
    const explicit = target && typeof target==='object';
    const choices = pendingSummaries();
    const latest = explicit ? choices.find(c=>c.kind===target.kind && c.round===target.round && c.revision===target.revision)
      : target===true ? choices.find(c=>c.kind==='session') : choices[0];
    // A removed/replaced choice never falls through to a different adventure.
    if (!latest) return explicit ? resumeUnavailable() : false;
    if(latest.kind==='review') return TextbookReview.resume() || resumeUnavailable();
    if(latest.kind==='transfer') return TransferAdventure.resume() || resumeUnavailable();
    const saved = Store.savedSession();
    if (!saved || !enginePendingSummary()) return false;
    if (levelReturn && (levelReturn.id !== saved.id || levelReturn.origin.round !== Store.round())) levelReturn = null;
    if (saved.mode === 'level' && UI.currentName() === 'levels'
        && Levels.game === Games.byId[saved.gameId]){
      levelReturn = {id:saved.id, origin:Levels.captureReturn(saved.levelIndex)};
    }
    build(); killTimers(); blockAnswerUntil = 0;
    runId=saved.id; runRound=Store.round(); mode=saved.mode; curGame=saved.gameId ? Games.byId[saved.gameId] : null;
    curLevelIdx=saved.levelIndex; idx=saved.index; mistakes=saved.mistakes; firstTryRight=saved.firstTryRight; swiftCount=saved.swiftCount;
    plan=saved.plan.map(p=>Object.assign({},p,{game:Games.byId[p.gameId],level:Games.byId[p.gameId].levels[p.levelIndex]}));
    results=saved.results.slice(); sessionOutcomes=saved.sessionOutcomes.slice(); shaky=saved.shaky.slice(); focusKeys=saved.focusKeys.slice();
    usedItems=new Set(saved.usedItems); checkTally=saved.checkTally; announced=new Set(saved.announced); visitMilestone=saved.visitMilestone;
    const restoreTarget=t=>t ? {game:Games.byId[t.gameId],levelIndex:t.levelIndex,want:t.want||null} : null;
    adventureTarget=restoreTarget(saved.adventureTarget); firstTarget=restoreTarget(saved.firstTarget); firstPhase=saved.firstPhase;
    rewardTarget=saved.rewardKey ? {key:saved.rewardKey} : null;
    titleEl.textContent=saved.title; resumeQuestion=saved.question;
    renderPips();
    if (idx>=plan.length){finish();return true;}
    UI.show('play'); nextQuestion(); return true;
  }

  function settleCompleted(){
    const saved=Store.savedSession();
    return !!(saved && saved.index===saved.plan.length && resume(true));
  }

  function renderPips(){
    clear(pipsEl);
    plan.forEach((p,i)=>pipsEl.append(el('div.pip'+(p.intro?'.intro':p.check?'.check':'')+(results[i]?'.'+results[i]:''))));
  }

  /** Is there anything on the board the child could count right now? The recall
      levels keep the ten-frame back until the hint, and ぱっと みて hides its dots
      on purpose — telling a child to point at things that are not there is noise. */
  const COUNTABLE = '.obj, .dot, .item, .qi, .pairitem, .cell.tappable';
  function hasCountables(){
    return $$(COUNTABLE, fieldEl).some(n => {
      /* Not opacity: the whole screen fades in, and a tap during that fade is
         still a tap over things to count. ぱっと みて lays a cover over its dots. */
      if (n.closest('.flashboard:not(.open)')) return false;
      if (n.checkVisibility && !n.checkVisibility({ visibilityProperty: true })) return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }
  function disarmQuit(){
    quitArmed = false;
    clearTimeout(quitTimer);
    if (backBtn){
      backBtn.textContent = '←';
      backBtn.setAttribute('aria-label', 'もどる');
    }
  }

  /* The first tap asks. It used to turn the button into a pink「？」with the
     mistake colour and say nothing — to a child who cannot read, a telling-off
     with no way to tell what for. It is a question, so it looks like the hints,
     shows where the button goes, and says it out loud. */
  function quit(){
    if (!quitArmed){
      quitArmed = true;
      backBtn.textContent = '🏠';
      backBtn.setAttribute('aria-label', 'もういちど おすと おわる');
      showFeedback('hint', 'ここで やすむ？ もういちど おしてね');
      Sound.say('ここで休む？続きは残るよ。もう一度押してね。', { delay: 60 });
      clearTimeout(quitTimer);
      quitTimer = setTimeout(() => {
        disarmQuit();
        clearFeedback();
      }, 2600);
      return;
    }
    disarmQuit();
    // onCorrect has already checkpointed the following question before its animation.
    if (!locked) checkpoint();
    killTimers();
    Sound.hush();
    Sound.sfx.tap();
    if (mode === 'first' && firstTarget){
      const prior = FirstSteps.active;
      FirstSteps.open(firstTarget.game, firstTarget.levelIndex,
        prior && prior.game === firstTarget.game && prior.levelIndex === firstTarget.levelIndex ? prior.opts : null);
      return;
    }
    if (mode === 'level' && levelReturn && levelReturn.id === runId
        && levelReturn.origin.round === Store.round() && levelReturn.origin.gameId === curGame.id){
      Levels.returnToList(levelReturn.origin); return;
    }
    if (mode === 'level') Levels.render(curGame); else Home.render();
    UI.show(mode === 'level' ? 'levels' : 'home', { replace: true });
  }

  /* ---------- public entry points ---------- */
  function startLevel(game, levelIndex, opts){
    if(settleCompleted()) return;
    const origin = UI.currentName() === 'levels' && Levels.game === game ? Levels.captureReturn(levelIndex)
      : opts && opts.returnToLevels || null;
    build();
    killTimers();
    mode = 'level'; curGame = game; curLevelIdx = levelIndex;
    rewardTarget = opts && opts.stickerMission || null;
    adventureTarget = null;
    firstTarget = null; firstPhase = null;
    const lv = game.levels[levelIndex];
    const n = lv.n || 8;
    plan = [];
    for (let i = 0; i < n; i++) plan.push({ game, level: lv, levelIndex });
    if (needsIntro(game, levelIndex)){
      plan.unshift({ game, level: lv, levelIndex, intro: 'show' },
                   { game, level: lv, levelIndex, intro: 'together' });
    }
    plan.unshift(...checkSteps(game.id + ':' + levelIndex, 1));
    titleEl.textContent = game.name + '　' + lv.t;
    begin();
    levelReturn = origin && origin.round === Store.round() && origin.gameId === game.id ? {id:runId, origin} : null;
  }

  function startDaily(count){
    if(settleCompleted()) return;
    build();
    killTimers();
    mode = 'daily'; curGame = null; rewardTarget = null; adventureTarget = null;
    const pool = [];
    Games.list.forEach(g => {
      g.levels.forEach((lv, i) => {
        /* Daily practice is retrieval, never a surprise lesson. */
        if (levelOpen(g, i) && Store.introduced(g.id, i)) pool.push({ game: g, level: lv, levelIndex: i });
      });
    });
    if (!pool.length){                       // nothing unlocked yet — never leave an empty plan
      plan = [];
      Home.render();
      UI.show('home', { replace: true });
      return;
    }
    const n = count || 10;
    const checks = checkSteps(null, 2);
    plan = (checks.length ? shuffle(checks.concat(drawDailyPlan(pool, Math.max(4, n - checks.length))))
                          : drawDailyPlan(pool, n)).map(p => Object.assign({}, p));
    titleEl.textContent = 'きょうの れんしゅう';
    begin();
  }

  /** A short first-run sampler. It chooses a starting point; it never locks content
      or labels a child. Every game remains available from Home. */
  function startDiagnostic(){
    if(settleCompleted()) return;
    build();
    killTimers();
    mode = 'diagnostic'; curGame = null; rewardTarget = null; adventureTarget = null;
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

  /** Has this child been shown this level's method yet? A level already played, or
      met often enough in practice, counts as known ground. */
  function needsIntro(g, i){
    return introOn && g.intro !== false && !Store.introduced(g.id, i)
      && Store.plays(g.id, i) === 0 && Store.recentCount(g.id, i) < 4;
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
    if(settleCompleted()) return;
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
    mode = 'focus'; curGame = null; rewardTarget = null; adventureTarget = null;
    focusKeys = want.map(x => x.want);
    plan = [];
    /* Round-robin, not shuffled. A B C A B C spaces each fact out inside the
       sitting, which is what retrieval practice wants; massing them back to back
       would let the child copy the last answer instead of retrieving it. */
    const n = o.n || 10;
    for (let i = 0; i < n; i++) plan.push(want[i % want.length]);
    titleEl.textContent = 'とっくん';
    begin();
  }

  /** A short, supported return to a hard idea.  A level clear keeps its existing
      evidence threshold; an adventure only says that the child completed this
      four-question attempt, so it never unlocks a level by itself. */
  function startAdventure(target){
    if(settleCompleted()) return;
    const t = target;
    if (!t || !t.game || !t.level || !levelOpen(t.game, t.levelIndex)) return;
    build();
    killTimers();
    mode = 'adventure'; curGame = null; curLevelIdx = t.levelIndex;
    rewardTarget = null;
    adventureTarget = { game: t.game, levelIndex: t.levelIndex, want: t.want || null };
    const targetStep = () => ({ game: t.game, level: t.level, levelIndex: t.levelIndex, want: t.want || null });
    if (needsIntro(t.game, t.levelIndex)){
      /* show + together replace two scored questions, keeping the visit short */
      plan = [Object.assign(targetStep(), { intro: 'show' }), Object.assign(targetStep(), { intro: 'together' }),
              targetStep(), targetStep()];
    } else {
      const warmIndex = t.levelIndex > 0 && levelOpen(t.game, t.levelIndex - 1) ? t.levelIndex - 1 : t.levelIndex;
      const warm = { game: t.game, level: t.game.levels[warmIndex], levelIndex: warmIndex };
      plan = [warm, targetStep(), targetStep(), warm];
    }
    titleEl.textContent = 'ちいさな ぼうけん　' + t.game.name;
    begin();
  }

  /** Each visit stays one question long. Supported turns teach the method;
      independent turns accumulate towards a later-day check in Store. */
  function firstTitle(game, levelIndex){
    return (Store.shortStatus(game.id, levelIndex).goldActive ? 'きんへ 1もんずつ　'
      : firstPhase === 'check' ? 'べつのひの たしかめ　'
      : firstPhase === 'independent' ? 'じぶんで 1もん　' : 'はじめてコース　') + game.name;
  }

  function startFirst(game, levelIndex, phase, opts){
    if(settleCompleted()) return;
    if (!game || !game.levels[levelIndex] || !levelOpen(game, levelIndex)) return;
    if (opts && opts.gold && !Store.startShortGold(game.id, levelIndex).goldActive) return;
    build(); killTimers();
    mode = 'first'; curGame = game; curLevelIdx = levelIndex;
    rewardTarget = null; adventureTarget = null;
    firstTarget = { game, levelIndex };
    firstPhase = phase === 'independent' || phase === 'check'
      ? Store.shortStatus(game.id, levelIndex).phase : phase === 'show' ? 'show' : 'together';
    const step = { game, level: game.levels[levelIndex], levelIndex };
    plan = firstPhase === 'independent' || firstPhase === 'check' ? [step]
      : phase === 'afterShow' ? [Object.assign({}, step, { intro: 'together' })]
      : firstPhase === 'show' ? [Object.assign({}, step, { intro: 'show' })]
      : [Object.assign({}, step, { intro: 'show' }), Object.assign({}, step, { intro: 'together' })];
    titleEl.textContent = firstTitle(game, levelIndex);
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
    lastAnswerGesture = null;
    const previous = Store.savedSession();
    blockAnswerUntil = 0;
    disarmQuit();
    idx = 0; mistakes = 0; firstTryRight = 0; swiftCount = 0;
    runId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10); runRound=Store.round();
    results=[]; resumeQuestion=null;
    if (mode !== 'focus') focusKeys = [];
    usedItems = new Set(mode === 'first' && (firstPhase === 'independent' || firstPhase === 'check')
      ? Store.shortItems(curGame.id, curLevelIdx) : []);
    shaky = []; sessionOutcomes = []; visitMilestone = null;
    checkTally = {}; announced = new Set();
    renderPips();
    const unfinished = previous && (previous.index > 0 || previous.question && (previous.question.wrongThisQ || previous.question.helped
      || previous.question.draft && previous.question.draft.touched));
    if (overviewOn && (mode !== 'first' || unfinished)){
      if (!unfinished) checkpoint(0,null);
      showOverview(false,unfinished ? previous : null); return;
    }
    checkpoint(0,null);
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
        spokenAt = 0;
        if (!restoringDraft) Sound.say(lastSpeech, { delay: 220, onend(){ if (!stale()) spokenAt = performance.now(); } });
      },
      // A completed step can replace its instructions without erasing the fact
      // that this question used help, or resetting mistakes and scoring.
      clearHelp(){
        if (stale()) return;
        clearFeedback(); hintSpeech = ''; hintShown = false; walked = false;
        coach = null; hintAfter = 2;
        hintExtras = []; hintStrongFns = []; extrasShown = false;
        // Let an ongoing demonstration finish its callback: first-time lessons
        // use it to continue into the next step. The question still keeps help.
      },
      say(t, o){ if (stale()) return; lastSpeech = t; if (!restoringDraft) Sound.say(t, o); },
      afterSpeech(fn){ if (restoringDraft) return () => {}; return Sound.afterSpeech(() => { if (!stale()) fn(); }); },
      // Each game owns plain values and a render-only restore function. Multiple
      // adapters let a shared board and its later stage keep their own state.
      persist(adapter){
        if (stale() || !adapter || typeof adapter.read !== 'function' || typeof adapter.restore !== 'function') return;
        draftAdapters.set(adapter.id || 'main', adapter);
      },
      saveDraft(){ if (!stale() && !locked && !restoringDraft) checkpoint(); },
      get restoring(){ return restoringDraft; },
      /** Name the fact this question asks. `label` is what the result screen and
          the parent page will call it. Optional: a game that names nothing simply
          keeps the old purely-random behaviour. */
      item(key, label){
        if (stale() || key == null) return;
        curItem = a.game.id + ':' + key;
        curLabel = label || null;
      },
      /** For a hand-built answer surface: what the answer is. buildChoices and
          buildPad say it themselves; without this a number passed to `wrong` had
          nothing to be read against, and the miss went unclassified. */
      answer(v){ if (!stale()) curAnswer = v; },
      /** In a 集中練習 session, the fact this question is supposed to ask (the part
          of the item key after the game id), or null in a normal session.

          A generator that reads this hits the requested fact on its first build.
          One that ignores it still works: the engine re-rolls it and settles for
          the same level, which is the right topic if not the exact fact. */
      /** A check question on another day. A generator with a two-way format (two
          plates, おなじ／かわった) asks it with three instead: a coin toss confirms nothing. */
      get check(){ return !!(plan[idx] && plan[idx].check) || mode === 'first' && firstPhase === 'check'; },
      get want(){
        const w = plan[idx] && plan[idx].want;
        if (!w) return null;
        const p = a.game.id + ':';
        return w.indexOf(p) === 0 ? w.slice(p.length) : null;
      },
      /** The old one-function hint: `fn` becomes the coach's tool.
          `after` = how many mistakes before it fires (default 2, minimum 1). */
      onHint(fn, after){ if (stale()) return; a.coach({ tool: fn, after }); },
      /** What to do when the child is stuck. Everything is optional.
            tool()  — change the board into something to work with; never the answer
            text    — kana for the bubble (a string, or a function read after tool runs)
            say     — the same for the voice, written for the speech engine
            walk()  — steps for the hand: [{ at: node | () => node, say, act(), ms }]
            after   — mistakes before the tool appears (default 2)
          Calling it again (a question with several blanks) replaces what it names. */
      coach(c){
        if (stale() || !c) return;
        coach = Object.assign({}, coach || {}, c);
        if (c.after) hintAfter = Math.max(1, c.after);
        // a together-question hands its tool over as soon as it has one, before any finger
        if (!restoringDraft && demo === 'together' && c.tool && !touched && !hintShown) later(togetherHint, 30);
      },
      /** Show (and take) the correct action, for the bottom rung of the ladder.
          `buildChoices` / `buildPad` questions need nothing: the engine presses the
          right button, which runs the question's own reveal. A hand-made answer
          surface has to say how — usually one line, tapping its own right element.
          Optional: without it the engine still ends the question rather than
          leaving the child pressing wrong things forever. */
      onShow(fn){ if (!stale()) showFn = fn; },
      correct(o){ if (!stale() && !restoringDraft) onCorrect(o || {}); },
      /** `given` is what the child actually chose: a value the engine can read
          against the answer, or a tag a generator supplies for something the item
          key cannot say ('looks', 'rev'). Optional — omitting it only costs the
          diagnosis, never the behaviour. */
      wrong(target, given){ if (!stale() && !restoringDraft) onWrong(target, given); },
      /** delayed work that dies with the question */
      later(fn, ms){ if (stale() || restoringDraft) return null; return later(fn, ms); },
      get locked(){ return locked || stale(); },

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
        const surface = surfaceVersion;
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
            if (locked || stale() || surface !== surfaceVersion) return;
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
          if (o.speech){
            const say = typeof o.speech === 'function' ? o.speech(val, v) : String(o.speech);
            const hear = el('button.choice-hear', { type: 'button', 'aria-label': 'この こたえを きく',
              onclick(e){ e.stopPropagation(); Sound.sfx.tap(); Sound.say(say, { delay: 0 }); } }, '🔊');
            choicesEl.append(el('div.choice-audio', null, b, hear));
          } else choicesEl.append(b);
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
        const surface = surfaceVersion;
        choicesEl.dataset.built = '1';
        hintBtns = [];
        let settled = false;              // one accepted answer per set of buttons
        values.forEach((v, i) => {
          const val = (v && typeof v === 'object' && 'v' in v) ? v.v : v;
          const b = el('button.choice' + (o.cls ? '.' + o.cls : ''), { type: 'button' });
          const content = o.render ? o.render(val, v) : String(val);
          if (content && content.nodeType) b.append(content); else b.textContent = content;
          const hit = o.match ? o.match(val, answer) : val === answer;
          b.addEventListener('click', () => {
            if (locked || stale() || surface !== surfaceVersion) return;
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
          if (o.speech){
            const say = typeof o.speech === 'function' ? o.speech(val, v) : String(o.speech);
            const hear = el('button.choice-hear', { type: 'button',
              'aria-label': (i + 1) + 'ばんめの こたえを きく',
              onclick(e){
                e.stopPropagation();
                if (locked || stale()) return;
                Sound.sfx.tap(); Sound.say(say, { delay: 0 });
              } }, '🔊');
            const pair = el('div.choice-audio', null, b, hear);
            if (o.cls === 'story') pair.classList.add('story-audio');
            choicesEl.append(pair);
          } else choicesEl.append(b);
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
    surfaceVersion++;
    answerBtn = null; answerText = null; hintStrongFns = []; taught = false;
  }

  function resetSurface(){
    draftAdapters = new Map();
    locked = false; hintBtns = []; hintExtras = []; hintShown = false;
    hintAfter = 2; extrasShown = false;
    coach = null; hintSpeech = ''; walked = false; endWalk();
    demoRunning = false; helped = false;
    askedAt = 0; respondedMs = null; spokenAt = 0; slipAt = 0;
    curItem = null; curLabel = null; curAnswer = null; missType = null;
    hintStrongFns = []; showFn = null; answerBtn = null; answerText = null; taught = false; taughtQ = false;
    clear(fieldEl); clear(choicesEl); delete choicesEl.dataset.built;
    choicesEl.classList.remove('pad', 'three-pad', 'answer-complete');
    answerSpeech = '';
    showBtn.disabled = false;
    speakBtn.setAttribute('aria-label', 'もういちど きく');
    speakBtn.title = 'もういちど きく';
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
    const replay = step.seed !== undefined;
    const tries = replay ? 1 : step.want ? FOCUS_TRIES : TRIES;
    for (let t = 0; t < tries; t++){
      killTimers();
      resetSurface();
      try{
        if (!replay) step.seed = Math.floor(Math.random()*4294967296);
        withRandomSeed(step.seed,()=>step.level.make(api()));
      }catch(err){
        console.error('question build failed', err);
        promptTxt.textContent = 'よみこみに しっぱいしました';
        return;
      }
      if (replay || !curItem) return;
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
    if (step.check) titleEl.textContent = 'たしかめ　' + step.game.name + '　' + step.level.t;
    else if (mode === 'first') titleEl.textContent = firstTitle(step.game, step.levelIndex);
    else if (mode !== 'level'){
      const modeName = mode === 'daily' ? 'きょうの れんしゅう'
                     : mode === 'focus' ? 'とっくん'
                     : mode === 'adventure' ? 'ちいさな ぼうけん' : 'はじめの ぼうけん';
      titleEl.textContent = modeName + '　' + step.game.name;
    } else if (curGame) titleEl.textContent = curGame.name + '　' + curGame.levels[curLevelIdx].t;
    demo = step.intro || null;
    touched = false;
    drawQuestion(step);
    if (resumeQuestion){
      wrongThisQ=resumeQuestion.wrongThisQ; helped=resumeQuestion.helped;
      taughtQ=resumeQuestion.taughtQ; missType=resumeQuestion.missType;
      if (!restoreDraft(resumeQuestion.draft, step) && (helped || wrongThisQ >= hintAfter)) hint();
      resumeQuestion=null;
    }
    countEl.textContent = (idx+1)+'／'+plan.length+'もん'+(step.intro ? '　みほん・いっしょに'
      : step.check || mode === 'first' && firstPhase === 'check' ? '　たしかめ' : '');
    checkpoint();
    // hand-built answer surfaces (plates, a queue of animals, the clock hand) never
    // call buildChoices, so start their clock here
    if (!askedAt) askedAt = performance.now();
    UI.fitPlayfield(fieldEl);     // size this question to the room it has
    refit();                      // and again next frame, once fonts/SVGs have settled
    if (demo) startIntro();
    if (step.check && !announced.has(step.check)){
      announced.add(step.check);
      later(() => {
        if (locked) return;
        showFeedback('hint', 'まえに クリアした レベルを たしかめよう');
        Sound.say('前にクリアした、' + step.game.name + 'を、確かめよう。' + lastSpeech, { delay: 200 });
      }, 40);
    }
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

  const val = v => typeof v === 'function' ? v() : v;
  const hasTool = () => !!(coach && coach.tool);

  /* ---------- the hand walks through the method ----------
     Taps on the board are held off while it moves (CSS on #play.walking): a
     demonstration a finger can interrupt halfway is a demonstration of nothing.
     The steps are question timers, so leaving the question ends the walk too. */
  function endWalk(){
    walkToken++;
    if (node) node.classList.remove('walking');
    if (typeof Coach !== 'undefined') Coach.hide();
  }
  /** false when the game has nothing to show */
  function runWalk(onDone, startMs){
    let steps = null;
    if (coach && coach.walk){ try{ steps = coach.walk(); }catch(e){ console.error('walk failed', e); } }
    if (!steps || !steps.length) return false;
    walked = true;
    endWalk();
    const mine = walkToken;
    node.classList.add('walking');
    let i = 0;
    const next = () => {
      if (mine !== walkToken) return;
      if (locked){ endWalk(); return; }
      if (i >= steps.length){ endWalk(); if (onDone) onDone(); return; }
      const s = steps[i++] || {};
      let at = null;
      try{ at = typeof s.at === 'function' ? s.at() : s.at; }catch(e){}
      if (at) Coach.point(at);
      if (s.act){ try{ s.act(); }catch(e){ console.error('walk step failed', e); } }
      if (s.say) Sound.say(s.say, { delay: 0 });
      afterNarration(next, s.ms || Math.max(700, 400 + String(s.say || '').length * 170), () => mine === walkToken);
    };
    afterNarration(next, startMs == null ? 500 : startMs, () => mine === walkToken);
    return true;
  }

  /** First rung: the game's tool, in words the child hears. */
  function hint(prefix){
    hintShown = true;
    helped = true;
    checkpoint();
    const c = coach || {};
    if (c.tool){ try{ c.tool(wrongThisQ); }catch(e){ console.error('hint failed', e); } }
    let text = null, say = null;
    try{ text = val(c.text); say = val(c.say); }catch(e){ console.error('hint text failed', e); }
    hintSpeech = say || (text ? text.replace(/\s+/g, '') + '。' : '');
    showFeedback('hint', text || 'ヒントを だすね');
    Sound.say((prefix || '') + (hintSpeech || 'ヒントを出すね。'), { delay: 260 });
    /* Only a question with nothing to hand over narrows its choices here. With a
       tool on the board, greying out what the child tried turned three choices into
       one — the question could be finished without using the hint at all. */
    if (!c.tool){
      hintBtns.forEach(b => { if (b.classList.contains('tried')) b.classList.add('dim'); });
      if (wrongThisQ >= 2) dimOne();
    }
  }

  /** Second rung: the hand shows the method, and only then do the choices narrow. */
  function strongHint(){
    offerTeach();
    const stageCoach = coach;
    const narrow = () => {
      // A walk may itself complete a stage. Its old narrowing must not act on
      // the choices registered by the next stage of the same question.
      if (coach !== stageCoach) return;
      runExtras();
      hintStrongFns.forEach(fn => { try{ fn(); }catch(e){ console.error('hint failed', e); } });
      // leave exactly one wrong answer standing beside the right one
      for (let i = 0; i < 12 && hintBtns.filter(b => !b.classList.contains('dim')).length > 1; i++) dimOne();
    };
    showFeedback('hint', 'やりかたを みせるね');
    Sound.say('やり方を見せるね。よく見ててね。', { delay: 200 });
    if (!runWalk(narrow, 1500)){
      narrow();
      showFeedback('hint', 'もう ちょっと ヒントを だすね');
      Sound.say('もう少し、ヒントを出すね。', { delay: 260 });
    }
  }

  /** The way out, offered before it is taken — where the answers are, at a size a
      five-year-old hits. It lived in the speech bubble at 40px, which on an iPad
      held upright was a hand's width above the keypad the child was pressing. */
  function offerTeach(){
    if ($('.teachbtn', choicesEl)) return;
    choicesEl.append(el('button.btn.teachbtn', {
      type: 'button', onclick(e){ e.stopPropagation(); teach(); }
    }, el('span.bi', { text: '👀', 'aria-hidden': 'true' }), el('span.bl', { text: 'こたえを みる' })));
  }

  /** Bottom rung. Press the right button if there is one — that runs the question's
      own reveal, so the answer lands inside the sentence the child was reading —
      otherwise let the game show it, and end the question either way. */
  /** Answer the question the way a child would: press its own right button (which
      runs its reveal), or let the game do its right action, and end it either way. */
  function pressAnswer(onDone){
    showFeedback('hint', 'こたえは これだよ');
    // A pictured answer has no spoken name in its emoji. The highlighted choice
    // supplies the reference; do not let TTS say an incomplete「答えは、だよ」.
    const spoken = spokenAnswerLabel(answerText);
    Sound.say(spoken != null ? `答えは、${spoken}だよ。` : 'こうすると、できるよ。', { delay: 150 });
    if (answerBtn && answerBtn.isConnected && !answerBtn.disabled){
      const button = answerBtn;
      button.classList.add('showme');
      afterNarration(() => {
        if (locked) return;
        if (button.isConnected && !button.disabled) button.click();
        if (onDone) afterNarration(onDone, 800);
      }, 900);
      return;
    }
    afterNarration(() => {
      if (locked) return;
      if (showFn){ try{ showFn(); }catch(e){ console.error('show failed', e); } }
      afterNarration(() => {
        if (!locked) onCorrect({ quiet: true, delay: 1400 });
        if (onDone) onDone();
      }, 1000);
    }, 0);
  }

  function startIntro(){
    if (demo === 'show'){
      demoRunning = true; demoWalked = new Set(); demoWaits = 0;
      node.classList.add('walking');
      showFeedback('hint', 'はじめて だね。やりかたを みせるね');
      const line = '初めてだね。見ててね。' + lastSpeech;
      Sound.say(line, { delay: 350 });
      afterNarration(demoStep, Math.min(6000, 900 + line.length * 150));
      return;
    }
    later(() => {                        // after togetherHint has had its turn
      if (locked || hintShown || demo !== 'together') return;
      showFeedback('hint', 'こんどは いっしょに やって みよう');
      Sound.say('今度は、一緒にやってみよう。' + lastSpeech, { delay: 200 });
    }, 60);
  }

  /* Walk whatever the question has to walk, phase by phase (count, then ask; the
     story, then the sum), and answer once there is an answer to give. A question
     with nothing to show hands itself back rather than holding the child up. */
  function demoStep(){
    if (!demoRunning || locked) return;
    node.classList.add('walking');
    if (coach && coach.walk && !demoWalked.has(coach)){
      demoWalked.add(coach);
      if (runWalk(() => { if (demoRunning){ node.classList.add('walking'); later(demoStep, 350); } }, 150)) return;
    }
    if ((answerBtn && answerBtn.isConnected && !answerBtn.disabled) || showFn){
      pressAnswer(() => {
        if (demoRunning && !locked) later(demoStep, 350);
      });                              // another blank waits for this one's reveal
      return;
    }
    if (++demoWaits > 14){
      demoRunning = false;
      endWalk();
      showFeedback('hint', 'こんどは じぶんで やって みよう');
      Sound.say('今度は、自分でやってみよう。', { delay: 150 });
      return;
    }
    later(demoStep, 500);
  }

  function togetherHint(){
    if (locked || hintShown || touched || demo !== 'together' || !coach || !coach.tool) return;
    hint('今度は、一緒にやってみよう。' + lastSpeech);
  }

  function askForHelp(){
    if (locked || taught || demoRunning || node.classList.contains('walking')) return;
    if (!coach || (!coach.tool && !coach.walk)){ if (lastSpeech) Sound.say(lastSpeech, { delay: 40 }); return; }
    helped = true;
    checkpoint();
    if (!hintShown && coach.tool){ hint(); return; }
    if (!walked && coach.walk){
      showFeedback('hint', 'やりかたを みせるね');
      Sound.say('やり方を見せるね。よく見ててね。', { delay: 200 });
      runWalk(null, 1300);
      return;
    }
    Sound.say(hintSpeech || lastSpeech, { delay: 40 });
  }

  function teach(){
    if (locked || taught) return;
    taught = true; taughtQ = true;
    checkpoint();
    // stop the child racking up misses on a board that is already being answered
    $$('.choice', choicesEl).forEach(b => { if (b !== answerBtn) b.disabled = true; });
    const tb = $('.teachbtn', choicesEl);
    if (tb) tb.remove();
    const press = pressAnswer;
    /* 「こたえを みる」 used to say the answer and press it: the child saw *that* it
       was 3, never *why*. If the hand has not been through the method yet, it goes
       through it first, and the answer lands at the end of it. */
    if (!walked){
      showFeedback('hint', 'いっしょに みて みよう');
      Sound.say('一緒に見てみよう。', { delay: 150 });
      if (runWalk(press, 1200)) return;
    }
    endWalk();
    press();
  }

  function onWrong(target, given){
    // once the answer is being shown, taps on the old surface are not attempts
    if (locked || taught) return;
    /* an answer means the child is still playing: stand the ← down, or its timer
       clears the bubble 2.6 s later and takes this mistake's hint with it */
    disarmQuit();
    markResponse();
    wrongThisQ++;
    mistakes++;
    if (wrongThisQ === 1 && choicesEl.classList.contains('pad')
        && Math.abs(Number(given) - Number(curAnswer)) === 1) slipAt = performance.now();
    /* The first mistake is the diagnostic one — later ones are increasingly guided,
       so they say less about what the child was thinking. */
    if (!missType){
      missType = (typeof given === 'string' && MISS_KINDS[given])
        ? given
        : classifyMiss(curItem, curAnswer, given);
    }
    checkpoint();
    Sound.sfx.wrong();
    setMood('soft');
    if (target && target.classList){
      target.classList.add('wrong');
      later(() => target.classList.remove('wrong'), 460);
    }

    if (wrongThisQ === hintAfter && !hintShown){ hint(); return; }
    if (wrongThisQ >= hintAfter + TEACH_AFTER){ teach(); return; }
    if (wrongThisQ === hintAfter + STRONG_AFTER){ strongHint(); return; }
    if (wrongThisQ > hintAfter){
      /* between the rungs: still say something new. With a tool on the board the
         something is「use it」, said again; without one, one more choice goes grey. */
      if (hasTool()){
        showFeedback('hint', 'まだ ちがうね。ヒントを つかって みよう');
        Sound.say('まだ違うね。' + (hintSpeech || 'よく見てみよう。'), { delay: 260 });
      } else {
        dimOne();
        showFeedback('hint', 'まだ ちがうね。よく みて みよう');
      }
      if (wrongThisQ > hintAfter + STRONG_AFTER) offerTeach();
      return;
    }
    /* Before the hint: name the mistake if we can read it. 「1つ多く数えた」 and
       「見えている方を言った」 need different words, and the generic line said neither. */
    const line = missChild(missType, hasCountables());
    showFeedback('oops', line || 'もういちど やってみよう');
    Sound.say(line ? line.replace(/\s+/g, '') : '惜しいね。もう一度やってみよう。', { delay: 260 });
  }

  function onCorrect(o){
    if (locked) return;
    locked = true;
    disarmQuit();
    markResponse();
    clearFeedback();
    const scaffold = plan[idx].intro || null;
    const clean = wrongThisQ === 0 && !helped && !scaffold;
    if (!scaffold) sessionOutcomes.push({
      gameId: plan[idx].game.id, levelIndex: plan[idx].levelIndex, clean
    });
    // a check question in a level session belongs to the other level, not this one's stars
    const graded = !scaffold && !(mode === 'level' && plan[idx].check);
    if (clean && graded) firstTryRight++;
    if (plan[idx].check){
      const t = checkTally[plan[idx].check] || (checkTally[plan[idx].check] = { n: 0, right: 0 });
      t.n++;
      if (clean) t.right++;
    }
    const g = plan[idx].game;
    const timed = g.fluent && clean ? respondedMs : null;
    if (graded && timed != null && timed <= FLUENT_FAST_MS) swiftCount++;
    if (slipAt && wrongThisQ === 1 && performance.now() - slipAt < PAD_SLIP_MS
        && (missType === 'up' || missType === 'down')) missType = null;
    if (scaffold === 'together' && !taughtQ && (mode === 'level' || mode === 'adventure' || mode === 'first')){
      Store.markIntroduced(g.id, plan[idx].levelIndex);
      if (mode === 'first'){
        Store.startShortCourse(g.id, plan[idx].levelIndex);
      }
    }
    // Completing a supported visit also gives relief when the child needed the
    // final demonstration. It does not mark that method as learned.
    if (scaffold === 'together' && mode === 'first') Store.noteShortSupport(g.id, plan[idx].levelIndex);
    if (mode !== 'diagnostic'){
      const kind = scaffold === 'show' || taughtQ ? 'viewed' : scaffold === 'together' ? 'together'
        : helped ? 'supported' : wrongThisQ ? 'revised' : 'independent';
      Store.recordMilestone(g.id, plan[idx].levelIndex, kind, curLabel);
      if (!visitMilestone || Store.milestoneRank(kind) >= Store.milestoneRank(visitMilestone.kind))
        visitMilestone = { gameId: g.id, levelIndex: plan[idx].levelIndex, kind, label: curLabel || '' };
    }
    if (mode !== 'diagnostic' && !scaffold){
      const short = mode === 'first' && (firstPhase === 'independent' || firstPhase === 'check');
      if (short) Store.recordShortAnswer(g.id, plan[idx].levelIndex, clean, runId, firstPhase, Array.from(usedItems),
        {kind:taughtQ ? 'viewed' : helped ? 'supported' : wrongThisQ ? 'revised' : 'independent', missType});
      if (short && clean) Store.markIntroduced(g.id, plan[idx].levelIndex);
      Store.noteOutcome(g.id, plan[idx].levelIndex, clean, !short);
      if (curItem){
        /* 'taught' outranks the reading of the first mistake: what matters about
           this question is that the child did not get there on their own. */
        Store.noteFact(curItem, clean, curLabel, g.id + ':' + plan[idx].levelIndex, timed,
                       taughtQ ? 'taught' : missType);
        if (!clean && !shaky.some(x => x.key === curItem)){
          shaky.push({ key: curItem, label: curLabel || plan[idx].game.name });
        }
      }
    }
    // Count the answer on the actual day it happened, even if the child rests now.
    Store.countToday(1);
    results[idx]=scaffold ? 'introdone' : clean ? 'done' : 'miss';
    checkpoint(idx+1,null);
    Sound.sfx.correct();
    setMood('happy');
    const pip = $$('.pip', pipsEl)[idx];
    if (pip){ pip.classList.remove('now'); pip.classList.add(scaffold ? 'introdone' : clean ? 'done' : 'miss'); }
    if (!o.quiet && scaffold !== 'show'){
      UI.bigMark('◯');
      const praise = wrongThisQ === 0
        ? pick(['やったね！', '正解！', 'すごい！', '上手だね！', 'ばっちり！', 'その調子！'])
        : pick(['できたね！', 'よく頑張ったね！', 'その通り！']);
      Sound.say(praise, { delay: 320 });
    }
    if ((idx + 1) % 4 === 0) UI.confetti(22);
    const spoken = spokenAnswerLabel(answerText);
    answerSpeech = [curLabel, spoken != null ? '答えは、' + spoken + 'だよ。'
      : !curLabel ? 'できたね。絵を確かめてみよう。' : ''].filter(Boolean).join('。');
    speakBtn.setAttribute('aria-label', 'こたえを もういちど きく');
    speakBtn.title = 'こたえを もういちど きく';
    showBtn.disabled = true;
    const manual = scaffold !== 'show' && !(autoAdvanceOverride === null
      ? Store.data.autoAdvance === true : autoAdvanceOverride);
    const mine = epoch;
    let ready = false, moved = false;
    const advance = () => {
      if (!ready || moved || mine !== epoch || !locked || UI.currentName() !== 'play') return;
      moved = true; advancePending = null; nextBtn.disabled = true;
      answerControls.hidden = true;
      if (manual) blockAnswerUntil = performance.now() + 300;
      idx++;
      if (idx >= plan.length) finish();
      else if (breaksOn && idx % 4 === 0 && mode !== 'first') showOverview(true);
      else {
        nextQuestion();
        if (manual){
          promptTxt.setAttribute('tabindex', '-1');
          promptTxt.focus({preventScroll:true});
        }
      }
    };
    if (manual){
      // Keep the completed picture and selected answers. The full keypad is no
      // longer needed, leaving room for both the picture and a large Next button.
      node.classList.add('answer-review');
      choicesEl.classList.add('answer-complete');
      Array.from(choicesEl.children).forEach(n => n.classList.toggle('answer-keep',
        n.classList.contains('correct') || !!n.querySelector('.correct')));
      $$('button', fieldEl).concat($$('button', choicesEl)).forEach(b => { b.disabled = true; });
      answerControls.hidden = false;
      nextBtn.disabled = true;
      advancePending = advance;
      refit();
    }
    // Generators provide the complete reveal duration. Narration may take longer;
    // both pacing modes wait for it before a manual or automatic transition.
    afterNarration(() => {
      if (mine !== epoch || UI.currentName() !== 'play') return;
      ready = true;
      if (manual){ nextBtn.disabled = false; nextBtn.focus({preventScroll:true}); }
      else advance();
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
    if (mode === 'first'){
      Store.clearSavedSession();
      FirstSteps.finish(firstTarget.game, firstTarget.levelIndex, firstPhase, visitMilestone);
      return;
    }
    // the lesson questions are not graded, and neither are another level's checks
    const total = plan.filter(p => !p.intro && !(mode === 'level' && p.check)).length;
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
    /* A first clear with every answer right first time earns both stickers — the
       clear and the gold — exactly as the book promises. Handing out only the
       plain one while the screen said「きんの シール」left the gold slot empty. */
    const newStickers = [];
    /* The last sticker on the shelf is the moment the 小1 classroom opens, and the
       child has to be told so on the screen they are already looking at. Read the
       gate before the sticker is handed out, so「もう開いていた」and「いま開いた」
       stay distinguishable. */
    const wasOpen = Progress.g1Open();
    const confirmed = [];
    Object.keys(checkTally).forEach(k => {
      const t = checkTally[k];
      if (t.n < CHECK_N) return;
      if (t.right >= CHECK_PASS){ if (Store.confirmSticker(k)) confirmed.push(k); }
      else Store.failCheck(k);
    });
    if (mode === 'level'){
      const key = curGame.id + ':' + curLevelIdx;
      Store.recordLevel(curGame.id, curLevelIdx, stars, firstTryRight, total, true);
      if (swift) Store.recordSwift(curGame.id, curLevelIdx);
      /* A sticker means "cleared", so it waits for a pass — and below ★★★ it waits
         for another day too. Eight right first time is not something guessing
         reaches, so ★★★ is confirmed on the spot; so is a pass on a later day. */
      if (stars >= 1){
        if (!Store.hasSticker(key)){
          if (stars === 3) Store.addSticker(key); else Store.addPending(key);
          newStickers.push({ key, emoji: stickerFor(key), gold: false, pending: stars < 3 });
        } else if (Store.isPending(key) && (stars === 3 || Store.pendingFrom(key) < Store.dayNumber())){
          if (Store.confirmSticker(key)) confirmed.push(key);
        }
      }
      if (stars === 3 && Store.addSticker(key + ':g')){
        newStickers.push({ key: key + ':g', emoji: stickerFor(key + ':g'), gold: true });
      }
    } else if (mode === 'adventure'){
      /* This sticker is a completion memento, not a mastery badge.  It is one per
         calendar day so a child can finish feeling successful without being led
         into a reward loop of identical short sessions. */
      const key = 'adventure:' + Store.todayKey();
      if (Store.addSticker(key)) newStickers.push({ key, emoji: stickerFor(key), adventure: true });
    } else if (mode === 'diagnostic'){
      const recommended = Diagnostic.recommendFrom(sessionOutcomes);
      Store.recordDiagnostic(sessionOutcomes, recommended);
    } else {
      if (mode === 'daily'){
        Store.recordPractice(firstTryRight, total, true);
        Store.completePracticeToday();
      } else Store.recordFocus(firstTryRight, total, true);
      // one sticker per calendar day, per set
      const key = (mode === 'daily' ? 'daily:' : 'focus:') + Store.todayKey();
      if (Store.addSticker(key)) newStickers.push({ key, emoji: stickerFor(key), gold: stars === 3 });
    }
    /* The two lesson questions and another level's three checks are not graded, but
       they were answered: leaving them out of today's count let a first-time level with
       a check run to 13 questions while「きょうは ここまで」still counted 8. */
    Store.clearSavedSession();
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
                  stickers: newStickers, confirmed: confirmed.map(k => ({ key: k, emoji: stickerFor(k) })),
                  shaky: mode === 'diagnostic' ? [] : shaky.slice(0, 3),
                  focusKeys: focusKeys.slice(), swift, unlockedG1: justOpenedG1,
                  recommended: mode === 'diagnostic' ? Diagnostic.recommendFrom(sessionOutcomes) : null,
                  lastGameId: primaryGameId, rewardTarget, adventureTarget, milestone: visitMilestone });
  }

  return {
    startLevel, startDaily, startFocus, startAdventure, startFirst, startDiagnostic, build, resume, pendingSummary, pendingSummaries,
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
      get taughtQ(){ return taughtQ; },
      get wrongThisQ(){ return wrongThisQ; },
      get planItems(){ return plan.map(p => p.want || null); },
      /** the first-meeting questions are on by default; most of the suite tests the rest */
      intro(on){ introOn = !!on; },
      overview(on){ overviewOn=!!on; },
      breaks(on){ breaksOn=!!on; },
      // Legacy grading suites explicitly choose their former automatic pacing;
      // the dedicated pacing suite exercises the persisted/default child flow.
      autoAdvance(on){ autoAdvanceOverride = on == null ? null : !!on; },
      get introStep(){ return plan[idx] ? plan[idx].intro || null : null; },
      get planIntro(){ return plan.map(p => p.intro || null); },
      get planChecks(){ return plan.map(p => p.check || null); },
      get helped(){ return helped; },
      get touched(){ return touched; }
    }
  };
})();
