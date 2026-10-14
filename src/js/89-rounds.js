/* The two adventures share collections, but always identify the lesson being
   played. Selecting a round never resets either set of learning records. */
'use strict';
const Rounds = (() => {
  const firstScreens = new Set(['home', 'levels', 'play', 'result', 'first-steps', 'first-finish',
    'g1-preparation', 'sticker-mission', 'adventure', 'mission', 'transfer', 'treasure']);
  function current(){
    return Store.data.selectedRound === 2 && SecondRound.unlocked() ? 2 : 1;
  }
  function select(round){
    if (![1, 2].includes(round) || (round === 2 && !SecondRound.unlocked())) return false;
    if (Store.data.selectedRound !== round) Store.setPref('selectedRound', round);
    return true;
  }
  function go(round){
    if (!select(round)){
      Book.open();
      Sound.say('２周目は、１周目のシールが全部そろうと開くよ。シールブックで、あと何枚か見てみよう。', {delay:180});
      return;
    }
    if (round === 2) SecondRound.open();
    else { Home.render(); UI.show('home', {replace:true}); }
  }
  function switcher(active){
    const open = SecondRound.unlocked(), p = SecondRound.progress();
    return el('nav.round-switcher', {'aria-label':'しゅうかいを えらぶ'}, [1, 2].map(round => {
      const selected = active === round;
      return el('button.round-choice' + (selected ? '.active' : '') + (round === 2 ? '.review-home' : ''), {
        type:'button', dataset:{roundTarget:String(round)}, 'aria-pressed':String(selected),
        'aria-label':round === 1 ? '１しゅうめ　ちずの ぼうけん' : '２しゅうめ　ふくしゅうの ぼうけん' + (open ? '' : '　シールが ぜんぶ そろうと ひらくよ'),
        onclick(){ Sound.sfx.tap(); go(round); }
      }, el('span.round-choice-icon', {'aria-hidden':'true', text:round === 1 ? '🗺️' : open ? '📘' : '🔒'}),
        el('span.round-choice-copy', null,
          el('strong', {text:round === 1 ? '１しゅうめ' : '２しゅうめ'}),
          el('small', {text:round === 1 ? 'ちずで まなぶ' : 'ほんで ふくしゅう'})),
        el('span.round-choice-progress', {text:selected ? 'いまここ' : round === 1 ? p.got+'／131まい'
          : open ? SecondRound.earned()+'／25まい' : 'あと '+(p.total-p.got)+'まい'}));
    }));
  }
  function decorate(name, node){
    if (name === 'title' || name === 'orientation') return;
    if (name === 'review') select(2);
    else if (firstScreens.has(name)) select(1);
    const round = current();
    node.dataset.round = String(round);
    let status = Array.from(node.children).find(n => n.classList.contains('round-status'));
    if (!status){
      status = el('div.round-status', {role:'status', 'aria-live':'polite'});
      const head = $('.topbar, .home-head', node);
      if (head) head.after(status); else node.prepend(status);
    }
    clear(status);
    status.append(el('b', {text:round === 1 ? '🗺️ いまは １しゅうめ' : '📘 いまは ２しゅうめ'}),
      el('span', {text:round === 1 ? 'ちずの ぼうけん' : 'ふくしゅうの ぼうけん'}));
  }
  return {current, select, go, switcher, decorate};
})();
