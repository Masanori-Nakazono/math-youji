/* Learn it, then use it: six hands-on adventures after the original 60 levels.
   A medal needs four independent first-try answers in five questions; finishing
   with support is still celebrated but cannot award a medal. */
'use strict';

const TransferAdventure = (() => {
  const QUESTIONS = 5, REQUIRED = 4;
  const missions = [
    { title: 'ピクニックの じゅんび', kind: 'fill', icon: '🧺', thing: '🍎', unit: 'こ',
      place: 'おやつ', reward: stickerFor('transfer:0'), goal: 'たりない ぶんを もってこよう' },
    { title: 'どうぶつバス', kind: 'fill', icon: '🚌', thing: '🐰', unit: 'ひき',
      place: 'バス', reward: stickerFor('transfer:1'), goal: 'あと なんびき のれるかな' },
    { title: 'おやつを わけよう', kind: 'split', icon: '🍓', thing: '🍓', unit: 'こ',
      reward: stickerFor('transfer:2'), goal: 'ふたつの わけかたを つくろう' },
    { title: 'おはなの おくりもの', kind: 'split', icon: '💐', thing: '🌷', unit: 'ほん',
      reward: stickerFor('transfer:3'), goal: 'ちがう わけかたを みつけよう' },
    { title: 'あつまる おはなし', kind: 'add', icon: '🦆', thing: '🦆', unit: 'わ',
      reward: stickerFor('transfer:4'), goal: 'たしざんの おはなしを つくろう' },
    { title: 'とんでいく おはなし', kind: 'sub', icon: '🦋', thing: '🦋', unit: 'ひき',
      reward: stickerFor('transfer:5'), goal: 'ひきざんの おはなしを つくろう' }
  ];
  let node, body, heading, back, speech = '', run = null, question = null, exitArmed = false;
  const key = id => 'transfer:' + id;
  const missionFor = k => /^transfer:[0-5]$/.test(k) ? missions[Number(k.split(':')[1])] : null;

  function progress(){
    const slots = Progress.gateSlots('pre').concat(Progress.gateSlots('g1'));
    const got = slots.filter(k => Store.hasConfirmed(k)).length;
    return { got, total: slots.length };
  }
  function unlocked(){
    if (Store.data.transferReached) return true;
    const p = progress();
    if (!p.total || p.got !== p.total) return false;
    Store.setPref('transferReached', true);
    return true;
  }
  function artwork(k, silhouette){
    const m = missionFor(k);
    if (!m) return null;
    const art = PokemonStickers.artwork(k, { silhouette });
    art.classList.add('transfer-sticker');
    return art;
  }

  function homeCard(){
    if (!unlocked()) return null;
    const got = missions.filter((m, i) => Store.hasSticker(key(i))).length;
    return el('button.home-quest.transfer-home', { type: 'button', onclick: open },
      artwork(key(got < 6 ? got : 0)), el('span', null,
        el('strong', { text: 'つかってみよう！ さんすうの ぼうけん' }),
        el('small', { text: 'つくる・わける・おはなしにする　とくべつな シール ' + got + '／6' })),
      el('span', { text: '▶', 'aria-hidden': 'true' }));
  }
  function collection(){
    if (!unlocked() && !missions.some((m, i) => Store.hasSticker(key(i)))) return null;
    return el('section.transfer-collection', { 'aria-label': 'とくべつな ぼうけんシール' },
      el('h3', { text: '✦ とくべつな ぼうけんシール' }),
      el('p', { text: '５もんのうち ４もんを、ヒントなしで さいしょから できた しるし。' }),
      el('div.transfer-collection-grid', null, missions.map((m, i) => el('button.transfer-collectible', {
        type: 'button', onclick(){ Store.hasSticker(key(i)) ? StickerWorld.open(key(i)) : open(); }
      }, artwork(key(i), !Store.hasSticker(key(i))), el('span', { text: m.title })))));
  }
  function parentSummary(){
    const rows = Object.entries(Store.data.transferRecords || {}).filter(([i]) => /^[0-5]$/.test(i));
    if (!rows.length) return null;
    return el('section.section.transfer-parent', null,
      el('h3', { text: '学んだことを使う冒険' }),
      el('p', { text: '特別シールは５問中４問をヒントなしで初回正解したときに獲得します。各冒険の直近の取り組みを記録します。旧条件で獲得したシールは、３問すべて初回正解だった場合だけ残します。' }),
      rows.map(([i, r]) => el('p', { text: missions[Number(i)].title + '：自力で初回正解 ' + r.independent
        + '問／答え直して正解 ' + r.revised + '問／ヒント・見本を使用 ' + r.supported
        + '問（' + (r.independent + r.revised + r.supported) + '問中）' })));
  }
  function say(text){ speech = text; Sound.say(text, { delay: 80 }); }
  function button(text, fn, className){
    return el('button.btn.' + (className || 'btn-ghost'), { type: 'button', text,
      onclick(){ exitArmed = false; Sound.sfx.tap(); fn(); } });
  }
  function build(){
    if (node) return;
    body = el('div.transfer-body');
    heading = el('h2');
    back = el('button.btn.btn-ghost.btn-round', { type: 'button', text: '←' });
    back.setAttribute('aria-label', 'もどる');
    back.addEventListener('click', () => {
      if (run && !exitArmed){
        exitArmed = true;
        let note = $('.transfer-exit', body);
        if (!note){ note = el('p.transfer-exit', { role: 'status' }); body.prepend(note); }
        note.textContent = 'ここで おわる？ ← を もういちど おすと もどるよ（つぎは１もんめから）';
        say('ここでおわる？ もどるをもう一度押すと、つぎは１問目からだよ。');
      } else if (run){ run = null; menu(); }
      else { Home.render(); UI.show('home', { replace: true }); }
    });
    node = el('div#transfer', null, el('div.topbar', null, back, heading, speakBtn(() => speech)), body);
    UI.register('transfer', node);
  }
  function menu(){
    exitArmed = false; run = null; clear(body);
    heading.textContent = 'さんすうの ぼうけん';
    body.append(el('div.transfer-intro', null, el('span.transfer-eyebrow', { text: 'ぜんぶ クリアした きみへ' }),
      el('h3', { text: 'できることを、つかってみよう。' }),
      el('p', { text: 'ひとつの ぼうけんは ５もん。４もんを じぶんで できたら、とくべつな シール！ ヒントも つかえるよ。' })));
    const cards = el('div.transfer-map');
    missions.forEach((m, i) => cards.append(el('button.transfer-card', { type: 'button',
      dataset: { mission: i }, onclick(){ start(i); }
    }, artwork(key(i)), el('span.transfer-card-title', { text: m.title }),
      el('span.transfer-card-goal', { text: m.goal }),
      el('span.transfer-card-status', { text: Store.hasSticker(key(i)) ? '✓ シール ゲット！　もういちど ▶' : '５もんちゅう ４もんで シール ▶' }))));
    body.append(cards);
    say('できることを使ってみよう。好きな冒険をえらんでね。５問のうち４問を、ヒントなしで初めから正しくできると、特別なシールがもらえるよ。');
  }
  function open(){
    if (!unlocked()) return;
    build(); UI.show('transfer'); menu();
  }
  function start(id){
    if (!unlocked() || !missions[id]) return;
    build(); UI.show('transfer');
    run = { id, step: 0, results: [] };
    nextQuestion();
  }
  function nextQuestion(){
    const m = missions[run.id];
    const total = ri(6, 10), a = ri(2, total - 2);
    question = { total, a, b: total - a, value: 0, phase: 0, left: 0, previous: null,
      supported: false, mistakes: 0, done: false, subject: m.thing };
    if (m.kind === 'split') question.left = total;
    if (m.kind === 'sub') { question.a = total; question.b = ri(2, total - 2); }
    exitArmed = false;
    renderQuestion(); say(prompt());
  }
  function prompt(){
    const m = missions[run.id], q = question;
    if (m.kind === 'fill') return (run.id === 1 ? 'バスに ' + q.a + 'ひき のっているよ。' : 'おやつが ' + q.a + 'こ あるよ。')
      + q.total + m.unit + 'に なるように、' + (run.id === 1 ? 'のせてね。' : 'もってこよう。');
    if (m.kind === 'split') return q.total + m.unit + 'を、ふたりに わけよう。' + (q.previous === null
      ? 'どちらにも １ついじょう あげてね。' : 'こんどは ちがう わけかた！ おさらに のったものを タップして うごかそう。');
    return q.a + (m.kind === 'add' ? ' ＋ ' : ' − ') + q.b + ' の おはなしを つくろう。'
      + (q.phase === 0 ? 'はじめに いる かずを ならべてね。'
        : m.kind === 'add' ? 'つぎに あそびにくる かずを うごかそう。' : 'つぎに とんでいく かずを うごかそう。');
  }
  function objects(n, symbol){
    return Array.from({ length: n }, () => el('span.transfer-object', { text: symbol, 'aria-hidden': 'true' }));
  }
  function feedback(text){
    $('.transfer-feedback', body).textContent = text; say(text);
  }
  function renderQuestion(){
    const focusLabel = body.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    clear(body); body.scrollTop = 0;
    const m = missions[run.id], q = question;
    heading.textContent = m.title;
    body.append(el('div.transfer-progress', { text: '●'.repeat(run.step) + '○'.repeat(QUESTIONS - run.step), 'aria-label': (run.step + 1) + 'もんめ／５もん' }),
      el('h3.transfer-prompt', { text: prompt() }));
    const scene = el('div.transfer-scene');
    if (m.kind === 'fill'){
      scene.append(el('p', { text: 'ぜんぶで ' + q.total + m.unit + 'に しよう' }),
        el('div.transfer-items', { 'aria-label': 'はじめから ' + q.a + m.unit + '、もってきた ' + q.value + m.unit },
          objects(q.a, m.thing), objects(q.value, m.thing).map(n => { n.classList.add('brought'); return n; })),
        el('p', { text: 'もってきた：' + q.value + m.unit }), controls(q.total));
    } else if (m.kind === 'split'){
      if (q.previous !== null) scene.append(el('p.transfer-memory', { text: 'さっきは ' + q.previous + ' と ' + (q.total - q.previous) + '。いれかえるだけではない わけかたに しよう。' }));
      const plates = el('div.transfer-plates');
      [q.left, q.total - q.left].forEach((n, side) => {
        const items = el('div.transfer-items', null, Array.from({ length: n }, () => el('button.transfer-piece', {
          type: 'button', text: m.thing, 'aria-label': (side === 0 ? 'くまさん' : 'うさぎさん') + 'に １つ うつす',
          onclick(){ if (q.done) return; exitArmed = false; q.left += side === 0 ? -1 : 1; Sound.sfx.tap(); renderQuestion(); }
        })));
        plates.append(el('div.transfer-plate', null,
          el('strong', { text: (side === 0 ? '🐰 うさぎさん' : '🐻 くまさん') + '　' + n + m.unit }), items));
      });
      scene.append(plates, el('p', { text: 'うごかしたいものを タップしてね' }));
    } else {
      if (!q.phase){
        const subjects = m.kind === 'add' ? ['🦆', '🐰', '🐤'] : ['🦋', '🐦', '🐝'];
        scene.append(el('div.transfer-subjects', null, el('span', { text: 'だれの おはなし？' }),
          subjects.map((s, i) => el('button.btn.btn-ghost', { type: 'button', text: s,
            'aria-label': (m.kind === 'add' ? ['あひる', 'うさぎ', 'ひよこ'] : ['ちょうちょ', 'とり', 'はち'])[i] + 'の おはなし',
            'aria-pressed': String(q.subject === s), onclick(){ q.subject = s; renderQuestion(); } }))));
      }
      const count = !q.phase ? q.value : m.kind === 'add' ? q.a + q.value : q.a - q.value;
      scene.append(el('div.transfer-items', { 'aria-label': 'いま ' + count }, objects(count, q.subject)));
      if (q.phase && m.kind === 'sub') scene.append(el('div.transfer-departed', null, 'とんでいった → ', objects(q.value, q.subject)));
      scene.append(el('p', { text: (q.phase ? (m.kind === 'add' ? 'あそびにきた：' : 'とんでいった：') : 'はじめに：') + q.value }),
        controls(!q.phase ? 10 : m.kind === 'sub' ? q.a : 10 - q.a));
    }
    body.append(scene, el('p.transfer-feedback', { role: 'status', 'aria-live': 'polite' }),
      el('div.transfer-actions', null, button('👀 ヒント', hint),
        button('できた！ たしかめる', check, 'btn-accent.transfer-check')));
    if (focusLabel){
      const replacement = $$('button', body).find(b => b.getAttribute('aria-label') === focusLabel && !b.disabled);
      if (replacement) replacement.focus({ preventScroll: true });
    }
  }
  function controls(max){
    return el('div.transfer-controls', null,
      el('button.btn.btn-ghost', { type: 'button', text: '−１', 'aria-label': '１つ もどす', disabled: question.value === 0,
        onclick(){ if (question.done) return; exitArmed = false; question.value--; renderQuestion(); } }),
      el('button.btn.btn-ghost', { type: 'button', text: '＋１', 'aria-label': '１つ うごかす', disabled: question.value >= max,
        onclick(){ if (question.done) return; exitArmed = false; question.value++; renderQuestion(); } }));
  }
  function hint(){
    question.supported = true;
    const m = missions[run.id], q = question;
    let text;
    if (m.kind === 'fill') text = 'はじめの ' + q.a + ' から、' + q.total + ' まで、１つずつ ふやしてみよう。';
    else if (m.kind === 'split') text = q.previous === null
      ? 'おさらの １つを タップすると、もうひとつの おさらに うつるよ。'
      : 'どちらも からっぽに せず、さっきと ちがう かずに してみよう。';
    else text = !q.phase ? 'しきの はじめの ' + q.a + ' が、さいしょに いる かずだよ。'
      : (m.kind === 'add' ? '＋は あそびにくる かず。' : '−は とんでいく かず。') + q.b + ' かい、＋１を おしてみよう。';
    feedback(text);
    if (!$('.transfer-example', body)) $('.transfer-actions', body).append(button('いっしょに つくる', example, 'btn-ghost.transfer-example'));
  }
  function example(){
    question.supported = true;
    const m = missions[run.id], q = question;
    if (m.kind === 'split'){
      q.left = Array.from({ length: q.total - 1 }, (_, i) => i + 1).find(n => q.previous === null
        || Math.min(n, q.total - n) !== Math.min(q.previous, q.total - q.previous));
    } else q.value = m.kind === 'fill' ? q.total - q.a : q.phase ? q.b : q.a;
    renderQuestion();
    feedback(m.kind === 'split' ? q.left + ' と ' + (q.total - q.left) + ' に わけたよ。ならびを みて、たしかめよう。'
      : q.value + ' うごかしたよ。ならびを みて、たしかめよう。');
  }
  function check(){
    const m = missions[run.id], q = question;
    if (q.done) return;
    let correct, message;
    if (m.kind === 'fill'){
      correct = q.a + q.value === q.total;
      message = correct ? q.a + ' と ' + q.value + ' で ' + q.total + '。そろったね！'
        : 'いまは ' + (q.a + q.value) + '。' + q.total + ' に なるように、ふやしたり もどしたり してみよう。';
    } else if (m.kind === 'split'){
      correct = q.left > 0 && q.left < q.total;
      if (correct && q.previous !== null) correct = Math.min(q.left, q.total - q.left) !== Math.min(q.previous, q.total - q.previous);
      message = correct ? q.total + ' を、ちがう ふたつの わけかたに できたね！'
        : q.left === 0 || q.left === q.total ? 'ふたりとも １ついじょう もらえるように してみよう。'
          : 'それは さっきと おなじ くみあわせだね。べつの かずに わけてみよう。';
      if (correct && q.previous === null){
        q.previous = q.left; renderQuestion(); feedback('ひとつ できたね！ こんどは べつの わけかたを つくろう。'); return;
      }
    } else {
      correct = q.value === (q.phase ? q.b : q.a);
      const unit = ['🦆', '🐤', '🐦'].includes(q.subject) ? 'わ' : 'ひき';
      message = correct ? 'はじめに ' + q.a + unit + ' いて、' + q.b + unit
        + (m.kind === 'add' ? ' あそびにきたよ。' : ' とんでいったよ。')
        + q.a + (m.kind === 'add' ? ' ＋ ' : ' − ') + q.b + ' ＝ ' + (m.kind === 'add' ? q.a + q.b : q.a - q.b)
        + '。おはなしが できたね！' : 'しきの ' + (q.phase ? 'ふたつめ' : 'はじめ') + 'の かずを みて、うごかしてみよう。';
      if (correct && !q.phase){ q.phase = 1; q.value = 0; renderQuestion(); say(prompt()); return; }
    }
    if (!correct){
      q.mistakes++; feedback(message);
      if (q.mistakes >= 2) hint();
      return;
    }
    q.done = true;
    run.results.push(q.supported ? 'supported' : q.mistakes ? 'revised' : 'independent');
    Store.countToday(1);
    $$('.transfer-scene button', body).forEach(b => { b.disabled = true; });
    feedback(message);
    const actions = clear($('.transfer-actions', body));
    actions.append(button(run.step === QUESTIONS - 1 ? 'けっかを みる ✦' : 'つぎへ ▶', () => {
      if (++run.step === QUESTIONS) finish(); else nextQuestion();
    }, 'btn-accent.transfer-next'));
  }
  function finish(){
    const id = run.id, m = missions[id], results = run.results;
    const record = { day: Store.dayNumber(), independent: 0, revised: 0, supported: 0 };
    results.forEach(r => record[r]++);
    Store.setPref('transferRecords', Object.assign({}, Store.data.transferRecords, { [id]: record }));
    const passed = record.independent >= REQUIRED;
    const fresh = passed && Store.addSticker(key(id));
    const owned = Store.hasSticker(key(id));
    Store.flush(); run = null; clear(body);
    const done = missions.filter((m, i) => Store.hasSticker(key(i))).length;
    heading.textContent = '５もん やりとげたね！';
    body.append(el('div.transfer-result', null, artwork(key(id), !owned),
      el('h3', { text: fresh ? 'とくべつな シール ゲット！' : passed ? 'もういちど できたね！' : 'さいごまで できたね！' }),
      el('p', { text: 'じぶんで できたよ：' + record.independent + '／' + QUESTIONS + 'もん' }),
      el('p', { text: owned ? m.reward + '　とくべつな シール ' + done + '／6'
        : '４もん できたら「' + m.reward + '」の シールが もらえるよ' }),
      el('p', { text: owned && done === 6 ? '６つの ぼうけんの シールが ぜんぶ そろったね！'
        : passed ? '「' + m.title + '」を じぶんで できたね。'
          : 'ヒントを つかっても だいじょうぶ。べつのひに また やってみよう。' }),
      el('div.transfer-actions', null,
        owned ? button('じぶんの しまに かざる', () => StickerWorld.open(key(id)), 'btn-accent')
          : button('もういちど あそぶ', () => start(id), 'btn-accent'),
        button('きょうは ここまで', () => { Home.render(); UI.show('home'); }),
        button('ぼうけんを えらぶ', menu))));
    if (fresh) UI.confetti(45);
    say(fresh ? m.reward + 'の、特別なシールをもらったよ！自分の島に飾れるよ。'
      : passed ? '５問中' + record.independent + '問、じぶんでできたね！'
        : '５問やりとげたね。自分でできたのは' + record.independent + '問だよ。４問できたらシールがもらえるよ。');
  }
  return { open, homeCard, collection, artwork, missionFor, parentSummary, unlocked, progress };
})();
