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

  return { init, register, show, currentName, confetti, bigMark, stars, makeDragDrop, screens };
})();
