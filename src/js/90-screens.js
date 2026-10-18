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
          } else if (Store.round() === 2){
            Home.render(); UI.show('home', {replace:true});
          } else if (!Store.data.orientation) Orientation.open();
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
    { icon: '🧩', text: 'まずは いっしょに ひとつ やってみよう', say: 'まずは、一緒に一つやってみよう。' }
  ];
  function build(){
    if (node) return node;
    card = el('div.guidecard');
    dots = el('div.stepdots');
    next = el('button.btn.btn-accent', { type: 'button', onclick(){
      Sound.sfx.tap();
      if (step < pages.length - 1){ step++; render(); }
      else { Store.completeOrientation(); Home.render(); UI.show('home', { replace: true }); }
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

/* ---------------------------------------------------------- CLASSROOM PREPARATION */
const G1Preparation = (() => {
  let node, heading, list, active = null;
  function speech(){
    if (!active) return '';
    const needed = Progress.preparation(active).filter(p => !p.ready);
    return active.name + 'の準備だよ。' + (needed.length
      ? 'この遊びから始めよう。' + needed.map(p => p.game.name + '、レベル' + (p.levelIndex + 1) + '、' + p.game.levels[p.levelIndex].t).join('。')
      : '準備ができたね。一年生の遊びに進めるよ。');
  }
  function build(){
    if (node) return;
    heading = el('h2'); list = el('div.g1-preparation-list');
    node = el('div#g1-preparation', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type:'button', 'aria-label':'ホームに もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home'); } }, '←'),
        heading, speakBtn(speech)),
      el('p.g1-preparation-note', { text:'この あそびの じゅんびを しよう。できている あそびには ✓ が つくよ' }), list);
    UI.register('g1-preparation', node);
  }
  function open(game){
    build(); active = game; heading.textContent = game.name + 'の じゅんび'; clear(list);
    Progress.preparation(game).forEach(p => {
      const lv = p.game.levels[p.levelIndex];
      list.append(el('button.btn.preparation-level', { type:'button',
        dataset:{ game:p.game.id, level:String(p.levelIndex) },
        'aria-label':p.game.name + '、レベル' + (p.levelIndex + 1) + '、' + lv.t + (p.ready ? '、じゅんび できた' : '、あそびに いく'),
        onclick(){
          Sound.sfx.tap();
          if (levelOpen(p.game, p.levelIndex)){
            if (p.game.intro !== false && !Store.introduced(p.game.id, p.levelIndex)) FirstSteps.open(p.game, p.levelIndex);
            else Session.startLevel(p.game, p.levelIndex);
          } else { Levels.render(p.game); UI.show('levels'); Sound.say('まず、前のレベルから遊ぼう。' + Levels.speech(), { delay:120 }); }
        }
      }, el('span', {text:p.game.ico}), el('span.copy', null,
        el('b', {text:p.game.name}), el('small', {text:'レベル ' + (p.levelIndex + 1) + '　' + lv.t})),
        el('span', {text:p.ready ? '✓ じゅんび できた' : '▶'})));
    });
    if (stageOpen(game)) list.append(el('button.btn.btn-accent', { type:'button', text:'🎓 ' + game.name + 'で あそぶ',
      onclick(){ Sound.sfx.tap(); Levels.render(game); UI.show('levels'); Sound.say(Levels.speech(), {delay:120}); } }));
    UI.show('g1-preparation'); Sound.say(speech(), {delay:180});
  }
  return { open, speech };
})();

/* ---------------------------------------------------------- HOME */
const Home = (() => {
  let node, worldsEl, starEl, dailyEl, focusEl, recommendEl, reviewEl, missionResumeEl, voiceWarnEl, shelfEl, dailiesEl, questsEl, roundsEl;
  let primaryEl, choicesEl, moreEl, diagnosticEl;
  let contentEl, todayEl, todayHeading, endedEl, moreContent, moreSummary;
  let parentBtn;
  let renderedDay;
  let progressEl, progressTarget;
  let resumeMoreEl, resumeList, resumeNotice;

  // A sleeping PWA can return to yesterday's Home without a page reload.
  // Refresh only the visible Home when its local calendar day has changed.
  function refreshDay(){
    if (node && !document.hidden && UI.currentName() === 'home'
        && renderedDay !== new Date().toDateString()) render();
  }
  window.addEventListener('focus', refreshDay);
  window.addEventListener('pageshow', refreshDay);
  document.addEventListener('visibilitychange', refreshDay);

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
    recommendEl = el('button.daily.recommended', { type:'button' });
    reviewEl = el('button.daily.reviewmission', { type: 'button', hidden: true });
    missionResumeEl = el('button.daily.mission-resume', { type: 'button', hidden: true });
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
    primaryEl = el('button.daily.home-primary', { type: 'button' });
    resumeList = el('div.resume-options');
    resumeMoreEl = el('details.resume-more', {hidden:true}, el('summary'), resumeList);
    resumeNotice = el('p.resume-notice', {hidden:true,role:'status','aria-live':'polite'});
    choicesEl = el('div.home-choices');
    dailiesEl = el('div.dailies', null, recommendEl, dailyEl, missionResumeEl, reviewEl, focusEl);
    questsEl = el('div.home-quests');
    roundsEl = el('div.home-rounds');
    diagnosticEl = el('button.daily.diagnostic', { type: 'button',
      onclick(){ Sound.sfx.tap(); Session.startDiagnostic(); } },
      el('span.ico', { text: '🧭', 'aria-hidden': 'true' }),
      el('span.grow', null, el('span.t', { text: 'はじまりを さがす' }),
        el('span.s', { text: '10もんで ぴったりの あそびを みつけよう' })),
      el('span.go', { text: '▶', 'aria-hidden': 'true' }));
    moreSummary = el('summary');
    moreContent = el('div.home-more-content', null, dailiesEl, diagnosticEl, questsEl, worldsEl, shelfEl,
      el('section.home-round-section', null, el('h2', { text: 'もういちどの ぼうけん' }), roundsEl));
    moreEl = el('details.home-more', null, moreSummary, moreContent);
    todayHeading = el('h2', {text:'きょうは ここから'});
    endedEl = el('div.day-ending', {hidden:true});
    progressEl = el('div.home-short-progress', {hidden:true});
    todayEl = el('section.home-today', {'aria-label':'きょうの ぼうけん'}, todayHeading, primaryEl, resumeMoreEl, progressEl, endedEl);
    contentEl = el('div.home-content', null, voiceWarnEl, resumeNotice, todayEl, choicesEl, moreEl);
    node.append(contentEl);
    return UI.register('home', node);
  }

  const BANNER_ICON = { recommend: '🗺️', first: '🤝', daily: '📅', review: '💬', focus: '🎯' };
  function homeSpeech(){
    if (Store.endedToday()){
      const summary = Store.todaySummary();
      return '今日はここまで。' + (summary.total ? summary.total + '問遊んだね。' : '')
        + '今日取り組んだことを見てみよう。また明日、遊ぼう。もっと遊びたいときだけ、下の「もうすこしあそぶ」を開いて選べるよ。';
    }
    const title = primaryEl && $('.t', primaryEl), detail = primaryEl && $('.s', primaryEl);
    return (title ? title.textContent + '。' : '') + (detail ? detail.textContent + '。' : '')
      + (progressTarget ? progressTarget.info.speech : '')
      + 'ほしいシールから選んでもいいよ。ほかの遊びと地図を開くと、好きな遊びも選べるよ。';
  }
  function endingEntry(entry){
    let icon, title, note;
    if (entry.type === 'review'){
      const match = /^(r2|r2chapter):(\d+)$/.exec(entry.key);
      const item = match && (match[1] === 'r2' ? TextbookReview.lessons : TextbookReview.chapters)[Number(match[2])];
      if (!item) return null;
      icon = '📘'; title = item.title; note = 'ほんで とりくんだね';
    } else if (entry.type === 'transfer'){
      const item = TransferAdventure.missionFor(entry.key);
      if (!item) return null;
      icon = item.icon; title = item.title; note = 'ぼうけんに とりくんだね';
    } else {
      const game = Games.byId[entry.gameId], level = game && Array.isArray(game.levels) && game.levels[entry.levelIndex];
      if (!level) return null;
      icon = game.ico; title = entry.label || game.name + '《' + level.t + '》';
      note = entry.type === 'milestone' ? Store.milestoneText(entry.kind) : 'とりくんだね';
    }
    return el('li.day-ending-entry', {'data-round':entry.round, 'data-kind':entry.type},
      el('span.day-ending-icon', {'aria-hidden':'true', text:icon}),
      el('div', null, el('b', {text:title}), el('span', {text:(entry.round === 2 ? '２しゅうめで　' : '') + note})));
  }
  function renderEnding(){
    const ended = Store.endedToday();
    node.classList.toggle('day-ended', ended);
    todayHeading.textContent = ended ? 'きょうは ここまで' : 'きょうは ここから';
    clear(moreSummary);
    moreSummary.append(el('span', {'aria-hidden':'true', text:ended ? '🌱' : '🗺️'}),
      ended ? 'もうすこし あそぶ（じぶんで えらぶ）' : 'ほかの あそび・ちず');
    endedEl.hidden = !ended;
    if (!ended){
      todayEl.insertBefore(primaryEl, endedEl);
      todayEl.insertBefore(resumeMoreEl, endedEl);
      todayEl.insertBefore(progressEl, endedEl);
      contentEl.insertBefore(choicesEl, moreEl);
      return;
    }
    // Keep every optional entrance, including an unfinished visit, behind the
    // child's explicit choice. The ending marker never consumes its checkpoint.
    moreContent.prepend(primaryEl, resumeMoreEl, progressEl, choicesEl);
    moreEl.open = false;
    const summary = Store.todaySummary(), entries = summary.entries.map(endingEntry).filter(Boolean).slice(0,3);
    clear(endedEl);
    endedEl.append(el('div.day-ending-head', null, el('span', {'aria-hidden':'true', text:'🌙'}),
      el('div', null, el('h3', {text:'きょうの できた'}),
        el('p', {text:summary.total ? summary.total + 'もん あそんだね' : 'じぶんの ペースで いいよ'}))),
      entries.length ? el('ul.day-ending-list', null, entries) : null,
      el('p.day-ending-bye', {text:'また あした あそぼう'}),
      el('div.day-ending-actions', null,
        el('button.btn.btn-ghost', {type:'button', text:'📒 できたアルバム', onclick(){ Sound.sfx.tap(); ProgressAlbum.open(); }}),
        el('button.btn.btn-ghost', {type:'button', text:'🏡 じぶんの しま', onclick(){ Sound.sfx.tap(); StickerWorld.open(); }})),
      summary.total ? el('details.day-ending-mission', null,
        el('summary', { text:'🏡 おうちで あそぶ（やりたい ときに）' }),
        Missions.resultCard((summary.entries.find(e => e.gameId) || {}).gameId)) : null);
  }
  function endToday(){
    Store.endToday(); Store.flush();
    Sound.hush(); render(); UI.show('home', {replace:true});
    Sound.say(homeSpeech(), {delay:180});
  }
  function choosePlay(){
    render(); UI.show('home', {replace:true});
    // Choosing another activity is separate from ending the day. The child has
    // explicitly asked for the map, including after optional play on an ended day.
    moreEl.open = true;
    requestAnimationFrame(() => {
      if (UI.currentName() !== 'home') return;
      moreSummary.focus({preventScroll:true}); moreEl.scrollIntoView({block:'start'});
    });
    Sound.say('別の遊びを選べるよ。地図や、ほしいシールから選んでみよう。', {delay:120});
  }
  // A map visit is transient navigation, separate from the learning checkpoint.
  // Re-render first so a return after midnight still shows today's information.
  function captureMap(gameId){
    return {round:Store.round(), gameId, scroll:contentEl.scrollTop,
      details:Array.from(node.querySelectorAll('details')).map(d => ({key:d.className, open:d.open}))};
  }
  function returnToMap(saved){
    render();
    const valid = saved && saved.round === Store.round();
    UI.show('home', {replace:true, focus:!valid});
    if (!valid) return;
    Array.from(node.querySelectorAll('details')).forEach(d => {
      const state = saved.details.find(s => s.key === d.className);
      if (state) d.open = state.open;
    });
    contentEl.scrollTop = saved.scroll;
    requestAnimationFrame(() => {
      if (UI.currentName() !== 'home' || saved.round !== Store.round()) return;
      contentEl.scrollTop = saved.scroll;
      const card = Array.from(worldsEl.querySelectorAll('.gamecard')).find(c => c.dataset.gameId === saved.gameId);
      (card || moreSummary).focus({preventScroll:true});
    });
  }
  function banner(button, icon, title, detail, action){
    clear(button).append(el('span.ico', { text:icon, 'aria-hidden':'true' }),
      el('span.grow', null, el('span.t', { text:title }), el('span.s', { text:detail })),
      el('span.go', { text:'▶', 'aria-hidden':'true' }));
    button.onclick = () => { Sound.sfx.tap(); action(); };
  }
  function resumeChoice(choice, button){
    if (button.disabled || !button.isConnected || UI.currentName()!=='home') return;
    button.disabled=true;
    Session.resume(choice);
  }
  function resumeChanged(){
    const scroll=contentEl ? contentEl.scrollTop : 0, open=resumeMoreEl && resumeMoreEl.open;
    render(); UI.show('home',{replace:true,keepScroll:true,focus:false});
    resumeMoreEl.open=!!open;
    resumeNotice.textContent='つづきが かわったよ。もういちど えらぼう。';
    resumeNotice.hidden=false;
    contentEl.scrollTop=scroll;
    const focus = Store.endedToday() ? moreSummary : primaryEl;
    focus.focus({preventScroll:true});
    Sound.say(resumeNotice.textContent,{delay:100});
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
      type: 'button', dataset:{gameId:g.id}, title: g.name + '　★ ' + earned + '/' + max
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

  /* Locked cards explain the preparation for this particular classroom game,
     with named routes to the relevant lessons. */
  function lockedCard(g){
    return el('button.gamecard.locked', {
      type: 'button', dataset:{gameId:g.id}, title: g.name + '　' + Progress.unlockHint(g),
      onclick(){
        Sound.sfx.tap();
        G1Preparation.open(g);
      }
    },
      el('div.ico', { text: g.ico }),
      el('div.nm', { text: g.name }),
      el('div.lockhint', { text: Progress.pathProgress(g).got + '／' + Progress.pathProgress(g).total }),
      el('div.lockmark', { text: '🔒' }));
  }

  function render(){
    build();
    renderedDay = new Date().toDateString();
    clear(roundsEl); roundsEl.append(Rounds.switcher());
    starEl.textContent = String(Store.totalStars());
    /* A quiet mark for the adult, on the button only they press. The child sees a
       dot; the parent sees that the records have not been written out in a month.
       Nothing on the child's half of the screen changes, and nothing is spoken. */
    const due = Store.backupDue();
    parentBtn.classList.toggle('due', !!due);
    parentBtn.setAttribute('title', due
      ? 'おうちのかたへ（記録の書き出しを おすすめします）' : 'おうちのかたへ');
    const n = Store.todayCount(), streak = Store.streak();
    const practiceDone = Store.practiceDoneToday();
    const firstRun = Store.round() === 1 && Store.totalStars() === 0
      && !Store.milestones().some(m => Store.milestoneRank(m.kind) >= Store.milestoneRank('together'));
    const pendingChoices = Session.pendingSummaries(), pending = pendingChoices[0];
    resumeNotice.hidden=true;
    clear(resumeList);
    resumeMoreEl.hidden=pendingChoices.length<2;
    resumeMoreEl.open=false;
    $('summary',resumeMoreEl).textContent='ほかの つづき（'+Math.max(0,pendingChoices.length-1)+'）';
    pendingChoices.slice(1).forEach(choice=>{
      const button=el('button.resume-choice',{type:'button','data-resume-kind':choice.kind,'data-resume-round':choice.round},
        el('span.resume-icon',{'aria-hidden':'true',text:choice.icon}),
        el('span',null,el('b',{text:choice.title}),el('span.resume-detail',null,
          el('span',{text:choice.kind==='review' ? 'ほんの つづき' : choice.kind==='transfer' ? 'ぼうけんの つづき' : 'れんしゅうの つづき'}),
          el('span',{text:choice.remaining ? 'あと '+choice.remaining+'もん' : 'けっかを みよう'}))),
        el('span',{'aria-hidden':'true',text:'▶'}));
      button.onclick=()=>{Sound.sfx.tap();resumeChoice(choice,button);};
      resumeList.append(button);
    });
    const first = firstRun && FirstSteps.target();
    const short = !first && FirstSteps.shortPlan();
    const saved = Store.savedSession();
    const savedFirst = saved && saved.mode === 'first' && saved.firstTarget;
    const savedGame = savedFirst && Games.byId[savedFirst.gameId];
    progressTarget = ShortProgress.current(savedGame ? {game:savedGame,levelIndex:savedFirst.levelIndex} : short);
    clear(progressEl);
    progressEl.hidden = !progressTarget;
    if (progressTarget) progressEl.append(ShortProgress.render(progressTarget.game.id, progressTarget.levelIndex, {compact:true}));
    const rec = Diagnostic.current();
    const recGame = rec && Games.byId[rec.gameId];
    clear(recommendEl);
    recommendEl.hidden = !recGame;
    if (recGame){
      const lv = recGame.levels[rec.levelIndex] || recGame.levels[0];
      banner(recommendEl, BANNER_ICON.recommend, 'いまの おすすめ',
        recGame.name + '　《' + lv.t + '》', () => Diagnostic.startRecommended());
    }
    primaryEl.dataset.action = pending ? 'resume' : first ? 'first' : short ? 'short' : recGame ? 'recommend' : 'daily';
    primaryEl.disabled=false;
    delete primaryEl.dataset.resumeKind; delete primaryEl.dataset.resumeRound;
    if (pending){
      primaryEl.dataset.resumeKind=pending.kind; primaryEl.dataset.resumeRound=pending.round;
      banner(primaryEl, pending.icon, pending.remaining ? 'つづきから　あと ' + pending.remaining + 'もん' : 'できた！ けっかを みよう',
        pending.title + (pending.done ? '　' + pending.done + 'もん できたね' : ''), () => resumeChoice(pending,primaryEl));
    } else if (first){
      banner(primaryEl, BANNER_ICON.first, 'いっしょに ひとつ',
        first.game.name + '　1もんだけ。ヒントを つかって いいよ',
        () => FirstSteps.startOne(first.game, first.levelIndex));
    } else if (short){
      const copy = FirstSteps.planCopy(short);
      banner(primaryEl, short.kind === 'support' ? '🤝' : '👆', copy.title,
        short.game.name + '　' + copy.reason, () => FirstSteps.startPlan(short));
    } else if (recGame){
      const lv = recGame.levels[rec.levelIndex] || recGame.levels[0];
      banner(primaryEl, BANNER_ICON.recommend, 'きょうの おすすめ',
        recGame.name + '　《' + lv.t + '》', () => Diagnostic.startRecommended());
    } else {
      banner(primaryEl, BANNER_ICON.daily, 'きょうの れんしゅう',
        'あそんだ もんだいから 10もん', () => Session.startDaily(10));
    }
    diagnosticEl.hidden = Store.round() !== 1 || !Diagnostic.shouldRun();
    updateVoiceWarning();
    if (!voiceWarnEl.hidden){
      Sound.probeVoice(3000).then(ok => {
        if (ok){ voiceWarnEl.hidden = true; voiceWarnEl.textContent = ''; }
      });
    }
    const homeMission = Missions.pending();
    missionResumeEl.hidden = !homeMission;
    if (homeMission) banner(missionResumeEl, '🏡', 'ミッションの つづき',
      Missions.dateLabel(homeMission) + '・' + homeMission.text, () => Missions.open(homeMission));
    const review = Missions.recentReview();
    reviewEl.hidden = !review;
    if (review){
      clear(reviewEl);
      reviewEl.append(
        el('div.ico', { text: BANNER_ICON.review, 'aria-hidden': 'true' }),
        el('div.grow', null,
          el('div.t', { text: 'できたことの おはなし' }),
          el('div.s', { text: Missions.dateLabel(review) + '・' + review.text })),
        el('div.go', { text: '▶' }));
      reviewEl.onclick = () => Missions.openReview(review);
    }
    const learnedCount = Games.list.reduce((n, g) => n + g.levels.filter((lv, i) => Store.introduced(g.id, i)).length, 0);
    dailyEl.hidden = learnedCount === 0;
    clear(dailyEl);
    dailyEl.classList.toggle('done', practiceDone);
    dailyEl.append(
      el('div.ico', { text: BANNER_ICON.daily, 'aria-hidden': 'true' }),
      el('div.grow', null,
        el('div.t', { text: practiceDone ? 'きょうの れんしゅう おわり！' : 'きょうの れんしゅう' }),
        el('div.s', { text: practiceDone
          ? `きょうは ${n}もん がんばったね　･　${streak}にち れんぞく`
          : 'あそんだ もんだいから 10もん でるよ' })),
      el('div.go', { text: practiceDone ? '🎉' : '▶' }));

    const weak = Diagnostic.weakFacts(4);
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

    /* A small step and a picture-led choice stay beside the one main action.
       Everything else remains available behind an explicit map door. */
    clear(choicesEl);
    const shortStep = FirstSteps.homeCard({ one: !first });
    if (shortStep) choicesEl.append(shortStep);
    const stickerQuest = StickerMissions.homeCard();
    if (stickerQuest) choicesEl.append(stickerQuest);
    choicesEl.hidden = !choicesEl.childElementCount;
    clear(questsEl);
    const textbook = TextbookReview.homeCard();
    if (textbook) questsEl.append(textbook);
    const transfer = TransferAdventure.homeCard();
    if (transfer) questsEl.append(transfer);
    const adventure = Adventures.homeCard();
    if (adventure) questsEl.append(adventure);
    questsEl.hidden = !questsEl.childElementCount;

    const got = Store.data.stickers;
    clear(shelfEl);
    const strip = el('div.strip');
    if (got.length){
      got.slice(-16).reverse().forEach(k => strip.append(el('span' + (Store.isPending(k) ? '.pending' : ''), null,
        TransferAdventure.artwork(k) || PokemonStickers.artwork(k, { rarity: false }))));
    } else {
      strip.append(el('span.empty', { text: 'レベルを クリアすると シールが たまるよ' }));
    }
    /* The shelf also shows how many classroom games have opened, giving the
       child a reason to keep collecting alongside the locked cards on the map. */
    const classroom = Games.list.filter(g => Progress.stageOf(g) === 'g1');
    const openCount = classroom.filter(stageOpen).length;
    shelfEl.classList.toggle('nearly', openCount > 0 && openCount < classroom.length);
    const sub = el('small', { text: '1ねんせいの あそび ' + openCount + '／' + classroom.length
      + (openCount < classroom.length ? '　じゅんびを みよう' : '　ぜんぶ ひらいたよ') });
    shelfEl.append(
      el('span.bk', { text: '📖' }),
      el('div.lbl', null, 'シール ' + got.length + 'まい', sub),
      strip);

    /* Each optional activity keeps its explanation at every viewport width. */
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
        el('div.world-heading', null,
          el('h3', null, el('span.chip', { text: w.name }),
            el('span.sub', { text: shut ? 'じゅんびが できると ひらくよ' : w.sub })),
          Treasures.card(w.id)), grid));
    });
    renderEnding();
  }
  return { build, render, endToday, choosePlay, captureMap, returnToMap, resumeChanged };
})();

/* ---------------------------------------------------------- LEVELS */
const Levels = (() => {
  let node, titleEl, listEl, chestEl, game = null;
  let homeOrigin = null;
  function build(){
    if (node) return node;
    titleEl = el('h2');
    listEl  = el('div.levels');
    chestEl = el('div.level-treasure');
    node = el('div#levels', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.returnToMap(homeOrigin); } }, '←'),
        titleEl, speakBtn(() => speech())),
      chestEl, listEl);
    return UI.register('levels', node);
  }
  function speech(){
    return game ? game.name + '。レベルを選んでね。金色で囲まれたレベルは、金のシールをもらっているよ。鍵のついたレベルは、前のレベルをクリアすると遊べるよ。' : '';
  }
  function render(g, opts){
    build();
    homeOrigin = opts ? opts.homeOrigin || null : UI.currentName() === 'home' ? Home.captureMap(g.id) : null;
    game = g;
    titleEl.textContent = g.ico + '　' + g.name;
    clear(chestEl); chestEl.append(Treasures.card(g.world));
    clear(listEl);
    g.levels.forEach((lv, i) => {
      const stars = Store.stars(g.id, i);
      const unlocked = Store.levelUnlocked(g.id, i);
      const goldKey = g.id + ':' + i + ':g';
      const gold = Store.hasSticker(goldKey);
      const card = el('button.levelcard' + (unlocked ? '' : '.locked') + (gold ? '.gold' : ''), {
        type: 'button', dataset:{levelIndex:String(i), levelAction:'play'}, style: { '--lc': g.color },
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
          'aria-label': 'きんの シールを ゲット　' + stickerFor(goldKey)
        }, PokemonStickers.artwork(goldKey, { rarity: false })) : null);
      const entry = el('div.level-entry', null, card);
      if (unlocked && g.intro !== false) entry.append(el('button.btn.first-retry', {
        type: 'button', dataset:{levelIndex:String(i), levelAction:'preview'}, 'aria-label': lv.t + 'の やりかたを みる', title: 'もういちど やりかたを みる',
        onclick(){ Sound.sfx.tap(); FirstSteps.open(g, i); }
      }, '👀'));
      const short = Store.shortStatus(g.id, i);
      const progress = ShortProgress.render(g.id, i, {compact:true});
      if (progress) entry.append(progress);
      if (unlocked && (short.canStartGold || short.goldActive)) entry.append(el('button.btn.gold-short-start', {
        type:'button', dataset:{levelIndex:String(i), levelAction:'gold'}, 'aria-label':lv.t + 'で ' + ShortProgress.describe(g.id, i, {gold:true}).nextLabel,
        onclick(){ Sound.sfx.tap(); ShortProgress.start(g, i, {gold:true}); }
      }, '✨ ' + ShortProgress.describe(g.id, i, {gold:true}).nextLabel));
      listEl.append(entry);
    });

  }
  function captureReturn(levelIndex){
    const focused = document.activeElement;
    return {round:Store.round(), gameId:game.id, levelIndex, scroll:listEl.scrollTop, homeOrigin,
      action:focused && focused.dataset.levelIndex === String(levelIndex) ? focused.dataset.levelAction : 'preview'};
  }
  function returnToList(saved){
    const g = saved && saved.round === Store.round() && Games.byId[saved.gameId];
    if (!g || !g.levels[saved.levelIndex]){ Home.returnToMap(null); return; }
    render(g, {homeOrigin:saved.homeOrigin});
    UI.show('levels', {focus:false}); listEl.scrollTop = saved.scroll;
    requestAnimationFrame(() => {
      if (UI.currentName() !== 'levels' || saved.round !== Store.round()) return;
      listEl.scrollTop = saved.scroll;
      const controls = Array.from(listEl.querySelectorAll('button[data-level-index]'));
      const control = controls.find(c => c.dataset.levelIndex === String(saved.levelIndex) && c.dataset.levelAction === saved.action)
        || controls.find(c => c.dataset.levelIndex === String(saved.levelIndex));
      (control || titleEl).focus({preventScroll:true});
    });
  }
  return { build, render, speech, captureReturn, returnToList, get game(){ return game; } };
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
    const stickers = r.stickers || [];
    const coloured = r.confirmed || [];
    let toDoor = null;
    if ((stickers.length || coloured.length) && !r.unlockedG1){
      const waitingGames = Games.list.filter(g => Progress.stageOf(g) === 'g1' && !stageOpen(g));
      waitingGames.sort((a,b) => {
        const pa = Progress.pathProgress(a), pb = Progress.pathProgress(b);
        return pb.got / pb.total - pa.got / pa.total;
      });
      if (waitingGames.length){
        const g = waitingGames[0], path = Progress.pathProgress(g);
        toDoor = el('button.btn.stagenext', { type:'button',
          onclick(){ Sound.sfx.tap(); G1Preparation.open(g); } },
          el('span', {text:'🎓'}), el('span', {text:g.name + 'の じゅんび ' + path.got + '／' + path.total}));
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
        el('div.l', { text: 'ホームの「1ねんせいの きょうしつ」から あそべるよ' })));
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
        onclick(event){ Sound.sfx.tap(); ProgressAlbum.open({key:'play:' + r.milestone.gameId + ':' + r.milestone.levelIndex, fromResult:event.currentTarget}); } },
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
    const rewardArt = x => {
      // Older debug fixtures may contain only the old display string.
      const key = x.key || PokemonStickers.keyForName(x.emoji);
      const ownedKey = key && Store.worldKey(key);
      if (ownedKey && Store.hasOwnedSticker(ownedKey)){
        return el('button.result-sticker-place' + (x.pending ? '.pending' : ''), {
          type: 'button', 'aria-label': PokemonStickers.reward(ownedKey).name + 'の シールを しまに はる',
          dataset: { stickerKey: ownedKey },
          onclick(){ Sound.sfx.tap(); StickerWorld.open(ownedKey); }
        }, PokemonStickers.artwork(ownedKey), el('span', { text: '🏡 しまに はる' }));
      }
      return key ? el('span' + (x.pending ? '.pending' : ''), null, PokemonStickers.artwork(key))
        : el('span', { text: x.emoji });
    };
    if (coloured.length){
      inner.append(el('div.newsticker.confirmed', null,
        el('div.e', null, coloured.map(rewardArt)),
        el('div.l', { text: 'シールに いろが ついた！' }),
        stickers.length ? null : toDoor));
    }
    if (stickers.length){
      const gold = stickers.some(x => x.gold), provisional = stickers.some(x => x.pending);
      const adventure = stickers.some(x => x.adventure);
      const chosen = r.rewardTarget && stickers.some(x => x.key === r.rewardTarget.key || x.emoji === stickerFor(r.rewardTarget.key));
      inner.append(el('div.newsticker' + (gold ? '.gold' : '') + (provisional ? '.pending' : ''), null,
        el('div.e', null, stickers.map(rewardArt)),
        el('div.l', { text: adventure ? 'ぼうけんシール を ゲット！'
                          : chosen ? 'えらんだ シールを ゲット！'
                          : provisional ? 'かりの シール！ べつの ひに また できたら いろが つくよ'
                          : stickers.length > 1 ? 'シール と きんの シール を ゲット！'
                          : gold ? 'きんの シール を ゲット！' : 'シール を ゲット！' }),
        toDoor));
    }
    const treasureReady = r.mode === 'level' && r.game && stickers.some(x => x.gold)
      && Treasures.status(r.game.world).ready && !Store.hasTreasure(r.game.world);
    if (treasureReady) inner.append(el('div.result-treasure', null,
      el('b', { text: 'きんの シールが ぜんぶ そろった！' }), Treasures.card(r.game.world)));
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
      '🏠', 'きょうは ここまで', () => { Sound.sfx.tap(); Home.endToday(); }, '今日はここまでにできるよ。');
    actions.append(homeBtn);
    /* Ending is available after every visit. A longer day makes that choice the
       leading action too, without locking a child out of optional extra play. */
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
    if (TextbookReview.unlocked()) actions.append(act('', '📖', 'ほんを うらがえす', () => TextbookReview.open()));
    if (Store.round() === 1 && Rounds.unlocked()) actions.append(act('', '🚀', '２しゅうめへ', () => Rounds.go(2)));
    UI.resultActions(node, actions, {end:homeBtn,
      primary:$('.primary', actions) !== homeBtn ? $('.primary', actions) : null});
    UI.show('result', { replace: true });
    const news = (coloured.length ? 'シールに、色がついたね！' : '')
      + (stickers.some(x => x.pending) ? '別の日にまたできたら、シールに色がつくよ。' : '')
      + (treasureReady ? '金のシールが全部そろったね！宝箱を開けられるよ。' : '');
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
  let node, body, grid, count, missing, headEl, filters, worldSelect, resultCount, extras;
  let detailNode, detailHeading, detailBody, detailSpeech = '', filter = 'all', world = 'all';
  let renderedRound = null, savedScroll = 0, selectedKey = null;
  let detailKey = null, visitVersion = 0, returnTicket = null;
  const journeyScreens = ['book','book-detail','transfer','sticker-world','island-jobs'];
  const filtersList = [['all','ぜんぶ'], ['owned','あつめた'], ['gold','きん'], ['recent','さいきん']];
  function build(){
    if (node) return node;
    grid = el('div.book-catalog');
    count = el('div.aim.book-count');
    missing = el('div.book-todo');
    filters = el('div.book-filters', { 'aria-label':'シールを えらぶ' });
    filtersList.forEach(([value, label]) => filters.append(el('button.book-filter', {
      type:'button', text:label, dataset:{ filter:value }, 'aria-pressed':value === filter ? 'true' : 'false',
      onclick(){ Sound.sfx.tap(); filter = value; renderCatalog(); body.scrollTop = 0;
        Sound.say(label + 'のシールだよ。' + resultCount.textContent, {delay:100}); }
    })));
    worldSelect = el('select.book-world', { 'aria-label':'ばしょを えらぶ', onchange(){
      world = worldSelect.value; renderCatalog(); body.scrollTop = 0;
      Sound.say(worldSelect.selectedOptions[0].textContent + '。' + resultCount.textContent, {delay:100});
    } }, el('option', {value:'all', text:'🗺️ すべての ばしょ'}),
      WORLDS.map(w => el('option', {value:w.id, text:w.name})));
    resultCount = el('div.book-filter-count', {role:'status', 'aria-live':'polite'});
    extras = el('details.book-extras', null,
      el('summary', {text:'たからもの・ほん・じゅんびを みる'}));
    body = el('div.book', null, grid, extras);
    node = el('div#book', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', {type:'button', 'aria-label':'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', {replace:true}); }}, '←'),
        headEl = el('h2'), speakBtn(() => speech())),
      count, el('div.book-controls', null, filters, worldSelect, resultCount), body);
    UI.register('book', node);
    detailHeading = el('h2'); detailBody = el('div.book-detail-body');
    detailNode = el('div#book-detail', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round.book-detail-back', {type:'button', 'aria-label':'シールブックに もどる',
          onclick(){ Sound.sfx.tap(); returnToBook(); }}, '←'),
        detailHeading, speakBtn(() => detailSpeech)), detailBody);
    UI.register('book-detail', detailNode);
    new MutationObserver(() => {
      if (returnTicket && (returnTicket.round !== Store.round() || !journeyScreens.includes(UI.currentName()))) returnTicket = null;
    }).observe(node.parentNode, {subtree:true,attributes:true,attributeFilter:['hidden']});
    return node;
  }
  function speech(){
    return 'シールブックだよ。持っているシールが先に並んでいるよ。好きなシールを押してみよう。持っているシールは島に貼れるよ。金や場所でも選べるよ。一年生の遊びは、それぞれの準備ができたら開くよ。準備を見るボタンから、必要な遊びを選べるよ。';
  }
  function open(opts){
    returnTicket = null; visitVersion++;
    render(); UI.show('book');
    const section = opts && {rounds:'.round-collection', review:'.review-collection, .review-gate', treasures:'.treasure-collection'}[opts.section];
    const destination = section && extras.querySelector(section);
    if (destination){
      extras.open = true;
      destination.scrollIntoView({block:'start'});
      requestAnimationFrame(() => destination.scrollIntoView({block:'start'}));
    }
    Sound.say(speech(), {delay:200});
  }
  function lessonFor(key){
    const match = /^([^:]+):(\d+)(:g)?$/.exec(key);
    if (!match) return null;
    const game = Games.byId[match[1]], levelIndex = Number(match[2]);
    return game && Array.isArray(game.levels) && game.levels[levelIndex] ? {game, levelIndex, gold:!!match[3]} : null;
  }
  function owned(key){ return key.startsWith('treasure:') ? Store.hasTreasure(key.slice(9)) : Store.hasSticker(key); }
  function catalogKeys(){
    const map = Games.list.flatMap(g => g.levels.flatMap((lv, i) => [g.id + ':' + i, g.id + ':' + i + ':g']));
    const acquired = Store.data.stickers.concat(Store.data.treasures.map(id => 'treasure:' + id));
    // Sticker insertion order is the saved acquisition order. Keepsakes have no
    // shared timestamp, so leave them after stickers instead of inventing recency.
    const order = new Map(Store.data.stickers.map((key, index) => [key, index]));
    return Array.from(new Set(map.concat(acquired))).sort((a, b) => Number(owned(b)) - Number(owned(a))
      || (owned(a) && owned(b) ? (order.get(b) ?? -1) - (order.get(a) ?? -1) : 0));
  }
  function keyWorld(key){
    const lesson = lessonFor(key);
    if (lesson) return lesson.game.world;
    return key.startsWith('treasure:') ? key.slice(9) : null;
  }
  function renderCatalog(){
    visitVersion++;
    clear(grid);
    filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    worldSelect.value = world;
    let keys = catalogKeys().filter(key => world === 'all' || keyWorld(key) === world);
    if (filter === 'owned' || filter === 'recent') keys = keys.filter(owned);
    if (filter === 'gold') keys = keys.filter(key => key.endsWith(':g'));
    if (filter === 'recent') keys = keys.filter(key => !key.startsWith('treasure:')).slice(0, 6);
    resultCount.textContent = keys.length + 'まい' + (filter === 'recent' ? '　あつめた シールから 6まいまで' : '　おすと くわしく みられるよ');
    if (!keys.length) grid.append(el('p.book-empty', {text:filter === 'owned' || filter === 'recent'
      ? 'この ばしょの シールは、これから あつめられるよ。「ぜんぶ」で えらんでみよう。'
      : 'この ばしょには この シールは ないよ。ばしょや えらびかたを かえてみよう。'}));
    keys.forEach(key => {
      const has = owned(key), lesson = lessonFor(key), pending = has && Store.isPending(key);
      const locked = lesson && !levelOpen(lesson.game, lesson.levelIndex);
      const label = pending ? 'かりの シール' : has ? 'もっている' : locked ? 'じゅんびを みる' : key.endsWith(':g') ? 'きんに チャレンジ' : 'この シールへ';
      grid.append(el('button.sticker.book-slot' + (has ? '.got' : '') + (key.endsWith(':g') ? '.gold' : '')
        + (pending ? '.pending' : '') + (locked && !has ? '.locked' : ''), {
          type:'button', dataset:{ bookKey:key }, 'aria-label':stickerFor(key) + '　' + label,
          title:stickerFor(key) + '　' + (lesson ? lesson.game.name + '　' + lesson.game.levels[lesson.levelIndex].t + '　' : '') + label,
          onclick(){ Sound.sfx.tap(); savedScroll = body.scrollTop; selectedKey = key; showDetail(key); }
        }, PokemonStickers.artwork(key, {silhouette:!has}), el('span.book-slot-state', {text:label})));
    });
  }
  function returnToBook(){
    returnTicket = null;
    if (renderedRound !== Store.round()){ savedScroll = 0; selectedKey = null; }
    // A visit may have earned a sticker while the catalog was hidden.
    render();
    UI.show('book', {keepScroll:true}); body.scrollTop = savedScroll;
    const button = Array.from(grid.querySelectorAll('button')).find(n => n.dataset.bookKey === selectedKey);
    if (button) requestAnimationFrame(() => button.focus({preventScroll:true}));
  }
  function showDetail(key){
    visitVersion++; detailKey = key;
    const lesson = lessonFor(key), has = owned(key), pending = has && Store.isPending(key);
    detailHeading.textContent = stickerFor(key);
    clear(detailBody).append(PokemonStickers.artwork(key, {silhouette:!has}));
    const copy = el('div.book-detail-copy');
    detailBody.append(copy);
    if (lesson) copy.append(el('b', {text:lesson.game.ico + '　' + lesson.game.name + '　《' + lesson.game.levels[lesson.levelIndex].t + '》'}));
    const actions = el('div.book-detail-actions');
    detailBody.append(actions);
    const status = pending ? 'かりの シールだよ。べつの ひに また できたら いろが つくよ。'
      : has ? 'あつめた シールだよ。じぶんの しまに はれるよ。' : 'この シールの あそびを みてみよう。';
    copy.append(el('p', {text:status}));
    if (has) actions.append(el('button.btn.btn-accent.book-place', {type:'button', text:'しまに はる',
      onclick(event){ Sound.sfx.tap(); StickerWorld.open(key, {bookOrigin:captureReturn(event.currentTarget, key)}); }}));
    let guidanceSpeech = '';
    if (lesson && (!has || pending)){
      if (!stageOpen(lesson.game)){
        guidanceSpeech = lesson.game.name + 'は、準備ができると遊べるよ。準備を見るボタンから、必要な遊びを選べるよ。';
        copy.append(el('p', {text:lesson.game.name + 'は、じゅんびが できると あそべるよ。'}));
        actions.append(el('button.btn.btn-accent.book-prepare', {type:'button', text:lesson.game.name + 'の じゅんびを みる',
          onclick(){ Sound.sfx.tap(); G1Preparation.open(lesson.game); }}));
      } else if (!levelOpen(lesson.game, lesson.levelIndex)){
        guidanceSpeech = '前のレベルから遊ぶと開くよ。前のレベルへボタンで、遊びを選べるよ。';
        copy.append(el('p', {text:'まえの レベルから あそぶと ひらくよ。'}));
        actions.append(el('button.btn.btn-accent.book-prepare', {type:'button', text:lesson.game.name + 'の まえの レベルへ',
          onclick(){ Sound.sfx.tap(); Levels.render(lesson.game); UI.show('levels'); }}));
      } else {
        // The shared short-course presentation and action are attached below.
        guidanceSpeech = appendLessonAction(copy, actions, lesson);
      }
    }
    actions.append(el('button.btn.book-return', {type:'button', text:'シールブックに もどる',
      onclick(){ Sound.sfx.tap(); returnToBook(); }}));
    detailSpeech = stickerFor(key) + '。' + (lesson ? lesson.game.name + '。' + lesson.game.levels[lesson.levelIndex].t + '。' : '')
      + status + guidanceSpeech + 'シールブックにも戻れるよ。';
    UI.show('book-detail'); Sound.say(detailSpeech, {delay:150});
  }
  // This ticket describes one visible Book visit, never a learning checkpoint.
  // Keep the original card as the visual anchor when earning adds a catalog row.
  function captureReturn(source, item){
    const screen = UI.currentName();
    if (screen !== 'book' && screen !== 'book-detail') return null;
    const detail = screen === 'book-detail';
    const key = String(item || '').replace(/^lap2:/, '');
    const matches = button => button.dataset.bookKey === key || button.dataset.collectionKey === key
      || Array.from(button.querySelectorAll('[data-sticker-key]')).some(art => art.dataset.stickerKey === key);
    let control = source && body.contains(source) ? source.closest('button') : null;
    if (control && key && !matches(control)) control = null;
    if (!detail && !control){
      control = Array.from(extras.querySelectorAll('button')).concat(Array.from(grid.querySelectorAll('button'))).find(matches);
    }
    const art = control && control.querySelector('[data-sticker-key]');
    const frame = body.getBoundingClientRect(), scale = body.offsetHeight ? frame.height / body.offsetHeight : 1;
    returnTicket = {round:Store.round(), version:visitVersion, filter, world, extras:extras.open,
      scroll:detail ? savedScroll : body.scrollTop, selectedKey, detail:detail ? detailKey : null,
      detailScroll:detailBody.scrollTop, focusKey:control && (control.dataset.bookKey || control.dataset.collectionKey
        || art && art.dataset.stickerKey), focusScope:control && grid.contains(control) ? 'catalog' : 'extras',
      sourceTop:control ? (control.getBoundingClientRect().top - frame.top) / scale : null};
    return returnTicket;
  }
  function canReturn(ticket){
    return !!ticket && ticket === returnTicket && ticket.round === Store.round() && ticket.version === visitVersion
      && journeyScreens.includes(UI.currentName());
  }
  function restoreReturn(ticket){
    if (!canReturn(ticket)) return false;
    returnTicket = null;
    filter = ticket.filter; world = ticket.world; savedScroll = ticket.scroll; selectedKey = ticket.selectedKey;
    render(); extras.open = ticket.extras;
    if (ticket.detail){
      showDetail(ticket.detail); detailBody.scrollTop = ticket.detailScroll;
      const version = visitVersion;
      requestAnimationFrame(() => {
        if (UI.currentName() !== 'book-detail' || Store.round() !== ticket.round || detailKey !== ticket.detail || visitVersion !== version) return;
        detailBody.scrollTop = ticket.detailScroll;
        const place = $('.book-place', detailBody); if (place) place.focus({preventScroll:true});
      });
    } else {
      UI.show('book', {keepScroll:true,focus:false}); body.scrollTop = ticket.scroll;
      const scope = ticket.focusScope === 'catalog' ? grid : extras;
      const control = Array.from(scope.querySelectorAll('button')).find(button => button.dataset.bookKey === ticket.focusKey
        || button.dataset.collectionKey === ticket.focusKey
        || Array.from(button.querySelectorAll('[data-sticker-key]')).some(art => art.dataset.stickerKey === ticket.focusKey));
      if (control && ticket.sourceTop !== null){
        const frame = body.getBoundingClientRect(), scale = body.offsetHeight ? frame.height / body.offsetHeight : 1;
        body.scrollTop += (control.getBoundingClientRect().top - frame.top) / scale - ticket.sourceTop;
      }
      savedScroll = body.scrollTop;
      const version = visitVersion;
      requestAnimationFrame(() => {
        if (UI.currentName() !== 'book' || Store.round() !== ticket.round || visitVersion !== version) return;
        if (control) control.focus({preventScroll:true}); else headEl.focus({preventScroll:true});
      });
      Sound.say('シールブックに もどったよ。つづけて えらべるよ。', {delay:100});
    }
    return true;
  }
  function appendLessonAction(copy, actions, lesson){
    const {game, levelIndex} = lesson;
    const gold = lesson.gold && Store.hasConfirmed(game.id + ':' + levelIndex);
    if (lesson.gold && !gold) copy.append(el('p', {text:'きんの シールは、まず「' + stickerFor(game.id + ':' + levelIndex) + '」の シールに いろが ついてから チャレンジできるよ。'}));
    // Kept as one call site so the home, level list and book share progress wording.
    const progress = ShortProgress.describe(game.id, levelIndex, {gold, preview:true});
    copy.append(ShortProgress.render(game.id, levelIndex, {gold, preview:true}));
    const options = {gold, returnToBook:true};
    actions.append(el('button.btn.btn-accent.book-play', {type:'button', text:progress.nextLabel,
      onclick(){ Sound.sfx.tap(); ShortProgress.start(game, levelIndex, options); }}));
    actions.append(FirstSteps.longCourse(game, levelIndex, {returnToBook:true}));
    return (lesson.gold && !gold ? '金のシールは、まず普通のシールに色がついてから挑戦できるよ。' : '') + progress.speech;
  }
  function renderExtras(){
    const summary = extras.firstElementChild; clear(extras).append(summary);
    const content = el('div.book-extra-content'); extras.append(content);
    const preparation = el('div.book-preparation', {'aria-label':'1ねんせいの あそびの じゅんび'});
    Games.list.filter(g => Progress.stageOf(g) === 'g1').forEach(g => {
      const path = Progress.pathProgress(g);
      preparation.append(el('button.btn', {type:'button', dataset:{preparation:g.id},
        onclick(){ Sound.sfx.tap(); G1Preparation.open(g); }},
        g.name + '　' + (stageOpen(g) ? '✓ あそべるよ' : path.got + '／' + path.total + '　じゅんびを みる')));
    });
    content.append(preparation, PokemonStickers.legend(), Treasures.collection());
    const specialCollection = TransferAdventure.collection();
    if (specialCollection) content.append(specialCollection);
    content.append(TextbookReview.collection(), Rounds.collection());
    clear(missing);
    const todo = Progress.gateSlots('pre').filter(k => !Store.hasConfirmed(k)).map(k => {
      const cut = k.lastIndexOf(':'), g = Games.byId[k.slice(0, cut)], i = Number(k.slice(cut + 1));
      return g && g.levels[i] ? {g, i, lv:g.levels[i], waiting:Store.isPending(k)} : null;
    }).filter(Boolean);
    if (todo.length){
      const row = el('div.todorow');
      todo.slice(0,10).forEach(({g,i,lv,waiting}) => {
        const open = Store.levelUnlocked(g.id,i);
        row.append(el('button.todochip' + (open ? '' : '.shut') + (waiting ? '.pending' : ''), {
          type:'button', style:{'--lc':g.color}, title:g.name + '　' + lv.t,
          onclick(){ Sound.sfx.tap();
            if (open){ if (g.intro !== false && !Store.introduced(g.id,i)) FirstSteps.open(g,i); else Session.startLevel(g,i); }
            else { Levels.render(g); UI.show('levels'); }
          }
        }, el('span.i', {text:open ? g.ico : '🔒'}), el('span.t', null, g.name,
          el('small', {text:lv.t + (waiting ? '・たしかめ' : '')}))));
      });
      missing.append(el('div.l', {text:'まだ シールがない レベル' + (todo.length > 10 ? '（さいしょの 10こ）' : '')}), row);
    }
    content.append(missing);
    const pre = Progress.preStickers(), waiting = Progress.pendingCount('pre');
    content.append(el('p.book-guide', {text:'レベルを クリアすると シールが 1まい。ぜんぶ せいかいで きんいろの シール。'
      + (waiting ? 'かりの シール ' + waiting + 'まい。べつの ひに また できたら いろが つくよ。' : '')
      + 'にゅうがくまえの シールは ' + pre.got + '／' + pre.total + 'レベル。1ねんせいは あそびごとに じゅんびが できると ひらくよ。'}));
  }
  function render(){
    build();
    if (renderedRound !== Store.round()){
      renderedRound = Store.round(); filter = 'all'; world = 'all'; extras.open = false;
    }
    headEl.textContent = '📖　' + (Store.name ? Store.name + 'の シールブック' : 'シールブック');
    const got = Store.data.treasures.length + Store.data.stickers.length;
    clear(count).append(el('b', {text:got + 'まい'}), ' あつめたよ　', el('span', {text:'シールを おそう'}));
    renderCatalog(); renderExtras();
  }
  return {build, render, open, speech, returnToBook, captureReturn, canReturn, restoreReturn};
})();
