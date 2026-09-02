/* ===========================================================
   11 — WORLD 2「くらべる うみ」 くらべる・なんばんめ・おおきさ
   =========================================================== */
'use strict';

/* ============================================================
   5. どっちが おおい — quantity beats appearance
   ============================================================ */
function platesCompare(api, opts){
  const o = opts || {};
  const thing = pick(THINGS);
  const want = o.least ? 'least' : 'most';
  const counts = o.counts;
  const answer = want === 'most' ? Math.max.apply(null, counts) : Math.min.apply(null, counts);
  api.setPrompt(want === 'most' ? 'どっちが <b>おおい</b>？' : 'どっちが <b>すくない</b>？',
                want === 'most' ? 'どっちが おおい' : 'どっちが すくない');
  if (counts.length > 2){
    api.setPrompt(want === 'most' ? 'いちばん <b>おおい</b> のは どれ？' : 'いちばん <b>すくない</b> のは どれ？',
                  want === 'most' ? 'いちばん おおいのは どれ' : 'いちばん すくないのは どれ');
  }
  const wrap = el('div.row', { style: { gap: 'calc(var(--u)*1.4)' } });
  const order = shuffle(counts.map((c, i) => ({ c, i })));
  let solved = false;
  order.forEach(({ c, i }) => {
    const size = o.sizes ? o.sizes[i] : null;
    const plate = el('div.plate', {
      style: { minWidth: 'calc(var(--u)*' + (counts.length > 2 ? 11 : 15) + ')' } });
    const g = el('div.row', { style: { maxWidth: 'calc(var(--u)*' + (counts.length > 2 ? 10 : 14) + ')' } });
    for (let k = 0; k < c; k++){
      g.append(el('span.item', { text: thing.e, style: { fontSize: 'calc(var(--u)*' + (size || 2.8) + ')' } }));
    }
    plate.append(g);
    tappable(plate, () => {
      if (api.locked || solved) return;
      if (c === answer){ solved = true; plate.classList.add('correct'); api.correct(); }
      else { plate.classList.add('wrong'); api.later(() => plate.classList.remove('wrong'), 460); api.wrong(plate); }
    });
    wrap.append(plate);
    plate.dataset.count = c;
  });
  api.field.append(wrap);
  api.onHint(() => {
    $$('.plate', wrap).forEach(p => {
      if (!$('.hintline', p)) p.append(el('div.hintline', { text: p.dataset.count + 'こ' }));
    });
  });
}

function compareEasy(api){
  let a = ri(1, 8), b = ri(1, 8);
  for (let g = 0; g < 200 && Math.abs(a - b) < 3; g++){ a = ri(1, 8); b = ri(1, 8); }
  if (Math.abs(a - b) < 3){ a = 2; b = 7; }
  platesCompare(api, { counts: [a, b], least: chance(.3) });
}
function compareClose(api){
  // same count-difference of 1-2, but the smaller group is drawn LARGER on purpose:
  // the child has to count instead of judging by how much space it fills.
  let a = ri(4, 11), b = a + pick([1, 2]) * (chance(.5) ? 1 : -1);
  b = clamp(b, 2, 12);
  if (a === b) b = a + 1;
  const sizes = [2.6, 2.6];
  if (chance(.6)){ const small = a < b ? 0 : 1; sizes[small] = 4.4; sizes[1 - small] = 2.2; }
  platesCompare(api, { counts: [a, b], sizes, least: chance(.35) });
}
function compareThree(api){
  const set = new Set();
  for (let g = 0; g < 300 && set.size < 3; g++) set.add(ri(2, 12));
  [2, 7, 12].forEach(v => { if (set.size < 3) set.add(v); });
  platesCompare(api, { counts: Array.from(set), least: chance(.45) });
}
function compareNumerals(api){
  let a = ri(1, 20), b = ri(1, 20);
  for (let g = 0; g < 200 && a === b; g++) b = ri(1, 20);
  if (a === b) b = a === 20 ? 1 : a + 1;
  const most = chance(.6);
  const ans = most ? Math.max(a, b) : Math.min(a, b);
  api.setPrompt(most ? 'かずが <b>おおきい</b> のは どっち？' : 'かずが <b>ちいさい</b> のは どっち？',
                most ? 'かずが おおきいのは どっち' : 'かずが ちいさいのは どっち');
  api.field.append(el('div.hintline', { text: 'すうじで くらべよう' }));
  api.buildChoices(shuffle([a, b]), ans);
}

Games.add({
  id: 'compare', name: 'どっちが おおい', ico: '⚖️', world: 'umi', color: 'var(--c-green)',
  aim: '<b>見た目の大きさや広がりに惑わされず</b>、数そのもので多い少ないを判断する力。「大きい物が少しある方が多く見える」段階を、数えて確かめる経験で越えていきます。',
  levels: [
    { t: 'ぱっと みて', d: 'はっきり ちがう かず', make: compareEasy },
    { t: 'ちかい かず', d: 'かぞえないと わからない', make: compareClose },
    { t: '3つ・すうじ', d: 'いちばん おおい／すくない', make: api => chance(.4) ? compareNumerals(api) : compareThree(api) }
  ]
});

/* ============================================================
   6. なんばんめ — ordinal position vs cardinal amount
   ============================================================ */
const CRITTERS = ['🐰','🐻','🦊','🐯','🐨','🐸','🐷','🐮','🐼','🐵','🦁','🐔','🐧','🦉'];

function ordinalRow(api, n, dir, target){
  const critters = sample(CRITTERS, n);
  const label = { front: 'まえ', back: 'うしろ', left: 'ひだり', right: 'みぎ' }[dir];
  api.setPrompt(`${label}から ${numTag(target)}ばんめ の どうぶつを タップ`,
                `${label}から ${banmeKana(target)}の どうぶつを タップ`);
  const idxWanted = (dir === 'front' || dir === 'left') ? target - 1 : n - target;
  const q = el('div.queue');
  critters.forEach((c, i) => {
    const item = el('div.qi', { text: c });
    tappable(item, () => {
      if (api.locked) return;
      if (i === idxWanted){ item.classList.add('correct'); api.correct(); }
      else { item.classList.add('wrong'); api.later(() => item.classList.remove('wrong'), 460); api.wrong(item); }
    });
    q.append(item);
  });
  // the marker sits at the end you count from and points into the line
  const fromLeft = (dir === 'front' || dir === 'left');
  const marker = fromLeft
    ? el('div.dirmark', null, label + 'から', arrowSVG('right'))
    : el('div.dirmark', null, arrowSVG('left'), label + 'から');
  api.field.append(el('div.row', { style: { flexWrap: 'nowrap', gap: 'calc(var(--u)*.6)', maxWidth: '100%' } },
    fromLeft ? marker : null, q, fromLeft ? null : marker));
  api.onHint(() => {
    $$('.qi', q).forEach((item, i) => {
      const k = fromLeft ? i + 1 : n - i;
      if (!$('.hintline', item)) item.prepend(el('div.hintline', { text: String(k), style: { fontSize: 'calc(var(--u)*1.1)' } }));
    });
  });
}

function ordinalVsCount(api, n){
  const critters = sample(CRITTERS, n);
  const k = ri(2, Math.min(4, n - 1));
  const countMode = chance(.5);
  api.setPrompt(countMode
      ? `まえから ${numTag(k)}<b>こ</b> タップ　（${k}ひき ぜんぶ）`
      : `まえから ${numTag(k)}<b>ばんめ</b> だけ タップ`,
    countMode ? `まえから ${koKana(k)} タップしてね` : `まえから ${banmeKana(k)}だけ タップしてね`);
  const q = el('div.queue');
  const marked = new Set();
  critters.forEach((c, i) => {
    const item = el('div.qi', { text: c });
    tappable(item, () => {
      if (api.locked) return;
      if (countMode){
        if (marked.has(i)){ marked.delete(i); item.classList.remove('marked'); Sound.sfx.tap(); return; }
        marked.add(i); item.classList.add('marked'); Sound.sfx.count(marked.size - 1);
        if (marked.size === k){
          const ok = Array.from(marked).every(v => v < k);
          if (ok){ $$('.qi', q).forEach((x, j) => { if (j < k) x.classList.add('correct'); }); api.correct(); }
          else {
            api.wrong();
            marked.forEach(v => $$('.qi', q)[v].classList.remove('marked'));
            marked.clear();
          }
        }
      } else {
        if (i === k - 1){ item.classList.add('correct'); api.correct(); }
        else { item.classList.add('wrong'); api.later(() => item.classList.remove('wrong'), 460); api.wrong(item); }
      }
    });
    q.append(item);
  });
  api.field.append(el('div.row', { style: { flexWrap: 'nowrap', gap: 'calc(var(--u)*.6)', maxWidth: '100%' } },
    el('div.dirmark', null, 'まえ', arrowSVG('right')), q));
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', {
      text: countMode ? '「◯こ」は まえから その かずだけ ぜんぶ' : '「◯ばんめ」は そのひとり だけ' }));
  });
}

function gridPosition(api, cols, rows){
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r, c });
  const pool = shuffle(CRITTERS.concat(CRITTERS)).slice(0, cols * rows);
  const tr = ri(1, rows), tc = ri(1, cols);
  api.setPrompt(`うえから ${numTag(tr)}ばんめ、ひだりから ${numTag(tc)}ばんめ は だれ？`,
                `うえから ${banmeKana(tr)}、ひだりから ${banmeKana(tc)}は だれ`);
  const g = el('div.qgrid', { style: { '--gc': cols } });
  cells.forEach((cell, i) => {
    const item = el('div.qi', { text: pool[i] });
    tappable(item, () => {
      if (api.locked) return;
      if (cell.r === tr - 1 && cell.c === tc - 1){ item.classList.add('correct'); api.correct(); }
      else { item.classList.add('wrong'); api.later(() => item.classList.remove('wrong'), 460); api.wrong(item); }
    });
    g.append(item);
  });
  // two axes at once is hard enough without having to guess where counting starts
  api.field.append(el('div.axes', null,
    el('div.axis-x', null, 'ひだりから', arrowSVG('right')),
    el('div.axis-row', null,
      el('div.axis-y', null, 'うえ', arrowSVG('right')),
      g)));
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    $$('.qi', g).forEach((item, i) => {
      if (cells[i].c === tc - 1) item.classList.add('colhint');
      if (cells[i].r === tr - 1) item.classList.add('rowhint');
    });
    api.field.append(el('div.hintline', { text: 'まず うえから かぞえて、つぎに ひだりから かぞえよう' }));
  });
}

Games.add({
  id: 'ordinal', name: 'なんばんめ', ico: '🚩', world: 'umi', color: 'var(--c-green)',
  aim: '<b>「3こ」（いくつ分）と「3ばんめ」（順序）の区別</b>、そして「どこから数えるか」で答えが変わることの理解。小1の最初の単元でつまずきが集中する場所です。',
  levels: [
    { t: 'まえから', d: 'ならんだ じゅんばん', make: api => ordinalRow(api, ri(4, 6), 'front', ri(1, 4)) },
    { t: 'うしろ・ひだり・みぎ', d: 'かぞえる むきが かわる', make: api => chance(.4)
        ? ordinalVsCount(api, ri(5, 7))
        : ordinalRow(api, ri(5, 8), pick(['back', 'left', 'right']), ri(1, 5)) },
    { t: 'たて と よこ', d: 'ますめの ばしょ', make: api => gridPosition(api, ri(3, 4), ri(3, 4)) }
  ]
});

/* ============================================================
   7. おおきさ くらべ — length, capacity, ordering
   ============================================================ */
const MEAS_ICONS = ['✏️','🖍','🧵','🥕','🦴','🪵','🧹','🎋'];

/* one row = icon + a fixed-width track; the bar's width is a share of the track,
   so what the child sees is exactly proportional to the length being compared. */
function barRow(len, offset, color, cap){
  const track = el('div.track', null,
    offset ? el('div.gap', { style: { width: offset + '%' } }) : null,
    el('div.stickbar', { style: { width: len + '%', '--mc': color } }));
  return el('div.mrow', { role: 'button', tabindex: '0' }, el('div.cap', { text: cap }), track);
}

function lengthCompare(api, aligned){
  const n = ri(3, 4);
  const lens = [];
  for (let g = 0; g < 400 && lens.length < n; g++){
    const v = ri(24, 92);
    if (lens.every(x => Math.abs(x - v) >= 12)) lens.push(v);
  }
  while (lens.length < n) lens.push(28 + lens.length * 16);
  const cap = pick(MEAS_ICONS);
  const longest = chance(.55);
  const ans = longest ? Math.max.apply(null, lens) : Math.min.apply(null, lens);
  api.setPrompt(longest ? 'いちばん <b>ながい</b> のは どれ？' : 'いちばん <b>みじかい</b> のは どれ？',
                longest ? 'いちばん ながいのは どれ' : 'いちばん みじかいのは どれ');
  const wrap = el('div.measure');
  const colors = shuffle(['var(--c-red)','var(--c-blue)','var(--c-green)','var(--c-purple)']);
  lens.forEach((L, i) => {
    const off = aligned ? 0 : ri(0, Math.max(0, Math.min(22, 97 - L)));
    const row = barRow(L, off, colors[i % colors.length], cap);
    tappable(row, () => {
      if (api.locked) return;
      if (L === ans){ row.classList.add('correct'); api.correct(); }
      else { row.classList.add('wrong'); api.later(() => row.classList.remove('wrong'), 460); api.wrong(row); }
    });
    wrap.append(row);
  });
  api.field.append(wrap);
  if (!aligned) api.field.append(el('div.hintline', { text: 'はじまる ところが ちがうよ。ながさ だけを みてね' }));
  // sliding every bar back to a shared start line IS the lesson, so show it
  api.onHint(() => {
    $$('.track .gap', wrap).forEach(g => { g.style.transition = 'width .6s ease'; g.style.width = '0%'; });
    wrap.classList.add('lined');
    api.field.append(el('div.hintline', { text: 'はじまりを そろえて みたよ' }));
  });
}

function vesselSVG(w, h, fill, color){
  const W = 90, H = 130;
  const x = (W - w) / 2;
  const waterH = h * fill;
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, width: 'calc(var(--u)*11)', height: 'calc(var(--u)*16)' },
    svg('rect', { x, y: H - h - 6, width: w, height: h, rx: 4, fill: 'var(--card)', stroke: 'var(--ink)', 'stroke-width': 3 }),
    svg('rect', { x: x + 3, y: H - waterH - 9, width: w - 6, height: waterH, rx: 3, fill: color, opacity: .85 }),
    svg('rect', { x, y: H - h - 6, width: w, height: h, rx: 4, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 3 }));
}

function capacityCompare(api){
  // Deliberately decouple "tall" from "much": the taller glass is often the narrower one.
  const n = chance(.5) ? 2 : 3;
  const specs = [];
  for (let g = 0; g < 400 && specs.length < n; g++){
    const w = ri(26, 60), h = ri(52, 112), fill = 1;
    const vol = (w - 6) * h * fill;   // the drawn water rect, so the answer matches the picture
    if (specs.every(s => Math.abs(s.vol - vol) / Math.max(s.vol, vol) > 0.18)) specs.push({ w, h, fill, vol });
  }
  while (specs.length < n){
    const w = 30 + specs.length * 14, h = 100 - specs.length * 22;
    specs.push({ w, h, fill: 1, vol: (w - 6) * h });
  }
  const more = chance(.6);
  const ans = more ? Math.max.apply(null, specs.map(s => s.vol)) : Math.min.apply(null, specs.map(s => s.vol));
  api.setPrompt(more ? 'ジュースが <b>おおい</b> のは どれ？' : 'ジュースが <b>すくない</b> のは どれ？',
                more ? 'ジュースが おおいのは どれ' : 'ジュースが すくないのは どれ');
  const colors = shuffle(['var(--c-orange)','var(--c-red)','var(--c-purple)']);
  const wrap = el('div.vessels');
  shuffle(specs).forEach((s, i) => {
    const v = el('div.vessel', null, vesselSVG(s.w, s.h, s.fill, colors[i % colors.length]));
    tappable(v, () => {
      if (api.locked) return;
      if (s.vol === ans){ v.classList.add('correct'); api.correct(); }
      else { v.classList.add('wrong'); api.later(() => v.classList.remove('wrong'), 460); api.wrong(v); }
    });
    wrap.append(v);
  });
  api.field.append(wrap, el('div.hintline', { text: 'せが たかい ＝ おおい とは かぎらないよ' }));
  // an arbitrary unit grid: count the squares instead of eyeballing the height
  api.onHint(() => {
    $$('.vessel svg', wrap).forEach(sv => {
      const water = sv.querySelectorAll('rect')[1];
      if (!water || sv.querySelector('.unitgrid')) return;
      const x = +water.getAttribute('x'), y = +water.getAttribute('y');
      const w = +water.getAttribute('width'), h = +water.getAttribute('height');
      const g = svg('g', { class: 'unitgrid' });
      for (let gx = x; gx <= x + w + 0.1; gx += w / Math.max(1, Math.round(w / 13)))
        g.append(svg('line', { x1: gx, y1: y, x2: gx, y2: y + h, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1 }));
      for (let gy = y; gy <= y + h + 0.1; gy += h / Math.max(1, Math.round(h / 13)))
        g.append(svg('line', { x1: x, y1: gy, x2: x + w, y2: gy, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1 }));
      sv.append(g);
    });
    api.field.append(el('div.hintline', { text: 'ますの かずを かぞえて くらべよう' }));
  });
}

function orderBySize(api){
  const n = ri(3, 4);
  const lens = [];
  for (let g = 0; g < 400 && lens.length < n; g++){
    const v = ri(26, 94);
    if (lens.every(x => Math.abs(x - v) >= 14)) lens.push(v);
  }
  while (lens.length < n) lens.push(30 + lens.length * 18);
  const asc = chance(.5);
  const wanted = lens.slice().sort((a, b) => asc ? a - b : b - a);
  api.setPrompt(asc ? '<b>みじかい</b> じゅんに タップしよう' : '<b>ながい</b> じゅんに タップしよう',
                asc ? 'みじかい じゅんに タップしよう' : 'ながい じゅんに タップしよう');
  const cap = pick(MEAS_ICONS);
  const colors = shuffle(['var(--c-red)','var(--c-blue)','var(--c-green)','var(--c-purple)']);
  const wrap = el('div.measure');
  let step = 0;
  shuffle(lens).forEach((L, i) => {
    const row = barRow(L, 0, colors[i % colors.length], cap);
    tappable(row, () => {
      if (api.locked || row.classList.contains('picked')) return;
      if (L === wanted[step]){
        step++;
        row.classList.add('picked');
        row.classList.remove('nexthint');
        row.prepend(el('div.ordno', { text: String(step) }));
        Sound.sfx.count(step - 1);
        if (step === n){ $$('.mrow', wrap).forEach(r => r.classList.add('correct')); api.correct(); }
      } else {
        row.classList.add('wrong');
        api.later(() => row.classList.remove('wrong'), 460);
        api.wrong(row);
      }
    });
    wrap.append(row);
  });
  api.field.append(wrap);
  api.onHint(() => {
    const wantNow = wanted[step];
    $$('.mrow', wrap).forEach(r => {
      const bar = $('.stickbar', r);
      if (bar && Math.abs(parseFloat(bar.style.width) - wantNow) < 0.01) r.classList.add('nexthint');
    });
    api.field.append(el('div.hintline', { text: asc ? 'ひかって いるのが つぎに みじかい よ' : 'ひかって いるのが つぎに ながい よ' }));
  });
}

Games.add({
  id: 'measure', name: 'おおきさ くらべ', ico: '📏', world: 'umi', color: 'var(--c-green)',
  aim: '長さやかさを<b>そろえて比べる</b>感覚。「端をそろえる」「高さだけでなく太さも見る」という比較の作法が、1年生の「ながさくらべ」「かさくらべ」の土台になります。',
  levels: [
    { t: 'ながさ', d: 'はしを そろえて くらべる', make: api => lengthCompare(api, true) },
    { t: 'かさ と ながさ', d: 'たかさ・はじまりに ごまかされない', make: api => chance(.4) ? lengthCompare(api, false) : capacityCompare(api) },
    { t: 'じゅんばんに', d: 'ちいさい じゅんに ならべる', make: orderBySize }
  ]
});
