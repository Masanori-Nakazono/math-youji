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
  const sorted = counts.slice().sort((x, y) => x - y);
  api.item('cmp:' + sorted.join('_') + ':' + want,
    sorted.join(' と ') + ' の ' + (want === 'most' ? 'おおい ほう' : 'すくない ほう'));
  api.setPrompt(want === 'most' ? 'どっちが <b>おおい</b>？' : 'どっちが <b>すくない</b>？',
                want === 'most' ? 'どっちが多い？' : 'どっちが少ない？');
  if (counts.length > 2){
    api.setPrompt(want === 'most' ? 'いちばん <b>おおい</b> のは どれ？' : 'いちばん <b>すくない</b> のは どれ？',
                  want === 'most' ? '一番多いのは、どれ？' : '一番少ないのは、どれ？');
  }
  const wrap = el('div.row', { style: { gap: 'calc(var(--u)*1.4)' } });
  const order = shuffle(counts.map((c, i) => ({ c, i })));
  /* ちかい かず draws the *smaller* group with bigger icons on purpose. Choosing by
     how much space a plate fills instead of by counting is the misconception this
     level exists to catch — so when that is what happened, say which it was. */
  const bigIcon = o.sizes ? Math.max.apply(null, o.sizes) : null;
  const smallIcon = o.sizes ? Math.min.apply(null, o.sizes) : null;
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
      else {
        plate.classList.add('wrong');
        api.later(() => plate.classList.remove('wrong'), 460);
        const looks = o.sizes && bigIcon !== smallIcon
          && size === (want === 'most' ? bigIcon : smallIcon);
        api.wrong(plate, looks ? 'looks' : null);
      }
    });
    wrap.append(plate);
    plate.dataset.count = c;
  });
  api.field.append(wrap);
  api.onShow(() => {
    const p = $$('.plate', wrap).find(x => Number(x.dataset.count) === answer);
    if (p) p.click();
  });
  /* The hint used to write「5こ」on each plate, which answered the question for
     the child. Now it takes the trick away instead: every item the same size, five
     to a row, starting at the same edge — the longer arrangement is the bigger
     number, and the child still has to see which that is. */
  const lineUp = () => $$('.plate', wrap).forEach(p => {
    const g = $('.row', p);
    g.classList.add('lined');
    $$('.item', g).forEach(it => { it.style.fontSize = 'calc(var(--u)*2.6)'; });
  });
  api.coach({
    text: 'おなじ おおきさで 5こずつ ならべたよ',
    say: '同じ大きさで、5個ずつ並べたよ。' + (want === 'most' ? '多いのは、どれ？' : '少ないのは、どれ？'),
    tool: lineUp,
    walk(){
      lineUp();
      return $$('.plate', wrap).map(p => {
        const c = Number(p.dataset.count), items = $$('.item', p);
        return { at: p, act(){ Coach.tag(items[items.length - 1], c); }, say: koKana(c), ms: 1300 };
      });
    }
  });
}

/* Three counts at least `gap` apart. Two plates are a coin toss, which is no way to
   confirm a clear on another day (see `api.check`). */
function spread3(lo, hi, gap){
  for (let t = 0; t < 300; t++){
    const xs = [ri(lo, hi), ri(lo, hi), ri(lo, hi)];
    if (Math.abs(xs[0] - xs[1]) >= gap && Math.abs(xs[0] - xs[2]) >= gap && Math.abs(xs[1] - xs[2]) >= gap) return xs;
  }
  return shuffle([lo, lo + gap, lo + gap * 2]);
}

function compareEasy(api){
  if (api.check){ platesCompare(api, { counts: spread3(1, 9, 2), least: chance(.3) }); return; }
  let a = ri(1, 8), b = ri(1, 8);
  for (let g = 0; g < 200 && Math.abs(a - b) < 3; g++){ a = ri(1, 8); b = ri(1, 8); }
  if (Math.abs(a - b) < 3){ a = 2; b = 7; }
  platesCompare(api, { counts: [a, b], least: chance(.3) });
}
function compareClose(api){
  if (api.check){
    // three close counts, and the trap kept: the fewest drawn biggest, the most drawn smallest
    const a = ri(4, 10), counts = shuffle([a, a + 1, a + 2]), sizes = [2.6, 2.6, 2.6];
    if (chance(.6)){ sizes[counts.indexOf(a)] = 4.4; sizes[counts.indexOf(a + 2)] = 2.2; }
    platesCompare(api, { counts, sizes, least: chance(.35) });
    return;
  }
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
  // two numerals, or three for a check on another day
  const nums = [ri(1, 20)];
  for (let g = 0; g < 400 && nums.length < (api.check ? 3 : 2); g++){
    const v = ri(1, 20);
    if (nums.indexOf(v) < 0) nums.push(v);
  }
  const two = nums.length === 2;
  const most = chance(.6);
  const sorted = nums.slice().sort((x, y) => x - y);
  const ans = most ? sorted[sorted.length - 1] : sorted[0];
  api.item('numcmp:' + sorted.join('_') + ':' + (most ? 'g' : 'l'),
    'すうじ ' + nums.join(' と ') + ' の くらべ');
  api.setPrompt(two ? (most ? 'かずが <b>おおきい</b> のは どっち？' : 'かずが <b>ちいさい</b> のは どっち？')
                    : (most ? 'いちばん <b>おおきい</b> かずは どれ？' : 'いちばん <b>ちいさい</b> かずは どれ？'),
                two ? (most ? '数が大きいのは、どっち？' : '数が小さいのは、どっち？')
                    : (most ? '一番大きい数は、どれ？' : '一番小さい数は、どれ？'));
  api.field.append(el('div.hintline', { text: 'すうじで くらべよう' }));
  api.buildChoices(shuffle(nums), ans);
  const hi2 = sorted[sorted.length - 1];
  const line = Coach.once(() => {
    const l = el('div.numline.cmpline', { style: { flexWrap: 'nowrap' } });
    for (let v = 1; v <= Math.max(10, hi2); v++){
      const c = el('div.nn', { text: String(v) });
      if (nums.indexOf(v) >= 0) c.classList.add('near');
      l.append(c);
    }
    api.field.append(l);
    return l;
  });
  api.coach({
    text: 'かずの ならびで あとに でて くる ほうが おおきい',
    say: '数の並びで、後に出てくるほうが、大きいよ。',
    tool(){ line(); },
    walk(){
      const cells = $$('.nn', line());
      return sorted.map((v, i) => i === sorted.length - 1
        ? { at: cells[v - 1], say: `${numKana(v)}が、一番後ろ。`, ms: 1900 }
        : { at: cells[v - 1], say: numKana(v), ms: 1100 });
    }
  });
}

/** The quantity stays the same when the spacing changes. This asks about
    conservation directly instead of merely making large icons look numerous. */
function conserveNumber(api){
  const n = ri(4, 8), thing = pick(THINGS);
  api.item('conserve:' + n, n + 'こを ひろげても おなじ');
  api.setPrompt('よく みていてね。ならびかたを かえるよ', 'よく見ていてね。並び方を変えるよ。');
  const row = el('div.conserve-row');
  for (let i = 0; i < n; i++) row.append(el('span', { text: thing.e }));
  api.field.append(row);
  api.later(() => {
    row.classList.add('spread');
    Sound.sfx.swoosh();
    api.later(() => api.afterSpeech(() => {
      api.setPrompt('ひろげたら、かずは かわった？', '広げたら、数は変わった？');
      api.buildChoices(['おなじ', 'かわった'], 'おなじ');
    }), 650);
  }, 650);
  const things = Array.from(row.children);
  api.coach({
    text: 'ひろげる まえと あとで かぞえて みよう',
    say: '広げる前と後で、数えてみよう。',
    tool(){ things.forEach((x, i) => Coach.tag(x, i + 1)); },
    walk(){
      const steps = [{ act(){ row.classList.remove('spread'); $$('.ctag', row).forEach(t => t.remove()); }, ms: 900 }];
      things.forEach((x, i) => steps.push({ at: x, act(){ Coach.tag(x, i + 1); }, say: numKana(i + 1), ms: 480 }));
      steps.push({ act(){ row.classList.add('spread'); Sound.sfx.swoosh(); }, say: '広げても…', ms: 1300 });
      things.forEach((x, i) => steps.push({ at: x, say: numKana(i + 1), ms: 480 }));
      steps.push({ say: `どちらも、${koKana(n)}。`, ms: 1700 });
      return steps;
    }
  });
}

Games.add({
  id: 'compare', name: 'どっちが おおい', ico: '⚖️', world: 'umi', color: 'var(--c-green)',
  aim: '<b>見た目の大きさや広がりに惑わされず</b>、数そのもので多い少ないを判断する力。「大きい物が少しある方が多く見える」段階を、数えて確かめる経験で越えていきます。',
  levels: [
    { t: 'ぱっと みて', d: 'はっきり ちがう かず', make: compareEasy },
    { t: 'ちかい かず', d: 'ならべかえても かずは おなじ',
      make: api => !api.check && chance(.35) ? conserveNumber(api) : compareClose(api) },
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
  api.item('ord:' + dir + ':' + target, label + 'から ' + target + 'ばんめ');
  api.setPrompt(`${label}から ${numTag(target)}ばんめ の どうぶつを タップ`,
                `${label}から${banmeKana(target)}の動物をタップ。`);
  const idxWanted = (dir === 'front' || dir === 'left') ? target - 1 : n - target;
  const q = el('div.queue');
  const mirror = n - 1 - idxWanted;      // the same 「◯ばんめ」 counted from the other end
  critters.forEach((c, i) => {
    const item = el('div.qi', { text: c });
    tappable(item, () => {
      if (api.locked) return;
      if (i === idxWanted){ item.classList.add('correct'); api.correct(); }
      else {
        item.classList.add('wrong');
        api.later(() => item.classList.remove('wrong'), 460);
        api.wrong(item, i === mirror ? 'rev' : null);
      }
    });
    q.append(item);
  });
  api.onShow(() => { const it = $$('.qi', q)[idxWanted]; if (it) it.click(); });
  // the marker sits at the end you count from and points into the line
  const fromLeft = (dir === 'front' || dir === 'left');
  const marker = fromLeft
    ? el('div.dirmark', null, label + 'から', arrowSVG('right'))
    : el('div.dirmark', null, arrowSVG('left'), label + 'から');
  api.field.append(el('div.row', { style: { flexWrap: 'nowrap', gap: 'calc(var(--u)*.6)', maxWidth: '100%' } },
    fromLeft ? marker : null, q, fromLeft ? null : marker));
  /* It used to number every animal from the end being counted from, which put the
     asked-for number on the right animal. Now only the start is marked; the counting
     is the child's, and the hand does it only when asked to show. */
  const fromStart = () => fromLeft ? $$('.qi', q) : $$('.qi', q).reverse();
  api.coach({
    text: `${label}から かぞえるよ。はじめは この こ`,
    say: `${label}から数えるよ。最初は、この子。`,
    tool(){ const first = fromStart()[0]; Coach.tag(first, 1, 'alt'); Coach.pulse([first, marker]); },
    walk(){
      return fromStart().slice(0, target).map((it, i) => ({
        at: it, act(){ Coach.tag(it, i + 1, 'alt'); },
        say: i + 1 === target ? banmeKana(target) : numKana(i + 1), ms: i + 1 === target ? 1600 : 600 }));
    }
  });
}

function ordinalVsCount(api, n){
  const critters = sample(CRITTERS, n);
  const k = ri(2, Math.min(4, n - 1));
  const countMode = chance(.5);
  api.item('ovc:' + (countMode ? 'ko' : 'me') + ':' + k, k + (countMode ? 'こ（ぜんぶ）' : 'ばんめ（ひとり）'));
  api.setPrompt(countMode
      ? `まえから ${numTag(k)}<b>こ</b> タップ　（${k}ひき ぜんぶ）`
      : `まえから ${numTag(k)}<b>ばんめ</b> だけ タップ`,
    countMode ? `前から${koKana(k)}、タップしてね。` : `前から${banmeKana(k)}だけタップしてね。`);
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
        else {
          item.classList.add('wrong');
          api.later(() => item.classList.remove('wrong'), 460);
          api.wrong(item, i === n - k ? 'rev' : null);
        }
      }
    });
    q.append(item);
  });
  api.onShow(() => {
    const items = $$('.qi', q);
    if (!countMode){ if (items[k - 1]) items[k - 1].click(); return; }
    items.forEach((x, i) => { if (i < k && !x.classList.contains('marked')) x.click(); });
  });
  api.field.append(el('div.row', { style: { flexWrap: 'nowrap', gap: 'calc(var(--u)*.6)', maxWidth: '100%' } },
    el('div.dirmark', null, 'まえ', arrowSVG('right')), q));
  api.coach({
    text: countMode ? `「${k}こ」は まえから ${k}ひき ぜんぶ` : `「${k}ばんめ」は その 1ぴき だけ`,
    say: countMode ? `${koKana(k)}は、前から${k}匹、全部だよ。` : `${banmeKana(k)}は、その一匹だけだよ。`,
    tool(){ Coach.tag($$('.qi', q)[0], 1, 'alt'); Coach.pulse($('.dirmark', api.field)); },
    walk(){
      const its = $$('.qi', q);
      return its.slice(0, k).map((it, i) => ({ at: it, act(){ Coach.tag(it, i + 1, 'alt'); }, say: numKana(i + 1), ms: 600 }))
        .concat([{ at: its[k - 1], act(){ Coach.pulse(countMode ? its.slice(0, k) : its[k - 1]); },
                   say: countMode ? `ここまで、全部で${koKana(k)}。` : `${banmeKana(k)}は、この子だけ。`, ms: 1900 }]);
    }
  });
}

function gridPosition(api, cols, rows){
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ r, c });
  const pool = shuffle(CRITTERS.concat(CRITTERS)).slice(0, cols * rows);
  const tr = ri(1, rows), tc = ri(1, cols);
  api.item('grid:' + tr + '_' + tc, 'うえから ' + tr + '・ひだりから ' + tc);
  api.setPrompt(`うえから ${numTag(tr)}ばんめ、ひだりから ${numTag(tc)}ばんめ は だれ？`,
                `上から${banmeKana(tr)}、左から${banmeKana(tc)}は、だれ？`);
  const g = el('div.qgrid', { style: { '--gc': cols } });
  const items = [];
  cells.forEach((cell, i) => {
    const item = el('div.qi', { text: pool[i] });
    items.push(item);
    tappable(item, () => {
      if (api.locked) return;
      if (cell.r === tr - 1 && cell.c === tc - 1){ item.classList.add('correct'); api.correct(); }
      else {
        item.classList.add('wrong');
        api.later(() => item.classList.remove('wrong'), 460);
        // read the two axes the other way round: 「うえから3・ひだりから2」→「うえから2・ひだりから3」
        api.wrong(item, (cell.r === tc - 1 && cell.c === tr - 1) ? 'rev' : null);
      }
    });
    g.append(item);
  });
  api.onShow(() => {
    const at = cells.findIndex(c => c.r === tr - 1 && c.c === tc - 1);
    if (items[at]) items[at].click();
  });
  // two axes at once is hard enough without having to guess where counting starts
  api.field.append(el('div.axes', null,
    el('div.axis-x', null, 'ひだりから', arrowSVG('right')),
    el('div.axis-row', null,
      el('div.axis-y', null, 'うえ', arrowSVG('right')),
      g)));
  /* Lighting both the row and the column lit exactly one cell: the answer. The row
     alone is the first half of the method, and the child does the second. */
  const rowItems = () => items.filter((it, i) => cells[i].r === tr - 1);
  api.coach({
    text: `まず うえから ${tr}ばんめの よこの れつ`,
    say: `まず、上から${banmeKana(tr)}の、横の列を見つけよう。`,
    tool(){ rowItems().forEach(it => it.classList.add('rowhint')); Coach.pulse($('.axis-y', api.field)); },
    walk(){
      const firstCol = items.filter((it, i) => cells[i].c === 0);
      const steps = firstCol.slice(0, tr).map((it, i) => ({ at: it, act(){ Coach.tag(it, i + 1, 'alt'); }, say: numKana(i + 1), ms: 600 }));
      steps.push({ act(){ rowItems().forEach(it => it.classList.add('rowhint')); }, say: `上から${banmeKana(tr)}。次は、左から。`, ms: 1800 });
      rowItems().slice(0, tc).forEach((it, i) => steps.push({ at: it, act(){ Coach.tag(it, i + 1); }, say: numKana(i + 1), ms: 600 }));
      return steps;
    }
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
  api.item('len:' + (aligned ? 'aligned' : 'ragged') + ':' + (longest ? 'L' : 'S') + ':' + n,
    (aligned ? 'はしが そろった ' : 'はしが ずれた ') + (longest ? 'いちばん ながい' : 'いちばん みじかい'));
  api.setPrompt(longest ? 'いちばん <b>ながい</b> のは どれ？' : 'いちばん <b>みじかい</b> のは どれ？',
                longest ? '一番長いのは、どれ？' : '一番短いのは、どれ？');
  const wrap = el('div.measure');
  const colors = shuffle(['var(--c-red)','var(--c-blue)','var(--c-green)','var(--c-purple)']);
  const ends = [];
  lens.forEach((L, i) => {
    const off = aligned ? 0 : ri(0, Math.max(0, Math.min(22, 97 - L)));
    ends.push(off + L);
    const row = barRow(L, off, colors[i % colors.length], cap);
    row.dataset.len = L;
    tappable(row, () => {
      if (api.locked) return;
      if (L === ans){ row.classList.add('correct'); api.correct(); }
      else {
        row.classList.add('wrong');
        api.later(() => row.classList.remove('wrong'), 460);
        // ragged starts: going by which bar reaches furthest right is the error
        // this level is about, and it is not the same as「ながさ」
        const furthest = !aligned && longest && (off + L) >= Math.max.apply(null, ends);
        api.wrong(row, furthest ? 'looks' : null);
      }
    });
    wrap.append(row);
  });
  api.field.append(wrap);
  api.onShow(() => {
    const r = $$('.mrow', wrap).find(x => Number(x.dataset.len) === ans);
    if (r) r.click();
  });
  if (!aligned) api.field.append(el('div.hintline', { text: 'はじまる ところが ちがうよ。ながさ だけを みてね' }));
  // sliding every bar back to a shared start line IS the lesson, so show it — and
  // put equal marks along the tracks, so an aligned set can be compared by more than eye
  const align = () => {
    $$('.track .gap', wrap).forEach(g => { g.style.transition = 'width .6s ease'; g.style.width = '0%'; });
    wrap.classList.add('lined');
    Coach.ticks(wrap);
  };
  api.coach({
    text: aligned ? 'めもりを みて ながさを くらべよう' : 'はじまりを そろえたよ。はしを くらべよう',
    say: aligned ? '目盛りを見て、長さを比べよう。' : '始まりをそろえたよ。端を、比べよう。',
    tool: align,
    walk(){
      align();
      const rows = $$('.mrow', wrap).sort((x, y) => longest ? x.dataset.len - y.dataset.len : y.dataset.len - x.dataset.len);
      return rows.map((r, i) => {
        const last = i === rows.length - 1;
        return { at: () => $('.stickbar', r), act(){ if (last) Coach.pulse(r); },
                 say: last ? (longest ? '一番長いのは、これ。' : '一番短いのは、これ。') : '', ms: last ? 1800 : 650 };
      });
    }
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

/* A shared unit for every glass in the question.
   The hint tells the child to count squares, so the squares have to be the same
   size in every glass and on both axes — 任意単位は同じ大きさでそろえる is the whole
   point of 1年生「かさくらべ」. The old hint derived its spacing from each glass's
   own width and height (`w / round(w / 13)`), so a wide glass got wide squares and
   a narrow one got narrow squares: counting them gave a tie or the wrong answer in
   about 2% of questions (面積 2442 と 3483 が どちらも18マス), and taught an invalid
   way of comparing in all of them.

   Sizing the water to whole multiples of one unit makes the count exact, so the
   answer the child reaches by counting is always the answer the question wants. */
const CAP_UNIT = 12;                    // SVG units, square
const CAP_COLS = [2, 3, 4];             // water width  = cols * CAP_UNIT
const CAP_ROWS = [5, 6, 7, 8, 9];       // water height = rows * CAP_UNIT
const CAP_FALLBACK = [[2, 9], [4, 6], [2, 5]];

function capSpec(cols, rows){
  return { cols, rows, cells: cols * rows,
           w: cols * CAP_UNIT + 6,      // vesselSVG insets the water by 3 a side
           h: rows * CAP_UNIT, fill: 1 };
}

function capacityCompare(api){
  const n = !api.check && chance(.5) ? 2 : 3;
  // far enough apart to be a fair question by eye as well as by counting
  const clearOf = (list, s) => list.every(o =>
    Math.abs(o.cells - s.cells) / Math.max(o.cells, s.cells) > 0.18);

  let specs = [];
  for (let attempt = 0; attempt < 60 && !specs.length; attempt++){
    const trial = [];
    for (let g = 0; g < 300 && trial.length < n; g++){
      const s = capSpec(pick(CAP_COLS), pick(CAP_ROWS));
      if (clearOf(trial, s)) trial.push(s);
    }
    if (trial.length < n) continue;
    // "tall" must not mean "much": keep looking for a set where the tallest glass
    // is not the fullest one, and only give up on that near the end
    const tallest = trial.reduce((a, b) => a.rows > b.rows ? a : b);
    const fullest = trial.reduce((a, b) => a.cells > b.cells ? a : b);
    if (attempt < 45 && tallest === fullest) continue;
    specs = trial;
  }
  if (specs.length < n) specs = CAP_FALLBACK.slice(0, n).map(([c, r]) => capSpec(c, r));

  const more = chance(.6);
  const ans = more ? Math.max.apply(null, specs.map(s => s.cells))
                   : Math.min.apply(null, specs.map(s => s.cells));
  api.item('cap:' + (more ? 'more' : 'less') + ':' + n, 'かさが ' + (more ? 'おおい' : 'すくない') + ' コップ');
  api.setPrompt(more ? 'ジュースが <b>おおい</b> のは どれ？' : 'ジュースが <b>すくない</b> のは どれ？',
                more ? 'ジュースが多いのは、どれ？' : 'ジュースが少ないのは、どれ？');
  const colors = shuffle(['var(--c-orange)','var(--c-red)','var(--c-purple)']);
  const wrap = el('div.vessels');
  const tallest = Math.max.apply(null, specs.map(s => s.rows));
  shuffle(specs).forEach((s, i) => {
    const v = el('div.vessel', null, vesselSVG(s.w, s.h, s.fill, colors[i % colors.length]));
    v.dataset.cells = s.cells;
    tappable(v, () => {
      if (api.locked) return;
      if (s.cells === ans){ v.classList.add('correct'); api.correct(); }
      else {
        v.classList.add('wrong');
        api.later(() => v.classList.remove('wrong'), 460);
        // 「せが たかい ＝ おおい」 — the hintline warns about it; this records it
        api.wrong(v, (more && s.rows === tallest) ? 'looks' : null);
      }
    });
    wrap.append(v);
  });
  api.onShow(() => {
    const v = $$('.vessel', wrap).find(x => Number(x.dataset.cells) === ans);
    if (v) v.click();
  });
  api.field.append(wrap, el('div.hintline', { text: 'せが たかい ＝ おおい とは かぎらないよ' }));
  // one unit, the same in every glass, dividing the water exactly
  const unitGrid = () => {
    $$('.vessel svg', wrap).forEach(sv => {
      const water = sv.querySelectorAll('rect')[1];
      if (!water || sv.querySelector('.unitgrid')) return;
      const x = +water.getAttribute('x'), y = +water.getAttribute('y');
      const w = +water.getAttribute('width'), h = +water.getAttribute('height');
      const g = svg('g', { class: 'unitgrid' });
      for (let gx = x; gx <= x + w + 0.1; gx += CAP_UNIT)
        g.append(svg('line', { x1: gx, y1: y, x2: gx, y2: y + h, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1 }));
      for (let gy = y; gy <= y + h + 0.1; gy += CAP_UNIT)
        g.append(svg('line', { x1: x, y1: gy, x2: x + w, y2: gy, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 1 }));
      sv.append(g);
    });
  };
  api.coach({
    text: 'おなじ おおきさの ますが いくつ ぶんか かぞえよう',
    say: '同じ大きさのますが、いくつ分か、数えよう。',
    tool: unitGrid,
    walk(){
      unitGrid();
      return $$('.vessel', wrap).map(v => ({
        at: v,
        act(){ if (!$('.caplabel', v)) v.append(el('div.hintline.caplabel', { text: v.dataset.cells + 'ます' })); },
        say: numKana(Number(v.dataset.cells)) + 'ます', ms: 1400 }));
    }
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
  api.item('order:' + (asc ? 'asc' : 'desc') + ':' + n, n + 'つを ' + (asc ? 'みじかい' : 'ながい') + ' じゅんに');
  api.setPrompt(asc ? '<b>みじかい</b> じゅんに タップしよう' : '<b>ながい</b> じゅんに タップしよう',
                asc ? '短い順にタップしよう。' : '長い順にタップしよう。');
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
  // lighting the next bar picked it for the child; the marks let them pick it
  api.coach({
    text: asc ? 'のこりの なかで いちばん みじかいのは？' : 'のこりの なかで いちばん ながいのは？',
    say: asc ? '残りの中で、一番短いのは、どれ？' : '残りの中で、一番長いのは、どれ？',
    tool(){ Coach.ticks(wrap); },
    walk(){
      Coach.ticks(wrap);
      const wantNow = wanted[step];
      const r = $$('.mrow', wrap).find(x => Math.abs(parseFloat($('.stickbar', x).style.width) - wantNow) < 0.01);
      return r ? [{ at: () => $('.stickbar', r), act(){ r.classList.add('nexthint'); },
                    say: asc ? 'これが、次に短い。' : 'これが、次に長い。', ms: 1700 }] : [];
    }
  });
  api.onShow(() => {
    wanted.slice(step).forEach(len => {
      const r = $$('.mrow', wrap).find(x => !x.classList.contains('picked')
        && Math.abs(parseFloat($('.stickbar', x).style.width) - len) < 0.01);
      if (r) r.click();
    });
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
