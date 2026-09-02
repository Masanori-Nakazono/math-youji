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
    const back = q('#play .backbtn');
    back.click();                                   // leave before it fires
    K.Session.startLevel(K.Games.byId.numeral, 0);
    const idxAtStart = S.idx;
    S.flushTimers();
    check('leaving a question cannot advance the next level (C3)',
      S.idx === idxAtStart && idxAtStart === 0, 'idx=' + S.idx);

    // and a slow story animation must not paint into whatever came after it
    K.Session.startLevel(K.Games.byId.add, 1);
    q('#play .backbtn').click();
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
      const hintCount = qa('#play .playfield .hintline').length;
      if (hintCount > 1) noisy.push(g.id + '/L' + li + ' x' + hintCount);
      const changed = q('#play').innerHTML.length !== before;
      const dimmed = qa('#play .choice.dim').length > 0;
      const chip   = !q('#play .feedback').hidden;
      if (!(changed || dimmed || chip)) silent.push(g.id + '/L' + li);
    });
    check('a hint is never stacked up on repeated wrong answers (M4)', !noisy.length, noisy.slice(0, 4).join(' | '));
    check('two wrong answers always change something on screen (M5)', !silent.length, silent.slice(0, 6).join(' | '));
  })();

  /* ---------- 6. tracing reports misses, so stars and accuracy stay honest ---------- */
  (function traceHonesty(){
    K.Session.startLevel(K.Games.byId.trace, 0);
    const box = q('#play .tracebox');
    const r = box.getBoundingClientRect();
    const fire = (type, x, y) => box.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 }));
    for (let i = 0; i < 4; i++){ fire('pointerdown', r.left + 4, r.bottom - 4); fire('pointerup', r.left + 4, r.bottom - 4); }
    check('tracing counts misses instead of always scoring three stars', S.mistakes > 0, 'mistakes=' + S.mistakes);
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
    const text = K.Store.exportText();
    const starsBefore = JSON.stringify(K.Store.data.stars);
    const seenBefore  = JSON.stringify(K.Store.data.seen);

    // a wiped browser, then a restore
    K.Store.reset();
    const r1 = K.Store.importText(text, 'replace');
    check('a backup restores the records exactly',
      r1.ok && JSON.stringify(K.Store.data.stars) === starsBefore && K.Store.hasSticker('bond:0'),
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
    [['ten', 1, 7.5], ['clock', 0, 7.5], ['bond', 0, 6.5], ['trace', 0, 3]].forEach(([id, li, floor]) => {
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
    const others = K.Games.list.filter(g => g.id !== 'bond' && g.id !== 'ten');
    const everyoneAppears = others.every(g => (tally[g.id] || 0) > 0);
    check('the daily set aims at the weak topics without abandoning the rest',
      weak >= 2.5 && everyoneAppears,
      'weak=' + weak.toFixed(2) + '/day, all others present=' + everyoneAppears);
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

  check('no uncaught errors during the whole suite', uncaught === 0, uncaught + ' errors');

  K.Store.reset();
  return { pass: results.filter(r => r.ok).length, fail: results.filter(r => !r.ok).length, results };
})();
