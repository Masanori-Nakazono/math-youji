/* ===========================================================
   90 — shell screens: title, home, levels, result, sticker book, parents
   =========================================================== */
'use strict';

/** 🔊 in a title bar. A five-year-old does not read the screen's words yet; this
    says what the screen is for, out loud, whenever they want it again. */
function speakBtn(text){
  return el('button.btn.btn-round.speakbtn', { type: 'button', 'aria-label': 'よみあげる', title: 'よみあげる',
    onclick(){ Sound.sfx.tap(); Sound.say(typeof text === 'function' ? text() : text, { delay: 60 }); } }, '🔊');
}

/* ---------------------------------------------------------- TITLE */
const Title = (() => {
  let node, starting = false;
  function build(){
    if (node) return node;
    const logo = el('h1.big', null,
      el('span', { text: 'か', style: { color: 'var(--c-red)' } }),
      el('span', { text: 'ず', style: { color: 'var(--c-orange)' } }),
      el('span', { text: 'の', style: { color: 'var(--c-green)' } }),
      el('span', { text: 'ぼ', style: { color: 'var(--c-blue)' } }),
      el('span', { text: 'う', style: { color: 'var(--c-purple)' } }),
      el('span', { text: 'けん', style: { color: 'var(--c-pink)' } }));
    const start = el('button.btn.btn-accent', {
      text: 'はじめる',
      onclick(){
        if (starting) return;
        starting = true;
        Sound.unlock();
        Sound.sfx.unlockSfx();
        Sound.say('数の冒険へ、ようこそ！', { delay: 260 });
        Sound.probeVoice(1200).then(hasVoice => {
          starting = false;
          if (Sound.voiceOn && !hasVoice){
            Home.render();
            UI.show('home', { replace: true });
          } else if (!Store.data.orientation) Orientation.open();
          else if (Diagnostic.shouldRun()) Session.startDiagnostic();
          else {
            Home.render();
            UI.show('home', { replace: true });
          }
        });
      }
    });
    node = el('div#title', null,
      mascotSVG('happy', 'talk'),
      logo,
      /* A five-year-old being called by name is not decoration — it is the
         difference between「アプリを開いた」and「わたしの ぼうけん」. The field was in
         Store from the first version, validated in every backup, and read by
         nothing. */
      el('div.tag', { text: Store.name
        ? Store.name + 'の ぼうけん、はじまるよ'
        : Progress.g1Open()
        ? 'しょうがっこう 1ねんせいの もんだいも あるよ'
        : 'しょうがっこうへ いく まえに　さんすうの ちからを あそんで つける' }),
      start,
      el('div.foot', { text: 'おと が でます。iPad は よこむき が おすすめ です' }));
    return UI.register('title', node);
  }
  return { build };
})();

/* ---------------------------------------------------------- FIRST USE */
const Orientation = (() => {
  let node, card, dots, next, step = 0;
  const pages = [
    { icon: '👆', text: 'えや すうじを タップして えらぶよ', say: '絵や数字を、タップして選ぶよ。' },
    { icon: '🔊', text: 'わからない ときは スピーカーを おして きいてね', say: '分からない時は、スピーカーを押して聞いてね。' },
    { icon: '🧩', text: 'さいしょは みて、つぎは いっしょに やってみよう', say: '最初は見て、次はいっしょにやってみよう。' }
  ];
  function build(){
    if (node) return node;
    card = el('div.guidecard');
    dots = el('div.stepdots');
    next = el('button.btn.btn-accent', { type: 'button', onclick(){
      Sound.sfx.tap();
      if (step < pages.length - 1){ step++; render(); }
      else { Store.completeOrientation(); Session.startDiagnostic(); }
    } });
    node = el('div#orientation', null, mascotSVG('happy', 'talk'),
      el('h1.welcome', { text: 'あそびかた' }), card, dots, next);
    return UI.register('orientation', node);
  }
  function render(){
    const p = pages[step];
    clear(card); clear(dots);
    card.append(el('div.guideicon', { text: p.icon }), el('div.guidetext', { text: p.text }),
      el('button.btn.btn-ghost', { type: 'button', onclick(){ Sound.sfx.tap(); Sound.say(p.say, { delay: 0 }); } }, '🔊 きく'));
    pages.forEach((x, i) => dots.append(el('span' + (i === step ? '.on' : ''))));
    next.textContent = step === pages.length - 1 ? 'ぼうけんを はじめる' : 'つぎへ';
    Sound.say(p.say, { delay: 180 });
  }
  function open(){ build(); step = 0; render(); UI.show('orientation', { replace: true }); }
  return { build, open };
})();

/* ---------------------------------------------------------- HOME */
const Home = (() => {
  let node, worldsEl, starEl, dailyEl, focusEl, recommendEl, reviewEl, voiceWarnEl, shelfEl, dailiesEl, questsEl;
  let parentBtn;

  function updateVoiceWarning(){
    if (!voiceWarnEl) return;
    voiceWarnEl.hidden = !Sound.voiceOn || Sound.hasVoice;
    voiceWarnEl.textContent = voiceWarnEl.hidden ? ''
      : 'よみあげる こえが みつかりません。おうちの ひとと せっていを みてね。';
  }
  window.addEventListener('kazu-voices-changed', updateVoiceWarning);

  function build(){
    if (node) return node;
    starEl   = el('span', { text: '0' });
    worldsEl = el('div.worlds');
    dailyEl  = el('button.daily', { type: 'button', onclick(){ Sound.sfx.tap(); Session.startDaily(10); } });
    recommendEl = el('button.daily.recommended', {
      type: 'button', onclick(){ Sound.sfx.tap(); Diagnostic.startRecommended(); }
    });
    reviewEl = el('button.daily.reviewmission', { type: 'button', hidden: true });
    voiceWarnEl = el('div.voice-warning', {
      hidden: true, role: 'status', 'aria-live': 'polite'
    });
    node = el('div#home', null,
      el('div.home-head', null,
        el('h1.logo', null,
          el('span.k', { text: 'かず' }), el('span.n', { text: 'の' }), el('span.b', { text: 'ぼうけん' })),
        el('div.spacer'),
        el('div.starcount', null, starSVG(true), starEl),
        speakBtn(homeSpeech),
        el('button.btn.btn-round', { 'aria-label': 'シールブック', title: 'シールブック',
          onclick(){ Sound.sfx.tap(); Book.open(); } }, '📖'),
        el('button.btn.btn-round', { 'aria-label': 'できたアルバム', title: 'できたアルバム',
          onclick(){ Sound.sfx.tap(); ProgressAlbum.open(); } }, '📒'),
        el('button.btn.btn-round', { 'aria-label': 'じぶんの しま', title: 'じぶんの しま',
          onclick(){ Sound.sfx.tap(); StickerWorld.open(); } }, '🏡'),
        parentBtn = el('button.btn.btn-round', { 'aria-label': 'おうちのかたへ', title: 'おうちのかたへ',
          onclick(){ Sound.sfx.tap(); Parent.open(); } }, '👤')));
    /* きょうの れんしゅう reviews everything the child has unlocked, which means a
       single weak fact comes round about once a fortnight. This is the aimed set:
       three or four facts, ten questions, each fact several times. */
    focusEl = el('button.daily.focusset', { type: 'button', hidden: true });
    shelfEl = el('button.shelf', { type: 'button',
      onclick(){ Sound.sfx.tap(); Book.open(); } });
    /* The door to 1ねんせい used to have a progress banner of its own down here.
       It said what the locked cards on the map already say, and between it and the
       sticker shelf the map itself was the smallest thing on its own screen. The
       padlocked cards in the 1ねんせい world carry the message now. */
    /* one row, never a stack: four banners each on their own line pushed the
       map itself off the bottom of an iPad */
    dailiesEl = el('div.dailies', null, recommendEl, dailyEl, reviewEl, focusEl);
    questsEl = el('div.home-quests');
    node.append(voiceWarnEl, questsEl, dailiesEl, worldsEl, shelfEl);
    return UI.register('home', node);
  }

  /* The banners are the day's way in, and they were told apart only by their
     words: every one carried the same rabbit, and on a busy day even that went.
     Each has a picture of its own now, and 🔊 reads out which ones are up. */
  const BANNER_ICON = { recommend: '🗺️', first: '🧭', daily: '📅', review: '💬', focus: '🎯' };
  function homeSpeech(){
    const names = [recommendEl, dailyEl, reviewEl, focusEl]
      .filter(b => b && !b.hidden).map(b => ($('.t', b) || {}).textContent).filter(Boolean);
    return '上のボタンから選んでね。' + names.join('、') + '。下の地図から、好きな遊びも選べるよ。';
  }

  function gameCard(g){
    /* These used to count "levels with any star at all", so three scraped passes
       looked exactly like three perfect ones — and did not match the 3/9 the
       parent page showed for the same child. Same arithmetic on both screens now. */
    const earned = Store.gameStars(g.id, g.levels.length);
    const max = g.levels.length * 3;
    /* The three home stars are a rounded summary, so ★★★ can also mean a game
       whose levels are ★3・★2・★3.  Stars therefore cannot say whether there is
       another sticker to earn.  The gold frame uses the shelf itself as the
       source of truth: every level must have both its clear and gold sticker. */
    const collected = g.levels.every((lv, i) =>
      Store.hasSticker(g.id + ':' + i) && Store.hasSticker(g.id + ':' + i + ':g'));
    const done = earned === 0 ? 0 : Math.max(1, Math.round((earned / max) * 3));
    const st = el('div.st');
    for (let i = 0; i < 3; i++) st.append(starSVG(i < done));
    return el('button.gamecard' + (collected ? '.collected' : ''), {
      type: 'button', title: g.name + '　★ ' + earned + '/' + max
        + (collected ? '　シール ぜんぶ ゲット' : '　まだ シールが あるよ'),
      onclick(){
        Sound.sfx.tap();
        Levels.render(g);
        UI.show('levels');
        // the child picked a picture; say the name of what they picked
        Sound.say(Levels.speech(), { delay: 120 });
      }
    },
      el('div.ico', { text: g.ico }),
      el('div.nm', { text: g.name }),
      st,
      collected ? el('div.collectmark', {
        text: '👑', 'aria-label': 'シール ぜんぶ ゲット'
      }) : null);
  }

  /* The classroom is on this screen from the first day, behind a padlock.

     It was hidden until the shelf was half full, on the theory that a lock a child
     cannot open yet is discouraging. That is true of a lock with nothing behind it
     — and this one has four named games behind it. Seeing 「なかまづくり」 and
     「20までの かず」 sitting there, greyed out, is the reason to fill the shelf;
     an empty space where they would be is not. Tapping one says how to get in and
     goes to the sticker book, which is where the count lives.

     What opens it is clearing all 48 入学前 levels — the plain stickers. The gold
     ones (a run with every answer right first time) stay a thing worth going back
     for; they are not part of the key. */
  function lockedCard(g){
    return el('button.gamecard.locked', {
      type: 'button', title: g.name + '　' + Progress.unlockHint(g),
      onclick(){
        Sound.sfx.tap();
        Book.render();
        UI.show('book');
        // after the switch: UI.show hushes anything queued before it
        Sound.say(Progress.unlockHint(g), { delay: 120 });
      }
    },
      el('div.ico', { text: g.ico }),
      el('div.nm', { text: g.name }),
      el('div.lockhint', { text: Progress.pathProgress(g).got + '／' + Progress.pathProgress(g).total }),
      el('div.lockmark', { text: '🔒' }));
  }

  function render(){
    build();
    starEl.textContent = String(Store.totalStars());
    /* A quiet mark for the adult, on the button only they press. The child sees a
       dot; the parent sees that the records have not been written out in a month.
       Nothing on the child's half of the screen changes, and nothing is spoken. */
    const due = Store.backupDue();
    parentBtn.classList.toggle('due', !!due);
    parentBtn.setAttribute('title', due
      ? 'おうちのかたへ（記録の書き出しを おすすめします）' : 'おうちのかたへ');
    const n = Store.todayCount(), streak = Store.streak();
    const firstRun = Diagnostic.shouldRun();
    const rec = Diagnostic.current();
    const recGame = rec && Games.byId[rec.gameId];
    clear(recommendEl);
    recommendEl.hidden = !recGame;
    if (recGame){
      const lv = recGame.levels[rec.levelIndex] || recGame.levels[0];
      recommendEl.append(
        el('div.ico', { text: firstRun ? BANNER_ICON.first : BANNER_ICON.recommend, 'aria-hidden': 'true' }),
        el('div.grow', null,
          el('div.t', { text: firstRun ? 'はじめの ぼうけん' : 'いまの おすすめ' }),
          el('div.s', { text: firstRun
            ? '10もんで ぴったりの はじまりを みつけよう'
            : recGame.name + '　《' + lv.t + '》' })),
        el('div.go', { text: '▶' }));
      recommendEl.onclick = () => {
        Sound.sfx.tap();
        if (firstRun) Session.startDiagnostic(); else Diagnostic.startRecommended();
      };
    }
    updateVoiceWarning();
    if (!voiceWarnEl.hidden){
      Sound.probeVoice(3000).then(ok => {
        if (ok){ voiceWarnEl.hidden = true; voiceWarnEl.textContent = ''; }
      });
    }
    const review = Missions.yesterdayReview();
    reviewEl.hidden = !review;
    if (review){
      clear(reviewEl);
      reviewEl.append(
        el('div.ico', { text: BANNER_ICON.review, 'aria-hidden': 'true' }),
        el('div.grow', null,
          el('div.t', { text: 'きのうの ミッション' }),
          el('div.s', { text: 'どんな ふうに できたか おはなししよう' })),
        el('div.go', { text: '▶' }));
      reviewEl.onclick = () => Missions.openReview(review);
    }
    const learnedCount = Games.list.reduce((n, g) => n + g.levels.filter((lv, i) => Store.introduced(g.id, i)).length, 0);
    dailyEl.hidden = learnedCount === 0;
    clear(dailyEl);
    dailyEl.classList.toggle('done', n >= 10);
    dailyEl.append(
      el('div.ico', { text: BANNER_ICON.daily, 'aria-hidden': 'true' }),
      el('div.grow', null,
        el('div.t', { text: n >= 10 ? 'きょうの れんしゅう おわり！' : 'きょうの れんしゅう' }),
        el('div.s', { text: n >= 10
          ? `きょうは ${n}もん がんばったね　･　${streak}にち れんぞく`
          : 'あそんだ もんだいから 10もん でるよ' })),
      el('div.go', { text: n >= 10 ? '🎉' : '▶' }));

    const weak = Store.weakFacts(4);
    focusEl.hidden = weak.length < 2;      // one wobbly fact is not a practice set
    if (!focusEl.hidden){
      clear(focusEl);
      focusEl.append(
        el('div.ico', { text: BANNER_ICON.focus, 'aria-hidden': 'true' }),
        el('div.grow', null,
          // 「にがて」is a word for the parent page: to a five-year-old it is a verdict
          el('div.t', { text: 'とっくん' }),
          el('div.s', { text: weak.slice(0, 2).map(w => w.label).join('　･　')
                              + (weak.length > 2 ? '　ほか' : '') })),
        el('div.go', { text: '▶' }));
      focusEl.onclick = () => { Sound.sfx.tap(); Session.startFocus(weak.map(w => w.key), { n: 10 }); };
    }

    /* The prize choice is a separate, picture-led entry point.  It must not be
       squeezed into the four daily banners: those are routines, while this is a
       child's choice of what to do next.  The short adventure sits alongside it
       because it answers a different moment — "I want to try, but this is hard." */
    clear(questsEl);
    const stickerQuest = StickerMissions.homeCard();
    const adventure = Adventures.homeCard();
    const firstStep = FirstSteps.homeCard();
    if (stickerQuest) questsEl.append(stickerQuest);
    if (firstStep) questsEl.append(firstStep);
    if (adventure) questsEl.append(adventure);
    questsEl.hidden = !questsEl.childElementCount;

    const got = Store.data.stickers;
    clear(shelfEl);
    const strip = el('div.strip');
    if (got.length){
      got.slice(-16).reverse().forEach(k => strip.append(el('span' + (Store.isPending(k) ? '.pending' : ''), { text: stickerFor(k) })));
    } else {
      strip.append(el('span.empty', { text: 'レベルを クリアすると シールが たまるよ' }));
    }
    /* The padlocked 1ねんせい cards are meant to be the reason to fill the shelf, but
       on a 1024×768 iPad the world list scrolls: 509px of window over 1079px of map,
       so those cards sit at y≈900 and a child has to scroll two thirds of the way
       down to meet them. Rather than move the map around, the count goes on the one
       strip that is on screen whatever happens — the shelf the child already taps. */
    const gate = Progress.preStickers();
    const toGo = Progress.g1Open() ? 0 : 1;
    shelfEl.classList.toggle('nearly', toGo > 0 && toGo <= 6);
    /* The same picture the result screen draws: a bar filling towards 🎓, and dots to
       count once there are few enough. 「あと 34レベル」 is a number for the adult,
       so it stays in the label for them. */
    let sub;
    if (toGo){
      const say = '1ねんせいの きょうしつは、あそびごとに じゅんびが できると ひらくよ';
      const middle = el('span.leftdots');
      for (let i = 0; i < 3; i++) middle.append(el('span', { text: '●' }));
      sub = el('small.togo', { role: 'img', 'aria-label': say, title: say },
        middle, el('span', { text: '🎓', 'aria-hidden': 'true' }));
    } else {
      sub = el('small', { text: Progress.g1Open() ? '1ねんせいの きょうしつが ひらいて いるよ'
                                                  : 'タップで シールブック' });
    }
    shelfEl.append(
      el('span.bk', { text: '📖' }),
      el('div.lbl', null, 'シール ' + got.length + 'まい', sub),
      strip);

    /* how many banners share the row decides how much of each one fits: with three
       or four up, the mascot's width is worth more to the name than the mascot is */
    const shown = [...dailiesEl.children].filter(c => !c.hidden).length;
    dailiesEl.className = 'dailies n' + shown;

    clear(worldsEl);
    WORLDS.forEach(w => {
      const games = Games.list.filter(g => g.world === w.id);
      if (!games.length) return;
      const grid = el('div.gamegrid');
      const shut = games.every(g => !stageOpen(g));
      games.forEach(g => grid.append(stageOpen(g) ? gameCard(g) : lockedCard(g)));
      // the world's own name already says 1ねんせい; a second badge saying it again
      // only takes the room the name needs to stay on one line
      worldsEl.append(el('div.world' + ((w.stage || 'pre') !== 'pre' ? '.newstage' : '')
        + (shut ? '.shut' : ''),
        { style: { '--wc': w.color } },
        el('h3', null, el('span.chip', { text: w.name }),
          el('span.sub', { text: shut ? 'じゅんびが できると ひらくよ' : w.sub })), grid));
    });
  }
  return { build, render };
})();

/* ---------------------------------------------------------- LEVELS */
const Levels = (() => {
  let node, titleEl, listEl, game = null;
  function build(){
    if (node) return node;
    titleEl = el('h2');
    listEl  = el('div.levels');
    node = el('div#levels', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        titleEl, speakBtn(() => speech())),
      listEl);
    return UI.register('levels', node);
  }
  function speech(){
    return game ? game.name + '。レベルを選んでね。金色で囲まれたレベルは、金のシールをもらっているよ。鍵のついたレベルは、前のレベルをクリアすると遊べるよ。' : '';
  }
  function render(g){
    build();
    game = g;
    titleEl.textContent = g.ico + '　' + g.name;
    clear(listEl);
    g.levels.forEach((lv, i) => {
      const stars = Store.stars(g.id, i);
      const unlocked = Store.levelUnlocked(g.id, i);
      const goldKey = g.id + ':' + i + ':g';
      const gold = Store.hasSticker(goldKey);
      const card = el('button.levelcard' + (unlocked ? '' : '.locked') + (gold ? '.gold' : ''), {
        type: 'button', style: { '--lc': g.color },
        title: lv.t + (gold ? '　きんの シールを ゲット' : '　きんの シールは まだ'),
        onclick(){
          Sound.sfx.tap();
          if (!unlocked){ Sound.say('前のレベルをクリアすると、遊べるよ。', { delay: 120 }); return; }
          if (g.intro !== false && !Store.introduced(g.id, i)) FirstSteps.open(g, i);
          else Session.startLevel(g, i);
        }
      },
        el('div.num', { text: unlocked ? String(i + 1) : '🔒' }),
        el('div.body', null, el('div.t', { text: lv.t }), el('div.d', { text: lv.d })),
        // ★★★ is "all right first time"; this is "and without counting"
        Store.isSwift(g.id, i) ? el('span.swiftmark', { title: 'すぐ こたえられた', text: '⚡️' }) : null,
        UI.stars(stars),
        gold ? el('span.goldmark', {
          text: stickerFor(goldKey), 'aria-label': 'きんの シールを ゲット'
        }) : null);
      const entry = el('div.level-entry', null, card);
      if (unlocked && g.intro !== false) entry.append(el('button.btn.first-retry', {
        type: 'button', 'aria-label': lv.t + 'の やりかたを みる', title: 'もういちど やりかたを みる',
        onclick(){ Sound.sfx.tap(); FirstSteps.open(g, i); }
      }, '👀'));
      listEl.append(entry);
    });

  }
  return { build, render, speech, get game(){ return game; } };
})();

/* ---------------------------------------------------------- RESULT */
const Result = (() => {
  let node, inner, lastSpoken = '';
  const DAY_ENOUGH = 18;          // questions: one level (8) and one きょうの れんしゅう (10)
  function build(){
    if (node) return node;
    inner = el('div.inner');
    /* Every other screen can say itself again; this was the one that could not —
       and it is the one where a child who cannot read has to pick a button. */
    node = el('div#result', null, speakBtn(() => lastSpoken), inner);
    return UI.register('result', node);
  }
  function show(r){
    build();
    clear(inner);
    const nxt = r.mode === 'level' ? r.levelIndex + 1 : -1;
    const canNext = r.mode === 'level' && nxt < r.game.levels.length && Store.levelUnlocked(r.game.id, nxt);
    const shakyKeys = (r.shaky || []).map(x => x.key).filter(k => Store.factOrigin(k));
    const aimed = r.mode === 'focus' ? (r.focusKeys || []) : shakyKeys;
    /* Practising what just went wrong leads — unless the level went well, or it
       went badly enough that the words on this screen say「もう いちど」. After ★★
       the thing to do is the next level; after ★0 in a level the heading and the
       voice both say try again, and a bright「とっくん」there started a different
       ten questions under a child who had pressed the button they were told about.
       Either way the facts stay one tap away as the second button. */
    const drill = aimed.length > 0 && r.mode !== 'diagnostic' && r.mode !== 'focus' && r.mode !== 'adventure';
    const lead = drill && !(canNext && r.stars >= 2) && !(r.mode === 'level' && r.stars === 0);
    const supportedRetry = r.mode === 'level' && r.stars === 0 && r.game.intro !== false;
    const msg = r.mode === 'diagnostic' ? 'さいしょの ぼうけん クリア！'
              : r.mode === 'adventure' ? 'ぼうけん かんせい！'
              : r.stars === 3 ? 'パーフェクト！'
              : r.stars === 2 ? 'よく できました！'
              : r.stars === 1 ? 'クリア！'
              : supportedRetry ? 'やりかたを みてみよう'
              : lead ? 'おしい！ とっくん してみよう'
              : 'おしい！ もう いちど やってみよう';
    // the children read `msg`, so it stays hiragana; the voice gets kanji, which
    // is what lets a Japanese engine phrase it instead of droning it out
    const spoken = (r.unlockedG1 ? 'じゅんびが できたね！小学校一年生の新しい問題ができるよ！'
                 : r.mode === 'diagnostic' ? '最初の冒険、クリア！おすすめを見つけたよ。'
                 : r.mode === 'adventure' ? '小さな冒険、完成！ヒントを使って、最後までできたね。'
                 : r.swift ? 'パーフェクト！すぐ答えられたね！'
                 : r.stars === 3 ? 'パーフェクト！'
                 : r.stars === 2 ? 'よくできました！'
                 : r.stars === 1 ? 'クリア！'
                 : supportedRetry ? '一緒に一つやってみよう。'
                 : lead ? '惜しい！特訓してみよう。'
                 : '惜しい！もう一度やってみよう。');
    // 「やったね」 and 「やったね、みおちゃん」 are not the same sentence to a five-year-old
    const called = Store.name && r.stars >= 2 && r.mode !== 'diagnostic'
      ? Store.name + '、' : '';
    /* A run that earned nothing is not shown three empty stars, a sad face and
       「8もん中 2もん」: that is a verdict. It is shown that the child got to the end.
       The count is for a run good enough to be proud of; the parent page has the rest. */
    const tried = r.mode !== 'diagnostic' && r.stars === 0;
    inner.append(
      mascotSVG(tried ? 'happy' : 'cheer', tried ? 'talk' : 'cheer'),
      r.mode === 'diagnostic'
        ? el('div.diagnostic-badge', { text: '10もん たんけん できたね' })
        : r.mode === 'adventure' ? el('div.diagnostic-badge', { text: '🧭　さいごまで できたね' })
        : tried ? el('div.tried', { text: 'さいごまで がんばったね' })
        : UI.stars(r.stars, true),
      el('div.result-msg', { text: msg }));
    if (r.mode === 'diagnostic') inner.append(el('div.result-sub', { text: 'ぴったりの はじまりを みつけたよ' }));
    else if (r.stars >= 2 && r.mode !== 'adventure') inner.append(el('div.result-sub', { text: `${r.total}もんの うち ${r.right}もん いっかいめで せいかい` }));
    /* Every level cleared is a step towards a door the child can already see on
       the home screen. Saying how many are left, at the moment one is earned, is
       what turns「クリアした」into「あと 3レベル」. Levels, not stickers: the gold
       ones no longer move this number, so counting stickers here would stall. */
    const stickers = r.stickers || [];
    /* 「あと 47レベル」 is a number a five-year-old cannot hold. A bar filling up
       towards 🎓 is something they can see move; and once few enough are left to
       count on a hand or two, they become dots to count. The number stays for the
       adult, in the label. It rides inside the sticker card: one piece of news. */
    const coloured = r.confirmed || [];
    let toDoor = null;
    if ((stickers.length || coloured.length) && !r.unlockedG1 && !Progress.g1Open()){
      const st = Progress.preStickers();
      const left = 1;
      if (left){
        const say = '1ねんせいの きょうしつは、あそびごとに じゅんびが できると ひらくよ';
        let middle;
        if (left <= 10){
          middle = el('div.leftdots');
          for (let i = 0; i < left; i++) middle.append(el('span', { text: '●' }));
        } else {
          middle = el('div.gauge', null, el('div.fill', { style: { width: '35%' } }));
        }
        toDoor = el('div.stagenext' + (left <= 10 ? '.nearly' : ''),
          { role: 'img', 'aria-label': say, title: say },
          el('span.mk', { text: '🔒' }), middle, el('span.mk', { text: '🎓' }));
      }
    }
    /* The last sticker. This is the one screen in the app that says the child has
       finished 入学前 — it has to say it in words a six-year-old reads, on the
       screen they are already looking at, not in a menu they might find later. It
       goes above the sticker and the mission: on a screen this tall, the thing
       that has to be read first cannot be the thing furthest down. */
    if (r.unlockedG1){
      inner.append(el('div.unlocked', null,
        el('div.e', { text: '🎓' }),
        el('div.l', { text: 'じゅんびが できた！' }),
        el('b', { text: 'しょうがっこう 1ねんせいの あたらしい もんだいが できるよ！' }),
        el('div.l', { text: '「1ねんせいの きょうしつ」が ホームに ふえたよ' })));
    }
    /* The thing ★★★ could never say. These levels are for an answer that arrives,
       and a child who counted their way to every right answer used to get exactly
       the same three stars as one who remembered. */
    if (r.swift){
      inner.append(el('div.swift', null,
        el('span.mk', { text: '⚡️' }), 'かぞえないで こたえられたね！'));
    }
    if (r.milestone){
      inner.append(el('button.result-milestone', { type: 'button',
        onclick(){ Sound.sfx.tap(); ProgressAlbum.open(); } },
        el('span', { text: '📒', 'aria-hidden': 'true' }),
        el('span', { text: (r.milestone.label ? r.milestone.label + '　' : '')
          + Store.milestoneText(r.milestone.kind) })));
    }
    /* Name what went wrong. "62%" tells a child nothing; "3と7" is something they
       can carry to tomorrow — and it is exactly what the app will bring back.

       Named, not pressed: each name used to be a small button of its own — three
       43px buttons that all started the same practice and looked like three
       different choices. The way back to them is the one「とっくん」button below. */
    const runFocus = () => { Sound.sfx.tap(); Session.startFocus(aimed, { n: 10 }); };
    if (r.shaky && r.shaky.length){
      const list = el('div.shakylist');
      r.shaky.forEach(x => list.append(el('span.shakyitem', { text: x.label })));
      inner.append(el('div.shaky', null,
        el('div.l', { text: 'つぎは これを もういちど' }), list));
    }
    /* A sticker confirmed by today's check turns from outline to colour — and that
       is the moment the door gauge moves, so the gauge rides with it. */
    if (coloured.length){
      inner.append(el('div.newsticker.confirmed', null,
        el('div.e', { text: coloured.map(x => x.emoji).join(' ') }),
        el('div.l', { text: 'シールに いろが ついた！' }),
        stickers.length ? null : toDoor));
    }
    if (stickers.length){
      const gold = stickers.some(x => x.gold), provisional = stickers.some(x => x.pending);
      const adventure = stickers.some(x => x.adventure);
      const chosen = r.rewardTarget && stickers.some(x => x.emoji === stickerFor(r.rewardTarget.key));
      inner.append(el('div.newsticker' + (gold ? '.gold' : '') + (provisional ? '.pending' : ''), null,
        el('div.e', { text: stickers.map(x => x.emoji).join(' ') }),
        el('div.l', { text: adventure ? 'ぼうけんシール を ゲット！'
                          : chosen ? 'えらんだ シールを ゲット！'
                          : provisional ? 'かりの シール！ べつの ひに また できたら いろが つくよ'
                          : stickers.length > 1 ? 'シール と きんの シール を ゲット！'
                          : gold ? 'きんの シール を ゲット！' : 'シール を ゲット！' }),
        toDoor));
    }
    if (r.mode === 'diagnostic' && r.recommended){
      const g = Games.byId[r.recommended.gameId];
      if (g){
        const lv = g.levels[r.recommended.levelIndex] || g.levels[0];
        inner.append(el('div.diagnostic-next', null,
          el('div.l', { text: 'つぎの おすすめ' }),
          el('b', { text: g.name + '　《' + lv.t + '》' })));
      }
    }
    /* A real-world mission is the next learning action after a successful run.
       It remains visible alongside a sticker: earning a sticker must not hide the
       bridge from screen maths to objects at home. */
    if (!r.unlockedG1 && !(r.shaky && r.shaky.length)
        && (r.mode === 'daily' || (r.mode === 'level' && r.stars >= 1))) {
      /* one piece of news per screen: the classroom outranks today's kitchen-table
         task, and so do a new sticker and the facts to practise — the mission comes
         up on the next pass */
      inner.append(Missions.resultCard(r.lastGameId));
    }
    const actions = el('div.result-actions');
    /* A picture first on every way off this screen: a child who cannot read
       「つぎの レベルへ」yet can still tell ▶ from ↻ from 🏠. */
    /* The voice says which button is the way on, by its colour: 「クリア！」 alone
       left a child who cannot read in front of three or four buttons to guess from. */
    let nextLine = '';
    const act = (cls, icon, label, onclick, say) => {
      if (!nextLine && say && /btn-accent/.test(cls)) nextLine = 'オレンジのボタンで、' + say;
      return el('button.btn' + cls, { onclick },
        el('span.bi', { text: icon, 'aria-hidden': 'true' }), el('span.bl', { text: label }));
    };
    const home = () => { Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); };
    const again = r.stars === 0 && !lead;
    if (r.mode === 'focus'){
      actions.append(act('.btn-accent.primary', '🎯', 'もういちど', runFocus, 'もう一度特訓できるよ。'));
    } else if (lead){
      actions.append(act('.btn-accent.primary', '🎯', 'とっくん する', runFocus, '特訓できるよ。'));
    }
    if (r.mode === 'diagnostic'){
      actions.append(act('.btn-accent.primary', '🗺️', 'おすすめで あそぶ',
        () => { Sound.sfx.tap(); Diagnostic.startRecommended(); }, 'おすすめを遊べるよ。'));
    } else if (r.mode === 'level'){
      // when nothing was earned, another go is the obvious next step, not a footnote
      const againBtn = act(again && !supportedRetry ? '.btn-accent.primary' : '', '↻', 'もういちど',
        () => { Sound.sfx.tap(); Session.startLevel(r.game, r.levelIndex); }, 'もう一度できるよ。');
      if (supportedRetry) actions.append(act('.btn-accent.primary', '👀', 'いっしょに ひとつ',
        () => { Sound.sfx.tap(); FirstSteps.open(r.game, r.levelIndex); }, '一緒に一つできるよ。'));
      const nextBtn = canNext ? act(lead || again ? '' : '.btn-accent.primary', '▶', 'つぎの レベルへ',
        () => { Sound.sfx.tap();
          if (r.game.intro !== false && !Store.introduced(r.game.id, nxt)) FirstSteps.open(r.game, nxt);
          else Session.startLevel(r.game, nxt);
        }, '次のレベルに行けるよ。') : null;
      /* the way on is also the first button, not only the brightest: after a good
         run「もういちど」 in front of it read as the suggestion */
      if (nextBtn && !lead && !again) actions.append(nextBtn, againBtn);
      else actions.append(againBtn, ...(nextBtn ? [nextBtn] : []));
      if (drill && !lead) actions.append(act('', '🎯', 'とっくん する', runFocus));
    } else if (r.mode === 'daily'){
      actions.append(act(again ? '.btn-accent.primary' : '', '↻', 'もういちど',
        () => { Sound.sfx.tap(); Session.startDaily(10); }, 'もう一度できるよ。'));
    } else if (r.mode === 'adventure'){
      actions.append(act('', '🧭', 'もういちど',
        () => { Sound.sfx.tap(); Session.startAdventure(r.adventureTarget); }, 'もう一度、小さな冒険ができるよ。'));
    }
    if (r.unlockedG1){
      actions.append(act('.btn-accent.primary', '🎓', '1ねんせいの きょうしつへ', home, '一年生の教室に行けるよ。'));
    }
    const homeBtn = act(r.mode === 'level' || r.mode === 'diagnostic' || r.mode === 'adventure' || lead || again || r.mode === 'focus' || r.unlockedG1 ? '' : '.btn-accent',
      '🏠', 'あそびを えらぶ', home, '遊びを選べるよ。');
    actions.append(homeBtn);
    /* 1日10分 — one level and one れんしゅう — is the whole plan, and nothing on the
       child's side of the app ever said so: every result offered another go, and
       とっくん's「もういちど」went round for as long as the child kept pressing it.
       Once today holds that much, this screen says it is enough and the bright
       button is the way home. Nothing is locked; the other buttons still work. */
    if (r.mode !== 'diagnostic' && !r.unlockedG1 && Store.todayCount() >= DAY_ENOUGH){
      inner.append(el('div.enough', null,
        el('span.mk', { text: '🌙', 'aria-hidden': 'true' }), 'きょうは ここまで で じゅうぶん！ また あした あそぼう'));
      $$('.btn', actions).forEach(b => b.classList.remove('btn-accent', 'primary'));
      homeBtn.classList.add('btn-accent', 'primary');
      homeBtn.querySelector('.bl').textContent = 'きょうは おしまい';
      actions.prepend(homeBtn);
      nextLine = '今日は、ここまでで十分だよ。オレンジのボタンで、おしまいにしよう。';
    }
    inner.append(actions);
    UI.show('result', { replace: true });
    const news = (coloured.length ? 'シールに、色がついたね！' : '')
      + (stickers.some(x => x.pending) ? '別の日にまたできたら、シールに色がつくよ。' : '');
    const albumNews = r.milestone ? (r.milestone.label ? r.milestone.label + '。' : '')
      + Store.milestoneText(r.milestone.kind) + '。' : '';
    lastSpoken = called + spoken + albumNews + news + nextLine;
    Sound.say(lastSpoken, { delay: 700 });
    for (let i = 0; i < r.stars; i++) setTimeout(() => Sound.sfx.star(i), 400 + i * 260);
  }
  return { show, build };
})();

/* ---------------------------------------------------------- STICKER BOOK */
const Book = (() => {
  let node, grid, count, missing, headEl;
  function build(){
    if (node) return node;
    grid = el('div.book');
    count = el('div.aim');
    /* 「あと 4レベル」 without saying *which* four is a number a child cannot act on
       and a parent cannot help with: the shelf's empty slots are anonymous dots, and
       working out which level each one belongs to means counting slot positions. */
    missing = el('div.book-todo');
    node = el('div#book', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); UI.show('home', { replace: true }); } }, '←'),
        headEl = el('h2'), speakBtn(() => speech())),
      count, missing, grid);
    return UI.register('book', node);
  }
  /** Said on the way in: the count under the heading is a sentence a child cannot read yet. */
  function speech(){
    if (Progress.g1Open()) return 'シールブックだよ。集めたシールが並んでいるよ。';
    const st = Progress.preStickers();
    const left = Math.max(0, st.total - st.got);
    return 'シールブックだよ。あと' + left + 'レベルで、1年生の教室が開くよ。';
  }
  function open(){
    render();
    UI.show('book');
    Sound.say(speech(), { delay: 200 });      // after the switch, which hushes
  }
  function render(){
    build();
    headEl.textContent = '📖　' + (Store.name ? Store.name + 'の シールブック' : 'シールブック');
    clear(grid);
    let got = 0;
    const drawSlots = keys => keys.forEach(key => {
      const has = Store.hasSticker(key);
      if (has) got++;
      grid.append(el('div.sticker' + (has ? (key.endsWith(':g') ? '.got.gold' : '.got') : '')
          + (has && Store.isPending(key) ? '.pending' : ''),
        { text: has ? stickerFor(key) : '･' }));
    });
    /* The 入学前 shelf is the one that opens the 小1 classroom, so it is the one
       this page counts towards a goal. The classroom's own stickers go in a second
       group below, and only once it is open — an empty row of slots for a world a
       child cannot reach would make the goal look further away than it is. */
    const pre = Progress.preStickers();
    drawSlots(Progress.slots('pre'));
    Store.data.stickers.filter(k => k.indexOf('daily:') === 0 || k.indexOf('focus:') === 0 || k.indexOf('adventure:') === 0).forEach(k => {
      got++;
      const isAdventureMemento = k.indexOf('adventure:') === 0;
      grid.append(el('div.sticker.got' + (isAdventureMemento ? '.adventure' : '.gold'), { text: stickerFor(k) }));
    });
    if (Progress.g1Open()){
      grid.append(el('div.bookgroup', { text: '🎓　1ねんせいの きょうしつ' }));
      drawSlots(Progress.slots('g1'));
    } else {
      /* Shown, but plainly not part of the count above: a shelf a child can see
         waiting for them is the reason to fill the one they are on. */
      grid.append(el('div.bookgroup.shut', { text: '🔒　1ねんせいの きょうしつ　レベルを ぜんぶ クリアすると ここが ひらくよ' }));
      Progress.slots('g1').forEach(() => grid.append(el('div.sticker.shut', { text: '🔒' })));
    }
    /* Two numbers, and they count different things on purpose: the stickers are
       the shelf (96 of them, gold included), the levels are the door (48). Saying
       「あと ◯まい」for the door would stall the moment a gold sticker was earned
       for a level that was already cleared. */
    /* Name the levels the door is still waiting for, and make each one a way in.
       The same list the「いまの おすすめ」walks, shown all at once. */
    clear(missing);
    const todo = Progress.gateSlots('pre')
      .filter(k => !Store.hasConfirmed(k))
      .map(k => {
        const cut = k.lastIndexOf(':');
        const g = Games.byId[k.slice(0, cut)], i = Number(k.slice(cut + 1));
        return g && g.levels[i] ? { g, i, lv: g.levels[i], waiting: Store.isPending(k) } : null;
      })
      .filter(Boolean);
    if (todo.length){
      const row = el('div.todorow');
      todo.slice(0, 10).forEach(({ g, i, lv, waiting }) => {
        const open = Store.levelUnlocked(g.id, i);
        row.append(el('button.todochip' + (open ? '' : '.shut') + (waiting ? '.pending' : ''), {
          type: 'button', style: { '--lc': g.color },
          title: g.name + '　' + lv.t,
          onclick(){
            Sound.sfx.tap();
            if (open){
              if (g.intro !== false && !Store.introduced(g.id, i)) FirstSteps.open(g, i);
              else Session.startLevel(g, i);
              return;
            }
            // not open yet: show the child where it lives, and what comes first
            Levels.render(g);
            UI.show('levels');
          }
        },
          el('span.i', { text: open ? g.ico : '🔒' }),
          el('span.t', null, g.name, el('small', { text: lv.t + (waiting ? '・たしかめ' : '') }))));
      });
      missing.append(
        el('div.l', { text: 'のこりの レベル' + (todo.length > 10 ? '（さいしょの 10こ）' : '') }),
        row);
    }

    const left = Math.max(0, pre.total - pre.got);
    const waiting = Progress.pendingCount('pre');
    count.innerHTML = `<b>${got}まい</b> あつめたよ　･　レベルを クリアすると シールが 1まい。ぜんぶ せいかい で きんいろの シール`
      + (waiting ? `<br>かりの シール ${waiting}まい（べつの ひに また できたら いろが つくよ）` : '')
      + (left
        ? `<br><b>あと ${left}レベル</b> クリアすると しょうがっこう 1ねんせいの もんだいが ひらくよ（${pre.got}／${pre.total}）`
        : '<br><b>レベルを ぜんぶ クリアしたね！</b> しょうがっこう 1ねんせいの もんだいが できるよ');
  }
  return { build, render, open, speech };
})();
