/* ===========================================================
   03 — artwork: mascot, stars, shapes, clock, numeral strokes
   =========================================================== */
'use strict';

/* ---------- star ---------- */
const STAR_D = 'M50 6 L62 36 L95 39 L70 61 L78 94 L50 76 L22 94 L30 61 L5 39 L38 36 Z';
function starSVG(on){
  return svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', class: on ? 'on' : '' },
    svg('path', { d: STAR_D, fill: on ? 'var(--star)' : 'var(--card-edge)',
                  stroke: on ? 'var(--star-edge)' : 'transparent',
                  'stroke-width': 5, 'stroke-linejoin': 'round' }));
}

/* ---------- mascot: かずぴょん ---------- */
const FACES = {
  idle:  { eye: 'open',  mouth: 'M42 66 Q50 73 58 66' },
  happy: { eye: 'arc',   mouth: 'M38 62 Q50 78 62 62 Z' },
  cheer: { eye: 'arc',   mouth: 'M36 60 Q50 82 64 60 Z' },
  think: { eye: 'open',  mouth: 'M43 69 Q50 65 57 69' },
  soft:  { eye: 'open',  mouth: 'M43 70 Q50 64 57 70' }
};
function mascotSVG(mood, cls){
  const f = FACES[mood] || FACES.idle;
  const eye = (cx) => f.eye === 'arc'
    ? svg('path', { d: `M${cx - 7} 52 Q${cx} 44 ${cx + 7} 52`, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 4.5, 'stroke-linecap': 'round' })
    : svg('g', null,
        svg('circle', { cx, cy: 51, r: 6.4, fill: 'var(--ink)' }),
        svg('circle', { cx: cx + 2.2, cy: 48.6, r: 2.1, fill: '#fff' }));
  const ear = (x, rot) => svg('g', { transform: `rotate(${rot} ${x} 30)` },
    svg('rect', { x: x - 7, y: -2, width: 14, height: 36, rx: 7, fill: 'var(--c-yellow)', stroke: 'var(--ink)', 'stroke-width': 3.4 }),
    svg('rect', { x: x - 3.4, y: 4, width: 6.8, height: 24, rx: 3.4, fill: 'var(--c-pink)' }));
  return svg('svg', { viewBox: '0 0 100 100', class: 'mascot' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' },
    ear(37, -12), ear(63, 12),
    svg('circle', { cx: 50, cy: 62, r: 31, fill: 'var(--c-yellow)', stroke: 'var(--ink)', 'stroke-width': 3.6 }),
    svg('ellipse', { cx: 33, cy: 68, rx: 6.4, ry: 4.2, fill: 'var(--c-pink)', opacity: .85 }),
    svg('ellipse', { cx: 67, cy: 68, rx: 6.4, ry: 4.2, fill: 'var(--c-pink)', opacity: .85 }),
    eye(38), eye(62),
    svg('path', { d: f.mouth, fill: f.mouth.endsWith('Z') ? 'var(--c-red)' : 'none',
                  stroke: 'var(--ink)', 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
}

/* ---------- arrows ---------- */
function arrowSVG(dir){
  const flip = dir === 'left' ? 'scale(-1,1) translate(-100,0)' : '';
  return svg('svg', { viewBox: '0 0 100 50', 'aria-hidden': 'true' },
    svg('g', { transform: flip },
      svg('path', { d: 'M4 25 H72 M56 8 L78 25 L56 42', fill: 'none', stroke: 'currentColor',
                    'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
}

/* ---------- geometric shapes ---------- */
const SHAPES = {
  circle:    { ja: 'まる',     kind: 'circle',   pts: null },
  square:    { ja: 'しかく',   kind: 'square',   pts: [[10,10],[90,10],[90,90],[10,90]] },
  rect:      { ja: 'しかく',   kind: 'square',   pts: [[6,24],[94,24],[94,76],[6,76]] },
  tri:       { ja: 'さんかく', kind: 'triangle', pts: [[50,8],[92,88],[8,88]] },
  tri2:      { ja: 'さんかく', kind: 'triangle', pts: [[12,10],[92,52],[16,90]] },
  rtri:      { ja: 'さんかく', kind: 'triangle', pts: [[12,12],[12,88],[88,88]] },
  diamond:   { ja: 'ひしがた', kind: 'diamond',  pts: [[50,6],[94,50],[50,94],[6,50]] },
  oval:      { ja: 'まる',     kind: 'circle',   pts: null, rx: 46, ry: 30 },
  pentagon:  { ja: 'ごかっけい', kind: 'poly',   pts: [[50,6],[94,38],[77,90],[23,90],[6,38]] },
  hexagon:   { ja: 'ろっかっけい', kind: 'poly', pts: [[28,10],[72,10],[94,50],[72,90],[28,90],[6,50]] },
  trapezoid: { ja: 'だいけい', kind: 'poly',     pts: [[26,16],[74,16],[94,84],[6,84]] },
  star:      { ja: 'ほし',     kind: 'star',     pts: null },
  heart:     { ja: 'ハート',   kind: 'heart',    pts: null },
  semi:      { ja: 'はんえん', kind: 'semi',     pts: null }
};

function shapeSVG(name, color, rot, size){
  const s = SHAPES[name] || SHAPES.circle;
  const fill = color || 'var(--c-blue)';
  const stroke = 'color-mix(in srgb, ' + fill + ' 62%, var(--ink) 38%)';
  const common = { fill, stroke, 'stroke-width': 4, 'stroke-linejoin': 'round' };
  let node;
  if (name === 'circle')       node = svg('circle', Object.assign({ cx: 50, cy: 50, r: 42 }, common));
  else if (name === 'oval')    node = svg('ellipse', Object.assign({ cx: 50, cy: 50, rx: s.rx, ry: s.ry }, common));
  else if (name === 'star')    node = svg('path', Object.assign({ d: STAR_D }, common));
  else if (name === 'heart')   node = svg('path', Object.assign({ d: 'M50 90 C10 62 8 34 26 22 C38 14 50 22 50 34 C50 22 62 14 74 22 C92 34 90 62 50 90 Z' }, common));
  else if (name === 'semi')    node = svg('path', Object.assign({ d: 'M6 72 A44 44 0 0 1 94 72 Z' }, common));
  else node = svg('polygon', Object.assign({ points: s.pts.map(p => p.join(',')).join(' ') }, common));
  return svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true',
                      width: size || null, height: size || null,
                      style: rot ? `transform:rotate(${rot}deg)` : null }, node);
}

/* ---------- analogue clock ---------- */
function clockSVG(hour, minute, opts){
  const o = opts || {};
  const cx = 50, cy = 50, R = 45;
  const g = [
    svg('circle', { cx, cy, r: R, fill: 'var(--card)', stroke: 'var(--ink)', 'stroke-width': 3.4 }),
    svg('circle', { cx, cy, r: R - 4, fill: 'none', stroke: 'var(--card-edge)', 'stroke-width': 1.2 })
  ];
  for (let i = 0; i < 60; i++){
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const big = i % 5 === 0;
    const r1 = R - (big ? 8 : 4), r2 = R - 2.5;
    g.push(svg('line', {
      x1: cx + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1,
      x2: cx + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2,
      stroke: big ? 'var(--ink)' : 'var(--ink-faint)', 'stroke-width': big ? 2.6 : 1.1, 'stroke-linecap': 'round'
    }));
  }
  if (o.numerals !== false){
    for (let h = 1; h <= 12; h++){
      const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
      g.push(svg('text', {
        x: cx + Math.cos(a) * (R - 15), y: cy + Math.sin(a) * (R - 15) + 4.4,
        'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 12, 'font-weight': 800,
        'font-family': 'var(--fs-num)'
      }, String(h)));
    }
  }
  const ma = (minute / 60) * Math.PI * 2 - Math.PI / 2;
  const ha = (((hour % 12) + minute / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  g.push(svg('line', { x1: cx, y1: cy, x2: cx + Math.cos(ha) * 21, y2: cy + Math.sin(ha) * 21,
    stroke: 'var(--c-red)', 'stroke-width': 6.2, 'stroke-linecap': 'round', class: 'hand-h' }));
  g.push(svg('line', { x1: cx, y1: cy, x2: cx + Math.cos(ma) * 33, y2: cy + Math.sin(ma) * 33,
    stroke: 'var(--c-blue)', 'stroke-width': 4, 'stroke-linecap': 'round', class: 'hand-m' }));
  g.push(svg('circle', { cx, cy, r: 3.6, fill: 'var(--ink)' }));
  return svg('svg', { viewBox: '0 0 100 100', class: 'clock' + (o.cls ? ' ' + o.cls : ''), 'aria-hidden': 'true' }, g);
}

/* ---------- Catmull-Rom smoothing (used by numeral strokes) ---------- */
function smooth(ctrl, per){
  if (ctrl.length < 2) return ctrl.slice();
  const p = [ctrl[0]].concat(ctrl, [ctrl[ctrl.length - 1]]);
  const out = [], n = per || 14;
  for (let i = 1; i < p.length - 2; i++){
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    for (let t = 0; t < n; t++){
      const s = t / n, s2 = s * s, s3 = s2 * s;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * s + (2*p0[0] - 5*p1[0] + 4*p2[0] - p3[0]) * s2 + (-p0[0] + 3*p1[0] - 3*p2[0] + p3[0]) * s3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * s + (2*p0[1] - 5*p1[1] + 4*p2[1] - p3[1]) * s2 + (-p0[1] + 3*p1[1] - 3*p2[1] + p3[1]) * s3)
      ]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
const toPath = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

/* ---------- numeral stroke data (0-9) in a 100 x 140 box ----------
   Forms and stroke order follow Japanese elementary handwriting practice. */
const DIGIT_CTRL = {
  0: [[[50,18],[27,42],[22,76],[34,112],[50,124],[68,112],[79,76],[73,42],[50,18]]],
  1: [[[30,34],[50,16],[52,40],[52,126]]],
  2: [[[24,40],[38,22],[62,20],[76,36],[70,58],[46,80],[24,120],[80,120]]],
  3: [[[26,32],[46,18],[68,26],[68,50],[48,66],[70,76],[78,100],[62,122],[32,124],[22,112]]],
  4: [[[64,16],[38,62],[16,90],[86,90]], [[64,44],[64,126]]],
  5: [[[32,22],[28,64],[52,54],[74,68],[76,96],[56,120],[28,118],[20,108]], [[32,22],[80,22]]],
  6: [[[72,20],[46,32],[28,62],[24,96],[38,120],[62,122],[76,104],[70,80],[46,74],[28,88]]],
  7: [[[22,26],[80,26],[62,66],[44,126]]],
  8: [[[58,20],[34,32],[34,52],[58,68],[74,88],[70,114],[48,124],[28,114],[24,90],[44,68],[62,52],[62,32],[46,20],[38,26]]],
  9: [[[68,34],[56,22],[38,24],[26,40],[28,58],[42,70],[58,68],[68,54],[68,34],[68,62],[70,92],[62,116],[48,128],[32,126]]]
};
const DIGIT_STROKES = (() => {
  const out = {};
  for (const d in DIGIT_CTRL) out[d] = DIGIT_CTRL[d].map(c => smooth(c, 16));
  return out;
})();
