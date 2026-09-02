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
      for (let n = 0; n < 30; n++){
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

  check('no uncaught errors during the whole suite', uncaught === 0, uncaught + ' errors');

  K.Store.reset();
  return { pass: results.filter(r => r.ok).length, fail: results.filter(r => !r.ok).length, results };
})();
