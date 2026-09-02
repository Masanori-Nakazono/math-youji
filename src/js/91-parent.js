/* ===========================================================
   91 — おうちのかたへ (parent area): progress, why it matters, settings
   =========================================================== */
'use strict';

const Parent = (() => {
  let gateNode, sheetNode, sheetInner, justReset = false;
  let a = 0, b = 0, want = 0;

  /* ---- simple adult gate ---- */
  function buildGate(){
    if (gateNode) return gateNode;
    const q = el('div.q');
    const choices = el('div.choices');
    function roll(){
      a = ri(12, 19); b = ri(3, 9); want = a * b;
      q.textContent = a + ' × ' + b + ' = ?';
      clear(choices);
      const opts = shuffle([want, want + ri(3, 9), want - ri(3, 9), want + ri(10, 20)]);
      opts.forEach(v => choices.append(el('button.choice', {
        type: 'button', text: String(v),
        onclick(e){
          if (v === want){ Sound.sfx.correct(); render(); UI.show('parent'); }
          else { e.currentTarget.classList.add('wrong'); Sound.sfx.wrong(); setTimeout(roll, 500); }
        }
      })));
    }
    gateNode = el('div#gate', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); UI.show('home', { replace: true }); } }, '←'),
        el('h2', { text: 'おうちの かたへ' })),
      el('div.gate', null,
        el('div.hint', { text: 'おとなの かた だけが すすめます。けいさんの こたえを えらんで ください。' }),
        q, choices));
    UI.register('gate', gateNode);
    gateNode._roll = roll;
    return gateNode;
  }

  function open(){
    buildGate();
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

  function progressSection(){
    const sec = el('section');
    sec.append(el('div.eyebrow', { text: 'progress' }), el('h3', { text: 'ここまでのようす' }));
    const t = el('table.skilltable');
    t.append(el('thead', null, el('tr', null,
      el('th', { text: '遊び' }), el('th', { text: '到達' }),
      el('th', { class: 'n', text: '★' }), el('th', { class: 'n', text: '初回正答率' }), el('th', { class: 'n', text: '問題数' }))));
    const body = el('tbody');
    WORLDS.forEach(w => {
      const games = Games.list.filter(g => g.world === w.id);
      if (!games.length) return;
      body.append(el('tr', null, el('td', { colspan: 5, style: { color: w.color, fontWeight: 800, paddingTop: 'calc(var(--u)*.8)' }, text: w.name })));
      games.forEach(g => {
        const s = Store.gameStars(g.id, g.levels.length);
        const max = g.levels.length * 3;
        const acc = Store.accuracy(g.id);
        const seen = Store.data.seen[g.id] || 0;
        body.append(el('tr', null,
          el('td', { text: g.name }),
          el('td', null, el('div.bar', null, el('i', { style: { width: (max ? (s / max) * 100 : 0) + '%',
            background: acc != null && acc < .6 ? 'var(--oops)' : 'var(--good)' } }))),
          el('td', { class: 'n', text: s + '/' + max }),
          el('td', { class: 'n', text: pct(acc) }),
          el('td', { class: 'n', text: String(seen) })));
      });
    });
    t.append(body);
    sec.append(el('div', { style: { overflowX: 'auto' } }, t));
    sec.append(el('p', { style: { marginTop: 'calc(var(--u)*.8)' },
      text: '初回正答率は「1回目のタップで正解した割合」です。60%を下回っている遊びは、まだその考え方が定着していないサインなので、下のレベルに戻るか、下記の「おうちでできること」を試してみてください。' }));
    return sec;
  }

  function statsSection(){
    const s = el('section');
    const row = (k, v) => el('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 'calc(var(--u)*1)' } },
      el('span', { text: k }), el('b', { style: { fontFamily: 'var(--fs-num)' }, text: v }));
    s.append(el('div.eyebrow', { text: 'summary' }), el('h3', { text: 'これまでの積み重ね' }),
      row('続けた日数（連続）', Store.streak() + '日'),
      row('今日といた問題', Store.todayCount() + '問'),
      row('集めた ★', Store.totalStars() + ' / ' + (Games.list.reduce((n, g) => n + g.levels.length, 0) * 3)),
      row('集めたシール', Store.data.stickers.length + '枚'),
      row('「きょうの れんしゅう」初回正答率', pct(Store.practiceAccuracy())));
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
    ['5〜6か月め', 'たしざん・ひきざん と 生活の数', '式の形に慣れ、とけい・おおきさくらべ・なんばんめ で入学後の単元に先に触れておきます。']
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

  function planSection(){
    const s = el('section');
    s.append(el('div.eyebrow', { text: 'roadmap' }), el('h3', { text: '入学までの半年、どう進めるか' }),
      el('p', { text: '1日10分・1レベル（8問）を目安に。「きょうの れんしゅう」は解けるようになった遊びから10問を混ぜて出すので、復習にちょうど良い分量です。' }));
    const t = el('table.skilltable');
    t.append(el('thead', null, el('tr', null,
      el('th', { text: '時期' }), el('th', { text: '中心にする世界' }), el('th', { text: 'ねらい' }))));
    const tb = el('tbody');
    PLAN.forEach(([a2, b2, c]) => tb.append(el('tr', null,
      el('td', { style: { whiteSpace: 'nowrap', fontWeight: 800 }, text: a2 }),
      el('td', { style: { whiteSpace: 'nowrap' }, text: b2 }),
      el('td', { text: c }))));
    t.append(tb);
    s.append(el('div', { style: { overflowX: 'auto' } }, t));
    return s;
  }

  function settingsSection(){
    const s = el('section');
    s.append(el('div.eyebrow', { text: 'settings' }), el('h3', { text: '設定' }));
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
    if (!Sound.hasVoice){
      s.append(el('p', { style: { color: 'var(--oops)' },
        text: '※ この端末で日本語の読み上げ音声が見つかりませんでした。iPad の 設定 → アクセシビリティ → 読み上げコンテンツ → 声 で日本語（Kyoko など）を追加すると、問題文が音声で読まれます。文字だけでも遊べます。' }));
    }
    const reset = el('button.btn', { text: justReset ? '消しました' : '記録をすべて消す',
      style: { borderColor: 'var(--oops)', color: 'var(--oops)' } });
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
    if (!Store.persists){
      s.append(el('p', { style: { color: 'var(--oops)', fontWeight: 800 },
        text: 'この開き方では記録が保存できません（ファイルを直接開いた場合やプライベートブラウズでは、iPad 側がデータの保存を許可しません）。Safari で開いてから 共有 → ホーム画面に追加 し、そのアイコンから起動してください。' }));
    }
    s.append(el('p', { style: { marginTop: 'calc(var(--u)*.9)' },
      text: '記録はこの端末の中だけに保存されます。サーバーには何も送信されません。' }), reset);
    return s;
  }

  function render(){
    buildSheet();
    clear(sheetInner);
    sheetInner.append(
      el('section', null,
        el('div.eyebrow', { text: 'about' }),
        el('h3', { text: 'このアプリがねらっていること' }),
        el('p', { text: '小学校1年生の算数は「数える」「数を分ける・合わせる」「比べる」「形をとらえる」の4つの土台の上に立っています。逆に言えば、入学前にやるべきことは計算の先取りではなく、この土台を手と目と声で確かめておくことです。このアプリは15の遊びを4つの世界に分け、1レベル8問・1日10分で回せる分量にしています。' }),
        el('p', { text: '答えを間違えても減点や時間制限はありません。2回間違えると自動でヒントが出て、必ず自分で正解にたどり着いて終われるようにしてあります。' })),
      statsSection(),
      progressSection(),
      planSection(),
      textSection('why', '入学前に育てておきたい力', WHY),
      textSection('at home', 'おうちでできること', HOME_TIPS),
      settingsSection(),
      el('div', { style: { height: 'calc(var(--u)*2)' } }));
  }

  return { open, render };
})();
