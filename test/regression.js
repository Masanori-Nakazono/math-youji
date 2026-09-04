/* ===========================================================
   Regression suite for かずのぼうけん.
   Runs inside the app page and drives it the way a child would:
   it answers questions and then checks what happened afterwards.

   It exists because the original checks only ever called level.make() —
   they proved questions could be *built*, and every interaction bug in
   the first review lived in what happened after an answer was tapped.
   =========================================================== */
(function(){
  'use strict';

  const K = window.KazuApp;
  const S = K.Session._test;
  const doc = document;
  const results = [];
  let uncaught = 0;
  window.addEventListener('error', () => uncaught++);

  const q  = sel => doc.querySelector(sel);
  const qa = sel => Array.from(doc.querySelectorAll(sel));
  function check(name, ok, detail){ results.push({ name, ok: !!ok, detail: ok ? '' : (detail || '') }); }

  /* ---------- helpers ---------- */
  function liveChoices(){
    return qa('#play .choices .choice').filter(b => !b.disabled && !b.classList.contains('correct'));
  }
  /* Every surface the app uses for "give your answer". Driving all of them is the
     point: a bug that only shows up on plates or queue items is still a bug. */
  const ANSWER_SEL = [
    '#play .choices .choice', '#play .choices .plate', '#play .choices .clock-choice',
    '#play .playfield .plate', '#play .playfield .qi', '#play .playfield .mrow',
    '#play .playfield .vessel', '#play .playfield .shapebtn',
    '#play .obj', '#play .cell.tappable'
  ].join(', ');
  function candidates(){
    return qa(ANSWER_SEL).filter(n => !n.disabled
      && !n.classList.contains('correct') && !n.classList.contains('picked')
      && !n.classList.contains('counted') && !n.classList.contains('dim'));
  }
  /** tap answers until the question is accepted; false when nothing is tappable */
  function answerOnce(){
    // 「まえから Nこ」は the first N animals as a set; random tapping is not a
    // meaningful driver and can keep clearing the set forever by chance.
    const ordinalCount = (q('#play .prompt .txt') && q('#play .prompt .txt').textContent || '')
      .match(/まえから\s*(\d+)こ/);
    if (ordinalCount){
      qa('#play .queue .qi').slice(0, Number(ordinalCount[1])).forEach(x => x.click());
      return true;
    }
    // drag-and-drop questions: pick a piece, then try each destination
    const piece = q('#play .tile:not(.gone)') || q('#play .shapetile:not(.used)');
    if (piece){
      piece.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
      const targets = qa('#play [data-drop]');
      for (const t of targets){
        const was = S.locked;
        t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        if (S.locked !== was) return true;
        if (piece.classList.contains('gone') || piece.classList.contains('used')) return true;
      }
      return false;
    }
    const list = candidates().sort(() => Math.random() - 0.5);   // pair-matching needs varied order
    if (!list.length) return false;
    for (const n of list){
      const was = S.locked;
      n.click();
      if (n.classList.contains('correct') || S.locked !== was) return true;
    }
    return true;   // taps landed (counting objects, filling a frame): make progress and re-check
  }
  function blanks(){ return qa('#play .nn.gap, #play .car.blank').length; }
  function pipsDone(){ return qa('#play .pip.done, #play .pip.miss').length; }
  function onResult(){ return !doc.getElementById('result').hidden; }
  function leavePlay(){
    const back = q('#play .backbtn');
    back.click();
    back.click();
  }

  const eachLevel = fn => K.Games.list.forEach(g => g.levels.forEach((lv, li) => fn(g, li, lv)));

  /* ---------- 1. every level builds, repeatedly, without throwing or hanging ---------- */
  (function buildStorm(){
    const bad = [];
    const t0 = performance.now();
    eachLevel((g, li) => {
      for (let n = 0; n < 25; n++){
        try{ K.Session.startLevel(g, li); }
        catch(e){ bad.push(g.id + '/L' + li + ': ' + e.message); break; }
      }
    });
    const ms = performance.now() - t0;
    check('all levels build 25x without throwing', !bad.length, bad.slice(0, 4).join(' | '));
    // a rejection-sampling loop that stopped terminating would show up here first
    check('build storm finishes promptly (<20s)', ms < 20000, Math.round(ms) + 'ms');
  })();

  /* ---------- 2. answering never skips or auto-completes a question ---------- */
  (function answerFlow(){
    const skipped = [], overshoot = [], stuck = [];
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      let guard = 0;
      while (!onResult() && guard++ < 80){
        const before = S.idx;
        const b0 = blanks();
        if (!answerOnce()){ S.flushTimers(); continue; }   // interaction-only question
        S.flushTimers();
        const advanced = S.idx - before;
        // C1: a multi-blank question must not finish while blanks remain
        if (advanced > 0 && b0 >= 2) skipped.push(g.id + '/L' + li + ' finished with ' + b0 + ' blanks left');
        if (advanced > 1) overshoot.push(g.id + '/L' + li + ' advanced ' + advanced);
      }
      if (!onResult() && guard >= 80) stuck.push(g.id + '/L' + li);
    });
    check('no question completes while blanks remain (C1)', !skipped.length, skipped.slice(0, 4).join(' | '));
    check('one answer never advances more than one question', !overshoot.length, overshoot.slice(0, 4).join(' | '));
    // these need a gesture the suite cannot fake (finger tracing, hand-setting a
    // clock, taking exactly N objects); everything else must be playable to the end
    const expectStuck = ['trace/L0', 'trace/L1', 'trace/L2', 'count/L2', 'clock/L2'];
    const unexpected = stuck.filter(s => expectStuck.indexOf(s) < 0);
    check('every level is playable through to the result screen', !unexpected.length, unexpected.join(' | '));
  })();

  /* ---------- 3. leaving a question kills its pending work (C3) ---------- */
  (function staleTimers(){
    K.Session.startLevel(K.Games.byId.bond, 0);
    answerOnce();                                   // schedules "advance to next question"
    leavePlay();                                    // confirm, then leave before it fires
    K.Session.startLevel(K.Games.byId.numeral, 0);
    const idxAtStart = S.idx;
    S.flushTimers();
    check('leaving a question cannot advance the next level (C3)',
      S.idx === idxAtStart && idxAtStart === 0, 'idx=' + S.idx);

    // and a slow story animation must not paint into whatever came after it
    K.Session.startLevel(K.Games.byId.add, 1);
    leavePlay();
    K.Session.startLevel(K.Games.byId.seq, 0);
    S.flushTimers();
    check('a story animation cannot write into the next question',
      !q('#play .eq') && !!q('#play .numline'), 'eq=' + !!q('#play .eq'));
  })();

  /* ---------- 4. no listener accumulation on the shared answer strip (M1) ---------- */
  (function listenerLeak(){
    const before = uncaught;
    for (let i = 0; i < 4; i++){
      K.Session.startLevel(K.Games.byId.bond, 0);
      answerOnce(); S.flushTimers();
    }
    K.Session.startLevel(K.Games.byId.compare, 0);
    answerOnce(); S.flushTimers();
    check('playing いくつと いくつ leaves no handlers behind (M1)', uncaught === before,
      (uncaught - before) + ' uncaught errors');
  })();

  /* ---------- 5. hints appear exactly once, and something visible always happens ---------- */
  (function hints(){
    const noisy = [], silent = [];
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      const btns = liveChoices();
      if (btns.length < 2) return;                 // needs a wrong answer to click
      const before = q('#play').innerHTML.length;
      for (let i = 0; i < 5; i++){
        const wrong = liveChoices().filter(b => !b.classList.contains('correct'));
        if (!wrong.length) break;
        wrong[0].click();
        if (wrong[0].classList.contains('correct')) break;
      }
      const hintTexts = qa('#play .playfield .hintline').map(x => x.textContent.trim());
      if (new Set(hintTexts).size < hintTexts.length)
        noisy.push(g.id + '/L' + li + ' duplicate: ' + hintTexts.join(' / '));
      const changed = q('#play').innerHTML.length !== before;
      const dimmed = qa('#play .choice.dim').length > 0;
      const chip   = !q('#play .feedback').hidden;
      if (!(changed || dimmed || chip)) silent.push(g.id + '/L' + li);
    });
    check('a hint is never stacked up on repeated wrong answers (M4)', !noisy.length, noisy.slice(0, 4).join(' | '));
    check('two wrong answers always change something on screen (M5)', !silent.length, silent.slice(0, 6).join(' | '));
  })();

  /* ---------- 6. motor slips do not lower the child's mathematics score ---------- */
  (function traceHonesty(){
    K.Session.startLevel(K.Games.byId.trace, 0);
    const box = q('#play .tracebox');
    const r = box.getBoundingClientRect();
    const fire = (type, x, y) => box.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 }));
    for (let i = 0; i < 4; i++){ fire('pointerdown', r.left + 4, r.bottom - 4); fire('pointerup', r.left + 4, r.bottom - 4); }
    check('missing the tracing start point gives guidance without lowering math stars',
      S.mistakes === 0 && !!q('#play .trace-ghost'), 'mistakes=' + S.mistakes);
  })();

  /* ---------- 7. clock hours use clock readings, not counting readings ---------- */
  (function clockReadings(){
    const want = { 1:'いちじ', 4:'よじ', 7:'しちじ', 9:'くじ', 12:'じゅうにじ' };
    const bad = Object.keys(want).filter(h => K.jiKana(+h) !== want[h])
                      .map(h => h + '→' + K.jiKana(+h));
    check('clock hours read よじ / しちじ / くじ', !bad.length, bad.join(', '));
  })();

  /* ---------- 8. every tappable thing is also keyboard operable ---------- */
  (function keyboard(){
    const bad = new Set();
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      qa('#play [role="button"]').forEach(n => {
        if (n.tagName !== 'BUTTON' && n.dataset.tap !== '1') bad.add(g.id + '/L' + li + ' ' + n.className);
      });
    });
    check('no role=button without keyboard support', !bad.size, Array.from(bad).slice(0, 4).join(' | '));
  })();

  /* ---------- 9. answer sets stay fair ---------- */
  (function choiceSanity(){
    const bad = new Set();
    eachLevel((g, li) => {
      for (let n = 0; n < 12; n++){        // 540 samples across the 45 levels
        K.Session.startLevel(g, li);
        const strip = q('#play .choices');
        if (!strip || strip.dataset.built !== '1') continue;   // hand-built strips may repeat by design (5と5で10)
        const btns = qa('#play .choices .choice');
        if (!btns.length) continue;
        const labels = btns.map(b => b.textContent.trim());
        if (new Set(labels).size !== labels.length) bad.add(g.id + '/L' + li + ' duplicate labels');
        if (btns.length < 2) bad.add(g.id + '/L' + li + ' single choice');
      }
    });
    check('answer sets have no duplicate labels', !bad.size, Array.from(bad).slice(0, 4).join(' | '));
  })();

  /* ---------- 10. one sticker per slot, no repeats ---------- */
  (function stickers(){
    const keys = [];
    K.Games.list.forEach(g => g.levels.forEach((lv, li) => { keys.push(g.id + ':' + li, g.id + ':' + li + ':g'); }));
    const emo = keys.map(K.stickerFor);
    check('every sticker slot has its own emoji',
      new Set(emo).size === emo.length && keys.length <= K.STICKER_POOL.length,
      keys.length + ' slots / ' + K.STICKER_POOL.length + ' emoji / ' + new Set(emo).size + ' unique');
  })();

  /* ---------- 11. records survive leaving this origin ---------- */
  (function backup(){
    K.Store.reset();
    K.Store.recordLevel('bond', 0, 3, 8, 8);
    K.Store.recordLevel('count', 1, 2, 6, 8);
    K.Store.addSticker('bond:0');
    K.Store.recordDiagnostic([{ gameId: 'count', levelIndex: 0, clean: true }],
      { gameId: 'flash', levelIndex: 0 });
    K.Store.recordMission({ day: '2026-01-02', id: 'backup-mission', gameId: 'count',
      text: '3こ かぞえる', prompt: 'ひとつずつ' });
    K.Store.completeMission('2026-01-02');
    const text = K.Store.exportText();
    const starsBefore = JSON.stringify(K.Store.data.stars);
    const seenBefore  = JSON.stringify(K.Store.data.seen);

    // a wiped browser, then a restore
    K.Store.reset();
    const r1 = K.Store.importText(text, 'replace');
    check('a backup restores the records exactly',
      r1.ok && JSON.stringify(K.Store.data.stars) === starsBefore && K.Store.hasSticker('bond:0')
        && K.Store.data.diagnostic.recommended.gameId === 'flash'
        && K.Store.mission('2026-01-02').done,
      r1.msg || 'import failed');

    // importing the same file twice must not double any number
    K.Store.importText(text, 'merge');
    K.Store.importText(text, 'merge');
    check('importing the same backup twice does not inflate anything',
      JSON.stringify(K.Store.data.seen) === seenBefore && JSON.stringify(K.Store.data.stars) === starsBefore,
      'seen=' + JSON.stringify(K.Store.data.seen));

    // merging keeps the better of the two sides
    K.Store.recordLevel('bond', 0, 1, 2, 8);          // a worse attempt
    K.Store.importText(text, 'merge');
    check('merging keeps the higher star count', K.Store.stars('bond', 0) === 3,
      'stars=' + K.Store.stars('bond', 0));

    const bad = K.Store.importText('{"nope":1}', 'merge');
    const junk = K.Store.importText('not json at all', 'merge');
    check('a wrong file is rejected without destroying the records',
      !bad.ok && !junk.ok && K.Store.stars('bond', 0) === 3, 'bad=' + bad.ok + ' junk=' + junk.ok);

    const intact = JSON.stringify(K.Store.data);
    const nullStickers = K.Store.importText('{"stars":{},"stickers":null}', 'replace');
    const nullMissions = K.Store.importText('{"stars":{},"missions":null}', 'replace');
    const badFacts = K.Store.importText('{"stars":{},"facts":{"ten:3":null}}', 'replace');
    check('a structurally broken backup is rejected atomically',
      !nullStickers.ok && !nullMissions.ok && !badFacts.ok
        && JSON.stringify(K.Store.data) === intact
        && Array.isArray(K.Store.data.stickers) && K.Store.data.missions,
      'stickers=' + nullStickers.ok + ' missions=' + nullMissions.ok + ' facts=' + badFacts.ok);

    K.Store.recordMission({ day: '2026-02-03', id: 'mission-a', gameId: 'count',
      text: 'A', prompt: 'A' });
    K.Store.completeMission('2026-02-03');
    const foreign = JSON.parse(K.Store.exportText());
    foreign.data.missions['2026-02-03'] = {
      day: '2026-02-03', id: 'mission-b', gameId: 'count',
      text: 'B', prompt: 'B', done: false, reviewed: false
    };
    K.Store.importText(JSON.stringify(foreign), 'merge');
    check('backup merge never transfers completion to different mission text',
      K.Store.mission('2026-02-03').id === 'mission-a' && K.Store.mission('2026-02-03').done,
      JSON.stringify(K.Store.mission('2026-02-03')));
  })();

  /* ---------- 12. a second tap on the answer must not answer twice ----------
     Children double-tap. The picked button was never disabled (only its
     neighbours were), so a second tap re-ran onPick: in a question with two
     blanks that skipped a blank and then threw, stranding the child on a
     question they could no longer finish. */
  (function doubleTap(){
    let stuck = null, threw = null;
    [['seq', 0], ['seq', 1], ['pattern', 2]].forEach(([id, li]) => {
      for (let trial = 0; trial < 5 && !stuck; trial++){
        K.Session.startLevel(K.Games.byId[id], li);
        let guard = 0;
        while (!onResult() && guard++ < 240){
          const btns = qa('#play .choices .choice').filter(b => !b.disabled);
          for (const b of btns){
            b.click(); b.click(); b.click();       // one child, three taps
            if (b.classList.contains('correct')) break;
          }
          try{ S.flushTimers(); }catch(e){ threw = threw || e.message; }
        }
        if (!onResult()) stuck = id + '/L' + li;
      }
    });
    check('tapping the correct answer twice cannot skip a blank or strand the question',
      !stuck && !threw, (stuck ? 'stuck at ' + stuck : '') + (threw ? ' threw: ' + threw : ''));
  })();

  /* ---------- 13. a level session covers distinct facts ----------
     Before the shuffle bag these levels drew independently every question, so
     「10の おともだち L2」 averaged 5.7 distinct facts out of its 9 and finished
     without ever asking three of them. Floors below sit well above that. */
  (function coverage(){
    const worst = [];
    // [game, level, questions, floor for the mean number of distinct facts]
    [['ten', 1, 7.0], ['clock', 0, 7.0], ['bond', 0, 6.5], ['trace', 0, 3]].forEach(([id, li, floor]) => {
      const g = K.Games.byId[id], per = g.levels[li].n || 8;
      let total = 0;
      const RUNS = 10;
      for (let r = 0; r < RUNS; r++){
        K.Store.reset();
        const seen = [];
        K.Session.startLevel(g, li);
        for (let i = 0; i < per && !onResult(); i++){
          seen.push(S.item);
          S.forceCorrect();        // drive every level the same way, clickable or not
          S.flushTimers();
        }
        total += new Set(seen.filter(Boolean)).size;
      }
      const mean = total / RUNS;
      if (mean < floor) worst.push(id + '/L' + li + ' ' + mean.toFixed(1) + ' < ' + floor);
    });
    K.Store.reset();
    check('one session works through the fact set instead of redrawing at random',
      !worst.length, worst.join(' | '));
  })();

  /* ---------- 14. stars grade the pass, and the gate is real but escapable ---------- */
  (function gate(){
    K.Store.reset();
    // a session where nothing is answered right first time
    K.Store.recordLevel('ten', 1, 0, 1, 8);
    check('a session under half right earns no star and does not open the next level',
      K.Store.stars('ten', 1) === 0 && !K.Store.levelUnlocked('ten', 2),
      'stars=' + K.Store.stars('ten', 1) + ' unlocked=' + K.Store.levelUnlocked('ten', 2));

    K.Store.recordLevel('ten', 1, 0, 1, 8);
    K.Store.recordLevel('ten', 1, 0, 1, 8);
    check('three honest attempts open the next level anyway, so nobody is stuck',
      K.Store.levelUnlocked('ten', 2), 'plays=' + K.Store.plays('ten', 1));

    K.Store.reset();
    K.Store.recordLevel('bond', 0, 2, 6, 8);
    check('a clear pass opens the next level', K.Store.levelUnlocked('bond', 1) && K.Store.stars('bond', 0) === 2,
      'stars=' + K.Store.stars('bond', 0));
  })();

  /* ---------- 15. きょうの れんしゅう aims at what the child is missing ---------- */
  (function aimed(){
    K.Store.reset();
    const today = Math.floor(Date.now() / 86400000);
    K.Games.list.forEach(g => g.levels.forEach((lv, i) => {
      K.Store.data.stars[g.id + ':' + i] = 2;
      K.Store.data.recent[g.id + ':' + i] = '1'.repeat(28) + '01';   // solid
      K.Store.data.last[g.id + ':' + i] = today;
    }));
    ['bond', 'ten'].forEach(id => [0, 1, 2].forEach(i => {
      K.Store.data.recent[id + ':' + i] = '1'.repeat(7) + '0'.repeat(23);   // struggling
    }));
    const tally = {};
    const DAYS = 120;
    for (let d = 0; d < DAYS; d++){
      K.Session.startDaily(10);
      S.planGames.forEach(k => { const g = k.split(':')[0]; tally[g] = (tally[g] || 0) + 1; });
    }
    const weak = ((tally.bond || 0) + (tally.ten || 0)) / DAYS;
    // a stage that has not been opened yet is not in the pool, and not being asked
    // about is the point of it — only the open half has to keep showing up
    const others = K.Games.list.filter(g => g.id !== 'bond' && g.id !== 'ten' && K.stageOpen(g));
    const everyoneAppears = others.every(g => (tally[g.id] || 0) > 0);
    check('the daily set aims at the weak topics without abandoning the rest',
      weak >= 2.5 && everyoneAppears,
      'weak=' + weak.toFixed(2) + '/day, all others present=' + everyoneAppears);
    K.Store.reset();
  })();

  /* ---------- 15b. にがて あつめ actually concentrates on the weak facts ----------
     きょうの れんしゅう is a review instrument: measured over three weeks it gives one
     particular make-ten fact about a turn a fortnight, and leaves two or three of the
     nine untouched. Nothing in the app could ask the same fact twice in one sitting,
     because the shuffle bag that stops a level repeating itself also stops it
     concentrating. This set is the other half of that pair. */
  (function focusSet(){
    K.Store.reset();
    const weak = ['ten:ten:3', 'ten:ten:6', 'ten:ten:9'];
    weak.forEach(k => { for (let i = 0; i < 4; i++) K.Store.noteFact(k, false, k, 'ten:1'); });
    // a fact they are solid on must not be dragged into the practice set
    for (let i = 0; i < 4; i++) K.Store.noteFact('ten:ten:5', true, '5 と 5 で 10', 'ten:1');
    K.Store.recordLevel('ten', 0, 3, 8, 8);                    // so ten L2 is open

    const picked = K.Store.weakFacts(4).map(w => w.key);
    const onlyWeak = picked.length === 3 && picked.every(k => weak.indexOf(k) >= 0);

    K.Session.startFocus(picked, { n: 10 });
    const mode = S.mode;
    const counts = {};
    for (let i = 0; i < 10 && !onResult(); i++){
      if (S.item) counts[S.item] = (counts[S.item] || 0) + 1;
      S.forceCorrect(); S.flushTimers();
    }
    const reps = weak.map(k => counts[k] || 0);
    const least = Math.min.apply(null, reps);
    check('にがて あつめ meets every weak fact several times in one sitting',
      onlyWeak && mode === 'focus' && least >= 3,
      'picked=' + picked.join(',') + ' reps=' + reps.join('/'));

    // an old record from before origins were kept has nowhere to be asked again
    K.Store.reset();
    K.Store.noteFact('ten:ten:2', false, '2 と 8 で 10');
    check('a fact with nowhere to be asked again is never offered as practice',
      K.Store.weakFacts().length === 0, JSON.stringify(K.Store.weakFacts()));

    // and aiming at nothing must never leave the child on an empty plan
    K.Store.recordLevel('count', 0, 3, 8, 8);
    K.Session.startFocus(['ten:ten:2'], { n: 10 });
    check('an aimed set with nothing to aim at falls back to きょうの れんしゅう',
      S.mode === 'daily' && S.planLength === 10, 'mode=' + S.mode + ' n=' + S.planLength);
    K.Store.reset();
  })();

  /* ---------- 15c. the result screen offers the way back to what went wrong ----------
     It used to name the shaky facts and then put「つぎの レベルへ」as the only bright
     button: the diagnosis was printed and then walked past. */
  (function resultActs(){
    K.Store.reset();
    for (let i = 0; i < 3; i++) K.Store.noteFact('ten:ten:3', false, '3 と 7 で 10', 'ten:1');
    K.Store.recordLevel('ten', 0, 3, 8, 8);
    K.Result.show({ stars: 1, right: 5, total: 8, mode: 'level', game: K.Games.byId.ten,
                    levelIndex: 1, sticker: null, focusKeys: [],
                    shaky: [{ key: 'ten:ten:3', label: '3 と 7 で 10' }] });
    const chip = q('#result button.shakyitem');
    const acts = qa('#result .result-actions .btn').map(b => b.textContent);
    check('the facts the result names can be practised straight from it',
      !!chip && acts[0] === 'にがてを れんしゅう',
      'chip=' + !!chip + ' actions=' + acts.join(' / '));
    K.Store.reset();
  })();

  /* ---------- 15d. day one starts where the roadmap says it starts ----------
     Every level scores the same on need and staleness before the child has met any
     of them, so `focus` was the only thing separating them — which put いくつと
     いくつ, the hardest thing in the app, in front of a child who could not yet
     count to ten. The README's roadmap existed only as prose on the parent page. */
  (function dayOne(){
    K.Store.reset();
    const tally = {};
    const DAYS = 60;
    for (let d = 0; d < DAYS; d++){
      K.Session.startDaily(10);
      S.planGames.forEach(k => {
        const w = (K.Games.byId[k.split(':')[0]] || {}).world;
        tally[w] = (tally[w] || 0) + 1;
      });
    }
    const shima = (tally.shima || 0) / DAYS, yama = (tally.yama || 0) / DAYS;
    check('a child with no record yet starts in かずの しま, not on the hardest thing in the app',
      shima > yama * 1.5 && yama > 0.4,
      'shima=' + shima.toFixed(2) + '/day, yama=' + yama.toFixed(2) + '/day');
    K.Store.reset();
  })();

  /* ---------- 16. the かさくらべ hint has to be a valid way to compare ----------
     It tells the child to count squares. The squares therefore have to be one size
     across every glass, and they have to divide the juice exactly — otherwise the
     hint teaches the very mistake 1年生「かさくらべ」 exists to prevent, and roughly
     2% of the time it points at the wrong glass. */
  (function capacityHint(){
    const wrong = [];
    let seen = 0;
    for (let i = 0; i < 200 && wrong.length < 3; i++){
      K.Session.startLevel(K.Games.byId.measure, 1);
      const svgs = qa('#play .vessel svg');
      if (svgs.length < 2) continue;                 // that draw was a length question
      seen++;
      const glass = svgs.map(sv => {
        const water = sv.querySelectorAll('rect')[1];
        const w = +water.getAttribute('width'), h = +water.getAttribute('height');
        const px = sv.getBoundingClientRect().width / 90;    // viewBox width
        return { w, h, area: w * h, unitOnScreen: Math.round(12 * px), cells: (w / 12) * (h / 12) };
      });
      if (glass.some(g => g.w % 12 || g.h % 12)) wrong.push('the unit does not divide the juice');
      if (new Set(glass.map(g => g.unitOnScreen)).size > 1) wrong.push('the squares differ between glasses');
      const cells = glass.map(g => g.cells), areas = glass.map(g => g.area);
      const cMax = Math.max.apply(null, cells);
      if (cells.filter(c => c === cMax).length > 1) wrong.push('counting squares gives a tie');
      if (cells.indexOf(cMax) !== areas.indexOf(Math.max.apply(null, areas))) wrong.push('counting squares gives the wrong glass');
    }
    check('counting the squares always reaches the answer the かさくらべ hint promises',
      seen > 30 && !wrong.length, (seen + ' drawn; ') + wrong.slice(0, 3).join(' | '));
  })();

  /* ---------- 17. a puzzle piece fits only where it belongs ----------
     The signature used to be 頂点数:幅x高さ, so ちょうちょ's four right triangles —
     the same triangle in four orientations — all matched every hole, and the puzzle
     about seeing shapes could be finished without looking at any. */
  (function puzzlePieces(){
    const loose = [];
    const seen = {};
    for (let i = 0; i < 120; i++){
      K.Session.startLevel(K.Games.byId.shape, 2);
      const name = (q('#play .prompt .txt').textContent.match(/はめて (.+) を/) || [])[1] || '?';
      const sigs = qa('#play .shapefield polygon').map(p => p.dataset.sig);
      seen[name] = 1;
      if (new Set(sigs).size !== sigs.length && !loose.some(x => x.indexOf(name) === 0)){
        loose.push(name + ': ' + sigs.length + ' pieces, ' + new Set(sigs).size + ' distinct');
      }
    }
    check('every puzzle piece fits only its own hole',
      Object.keys(seen).length >= 5 && !loose.length, loose.join(' | '));
  })();

  /* ---------- 18. the app still opens with no network ----------
     The route the README recommends is ホーム画面に追加 from GitHub Pages, and
     without a service worker that cannot open offline at all — iOS just falls back
     to the HTTP cache and lets it go stale. This drives sw.js's own handlers,
     because a page cannot register a worker for a scope it does not control. */
  async function serviceWorkerOffline(){
    if (typeof caches === 'undefined'){
      check('the app still opens with no network', false,
        'this run has no CacheStorage — serve the tests over http://127.0.0.1, not file://');
      return;
    }
    const src = await fetch('sw.js?t=' + Date.now()).then(r => r.ok ? r.text() : null).catch(() => null);
    if (!src){ check('the app still opens with no network', false, 'dist/sw.js is missing — run ./build.sh'); return; }

    const H = {};
    let skipped = false, claimed = false;
    const fakeSelf = { addEventListener: (k, f) => { H[k] = f; }, skipWaiting(){ skipped = true; },
                       clients: { claim: async () => { claimed = true; } } };
    let offline = false;
    const netFetch = r => offline ? Promise.reject(new TypeError('offline')) : fetch(r);
    new Function('self', 'caches', 'fetch', 'Request', 'Response', 'location', src)
      (fakeSelf, caches, netFetch, Request, Response, location);

    const problems = [];
    try{
      const w = []; await H.install({ waitUntil: p => w.push(p) }); await Promise.all(w);
      if (!skipped) problems.push('install did not take over');
      const name = (await caches.keys()).find(k => k.indexOf('kazu-no-bouken-') === 0);
      if (!name) problems.push('nothing was cached');

      // a previous deploy's cache has to go, or the child is stuck on an old build
      await caches.open('kazu-no-bouken-A-PREVIOUS-BUILD');
      const w2 = []; await H.activate({ waitUntil: p => w2.push(p) }); await Promise.all(w2);
      if (!claimed) problems.push('activate did not claim the page');
      const left = await caches.keys();
      if (left.length !== 1) problems.push('old caches survived: ' + left.join(','));

      /* Now the path a child actually takes: the app has been opened once, so the
         worker has seen and kept it. (Asking for './' instead would only prove the
         precache, and under the test server './' is a directory listing rather
         than the app it is on a real deploy.) */
      const appUrl = location.href.split('?')[0];
      let warm = null;
      await H.fetch({ request: new Request(appUrl), respondWith: p => { warm = p; } });
      await warm;
      await new Promise(r => setTimeout(r, 400));      // let the background write land

      offline = true;
      let served = null;
      await H.fetch({ request: new Request(appUrl), respondWith: p => { served = p; } });
      const res = served && await served;
      if (!res || res.status !== 200) problems.push('offline request was not answered');
      else {
        const html = await res.text();
        if (html.indexOf('KazuApp') < 0) problems.push('what came back offline was not the app');
      }
    }catch(e){ problems.push('threw: ' + e.message); }
    for (const k of await caches.keys()) await caches.delete(k);      // leave nothing behind
    check('the app still opens with no network', !problems.length, problems.join(' | '));
  }

  /* ---------- 19. the palette stays readable ----------
     White was the default for text on a coloured fill, and it fails on every crayon
     in the set: 2.05:1 on the orange「?」 in the number-bond diagram, 2.50:1 on the
     green a child sees the moment they answer correctly, 1.4–2.8:1 throughout dark
     mode. Numbers a child has to read are not decoration. */
  (function palette(){
    const root = document.documentElement;
    const was = root.dataset.theme;
    const px = n => getComputedStyle(root).getPropertyValue(n).trim();
    function rgb(c){
      if (c[0] === '#'){
        const h = c.length === 4 ? c[1]+c[1]+c[2]+c[2]+c[3]+c[3] : c.slice(1);
        return [0,2,4].map(i => parseInt(h.slice(i,i+2),16));
      }
      const m = c.match(/[\d.]+/g);
      return m ? m.slice(0,3).map(Number) : null;
    }
    function lum(c){
      const v = rgb(c);
      if (!v) return null;
      const f = v.map(x => { x/=255; return x <= .03928 ? x/12.92 : Math.pow((x+.055)/1.055, 2.4); });
      return .2126*f[0] + .7152*f[1] + .0722*f[2];
    }
    function ratio(a, b){
      const la = lum(a), lb = lum(b);
      if (la == null || lb == null) return null;
      return (Math.max(la,lb) + .05) / (Math.min(la,lb) + .05);
    }

    // [foreground token, background token, minimum]  — 3.0 where the text is only
    // ever a large bold numeral, 4.5 everywhere else
    const PAIRS = [
      ['--ink', '--paper', 4.5], ['--ink-soft', '--paper', 4.5], ['--ink-soft', '--paper-2', 4.5],
      ['--on-crayon', '--good', 4.5], ['--on-crayon', '--accent', 4.5],
      ['--on-crayon', '--c-blue', 4.5], ['--on-crayon', '--c-purple', 3],
      ['--on-crayon', '--c-red', 3],    ['--on-crayon', '--c-orange', 4.5],
      ['--on-crayon', '--c-yellow', 4.5], ['--on-crayon', '--c-green', 4.5],
      ['--on-crayon', '--c-pink', 4.5],
      ['--c-red', '--paper', 3],        // the numeral the prompt is about
      ['--oops-ink', '--paper', 4.5],   // the parent page's warnings
      ['--good-ink', '--good-soft', 3],
      ['--accent-ink', '--accent', 3]
    ];
    const bad = [];
    ['light', 'dark'].forEach(theme => {
      root.dataset.theme = theme;
      PAIRS.forEach(([f, b, min]) => {
        const r = ratio(px(f), px(b));
        if (r == null) bad.push(theme + ' ' + f + '/' + b + ' unreadable token');
        else if (r < min) bad.push(theme + ' ' + f + ' on ' + b + ' = ' + r.toFixed(2) + ' < ' + min);
      });
    });
    if (was) root.dataset.theme = was; else delete root.dataset.theme;
    check('every colour a child has to read clears its contrast floor, in both themes',
      !bad.length, bad.slice(0, 4).join(' | '));
  })();

  /* ---------- 20. the top calc levels ask for the answer, not a choice ----------
     Picking one of three is recognition; 「考えずに言える」 is retrieval, and only the
     second is what makes a carry sum fast. These levels put up a fixed 0–10 keypad,
     which also drops what guessing alone is worth from 33% to 9%. */
  (function keypad(){
    const bad = [];
    [['bond', 2], ['ten', 1], ['add', 2], ['sub', 2]].forEach(([id, li]) => {
      let sawPad = 0;
      for (let t = 0; t < 8; t++){
        K.Session.startLevel(K.Games.byId[id], li);
        const keys = qa('#play .choices .padkey');
        if (!keys.length) continue;
        sawPad++;
        const labels = keys.map(k => k.textContent);
        if (labels.join(',') !== '0,1,2,3,4,5,6,7,8,9,10'){
          bad.push(id + '/L' + (li+1) + ' keypad is ' + labels.join(','));
          break;
        }
        if (t === 0){
          // two wrong answers must narrow it to something thinkable, not to a coin flip
          const wrong = keys.filter(k => !k.classList.contains('correct'));
          wrong[0].click(); wrong[0].click();
          const live = qa('#play .padkey').filter(k => !k.classList.contains('dim'));
          if (live.length < 3) bad.push(id + '/L' + (li+1) + ' hint left only ' + live.length + ' keys');
        }
      }
      if (!sawPad) bad.push(id + '/L' + (li+1) + ' never showed a keypad');
    });
    check('the top けいさんの やま levels answer on a 0–10 keypad, not three choices',
      !bad.length, bad.slice(0, 3).join(' | '));
  })();

  /* ---------- 21. the retrieval levels stop handing over the answer ----------
     The keypad took guessing out of these levels, but the picture stayed: 「2と いくつで
     10？」 above two blue dots and eight empty cells is solved by counting the cells.
     Both strategies score a clean answer, and only retrieval makes a carry sum fast.
     The picture now comes back on a wrong answer and on a right one — where it
     confirms what the child said instead of telling them. */
  (function noCountablePicture(){
    const bad = [];
    [['bond', 2], ['ten', 1]].forEach(([id, li]) => {
      let drew = 0, hinted = 0;
      for (let t = 0; t < 10; t++){
        K.Session.startLevel(K.Games.byId[id], li);
        if (!qa('#play .choices .padkey').length) continue;   // that draw was not a keypad question
        drew++;
        if (qa('#play .playfield .tenframe').length){
          bad.push(id + '/L' + (li + 1) + ' shows the frame before the child answers');
          break;
        }
        const wrong = qa('#play .padkey').filter(k => !k.classList.contains('correct'));
        wrong[0].click(); wrong[0].click();                   // two misses: bring the picture back
        if (qa('#play .playfield .tenframe').length) hinted++;
      }
      if (!drew) bad.push(id + '/L' + (li + 1) + ' never drew a keypad question');
      else if (!hinted) bad.push(id + '/L' + (li + 1) + ' hint never brings the frame back');
    });
    check('the retrieval levels do not leave the answer countable on screen',
      !bad.length, bad.slice(0, 3).join(' | '));
  })();

  /* ---------- 22. right-but-slow is not the same as known ----------
     Nothing was ever timed, so a child who counted eight empty cells for nine
     seconds and a child who remembered both scored「1回目で正解」and the app could
     not tell them apart — on the very levels whose stated goal is 考えずに言える. */
  (function speed(){
    K.Store.reset();
    K.Session.startLevel(K.Games.byId.ten, 1);
    const beforeAnswer = S.responseMs;
    const keys = qa('#play .padkey');
    if (keys.length) keys[0].click();
    check('the app measures how long an answer took',
      beforeAnswer === null && typeof S.responseMs === 'number' && S.responseMs >= 0,
      'before=' + beforeAnswer + ' after=' + S.responseMs);

    K.Store.reset();
    for (let i = 0; i < 4; i++) K.Store.noteFact('ten:ten:4', true, '4 と 6 で 10', 'ten:1', 11000);
    for (let i = 0; i < 4; i++) K.Store.noteFact('ten:ten:2', true, '2 と 8 で 10', 'ten:1', 1200);
    K.Store.recordLevel('ten', 0, 3, 8, 8);
    const weak = K.Store.weakFacts().map(w => w.key);
    const slowDue = K.Store.factDue('ten:ten:4'), fastDue = K.Store.factDue('ten:ten:2');
    check('a fact answered right every time but slowly still counts as unfinished',
      weak.length === 1 && weak[0] === 'ten:ten:4' && slowDue > fastDue,
      'weak=[' + weak.join(',') + '] due ' + slowDue.toFixed(2) + ' vs ' + fastDue.toFixed(2));

    // a wrong answer times a guess, not a retrieval, so it is never recorded as one
    K.Store.reset();
    K.Store.noteFact('ten:ten:7', false, '7 と 3 で 10', 'ten:1', null);
    check('a wrong answer is not timed', K.Store.factSpeed('ten:ten:7') === null,
      'ms=' + K.Store.factSpeed('ten:ten:7'));

    K.Parent.render();
    const heads = qa('#parent thead th').map(h => h.textContent);
    check('the parent page reports speed alongside accuracy',
      heads.indexOf('こたえるまで') > 0 && heads.indexOf('こたえるまで') > heads.indexOf('直近30問'),
      heads.join(' / '));
    K.Store.reset();
  })();

  /* ---------- 23. quantity is shown in fives everywhere ----------
     「すうじ どれかな」 laid its groups on a six-wide lattice, so 9 read as「6と3」and
     8 as「6と2」 — the one game whose whole job is tying「数字の形」to「量」was the one
     fighting the five-structure every ten-frame in the app is built on. */
  (function fives(){
    let cols = null;
    for (let t = 0; t < 40 && cols == null; t++){
      K.Session.startLevel(K.Games.byId.numeral, 1);
      const slots = q('#play .plate.fixed .slots');
      if (slots) cols = getComputedStyle(slots).gridTemplateColumns.split(' ').length;
    }
    check('quantities are laid out in fives, like every ten-frame in the app',
      cols === 5, 'columns=' + cols);
  })();

  /* ---------- 24. the dots are gone before the question is asked ----------
     Every other quantity task in the app is solved by tapping objects one at a
     time, which trains counting. Seeing that a group is five is a different skill,
     and it is the one 「7は5と2」 has to rest on. It only gets practised if counting
     is actually impossible. */
  (function flash(){
    const bad = [];
    [0, 1, 2].forEach(li => {
      K.Session.startLevel(K.Games.byId.flash, li);
      const board = q('#play .flashboard');
      const go = q('#play .choices .flashgo');
      if (!board || !go){ bad.push('L' + (li + 1) + ' has no board or no 「みる」'); return; }
      if (!qa('#play .flashboard .fdot.on').length) bad.push('L' + (li + 1) + ' drew no dots');
      if (board.classList.contains('open')) bad.push('L' + (li + 1) + ' starts uncovered');
      if (qa('#play .choices .choice').filter(c => c !== go).length){
        bad.push('L' + (li + 1) + ' offers an answer before the look');
      }
      go.click();
      S.flushTimers();
      if (board.classList.contains('open')) bad.push('L' + (li + 1) + ' leaves the dots up while asking');
      if (qa('#play .choices .choice').length < 3) bad.push('L' + (li + 1) + ' asked nothing after the look');
    });
    check('ぱっと みて いくつ takes the dots away before it asks',
      !bad.length, bad.slice(0, 3).join(' | '));
  })();

  /* ---------- 25. counting backwards ----------
     「10から逆に数える方が難しく、効果があります」 has been on the parent page since the
     first version, and nothing in the app practised it: skipCount only ever went up
     and nextBefore took a single step back. Counting down is what くり下がり runs on. */
  (function backward(){
    let seen = 0, bad = '';
    for (let t = 0; t < 80 && !seen; t++){
      K.Session.startLevel(K.Games.byId.seq, 2);
      if (String(S.item).indexOf('seq:back:') !== 0) continue;
      seen++;
      const nums = qa('#play .numline .nn').slice(0, 3).map(n => Number(n.textContent));
      if (!(nums[0] === nums[1] + 1 && nums[1] === nums[2] + 1)) bad = 'sequence is ' + nums.join(',');
    }
    check('かずの じゅんばん counts backwards as well as forwards',
      seen > 0 && !bad, bad || 'never drawn in 80 tries');
  })();

  /* ---------- 26. the first-run sampler recommends without locking content ---------- */
  (function diagnostic(){
    K.Store.reset();
    const offered = K.Diagnostic.shouldRun();
    K.Session.startDiagnostic();
    const length = S.planLength;
    for (let i = 0; i < length && !onResult(); i++){
      S.forceCorrect(); S.flushTimers();
    }
    const saved = K.Store.data.diagnostic;
    const allOpen = K.Games.list.every(g => K.Store.levelUnlocked(g.id, 0));
    K.Diagnostic.startRecommended();
    const started = S.planGames[0] === saved.recommended.gameId + ':' + saved.recommended.levelIndex;
    check('the first-run adventure records a recommendation without locking any game',
      offered && length === 10 && saved && saved.recommended && allOpen && started,
      'offered=' + offered + ' length=' + length + ' saved=' + !!saved
        + ' allOpen=' + allOpen + ' started=' + started);
    K.Store.reset();
  })();

  /* ---------- 27. constructive questions really appear in the existing worlds ---------- */
  (function constructive(){
    const targets = [
      ['count', 1, 'count:conserve:'],
      ['compare', 1, 'compare:conserve:'],
      ['bond', 1, 'bond:ways:'],
      ['ten', 2, 'ten:three10'],
      ['pattern', 2, 'pattern:create:']
    ];
    const missing = [];
    targets.forEach(([id, li, prefix]) => {
      let found = false;
      for (let i = 0; i < 80 && !found; i++){
        K.Session.startLevel(K.Games.byId[id], li);
        found = String(S.item).indexOf(prefix) === 0;
      }
      if (!found) missing.push(id + '/L' + li);
    });
    check('each world can ask the child to construct or verify an idea, not only pick an answer',
      !missing.length, missing.join(', '));
  })();

  /* ---------- 27b. rapid taps cannot become extra numbers or false mistakes ---------- */
  (function constructiveTapSafety(){
    let three = false, extraAccepted = false;
    for (let i = 0; i < 100 && !three; i++){
      K.Session.startLevel(K.Games.byId.ten, 2);
      three = String(S.item) === 'ten:three10';
    }
    if (three){
      const key = n => qa('#play .padkey').find(x => x.textContent === String(n));
      key(9).click(); key(0).click(); key(0).click(); key(1).click();
      extraAccepted = S.locked;
      S.flushTimers();
    }

    let ways = false, doubleTapMistake = null;
    for (let i = 0; i < 100 && !ways; i++){
      K.Session.startLevel(K.Games.byId.bond, 1);
      ways = String(S.item).indexOf('bond:ways:') === 0;
    }
    if (ways){
      const b = q('#play .choices .choice');
      const before = S.mistakes;
      b.click(); b.click();
      doubleTapMistake = S.mistakes !== before;
    }
    check('rapid taps do not add a fourth number or mark one construction wrong',
      three && !extraAccepted && ways && !doubleTapMistake,
      'three=' + three + ' extra=' + extraAccepted + ' ways=' + ways + ' falseMistake=' + doubleTapMistake);
  })();

  /* ---------- 28. half past can be set by moving the long hand ---------- */
  (function minuteHand(){
    let found = false, solved = false;
    for (let i = 0; i < 80 && !found; i++){
      K.Session.startLevel(K.Games.byId.clock, 2);
      found = String(S.item).indexOf('clock:sethalf:') === 0;
    }
    if (found){
      const clock = q('#play .clock.pickable'), r = clock.getBoundingClientRect();
      const setSix = qa('#play .clock-adjust').find(b => /6に/.test(b.textContent));
      if (setSix) setSix.click();
      q('#play .choices .btn-accent').click();
      solved = S.locked && !!setSix
        && q('#play .clock.pickable').parentElement.getAttribute('role') === 'group'
        && q('#play .clock-readout[aria-live="polite"]');
    }
    check('moving the long hand to 6 sets 「なんじはん」',
      found && solved, 'found=' + found + ' solved=' + solved);
  })();

  /* ---------- 29. safety affordances are present ---------- */
  (function safety(){
    K.Session.startLevel(K.Games.byId.count, 0);
    const back = q('#play .backbtn');
    back.click();
    const stayed = K.UI.currentName() === 'play' && /もういちど/.test(back.getAttribute('aria-label') || '');
    S.forceCorrect(); S.flushTimers();                 // a new question must disarm the old warning
    const nextBack = q('#play .backbtn');
    nextBack.click();
    const stayedNext = K.UI.currentName() === 'play';
    nextBack.click();
    const left = K.UI.currentName() !== 'play';
    K.Session.startLevel(K.Games.byId.count, 0);
    const promptLive = q('#play .prompt .txt').getAttribute('aria-live') === 'polite';
    const feedbackLive = q('#play .feedback').getAttribute('role') === 'status';
    const roundSize = q('#play .speakBtn') ? q('#play .speakBtn').getBoundingClientRect().width
      : q('#play .btn-round').getBoundingClientRect().width;
    check('back needs confirmation, dynamic text is announced, and round controls are child-sized',
      stayed && stayedNext && left && promptLive && feedbackLive && roundSize >= 63,
      'stayed=' + stayed + '/' + stayedNext + ' left=' + left
        + ' live=' + promptLive + '/' + feedbackLive + ' size=' + roundSize);
  })();

  /* ---------- 30. missions persist completion and next-day reflection ---------- */
  (function missions(){
    K.Store.reset();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
              + String(d.getDate()).padStart(2, '0');
    K.Store.recordMission({ day, id: 'test-mission', gameId: 'count',
      text: '3こ かぞえよう', prompt: 'ひとつずつ かぞえよう' });
    const mission = K.Store.mission(day);
    K.Missions.open(mission);
    q('#mission .btn-accent').click();
    const gated = K.UI.currentName() === 'gate' && !K.Store.mission(day).done;
    const formula = q('#gate .q').textContent.match(/(\d+) × (\d+)/);
    const answer = formula ? Number(formula[1]) * Number(formula[2]) : -1;
    const adultAnswer = qa('#gate .choice').find(b => Number(b.textContent) === answer);
    if (adultAnswer) adultAnswer.click();
    const review = K.Missions.yesterdayReview();
    K.Store.reviewMission(day);
    const old = new Date(); old.setDate(old.getDate() - 2);
    const oldDay = old.getFullYear() + '-' + String(old.getMonth() + 1).padStart(2, '0') + '-'
                 + String(old.getDate()).padStart(2, '0');
    K.Store.recordMission({ day: oldDay, id: 'old-mission', gameId: 'count',
      text: 'ふるい', prompt: 'ふるい' });
    K.Store.completeMission(oldDay);
    const onlyYesterday = K.Missions.yesterdayReview();
    check('a completed real-world mission returns for a next-day reflection',
      gated && adultAnswer && review && review.id === 'test-mission'
        && K.Store.mission(day).reviewed && onlyYesterday === null,
      'gated=' + gated + ' review=' + (review && review.id) + ' oldIgnored=' + (onlyYesterday === null));
    K.Store.reset();
  })();

  /* ---------- 31. the 小学1年生 stage opens on the last sticker, and not before ----------
     The whole point of the sticker book is that it is a goal a child can see. The
     door it opens has to be shut until the shelf is actually full, has to open on
     the sticker that fills it, and has to say so on the screen the child is
     looking at — not in a menu they might find later. */
  (function stageGate(){
    K.Store.reset();
    const pre = K.Progress.slots('pre'), g1 = K.Progress.slots('g1');
    const shutAtStart = !K.Progress.g1Open();

    // every 小1 level is out of reach of every question surface while it is shut
    const g1Games = K.Games.list.filter(g => K.Progress.stageOf(g) === 'g1');
    const noneOpen = g1Games.every(g => g.levels.every((lv, i) => !K.levelOpen(g, i)));
    K.Games.list.forEach(g => g.levels.forEach((lv, i) => {
      K.Store.data.stars[g.id + ':' + i] = 3;      // even with stars, the stage is shut
      K.Store.data.recent[g.id + ':' + i] = '1'.repeat(20);
    }));
    const tally = {};
    for (let d = 0; d < 40; d++){
      K.Session.startDaily(10);
      S.planGames.forEach(k => { tally[k.split(':')[0]] = 1; });
    }
    const stayedOut = g1Games.every(g => !tally[g.id]);

    // one sticker short is still shut
    pre.slice(0, -1).forEach(k => K.Store.addSticker(k));
    const shutOneShort = !K.Progress.g1Open();
    K.Store.addSticker(pre[pre.length - 1]);
    const openedOnLast = K.Progress.g1Open();

    // and now the 小1 levels are reachable, and Home draws the world
    K.Home.render();
    const worldOnHome = qa('#home .world h3 .chip').some(c => c.textContent.indexOf('1ねんせい') >= 0);
    const nowInPool = (() => {
      const seen = {};
      for (let d = 0; d < 60; d++){
        K.Session.startDaily(10);
        S.planGames.forEach(k => { seen[k.split(':')[0]] = 1; });
      }
      return g1Games.some(g => seen[g.id]);
    })();
    check('小学1年生 opens on the last sticker of the 入学前 shelf, never before',
      shutAtStart && noneOpen && stayedOut && shutOneShort && openedOnLast
        && worldOnHome && nowInPool && g1.length === 24,
      'shut=' + shutAtStart + ' hidden=' + noneOpen + ' outOfDaily=' + stayedOut
        + ' oneShort=' + shutOneShort + ' opened=' + openedOnLast
        + ' onHome=' + worldOnHome + ' inDaily=' + nowInPool + ' g1slots=' + g1.length);
    K.Store.reset();
  })();

  /* ---------- 32. finishing the shelf tells the child so, in words they read ---------- */
  (function unlockMessage(){
    K.Store.reset();
    /* One slot short of a full shelf, and the missing one is the gold sticker for
       a level the suite can actually play: the last slot in registration order
       belongs to 「はりを うごかす」, which needs a hand on a clock face. */
    const missing = 'bond:0:g';
    K.Progress.slots('pre').forEach(k => { if (k !== missing) K.Store.addSticker(k); });
    const shutBefore = !K.Progress.g1Open();
    K.Session.startLevel(K.Games.byId.bond, 0);
    let guard = 0;
    while (!onResult() && guard++ < 40){    // every answer right first time — ★★★
      S.forceCorrect();
      S.flushTimers();
    }
    const said = (q('#result .unlocked') || {}).textContent || '';
    check('the last sticker says「1ねんせいの もんだいが できるよ」on the result screen',
      shutBefore && K.Store.hasSticker(missing) && K.Progress.g1Open()
        && said.indexOf('1ねんせいの もんだいが できる') >= 0,
      'shutBefore=' + shutBefore + ' gold=' + K.Store.hasSticker(missing)
        + ' open=' + K.Progress.g1Open() + ' text=' + said.slice(0, 60));
    K.Store.reset();
  })();

  /* ---------- 33. a child who is ready must never be stuck behind the padlock ----------
     Every gold sticker needs a run with every answer right first time. That is a
     real goal, and it is also a wall a ready child can fail to clear on とけい
     alone — so the parent page can open the door by hand, exactly like the three
     attempts that open a level nobody can pass. */
  (function parentOverride(){
    K.Store.reset();
    const before = K.Progress.g1Open();
    K.Progress.openG1();
    const after = K.Progress.g1Open();
    const survives = (() => {
      const text = K.Store.exportText();
      K.Store.reset();
      const wiped = K.Progress.g1Open();
      K.Store.importText(text, 'replace');
      return !wiped && K.Progress.g1Open();
    })();
    check('a parent can open 小学1年生 by hand, and the backup remembers it',
      !before && after && survives, 'before=' + before + ' after=' + after + ' backup=' + survives);
    K.Store.reset();
  })();

  function finish(){
    check('no uncaught errors during the whole suite', uncaught === 0, uncaught + ' errors');
    K.Store.reset();
    return { pass: results.filter(r => r.ok).length, fail: results.filter(r => !r.ok).length, results };
  }

  // the only asynchronous check in the suite; everything above is synchronous
  return serviceWorkerOffline()
    .catch(e => check('the app still opens with no network', false, String(e && e.message || e)))
    .then(finish);
})();
