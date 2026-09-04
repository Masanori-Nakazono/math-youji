/* ===========================================================
   14 — WORLD 5「1ねんせいの きょうしつ」 小学1年生・はじめの単元
   ===========================================================
   This world is shut until the sticker book is full (see `Progress` in 05).

   What goes in it is not "next year's arithmetic brought forward". The first
   weeks of 小学1年生 go back over ground the child has already walked on — and
   ask for the part the 入学前 games never asked for:

   *「同じものの集まり」*  かぞえよう asks how many are there; a 1年生 is asked to
   *make the group first* —「くだものを ぜんぶ」— and only then to count it. The
   number is a property of a set someone decided on, not of whatever happens to be
   on the table. なかまわけ sorts things into given boxes; here the child chooses
   the rule and gathers to it.

   *「1対1対応」*  どっちが おおい is answered by counting both sides. A 1年生 is
   asked to pair them off instead: put one against one, and read the answer off
   what is left over. That is the same operation as 求差 (「いくつ おおい」) and it
   is where ひきざん's second meaning comes from, so it is worth doing with the
   fingers before it is done with a number.

   The other two games are where those two ideas are heading: 20までの かず
   (10 のまとまりと ばら) and しき (putting a story into ＋ and −, and reading a
   ＋ or − back out as a story).
   =========================================================== */
'use strict';

/* ============================================================
   17. なかまづくり — sets: a group made on purpose, then counted
   ============================================================ */

/** Two kinds of thing scattered together. Tap every one of the named kind — and
    only then say how many there were. Counting comes second here on purpose:
    the group has to exist before it has a number. */
function collectSame(api){
  const [kA, kB] = sample(Object.keys(CATS), 2);
  const target = CATS[kA], other = CATS[kB];
  const n = ri(3, 6), m = ri(2, 5);
  api.item('same:' + kA + ':' + n, target.lbl + ' の なかま ' + n + 'こ');
  api.setPrompt(`<b>${target.lbl}</b> の なかまを ぜんぶ タップしよう`,
                `${target.lbl}の仲間を、全部タップしよう。`);

  const items = shuffle(
    sample(target.items, n).map(e => ({ e, hit: true }))
      .concat(sample(other.items, m).map(e => ({ e, hit: false }))));
  const field = el('div.objfield');
  const pts = scatter(items.length);
  const objs = [];
  items.forEach((it, i) => {
    const o = el('div.obj', { style: { left: (pts[i][0] * 100) + '%', top: (pts[i][1] * 100) + '%' } }, it.e);
    o.dataset.hit = it.hit ? '1' : '0';
    objs.push(o);
    field.append(o);
  });
  api.field.append(field);

  let done = 0;
  objs.forEach(o => tappable(o, () => {
    if (api.locked || o.classList.contains('counted')) return;
    if (o.dataset.hit !== '1'){
      o.classList.add('notmine');
      api.later(() => o.classList.remove('notmine'), 460);
      api.wrong(o);
      Sound.say(`それは${target.lbl}の仲間じゃないね。`, { delay: 260 });
      return;
    }
    done++;
    o.classList.add('counted');
    o.append(el('span.tag', { text: String(done) }));
    Sound.sfx.count(done - 1);
    Sound.say(numKana(done), { delay: 0, rate: 1.08 });
    if (done === n) api.later(ask, 640);
  }));

  function ask(){
    api.setPrompt(`あつめた <b>${target.lbl}</b> は ぜんぶで いくつ？`,
                  `集めた${target.lbl}は、全部でいくつ？`);
    api.buildChoices(shuffle([n].concat(distractors(n, 2, 1, n + 3))), n);
  }

  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', { text: target.lbl + 'は ' + target.items.slice(0, 4).join(' ') + ' の なかま' }));
    const left = objs.find(o => o.dataset.hit === '1' && !o.classList.contains('counted'));
    if (left) left.classList.add('glow');
  });
}

/** The same things laid out one kind per row, ends lined up. This is the picture
    graph 1年生 build in「せいり」: once each group is a row, どれが おおい is read
    off the length instead of counted twice. */
function groupChart(api){
  const keys = sample(Object.keys(CATS), ri(2, 3));
  const counts = [];
  keys.forEach(() => {
    let v = ri(2, 7), guard = 0;
    while (counts.indexOf(v) >= 0 && guard++ < 60) v = ri(2, 7);
    counts.push(v);
  });
  const rows = keys.map((k, i) => ({ k, cat: CATS[k], n: counts[i], items: sample(CATS[k].items, counts[i]) }));
  const board = el('div.measure.chartboard');
  const asCount = chance(.45);
  const most = chance(.6);
  const target = asCount ? pick(rows) : null;
  const wantN = asCount ? target.n
    : (most ? Math.max.apply(null, counts) : Math.min.apply(null, counts));

  rows.forEach(r => {
    const row = el('div.mrow', { style: { cursor: asCount ? 'default' : 'pointer' } },
      el('div.cap', { text: r.cat.e }));
    const g = el('div.row', { style: { gap: 'calc(var(--u)*.3)', justifyContent: 'flex-start' } });
    r.items.forEach(e => g.append(el('span.item', { text: e, style: { fontSize: 'calc(var(--u)*2.4)' } })));
    row.append(g);
    row.dataset.n = r.n;
    if (!asCount){
      tappable(row, () => {
        if (api.locked) return;
        if (r.n === wantN){ row.classList.add('correct'); api.correct(); }
        else {
          row.classList.add('wrong');
          api.later(() => row.classList.remove('wrong'), 460);
          api.wrong(row);
        }
      });
    }
    board.append(row);
  });
  api.field.append(board);

  if (asCount){
    api.item('chart:' + target.k + ':' + target.n, target.cat.lbl + ' は ' + target.n + 'こ');
    api.setPrompt(`${target.cat.e} <b>${target.cat.lbl}</b> の なかまは いくつ？`,
                  `${target.cat.lbl}の仲間は、いくつ？`);
    api.buildChoices(shuffle([wantN].concat(distractors(wantN, 2, 1, 9))), wantN);
  } else {
    api.item('chartcmp:' + counts.slice().sort((a, b) => a - b).join('_') + ':' + (most ? 'g' : 'l'),
      counts.slice().sort((a, b) => a - b).join('と') + ' の ' + (most ? 'おおい' : 'すくない') + ' ほう');
    api.setPrompt(most ? 'いちばん <b>おおい</b> なかまは どれ？' : 'いちばん <b>すくない</b> なかまは どれ？',
                  most ? '一番多い仲間は、どれ？' : '一番少ない仲間は、どれ？');
  }
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    $$('.mrow', board).forEach(r => r.append(el('span.ordno', { text: r.dataset.n })));
    api.field.append(el('div.hintline', { text: 'はしを そろえて ながさを くらべよう' }));
  });
}

/** Five things, four of one kind. Naming the one that does not belong means
    holding the rule in mind, which is the other half of making a group. */
function oddOneOut(api){
  const [kA, kB] = sample(Object.keys(CATS), 2);
  const four = sample(CATS[kA].items, 4);
  const odd = pick(CATS[kB].items);
  api.item('odd:' + kA + '_' + kB, CATS[kA].lbl + ' の なかに ' + CATS[kB].lbl);
  api.setPrompt('なかまはずれは どれ？', '仲間はずれは、どれ？');
  api.field.append(el('div.hintline', { text: 'ほかの 4つと ちがう なかまを さがそう' }));
  api.buildChoices(shuffle(four.concat([odd])), odd);
  api.onHint(() => {
    if ($('.hint2', api.field)) return;
    api.field.append(el('div.hintline.hint2', { text: '4つは ' + CATS[kA].lbl + ' の なかまだよ' }));
  });
}

/** No single right answer: the child picks the rule first, then gathers to it.
    Both rules on the table are true of the same pile, so the app cannot be
    "guessed" — it can only be answered by holding one rule and applying it. */
function ownGroup(api){
  const keys = sample(Object.keys(CATS), 3);
  const per = 3;
  api.item('own:' + keys.slice().sort().join('_'), 'じぶんで きめて あつめる');
  api.setPrompt('あつめる なかまを じぶんで えらぼう', '集める仲間を、自分で選ぼう。');

  const picks = [];
  keys.forEach(k => sample(CATS[k].items, per).forEach(e => picks.push({ e, k })));
  const field = el('div.objfield');
  const pts = scatter(picks.length);
  const objs = [];
  shuffle(picks).forEach((p, i) => {
    const o = el('div.obj', { style: { left: (pts[i][0] * 100) + '%', top: (pts[i][1] * 100) + '%' } }, p.e);
    o.dataset.cat = p.k;
    objs.push(o);
    field.append(o);
  });
  api.field.append(field);

  let chosen = null, done = 0;
  keys.forEach(k => {
    const b = el('button.choice.pic', { type: 'button', text: CATS[k].lbl });
    b.addEventListener('click', () => {
      if (api.locked || chosen) return;
      chosen = k;
      Sound.sfx.tap();
      clear(api.choices);
      const cat = CATS[k];
      api.setPrompt(`<b>${cat.lbl}</b> を ぜんぶ あつめよう`, `${cat.lbl}を、全部集めよう。`);
      objs.forEach(o => tappable(o, () => tap(o)));
    });
    api.choices.append(b);
  });

  function tap(o){
    if (api.locked || o.classList.contains('counted')) return;
    if (o.dataset.cat !== chosen){
      o.classList.add('notmine');
      api.later(() => o.classList.remove('notmine'), 460);
      api.wrong(o);
      Sound.say(`それは${CATS[chosen].lbl}の仲間じゃないね。`, { delay: 260 });
      return;
    }
    done++;
    o.classList.add('counted');
    o.append(el('span.tag', { text: String(done) }));
    Sound.sfx.count(done - 1);
    Sound.say(numKana(done), { delay: 0, rate: 1.08 });
    if (done === per){
      api.later(() => {
        api.setPrompt(`${CATS[chosen].lbl} の なかまが <b>${per}</b>こ あつまったね！`,
                      `${CATS[chosen].lbl}の仲間が、${koKana(per)}集まったね。`);
        api.correct({ quiet: true, delay: 1200 });
        UI.bigMark('◯');
      }, 320);
    }
  }

  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', {
      text: chosen ? CATS[chosen].lbl + 'は ' + CATS[chosen].items.slice(0, 4).join(' ')
                   : 'どれでも いいよ。ひとつ えらんでね' }));
    if (chosen){
      const left = objs.find(o => o.dataset.cat === chosen && !o.classList.contains('counted'));
      if (left) left.classList.add('glow');
    }
  });
}

Games.add({
  id: 'g1set', name: 'なかまづくり', ico: '🎒', world: 'kyoshitsu', color: 'var(--c-orange)', stage: 'g1',
  aim: '<b>同じものの集まりを、自分で作ってから数える</b>力。1年生の最初の単元です。「6こ」という数は、机の上にあるもの全部の数ではなく、「くだもの」という<b>まとまりを決めた人がいて、初めて言える数</b>です。かぞえようが「いくつ？」だけを聞いていたのに対し、ここでは集める→数える、の順に進みます。表やグラフの入り口でもあります。',
  levels: [
    { t: 'なかまを あつめる', d: 'あつめてから かぞえる', make: collectSame },
    { t: 'どの なかまが おおい', d: 'ならべて くらべる', make: groupChart },
    { t: 'じぶんで きめる', d: 'なかまはずれ・じぶんで あつめる',
      make: api => chance(.5) ? oddOneOut(api) : ownGroup(api) }
  ]
});

/* ============================================================
   18. 1たい1で くらべる — one-to-one correspondence
   ============================================================ */
/* Two rows, and a pair is made by touching one from each. The pair takes a number
   on both halves, so the correspondence stays visible after the tap — this is the
   線でむすぶ of the textbook, done with a finger.

   Pairing is never wrong. Any top with any bottom is a legitimate pair, so there
   is nothing to guess at here: the question only starts once the pairing runs out
   and the child can see what is left over. */
function pairUp(api, na, nb, onSettled){
  const t1 = pick(THINGS);
  let t2 = pick(THINGS);
  for (let g = 0; g < 40 && t2.e === t1.e; g++) t2 = pick(THINGS);

  const board = el('div.pairboard');
  const rowA = el('div.pairrow'), rowB = el('div.pairrow');
  const made = { a: t1, b: t2, na, nb, pairs: 0, rowA, rowB, board };
  let marked = null, settled = false;

  function itemsOf(row){ return $$('.pairitem', row); }

  function settle(){
    settled = true;
    [rowA, rowB].forEach(r => itemsOf(r).forEach(x => {
      if (!x.classList.contains('paired')) x.classList.add('leftover');
    }));
    if (marked){ marked.classList.remove('marked'); marked = null; }
    onSettled(made);
  }

  function tap(it){
    // once the pairing has run out the board is the answer, not an input: a tap on
    // a leftover must not put a selection ring round it while the question is being read
    if (api.locked || settled || it.classList.contains('paired')) return;
    if (!marked || marked.dataset.side === it.dataset.side){
      if (marked) marked.classList.remove('marked');
      marked = it;
      it.classList.add('marked');
      Sound.sfx.tap();
      return;
    }
    made.pairs++;
    [marked, it].forEach(x => {
      x.classList.remove('marked');
      x.classList.add('paired');
      x.append(el('span.tag', { text: String(made.pairs) }));
    });
    marked = null;
    Sound.sfx.count(made.pairs - 1);
    Sound.say(numKana(made.pairs), { delay: 0, rate: 1.08 });
    if (made.pairs === Math.min(na, nb)) api.later(settle, 620);
  }

  const fill = (row, thing, n, side) => {
    for (let i = 0; i < n; i++){
      const it = el('div.qi.pairitem', { text: thing.e });
      it.dataset.side = side;
      tappable(it, () => tap(it));
      row.append(it);
    }
  };
  fill(rowA, t1, na, 'a');
  fill(rowB, t2, nb, 'b');
  board.append(rowA, el('div.pairgap', { 'aria-hidden': 'true' }), rowB);
  api.field.append(board);

  api.setPrompt(`${t1.e} と ${t2.e} を <b>1つずつ</b> ペアに しよう`,
                `${t1.n}と${t2.n}を、一つずつペアにしよう。`);
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', { text: 'うえを 1つ タップ、つぎに したを 1つ タップ' }));
    const a = itemsOf(rowA).find(x => !x.classList.contains('paired'));
    if (a) a.classList.add('marked');
  });
  return made;
}

/* Each of these three names its item *before* calling pairUp, not inside the
   settle callback: the engine reads the item straight after make() returns, and an
   unnamed question drops out of the shuffle bag and out of 集中練習. */

/** Which row has something left over — including「おなじ」, which is the case a
    child who only ever counts the longer row never meets. */
function pairWhichMore(api){
  const same = chance(.3);
  const na = ri(3, 7);
  let nb = same ? na : clamp(na + pick([1, 2, -1, -2]), 2, 8);
  if (!same && nb === na) nb = na + 1;
  api.item('more:' + Math.min(na, nb) + '_' + Math.max(na, nb),
    na === nb ? na + ' と ' + nb + ' は おなじ'
              : Math.max(na, nb) + ' と ' + Math.min(na, nb) + ' の くらべ');
  pairUp(api, na, nb, made => {
    const A = made.na, B = made.nb;
    const ans = A === B ? 'おなじ' : (A > B ? made.a.e : made.b.e);
    api.setPrompt('ペアに ならなかったのは どっち？　どちらが <b>おおい</b>？',
                  'ペアにならなかったのは、どっち？　どちらが多い？');
    api.buildChoices(shuffle([made.a.e, made.b.e, 'おなじ']), ans);
  });
}

/** 求差. The leftover *is* the difference — the child reads it off the board
    instead of taking one number away from another. */
function pairHowManyMore(api){
  const na = ri(3, 9);
  let nb = clamp(na + pick([1, 2, 3, -1, -2, -3]), 2, 9);
  if (nb === na) nb = na === 9 ? 8 : na + 1;
  api.item('diff1to1:' + Math.max(na, nb) + '-' + Math.min(na, nb),
    Math.max(na, nb) + ' と ' + Math.min(na, nb) + ' の ちがい');
  pairUp(api, na, nb, made => {
    const A = made.na, B = made.nb;
    const big = A > B ? made.a : made.b, ans = Math.abs(A - B);
    api.setPrompt(`${big.e} は いくつ <b>おおい</b>？`, `${big.n}は、いくつ多い？`);
    api.field.append(el('div.eq', null,
      String(Math.max(A, B)), el('span.op', { text: '−' }), String(Math.min(A, B)),
      el('span.op', { text: '＝' }), el('span.box', { text: '?' })));
    api.buildPad(ans);
    api.onHint(() => {
      const left = $$('.pairitem.leftover', made.board);
      left.forEach((x, i) => { if (!$('.tag', x)) x.append(el('span.tag.left', { text: String(i + 1) })); });
    });
  });
}

/** Making the two rows the same length. Same difference, opposite direction:
    「あと いくつ たすと おなじ」 is where 求補 comes from. */
function pairMakeSame(api){
  const big = ri(4, 8), small = clamp(big - ri(1, 3), 1, 7);
  // either row can be the short one: always shortening the bottom row would let a
  // child answer from where the gap is rather than from how big it is
  const flip = chance(.5);
  const na = flip ? small : big, nb = flip ? big : small;
  const byTapping = chance(.5);
  api.item('same1to1:' + big + '-' + small, small + ' を ' + big + ' に そろえる');
  pairUp(api, na, nb, made => {
    const A = made.na, B = made.nb;
    const short = A < B ? made.rowA : made.rowB;
    const shortThing = A < B ? made.a : made.b;
    const need = Math.abs(A - B);
    if (byTapping){
      api.setPrompt(`${shortThing.e} を たして <b>おなじ かず</b>に しよう`,
                    `${shortThing.n}を足して、同じ数にしよう。`);
      let added = 0;
      for (let i = 0; i < need + 2; i++){
        const slot = el('div.cell.tappable.pairslot');
        tappable(slot, () => {
          if (api.locked || slot.dataset.filled === '1') return;
          slot.dataset.filled = '1';
          slot.classList.remove('tappable');
          slot.textContent = shortThing.e;
          added++;
          Sound.sfx.place();
          if (added === need){
            $$('.pairslot', short).forEach(s => { if (s.dataset.filled !== '1') s.remove(); });
            api.later(() => {
              api.setPrompt(`どちらも <b>${Math.max(A, B)}</b>こ。おなじに なったね！`,
                            `どちらも${koKana(Math.max(A, B))}。同じになったね。`);
              api.correct({ quiet: true, delay: 1300 });
              UI.bigMark('◯');
            }, 300);
          }
        });
        short.append(slot);
      }
      api.onHint(() => {
        $$('.pairitem.leftover', made.board).forEach(x => x.classList.add('marked'));
      });
    } else {
      api.setPrompt(`おなじ かずに するには ${shortThing.e} が あと いくつ？`,
                    `同じ数にするには、${shortThing.n}があといくつ？`);
      api.buildPad(need, {
        correctOpts: { delay: 1400 },
        onPick(){
          for (let i = 0; i < need; i++){
            api.later(() => {
              short.append(el('div.qi.pairitem.paired.added', { text: shortThing.e }));
            }, i * 200 + 200);
          }
        }
      });
      api.onHint(() => {
        $$('.pairitem.leftover', made.board).forEach(x => x.classList.add('marked'));
      });
    }
  });
}

Games.add({
  id: 'g1pair', name: '1たい1で くらべる', ico: '🔗', world: 'kyoshitsu', color: 'var(--c-orange)', stage: 'g1',
  aim: '<b>一対一に対応させて</b>、多い少ないと「いくつちがう」を決める力。どっちが おおい は両方を数えて比べますが、1年生は<b>ペアにして、あまりを見る</b>方法を先に習います。この「あまり」がそのまま「ちがいは いくつ」（求差のひきざん）になるので、指でペアを作った経験があるかどうかで、後の 8−5 の意味の理解が変わります。',
  levels: [
    { t: 'ペアに して くらべる', d: 'あまったのは どっち', make: pairWhichMore },
    { t: 'いくつ おおい', d: 'あまりが ちがいの かず', make: pairHowManyMore },
    { t: 'おなじ かずに する', d: 'あと いくつ たりない', make: pairMakeSame }
  ]
});

/* ============================================================
   19. 20までの かず — ten and some more
   ============================================================ */
/* A full ten-frame is one thing, not ten: that is the whole idea of place value,
   and it is the reason 1年生 spend weeks on 11〜20 before touching くり上がり. The
   left frame is never re-counted here — it is always exactly ten. */
function teenFrames(total, opts){
  const o = opts || {};
  const ones = Math.max(0, total - 10);
  const ten = el('div.tenframe.fullten', { style: { '--cols': 5 } });
  for (let i = 0; i < 10; i++) ten.append(el('div.cell', null, el('div.dot')));
  const rest = el('div.tenframe', { style: { '--cols': 5 } });
  for (let i = 0; i < 5; i++){
    const c = el('div.cell' + (i >= ones ? '.hole' : ''));
    if (i < ones) c.append(el('div.dot.b'));
    rest.append(c);
  }
  const set = el('div.frameset', null,
    el('div.framelabel', null, ten, el('small', { text: o.mute ? '' : '10' })),
    el('div.framelabel', null, rest, el('small', { text: o.mute ? '' : String(ones) })));
  return set;
}

function tenAndSome(api){
  const ones = ri(1, 9), total = 10 + ones;
  api.item('teen:' + total, '10と ' + ones + ' で ' + total);
  api.setPrompt(`<b>10</b> と <b>${ones}</b> で いくつ？`, `10と${numKana(ones)}で、いくつ？`);
  api.field.append(teenFrames(total),
    el('div.eq', null, '10', el('span.op', { text: 'と' }), String(ones),
      el('span.op', { text: 'で' }), el('span.box', { text: '?' })));
  api.buildPad(total, { lo: 10, hi: 20 });
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', { text: 'ひだりは かぞえなくて いいよ。ぴったり 10だから、じゅう…' }));
    Sound.say('左は数えなくていいよ。ぴったり10だから、じゅう…', { delay: 200 });
  });
}

/** The other direction: given 14, say how many are left over once ten are taken
    as one group. Reading a teen number as「10と4」is the skill, not saying it. */
function teenSplit(api){
  const total = ri(11, 19), ones = total - 10;
  api.item('teensplit:' + total, total + ' は 10と ' + ones);
  api.setPrompt(`<b>${total}</b> は 10と いくつ？`, `${numKana(total)}は、10といくつ？`);
  api.field.append(teenFrames(total, { mute: true }),
    el('div.eq', null, String(total), el('span.op', { text: 'は' }), '10',
      el('span.op', { text: 'と' }), el('span.box', { text: '?' })));
  api.buildPad(ones, { lo: 0, hi: 10 });
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', { text: 'みぎの わくの あかい ○を かぞえよう' }));
  });
}

/** 12+3, 17−4 — the ten stays whole and only the ones move. This is the last
    step before くり上がり, and the one that makes くり上がり make sense. */
function teenCalc(api){
  const plus = chance(.55);
  const ones = plus ? ri(1, 5) : ri(4, 9);
  const b = plus ? ri(1, 9 - ones) : ri(1, ones - 1);
  const a = 10 + ones, ans = plus ? a + b : a - b;
  api.item((plus ? 'teensum:' : 'teenrest:') + a + (plus ? '+' : '-') + b,
    a + (plus ? ' ＋ ' : ' − ') + b);
  api.setPrompt('しきを みて こたえよう',
                `${numKana(a)}、${plus ? 'たす' : 'ひく'}、${numKana(b)}は？`);
  api.field.append(el('div.eq', null,
    String(a), el('span.op', { text: plus ? '＋' : '−' }), String(b),
    el('span.op', { text: '＝' }), el('span.box', { text: '?' })));
  api.buildPad(ans, { lo: 10, hi: 20 });
  api.onHint(() => {
    if ($('.frameset', api.field)) return;
    api.field.prepend(teenFrames(a, { mute: true }));
    api.field.append(el('div.hintline', {
      text: plus ? '10は そのまま。ばらの ' + ones + ' に ' + b + ' を たそう'
                 : '10は そのまま。ばらの ' + ones + ' から ' + b + ' を ひこう' }));
  });
}

Games.add({
  id: 'g1teen', name: '20までの かず', ico: '🧮', world: 'kyoshitsu', color: 'var(--c-orange)', stage: 'g1',
  fluent: true,
  aim: '<b>10のまとまりと ばら</b>で数をとらえる力。「じゅうさん」と言えることと、13を「10と3」として見られることは別です。ここが入っていると、くり上がりのたし算（9+4）で「10のまとまりを作る」という考え方が通じるようになります。位取りの出発点でもあります。',
  levels: [
    { t: '10と いくつ', d: 'あわせて いくつに なる', make: tenAndSome },
    { t: '10と いくつに わける', d: 'ならびも たしかめる',
      make: api => { if (!chance(.45)) return teenSplit(api);
                     const lo = ri(10, 11); return lineFill(api, lo, lo + 9, 2); } },
    { t: '10いくつの けいさん', d: 'くり上がりの まえに', make: teenCalc }
  ]
});

/* ============================================================
   20. しきに かこう — the story and the sentence
   ============================================================ */
/* たしざん / ひきざん already ask for the answer to a story. 1年生 are asked for
   something else first: which sentence the story *is*. Choosing between 5＋2 and
   5−2 for the same picture, and then reading 5−2 back out as a story, is where
   ＋ and − stop being buttons and start being meanings (合併・増加 / 求残・求差). */
function pickEquation(api){
  const plus = chance(.5);
  const a = ri(2, 7), b = ri(1, Math.min(4, a - 1)), thing = pick(THINGS);
  const ans = (plus ? a + '＋' + b : a + '−' + b);
  api.item((plus ? 'shiki+:' : 'shiki-:') + a + '_' + b,
    a + (plus ? ' ＋ ' : ' − ') + b + ' の しき');
  api.setPrompt(
    plus ? `${thing.e} が ${numTag(a)}つ。${numTag(b)}つ やってきたよ`
         : `${thing.e} が ${numTag(a)}つ。${numTag(b)}つ いなくなるよ`,
    plus ? `${thing.n}が${tsuKana(a)}。${tsuKana(b)}、やってきたよ。`
         : `${thing.n}が${tsuKana(a)}。${tsuKana(b)}、いなくなるよ。`);
  storyScene(api, a, b, plus ? '+' : '-', thing, () => {
    api.setPrompt('この おはなしの <b>しき</b> は どれ？', 'このお話の式は、どれ？');
    // a third option with a different second number, kept inside 1..a-1 so that
    // 「5−6」 never appears on a screen a six-year-old is reading
    const pool = range(1, plus ? 9 - a : a - 1).filter(v => v !== b);
    const other = pool.length ? pick(pool) : b + 1;
    const opts = [ans, (plus ? a + '−' + b : a + '＋' + b), a + (plus ? '＋' : '−') + other];
    api.buildChoices(shuffle(opts), ans);
    api.onHint(() => {
      if ($('.hintline', api.field)) return;
      api.field.append(el('div.hintline', {
        text: plus ? 'ふえた ときは ＋（たす）だよ' : 'へった ときは −（ひく）だよ' }));
    });
  });
}

/* A story in words only. Without a picture to count, ＋ or − has to come from
   what happened — which is the thing that actually transfers to 文章題. */
const WORD_STORIES = [
  { op: '+', t: (a, b, x) => `${x.n}が ${a}こ あります。${b}こ もらいました。`,
    s: (a, b, x) => `${x.n}が${koKana(a)}あります。${koKana(b)}もらいました。`, q: 'ぜんぶで いくつ？' },
  { op: '+', t: (a, b, x) => `${x.n}が ${a}こ。あとから ${b}こ ふえました。`,
    s: (a, b, x) => `${x.n}が${koKana(a)}。あとから${koKana(b)}増えました。`, q: 'ぜんぶで いくつ？' },
  { op: '-', t: (a, b, x) => `${x.n}が ${a}こ あります。${b}こ たべました。`,
    s: (a, b, x) => `${x.n}が${koKana(a)}あります。${koKana(b)}食べました。`, q: 'のこりは いくつ？' },
  { op: '-', t: (a, b, x) => `${x.n}が ${a}こ あります。${b}こ あげました。`,
    s: (a, b, x) => `${x.n}が${koKana(a)}あります。${koKana(b)}あげました。`, q: 'のこりは いくつ？' }
];

function plusOrMinus(api){
  const st = pick(WORD_STORIES);
  const plus = st.op === '+';
  const a = plus ? ri(2, 6) : ri(3, 9);
  const b = plus ? ri(1, 10 - a) : ri(1, a - 1);
  const ans = plus ? a + b : a - b;
  const thing = pick(THINGS);
  api.item((plus ? 'word+:' : 'word-:') + a + '_' + b,
    a + (plus ? ' ＋ ' : ' − ') + b + ' の おはなし');
  api.setPrompt('この おはなしは <b>たしざん</b>？ <b>ひきざん</b>？',
                st.s(a, b, thing) + st.q + '足し算か、引き算か、選ぼう。');
  const card = el('div.storycard', null,
    el('div.e', { text: thing.e }),
    el('div.lines', null,
      el('div.tx', { text: st.t(a, b, thing) }),
      el('div.qx', { text: st.q })));
  api.field.append(card);
  const eq = el('div.eq', null,
    String(a), el('span.op.opbox', { text: '?' }), String(b),
    el('span.op', { text: '＝' }), el('span.box', { text: '?' }));
  api.field.append(eq);
  api.buildChoices(['＋', '−'], plus ? '＋' : '−', {
    onPick(v){
      $('.opbox', eq).textContent = v;
      $('.opbox', eq).classList.add('filled');
      Sound.sfx.place();
      api.later(() => {
        api.setPrompt(st.q, st.q);
        api.buildPad(ans);
      }, 420);
      return false;                    // the operation was only half the question
    }
  });
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', {
      text: plus ? 'ふえた・もらった → ＋' : 'へった・たべた・あげた → −' }));
  });
}

/** The reverse direction: here is 5−2, which story is it about? A child who can
    only run stories forwards has not yet got the sentence. */
function matchStory(api){
  const plus = chance(.5);
  const a = plus ? ri(2, 6) : ri(4, 9);
  const b = plus ? ri(1, 10 - a) : ri(1, a - 2);
  const thing = pick(THINGS);
  let c = b + pick([1, 2]);
  if (!plus && c >= a) c = b - 1 || b + 1;
  api.item((plus ? 'read+:' : 'read-:') + a + '_' + b,
    a + (plus ? ' ＋ ' : ' − ') + b + ' に あう おはなし');
  api.setPrompt(`<b>${a} ${plus ? '＋' : '−'} ${b}</b> の おはなしは どれ？`,
                `${numKana(a)}、${plus ? 'たす' : 'ひく'}、${numKana(b)}のお話は、どれ？`);
  api.field.append(el('div.eq', null,
    String(a), el('span.op', { text: plus ? '＋' : '−' }), String(b)));
  const line = (n, verb) => `${thing.n}が ${a}こ。\n${n}こ ${verb}`;
  const right   = plus ? line(b, 'もらった') : line(b, 'たべた');
  const wrongOp = plus ? line(b, 'たべた')   : line(b, 'もらった');
  const wrongN  = plus ? line(c, 'もらった') : line(c, 'たべた');
  api.buildChoices(shuffle([right, wrongOp, wrongN]), right, {
    cls: 'story',
    // one sentence per line: a narrow button breaks Japanese wherever it likes,
    // and 「た/べた」 across two lines is not something a six-year-old should have
    // to reassemble before they can answer
    render: v => el('span', null, v.split('\n').map((t, i) => i ? [el('br'), t] : t))
  });
  api.onHint(() => {
    if ($('.hintline', api.field)) return;
    api.field.append(el('div.hintline', {
      text: plus ? '＋ は ふえる おはなし。かずも おなじか みてね'
                 : '− は へる おはなし。かずも おなじか みてね' }));
  });
}

Games.add({
  id: 'g1shiki', name: 'しきに かこう', ico: '✍️', world: 'kyoshitsu', color: 'var(--c-orange)', stage: 'g1',
  aim: '場面と式を<b>行き来する</b>力。たしざん・ひきざん が「答えはいくつ」を聞くのに対し、ここは「この話はどの式か」「この式はどの話か」を聞きます。文章題でつまずく子の多くは計算ではなく、この置きかえでつまずきます。増える・もらう＝＋、減る・食べる＝− を、言葉と結びつけておく単元です。',
  levels: [
    { t: 'おはなしの しき', d: 'えを みて ＋か −か', make: pickEquation },
    { t: 'たす？ ひく？', d: 'ことばだけの おはなし', make: plusOrMinus },
    { t: 'しきに あう おはなし', d: 'しきから おはなしを えらぶ', make: matchStory }
  ]
});
