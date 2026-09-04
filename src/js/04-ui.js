/* ===========================================================
   04 — screens, feedback effects, drag helper
   =========================================================== */
'use strict';

const UI = (() => {
  const screens = {};
  let stage = null, fx = null, current = null;

  function init(){
    stage = $('#stage');
    fx    = $('#fx');
  }
  function register(name, node){
    node.classList.add('screen');
    node.hidden = true;
    screens[name] = node;
    stage.append(node);
    return node;
  }
  function show(name, opts){
    const o = opts || {};
    Sound.hush();
    for (const k in screens) screens[k].hidden = true;
    const n = screens[name];
    if (!n) return null;
    n.hidden = false;
    n.classList.remove('enter');
    void n.offsetWidth;
    n.classList.add('enter');
    current = name;
    n.scrollTop = 0;
    const sc = $('.worlds, .sheet, .levels, .book', n);
    if (sc) sc.scrollTop = o.keepScroll ? sc.scrollTop : 0;
    /* A visual transition is otherwise silent to screen readers and leaves
       keyboard/switch focus on a control that just became hidden. */
    if (o.focus !== false){
      const heading = $('h1, h2, [role="heading"]', n);
      if (heading){
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        requestAnimationFrame(() => {
          if (current === name && !n.hidden) heading.focus({ preventScroll: true });
        });
      }
    }
    return n;
  }
  const currentName = () => current;

  /* ---------- feedback ---------- */
  const CRAYONS = ['--c-red','--c-orange','--c-yellow','--c-green','--c-blue','--c-purple','--c-pink'];
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function confetti(count, originX, originY){
    if (reduced()) return;
    const n = count || 26;
    const w = innerWidth, h = innerHeight;
    const ox = originX == null ? w / 2 : originX;
    const oy = originY == null ? h * 0.45 : originY;
    for (let i = 0; i < n; i++){
      const p = el('div.confetti');
      p.style.background = `var(${CRAYONS[i % CRAYONS.length]})`;
      p.style.left = ox + 'px';
      p.style.top  = oy + 'px';
      fx.append(p);
      const a  = (-Math.PI / 2) + (Math.random() - .5) * 2.1;
      const v  = 260 + Math.random() * 420;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v;
      const dur = 900 + Math.random() * 700;
      p.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * .6}px, ${dy * .6 + 90}px) rotate(${180 + Math.random()*360}deg)`, opacity: 1, offset: .55 },
        { transform: `translate(${dx}px, ${dy + h * .75}px) rotate(${540 + Math.random()*360}deg)`, opacity: 0 }
      ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)' }).finished.then(() => p.remove()).catch(() => p.remove());
    }
  }

  function bigMark(txt, color){
    const n = el('div.bigmark', { text: txt, style: { color: color || 'var(--good)' } });
    document.body.append(n);
    setTimeout(() => n.remove(), 760);
  }

  function stars(count, big){
    const wrap = el(big ? 'div.bigstars' : 'div.st');
    for (let i = 0; i < 3; i++){
      const s = starSVG(i < count);
      s.classList.add('s');
      if (i < count) s.classList.add('on');
      s.style.animationDelay = (i * 0.22) + 's';
      wrap.append(s);
    }
    return wrap;
  }

  /* ---------- fit the question to the space it was given ----------
     The whole layout is expressed in --u, and --u came from the viewport's short
     side, capped at 17px. So a question was always the same small island in the
     middle of the iPad no matter how much room there was: the ten-frame in
     「10の おともだち」 covered 3.5% of a 1024x768 screen and 4.5% of a 12.9-inch
     one — a bigger iPad only bought more margin, and the tracing box, the thing a
     finger most needs to be large, sat at 345px on a 1024px-wide screen.

     The playfield's box does not depend on its own contents (its siblings are
     flex:0 0 auto and it has min-height:0), so we can grow --u inside it and
     stop at the largest value where nothing sticks out. */
  /* Grow to fill the room, but also shrink a little when a question is naturally
     too wide (a row of eight animals on a portrait iPad): a row the child has to
     count is worthless once it scrolls out of sight. */
  const FIT_MAX = 2.4, FIT_MIN = 0.72;

  function fitsInside(field, kids){
    const b = field.getBoundingClientRect();
    const slack = 2;
    for (let i = 0; i < kids.length; i++){
      const n = kids[i];
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) continue;              // hidden / zero-sized
      if (r.left < b.left - slack || r.right > b.right + slack
       || r.top  < b.top  - slack || r.bottom > b.bottom + slack) return false;
      /* Staying inside the playfield is not enough: なんばんめ's row of animals
         scrolls inside its own container, so it can sit within the field and still
         hide half the animals the child is being asked to count. Only real scroll
         containers count — plenty of boxes report harmless overflow from borders,
         shadows and emoji glyphs. */
      if (n.scrollWidth > n.clientWidth + 4 || n.scrollHeight > n.clientHeight + 4){
        const ov = getComputedStyle(n);
        if (ov.overflowX === 'auto' || ov.overflowX === 'scroll'
         || ov.overflowY === 'auto' || ov.overflowY === 'scroll') return false;
      }
    }
    return true;
  }

  function fitPlayfield(field){
    if (!field || !field.isConnected) return;
    field.style.removeProperty('--u');
    const box = field.getBoundingClientRect();
    if (box.width < 60 || box.height < 60) return;      // off-screen or mid-transition
    const base = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 12;
    // the search only changes sizes, never the tree, so collect the nodes once
    const kids = field.querySelectorAll('*');
    const at = m => {
      field.style.setProperty('--u', (base * m).toFixed(2) + 'px');
      return fitsInside(field, kids);
    };
    let lo = FIT_MIN, hi = FIT_MAX;
    for (let i = 0; i < 6; i++){                        // ~1.5% precision
      const m = (lo + hi) / 2;
      if (at(m)) lo = m; else hi = m;
    }
    at(lo);
  }

  /** Re-fit whenever the question's contents change — story scenes, hints and
      multi-blank questions all add nodes after the first draw. */
  function watchFit(field){
    let queued = false;
    const run = () => { queued = false; fitPlayfield(field); };
    const ping = () => {
      if (queued) return;
      queued = true;
      (window.requestAnimationFrame || setTimeout)(run, 0);
    };
    if (window.MutationObserver){
      new MutationObserver(ping).observe(field, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener('resize', ping);
    return ping;
  }

  /* ---------- drag & drop (pointer based, with tap fallback) ---------- */
  function makeDragDrop(opts){
    // opts: { items(), targets(), onDrop(item, target), tapSelect: bool }
    let selected = null, dragging = null, ghost = null, sx = 0, sy = 0, moved = false, overEl = null;
    let activeId = null;
    // a five-year-old's "tap" slides a few millimetres; 8px turned taps into drags
    const THRESH = 18;

    function clearSel(){
      if (selected) selected.classList.remove('sel');
      selected = null;
    }
    function setOver(t){
      if (overEl === t) return;
      if (overEl) overEl.classList.remove('over');
      overEl = t;
      if (overEl) overEl.classList.add('over');
    }
    function targetAt(x, y){
      const e = document.elementFromPoint(x, y);
      return e ? e.closest('[data-drop]') : null;
    }
    function endDrag(x, y){
      if (ghost){ ghost.remove(); ghost = null; }
      if (dragging) dragging.classList.remove('dragging');
      const t = (x != null) ? targetAt(x, y) : null;
      setOver(null);
      const it = dragging; dragging = null;
      if (it && moved){
        if (t) opts.onDrop(it, t);
        return true;
      }
      return false;
    }

    function onDown(e){
      const it = e.currentTarget;
      if (e.button != null && e.button > 0) return;
      if (dragging) return;                 // a second finger must not hijack the first
      activeId = e.pointerId;
      dragging = it; moved = false;
      sx = e.clientX; sy = e.clientY;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
    function onMove(e){
      if (!dragging || e.pointerId !== activeId) return;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < THRESH) return;
      e.preventDefault();
      if (!moved){
        moved = true;
        clearSel();
        dragging.classList.add('dragging');
        ghost = dragging.cloneNode(true);
        ghost.id = 'ghost';
        ghost.classList.remove('dragging', 'sel');
        const r = dragging.getBoundingClientRect();
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.append(ghost);
      }
      ghost.style.left = e.clientX + 'px';
      ghost.style.top  = e.clientY + 'px';
      setOver(targetAt(e.clientX, e.clientY));
    }
    function onUp(e){
      if (e.pointerId !== activeId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      activeId = null;
      const it = dragging;
      const dropped = endDrag(moved ? e.clientX : null, moved ? e.clientY : null);
      if (!it) return;
      if (!dropped){
        // a tap, or a drag that landed on nothing — either way, leave it selected
        // so the child can just tap the bin instead of dragging again
        if (!moved && selected === it) clearSel();
        else { clearSel(); selected = it; it.classList.add('sel'); Sound.sfx.tap(); }
      }
    }
    function bindItem(it){ it.addEventListener('pointerdown', onDown); }
    function bindTarget(t){
      t.setAttribute('data-drop', '');
      t.addEventListener('click', () => {
        if (selected){ const s = selected; opts.onDrop(s, t); if (s.classList.contains('gone')) clearSel(); }
      });
    }
    function select(it){ clearSel(); selected = it; it.classList.add('sel'); }
    return { bindItem, bindTarget, clearSel, select, get selected(){ return selected; } };
  }

  return { init, register, show, currentName, confetti, bigMark, stars, makeDragDrop, screens,
           fitPlayfield, watchFit };
})();
