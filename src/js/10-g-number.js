/* ===========================================================
   10 — WORLD 1「かずの しま」 数える・すうじ・じゅんばん・なぞりがき
   =========================================================== */
'use strict';

const THINGS = [
  { e: '🍎', n: 'りんご', counter: 'ko', edible: true },
  { e: '🍓', n: 'いちご', counter: 'ko', edible: true },
  { e: '🍌', n: 'バナナ', counter: 'hon', edible: true },
  { e: '🍇', n: 'ぶどう', counter: 'fusa', edible: true },
  { e: '🐟', n: 'さかな', counter: 'hiki', moving: true },
  { e: '🐤', n: 'ひよこ', counter: 'wa' },
  { e: '🐱', n: 'ねこ', counter: 'hiki', moving: true },
  { e: '🐶', n: 'いぬ', counter: 'hiki', moving: true },
  { e: '🚗', n: 'くるま', counter: 'dai' },
  { e: '⚽️', n: 'ボール', counter: 'ko' },
  { e: '🌸', n: 'おはな', counter: 'hon' },
  { e: '⭐️', n: 'ほし', counter: 'ko' },
  { e: '🧁', n: 'ケーキ', counter: 'ko', edible: true },
  { e: '🎈', n: 'ふうせん', counter: 'ko' },
  { e: '🐞', n: 'てんとうむし', counter: 'hiki', moving: true },
  { e: '🦋', n: 'ちょうちょ', counter: 'hiki', moving: true },
  { e: '🍩', n: 'ドーナツ', counter: 'ko', edible: true },
  { e: '🐸', n: 'かえる', counter: 'hiki', moving: true }
];

/* 「やってくる／いなくなる」が自然に言えるものだけを、動く文章題に出す。 */
const MOVING_THINGS = THINGS.filter(thing => thing.moving);

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
  let done = 0, asked = false;
  const tap = (o) => {
    if (o.classList.contains('counted') || api.locked) return;
    done++;
    o.classList.add('counted');
    const old = $('.tag', o);
    if (old) old.remove();
    o.append(el('span.tag', { text: String(done) }));
    Sound.sfx.count(done - 1);
    Sound.say(numKana(done), { delay: 0, rate: 1.08 });
    if (done !== count) return;
    if (!asked){ asked = true; api.later(() => api.afterSpeech(ask), 620); }
    else api.later(() => Coach.pulse(o), 300);     // a recount ends on the number that answers
  };
  objs.forEach(o => {
    tappable(o, () => tap(o));
  });
  // top to bottom, left to right: the order a finger goes round a scattered picture
  const inOrder = () => objs.slice().sort((p, q) => {
    const a = p.getBoundingClientRect(), b = q.getBoundingClientRect();
    return (Math.round(a.top / 70) - Math.round(b.top / 70)) || a.left - b.left;
  });
  // before the question is asked there is nothing to get wrong — only something to show
  api.coach({
    text: 'ひとつずつ タップして かぞえよう', say: '一つずつタップして、数えよう。',
    walk(){ return inOrder().map(o => ({ at: o, act(){ tap(o); }, ms: 640 })); }
  });

  function ask(){
    api.setPrompt(`${thing.n}は ぜんぶで いくつ？`, `${thing.n}は、全部でいくつ？`);
    const n = hi <= 5 ? 3 : 4;
    const vals = shuffle([count].concat(distractors(count, n - 1, 1, Math.max(hi + 2, 6))));
    api.buildChoices(vals, count);
    /* The hint is counting again, not being told: the badges come off, the child
       goes round once more, and the last thing touched glows — the last number said
       is how many there are. */
    const recount = () => {
      done = 0;
      objs.forEach(o => { o.classList.remove('counted'); const t = $('.tag', o); if (t) t.remove(); });
    };
    api.coach({
      text: 'もういちど ゆびで かぞえて みよう。さいごの かずが ぜんぶの かず',
      say: 'もう一度、指で数えてみよう。最後に言った数が、全部の数だよ。',
      tool: recount,
      walk(){
        // already counted all the way round: only the last number is left to point at
        const last = () => objs.find(o => ($('.tag', o) || {}).textContent === String(count));
        const steps = done === count ? []
          : (recount(), inOrder().map(o => ({ at: o, act(){ tap(o); }, ms: 640 })));
        return steps.concat([{ at: last, say: '最後の数が、全部の数。', ms: 1900 }]);
      }
    });
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
  const toggle = o => {
    if (api.locked) return;
    const i = o.dataset.i;
    if (picked.has(i)){ picked.delete(i); o.classList.remove('picked'); Sound.sfx.tap(); }
    else { picked.add(i); o.classList.add('picked'); Sound.sfx.count(picked.size - 1); Sound.say(numKana(picked.size), { delay: 0, rate: 1.08 }); }
    refresh();
  };
  objs.forEach(o => tappable(o, () => toggle(o)));
  doneBtn.addEventListener('click', () => {
    if (api.locked) return;
    if (picked.size === target){ doneBtn.classList.add('choice', 'correct'); api.correct(); }
    else {
      // one too many / one too few is a counting slip, not "does not know 7"
      api.wrong(doneBtn, picked.size === target + 1 ? 'up'
                       : picked.size === target - 1 ? 'down' : null);
      Sound.say(picked.size > target ? 'ちょっと多いみたい。' : 'ちょっと足りないみたい。', { delay: 300 });
    }
  });
  api.coach({
    text: `ほしいのは ${target}こ。かごの かずを みてね`,
    say: `欲しいのは${koKana(target)}。かごの数を、見てね。`,
    tool(){
      basket.classList.add('want');
      if (!$('.want', basket)) basket.append(el('div.want', { text: 'ほしいのは ' + target + 'こ' }));
      Coach.pulse(basketCount);
    },
    walk(){
      const steps = [{ act(){ objs.forEach(o => { if (picked.has(o.dataset.i)) toggle(o); }); }, ms: 500 }];
      objs.slice(0, target).forEach(o => steps.push({ at: o, act(){ if (!picked.has(o.dataset.i)) toggle(o); }, ms: 640 }));
      steps.push({ at: doneBtn, say: `${koKana(target)}になったら、できた、を押そう。`, ms: 2200 });
      return steps;
    }
  });
  api.onShow(() => {
    objs.forEach(o => { if (picked.has(o.dataset.i)) toggle(o); });
    objs.slice(0, target).forEach(o => toggle(o));
    doneBtn.click();
  });
}

Games.add({
  id: 'count', name: 'かぞえよう', ico: '🍎', world: 'shima', color: 'var(--c-blue)',
  aim: 'ものを <b>1つずつ指さして数え</b>、最後に言った数がそのまとまり全体の数だと分かる力（一対一対応と基数性）。数唱が言えることと「数えられる」ことは別で、就学前にいちばん差がつく土台です。',
  levels: [
    { t: '1〜5', d: 'いちれつに ならんだ もの', make: api => countQuestion(api, 1, 5, 'line') },
    { t: '1〜10', d: 'ばらばらでも かずは おなじ', make: api => !api.check && chance(.25)
        ? conserveNumber(api)
        : countQuestion(api, 4, 10, 'scatter') },
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
      api.later(() => api.afterSpeech(ask), 360);
    }, o.ms);
  });
  api.choices.append(go);
  api.coach({ walk(){ return [{ at: go, act(){ go.click(); }, say: 'みる、を押すよ。', ms: o.ms + 1400 }]; } });

  function ask(){
    /* Getting it right and never seeing the dots again is half a lesson. This game
       exists to make 7 *look* like「5と2」, so the arrangement has to come back at
       the moment the child is told they were right — that is when it gets attached
       to the number they said. */
    const said = o.two ? `${numKana(a)}と${numKana(b)}で、${numKana(n)}。`
               : o.rows && n > 5 ? `${numKana(5)}と${numKana(n - 5)}で、${numKana(n)}。`
               : `${numKana(n)}だったね。`;
    /* The praise the engine speaks lands first; naming the arrangement comes after
       it, over the uncovered board, and the question waits for both. */
    const reveal = revealed(() => {
      board.classList.add('open');
      api.later(() => api.afterSpeech(() => Sound.say(said, { delay: 0 })), 1050);
    }, { delay: 2300 });
    if (o.two){
      api.setPrompt('ぜんぶで いくつ だった？', '全部でいくつだった？');
      api.buildPad(n, reveal);
    } else {
      api.setPrompt('いくつ だった？', 'いくつだった？');
      api.buildChoices(shuffle([n].concat(distractors(n, 3, 1, o.hi + 2))), n, reveal);
    }
    /* The hint is another look, longer and left up. The child is not being asked to
       guess better; they are being asked to see, and you cannot see what is covered
       — which is also why it comes after the *first* mistake here and not the
       second: 「もういちど やってみよう」 over a covered board is only a guess. */
    api.coach({
      after: 1,
      text: o.two ? 'もういちど みせるね。ひだりと みぎ、それぞれ いくつ？'
          : o.rows ? 'もういちど みせるね。うえは 5こ。したは いくつ？'
          : 'もういちど みせるね。どんな かたちに ならんでる？',
      say: o.two ? 'もう一度見せるね。左と右、それぞれ、いくつ？'
         : o.rows ? 'もう一度見せるね。上は5個。下は、いくつ？'
         : 'もう一度見せるね。どんな形に、並んでる？',
      tool(){ board.classList.add('open'); },
      walk(){
        board.classList.add('open');
        if (o.two){
          const dice = $$('.dice', inner);
          return [{ at: dice[0], say: numKana(a), ms: 1200 }, { at: dice[1], say: numKana(b), ms: 1200 },
                  { at: inner, say: `${numKana(a)}と${numKana(b)}で？`, ms: 1900 }];
        }
        if (o.rows){
          const rows = $$('.frow', inner);
          return [{ at: rows[0], say: 'ご', ms: 1100 }, { at: rows[1], say: numKana(n - 5), ms: 1100 },
                  { at: inner, say: `ごと${numKana(n - 5)}で？`, ms: 1900 }];
        }
        return Coach.countable(api, $$('.fdot.on', inner)).steps(650);
      }
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
  api.answer(n);                   // so a plate one too many reads as「1つ多く」
  api.setPrompt(`${thing.e} が ${numTag(n)}こ あるのは どれ？`, `${thing.n}が${koKana(n)}、あるのは、どれ？`);
  const big = el('div', { style: { fontFamily: 'var(--fs-num)', fontWeight: 800, fontSize: 'calc(var(--u)*11)', lineHeight: 1, color: 'var(--c-red)' }, text: String(n) });
  api.field.append(big);
  const opts = shuffle([n].concat(distractors(n, 2, Math.max(1, lo - 1), Math.min(12, hi + 2), 2)));
  clear(api.choices);
  opts.forEach(v => {
    const plate = el('div.plate.fixed', null, groupNode(v, thing));
    plate.dataset.count = v;
    tappable(plate, () => {
      if (api.locked) return;
      if (v === n){ plate.classList.add('correct'); api.correct(); }
      else { plate.classList.add('wrong'); api.later(() => plate.classList.remove('wrong'), 460); api.wrong(plate, v); }
    });
    api.choices.append(plate);
  });
  /* The numeral's own quantity beside it, laid out in fives like every plate: a
     picture to match against, instead of a count written on the right plate. */
  api.coach({
    text: `${n} は これだけ。おなじ かずの おさらは？`,
    say: `${numKana(n)}は、これだけ。同じ数のお皿は、どれ？`,
    tool(){
      if ($('.numdots', api.field)) return;
      const dots = el('div.numdots', { 'aria-hidden': 'true' });
      for (let i = 0; i < n; i++) dots.append(el('i'));
      const pair = el('div.numwith');
      big.replaceWith(pair);
      pair.append(big, dots);
    },
    walk(){
      return $$('.plate', api.choices).map(p => {
        const c = Number(p.dataset.count);
        const filled = $$('.slot', p).filter(s => s.textContent);
        return { at: p, act(){ Coach.tag(filled[filled.length - 1], c); }, say: koKana(c), ms: 1300 };
      });
    }
  });
  api.onShow(() => {
    const p = $$('.plate', api.choices).find(x => Number(x.dataset.count) === n);
    if (p) p.click();
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
  const cnt = Coach.once(() => Coach.countable(api, $$('.item', wrap)));
  api.coach({
    text: 'ひとつずつ タップして かぞえよう',
    say: '一つずつタップして、数えよう。',
    tool(){ cnt(); },
    walk(){ return cnt().steps(); }
  });
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
  // the full frame is said once, as ten; the rest is counted on from there
  const frame = $('.tenframe', box);
  const cnt = Coach.once(() => Coach.countable(api, $$('.item', rest), { from: 10 }));
  api.coach({
    text: 'わくは 10。10の つぎから かぞえよう',
    say: '枠は、10。10の次から、数えよう。',
    tool(){ Coach.pulse(frame); cnt(); },
    walk(){ return [{ at: frame, say: 'じゅう', ms: 1000 }].concat(cnt().steps()); }
  });
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
    api.coach({
      text: 'ひだりの かずから かぞえて みよう',
      say: `${numKana(target - 1)}の、次は？`,
      tool(){ [target - 1, target + 1].forEach(v => { if (cells[v]) cells[v].classList.add('near'); }); },
      walk(){ return Coach.readAlong(nums.map(v => cells[v]), cells[target]); }
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
  let hole = null;
  for (let v = Math.max(1, ans - 3); v <= Math.min(hi, ans + 3); v++){
    const cell = el('div.nn' + (v === ans ? '.gap.now' : ''), { text: v === ans ? '?' : String(v) });
    if (v === ans) hole = cell;
    line.append(cell);
  }
  api.field.append(line);
  // the answer belongs in the line, where the child can see the run read straight
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, hi))), ans,
    revealed(() => fillBlank(hole, ans)));
  api.coach({
    text: mode === 'next' ? 'つぎは 1つ おおきい かず' : mode === 'before' ? 'まえは 1つ ちいさい かず' : 'ふたつの あいだに はいる かず',
    say: mode === 'next' ? '次は、一つ大きい数。' : mode === 'before' ? '前は、一つ小さい数。' : '二つの間に入る数。',
    tool(){
      $$('.nn', line).forEach(c => {
        const v = Number(c.textContent);
        if (v === ans - 1 || v === ans + 1) c.classList.add('near');
      });
    },
    walk(){ return Coach.readAlong($$('.nn', line), hole); }
  });
}

function skipCount(api){
  const step = pick([2, 5, 2, 10]);
  const start = step === 2 ? pick([2, 4, 6]) : step;
  const seq = [0, 1, 2, 3].map(i => start + i * step);
  const ans = seq[3];
  api.item('skip' + step + ':' + ans, step + 'ずつ ふえて ' + ans);
  api.setPrompt(`${step}ずつ ふえて いくよ。つぎは？`, `${numKana(step)}ずつ増えていくよ。次は？`);
  const line = el('div.numline');
  const cells = seq.map((v, i) => el('div.nn' + (i === 3 ? '.gap.now' : ''), { text: i === 3 ? '?' : String(v) }));
  cells.forEach(c => line.append(c));
  api.field.append(line);
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, ans + step * 2, step))), ans,
    revealed(() => fillBlank(cells[3], ans)));
  api.coach({
    text: `${step}ずつ ふえて いるよ`,
    say: `${numKana(step)}ずつ、増えているよ。`,
    tool(){
      if ($('.hop', line)) return;
      cells.slice(1).forEach(c => c.before(el('span.hop', { text: '+' + step, 'aria-hidden': 'true' })));
    },
    walk(){ return Coach.readAlong(cells, cells[3]); }
  });
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
  const cells = seq.map((v, i) => el('div.nn' + (i === 3 ? '.gap.now' : ''), { text: i === 3 ? '?' : String(v) }));
  cells.forEach(c => line.append(c));
  api.field.append(line, el('div.hintline', { text: 'ぎゃくむきに かぞえて みよう' }));
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, start + 2))), ans,
    revealed(() => fillBlank(cells[3], ans)));
  api.coach({
    text: numKana(start) + '、' + numKana(start - 1) + '、' + numKana(start - 2) + '、… つぎは？',
    say: `${numKana(start)}、${numKana(start - 1)}、${numKana(start - 2)}、…つぎは？`,
    tool(){ Coach.pulse(cells.slice(0, 3)); },
    walk(){ return Coach.readAlong(cells, cells[3]); }
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
      // Starting outside the dot is a motor-control slip, not evidence that the
      // child misunderstood the numeral. Nudge visually without lowering math stars.
      const dot = $('.trace-start', box);
      if (dot && dot.animate) dot.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }],
        { duration: 420 });
      if (++strays % 2 === 0){
        nudged = true;
        showGuide();
        Sound.say('赤い点から、なぞってみよう。', { delay: 100 });
      }
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
  // the start dot, its arrow and the idle guide already show the way; a hand cannot trace for a finger
  intro: false,
  aim: '数字を<b>正しい書き順・向き</b>で書く運筆。左右反転（鏡文字）は年長ではよくあることですが、入学前に始点と向きを体で覚えておくと、算数の時間を「書く練習」に取られずに済みます。',
  levels: [
    { t: '1・2・3', d: 'かんたんな せん', n: 6, make: api => traceQuestion(api, [1, 2, 3]) },
    { t: '4・5・6・7', d: '2かくの すうじも', n: 6, make: api => traceQuestion(api, [4, 5, 6, 7]) },
    { t: '8・9・0', d: 'まるい すうじ', n: 6, make: api => traceQuestion(api, [8, 9, 0]) }
  ]
});
