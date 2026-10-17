/* One read-only account of the child's short course, shared by every entrance.
   Practice while waiting is still real activity; it does not advance a check. */
'use strict';

const ShortProgress = (() => {
  function describe(gameId, levelIndex, opts){
    const options = opts || {}, game = Games.byId[gameId];
    if (!game || !Array.isArray(game.levels) || !game.levels[levelIndex]) return null;
    const key = gameId + ':' + levelIndex, course = (Store.data.shortCourses || {})[key];
    const status = Store.shortStatus(gameId, levelIndex);
    const requestedGold = options.gold === undefined
      ? status.goldActive || !!(course && Store.hasSticker(key + ':g')) : options.gold === true;
    const gold = requestedGold && status.confirmed;
    const progress = gold ? status.goldStatus || {
      answered:0, right:0, independentRun:0, checks:0, checkRight:0,
      waiting:false, phase:'independent', readyDay:null
    } : status;
    const complete = gold ? Store.hasSticker(key + ':g') : status.confirmed;
    const visible = !!(options.preview || course || status.goldActive);
    let stage = complete ? 'complete' : progress.waiting ? 'waiting'
      : progress.phase === 'check' ? 'check' : 'prepare';
    let title, detail, nextLabel, kind, speech;
    if (complete){
      title = gold ? 'きんの シールを もっているよ' : 'シールが かんせいしたよ';
      detail = 'できた シールは のこるよ。すきなときに また あそべるよ';
      nextLabel = 'れんしゅうを 1もん'; kind = 'practice';
      speech = (gold ? '金のシールを持っているよ。' : 'シールが完成したよ。')
        + 'できたシールは残るよ。好きなときにまた遊べるよ。';
    } else if (progress.waiting){
      const retry = progress.checks === 3;
      title = retry ? 'たしかめは また べつのひに' : 'きょうの じゅんびは できたね';
      detail = retry ? 'べつのひに 3もん たしかめよう。きょうは れんしゅうしても いいよ'
        : 'つぎは べつのひに 3もん。きょうの れんしゅうでは たしかめは すすまないよ';
      nextLabel = 'れんしゅうを 1もん'; kind = 'practice';
      speech = (retry ? '確かめは、また別の日にしよう。' : '今日の準備はできたね。')
        + '次は別の日に3問確かめよう。今日の追加の練習では、確かめは進まないよ。';
    } else if (progress.phase === 'check'){
      title = (gold ? 'きんへの たしかめ　' : 'べつのひの たしかめ　') + progress.checks + '／3もん';
      detail = gold ? 'ヒントなしで 3もん できたら きんの シール。1もんずつで いいよ'
        : '3もんのうち 2もん じぶんで できたら シールが かんせい。1もんずつで いいよ';
      nextLabel = gold ? 'きんへの たしかめを 1もん' : 'たしかめを 1もん'; kind = 'check';
      speech = (gold ? '金への確かめ。' : '別の日の確かめ。') + '3問のうち' + progress.checks + '問を試したよ。'
        + (gold ? '3問ともヒントなしで最初に答えたら、金のシールになるよ。'
          : '2問をヒントなしで最初に答えたら、シールが完成するよ。') + '1問ずつでいいよ。';
    } else if (gold){
      const run = progress.independentRun || 0;
      title = 'ヒントなしで つづけて ' + run + '／8もん';
      detail = '8もん つづけて できたら、べつのひに 3もん たしかめよう。できた シールは のこるよ';
      nextLabel = status.goldActive ? 'きんへ つづきの 1もん' : 'きんへ 1もんずつ';
      kind = status.goldActive ? 'resume' : 'gold-start';
      speech = '金の準備。ヒントなしで続けて' + run + '問できたよ。8問続けてできたら、別の日に3問確かめよう。'
        + 'できたシールは残るよ。';
    } else {
      const tried = progress.answered, right = progress.right;
      title = tried < 8 ? 'ためした ' + tried + '／8もん'
        : 'さいきんの 8もんで じぶんで できた ' + right + 'もん';
      detail = tried < 8 ? 'そのうち じぶんで できた ' + right + 'もん。ヒントも つかって、つぎの 1もん'
        : '8もんのうち 6もん じぶんで できたら、べつのひの たしかめへ。ヒントも つかって いいよ';
      nextLabel = tried ? 'つづきの 1もん' : 'じゅんびを 1もん'; kind = tried ? 'resume' : 'start';
      speech = tried < 8 ? '準備は8問のうち' + tried + '問を試したよ。そのうち' + right + '問は自分で答えたね。'
        : '最近の8問で、自分で答えたのは' + right + '問。6問をヒントなしで最初に答えたら、別の日の確かめに進めるよ。';
      speech += 'ヒントも使っていいよ。次の1問を試そう。';
    }
    const stepIndex = stage === 'complete' ? 2 : stage === 'waiting' || stage === 'check' ? 1 : 0;
    if (!complete && status.resting){
      stage = status.supportNeeded ? 'support' : 'rest';
      title = status.supportNeeded ? 'やりかたを いっしょに ためそう' : 'このあそびは すこし おやすみ';
      detail = status.supportNeeded ? detail + '。いっしょに 1もん ためしてから、すこし やすもう'
        : detail + '。ほかの あそびを えらんでも いいよ';
      nextLabel = status.supportNeeded ? 'いっしょに 1もん' : progress.waiting ? 'れんしゅうを 1もん' : 'このあそびを 1もん';
      kind = status.supportNeeded ? 'support' : 'rest';
      speech += status.supportNeeded ? 'やり方を一緒に1問試したら、少し休もう。' : 'この遊びは少しお休み。ほかの遊びを選んでもいいよ。';
    }
    if (requestedGold && !status.confirmed){
      detail = 'きんの まえに、ふつうの シールから。' + detail;
      nextLabel = 'ふつうの シールへ 1もん';
      speech = '金の前に、普通のシールから。' + speech;
    }
    const steps = [
      {id:'prepare', icon:'🌱', label:gold ? 'きんの\nじゅんび' : 'じゅんび'},
      {id:'check', icon:'☀️', label:'べつのひ\nたしかめ'},
      {id:'complete', icon:'✨', label:gold ? 'きんの\nシール' : 'シール'}
    ].map((step, i) => Object.assign(step, {complete:i < stepIndex, current:i === stepIndex}));
    return {visible, key, goal:gold ? 'gold' : 'normal', stage, title, detail, nextLabel, kind,
      speech:game.name + '。' + speech, steps, status};
  }

  function render(gameId, levelIndex, opts){
    const info = describe(gameId, levelIndex, opts);
    if (!info || !info.visible) return null;
    const options = opts || {};
    return el('section.short-progress' + (options.compact ? '.compact' : ''), {
      'aria-label':'シールまでの すすみぐあい', dataset:{shortKey:info.key,goal:info.goal,stage:info.stage}
    },
      el('p.short-progress-course', {text:Games.byId[gameId].name + '　《' + Games.byId[gameId].levels[levelIndex].t + '》'}),
      el('div.short-progress-head', null, el('b.short-progress-title', {text:info.title}),
        el('button.btn.btn-ghost.short-progress-speak', {type:'button', 'aria-label':'この すすみぐあいを きく',
          onclick(){ Sound.sfx.tap(); Sound.say(info.speech, {delay:60}); }
        }, '🔊')),
      el('ol.short-progress-steps', null, info.steps.map(step => el('li.short-progress-step'
        + (step.complete ? '.done' : '') + (step.current ? '.current' : ''),
      {'data-step':step.id, 'aria-current':step.current ? 'step' : null},
      el('span', {'aria-hidden':'true', text:step.icon}), el('span', {text:step.label})))),
      el('p.short-progress-detail', {text:info.detail}));
  }

  function current(preferred){
    const courses = Object.keys(Store.data.shortCourses || {}).map(key => {
      const [id,index] = key.split(':'), levelIndex = Number(index), info = describe(id, levelIndex);
      return info && info.visible && levelOpen(Games.byId[id], levelIndex) ? {game:Games.byId[id],levelIndex,info} : null;
    }).filter(Boolean).sort((a,b) => b.info.status.at - a.info.status.at);
    if (preferred){
      const matched = courses.find(t => t.game.id === preferred.game.id && t.levelIndex === preferred.levelIndex);
      if (matched) return matched;
    }
    return courses.find(t => t.info.stage !== 'complete') || courses[0] || null;
  }

  function start(game, levelIndex, opts){
    const info = game && describe(game.id, levelIndex, Object.assign({preview:true}, opts));
    if (!info || !levelOpen(game, levelIndex)) return;
    if (info.kind === 'support') FirstSteps.startPlan({game,levelIndex,kind:'support'});
    else if (info.goal === 'gold' && !Store.hasSticker(info.key + ':g')) FirstSteps.startGold(game, levelIndex);
    else FirstSteps.startOne(game, levelIndex, Store.introduced(game.id, levelIndex));
  }
  return {describe, render, current, start};
})();
