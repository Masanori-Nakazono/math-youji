/* ===========================================================
   10 — WORLD 1「かずの しま」 数える・すうじ・じゅんばん・なぞりがき
   =========================================================== */
'use strict';

const THINGS = [
  { e: '🍎', n: 'りんご' }, { e: '🍓', n: 'いちご' }, { e: '🍌', n: 'バナナ' },
  { e: '🍇', n: 'ぶどう' }, { e: '🐟', n: 'さかな' }, { e: '🐤', n: 'ひよこ' },
  { e: '🐱', n: 'ねこ' },   { e: '🐶', n: 'いぬ' },   { e: '🚗', n: 'くるま' },
  { e: '⚽️', n: 'ボール' }, { e: '🌸', n: 'おはな' }, { e: '⭐️', n: 'ほし' },
  { e: '🧁', n: 'ケーキ' }, { e: '🎈', n: 'ふうせん' }, { e: '🐞', n: 'てんとうむし' },
  { e: '🦋', n: 'ちょうちょ' }, { e: '🍩', n: 'ドーナツ' }, { e: '🐸', n: 'かえる' }
];

/* ============================================================
   1. かぞえよう — one-to-one correspondence & cardinality
   ============================================================ */
function makeCountField(api, count, thing, layout){
  const field = el('div.objfield');
  const pts = layout === 'line' ? lineup(count, .5) : scatter(count);
  const objs = [];
  pts.forEach((p, i) => {
    const o = el('div.obj', { style: { left: (p[0] * 100) + '%', top: (p[1] * 100) + '%' } }, thing.e);
    o.dataset.i = i;
    objs.push(o);
    field.append(o);
  });
  api.field.append(field);
  return objs;
}

function countQuestion(api, lo, hi, layout){
  const thing = pick(THINGS);
  const count = ri(lo, hi);
  api.item('count' + (layout === 'line' ? 'L' : 'S') + ':' + count, count + 'こ を かぞえる');
  api.setPrompt(`${thing.n}を ひとつずつ タップして かぞえよう`, `${thing.n}を、ひとつずつタップして数えよう。`);
  const objs = makeCountField(api, count, thing, layout);
  let done = 0;
  const tap = (o) => {
    if (o.classList.contains('counted') || api.locked) return;
    done++;
    o.classList.add('counted');
    o.append(el('span.tag', { text: String(done) }));
    Sound.sfx.count(done - 1);
    Sound.say(numKana(done), { delay: 0, rate: 1.08 });
    if (done === count) api.later(ask, 620);
  };
  objs.forEach(o => {
    tappable(o, () => tap(o));
  });

  function ask(){
    api.setPrompt(`${thing.n}は ぜんぶで いくつ？`, `${thing.n}は、全部でいくつ？`);
    const n = hi <= 5 ? 3 : 4;
    const vals = shuffle([count].concat(distractors(count, n - 1, 1, Math.max(hi + 2, 6))));
    api.buildChoices(vals, count);
  }
}

function giveQuestion(api, lo, hi){
  const thing = pick(THINGS);
  const target = ri(lo, hi);
  const total = Math.min(14, target + ri(3, 5));
  api.item('give:' + target, target + 'こ だけ とりだす');
  api.setPrompt(`${thing.n}を ${numTag(target)}こ とって かごに いれよう`, `${thing.n}を${koKana(target)}、とって、かごに入れよう。`);
  const objs = makeCountField(api, total, thing, 'scatter');
  const picked = new Set();
  const basketCount = el('div.n', { text: '0' });
  const basketItems = el('div.items');
  const basket = el('div.basket', null,
    el('div.b', { text: '🧺' }), basketItems, basketCount);
  $('.objfield', api.field).append(basket);
  const doneBtn = el('button.btn.btn-accent', { text: 'できた！' });
  api.choices.append(doneBtn);
  const refresh = () => {
    basketCount.textContent = String(picked.size);
    clear(basketItems);
    for (let i = 0; i < Math.min(picked.size, 12); i++) basketItems.append(el('span', { text: thing.e }));
  };
  refresh();
  objs.forEach(o => tappable(o, () => {
    if (api.locked) return;
    const i = o.dataset.i;
    if (picked.has(i)){ picked.delete(i); o.classList.remove('picked'); Sound.sfx.tap(); }
    else { picked.add(i); o.classList.add('picked'); Sound.sfx.count(picked.size - 1); Sound.say(numKana(picked.size), { delay: 0, rate: 1.08 }); }
    refresh();
  }));
  doneBtn.addEventListener('click', () => {
    if (api.locked) return;
    if (picked.size === target){ doneBtn.classList.add('choice', 'correct'); api.correct(); }
    else {
      api.wrong(doneBtn);
      Sound.say(picked.size > target ? 'ちょっと多いみたい。' : 'ちょっと足りないみたい。', { delay: 300 });
    }
  });
  api.onHint(() => {
    basket.classList.add('want');
    basket.append(el('div.want', { text: 'ほしいのは ' + target + 'こ' }));
  });
}

Games.add({
  id: 'count', name: 'かぞえよう', ico: '🍎', world: 'shima', color: 'var(--c-blue)',
  aim: 'ものを <b>1つずつ指さして数え</b>、最後に言った数がそのまとまり全体の数だと分かる力（一対一対応と基数性）。数唱が言えることと「数えられる」ことは別で、就学前にいちばん差がつく土台です。',
  levels: [
    { t: '1〜5', d: 'いちれつに ならんだ もの', make: api => countQuestion(api, 1, 5, 'line') },
    { t: '1〜10', d: 'ばらばらに ある もの', make: api => countQuestion(api, 4, 10, 'scatter') },
    { t: '◯こ ちょうだい', d: 'かずだけ とりだす', make: api => giveQuestion(api, 3, 10) }
  ]
});

/* ============================================================
   2. ぱっと みて いくつ — subitizing
   ============================================================ */
/* Every other quantity task in this app is solved by tapping objects one at a
   time. That trains counting, and counting is a different skill from *seeing* that
   a group is five. The second one is what has to be there first: a child who can
   remember「7は5と2」is one who already sees 7 as five and two, rather than working
   it out from one. Nothing here practised that, so the dots are taken away before
   they can be counted — the only way through is to see the shape of the group. */
const DICE = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]
};

function diceNode(n, second){
  const g = el('div.dice');
  const spots = DICE[n] || [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++){
    const on = spots.some(p => p[0] === c && p[1] === r);
    g.append(el('span.fdot' + (on ? (second ? '.on.b' : '.on') : '')));
  }
  return g;
}

/* five on top, the rest underneath — the arrangement the whole app is built on */
function fiveRowsNode(n){
  const wrap = el('div.flashrows');
  [0, 1].forEach(row => {
    const r = el('div.frow');
    const filled = row === 0 ? Math.min(n, 5) : Math.max(0, n - 5);
    for (let i = 0; i < 5; i++) r.append(el('span.fdot' + (i < filled ? (row ? '.on.b' : '.on') : '')));
    wrap.append(r);
  });
  return wrap;
}

function flashQuestion(api, o){
  let a = 0, b = 0, n = 0;
  if (o.two){
    const w = api.want && /^two:(\d+)\+(\d+)$/.exec(api.want);
    const aim = w && +w[1] >= 1 && +w[1] <= 5 && +w[2] >= 1 && +w[2] <= 5 && +w[1] + +w[2] <= 10;
    a = aim ? +w[1] : ri(1, 5);
    b = aim ? +w[2] : ri(1, Math.min(5, 10 - a));
    n = a + b;
    api.item('two:' + a + '+' + b, a + ' と ' + b + ' を ぱっと みる');
  } else {
    const w = api.want && new RegExp('^' + o.tag + ':(\\d+)$').exec(api.want);
    n = (w && +w[1] >= o.lo && +w[1] <= o.hi) ? +w[1] : ri(o.lo, o.hi);
    api.item(o.tag + ':' + n, n + ' を ぱっと みる');
  }
  api.setPrompt('「みる」を おして、<b>ぱっと</b> みてね', 'みる、を押して、ぱっと見てね。');

  const board = el('div.flashboard');
  const inner = el('div.flashinner');
  if (o.two) inner.append(diceNode(a), el('span.fplus', { text: 'と' }), diceNode(b, true));
  else if (o.rows) inner.append(fiveRowsNode(n));
  else inner.append(diceNode(n));
  board.append(inner, el('div.flashcover', { text: '👀' }));
  api.field.append(board);

  let shown = false;
  const go = el('button.choice.flashgo', { type: 'button', text: '👀 みる' });
  go.addEventListener('click', () => {
    if (shown || api.locked) return;
    shown = true;
    go.disabled = true;
    Sound.sfx.tap();
    board.classList.add('open');
    api.later(() => {
      board.classList.remove('open');
      Sound.sfx.place();
      api.later(ask, 360);
    }, o.ms);
  });
  api.choices.append(go);

  function ask(){
    if (o.two){
      api.setPrompt('ぜんぶで いくつ だった？', '全部でいくつだった？');
      api.buildPad(n);
    } else {
      api.setPrompt('いくつ だった？', 'いくつだった？');
      api.buildChoices(shuffle([n].concat(distractors(n, 3, 1, o.hi + 2))), n);
    }
    /* The hint is another look, longer and left up. The child is not being asked to
       guess better; they are being asked to see, and you cannot see what is covered. */
    api.onHint(() => {
      board.classList.add('open');
      if (!$('.hintline', api.field)) api.field.append(el('div.hintline', { text: 'もういちど みせるね' }));
    });
  }
}

Games.add({
  id: 'flash', name: 'ぱっと みて いくつ', ico: '👀', world: 'shima', color: 'var(--c-blue)',
  aim: '数えずに、<b>ひと目で「いくつ」か分かる</b>力（瞬間視）。1〜5をかたまりとして見られること、そして6〜10を「5と いくつ」として見られることは、「いくつと いくつ」を<b>思い出せる</b>ようになるための土台です。1つずつ数える練習だけでは、ここは育ちません。',
  levels: [
    { t: '1〜5 ぱっと みて', d: 'てんの かたちで おぼえる',
      make: api => flashQuestion(api, { tag: 'f5', lo: 1, hi: 5, ms: 1000 }) },
    { t: '5と いくつ', d: '6〜10 を 5の かたまりで',
      make: api => flashQuestion(api, { tag: 'f10', lo: 6, hi: 10, ms: 900, rows: true }) },
    { t: 'ふたつの かたまり', d: 'あわせて いくつ だった？',
      make: api => flashQuestion(api, { two: true, ms: 900 }) }
  ]
});

/* ============================================================
   3. すうじ どれかな — numeral ↔ quantity
   ============================================================ */
/* Every plate is the same size with the same lattice of slots: the child has to
   count, because the card that looks biggest is no longer the one with most.

   Five to a row, not six. Every other quantity in the app — the ten-frames in
   いくつと いくつ, 10の おともだち, 11〜20, and every hint — is built on fives, and
   this game exists precisely to tie「数字の形」to「量」. On a six-wide lattice 9 read
   as「6と3」and 8 as「6と2」, so the one game whose whole job is that link was the
   one fighting the structure the rest of the app is teaching. */
function groupNode(count, thing){
  const rows = Math.max(1, Math.ceil(count / 5));
  const g = el('div.slots', { style: { '--rows': rows } });
  for (let i = 0; i < rows * 5; i++) g.append(el('span.slot', null, i < count ? thing.e : ''));
  return g;
}

function numToQty(api, lo, hi){        // numeral shown → pick the matching group
  const n = ri(lo, hi), thing = pick(THINGS);
  api.item('n2q:' + n, 'すうじ ' + n + ' → その かず');
  api.setPrompt(`${thing.e} が ${numTag(n)}こ あるのは どれ？`, `${thing.n}が${koKana(n)}、あるのは、どれ？`);
  const big = el('div', { style: { fontFamily: 'var(--fs-num)', fontWeight: 800, fontSize: 'calc(var(--u)*11)', lineHeight: 1, color: 'var(--c-red)' }, text: String(n) });
  api.field.append(big);
  const opts = shuffle([n].concat(distractors(n, 2, Math.max(1, lo - 1), Math.min(12, hi + 2), 2)));
  clear(api.choices);
  opts.forEach(v => {
    const plate = el('div.plate.fixed', null, groupNode(v, thing));
    tappable(plate, () => {
      if (api.locked) return;
      if (v === n){ plate.classList.add('correct'); api.correct(); }
      else { plate.classList.add('wrong'); api.later(() => plate.classList.remove('wrong'), 460); api.wrong(plate); }
    });
    api.choices.append(plate);
  });
}

function qtyToNum(api, lo, hi){        // group shown → pick the numeral
  const n = ri(lo, hi), thing = pick(THINGS);
  api.item('q2n:' + n, n + 'こ → すうじ ' + n);
  api.setPrompt(`${thing.n}は いくつ？ すうじを えらぼう`, `${thing.n}はいくつ？数字を選ぼう。`);
  const wrap = el('div.row', { style: { maxWidth: 'calc(var(--u)*40)' } });
  for (let i = 0; i < n; i++) wrap.append(el('span.item', { text: thing.e, style: { fontSize: 'calc(var(--u)*4.4)' } }));
  api.field.append(wrap);
  const c = hi <= 5 ? 3 : 4;
  api.buildChoices(shuffle([n].concat(distractors(n, c - 1, 1, hi + 3))), n);
}

function tenFrameNode(count, cols, opts){
  const o = opts || {};
  const f = el('div.tenframe', { style: { '--cols': cols } });
  const total = o.total != null ? o.total : cols * 2;
  for (let i = 0; i < total; i++){
    const cell = el('div.cell');
    if (i < count) cell.append(el('div.dot' + (o.second != null && i >= o.second ? '.b' : '')));
    f.append(cell);
  }
  return f;
}

function teenQuestion(api){            // 11-20 with a filled ten-frame + loose ones
  const n = ri(11, 20), thing = pick(THINGS);
  api.item('teen:' + n, n + ' を 10と ' + (n - 10) + ' で みる');
  api.setPrompt('ぜんぶで いくつ？', '全部でいくつ？');
  const box = el('div.frameset');
  box.append(tenFrameNode(10, 5));
  const rest = el('div.row', { style: { maxWidth: 'calc(var(--u)*22)' } });
  for (let i = 0; i < n - 10; i++) rest.append(el('span.item', { text: thing.e, style: { fontSize: 'calc(var(--u)*3.2)' } }));
  box.append(rest);
  api.field.append(box, el('div.hintline', { text: '10の わくが いっぱい ＋ のこり' }));
  api.buildChoices(shuffle([n].concat(distractors(n, 3, 10, 20))), n);
}

Games.add({
  id: 'numeral', name: 'すうじ どれかな', ico: '🔢', world: 'shima', color: 'var(--c-blue)',
  aim: '「もののかたまり」と「数字の形」と「よみかた」の<b>3つを結びつける</b>力。小1では数字を書く前に、この対応づけが完成していると計算の導入がスムーズです。',
  levels: [
    { t: '1〜5', d: 'すうじと かずを むすぶ', make: api => chance(.5) ? qtyToNum(api, 1, 5) : numToQty(api, 1, 5) },
    { t: '1〜10', d: 'すこし おおきい かず', make: api => chance(.5) ? qtyToNum(api, 4, 10) : numToQty(api, 3, 9) },
    { t: '10〜20', d: '10の わくで かぞえる', make: api => teenQuestion(api) }
  ]
});

/* ============================================================
   3. かずの じゅんばん — sequence, next/before, skip counting
   ============================================================ */
function lineFill(api, lo, hi, gaps){
  const nums = range(lo, hi);
  const inner = nums.slice(1, -1);
  const holes = sample(inner, Math.min(gaps, inner.length)).sort((a, b) => a - b);
  api.item('fill:' + holes[0], holes[0] + ' が ぬけた ならび');
  const line = el('div.numline');
  const cells = {};
  nums.forEach(v => {
    const isHole = holes.indexOf(v) >= 0;
    const n = el('div.nn' + (isHole ? '.gap' : ''), { text: isHole ? '?' : String(v) });
    cells[v] = n;
    line.append(n);
  });
  api.field.append(line);

  let qi = 0;
  function askNext(){
    nums.forEach(v => cells[v].classList.remove('now'));
    const target = holes[qi];
    cells[target].classList.add('now');
    api.setPrompt('ひかって いる ところに はいる かずは？', '光っているところに入る数は？');

    // A distractor must never be another hole's answer — that answer is also
    // "correct" on the number line, and marking it wrong is simply unfair.
    const banned = holes.filter(v => v !== target);
    const pool = nums.filter(v => v !== target && banned.indexOf(v) < 0)
                     .sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    const wrong = sample(pool.slice(0, 5), Math.min(2, pool.length));

    api.buildChoices(shuffle([target].concat(wrong)), target, {
      onPick(){
        cells[target].textContent = String(target);
        cells[target].classList.remove('now', 'gap');
        cells[target].classList.add('filled');
        Sound.sfx.place();
        qi++;
        if (qi < holes.length){
          api.later(askNext, 620);
          return false;            // more holes to go: keep this question open
        }
        return true;               // last hole — let the engine finish the question
      }
    });
    api.onHint(() => {
      [target - 1, target + 1].forEach(v => { if (cells[v]) cells[v].classList.add('near'); });
    });
  }
  askNext();
}

function nextBefore(api, hi){
  const mode = pick(['next', 'before', 'between']);
  const n = ri(2, hi - 1);
  let ans, html, speech;
  if (mode === 'next'){ ans = n + 1; html = `${numTag(n)} の つぎの かずは？`; speech = `${numKana(n)}の次の数は？`; }
  else if (mode === 'before'){ ans = n - 1; html = `${numTag(n)} の まえの かずは？`; speech = `${numKana(n)}の前の数は？`; }
  else { ans = n; html = `${numTag(n - 1)} と ${numTag(n + 1)} の あいだの かずは？`; speech = `${numKana(n-1)}と${numKana(n+1)}の間の数は？`; }
  api.item('nb:' + mode + ':' + ans,
    mode === 'next' ? n + ' の つぎ' : mode === 'before' ? n + ' の まえ' : (n - 1) + ' と ' + (n + 1) + ' の あいだ');
  api.setPrompt(html, speech);
  const line = el('div.numline');
  for (let v = Math.max(1, ans - 3); v <= Math.min(hi, ans + 3); v++){
    line.append(el('div.nn' + (v === ans ? '.gap.now' : ''), { text: v === ans ? '?' : String(v) }));
  }
  api.field.append(line);
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, hi))), ans);
}

function skipCount(api){
  const step = pick([2, 5, 2, 10]);
  const start = step === 2 ? pick([2, 4, 6]) : step;
  const seq = [0, 1, 2, 3].map(i => start + i * step);
  const ans = seq[3];
  api.item('skip' + step + ':' + ans, step + 'ずつ ふえて ' + ans);
  api.setPrompt(`${step}ずつ ふえて いくよ。つぎは？`, `${numKana(step)}ずつ増えていくよ。次は？`);
  const line = el('div.numline');
  seq.forEach((v, i) => line.append(el('div.nn' + (i === 3 ? '.gap.now' : ''), { text: i === 3 ? '?' : String(v) })));
  api.field.append(line);
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, ans + step * 2, step))), ans);
}

/* 「10から逆に数える方が難しく、効果があります」— the parent page has said so from
   the start, and nothing in the app practised it. `skipCount` only ever goes up and
   `nextBefore` takes a single step back. Counting down is what くり下がり runs on. */
function countBack(api){
  const w = api.want && /^back:(\d+)$/.exec(api.want);
  const ans = (w && +w[1] >= 3 && +w[1] <= 17) ? +w[1] : ri(3, 9);
  const start = ans + 3;
  const seq = [start, start - 1, start - 2, ans];
  api.item('back:' + ans, start + ' から ぎゃくに かぞえて ' + ans);
  api.setPrompt('1ずつ へって いくよ。つぎは？', '1ずつ減っていくよ。次は？');
  const line = el('div.numline');
  seq.forEach((v, i) => line.append(el('div.nn' + (i === 3 ? '.gap.now' : ''), { text: i === 3 ? '?' : String(v) })));
  api.field.append(line, el('div.hintline', { text: 'ぎゃくむきに かぞえて みよう' }));
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, start + 2))), ans);
  api.onHint(() => {
    if ($('.hint2', api.field)) return;
    api.field.append(el('div.hintline.hint2', {
      text: numKana(start) + '、' + numKana(start - 1) + '、' + numKana(start - 2) + '、… つぎは？' }));
    Sound.say(`${numKana(start)}、${numKana(start-1)}、${numKana(start-2)}、…つぎは？`, { delay: 200 });
  });
}

Games.add({
  id: 'seq', name: 'かずの じゅんばん', ico: '🪜', world: 'shima', color: 'var(--c-blue)',
  aim: '数を<b>並びとして</b>とらえ、「つぎ・まえ・あいだ」が言える力。数直線の感覚は、くり上がりの計算やものさしの読み取りにそのままつながります。',
  levels: [
    { t: '1〜10', d: 'あいた ところを うめる', make: api => lineFill(api, 1, 10, 2) },
    { t: '1〜20', d: 'もっと ながい ならび', make: api => { const lo = ri(6, 11); return lineFill(api, lo, lo + 9, 2); } },
    { t: 'つぎ・まえ', d: 'ならびを あたまで たどる',
      make: api => chance(.3) ? countBack(api) : chance(.5) ? skipCount(api) : nextBefore(api, 20) }
  ]
});

/* ============================================================
   4. すうじを なぞろう — numeral formation
   ============================================================ */
function traceQuestion(api, digits){
  const d = String(pick(digits));
  const strokes = DIGIT_STROKES[d];
  api.item('trace:' + d, d + ' の かきかた');
  api.setPrompt(`${numTag(d)} を ゆびで なぞろう`, `${numKana(Number(d))}を指でなぞろう。`);

  const box = el('div.tracebox');
  const s = svg('svg', { viewBox: '0 0 100 140', preserveAspectRatio: 'xMidYMid meet' });
  const gGuide = svg('g'), gDone = svg('g'), gLive = svg('g'), gMark = svg('g');
  s.append(gGuide, gDone, gLive, gMark);
  box.append(s, el('div.trace-numlabel', { text: 'なぞりがき' }));
  api.field.append(box);

  strokes.forEach(st => {
    gGuide.append(svg('path', { d: toPath(st), class: 'trace-guide', fill: 'none',
      'stroke-width': 17, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    gGuide.append(svg('path', { d: toPath(st), class: 'trace-outline', fill: 'none',
      'stroke-width': 2, 'stroke-linecap': 'round' }));
  });

  let si = 0, progress = 0, drawing = false;
  let strays = 0, nudged = false, idleTimer = null;
  const TOL = 15, START_TOL = 22;

  function armIdle(){
    clearTimeout(idleTimer);
    idleTimer = api.later(() => {           // no progress for a while: show, don't scold
      if (si >= strokes.length) return;
      nudged = true;
      showGuide();
      Sound.say('赤い点から、なぞってみよう。', { delay: 100 });
    }, 9000);
  }
  function showGuide(){
    if ($('.trace-ghost', box) || si >= strokes.length) return;
    gMark.append(svg('path', { d: toPath(strokes[si]), class: 'trace-ghost', stroke: 'var(--accent)',
      'stroke-width': 3, 'stroke-dasharray': '4 4', fill: 'none', opacity: .9 }));
  }

  function startMark(){
    clear(gMark);
    if (si >= strokes.length) return;
    const p = strokes[si][0];
    const q = strokes[si][Math.min(6, strokes[si].length - 1)];
    gMark.append(svg('circle', { cx: p[0], cy: p[1], r: 6.5, class: 'trace-start pulse' }));
    gMark.append(svg('text', { x: p[0], y: p[1] + 2.6, 'text-anchor': 'middle', fill: '#fff',
      'font-size': 7.5, 'font-weight': 800, 'font-family': 'var(--fs-num)' }, String(si + 1)));
    const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    gMark.append(svg('path', {
      d: `M${p[0] + Math.cos(a) * 11} ${p[1] + Math.sin(a) * 11} l${Math.cos(a) * 8} ${Math.sin(a) * 8}`,
      stroke: 'var(--c-red)', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: .7
    }));
  }
  function redraw(){
    clear(gLive);
    if (si < strokes.length && progress > 1){
      gLive.append(svg('path', { d: toPath(strokes[si].slice(0, progress)), class: 'trace-live', fill: 'none',
        'stroke-width': 13, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    }
  }
  function pt(e){
    const m = s.getScreenCTM();
    if (!m) return null;
    const p = s.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return [q.x, q.y];
  }
  function onDown(e){
    const p = pt(e); if (!p || si >= strokes.length) return;
    const st = strokes[si];
    const near = dist(p[0], p[1], st[progress ? Math.min(progress, st.length - 1) : 0][0],
                                  st[progress ? Math.min(progress, st.length - 1) : 0][1]);
    if (near <= START_TOL){
      drawing = true;
      clearTimeout(idleTimer);
      box.setPointerCapture && box.setPointerCapture(e.pointerId);
      e.preventDefault();
    } else {
      // touched the wrong place: bounce the start dot toward the finger, and after a
      // couple of tries count it as a miss so the hint fires and the stars are honest
      const dot = $('.trace-start', box);
      if (dot && dot.animate) dot.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }],
        { duration: 420 });
      if (++strays % 2 === 0) api.wrong();
      armIdle();
    }
  }
  function onMove(e){
    if (!drawing || si >= strokes.length) return;
    e.preventDefault();
    const p = pt(e); if (!p) return;
    const st = strokes[si];
    const look = Math.min(st.length - 1, progress + 26);
    for (let i = Math.max(progress, 1); i <= look; i++){
      if (dist(p[0], p[1], st[i][0], st[i][1]) <= TOL) progress = Math.max(progress, i + 1);
    }
    redraw();
    armIdle();
    if (progress >= st.length - 2) completeStroke();
  }
  function completeStroke(){
    drawing = false;
    clearTimeout(idleTimer);
    gDone.append(svg('path', { d: toPath(strokes[si]), class: 'trace-done', fill: 'none',
      'stroke-width': 13, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    clear(gLive);
    Sound.sfx.place();
    si++; progress = 0;
    if (si >= strokes.length){
      clear(gMark);
      api.later(() => api.correct(), 220);
    } else {
      startMark();
      armIdle();
      Sound.say('次の線も、なぞってね。', { delay: 150 });
    }
  }
  function onUp(){ drawing = false; }

  box.addEventListener('pointerdown', onDown);
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerup', onUp);
  box.addEventListener('pointercancel', onUp);
  box.addEventListener('pointerleave', onUp);

  api.onHint(showGuide);
  box.addEventListener('pointerdown', () => { if (nudged) clearTimeout(idleTimer); });
  startMark();
  redraw();
  armIdle();
}

Games.add({
  id: 'trace', name: 'すうじを なぞろう', ico: '✏️', world: 'shima', color: 'var(--c-blue)',
  aim: '数字を<b>正しい書き順・向き</b>で書く運筆。左右反転（鏡文字）は年長ではよくあることですが、入学前に始点と向きを体で覚えておくと、算数の時間を「書く練習」に取られずに済みます。',
  levels: [
    { t: '1・2・3', d: 'かんたんな せん', n: 6, make: api => traceQuestion(api, [1, 2, 3]) },
    { t: '4・5・6・7', d: '2かくの すうじも', n: 6, make: api => traceQuestion(api, [4, 5, 6, 7]) },
    { t: '8・9・0', d: 'まるい すうじ', n: 6, make: api => traceQuestion(api, [8, 9, 0]) }
  ]
});
