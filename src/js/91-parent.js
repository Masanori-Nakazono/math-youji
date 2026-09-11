/* ===========================================================
   91 — おうちのかたへ (parent area): progress, why it matters, settings
   =========================================================== */
'use strict';

const Parent = (() => {
  let gateNode, sheetNode, sheetInner, justReset = false, afterGate = null;
  let persistState = '確認中';
  let lastBackupMsg = null;   // survives the re-render that a successful import triggers
  let a = 0, b = 0, want = 0;

  /* ---- adult gate ----
     One four-way question with no wait let a child through by tapping: 25% a tap,
     94% within ten taps, and the mission's「できた」button gave them every reason to
     try. Behind it are「記録をすべて消す」and「1年生を開く」. Two right answers in a
     row, and a wait after a miss, put a random tapper at 1 in 16 per run and at
     five seconds a run — slow enough to stop being a game. An adult who knows the
     answer is through in two taps. */
  const GATE_RUN = 2, GATE_WAIT_S = 5;
  let streak = 0, waitTimer = null;
  function buildGate(){
    if (gateNode) return gateNode;
    const q = el('div.q');
    const choices = el('div.choices');
    const step = el('div.hint.gatestep', { 'aria-live': 'polite' });
    function roll(){
      clearTimeout(waitTimer); waitTimer = null;
      a = ri(12, 19); b = ri(3, 9); want = a * b;
      q.textContent = a + ' × ' + b + ' = ?';
      step.textContent = (streak + 1) + ' / ' + GATE_RUN + ' もんめ';
      clear(choices);
      const opts = shuffle([want, want + ri(3, 9), want - ri(3, 9), want + ri(10, 20)]);
      opts.forEach(v => choices.append(el('button.choice', {
        type: 'button', text: String(v),
        onclick(e){
          if (waitTimer) return;
          if (v === want){
            Sound.sfx.correct();
            if (++streak < GATE_RUN){ roll(); return; }
            streak = 0;
            const next = afterGate;
            afterGate = null;
            if (next) next();
            else { render(); UI.show('parent'); }
            return;
          }
          streak = 0;
          e.currentTarget.classList.add('wrong');
          Sound.sfx.wrong();
          $$('.choice', choices).forEach(x => { x.disabled = true; });
          let left = GATE_WAIT_S;
          const tick = () => {
            if (left <= 0){ roll(); return; }
            step.textContent = 'ちがいます。' + left + 'びょう まってください';
            left--;
            waitTimer = setTimeout(tick, 1000);
          };
          tick();
        }
      })));
    }
    gateNode = el('div#gate', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); clearTimeout(waitTimer); waitTimer = null; UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'おうちの かたへ' })),
      el('div.gate', null,
        el('div.hint', { text: 'おとなの かた だけが すすめます。けいさんの こたえを ' + GATE_RUN + 'もん つづけて えらんで ください。' }),
        step, q, choices));
    UI.register('gate', gateNode);
    gateNode._roll = roll;
    return gateNode;
  }

  /** An iPhone/iPad in a Safari tab — not the home-screen app, not a file:// copy. */
  function inSafariTab(){
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS asks for the desktop site
    const standalone = navigator.standalone === true
      || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone && /^https?:$/.test(location.protocol);
  }

  function open(onSuccess){
    buildGate();
    afterGate = typeof onSuccess === 'function' ? onSuccess : null;
    streak = 0;
    gateNode._roll();
    UI.show('gate');
  }

  /* ---- dashboard ---- */
  function buildSheet(){
    if (sheetNode) return sheetNode;
    sheetInner = el('div.sheet-inner');
    sheetNode = el('div#parent', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'おうちの かたへ' })),
      el('div.sheet', null, sheetInner));
    return UI.register('parent', sheetNode);
  }

  const pct = v => v == null ? '—' : Math.round(v * 100) + '%';
  const secs = ms => ms == null ? '—' : (ms / 1000).toFixed(1) + '秒';

  function progressSection(){
    const sec = el('section');
    sec.append(el('div.eyebrow', { text: 'progress' }), el('h3', { text: 'ここまでのようす' }));
    const t = el('table.skilltable');
    t.append(el('thead', null, el('tr', null,
      el('th', { text: '遊び' }), el('th', { text: '到達' }),
      el('th', { class: 'n', text: '★' }),
      el('th', { class: 'n', text: '直近30問' }),
      el('th', { class: 'n', text: 'こたえるまで' }),
      el('th', { class: 'n', text: '通算' }),
      el('th', { class: 'n', text: '問題数' }))));
    const body = el('tbody');
    WORLDS.forEach(w => {
      const games = Games.list.filter(g => g.world === w.id);
      if (!games.length || ((w.stage || 'pre') !== 'pre' && !Progress.g1Open())) return;
      body.append(el('tr', null, el('td', { colspan: 7, style: { color: w.color, fontWeight: 800, paddingTop: 'calc(var(--u)*.8)' }, text: w.name })));
      games.forEach(g => {
        const s = Store.gameStars(g.id, g.levels.length);
        const max = g.levels.length * 3;
        const now = Store.gameRecentAccuracy(g.id, g.levels.length);   // the one to act on
        const acc = Store.accuracy(g.id);                              // lifetime, for context
        const seen = Store.data.seen[g.id] || 0;
        /* The second axis. 「1回目で正解」cannot separate a child who remembers
           「10は4と6」from one who counted the six empty cells for nine seconds —
           and only the first of those is what くり上がり needs. */
        const ms = g.fluent ? Store.gameSpeed(g.id) : null;
        const slowNow = ms != null && ms >= FLUENT_SLOW_MS;
        const fastNow = ms != null && ms <= FLUENT_FAST_MS;
        body.append(el('tr', null,
          el('td', { text: g.name }),
          el('td', null, el('div.bar', null, el('i', { style: { width: (max ? (s / max) * 100 : 0) + '%',
            background: now != null && now < .6 ? 'var(--oops)' : 'var(--good)' } }))),
          el('td', { class: 'n', text: s + '/' + max }),
          el('td', { class: 'n', style: { color: now != null && now < .6 ? 'var(--oops-ink)' : null, fontWeight: 800 }, text: pct(now) }),
          // amber, not the warning red: counting it out is where most children are at five
          el('td', { class: 'n', style: { color: slowNow ? 'var(--accent-ink)' : fastNow ? 'var(--good-ink)' : 'var(--ink-soft)',
                                          fontWeight: slowNow || fastNow ? 800 : 500 },
                     text: g.fluent ? secs(ms) : '—' }),
          el('td', { class: 'n', style: { color: 'var(--ink-soft)' }, text: pct(acc) }),
          el('td', { class: 'n', text: String(seen) })));
      });
    });
    t.append(body);
    sec.append(el('div', { style: { overflowX: 'auto' } }, t));
    sec.append(el('p', { style: { marginTop: 'calc(var(--u)*.8)' },
      text: '「直近30問」「通算」はどちらも「1回目のタップで正解した割合」です。判断に使うのは直近30問のほうです。通算は開始以来の平均なので、1か月目に苦戦した記録がいつまでも分母に残り、いま伸びていることも、いまつまずき始めたことも映しません。直近が60%を下回っている遊びは赤で出ます。' }));
    sec.append(el('p', {
      text: '「こたえるまで」は、けいさんの やま の4つの遊びだけに出ます。問題が出てから最初に答えるまでの時間で、正解だったときだけ記録しています。3.0秒までなら緑（思い出している）、9.0秒を超えると茶色（数えて出している）。正答率だけを見ていると「できている」と「数えればできる」が同じ数字になりますが、くり上がりの計算で効くのは前者だけです。茶色はこの時期には自然な段階で、まちがいではありません。次は「かたまりで見る」練習がいちばん効きます（下の「できるけれど、数えている」）。' }));
    return sec;
  }

  /* ---- 今週やること ----
     The dashboard used to be a table plus an essay, and deciding what the child
     should practise was left entirely to the reader. The app has the data. */
  function nextUpSection(){
    const sec = el('section');
    sec.append(el('div.eyebrow', { text: 'next' }), el('h3', { text: '今週やること' }));

    /* One question answered wrong is not a diagnosis. Nothing is named here until
       there is a level's worth of evidence behind it. */
    const ENOUGH = 8;
    const levels = [];
    Games.list.forEach(g => g.levels.forEach((lv, i) => {
      if (!levelOpen(g, i)) return;
      const n = Store.recentCount(g.id, i);
      if (n < ENOUGH) return;
      levels.push({ g, lv, i, n, acc: Store.recentAccuracy(g.id, i), cold: Store.daysSince(g.id, i) });
    }));

    if (!levels.length){
      sec.append(el('p', { text: '判断できるだけの回数がまだありません（1レベル＝8問を、どれか1つ最後まで）。「かずの しま」の《かぞえよう》から始めてください。1日1レベルで十分です。' }));
      return sec;
    }

    const focus = levels.slice().sort((a, b) => a.acc - b.acc)[0];
    const stale = levels.slice()
      .filter(x => x.acc >= .75 && x.cold >= 7)
      .sort((a, b) => b.cold - a.cold)[0];

    const line = (mark, head, body2) => el('div.todo', null,
      el('div.mk', { text: mark }),
      el('div', null, el('b', { text: head }), el('div', { text: body2 })));

    if (focus.acc < .75){
      sec.append(line('◎', focus.g.name + '　《' + focus.lv.t + '》',
        '直近' + focus.n + '問の初回正答率 ' + pct(focus.acc) + '。ここを中心に、1日1回。8問を最後までやりきれば十分です。'));
    } else {
      /* Levels are judged on eight questions or more, facts on two misses — so a page
         could say「よく仕上がっています」and list three gaps directly under it. Say
         only what both halves agree on. */
      const facts0 = Store.data.facts || {};
      const gaps = Object.keys(facts0).some(k => {
        const f = facts0[k];
        return f && (f[0] - f[1]) >= 2 && f[1] / f[0] < .6;
      });
      sec.append(line('◎', focus.g.name + '　《' + focus.lv.t + '》',
        '直近' + focus.n + '問で ' + pct(focus.acc) + '。' + (gaps
          ? 'レベルとしては安定しています。次のレベルに進みながら、下の「つまずいている中身」だけを「とっくん」で拾ってください。'
          : 'いちばん低いところがこれなら、よく仕上がっています。次のレベルに進んで構いません。')));
    }
    // what that game is actually for — the one place a parent is most likely to read it
    if (focus.g.aim) sec.append(el('div.aimnote', { html: focus.g.aim }));
    if (stale && stale !== focus){
      sec.append(line('○', stale.g.name + '　《' + stale.lv.t + '》',
        stale.cold + '日ふれていません。できていたことなので、思い出す時間として1回だけ。'));
    }

    /* the exact facts that are missing — the thing a per-game percentage can never say */
    const facts = Store.data.facts || {};
    const weak = [];
    for (const k in facts){
      const f = facts[k];
      // "missed it at least twice", not "missed it once" — one slip is not a gap
      if (!f || (f[0] - f[1]) < 2) continue;
      const acc = f[1] / f[0];
      if (acc >= .6) continue;
      const gid = k.slice(0, k.indexOf(':'));
      weak.push({ acc, n: f[0], label: f[3] || k, game: (Games.byId[gid] || {}).name || gid,
                  miss: Store.factMiss(k) });
    }
    weak.sort((a, b) => a.acc - b.acc || b.n - a.n);
    if (weak.length){
      sec.append(el('h4', { text: 'つまずいている中身' }));
      const chips = el('div.factchips');
      weak.slice(0, 8).forEach(w => chips.append(
        el('span.factchip', null, el('small', { text: w.game }), w.label,
          w.miss ? el('em', { text: missParent(w.miss.kind) }) : null)));
      sec.append(chips);
      sec.append(el('p', { text: 'ここに出た項目は「きょうの れんしゅう」が自動で多めに出します。声かけに使うなら、答えを教えるより、おはじきやお菓子で同じ数を作ってみせるほうが早いです。' }));
    } else {
      sec.append(el('p', { style: { marginTop: 'calc(var(--u)*.8)' },
        text: '取りこぼしている項目はいまのところありません。' }));
    }

    sec.append(missSection());

    /* Right every time, and still counted out. Invisible to every number on this
       page until answers were timed, and the single most useful thing to work on
       once the accuracy is already there. */
    const slowOnes = [];
    for (const k in facts){
      const f = facts[k];
      if (!f || !f[0] || !f[5] || f[5] < FLUENT_SLOW_MS) continue;
      if (f[1] / f[0] < .6) continue;                 // already named above
      const gid = k.slice(0, k.indexOf(':'));
      slowOnes.push({ ms: f[5], label: f[3] || k, game: (Games.byId[gid] || {}).name || gid });
    }
    slowOnes.sort((a, b) => b.ms - a.ms);
    if (slowOnes.length){
      sec.append(el('h4', { text: 'できるけれど、数えている' }));
      const chips = el('div.factchips');
      slowOnes.slice(0, 8).forEach(w => chips.append(
        el('span.factchip.slow', null, el('small', { text: w.game + '　' + secs(w.ms) }), w.label)));
      sec.append(chips);
      sec.append(el('p', { text: '正解はしていますが、答えが出るまでに時間がかかっています。指を折る、枠のマスを数える、というやり方で合わせている状態です。まちがいではないので放っておかれがちですが、くり上がりのたし算は「9+4 を 9+1+3 にする」途中でこの答えを即座に使うので、ここが遅いとその先が進みません。「とっくん」はこれらも拾います。家では、答えを急がせるより、おはじきを5と5、6と4 のように置いて見せて「かたまりで見る」経験を足すほうが早いです。' }));
    }
    return sec;
  }

  /* ---- まちがえ方の型 ----
     A percentage says how often. It cannot say that the same child answers「10は4と
     いくつ」with 4 — reading back the part they can see — and that the fix is to
     cover the four rather than to drill the fact. The app throws away nothing now:
     the value pressed on the first mistake is classified and counted (06-miss.js),
     so this is the one place on the page that says what to actually do. */
  function missSection(){
    const facts = Store.data.facts || {};
    const tally = {};                   // kind -> { n, games:Set, examples:[] }
    let taught = 0;
    for (const k in facts){
      const m = facts[k] && facts[k][6];
      if (!m) continue;
      const gid = k.slice(0, k.indexOf(':'));
      const gname = (Games.byId[gid] || {}).name || gid;
      for (const kind in m){
        if (kind === 'taught'){ taught += m[kind]; continue; }
        if (MISS_DIAGNOSTIC.indexOf(kind) < 0) continue;
        const t = tally[kind] || (tally[kind] = { n: 0, games: {}, examples: [] });
        t.n += m[kind];
        t.games[gname] = true;
        if (t.examples.length < 3) t.examples.push(facts[k][3] || k);
      }
    }
    const kinds = Object.keys(tally).filter(k => tally[k].n >= 3)
      .sort((a, b) => tally[b].n - tally[a].n);
    if (!kinds.length && !taught) return el('span', { hidden: true });

    const s = el('div');
    s.append(el('h4', { text: 'まちがえ方の型' }));
    if (kinds.length){
      s.append(el('p', { text: '同じ「不正解」でも中身は違います。1回目に押した答えを分類して数えたものです。正答率だけを見ていても出てこない情報で、家庭での声かけを変えられるのはここです。' }));
      const list = el('div.misslist');
      kinds.forEach(k => {
        const t = tally[k];
        list.append(el('div.missrow', null,
          el('b', { text: missParent(k) }),
          el('span.n', { text: 'のべ ' + t.n + '回' }),
          el('small', { text: Object.keys(t.games).join('・') + '　例：' + t.examples.join('、') })));
      });
      s.append(list);
    }
    if (taught){
      s.append(el('p', { style: { marginTop: 'calc(var(--u)*.7)' },
        text: '※ 自力では届かず、アプリが答えを見せて終えた回が ' + taught
            + ' 回あります（6回まちがえると出ます）。★にも「1回目で正解」にも数えていません。'
            + 'この回の項目は「とっくん」が必ず拾います。' }));
    }
    return s;
  }

  /* ---- なぜこの遊びなのか ----
     Every game carries an `aim`: a short piece on the thing it is for. All fifteen
     were written, the README says they appear here, and nothing ever rendered
     them — a page of reasoning that no parent could reach. */
  function aimsSection(){
    const sec = el('section');
    sec.append(el('div.eyebrow', { text: 'why each game' }),
      el('h3', { text: 'それぞれの遊びで つく ちから' }),
      el('p', { text: '「うちの子はこれをやって何が身につくのか」への答えです。上の表で数字が低い遊びがあったら、まずここを読んでから、下の「おうちでできること」を試してみてください。' }));
    WORLDS.forEach(w => {
      const games = Games.list.filter(g => g.world === w.id && g.aim);
      if (!games.length || ((w.stage || 'pre') !== 'pre' && !Progress.g1Open())) return;
      sec.append(el('h4', { text: w.name, style: { color: w.color } }));
      const list = el('div.aimlist');
      games.forEach(g => list.append(el('div.aimrow', null,
        el('div.ico', { text: g.ico }),
        el('div', null,
          el('b', { text: g.name }),
          el('div', { html: g.aim })))));
      sec.append(list);
    });
    return sec;
  }

  function statsSection(){
    const s = el('section');
    const row = (k, v) => el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'calc(var(--u)*1)' } },
      el('span', { text: k }), el('b', { style: { fontFamily: 'var(--fs-num)' }, text: v }));
    // a locked world must not inflate the denominator: 48/48 has to be reachable
    const levels = Games.list.reduce((n, g) => n + (stageOpen(g) ? g.levels.length : 0), 0);
    const pre = Progress.preStickers();
    s.append(el('div.eyebrow', { text: 'summary' }), el('h3', { text: 'これまでの積み重ね' }),
      row('続けた日数（連続）', Store.streak() + '日'),
      row('今日といた問題', Store.todayCount() + '問'),
      row('集めた ★', Store.totalStars() + ' / ' + levels * 3),
      row('集めたシール', Store.data.stickers.length + '枚'),
      row('クリアした入学前のレベル（1年生が開く条件）', pre.got + ' / ' + pre.total),
      row('「きょうの れんしゅう」初回正答率', pct(Store.practiceAccuracy())));
    return s;
  }

  /* ---- 小学1年生の問題 ----
     The one thing on this page a parent has to be able to decide: the door opens
     itself when every 入学前 level has been cleared, and it can be opened by hand
     when the child is plainly ready and the shelf is not finished. */
  function stageSection(){
    const s = el('section');
    const pre = Progress.preStickers();
    const open1 = Progress.g1Open();
    const byHand = !!Store.data.g1Open;
    s.append(el('div.eyebrow', { text: 'next stage' }),
      el('h3', { text: '小学1年生の問題について' }));
    s.append(el('p', { html: '入学前の' + pre.total + 'レベルを<b>すべてクリアすると</b>、ホームに'
      + '<b>「1ねんせいの きょうしつ」</b>が増えます。いまは <b>' + pre.got + ' / ' + pre.total
      + '</b> レベルです。クリアは★1つ以上（8問中4問を1回目で正解）で、'
      + '3回まじめに挑戦すれば次のレベルは開くので、どこかで止まったままにはなりません。' }));
    s.append(el('p', { text: '金色のシール（全問1回目で正解）は条件に入れていません。'
      + '48レベルすべてで一発全問正解を出すには、このアプリの推奨ペース（1日1レベル）で'
      + '半年をはるかに超えます。1年生の1学期の内容が1学期に間に合わないのでは意味がないので、'
      + '扉の鍵は「クリアのシール48枚」だけにしてあります。金色のシールはシールブックに残り、'
      + 'あとから取りに戻れる目標のままです。' }));
    s.append(el('p', { text: '中身は「先取りの計算」ではありません。1年生の1学期は、'
      + '入学前にやったことをもう一度、ちがう聞き方でたどり直します。'
      + '「同じものの集まり」（自分でまとまりを決めてから数える）と'
      + '「1対1対応」（両方を数えるのではなく、ペアにして余りを見る）の2つが中心で、'
      + 'そこから「20までの数（10のまとまりとばら）」と「式に書く（＋か−か）」に進みます。' }));
    const list = el('div.aimlist');
    Games.list.filter(g => Progress.stageOf(g) === 'g1').forEach(g => list.append(el('div.aimrow', null,
      el('div.ico', { text: g.ico }),
      el('div', null, el('b', { text: g.name }), el('div', { html: g.aim })))));
    s.append(list);
    if (open1){
      s.append(el('p', { style: { color: 'var(--good-ink)', fontWeight: 800 },
        text: byHand && pre.got < pre.total
          ? '※ この端末では、おうちの方の操作で先に開いています。'
          : '✓ 開いています。ホームの「1ねんせいの きょうしつ」から遊べます。' }));
      return s;
    }
    s.append(el('p', { text: '入学前のレベルを全部クリアする前でも、ここから開けられます。'
      + '「かぞえよう」や「いくつと いくつ」が安定していて、本人が先に進みたがっているなら、'
      + '残りのレベルのクリアを待つ必要はありません。開けたあとも入学前の遊びはそのまま残りますし、'
      + '一度開けると閉じられません。' }));
    let armed = false;
    const openBtn = el('button.btn', { text: '1ねんせいの もんだいを いま開く' });
    openBtn.addEventListener('click', () => {
      if (!armed){
        armed = true;
        openBtn.textContent = '開きますか？（もう一度タップ）';
        setTimeout(() => { armed = false; openBtn.textContent = '1ねんせいの もんだいを いま開く'; }, 4000);
        return;
      }
      Progress.openG1();
      Sound.sfx.finish();
      Home.render();
      render();
    });
    s.append(openBtn);
    return s;
  }

  const WHY = [
    ['数えられる、ということ',
     'ものを1つずつ指さして「いち、に、さん」と対応させ、最後に言った数がそのまとまり全体の数だと分かる——これが数の出発点です。数唱（1〜10をすらすら言える）ができても、この対応づけができていない子は珍しくありません。「かぞえよう」の◯こちょうだいは、その仕上げの課題です。'],
    ['5と10を分けられる、ということ',
     '入学後にいちばん効くのが「いくつといくつ」です。7は3と4、10は6と4——これを考えずに言えるかどうかで、くり上がりのあるたし算（9+4を9+1+3にする）の習得速度が変わります。半年あるなら、ここは毎日少しずつ触れておきたい単元です。'],
    ['数と見た目を切り離す、ということ',
     '大きいものが少しある方を「多い」と答えるのは、5歳では自然な反応です。並べ方を変えても数は変わらない（数の保存）と気づくには、数えて確かめる経験の量が要ります。「どっちがおおい」は、わざと見た目と数がずれる問題を混ぜています。'],
    ['「3こ」と「3ばんめ」を区別する、ということ',
     '集合の大きさ（基数）と順番（序数）は別物です。1年生の最初の単元でここが混ざる子が多く、「まえから3人」と「まえから3番目の人」で答えが変わることを、体験として持っておくと安心です。'],
    ['きまりを見つける、ということ',
     '繰り返しのパターンを見つけて先を予想する経験は、算数の「見方」そのものです。数だけが算数ではありません。形・分類・規則性は、後の図形や関数の学習に静かにつながっていきます。']
  ];

  const HOME_TIPS = [
    ['おふろ・階段で数える', '10まで数えるより、「10から逆に」数える方が難しく、効果があります。階段を1段ずつ数えるのは一対一対応の練習そのものです。'],
    ['おやつを分ける', '「クッキー10枚を2人で分けよう」は10の分解の実物版。「5と5」以外の分け方も試すと、合成分解の幅が広がります。'],
    ['食卓の配膳', '「4人だからおはしを4膳とってきて」は、数だけ取り出す課題（◯こちょうだい）と同じです。数唱ではなく数の取り出しを求めるのがポイント。'],
    ['買い物のレシート', '「りんごとバナナ、どっちが多い？」など、身の回りのものを比べる声かけを。答えより「どうしてそう思った？」を聞くと、根拠を言葉にする練習になります。'],
    ['時計を生活に結ぶ', '「長い針が12にきたらおやつね」のように、時刻を出来事とセットで使うと、数字の読み取りだけの学習より定着します。']
  ];

  const PLAN = [
    ['1〜2か月め', 'かずの しま を中心に', 'かぞえよう / すうじ どれかな / かずの じゅんばん。まず10までを確実に。数字のなぞり書きも並行して少しずつ。'],
    ['3〜4か月め', 'けいさんの やま に入る', 'いくつと いくつ → 10の おともだち の順で。ここが半年計画の山場です。毎日「きょうの れんしゅう」を1回。'],
    ['5〜6か月め', 'たしざん・ひきざん と 生活の数', '式の形に慣れ、とけい・おおきさくらべ・なんばんめ で入学後の単元に先に触れておきます。'],
    ['そのあと', '1ねんせいの きょうしつ', '入学前のレベルをすべてクリア（★1つ以上）すると開きます。金色のシールは条件に入りません。なかまづくり（同じものの集まり）と 1たい1で くらべる（一対一対応）から、20までの数・式へ。1年生の1学期の順番そのままです。']
  ];

  function textSection(eyebrow, title, pairs){
    const s = el('section');
    s.append(el('div.eyebrow', { text: eyebrow }), el('h3', { text: title }));
    pairs.forEach(([h, p]) => {
      s.append(el('h4', { text: h }));
      s.append(el('p', { text: p }));
    });
    return s;
  }

  /* ---- 入学まで ----
     「入学までの半年で」 is the premise of the app, and the app had no idea when that
     was. `createdAt` was stored and never read, there was no 入学日, and the roadmap
     below was fixed prose: it could tell a parent what the third month should look
     like without knowing whether this child is in it. This is the same numbers the
     app already has, put on a calendar. */
  function scheduleSection(){
    const s = el('section');
    const school = Store.schoolDate();
    const toSchool = Store.daysToSchool();
    const elapsed = Store.daysSinceStart();
    const pre = Progress.preStickers();
    const left = Math.max(0, pre.total - pre.got);
    s.append(el('div.eyebrow', { text: 'calendar' }), el('h3', { text: '入学まで' }));

    const fmt = d => d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    const head = el('div.schedule');
    head.append(
      el('div.big', null, toSchool > 0 ? el('b', { text: 'あと ' + toSchool + '日' })
                                       : el('b', { text: '入学しています' }),
        el('small', { text: fmt(school) + ' 入学の予定' })),
      el('div.big', null, el('b', { text: pre.got + ' / ' + pre.total + ' レベル' }),
        el('small', { text: left ? 'のこり ' + left + 'レベルで 1ねんせいの きょうしつが開きます' : 'すべてクリア済み' })));
    s.append(head);

    /* Pace, stated plainly enough that a parent can check it: levels cleared,
       divided by the days since this app was first opened. It is a blunt average
       and it says so — but it is the difference between a roadmap and a plan. */
    if (!left){
      s.append(el('p', { text: '入学前の48レベルはすべてクリア済みです。あとは「きょうの れんしゅう」と'
        + '「とっくん」で保つのと、「1ねんせいの きょうしつ」を進めるので十分です。' }));
    } else if (elapsed < 7 || pre.got === 0){
      s.append(el('p', { text: 'ペースを見積もれるだけの日数がまだありません（1週間ほど使うと出ます）。'
        + '目安は1日1レベル・10分です。48レベルなら、休む日を入れても2〜3か月で終わる分量です。' }));
    } else {
      const rate = pre.got / Math.max(1, elapsed);            // levels per calendar day
      const eta = Math.ceil(left / rate);
      const done = new Date(Date.now() + eta * 86400000);
      const inTime = toSchool <= 0 ? false : eta <= toSchool;
      const perWeek = (rate * 7).toFixed(1);
      // a plain forecast, not an alarm: nothing is lost if it runs past April
      s.append(el('div.todo', null,
        el('div.mk', { text: inTime ? '◎' : '○' }),
        el('div', null,
          el('b', { text: inTime
            ? 'このペースなら ' + fmt(done) + 'ごろ、入学に間に合います'
            : 'このペースだと、全部おわるのは ' + fmt(done) + 'ごろの見込みです'
              + (toSchool > 0 ? '（入学の ' + (eta - toSchool) + '日あと）' : '') }),
          el('div', { text: '使い始めてから ' + elapsed + '日で ' + pre.got + 'レベル（週 ' + perWeek + 'レベル）。'
            + 'のこり ' + left + 'レベルを同じペースで進めた場合の見込みです。' }))));
      if (!inTime){
        s.append(el('p', { text: '追いつき方は2つです。1つは「いまの おすすめ」を毎日1回、最後まで（8問）。'
          + 'これがそのまま1日1レベルになります。もう1つは、間違いが多いレベルを繰り返すより'
          + '「とっくん」で該当する項目だけを10問回すほうが、同じ10分で進みます。'
          + 'なお、間に合わなくても内容が消えるわけではありません——入学後も続けられます。' }));
      }
    }

    /* The auto-guess is right for a 年長 and wrong for a 年中; one tap either way. */
    const shift = n => el('button.btn', {
      text: n < 0 ? '1年 早める' : '1年 遅らせる',
      onclick(){
        Store.setSchoolYear(school.getFullYear() + n);
        render();
      }
    });
    s.append(el('p', { style: { marginTop: 'calc(var(--u)*.8)' },
      text: '入学の年は、はじめて使った日から推定しています。ちがうときは動かしてください。' }));
    s.append(el('div', { style: { display: 'flex', gap: 'calc(var(--u)*.7)', flexWrap: 'wrap' } },
      shift(-1), shift(1)));
    return s;
  }

  function planSection(){
    const s = el('section');
    s.append(el('div.eyebrow', { text: 'roadmap' }), el('h3', { text: '入学までの半年、どう進めるか' }),
      el('p', { text: '1日10分・1レベル（8問）を目安に。「きょうの れんしゅう」は解けるようになった遊びから10問を混ぜて出すので、復習にちょうど良い分量です。' }));
    const t = el('table.skilltable');
    t.append(el('thead', null, el('tr', null,
      el('th', { text: '時期' }), el('th', { text: '中心にする世界' }), el('th', { text: 'ねらい' }))));
    const tb = el('tbody');
    // which band this child is in today — the roadmap used to be prose that could
    // not point at the reader
    const month = Math.floor(Store.daysSinceStart() / 30) + 1;
    const band = Progress.g1Open() ? 3 : month <= 2 ? 0 : month <= 4 ? 1 : 2;
    PLAN.forEach(([a2, b2, c], i) => tb.append(el('tr' + (i === band ? '.now' : ''), null,
      el('td', { style: { whiteSpace: 'nowrap', fontWeight: 800 },
        text: a2 + (i === band ? '　← いまここ' : '') }),
      el('td', { style: { whiteSpace: 'nowrap' }, text: b2 }),
      el('td', { text: c }))));
    t.append(tb);
    s.append(el('div', { style: { overflowX: 'auto' } }, t));
    return s;
  }

  /** Which Japanese voice reads the questions.
      The voice bundled with a device is the “compact” one — flat and robotic.
      The enhanced / premium download is a different recording of the same name,
      so we cannot tell them apart from here: the honest fix is to list what the
      device actually has, let a parent hear each one, and remember the choice. */
  let voiceWarning = null, voiceWaiting = false;
  function voiceRow(){
    const wrap = el('div', { style: { marginTop: 'calc(var(--u)*.7)' } });
    const list = Sound.voices;
    if (!list.length){
      wrap.append(el('p', { style: { color: 'var(--oops-ink)' },
        text: '※ この端末で日本語の読み上げ音声が見つかりませんでした。iPad の 設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 日本語 で音声を追加すると、問題文が音声で読まれます。文字だけでも遊べます。' }));
      // Safari fills the voice list asynchronously, so an empty list here often
      // just means "not yet" — swap the warning for the picker when it arrives.
      // One listener however often the page is drawn: it swaps whichever warning
      // is on screen, rather than every page drawn since keeping its own.
      voiceWarning = wrap;
      if (window.speechSynthesis && !voiceWaiting){
        voiceWaiting = true;
        speechSynthesis.addEventListener('voiceschanged', function again(){
          if (!Sound.voices.length) return;
          speechSynthesis.removeEventListener('voiceschanged', again);
          voiceWaiting = false;
          if (voiceWarning && voiceWarning.isConnected) voiceWarning.replaceWith(voiceRow());
          voiceWarning = null;
        });
      }
      return wrap;
    }
    const sel = el('select.btn', { style: { maxWidth: '100%' } });
    list.forEach(v => {
      const o = el('option', { value: v.voiceURI, text: v.name });
      if (v.voiceURI === Sound.voiceId) o.selected = true;
      sel.append(o);
    });
    const apply = () => {
      Sound.voiceId = sel.value;
      Store.setPref('voiceId', sel.value);
      Sound.say('こんにちは。今日も一緒に、数を数えよう！', { delay: 60 });
    };
    sel.addEventListener('change', apply);
    const test = el('button.btn', { text: '試しに聴く', onclick: apply });
    wrap.append(el('div', { style: { display: 'flex', gap: 'calc(var(--u)*.7)', flexWrap: 'wrap', alignItems: 'center' } },
      el('span', { text: '読み上げの声：' }), sel, test));
    wrap.append(el('p', { style: { marginTop: 'calc(var(--u)*.4)' },
      text: '※ 機械的な声に聞こえるときは、iPad の 設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 日本語 で「高品質」または「プレミアム」の音声をダウンロードしてください（無料・オフラインで使えます）。同じ名前のまま、声だけが自然になります。' }));
    return wrap;
  }

  function settingsSection(){
    const s = el('section');
    s.append(el('div.eyebrow', { text: 'settings' }), el('h3', { text: '設定' }));

    /* One record per device. Naming it is worth doing for a five-year-old — the
       title screen and the sticker book say it, and the result screen speaks it —
       but it is a label, not a profile: two children sharing one iPad still share
       one set of records, and the honest way to keep them apart today is one
       backup file each (下の「書き出す／読み込む」). */
    const nameIn = el('input.namein', {
      type: 'text', value: Store.name, maxlength: '12', placeholder: 'なまえ（ひらがなでも）',
      'aria-label': 'こどもの なまえ'
    });
    const saveName = el('button.btn', { text: '保存', onclick(){
      Store.setName(nameIn.value);
      Book.render();
      nameHint.textContent = Store.name
        ? '「' + Store.name + '」と呼びます（タイトル・シールブック・ほめ言葉）。'
        : '名前は設定されていません。';
    } });
    const nameHint = el('p', { style: { marginTop: 'calc(var(--u)*.4)' },
      text: Store.name
        ? '「' + Store.name + '」と呼びます（タイトル・シールブック・ほめ言葉）。'
        : 'お子さんの呼び名を入れると、タイトルとシールブックに出て、レベルをクリアしたときに名前で褒めます。空欄のままでも構いません。' });
    s.append(el('div', { style: { display: 'flex', gap: 'calc(var(--u)*.7)', flexWrap: 'wrap', alignItems: 'center' } },
      el('span', { text: 'なまえ：' }), nameIn, saveName), nameHint);
    s.append(el('p', { style: { color: 'var(--ink-soft)' },
      text: '※ 記録はこの端末に1人ぶんです。きょうだいで1台を使う場合は、名前を変えても記録は混ざります。'
        + '分けるなら、下の「記録を書き出す」で1人ずつファイルを保管し、遊ぶ前に「おきかえる」で読み込んでください。' }));
    const toggle = (label, get, set) => {
      const b = el('button.btn', { text: label + '：' + (get() ? 'オン' : 'オフ') });
      b.addEventListener('click', () => {
        set(!get());
        b.textContent = label + '：' + (get() ? 'オン' : 'オフ');
        if (get()) Sound.sfx.tap();
      });
      return b;
    };
    const row = el('div', { style: { display: 'flex', gap: 'calc(var(--u)*.7)', flexWrap: 'wrap' } },
      toggle('効果音', () => Sound.sfxOn, v => { Sound.sfxOn = v; Store.setPref('sfx', v); }),
      toggle('読み上げ', () => Sound.voiceOn, v => { Sound.voiceOn = v; Store.setPref('voice', v); }));
    s.append(row);
    s.append(voiceRow());
    const reset = el('button.btn', { text: justReset ? '消しました' : '記録をすべて消す',
      style: { borderColor: 'var(--oops)', color: 'var(--oops-ink)' } });
    justReset = false;
    let armed = false;
    reset.addEventListener('click', () => {
      if (!armed){
        armed = true;
        reset.textContent = '本当に消しますか？（もう一度タップ）';
        setTimeout(() => { armed = false; reset.textContent = '記録をすべて消す'; }, 4000);
        return;
      }
      Store.reset();
      justReset = true;      // render() replaces this button, so the message goes on the new one
      Home.render();
      render();
    });
    /* Three different problems, three different things for an adult to do. They
       used to share one sentence about file:// and private browsing, which was
       wrong for a full disk and wrong for a record that simply would not parse. */
    const storageNote = [];
    if (Store.unreadable){
      storageNote.push('この端末に残っていた記録が読み取れなかったため、新しい記録で始めています。'
        + '読み取れなかった記録は消さずに端末内に残してあります。書き出したファイルがあれば、'
        + 'バックアップの欄から読み込んで戻せます。');
    }
    if (Store.storage === 'unavailable'){
      storageNote.push('この開き方では記録が保存できません（ファイルを直接開いた場合やプライベートブラウズでは、iPad 側がデータの保存を許可しません）。Safari で開いてから 共有 → ホーム画面に追加 し、そのアイコンから起動してください。');
    } else if (Store.storage === 'failed'){
      storageNote.push('記録を書き込めませんでした（端末の空き容量が足りない可能性があります）。'
        + '空きができれば、次に遊んだときから自動で保存が再開します。念のため、いまの記録を書き出しておいてください。');
    }
    if (storageNote.length){
      s.append(el('p', { style: { color: 'var(--oops-ink)', fontWeight: 800 }, text: storageNote.join('') }));
    }
    s.append(el('p', { style: { marginTop: 'calc(var(--u)*.9)' },
      text: '記録はこの端末の中だけに保存されます。サーバーには何も送信されません。' }), reset);
    return s;
  }

  function backupSection(){
    const s = el('section');
    s.append(el('div.eyebrow', { text: 'backup' }), el('h3', { text: '記録の保存とバックアップ' }));

    /* Nothing on this page used to ask. Six months of records — including every
       fact-level judgement the app makes about this child — live in one
       localStorage key, on a device whose own documentation says it will discard
       it, and the only defence was a button nobody had a reason to press. */
    const due = Store.backupDue();
    const last = Store.lastBackupDays();
    if (due){
      s.append(el('div.backup-due', null,
        el('b', { text: due.never ? 'まだ一度も書き出していません' : last + '日間、書き出していません' }),
        el('div', { text: 'この端末の記録が消えると、★もシールも、どの項目でつまずいているかの記録も、'
          + 'まとめて失われます。下のボタンで書き出したファイルを、iCloud Drive などに置いておいてください（数KBです）。' })));
    } else if (last != null){
      s.append(el('p', { style: { color: 'var(--good-ink)', fontWeight: 800 },
        text: last === 0 ? '✓ 今日、書き出しています。' : '✓ ' + last + '日前に書き出しています。' }));
    }
    /* iPadOS can keep a home-screen web app's storage apart from Safari's. A family
       that plays in a Safari tab for a week and then does 「ホーム画面に追加」 — the
       step every instruction recommends — can open the icon to an empty app. Say so
       while it can still be avoided: in the tab, before the icon exists. */
    if (inSafariTab()){
      const has = Object.keys(Store.data.stars).length > 0 || Store.data.stickers.length > 0;
      s.append(el('div.backup-due.tabnotice', null,
        el('b', { text: 'いまは Safari のタブで開いています' }),
        el('div', { text: has
          ? 'ホーム画面に追加したアイコンから開くと、記録が Safari とは別になり、空から始まることがあります。'
            + '追加する前に下の「記録を書き出す」で書き出し、追加したアイコンから開いて「記録を読み込む」で戻してください。'
          : '続けて使うなら、遊びはじめる前に 共有 → ホーム画面に追加 し、そのアイコンから開いてください。'
            + 'Safari のタブで遊んだ記録は、ホーム画面のアプリに引き継がれないことがあります。' })));
    }

    s.append(el('p', { html:
      '学習の記録は、<b>いま開いている URL ごとに、この端末のブラウザの中だけ</b>に保存されます。' +
      'ちがう URL で開くと、同じアプリでも記録は共有されません。' +
      '端末を変えるとき、Safari の履歴やサイトデータを消すとき、別の URL に引っ越すときは、' +
      '下のボタンで書き出したファイルを保管しておいてください。' }));

    const rows = el('div', { style: { display: 'grid', gap: 'calc(var(--u)*.3)', margin: 'calc(var(--u)*.8) 0' } });
    const row = (k, v, warn) => el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'calc(var(--u)*1)' } },
      el('span', { text: k }),
      el('b', { text: v, style: { color: warn ? 'var(--oops-ink)' : 'var(--ink)', textAlign: 'right' } }));
    rows.append(row('いまの保存先', Store.origin, Store.origin === 'file://'));
    rows.append(row('保存の可否', Store.persists ? '保存できます'
      : Store.storage === 'failed' ? '書き込みに失敗しています' : '保存できません', !Store.persists));
    rows.append(row('ブラウザが記録を保持する設定', persistState, false));
    s.append(rows);
    if (persistState !== '許可されています'){
      s.append(el('p', { text:
        'この設定はブラウザが判断するもので、許可されていなくてもすぐ消えるわけではありません。' +
        'iPad では Safari で開いて 共有 → ホーム画面に追加 し、そのアイコンから起動していれば、' +
        'しばらく使わなくても記録は保持されます。逆に Safari のタブのまま数日使わないと、' +
        'iPadOS が自動的に消すことがあります。' }));
    }

    const status = el('p', { style: { fontWeight: 800, color: lastBackupMsg && lastBackupMsg.ok && lastBackupMsg.saved !== false ? 'var(--good-ink)' : 'var(--oops-ink)' },
      text: lastBackupMsg ? lastBackupMsg.msg : '' });
    lastBackupMsg = null;
    const stamp = () => {
      const d = new Date();
      return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    };

    /* 「書き出した」is only written down once the file has actually gone somewhere.
       It used to be recorded the instant the download link was clicked — and on an
       iPad started from the home screen that link often saves nothing, or the link
       was revoked before the save sheet was answered. The mark on the ホーム button
       then went away on a backup that did not exist.
       The share sheet says when it finished (and when it was cancelled), so it is
       tried first. A plain download cannot say, so an adult says it for it. */
    const say = (text, good) => {
      status.textContent = text;
      status.style.color = good ? 'var(--good-ink)' : 'var(--ink)';
    };
    const markSaved = text => {
      confirmBtn.hidden = true;
      Store.noteBackup();
      Home.render();                       // clears the mark on the ホーム button
      say(text, true);
    };
    const confirmBtn = el('button.btn.btn-ghost', { text: '保存できた', hidden: true,
      onclick(){ markSaved('✓ 書き出したことを記録しました。'); } });

    function download(){
      try{
        const blob = new Blob([Store.exportText()], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: 'kazu-no-bouken-' + stamp() + '.json' });
        document.body.append(a); a.click();
        // long enough for an adult to answer the save sheet
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
        confirmBtn.hidden = false;
        say('保存の画面が出たら、ファイルアプリや iCloud Drive に保存してください。保存できたら「保存できた」を押してください。');
      }catch(e){ say('この環境ではファイルに書き出せません。下の「コピー」を使ってください。'); }
    }

    const dl = el('button.btn', { text: '記録を書き出す（ファイル）', onclick(){
      let file = null;
      try{ file = new File([Store.exportText()], 'kazu-no-bouken-' + stamp() + '.json', { type: 'application/json' }); }
      catch(e){}
      if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })){
        navigator.share({ files: [file], title: 'かずのぼうけん の記録' }).then(
          () => markSaved('✓ 書き出しました。「ファイルに保存」を選んだなら、ファイルアプリに入っています。'),
          e => {
            if (e && e.name === 'AbortError') say('書き出しを取り消しました。記録はまだ保管されていません。');
            else download();
          });
        return;
      }
      download();
    } });

    const copy = el('button.btn', { text: 'コピー（貼り付けで復元）', onclick(){
      const text = Store.exportText();
      // copied is not kept: it counts once it has been pasted somewhere
      const done = () => {
        confirmBtn.hidden = false;
        say('コピーしました。メモアプリなどに貼り付けて保管したら「保存できた」を押してください。');
      };
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(done, () => { box.value = text; box.select(); status.textContent = '下の枠に出しました。長押しして「コピー」してください。'; });
      } else { box.value = text; box.select(); status.textContent = '下の枠に出しました。長押しして「コピー」してください。'; }
    } });

    const file = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' },
      onchange(e){
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => apply(String(r.result));
        r.readAsText(f);
        e.target.value = '';
      } });
    const pick = el('button.btn', { text: '記録を読み込む（ファイル）', onclick(){ file.click(); } });

    const box = el('textarea.backupbox', { rows: 4, spellcheck: 'false',
      placeholder: 'ここに、書き出した記録を貼り付けて「貼り付けから読み込む」を押してください' });
    const paste = el('button.btn', { text: '貼り付けから読み込む', onclick(){
      if (!box.value.trim()){ status.textContent = '枠が空です。'; return; }
      apply(box.value);
    } });

    let mode = 'merge';
    const modeBtn = el('button.btn', { text: '読み込み方：合体する', onclick(){
      mode = mode === 'merge' ? 'replace' : 'merge';
      modeBtn.textContent = '読み込み方：' + (mode === 'merge' ? '合体する' : 'おきかえる');
    } });

    function apply(text){
      const r = Store.importText(text, mode);
      if (r.ok){ lastBackupMsg = r; Home.render(); render(); return; }
      status.textContent = r.msg;
      status.style.color = 'var(--oops-ink)';
    }

    s.append(el('div', { style: { display: 'flex', gap: 'calc(var(--u)*.7)', flexWrap: 'wrap' } }, dl, copy, confirmBtn),
             el('div', { style: { display: 'flex', gap: 'calc(var(--u)*.7)', flexWrap: 'wrap', marginTop: 'calc(var(--u)*.6)' } }, pick, paste, modeBtn),
             file, box, status,
             el('p', { text: '「合体する」は、いまの記録と読み込んだ記録の良いほうを残します（同じファイルを二度読み込んでも数字は増えません）。「おきかえる」は、いまの記録を捨てて読み込んだ内容にします。' }));
    return s;
  }

  function render(){
    buildSheet();
    clear(sheetInner);
    /* What to do this week comes first. It used to sit under an essay, with twelve
       sections after it; the reading — what the app is for, what each game builds,
       the roadmap — is still all here, folded under「くわしく」at the end. */
    const about = el('section', null,
        el('div.eyebrow', { text: 'about' }),
        el('h3', { text: 'このアプリがねらっていること' }),
        // counted, not typed: the sentence used to say 15 and quietly went stale
        el('p', { text: '小学校1年生の算数は「数える」「数を分ける・合わせる」「比べる」「形をとらえる」の4つの土台の上に立っています。逆に言えば、入学前にやるべきことは計算の先取りではなく、この土台を手と目と声で確かめておくことです。このアプリは入学前の'
          + Games.list.filter(g => Progress.stageOf(g) === 'pre').length
          + 'の遊びを4つの世界に分け、1レベル8問・1日10分で回せる分量にしています。'
          + 'それを全部終えると、小学1年生の1学期にあたる「1ねんせいの きょうしつ」が開きます。' }),
        el('p', { text: '答えを間違えても減点や時間制限はありません。2回間違えると自動でヒントが出て、4回でもっと強いヒントと「こたえを みる」ボタン、6回でアプリが答えを見せて一緒に終わらせます。どの問題も行き止まりにはなりません（答えを見せて終えた問題は、1回目の正解には数えません）。' }));
    sheetInner.append(
      nextUpSection(),
      scheduleSection(),
      statsSection(),
      stageSection(),
      progressSection(),
      backupSection(),
      settingsSection(),
      el('details.more', null,
        el('summary', { text: 'くわしく ── ねらい・遊びごとの力・半年の進め方・おうちでできること' }),
        about,
        aimsSection(),
        planSection(),
        textSection('why', '入学前に育てておきたい力', WHY),
        textSection('at home', 'おうちでできること', HOME_TIPS)),
      el('div', { style: { height: 'calc(var(--u)*2)' } }));
  }

  // Safari drops script-writable storage for sites that are not used for a while;
  // asking for persistence (and adding the app to the Home Screen) prevents that
  if (navigator.storage && navigator.storage.persisted){
    navigator.storage.persisted()
      .then(p => p ? true : (navigator.storage.persist ? navigator.storage.persist() : false))
      .then(p => { persistState = p ? '許可されています' : '許可されていません'; })
      .catch(() => { persistState = 'この端末では確認できません'; });
  } else {
    persistState = 'この端末では確認できません';
  }

  return { open, render };
})();
