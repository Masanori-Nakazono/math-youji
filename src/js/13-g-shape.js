/* ===========================================================
   13 — WORLD 4「かたちの もり」 かたち・なかまわけ・きまり・とけい
   =========================================================== */
'use strict';

const SHAPE_COLORS = ['var(--c-red)','var(--c-blue)','var(--c-green)','var(--c-purple)','var(--c-orange)','var(--c-pink)'];

/* ============================================================
   12. かたち
   ============================================================ */
const KIND_JA = { circle: 'まる', triangle: 'さんかく', square: 'しかく' };
const KIND_MEMBERS = {
  circle:   ['circle', 'oval'],
  triangle: ['tri', 'tri2', 'rtri'],
  square:   ['square', 'rect']
};
const OTHERS = ['diamond', 'pentagon', 'hexagon', 'trapezoid', 'star', 'heart', 'semi'];

function findAllShapes(api){
  const target = pick(['circle', 'triangle', 'square']);
  const nTarget = ri(2, 4);
  const cells = [];
  for (let i = 0; i < nTarget; i++) cells.push({ name: pick(KIND_MEMBERS[target]), hit: true });
  const otherKinds = ['circle', 'triangle', 'square'].filter(k => k !== target);
  // 「しかく」means four-sided, so a rhombus or trapezoid would be a fair answer too:
  // keep every other quadrilateral out of the distractors when squares are the target
  const others = target === 'square'
    ? OTHERS.filter(k => k !== 'diamond' && k !== 'trapezoid')
    : OTHERS;
  const nOther = ri(4, 6);
  for (let i = 0; i < nOther; i++){
    const src = chance(.7) ? KIND_MEMBERS[pick(otherKinds)] : others;
    cells.push({ name: pick(src), hit: false });
  }
  api.item('find:' + target, KIND_JA[target] + ' を さがす');
  api.setPrompt(`<b>${KIND_JA[target]}</b> を ぜんぶ タップしよう`, `${KIND_JA[target]}を全部タップしよう。`);
  const grid = el('div.shapegrid');
  const tally = el('div.tally');
  const drawTally = () => {
    clear(tally);
    tally.append(el('span.lbl', { text: 'みつけた' }));
    for (let i = 0; i < nTarget; i++) tally.append(el('span.dot' + (i < found ? '.on' : '')));
  };
  let found = 0;
  shuffle(cells).forEach((c, i) => {
    const rot = c.name === 'square' || c.name === 'rect' ? ri(-18, 18) : ri(0, 359);
    const b = el('button.shapebtn', { type: 'button' }, shapeSVG(c.name, SHAPE_COLORS[i % SHAPE_COLORS.length], rot));
    b.addEventListener('click', () => {
      if (api.locked || b.classList.contains('picked')) return;
      if (c.hit){
        b.classList.add('picked'); found++; Sound.sfx.count(found - 1); drawTally();
        if (found === nTarget){ $$('.shapebtn.picked', grid).forEach(x => x.classList.add('correct')); api.correct(); }
      } else {
        b.classList.add('wrong'); api.later(() => b.classList.remove('wrong'), 460); api.wrong(b);
      }
    });
    grid.append(b);
  });
  drawTally();
  api.field.append(grid, tally, el('div.hintline', { text: 'むきが かわっても おなじ かたちだよ' }));
  api.onHint(() => {
    if ($('.hint2', api.field)) return;
    api.field.append(el('div.hintline.hint2', { text: KIND_JA[target] + 'は ぜんぶで ' + nTarget + 'こ。のこり ' + (nTarget - found) + 'こ' }));
  });
}

const OBJ_SHAPE = [
  { e: '⚽️', k: 'circle' }, { e: '⏰', k: 'circle' }, { e: '🍪', k: 'circle' },
  { e: '🍩', k: 'circle' }, { e: '🏀', k: 'circle' },
  { e: '🍕', k: 'triangle' }, { e: '⛺️', k: 'triangle' }, { e: '🍙', k: 'triangle' },
  { e: '📕', k: 'square' }, { e: '🪟', k: 'square' }, { e: '📺', k: 'square' },
  { e: '🎁', k: 'square' }, { e: '🧊', k: 'square' }
];

function objectToShape(api){
  const o = pick(OBJ_SHAPE);
  api.item('obj:' + o.e, o.e + ' は ' + KIND_JA[o.k]);
  api.setPrompt(`${o.e} と おなじ かたちは どれ？`, '同じ形は、どれ？');
  api.field.append(el('div', { style: { fontSize: 'calc(var(--u)*10)', lineHeight: 1 }, text: o.e }));
  const kinds = shuffle(['circle', 'triangle', 'square']);
  api.buildChoices(kinds, o.k, {
    cls: 'pic',
    render: k => {
      const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'calc(var(--u)*.2)' } });
      const s = shapeSVG(pick(KIND_MEMBERS[k]), SHAPE_COLORS[ri(0, 5)], 0);
      s.setAttribute('width', 'calc(var(--u)*6)'); s.setAttribute('height', 'calc(var(--u)*6)');
      wrap.append(s, el('div', { text: KIND_JA[k], style: { fontSize: 'calc(var(--u)*1.3)' } }));
      return wrap;
    }
  });
}

/* --- silhouette puzzles: build a picture out of shapes --- */
const PUZZLES = [
  { name: 'おうち', pieces: [
      { pts: [[20,34],[80,34],[80,72],[20,72]] },
      { pts: [[50,6],[86,34],[14,34]] } ] },
  { name: 'ヨット', pieces: [
      { pts: [[14,54],[86,54],[74,72],[26,72]] },
      { pts: [[48,8],[48,50],[18,50]] },
      { pts: [[54,14],[54,50],[82,50]] } ] },
  { name: 'ロケット', pieces: [
      { pts: [[38,26],[62,26],[62,64],[38,64]] },
      { pts: [[50,4],[64,26],[36,26]] },
      { pts: [[38,50],[38,72],[24,72]] },
      { pts: [[62,50],[62,72],[76,72]] } ] },
  { name: 'ちょうちょ', pieces: [
      { pts: [[48,38],[16,14],[16,38]] },
      { pts: [[52,38],[84,14],[84,38]] },
      { pts: [[48,42],[16,66],[16,42]] },
      { pts: [[52,42],[84,66],[84,42]] } ] },
  { name: 'おおきな き', pieces: [
      { pts: [[44,58],[56,58],[56,74],[44,74]] },
      { pts: [[50,8],[76,38],[24,38]] },
      { pts: [[50,28],[82,60],[18,60]] } ] }
];

function bbox(pts){
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/* Two pieces are the same piece only if they are the same shape in the same
   orientation. The old signature was 頂点数:幅x高さ, which made ちょうちょ's four
   right triangles — the same triangle in four different orientations — all read as
   `3:32x24`, so any tile fitted any hole and the puzzle could be finished without
   looking at the shapes at all. ロケット's two fins (mirror images) collided the
   same way. Normalising the corners to the piece's own bounding box keeps genuinely
   identical pieces interchangeable while telling ◤ from ◥; sorting makes the
   comparison independent of the order the corners were authored in. */
function signature(pts){
  const b = bbox(pts);
  return pts.map(p => (Math.round((p[0] - b.x0) * 2) / 2) + ',' + (Math.round((p[1] - b.y0) * 2) / 2))
            .sort()
            .join(' ');
}

function shapePuzzle(api){
  const pz = pick(PUZZLES);
  api.item('puz:' + pz.name, pz.name + ' を つくる');
  api.setPrompt(`かたちを はめて <b>${pz.name}</b> を つくろう`, `形をはめて、${pz.name}を作ろう。`);
  const box = el('div.shapefield');
  const s = svg('svg', { viewBox: '0 0 100 80', preserveAspectRatio: 'xMidYMid meet' });
  box.append(s);
  const tray = el('div.shapes-tray');
  api.field.append(box, tray);

  const slots = pz.pieces.map((p, i) => {
    const poly = svg('polygon', {
      points: p.pts.map(q => q.join(',')).join(' '),
      fill: 'var(--trace-guide)', stroke: 'var(--ink-faint)', 'stroke-width': 1.6,
      'stroke-dasharray': '3 2.4', 'data-drop': '', style: 'cursor:pointer'
    });
    poly.dataset.sig = signature(p.pts);
    s.append(poly);
    return poly;
  });

  const colors = shuffle(SHAPE_COLORS);
  let filled = 0;
  const dd = UI.makeDragDrop({
    onDrop(item, target){
      if (api.locked) return;
      if (target.dataset.filled === '1') return;
      if (item.dataset.sig === target.dataset.sig){
        target.setAttribute('fill', item.dataset.color);
        target.setAttribute('stroke', 'color-mix(in srgb, ' + item.dataset.color + ' 60%, var(--ink) 40%)');
        target.setAttribute('stroke-dasharray', '');
        target.setAttribute('stroke-width', '1.6');
        target.dataset.filled = '1';
        item.classList.add('used');
        filled++;
        Sound.sfx.place();
        if (filled === slots.length) api.later(() => api.correct(), 260);
      } else {
        target.animate([{ opacity: 1 }, { opacity: .35 }, { opacity: 1 }], { duration: 300 });
        api.wrong(item);
        dd.select(item);            // stay picked up so the next slot is one tap away
      }
    }
  });
  slots.forEach(sl => dd.bindTarget(sl));

  // each tray tile is cropped around its own piece, on a shared scale, so small
  // pieces stay recognisable while the size difference between pieces stays readable
  const boxes = pz.pieces.map(p => bbox(p.pts));
  const biggest = Math.max.apply(null, boxes.map(b => Math.max(b.w, b.h)));
  shuffle(pz.pieces.map((p, i) => ({ p, i }))).forEach(({ p, i }) => {
    const color = colors[i % colors.length];
    const b = boxes[i];
    const S = Math.max(Math.max(b.w, b.h) * 1.25, biggest * 0.5);
    const t = el('div.shapetile');
    const mini = svg('svg', { viewBox: `${b.cx - S / 2} ${b.cy - S / 2} ${S} ${S}` },
      svg('polygon', { points: p.pts.map(q => q.join(',')).join(' '), fill: color,
        stroke: 'color-mix(in srgb, ' + color + ' 60%, var(--ink) 40%)',
        'stroke-width': S * 0.028, 'stroke-linejoin': 'round' }));
    t.append(mini);
    t.dataset.sig = signature(p.pts);
    t.dataset.color = color;
    dd.bindItem(t);
    tray.append(t);
  });
  api.field.append(el('div.hintline', { text: 'ゆびで はめて みよう' }));
  api.onHint(() => {
    const t = $('.shapetile:not(.used)', tray);
    if (!t) return;
    dd.select(t);
    const slot = slots.find(sl => sl.dataset.filled !== '1' && sl.dataset.sig === t.dataset.sig);
    if (slot) slot.classList.add('glow');
  });
}

Games.add({
  id: 'shape', name: 'かたち', ico: '🔺', world: 'mori', color: 'var(--c-purple)',
  aim: '<b>向きや色や大きさが変わっても同じ形</b>だと分かること、そして形を組み合わせて別の形を作る経験。図形感覚は1年生の「かたちあそび」から6年生の面積まで一本でつながります。',
  levels: [
    { t: 'まる・さんかく・しかく', d: 'なかまを ぜんぶ さがす', make: findAllShapes },
    { t: 'おなじ かたち', d: 'みのまわりの もの と', make: objectToShape },
    { t: 'かたちづくり', d: 'はめて えを つくる', n: 5, make: shapePuzzle }
  ]
});

/* ============================================================
   13. なかまわけ — classification
   ============================================================ */
const CATS = {
  fruit:   { lbl: 'くだもの', e: '🍎', c: 'var(--c-red)',    items: ['🍎','🍓','🍌','🍇','🍑','🍉','🍊','🍐'] },
  animal:  { lbl: 'どうぶつ', e: '🐰', c: 'var(--c-orange)', items: ['🐰','🐻','🦊','🐯','🐨','🐷','🐮','🐵'] },
  vehicle: { lbl: 'のりもの', e: '🚗', c: 'var(--c-blue)',   items: ['🚗','🚌','🚂','✈️','🚲','🚒','🚕','🛵'] },
  veg:     { lbl: 'やさい',   e: '🥕', c: 'var(--c-green)',  items: ['🥕','🌽','🥦','🍆','🥔','🧅','🫑','🥬'] },
  bug:     { lbl: 'むし',     e: '🐞', c: 'var(--c-purple)', items: ['🐞','🦋','🐝','🐛','🦗','🕷','🐜','🪲'] }
};
/* Solid crayon-coloured shapes: when the axis is colour, the colour has to be the
   only thing that varies, and it must not be at the mercy of an emoji font. */
const COLOR_SHAPES = ['circle', 'square', 'tri', 'star', 'heart', 'oval'];
const COLOR_CATS = {
  red:    { lbl: 'あか',   c: 'var(--c-red)',    swatch: 'circle' },
  blue:   { lbl: 'あお',   c: 'var(--c-blue)',   swatch: 'circle' },
  yellow: { lbl: 'きいろ', c: 'var(--c-yellow)', swatch: 'circle' }
};

function sortGame(api, catset, nBins, byColor){
  const keys = sample(Object.keys(catset), nBins);
  const perBin = nBins === 2 ? 3 : 2;
  api.item('sort:' + keys.slice().sort().join('_'),
    keys.map(k => catset[k].lbl).join('・') + ' に わける');
  api.setPrompt(byColor ? 'おなじ いろの ばしょに いれてね' : 'なかまの ばしょに いれてね',
                byColor ? '同じ色の場所に入れてね。' : '仲間の場所に入れてね。');
  const mark = k => {
    const c = catset[k];
    if (!byColor) return el('span', { text: c.e });
    const sv = shapeSVG(c.swatch, c.c, 0);
    sv.setAttribute('width', 'calc(var(--u)*2)'); sv.setAttribute('height', 'calc(var(--u)*2)');
    return sv;
  };
  const bins = el('div.bins');
  const binMap = {};
  keys.forEach(k => {
    const c = catset[k];
    const b = el('div.bin', { style: { '--bc': c.c } },
      el('div.lbl', null, mark(k), ' ' + c.lbl),
      el('div.hold'));
    b.dataset.cat = k;
    binMap[k] = b;
    bins.append(b);
  });
  const tray = el('div.tray');
  api.field.append(bins, tray);

  const picks = [];
  keys.forEach(k => {
    if (byColor) sample(COLOR_SHAPES, perBin).forEach(shape => picks.push({ shape, k }));
    else sample(catset[k].items, perBin).forEach(e => picks.push({ e, k }));
  });
  let placed = 0;
  const totalItems = picks.length;

  const dd = UI.makeDragDrop({
    onDrop(item, target){
      if (api.locked) return;
      if (item.dataset.cat === target.dataset.cat){
        const copy = item.firstElementChild ? item.firstElementChild.cloneNode(true) : el('span', { text: item.textContent });
        $('.hold', target).append(el('span.item', null, copy));
        item.classList.add('gone');
        placed++;
        Sound.sfx.place();
        if (placed === totalItems) api.later(() => api.correct(), 300);
      } else {
        target.classList.add('nope');
        api.later(() => target.classList.remove('nope'), 440);
        api.wrong(item);
      }
    }
  });
  Object.values(binMap).forEach(b => dd.bindTarget(b));
  shuffle(picks).forEach(p => {
    let t;
    if (byColor){
      const sv = shapeSVG(p.shape, catset[p.k].c, 0);
      sv.setAttribute('width', 'calc(var(--u)*3.4)'); sv.setAttribute('height', 'calc(var(--u)*3.4)');
      t = el('div.tile.shapetile2', null, sv);
    } else {
      t = el('div.tile', { text: p.e });
    }
    t.dataset.cat = p.k;
    dd.bindItem(t);
    tray.append(t);
  });
  api.field.append(el('div.hintline', { text: 'ゆびで はこに いれてね' }));
  api.onHint(() => {
    const t = $('.tile:not(.gone)', tray);
    if (!t) return;
    dd.select(t);
    binMap[t.dataset.cat].classList.add('glow');
  });
}

Games.add({
  id: 'sort', name: 'なかまわけ', ico: '🧺', world: 'mori', color: 'var(--c-purple)',
  aim: 'ものを<b>ある観点でグループにまとめる</b>力。分類ができると「同じものがいくつあるか」を数えられるようになり、表やグラフ、データの見方の入り口になります。',
  levels: [
    { t: 'いろ', d: '2つに わける', make: api => sortGame(api, COLOR_CATS, 2, true) },
    { t: 'なかま', d: 'くだもの・どうぶつ など', make: api => sortGame(api, CATS, 2) },
    { t: '3つに わける', d: 'なかまが ふえるよ', make: api => sortGame(api, CATS, 3) }
  ]
});

/* ============================================================
   14. きまり さがし — patterns
   ============================================================ */
const PAT_TOKENS = ['🔴','🔵','🟡','🟢','🟣','🟠','⭐️','🌙','🍎','🍌','🐰','🐻'];

function patternQuestion(api, unitKind, blanks){
  const kinds = { AB: [0, 1], AAB: [0, 0, 1], ABB: [0, 1, 1], ABC: [0, 1, 2], ABBA: [0, 1, 1, 0] };
  const unit = kinds[unitKind];
  const need = Math.max.apply(null, unit) + 1;
  const toks = sample(PAT_TOKENS, need);
  const seq = [];
  const wanted = Math.min(10, unit.length * 3 + ri(0, unit.length - 1));   // must stay on one line
  while (seq.length < wanted) seq.push(toks[unit[seq.length % unit.length]]);
  const total = seq.length;
  const holes = [];
  for (let i = 0; i < blanks; i++) holes.push(total - 1 - i);
  holes.sort((a, b) => a - b);
  api.item('pat:' + unitKind + ':' + blanks, unitKind + ' の くりかえし');
  api.setPrompt('つづきは どれ？ きまりを みつけよう', '続きは、どれ？きまりを見つけよう。');
  const train = el('div.train');
  const cars = seq.map((t, i) => {
    const isHole = holes.indexOf(i) >= 0;
    const c = el('div.car' + (isHole ? '.blank' : ''), { text: isHole ? '' : t });
    train.append(c);
    return c;
  });
  api.field.append(train);

  let hi = 0;
  function askHole(){
    if (hi >= holes.length) return;
    const at = holes[hi];
    cars.forEach(c => c.classList.remove('now'));
    cars[at].classList.add('blank', 'now');
    const ans = seq[at];
    const opts = shuffle(toks.concat(sample(PAT_TOKENS.filter(t => toks.indexOf(t) < 0), Math.max(0, 3 - need))));
    api.buildChoices(opts.slice(0, Math.max(3, need)), ans, {
      cls: 'pic',
      render: v => el('span', { text: v, style: { fontSize: 'calc(var(--u)*3.2)' } }),
      onPick(){
        cars[at].textContent = ans;
        cars[at].classList.remove('blank', 'now');
        cars[at].classList.add('filled');
        Sound.sfx.place();
        hi++;
        if (hi < holes.length){ api.later(askHole, 560); return false; }
        return true;
      }
    });
  }
  askHole();
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    cars.forEach((c, i) => { if (Math.floor(i / unit.length) % 2 === 0) c.classList.add('unitmark'); });
    api.field.append(el('div.hintline', { text: unit.length + 'つずつ おなじ ならびが くりかえして いるよ' }));
  });
}

Games.add({
  id: 'pattern', name: 'きまり さがし', ico: '🎏', world: 'mori', color: 'var(--c-purple)',
  aim: '<b>繰り返しのきまりを見つけて先を予想する</b>力。規則性に気づく経験は、九九・図形の性質・関数の考えまで続く「算数的な見方」そのものです。',
  levels: [
    { t: '2つの くりかえし', d: '●▲●▲…', make: api => patternQuestion(api, 'AB', 1) },
    { t: '3つの くりかえし', d: '●●▲ / ●▲▲', make: api => patternQuestion(api, pick(['AAB', 'ABB', 'ABC']), 1) },
    { t: 'むずかしい きまり', d: 'あなが 2つ', make: api => patternQuestion(api, pick(['ABC', 'ABBA', 'AAB']), 2) }
  ]
});

/* ============================================================
   15. とけい — reading the clock
   ============================================================ */
/* Only times that mean one thing to a five-year-old regardless of am/pm. */
const HOUR_SCENES = { 7: '🌅 あさごはん', 12: '🍛 おひるごはん', 3: '🧃 おやつ' };

function readClock(api, half){
  const h = ri(1, 12);
  const m = half && chance(.5) ? 30 : 0;
  api.item('read:' + h + ':' + m, h + 'じ' + (m === 30 ? 'はん' : '') + ' を よむ');
  api.setPrompt('なんじ かな？', '何時かな？');
  const c = clockSVG(h, m);
  c.style.width = 'calc(var(--u)*22)';
  c.style.height = 'calc(var(--u)*22)';
  api.field.append(c);
  if (m === 0 && HOUR_SCENES[h]) api.field.append(el('div.hintline', { text: HOUR_SCENES[h] }));
  const ans = h + ':' + m;
  const opts = new Set([ans]);
  let guard = 0;
  while (opts.size < 4 && guard++ < 60){
    const hh = ri(1, 12), mm = half ? pick([0, 30]) : 0;
    opts.add(hh + ':' + mm);
  }
  api.buildChoices(shuffle(Array.from(opts)), ans, {
    render: v => {
      const [hh, mm] = v.split(':');
      return hh + 'じ' + (mm === '30' ? 'はん' : '');
    }
  });
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', {
      text: m === 30 ? 'ながい はりが 6 のとき「はん」。みじかい はりは すぎた ほうの すうじ' : 'みじかい はりが さす すうじを よもう' }));
  });
}

function pickClock(api, half){
  const h = ri(1, 12), m = half && chance(.5) ? 30 : 0;
  api.item('pick:' + h + ':' + m, h + 'じ' + (m === 30 ? 'はん' : '') + ' の とけいを えらぶ');
  api.setPrompt(`<b>${h}じ${m === 30 ? 'はん' : ''}</b> の とけいは どれ？`,
                `${jiKana(h, m === 30)}の時計は、どれ？`);
  const opts = [{ h, m }];
  let guard = 0;
  while (opts.length < 3 && guard++ < 60){
    const hh = ri(1, 12), mm = half ? pick([0, 30]) : 0;
    if (!opts.some(o => o.h === hh && o.m === mm)) opts.push({ h: hh, m: mm });
  }
  clear(api.choices);
  shuffle(opts).forEach(o => {
    const wrap = el('div.clock-choice', null, clockSVG(o.h, o.m, { numerals: true }));
    tappable(wrap, () => {
      if (api.locked) return;
      if (o.h === h && o.m === m){ wrap.classList.add('correct'); api.correct(); }
      else { wrap.classList.add('wrong'); api.later(() => wrap.classList.remove('wrong'), 460); api.wrong(wrap); }
    });
    api.choices.append(wrap);
  });
}

function setClock(api){
  const target = ri(1, 12);
  api.item('set:' + target, target + 'じ に はりを あわせる');
  api.setPrompt(`<b>${target}じ</b> に なるように みじかい はりを うごかそう`,
                `${jiKana(target)}になるように、短い針を動かそう。`);
  let cur = ri(1, 12);
  for (let g = 0; g < 100 && cur === target; g++) cur = ri(1, 12);
  if (cur === target) cur = target === 12 ? 1 : target + 1;
  const holder = el('div', { style: { touchAction: 'none' } });
  api.field.append(holder);
  const readout = el('div.hintline', { text: 'いま ' + cur + 'じ' });
  api.field.append(readout);

  const clock = clockSVG(cur, 0, { cls: 'pickable' });
  clock.style.width = 'calc(var(--u)*26)';
  clock.style.height = 'calc(var(--u)*26)';
  holder.append(clock);
  const hourHand = $('.hand-h', clock);

  function paint(){
    // rebuilding the SVG here would destroy the node that received pointerdown,
    // which is exactly why dragging the hand never worked
    const a = ((cur % 12) / 12) * Math.PI * 2 - Math.PI / 2;
    hourHand.setAttribute('x2', (50 + Math.cos(a) * 21).toFixed(2));
    hourHand.setAttribute('y2', (50 + Math.sin(a) * 21).toFixed(2));
    readout.textContent = 'いま ' + cur + 'じ';
  }

  let down = false;
  function setFrom(e){
    const r = clock.getBoundingClientRect();
    if (!r.width) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let ang = Math.atan2(dy, dx) + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    let h = Math.round(ang / (Math.PI * 2) * 12);
    if (h === 0) h = 12;
    if (h !== cur){ cur = h; Sound.sfx.tap(); paint(); }
  }
  clock.addEventListener('pointerdown', e => {
    if (api.locked) return;
    down = true;
    e.preventDefault();
    if (clock.setPointerCapture) clock.setPointerCapture(e.pointerId);
    setFrom(e);
  });
  clock.addEventListener('pointermove', e => { if (down && !api.locked){ e.preventDefault(); setFrom(e); } });
  const release = () => { down = false; };
  clock.addEventListener('pointerup', release);
  clock.addEventListener('pointercancel', release);
  paint();

  const check = el('button.btn.btn-accent', { text: 'これで いい？',
    onclick(){
      if (api.locked) return;
      if (cur === target) api.correct(); else { api.wrong(check); }
    } });
  api.choices.append(check);
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', { text: 'みじかい はりが ' + target + ' を さすように まわそう' }));
    $$('text', clock).forEach(t => { if (t.textContent === String(target)) t.classList.add('goal'); });
  });
}

Games.add({
  id: 'clock', name: 'とけい', ico: '🕒', world: 'mori', color: 'var(--c-purple)',
  aim: '「なんじ」「なんじはん」が読めること。<b>時計は生活の中の数</b>で、短い針＝時、長い針＝分という役割の違いが分かると、1年生の時計の学習でつまずきません。',
  levels: [
    { t: 'なんじ', d: 'ちょうどの じかん', make: api => readClock(api, false) },
    { t: 'なんじはん', d: 'はんも よめるように', make: api => chance(.5) ? readClock(api, true) : pickClock(api, true) },
    { t: 'はりを うごかす', d: 'じぶんで あわせる', n: 6, make: setClock }
  ]
});
