/* ===========================================================
   12 — WORLD 3「けいさんの やま」 いくつといくつ・10のおともだち・たし／ひき
   =========================================================== */
'use strict';

/* ---------- shared: bond diagram ---------- */
function bondNode(whole, known, unknownLabel){
  const legs = svg('svg', { viewBox: '0 0 100 20', class: 'legs' },
    svg('path', { d: 'M50 0 L18 18 M50 0 L82 18', stroke: 'var(--ink)', 'stroke-width': 3,
                  'stroke-linecap': 'round', fill: 'none' }));
  return el('div.bond', null,
    el('div.whole', { text: String(whole) }),
    legs,
    el('div.parts', null,
      el('div.part.known', { text: String(known) }),
      el('div.part.unknown', { text: unknownLabel == null ? '?' : String(unknownLabel) })));
}

/* five/ten frame with a known part in blue and the missing part as empty holes */
function partFrame(whole, known){
  const cols = whole > 5 ? 5 : whole;
  const f = el('div.tenframe', { style: { '--cols': cols } });
  for (let i = 0; i < whole; i++){
    const cell = el('div.cell' + (i >= known ? '.hole' : ''));
    if (i < known) cell.append(el('div.dot'));
    f.append(cell);
  }
  return f;
}

/* ============================================================
   8. いくつと いくつ — number bonds (decompose & compose)
   ============================================================ */
function decompose(api, whole){
  const known = ri(1, whole - 1), ans = whole - known;
  api.setPrompt(`${numTag(whole)} は ${numTag(known)} と いくつ？`,
                `${numKana(whole)}は ${numKana(known)}と いくつ`);
  const frame = partFrame(whole, known);
  const bond = bondNode(whole, known, null);
  api.field.append(el('div.frameset', null, frame), bond);
  api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 1, whole))), ans, {
    correctOpts: { delay: 1500 },
    onPick(){
      // show the two parts making the whole (scoped to this question's own nodes)
      const cells = $$('.cell', frame);
      for (let i = known; i < whole; i++){
        api.later(() => {
          if (!cells[i].firstChild){ cells[i].classList.remove('hole'); cells[i].append(el('div.dot.b')); Sound.sfx.place(); }
        }, (i - known) * 170 + 200);
      }
      $('.part.unknown', bond).textContent = String(ans);
    }
  });
}

function compose(api, maxWhole){
  const a = ri(1, maxWhole - 1), b = ri(1, maxWhole - a), ans = a + b;
  api.setPrompt(`${numTag(a)} と ${numTag(b)} で いくつ？`,
                `${numKana(a)}と ${numKana(b)}で いくつ`);
  const slots = a + b > 5 ? 10 : 5;
  const f = el('div.tenframe', { style: { '--cols': 5 } });
  for (let i = 0; i < slots; i++){
    const cell = el('div.cell');
    if (i < a) cell.append(el('div.dot'));
    else if (i < a + b) cell.append(el('div.dot.b'));
    f.append(cell);
  }
  api.field.append(el('div.frameset', null, f),
    el('div.eq', null, String(a), el('span.op', { text: 'と' }), String(b), el('span.op', { text: 'で' }), el('span.box', { text: '?' })));
  api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 1, maxWhole + 2))), ans);
}

Games.add({
  id: 'bond', name: 'いくつと いくつ', ico: '🧩', world: 'yama', color: 'var(--c-red)',
  aim: '5や10を<b>2つの数に分けたり、合わせたり</b>する感覚。たし算・ひき算を「数えないで思い出す」ための部品で、くり上がり・くり下がりの計算はこれが土台になります。ここが自動化していると小1は驚くほど楽になります。',
  levels: [
    { t: '5は いくつと いくつ', d: 'ごの ぶんかい', make: api => chance(.25) ? compose(api, 5) : decompose(api, 5) },
    { t: '6〜9', d: 'すこし おおきい かず', make: api => chance(.3) ? compose(api, ri(6, 9)) : decompose(api, ri(6, 9)) },
    { t: '10は いくつと いくつ', d: 'じゅうの ぶんかい', make: api => chance(.25) ? compose(api, 10) : decompose(api, 10) }
  ]
});

/* ============================================================
   9. １０の おともだち — make ten
   ============================================================ */
function fillToTen(api){
  const start = ri(2, 8);
  api.setPrompt(`わくが <b>10</b> に なるように タップして たそう`, 'わくが じゅうに なるように、タップして たそう');
  const f = el('div.tenframe', { style: { '--cols': 5 } });
  const cells = [];
  for (let i = 0; i < 10; i++){
    const cell = el('div.cell' + (i >= start ? '.tappable' : ''));
    if (i < start) cell.append(el('div.dot'));
    cells.push(cell); f.append(cell);
  }
  let count = start;
  const readout = el('div.hintline', { text: 'いま ' + count + 'こ' });
  cells.forEach((cell, i) => {
    if (i < start) return;
    cell.addEventListener('click', () => {
      if (api.locked || cell.firstChild) return;
      cell.append(el('div.dot.b'));
      count++;
      Sound.sfx.count(count - 1);
      Sound.say(numKana(count), { delay: 0, rate: 1.2 });
      readout.textContent = 'いま ' + count + 'こ';
      if (count === 10){
        api.later(() => {
          api.setPrompt(`${numTag(start)} と ${numTag(10 - start)} で <b>10</b>！`,
                        `${numKana(start)}と ${numKana(10 - start)}で じゅう`);
          api.correct({ quiet: true, delay: 1400 });
          UI.bigMark('◯');
        }, 300);
      }
    });
  });
  api.field.append(el('div.frameset', null, f), readout);
  api.onHint(() => { readout.textContent = 'いま ' + count + 'こ　／　あと ' + (10 - count) + 'こ'; });
}

function partnerOfTen(api){
  const a = ri(1, 9), ans = 10 - a;
  api.setPrompt(`${numTag(a)} と いくつで <b>10</b>？`, `${numKana(a)}と いくつで じゅう`);
  const f = el('div.tenframe', { style: { '--cols': 5 } });
  for (let i = 0; i < 10; i++){
    const cell = el('div.cell' + (i >= a ? '.hole' : ''));
    if (i < a) cell.append(el('div.dot'));
    f.append(cell);
  }
  api.field.append(el('div.frameset', null, f),
    el('div.eq', null, String(a), el('span.op', { text: 'と' }), el('span.box', { text: '?' }), el('span.op', { text: 'で' }), '10'));
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, 9))), ans);
}

function pairHunt(api){
  const a = ri(1, 9), b = 10 - a;
  const others = [];
  while (others.length < 3){
    const v = ri(1, 9);
    if (v !== a && v !== b && others.indexOf(v) < 0) others.push(v);
  }
  const cards = shuffle([a, b].concat(others));
  api.setPrompt('たすと <b>10</b> に なる 2まいを えらぼう', 'たすと じゅうに なる にまいを えらぼう');
  const picked = [];
  const row = api.choices;
  cards.forEach(v => {
    const c = el('button.choice', { type: 'button', text: String(v) });
    c.addEventListener('click', () => {
      if (api.locked || c.classList.contains('correct')) return;
      if (picked.indexOf(c) >= 0){
        picked.splice(picked.indexOf(c), 1); c.classList.remove('picked');
        c.style.borderColor = ''; Sound.sfx.tap(); return;
      }
      picked.push(c); c.style.borderColor = 'var(--accent)'; Sound.sfx.tap();
      if (picked.length === 2){
        const sum = Number(picked[0].textContent) + Number(picked[1].textContent);
        if (sum === 10){ picked.forEach(p => p.classList.add('correct')); api.correct(); }
        else {
          picked.forEach(p => { p.classList.add('wrong'); p.style.borderColor = ''; api.later(() => p.classList.remove('wrong'), 460); });
          api.wrong();
          Sound.say(`あわせて ${numKana(sum)}に なったよ`, { delay: 320 });
          picked.length = 0;
        }
      }
    });
    row.append(c);
  });
  api.field.append(el('div.hintline', { text: '1と9、2と8、3と7、4と6、5と5' }));
  api.onHint(() => {
    const one = $$('.choice', row).find(c => Number(c.textContent) === a);
    if (one) one.classList.add('glow');
  });
}

Games.add({
  id: 'ten', name: '10の おともだち', ico: '🔟', world: 'yama', color: 'var(--c-red)',
  aim: '<b>合わせて10になる組み合わせ</b>を、考えずに言えるようにする練習。「9+4」を「9+1+3」と処理するくり上がりの計算は、これが即答できるかどうかで速さがまったく変わります。',
  levels: [
    { t: '10まで うめる', d: 'わくを いっぱいに する', make: fillToTen },
    { t: '◯と いくつで10', d: 'あと いくつ？', make: partnerOfTen },
    { t: 'ペアを さがす', d: '2まいで 10を つくる', make: pairHunt }
  ]
});

/* ============================================================
   10-11. たしざん / ひきざん — story scene then symbol
   ============================================================ */
/* Two clusters with a gap between them, so "3 and 2" stays visible as 3 and 2
   even after they have joined. A single evenly-spaced row dissolves the structure
   the question is about. */
function clusterSpots(n, cx){
  const per = Math.min(3, n);
  const rows = Math.ceil(n / per);
  const out = [];
  for (let i = 0; i < n; i++){
    const r = Math.floor(i / per), c = i % per;
    const inRow = Math.min(per, n - r * per);
    out.push([cx + (c - (inRow - 1) / 2) * 12, 48 + (r - (rows - 1) / 2) * 23]);
  }
  return out;
}

function storyScene(api, a, b, op, thing, onReady){
  const scene = el('div.scene');
  scene.append(el('div.' + (thing.e === '🐟' ? 'pond' : 'ground')));
  api.field.append(scene);
  const actors = [];
  const place = (spots, cls, hidden) => spots.forEach(p => {
    const n = el('div.actor.' + cls, { text: thing.e, style: { left: p[0] + '%', top: p[1] + '%' } });
    // offset in % of the scene, not vw: a vw offset left newcomers visible inside the frame
    if (hidden) n.style.transform = 'translate(160%,-50%)';
    scene.append(n); actors.push(n);
  });

  if (op === '+'){
    place(clusterSpots(a, 30), 'g1', false);
    place(clusterSpots(b, 72), 'g2', true);
  } else {
    const spots = clusterSpots(a, 50);
    place(spots.slice(0, a - b), 'g1', false);
    place(spots.slice(a - b), 'g2', false);
  }

  api.later(() => {
    Sound.sfx.swoosh();
    if (op === '+'){
      actors.forEach(n => { if (n.classList.contains('g2')) n.style.transform = 'translate(-50%,-50%)'; });
    } else {
      actors.forEach(n => {
        if (!n.classList.contains('g2')) return;
        n.classList.add('leaving');
        n.style.transform = 'translate(160%,-160%)';
      });
    }
    api.later(onReady, 900);
  }, 950);
}

/** a ＋ b with each number tinted like its group in the picture */
function eqNode(a, b, op){
  return el('div.eq', null,
    el('span.n1', { text: String(a) }),
    el('span.op', { text: op === '+' ? '＋' : '−' }),
    el('span.n2', { text: String(b) }),
    el('span.op', { text: '＝' }),
    el('span.box', { text: '?' }));
}

function addStory(api, max){
  const a = ri(1, max - 1), b = ri(1, max - a), ans = a + b;
  const thing = pick(THINGS);
  api.setPrompt(`${thing.e} が ${numTag(a)}つ。${numTag(b)}つ やってきたよ`,
                `${thing.n}が ${tsuKana(a)}。${tsuKana(b)} やってきたよ`);
  storyScene(api, a, b, '+', thing, () => {
    api.setPrompt('ぜんぶで いくつ？', 'ぜんぶで いくつ');
    api.field.append(eqNode(a, b, '+'));
    api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 1, max + 2, 2))), ans);
  });
}

function subStory(api, max){
  const a = ri(2, max), b = ri(1, a - 1), ans = a - b;
  const thing = pick(THINGS);
  api.setPrompt(`${thing.e} が ${numTag(a)}つ。${numTag(b)}つ いなくなるよ`,
                `${thing.n}が ${tsuKana(a)}。${tsuKana(b)} いなくなるよ`);
  storyScene(api, a, b, '-', thing, () => {
    api.setPrompt('のこりは いくつ？', 'のこりは いくつ');
    api.field.append(eqNode(a, b, '-'));
    api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 0, max, 2))), ans);
  });
}

function symbolCalc(api, op, max){
  let a, b, ans;
  if (op === '+'){ a = ri(1, max - 1); b = ri(1, max - a); ans = a + b; }
  else { a = ri(2, max); b = ri(1, a); ans = a - b; }
  api.setPrompt('しきを みて こたえよう',
    `${numKana(a)} ${op === '+' ? 'たす' : 'ひく'} ${numKana(b)} は`);
  api.field.append(eqNode(a, b, op));
  api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 0, max + 2, 2))), ans);
  api.onHint(() => {
    if ($('.tenframe', api.field)) return;
    const f = el('div.tenframe', { style: { '--cols': 5 } });
    for (let i = 0; i < 10; i++){
      const cell = el('div.cell');
      if (op === '+'){ if (i < a) cell.append(el('div.dot')); else if (i < a + b) cell.append(el('div.dot.b')); }
      else { if (i < a - b) cell.append(el('div.dot')); else if (i < a) cell.append(el('div.dot.b')); }
      f.append(cell);
    }
    api.field.append(el('div.frameset', null, f),
      el('div.hintline', { text: op === '+' ? 'あおと あかを あわせて かぞえよう' : 'あかは いなくなった ぶん。あおを かぞえよう' }));
  });
}

function differenceQ(api, max){
  const a = ri(3, max), b = ri(1, a - 1), ans = a - b;
  const t1 = pick(THINGS); let t2 = pick(THINGS);
  while (t2.e === t1.e) t2 = pick(THINGS);
  api.setPrompt(`どちらが <b>いくつ</b> おおい？`, 'どちらが いくつ おおい');
  const board = el('div.measure');
  [[t1, a], [t2, b]].forEach(([t, n]) => {
    const row = el('div.mrow', { style: { cursor: 'default' } }, el('div.cap', { text: t.e }));
    const g = el('div.row', { style: { gap: 'calc(var(--u)*.25)' } });
    for (let i = 0; i < n; i++) g.append(el('span.item', { text: t.e, style: { fontSize: 'calc(var(--u)*2.4)' } }));
    row.append(g);
    board.append(row);
  });
  api.field.append(board, eqNode(a, b, '-'));
  api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 0, max, 2))), ans);
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', { text: 'うえと したを 1つずつ ペアに して、あまりを かぞえよう' }));
  });
}

Games.add({
  id: 'add', name: 'たしざん', ico: '➕', world: 'yama', color: 'var(--c-red)',
  aim: '「増えた／合わせた」場面を<b>式に置きかえる</b>力。物語→絵→式の順に抽象度を上げるので、記号だけを丸暗記せずに意味とつながります。',
  levels: [
    { t: '5まで', d: 'おはなしで かんがえる', make: api => addStory(api, 5) },
    { t: '10まで', d: 'すこし おおきい かず', make: api => addStory(api, 10) },
    { t: 'しきだけで', d: 'えが なくても できる', make: api => symbolCalc(api, '+', 10) }
  ]
});

Games.add({
  id: 'sub', name: 'ひきざん', ico: '➖', world: 'yama', color: 'var(--c-red)',
  aim: '「のこりはいくつ」（求残）と「どちらがいくつ多い」（求差）の<b>2つの意味</b>にふれます。求差はつまずきやすいので、1対1に並べて余りを見る経験を早めに。',
  levels: [
    { t: '5まで', d: 'いなくなると のこりは', make: api => subStory(api, 5) },
    { t: '10まで', d: 'すこし おおきい かず', make: api => subStory(api, 10) },
    { t: 'ちがいは いくつ', d: 'くらべて ひきざん', make: api => chance(.5) ? differenceQ(api, 10) : symbolCalc(api, '-', 10) }
  ]
});
