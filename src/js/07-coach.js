/* ===========================================================
   07 — coaching: what a hint puts in the child's hands
   ===========================================================
   A hint used to be one of four things: a sentence nobody read out, the answer
   written on the board (「5こ」 on each plate, a number on every animal), a glow on
   the right piece, or — on a dozen levels — nothing but the wrong choices going
   grey. On three choices, two misses and two grey buttons leave exactly one: the
   child could press it without having understood anything.

   The hints that worked were the ones that did the comparing in front of the child
   without saying who won: the bars sliding back to one start line, the same-size
   squares in every glass, the dots shown again. This file is the kit for making
   every hint like those:

     • a hand (👆) the engine can walk through the strategy with, and
     • tools a hint hands over — things to tap and count, holes to fill — so the
       second try is made with the method rather than by elimination.

   The engine owns the ladder (05-engine.js); games describe their own `coach`.
   =========================================================== */
'use strict';

const Coach = (() => {
  let handEl = null;

  function hand(){
    if (!handEl || !handEl.isConnected){
      handEl = el('div.coachhand', { 'aria-hidden': 'true', hidden: true }, '👆');
      ($('#fx') || document.body).append(handEl);
    }
    return handEl;
  }

  /** Move the hand onto a node and tap it (visually only — it never clicks). */
  function point(node){
    if (!node || !node.isConnected) return;
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const h = hand();
    const x = r.left + r.width / 2, y = r.top + r.height * 0.55;
    if (h.hidden){
      // arrive from just below, rather than sliding in from the last place it was
      h.style.transition = 'none';
      h.style.left = x + 'px';
      h.style.top = (y + 70) + 'px';
      h.hidden = false;
      void h.offsetWidth;
      h.style.transition = '';
    }
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    h.classList.remove('tap');
    void h.offsetWidth;
    h.classList.add('tap');
  }
  function hide(){ if (handEl) handEl.hidden = true; }

  /** Draw the eye to something without saying what it is. */
  function pulse(nodes){
    [].concat(nodes).forEach(n => {
      if (!n || !n.classList) return;
      n.classList.remove('coachpulse');
      void n.getBoundingClientRect();
      n.classList.add('coachpulse');
    });
  }

  /** A number badge on a node — the count a child (or the hand) has reached. */
  function tag(node, n, cls){
    if (!node) return null;
    const old = node.querySelector(':scope > .ctag');
    if (old) old.remove();
    if (node.namespaceURI === 'http://www.w3.org/2000/svg') return null;
    if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
    const t = el('span.ctag' + (cls ? '.' + cls : ''), { text: String(n), 'aria-hidden': 'true' });
    node.append(t);
    return t;
  }

  /** Build something once, however many rungs ask for it. */
  function once(fn){
    let done = false, val;
    return () => { if (!done){ done = true; val = fn(); } return val; };
  }

  /* ---------- tap to count ----------
     The one strategy under nearly every quantity question in the app. The badge
     stays, so the last number said is still on the board when the child looks up
     at the answers — which is the whole of what「ぜんぶで いくつ」means. */
  function countable(api, nodes, opts){
    const o = opts || {};
    let n = o.from || 0;
    const counted = new Set();
    const list = nodes.filter(Boolean);
    function mark(node){
      if (api.locked || counted.has(node) || !node.isConnected) return;
      counted.add(node);
      n++;
      node.classList.add('coachcounted');
      tag(node, n);
      Sound.sfx.count(Math.min(n - 1, 10));
      Sound.say(numKana(n), { delay: 0, rate: 1.08 });
      if (counted.size === list.length && o.onDone) api.later(() => o.onDone(n), 450);
    }
    list.forEach(node => {
      if (node.dataset.coach) return;
      node.dataset.coach = '1';
      node.classList.add('coachable');
      tappable(node, e => { if (e && e.stopPropagation) e.stopPropagation(); mark(node); });
    });
    return {
      mark,
      get count(){ return n; },
      /** the hand counting them, one at a time */
      steps: ms => list.map(node => ({ at: node, act(){ mark(node); }, ms: ms || 620 }))
    };
  }

  /* ---------- fill the gap ----------
     「5は 4と いくつ？」 with four dots and one empty cell: tapping the empty cell
     counts on from four and stops at five. What was added is the answer, in red, in
     the child's own taps. The cells stay the frame's size (no `.tappable`, which
     grows a cell to the finger floor and would break the ten-frame's columns). */
  function fillable(api, cells, opts){
    const o = opts || {};
    let n = o.from || 0;
    const holes = cells.filter(c => c && !c.firstChild);
    function fill(cell){
      if (api.locked || cell.firstChild || !cell.isConnected) return;
      cell.classList.remove('hole', 'coachhole');
      cell.append(el('div.dot.b'));
      n++;
      Sound.sfx.count(Math.min(n - 1, 10));
      Sound.say(numKana(n), { delay: 0, rate: 1.08 });
      if (holes.every(c => c.firstChild) && o.onDone) api.later(() => api.afterSpeech(() => {
        if (!api.locked) o.onDone(n);
      }), 450);
    }
    holes.forEach(c => {
      if (c.dataset.coach) return;
      c.dataset.coach = '1';
      c.classList.add('coachhole');
      tappable(c, () => fill(c));
    });
    return {
      fill,
      holes,
      steps: ms => holes.map(c => ({ at: c, act(){ fill(c); }, ms: ms || 600 }))
    };
  }

  /** The hand reading along a row of numbers: 「ご、ろく、なな…」 */
  function readAlong(cells, upto){
    const out = [];
    for (const c of cells){
      if (c === upto) break;
      const v = Number(c.textContent);
      out.push({ at: c, say: Number.isFinite(v) ? numKana(v) : '', ms: 560 });
    }
    if (upto) out.push({ at: upto, say: 'つぎは？', ms: 1300 });
    return out;
  }

  /** Faint equal marks along every bar's track, so length can be counted, not guessed. */
  function ticks(wrap){
    $$('.track', wrap).forEach(t => {
      if ($('.ticks', t)) return;
      const g = el('div.ticks', { 'aria-hidden': 'true' });
      for (let i = 1; i < 10; i++) g.append(el('i', { style: { left: (i * 10) + '%' } }));
      if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
      t.append(g);
    });
  }

  return { point, hide, pulse, tag, once, countable, fillable, readAlong, ticks };
})();
