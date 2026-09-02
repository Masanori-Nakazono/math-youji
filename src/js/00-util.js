/* ===========================================================
   00 — utilities
   =========================================================== */
'use strict';

const $  = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/** Tiny DOM builder. el('div.foo', {onclick}, child, 'text') */
function el(spec, props, ...kids){
  let tag = 'div', id = null, cls = [];
  const m = String(spec).match(/^([a-zA-Z0-9]*)((?:[.#][\w-]+)*)$/);
  if (m){
    if (m[1]) tag = m[1];
    (m[2].match(/[.#][\w-]+/g) || []).forEach(t => t[0] === '#' ? (id = t.slice(1)) : cls.push(t.slice(1)));
  } else tag = spec;
  const n = document.createElement(tag);
  if (id) n.id = id;
  if (cls.length) n.className = cls.join(' ');
  if (props) for (const k in props){
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object'){
      for (const prop in v){
        // custom properties (--x) must go through setProperty; Object.assign silently drops them
        if (prop.charCodeAt(0) === 45 && prop.charCodeAt(1) === 45) n.style.setProperty(prop, v[prop]);
        else n.style[prop] = v[prop];
      }
    }
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') n.className += (n.className ? ' ' : '') + v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(4)){
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

function svg(tag, attrs, ...kids){
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(4)) if (kid != null && kid !== false) n.append(kid);
  return n;
}

const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---- random ---- */
const ri     = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick   = arr => arr[Math.floor(Math.random() * arr.length)];
const chance = p => Math.random() < p;
function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sample = (arr, n) => shuffle(arr).slice(0, n);
const range  = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };

/** distinct distractor numbers around `answer` inside [lo,hi] */
function distractors(answer, n, lo, hi, spread){
  const s = spread || 3, out = new Set();
  const near = shuffle(range(Math.max(lo, answer - s), Math.min(hi, answer + s)).filter(v => v !== answer));
  for (const v of near){ if (out.size >= n) break; out.add(v); }
  let guard = 0;
  while (out.size < n && guard++ < 200){ const v = ri(lo, hi); if (v !== answer) out.add(v); }
  return Array.from(out).slice(0, n);
}

/* ---- japanese number readings (for speech) ---- */
const KANA_ONES = ['ゼロ','いち','に','さん','よん','ご','ろく','なな','はち','きゅう'];
function numKana(n){
  n = Math.round(n);
  if (n < 0) return String(n);
  if (n < 10) return KANA_ONES[n];
  if (n === 10) return 'じゅう';
  if (n < 20) return 'じゅう' + KANA_ONES[n - 10];
  if (n < 100){
    const t = Math.floor(n / 10), o = n % 10;
    return KANA_ONES[t] + 'じゅう' + (o ? KANA_ONES[o] : '');
  }
  return String(n);
}
const KO = ['ゼロこ','いっこ','にこ','さんこ','よんこ','ごこ','ろっこ','ななこ','はっこ','きゅうこ','じゅっこ'];
const koKana    = n => (n >= 0 && n <= 10) ? KO[n] : numKana(n) + 'こ';
const TSU = ['ゼロ','ひとつ','ふたつ','みっつ','よっつ','いつつ','むっつ','ななつ','やっつ','ここのつ','とお'];
const tsuKana   = n => (n >= 1 && n <= 10) ? TSU[n] : numKana(n) + 'こ';
const banmeKana = n => numKana(n) + 'ばんめ';
/* Clock hours have their own readings and they are NOT the counting readings. */
const JI = ['','いちじ','にじ','さんじ','よじ','ごじ','ろくじ','しちじ','はちじ','くじ','じゅうじ','じゅういちじ','じゅうにじ'];
const jiKana = (h, half) => (JI[h] || numKana(h) + 'じ') + (half ? 'はん' : '');

/** hiragana display text; digits get the numeral face via <b> */
const numTag = n => `<b>${n}</b>`;

/** Make a node behave like a button for both finger and keyboard. */
function tappable(node, fn){
  node.setAttribute('role', 'button');
  node.dataset.tap = '1';
  if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '0');
  node.addEventListener('click', fn);
  node.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(e); }
  });
  return node;
}

/** Rejection sampling with a hard stop: a tightened range must never hang the iPad. */
function until(tryOnce, limit){
  for (let i = 0; i < (limit || 400); i++){ const v = tryOnce(); if (v !== undefined) return v; }
  return undefined;
}

/* ---- geometry ---- */
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Poisson-ish scatter: n points in [0..1]^2 with a minimum separation. */
function scatter(n, minD, tries){
  const pts = [], T = tries || 40;
  const md = minD != null ? minD : Math.min(.34, 0.86 / Math.sqrt(n + 1));
  for (let i = 0; i < n; i++){
    let best = null, bestScore = -1;
    for (let t = 0; t < T; t++){
      const p = [0.10 + Math.random() * 0.80, 0.12 + Math.random() * 0.76];
      let d = 9;
      for (const q of pts) d = Math.min(d, dist(p[0], p[1], q[0], q[1]));
      if (d > bestScore){ bestScore = d; best = p; }
      if (d > md) break;
    }
    pts.push(best);
  }
  return pts;
}

/** points evenly on a horizontal line (for level-1 counting) */
function lineup(n, y){
  const pts = [], yy = y == null ? .5 : y;
  for (let i = 0; i < n; i++) pts.push([0.12 + (0.76 * (n === 1 ? .5 : i / (n - 1))), yy]);
  return pts;
}
