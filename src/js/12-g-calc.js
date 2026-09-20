/* ===========================================================
   12 — WORLD 3「けいさんの やま」 いくつといくつ・10のおともだち・たし／ひき
   =========================================================== */
'use strict';

/** In a 集中練習 session the engine names the exact fact this question should ask.
    These generators read it, so a fact the child keeps missing can come round
    several times in one sitting; きょうの れんしゅう on its own gives one particular
    fact about a turn a fortnight. Returns the numbers in the key, or null. */
function wanted(api, re){
  const m = api.want && re.exec(api.want);
  return m ? m.slice(1).map(Number) : null;
}

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
function decompose(api, whole, pad){
  const w = wanted(api, /^dec:(\d+)-(\d+)$/);
  const aim = w && w[0] >= 2 && w[1] >= 1 && w[1] < w[0];
  if (aim) whole = w[0];
  const known = aim ? w[1] : ri(1, whole - 1), ans = whole - known;
  api.item('dec:' + whole + '-' + known, whole + ' は ' + known + ' と ' + ans);
  api.setPrompt(`${numTag(whole)} は ${numTag(known)} と いくつ？`,
                `${numKana(whole)}は、${numKana(known)}といくつ？`);
  const frame = partFrame(whole, known);
  const frameset = el('div.frameset', null, frame);
  const bond = bondNode(whole, known, null);
  /* At the top level the picture *is* the answer: 「10は4といくつ」 with a ten-frame
     on screen is solved by counting the six empty cells, not by remembering that
     10 is 4 and 6. The keypad took guessing out of this level; leaving the frame up
     left counting in, which is the strategy the level exists to replace. So the
     frame comes back the moment the child answers — and earlier if they get stuck —
     where it confirms what they said instead of telling them. */
  if (!pad) api.field.append(frameset);
  api.field.append(bond);
  const showFrame = () => { if (!frameset.isConnected) api.field.prepend(frameset); };
  const showParts = {
    correctOpts: { delay: 1500 },
    onPick(){
      showFrame();
      // show the two parts making the whole (scoped to this question's own nodes)
      const cells = $$('.cell', frame);
      for (let i = known; i < whole; i++){
        api.later(() => {
          if (!cells[i].firstChild){ cells[i].classList.remove('hole'); cells[i].append(el('div.dot.b')); Sound.sfx.place(); }
        }, (i - known) * 170 + 200);
      }
      $('.part.unknown', bond).textContent = String(ans);
    }
  };
  if (pad) api.buildPad(ans, showParts);
  else api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 1, whole))), ans, showParts);
  /* The empty cells become the child's to fill, counting on from the part they can
     see. What they added is the answer, in red, made with their own taps. */
  let walking = false;
  const fill = Coach.once(() => Coach.fillable(api, $$('.cell', frame), { from: known,
    onDone(){ if (walking) return; Coach.pulse($$('.dot.b', frame)); Sound.say('赤い丸は、いくつ？', { delay: 80 }); } }));
  api.coach({
    text: `あいて いる ところを タップして ${whole}に しよう`,
    say: `空いているところをタップして、${numKana(whole)}にしよう。`,
    tool(){ showFrame(); fill(); },
    walk(){
      walking = true;
      showFrame();
      const steps = fill().steps();
      $$('.cell', frame).slice(known).forEach((c, i) => steps.push({ at: c, act(){ Coach.tag(c, i + 1, 'alt'); }, say: numKana(i + 1), ms: 620 }));
      steps.push({ say: `${numKana(known)}と${numKana(ans)}で、${numKana(whole)}。`, ms: 2100 });
      return steps;
    }
  });
}

function compose(api, maxWhole, pad){
  const w = wanted(api, /^com:(\d+)\+(\d+)$/);
  const aim = w && w[0] >= 1 && w[1] >= 1 && w[0] + w[1] <= maxWhole;
  const a = aim ? w[0] : ri(1, maxWhole - 1);
  const b = aim ? w[1] : ri(1, maxWhole - a), ans = a + b;
  api.item('com:' + a + '+' + b, a + ' と ' + b + ' で ' + ans);
  api.setPrompt(`${numTag(a)} と ${numTag(b)} で いくつ？`,
                `${numKana(a)}と${numKana(b)}で、いくつ？`);
  const slots = a + b > 5 ? 10 : 5;
  const f = el('div.tenframe', { style: { '--cols': 5 } });
  for (let i = 0; i < slots; i++){
    const cell = el('div.cell');
    if (i < a) cell.append(el('div.dot'));
    else if (i < a + b) cell.append(el('div.dot.b'));
    f.append(cell);
  }
  const frameset = el('div.frameset', null, f);
  if (!pad) api.field.append(frameset);          // countable at the top level: see decompose
  const box = el('span.box', { text: '?' });
  api.field.append(
    el('div.eq', null, String(a), el('span.op', { text: 'と' }), String(b), el('span.op', { text: 'で' }), box));
  const showFrame = () => { if (!frameset.isConnected) api.field.prepend(frameset); };
  const reveal = revealed(() => { fillBlank(box, ans); showFrame(); }, { delay: 1400 });
  if (pad) api.buildPad(ans, reveal);
  else api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 1, maxWhole + 2))), ans, reveal);
  const cnt = Coach.once(() => Coach.countable(api, $$('.dot', f)));
  api.coach({
    text: 'あおと あかを ぜんぶ かぞえよう',
    say: '青と赤を、全部数えよう。',
    tool(){ showFrame(); cnt(); },
    walk(){ showFrame(); return cnt().steps(); }
  });
}

/** Make two different decompositions. There is no single hidden answer: every
    split is valid, and the child succeeds by producing a genuinely different one. */
function makeTwoWays(api){
  const whole = ri(6, 9);
  api.item('ways:' + whole, whole + ' を 2とおりに わける');
  api.setPrompt(`${numTag(whole)} を ちがう 2つの やりかたで わけよう`,
                `${numKana(whole)}を、違う二つのやり方で分けよう。`);
  const made = [], board = el('div.ways-board');
  let accepting = true;
  api.field.append(board);

  const draw = () => {
    clear(board);
    made.forEach((a, i) => board.append(
      el('div.way', null,
        el('span.no', { text: String(i + 1) }),
        bondNode(whole, a, whole - a))));
  };
  const build = () => {
    clear(api.choices);
    accepting = true;
    for (let a = 1; a < whole; a++){
      const b = el('button.choice', { type: 'button', text: String(a) });
      b.addEventListener('click', () => {
        if (api.locked || !accepting) return;
        accepting = false;                    // a double tap is one construction
        const same = made.some(x => Math.min(x, whole - x) === Math.min(a, whole - a));
        if (same){
          api.wrong(b);
          Sound.say('同じ分け方だね。違う分け方も作ってみよう。', { delay: 250 });
          api.later(() => { accepting = true; }, 360);
          return;
        }
        made.push(a);
        b.classList.add('correct');
        draw();
        Sound.say(`${numKana(a)}と${numKana(whole-a)}。`, { delay: 120 });
        if (made.length >= 2) api.later(() => api.correct({ quiet: true, delay: 900 }), 350);
        else api.later(build, 350);
      });
      api.choices.append(b);
    }
  };
  draw();
  build();
  const unused = () => {
    const used = new Set(made.map(x => Math.min(x, whole - x)));
    return Array.from({ length: whole - 1 }, (_, i) => i + 1)
      .find(x => !used.has(Math.min(x, whole - x))) || 1;
  };
  api.coach({
    text: () => { const a = unused(); return a + ' と ' + (whole - a) + ' に わけることも できるよ'; },
    say: () => { const a = unused(); return `${numKana(a)}と${numKana(whole - a)}に、分けることもできるよ。`; },
    tool(){ if (!$('.tenframe', api.field)) api.field.append(el('div.frameset', null, tenFrameNode(whole, 5, { total: whole > 5 ? 10 : 5 }))); },
    walk(){
      const a = unused();
      const b = $$('.choice', api.choices).find(x => Number(x.textContent) === a);
      return b ? [{ at: b, say: `${numKana(a)}を押してみよう。`, ms: 1700 }] : [];
    }
  });
  api.onShow(() => {
    const press = v => { const b = $$('.choice', api.choices).find(x => Number(x.textContent) === v); if (b) b.click(); };
    const taken = new Set(made.map(x => Math.min(x, whole - x)));
    const picks = [1, 2, 3].filter(v => !taken.has(v)).slice(0, 2 - made.length);
    press(picks[0]);
    if (picks[1] != null) api.later(() => press(picks[1]), 450);
  });
}

Games.add({
  id: 'bond', name: 'いくつと いくつ', ico: '🧩', world: 'yama', color: 'var(--c-red)', focus: 1.7, fluent: true,
  aim: '5や10を<b>2つの数に分けたり、合わせたり</b>する感覚。たし算・ひき算を「数えないで思い出す」ための部品で、くり上がり・くり下がりの計算はこれが土台になります。ここが自動化していると小1は驚くほど楽になります。',
  levels: [
    { t: '5は いくつと いくつ', d: 'ごの ぶんかい', make: api => chance(.25) ? compose(api, 5) : decompose(api, 5) },
    // a check skips the open-ended question: any split is right, so it confirms nothing
    { t: '6〜9', d: 'ちがう わけかたも つくる', make: api => !api.check && chance(.3)
        ? makeTwoWays(api)
        : chance(.3) ? compose(api, ri(6, 9)) : decompose(api, ri(6, 9)) },
    // the top level asks the child to produce the number, not pick it out of three
    { t: '10は いくつと いくつ', d: 'すうじを じぶんで えらぶ', make: api => chance(.25) ? compose(api, 10, true) : decompose(api, 10, true) }
  ]
});

/* ============================================================
   9. １０の おともだち — make ten
   ============================================================ */
function fillToTen(api){
  const w = wanted(api, /^fill10:(\d+)$/);
  const start = (w && w[0] >= 2 && w[0] <= 8) ? w[0] : ri(2, 8);
  api.item('fill10:' + start, start + ' から 10 まで あと ' + (10 - start));
  api.setPrompt(`わくが <b>10</b> に なるように タップして たそう`, '枠が10になるように、タップして足そう。');
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
      Sound.say(numKana(count), { delay: 0, rate: 1.08 });
      readout.textContent = 'いま ' + count + 'こ';
      if (count === 10){
        api.later(() => {
          const add = 10 - start;
          api.setPrompt(`${numTag(start)} に <b>いくつ たした？</b>`,
                        `${numKana(start)}に、いくつ足した？`);
          api.buildChoices(shuffle([add].concat(distractors(add, 2, 1, 9))), add, {
            correctOpts: { delay: 900 }
          });
        }, 300);
      }
    });
  });
  api.field.append(el('div.frameset', null, f), readout);
  api.coach({ walk(){ return cells.filter(c => !c.firstChild).map(c => ({ at: c, act(){ c.click(); }, ms: 620 })); } });
  api.onHint(() => { readout.textContent = 'いま ' + count + 'こ　／　あと ' + (10 - count) + 'こ'; });
  api.onShow(() => {
    cells.filter(c => !c.firstChild).forEach(c => c.click());
    api.later(() => { const b = $('.choice.correct') || $$('.choice', api.choices).find(x => x.textContent === String(10 - start)); if (b) b.click(); }, 650);
  });
}

function partnerOfTen(api, pad){
  const w = wanted(api, /^ten:(\d+)$/);
  const a = (w && w[0] >= 1 && w[0] <= 9) ? w[0] : ri(1, 9), ans = 10 - a;
  api.item('ten:' + a, a + ' と ' + ans + ' で 10');
  api.setPrompt(`${numTag(a)} と いくつで <b>10</b>？`, `${numKana(a)}といくつで、10？`);
  const f = el('div.tenframe', { style: { '--cols': 5 } });
  const cells = [];
  for (let i = 0; i < 10; i++){
    const cell = el('div.cell' + (i >= a ? '.hole' : ''));
    if (i < a) cell.append(el('div.dot'));
    cells.push(cell); f.append(cell);
  }
  /* Same reason as いくつと いくつ L3: 「2と いくつで 10？」 above two blue dots and
     eight empty cells is a counting question wearing a retrieval question's clothes.
     The equation stays — that is the question; the frame is the answer. */
  const frameset = el('div.frameset', null, f);
  if (!pad) api.field.append(frameset);
  const box = el('span.box', { text: '?' });
  api.field.append(
    el('div.eq', null, String(a), el('span.op', { text: 'と' }), box, el('span.op', { text: 'で' }), '10'));
  const showFrame = () => { if (!frameset.isConnected) api.field.prepend(frameset); };
  const fillIn = () => {
    fillBlank(box, ans);
    showFrame();
    for (let i = a; i < 10; i++){
      api.later(() => {
        if (!cells[i].firstChild){ cells[i].classList.remove('hole'); cells[i].append(el('div.dot.b')); Sound.sfx.place(); }
      }, (i - a) * 150 + 200);
    }
  };
  if (pad) api.buildPad(ans, revealed(fillIn, { delay: 1500 }));
  else api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 1, 9))), ans, revealed(fillIn, { delay: 1500 }));
  let walking = false;
  const fill = Coach.once(() => Coach.fillable(api, cells, { from: a,
    onDone(){ if (walking) return; Coach.pulse($$('.dot.b', f)); Sound.say('赤い丸は、いくつ？', { delay: 80 }); } }));
  api.coach({
    text: '10に なるまで タップして みよう',
    say: '10になるまで、タップしてみよう。',
    tool(){ showFrame(); fill(); },
    walk(){
      walking = true;
      showFrame();
      const steps = fill().steps();
      cells.slice(a).forEach((c, i) => steps.push({ at: c, act(){ Coach.tag(c, i + 1, 'alt'); }, say: numKana(i + 1), ms: 620 }));
      steps.push({ say: `${numKana(a)}と${numKana(ans)}で、10。`, ms: 1900 });
      return steps;
    }
  });
}

function pairHunt(api){
  const w = wanted(api, /^pair:(\d+)$/);
  const a = (w && w[0] >= 1 && w[0] <= 9) ? w[0] : ri(1, 9), b = 10 - a;
  const others = [];
  while (others.length < 3){
    const v = ri(1, 9);
    if (v !== a && v !== b && others.indexOf(v) < 0) others.push(v);
  }
  const cards = shuffle([a, b].concat(others));
  api.item('pair:' + Math.min(a, b), Math.min(a, b) + ' と ' + Math.max(a, b) + ' の ペア');
  api.setPrompt('たすと <b>10</b> に なる 2まいを えらぼう', '足すと10になる2枚を選ぼう。');
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
          Sound.say(`合わせて${numKana(sum)}になったよ。`, { delay: 320 });
          picked.length = 0;
        }
      }
    });
    row.append(c);
  });
  api.field.append(el('div.hintline', { text: '1と9、2と8、3と7、4と6、5と5' }));
  /* Hold one card, and find its partner by filling a frame from it — the glow on
     one card of the pair is kept, the other is found by counting. */
  const frame = Coach.once(() => {
    const fr = el('div.tenframe', { style: { '--cols': 5 } });
    const cs = [];
    for (let i = 0; i < 10; i++){ const c = el('div.cell' + (i >= a ? '.hole' : '')); if (i < a) c.append(el('div.dot')); cs.push(c); fr.append(c); }
    api.field.prepend(el('div.frameset', null, fr));
    return Coach.fillable(api, cs, { from: a });
  });
  const cardOf = v => $$('.choice', row).find(c => Number(c.textContent) === v);
  api.coach({
    text: `${a} と あわせて 10に なる カードは？`,
    say: `${numKana(a)}と合わせて、10になるカードは、どれ？`,
    tool(){ const one = cardOf(a); if (one) one.classList.add('glow'); frame(); },
    walk(){ return frame().steps().concat([{ at: cardOf(b), say: `${numKana(a)}と${numKana(b)}で、10。`, ms: 2000 }]); }
  });
  api.onShow(() => {
    picked.slice().forEach(p => p.click());             // put down whatever is held
    const cs = $$('.choice', row);
    const c1 = cs.find(c => Number(c.textContent) === a);
    const c2 = cs.find(c => c !== c1 && Number(c.textContent) === b);
    [c1, c2].forEach(c => { if (c) c.click(); });
  });
}

/** Build ten from three numbers. Multiple answers are accepted; the app evaluates
    the child's construction instead of asking them to recognise one prepared pair. */
function threeMakeTen(api){
  api.item('three10', '3つの かずで 10を つくる');
  api.setPrompt('3つの すうじを えらんで <b>10</b> を つくろう',
                '三つの数字を選んで、10を作ろう。');
  const picked = [];
  let accepting = true;
  const readout = el('div.three-sum', { text: '? ＋ ? ＋ ? ＝ 10' });
  api.field.append(readout);
  const redraw = () => {
    const vals = picked.concat(['?', '?', '?']).slice(0, 3);
    readout.textContent = vals.join(' ＋ ') + ' ＝ 10';
  };
  for (let v = 0; v <= 9; v++){
    const b = el('button.choice.padkey', { type: 'button', text: String(v) });
    b.addEventListener('click', () => {
      if (api.locked || !accepting) return;
      picked.push(v); redraw(); Sound.sfx.tap();
      if (picked.length < 3) return;
      accepting = false;
      const sum = picked.reduce((a, x) => a + x, 0);
      if (sum === 10){
        b.classList.add('correct');
        api.correct({ delay: 1400 });
      } else {
        api.wrong(b);
        Sound.say(`合わせると${numKana(sum)}だね。10になるように変えてみよう。`, { delay: 280 });
        api.later(() => { picked.length = 0; redraw(); accepting = true; }, 650);
      }
    });
    api.choices.append(b);
  }
  api.choices.classList.add('pad');
  const key = v => $$('.padkey', api.choices).find(k => k.textContent === String(v));
  api.coach({
    text: 'まず 5を えらんで、のこりの 5を 2つに わけよう',
    say: 'まず5を選んで、残りの5を、二つに分けよう。',
    tool(){ Coach.pulse(key(5)); },
    walk(){
      return [{ at: key(5), say: 'ご', ms: 1000 }, { at: key(2), say: 'に', ms: 1000 },
              { at: key(3), say: 'さん。5と2と3で、10。', ms: 2300 }];
    }
  });
  api.onShow(() => {
    picked.length = 0; redraw(); accepting = true;
    [5, 2, 3].forEach(v => { const k = key(v); if (k) k.click(); });
  });
}

Games.add({
  id: 'ten', name: '10の おともだち', ico: '🔟', world: 'yama', color: 'var(--c-red)', focus: 1.7, fluent: true,
  aim: '<b>合わせて10になる組み合わせ</b>を、考えずに言えるようにする練習。「9+4」を「9+1+3」と処理するくり上がりの計算は、これが即答できるかどうかで速さがまったく変わります。',
  levels: [
    { t: '10まで うめる', d: 'わくを いっぱいに する', make: fillToTen },
    { t: '◯と いくつで10', d: 'あと いくつ？ じぶんで こたえる', make: api => partnerOfTen(api, true) },
    { t: 'ペアを さがす', d: '2まい・3まいで 10を つくる',
      make: api => !api.check && chance(.35) ? threeMakeTen(api) : pairHunt(api) }
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
    n.dataset.homeLeft = p[0] + '%';
    /* translate(160%) is relative to the emoji, not the scene. Place newcomers
       outside the scene itself until their arrival starts. */
    if (hidden) n.style.left = '112%';
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
      actors.forEach(n => { if (n.classList.contains('g2')) n.style.left = n.dataset.homeLeft; });
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
  const w = wanted(api, /^sum:(\d+)\+(\d+)$/);
  const aim = w && w[0] >= 1 && w[1] >= 1 && w[0] + w[1] <= max;
  const a = aim ? w[0] : ri(1, max - 1);
  const b = aim ? w[1] : ri(1, max - a), ans = a + b;
  const thing = pick(THINGS);
  api.item('sum:' + a + '+' + b, a + ' ＋ ' + b);
  api.setPrompt(`${thing.e} が ${numTag(a)}つ。${numTag(b)}つ やってきたよ`,
                `${thing.n}が${tsuKana(a)}。${tsuKana(b)}、やってきたよ。`);
  storyScene(api, a, b, '+', thing, () => {
    api.setPrompt('ぜんぶで いくつ？', '全部でいくつ？');
    const eq = eqNode(a, b, '+');
    api.field.append(eq);
    // the child's answer belongs inside the sentence, not next to it
    api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 1, max + 2, 2))), ans,
      revealed(() => fillBlank($('.box', eq), ans)));
    // the picture is still there after the story: count it, both groups together
    const cnt = Coach.once(() => Coach.countable(api, $$('.actor', api.field)));
    api.coach({
      text: 'ぜんぶ タップして かぞえよう',
      say: '全部タップして、数えよう。',
      tool(){ cnt(); },
      walk(){ return cnt().steps(); }
    });
  });
}

function subStory(api, max){
  const w = wanted(api, /^rest:(\d+)-(\d+)$/);
  const aim = w && w[0] >= 2 && w[0] <= max && w[1] >= 1 && w[1] < w[0];
  const a = aim ? w[0] : ri(2, max);
  const b = aim ? w[1] : ri(1, a - 1), ans = a - b;
  const thing = pick(THINGS);
  api.item('rest:' + a + '-' + b, a + ' − ' + b);
  api.setPrompt(`${thing.e} が ${numTag(a)}つ。${numTag(b)}つ いなくなるよ`,
                `${thing.n}が${tsuKana(a)}。${tsuKana(b)}、いなくなるよ。`);
  storyScene(api, a, b, '-', thing, () => {
    api.setPrompt('のこりは いくつ？', '残りは、いくつ？');
    const eq = eqNode(a, b, '-');
    api.field.append(eq);
    api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 0, max, 2))), ans,
      revealed(() => fillBlank($('.box', eq), ans)));
    /* The ones that left come back faint, so what is left can be told apart from
       what went and counted — the difference between「のこり」and「ぜんぶ」 on screen. */
    const back = () => $$('.actor.g2', api.field).forEach(x => {
      x.classList.remove('leaving');
      x.classList.add('coachgone');
      x.style.transform = 'translate(-50%,-50%)';
    });
    const cnt = Coach.once(() => Coach.countable(api, $$('.actor.g1', api.field)));
    api.coach({
      text: 'いなく なったのは うすい ほう。のこりを かぞえよう',
      say: 'いなくなったのは、薄いほう。残りを、数えよう。',
      tool(){ back(); cnt(); },
      walk(){ back(); return cnt().steps(); }
    });
  });
}

function symbolCalc(api, op, max, pad){
  let a, b, ans;
  const w = wanted(api, op === '+' ? /^sum:(\d+)\+(\d+)$/ : /^rest:(\d+)-(\d+)$/);
  const aim = op === '+'
    ? (w && w[0] >= 1 && w[1] >= 1 && w[0] + w[1] <= max)
    : (w && w[0] >= 2 && w[0] <= max && w[1] >= 1 && w[1] <= w[0]);
  if (aim){ a = w[0]; b = w[1]; ans = op === '+' ? a + b : a - b; }
  else if (op === '+'){ a = ri(1, max - 1); b = ri(1, max - a); ans = a + b; }
  else { a = ri(2, max); b = ri(1, a); ans = a - b; }
  api.item((op === '+' ? 'sum:' + a + '+' + b : 'rest:' + a + '-' + b),
    a + (op === '+' ? ' ＋ ' : ' − ') + b);
  api.setPrompt('しきを みて こたえよう',
    `${numKana(a)}、${op === '+' ? 'たす' : 'ひく'}、${numKana(b)}は？`);
  const eq = eqNode(a, b, op);
  api.field.append(eq);
  const reveal = revealed(() => fillBlank($('.box', eq), ans));
  if (pad) api.buildPad(ans, reveal);
  else api.buildChoices(shuffle([ans].concat(distractors(ans, 3, 0, max + 2, 2))), ans, reveal);
  const frame = Coach.once(() => {
    const f = el('div.tenframe', { style: { '--cols': 5 } });
    for (let i = 0; i < 10; i++){
      const cell = el('div.cell');
      if (op === '+'){ if (i < a) cell.append(el('div.dot')); else if (i < a + b) cell.append(el('div.dot.b')); }
      else { if (i < a - b) cell.append(el('div.dot')); else if (i < a) cell.append(el('div.dot.b.coachgone')); }
      f.append(cell);
    }
    api.field.append(el('div.frameset', null, f));
    return f;
  });
  const cnt = Coach.once(() => Coach.countable(api, $$(op === '+' ? '.dot' : '.dot:not(.b)', frame())));
  api.coach({
    text: op === '+' ? 'あおと あかを あわせて かぞえよう' : 'うすい まるは ひいた ぶん。のこりを かぞえよう',
    say: op === '+' ? '青と赤を、合わせて数えよう。' : '薄い丸は、引いた分。残りを、数えよう。',
    tool(){ cnt(); },
    walk(){ return cnt().steps(); }
  });
}

function differenceQ(api, max, pad){
  const w = wanted(api, /^diff:(\d+)-(\d+)$/);
  const aim = w && w[0] >= 3 && w[0] <= max && w[1] >= 1 && w[1] < w[0];
  const a = aim ? w[0] : ri(3, max);
  const b = aim ? w[1] : ri(1, a - 1), ans = a - b;
  const t1 = pick(THINGS); let t2 = pick(THINGS);
  while (t2.e === t1.e) t2 = pick(THINGS);
  api.item('diff:' + a + '-' + b, a + ' と ' + b + ' の ちがい');
  api.setPrompt(`どちらが <b>いくつ</b> おおい？`, 'どちらが、いくつ多い？');
  /* No icon at the head of the row. `.mrow` was built for the bar chart, where the
     cap is a pencil icon beside a bar; here the row *is* the objects, and a cap drawn
     from the same emoji at the same size is simply one more of them — 「10 − 8」 sat
     under eleven balloons and nine bunches of grapes. The row says what it is. */
  const board = el('div.measure.countrows');
  [[t1, a], [t2, b]].forEach(([t, n]) => {
    const row = el('div.mrow', { style: { cursor: 'default' } });
    const g = el('div.row.pairline', { style: { gap: 'calc(var(--u)*.25)' } });
    for (let i = 0; i < n; i++) g.append(el('span.item', { text: t.e, style: { fontSize: 'calc(var(--u)*2.4)' } }));
    row.append(g);
    board.append(row);
  });
  const eq = eqNode(a, b, '-');
  api.field.append(board, eq);
  const reveal = revealed(() => fillBlank($('.box', eq), ans));
  if (pad) api.buildPad(ans, reveal);
  else api.buildChoices(shuffle([ans].concat(distractors(ans, 2, 0, max, 2))), ans, reveal);
  // the top row's items past the bottom row's length are what does not pair up
  const rowsEl = $$('.mrow', board);
  const topItems = () => $$('.item', rowsEl[0]), botItems = () => $$('.item', rowsEl[1]);
  const cnt = Coach.once(() => {
    const left = topItems().slice(b);
    left.forEach(x => x.classList.add('coachleft'));
    return Coach.countable(api, left);
  });
  api.coach({
    text: 'ペアに ならない ぶんを かぞえよう',
    say: '上と下をペアにして、ペアにならない分を、数えよう。',
    tool(){ cnt(); },
    walk(){
      const t = topItems();
      return botItems().map((x, i) => ({ at: x, act(){ Coach.pulse([t[i], x]); }, ms: 380 })).concat(cnt().steps());
    }
  });
}

Games.add({
  id: 'add', name: 'たしざん', ico: '➕', world: 'yama', color: 'var(--c-red)', focus: 1.25, fluent: true,
  aim: '「増えた／合わせた」場面を<b>式に置きかえる</b>力。物語→絵→式の順に抽象度を上げるので、記号だけを丸暗記せずに意味とつながります。',
  levels: [
    { t: '5まで', d: 'おはなしで かんがえる', make: api => addStory(api, 5) },
    { t: '10まで', d: 'すこし おおきい かず', make: api => addStory(api, 10) },
    { t: 'しきだけで', d: 'えが なくても できる', make: api => symbolCalc(api, '+', 10, true) }
  ]
});

Games.add({
  id: 'sub', name: 'ひきざん', ico: '➖', world: 'yama', color: 'var(--c-red)', focus: 1.25, fluent: true,
  aim: '「のこりはいくつ」（求残）と「どちらがいくつ多い」（求差）の<b>2つの意味</b>にふれます。求差はつまずきやすいので、1対1に並べて余りを見る経験を早めに。',
  levels: [
    { t: '5まで', d: 'いなくなると のこりは', make: api => subStory(api, 5) },
    { t: '10まで', d: 'すこし おおきい かず', make: api => subStory(api, 10) },
    { t: 'ちがいは いくつ', d: 'くらべて ひきざん', make: api => chance(.5) ? differenceQ(api, 10, true) : symbolCalc(api, '-', 10, true) }
  ]
});
