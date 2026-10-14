/* A lap contains the map, application adventures and textbook review. */
'use strict';
const Rounds = (() => {
  const gate = Object.freeze(TEXTBOOK_GATE.concat(TextbookReview.rewardKeys()));
  const current = () => Store.round();
  function progress(round=1){
    const data = Store.roundData(round), stickers = data ? data.stickers : [], pending = data ? data.pending : {};
    const owns = key => key.startsWith('treasure:')
      ? !!data && data.treasures.includes(key.slice(9)) : stickers.includes(key) && !pending[key];
    const missing = gate.filter(key => !owns(key));
    return {got:gate.length-missing.length, total:gate.length, missing};
  }
  function unlocked(){
    if (Store.data.roundTwoReached) return true;
    if (progress(1).got !== gate.length) return false;
    Store.unlockRoundTwo(); return true;
  }
  function select(round){
    if (![1, 2].includes(round) || (round === 2 && !unlocked())) return false;
    return Store.selectRound(round);
  }
  function go(round){
    if (!select(round)){
      Book.open();
      Sound.say('２周目は、本の復習まで、１周目のシール156枚が全部そろうと開くよ。', {delay:180});
      return;
    }
    Home.render(); UI.show('home', {replace:true});
    Sound.say(round === 2 ? 'いまは２周目。地図も、本の復習も、最初からもういちど遊べるよ。別の新しいシールを集めよう。'
      : 'いまは１周目。これまでの記録とシールは、そのまま残っているよ。', {delay:180});
  }
  function switcher(active=current()){
    const open = unlocked(), first = progress(1);
    return el('nav.round-switcher', {'aria-label':'しゅうかいを えらぶ'}, [1, 2].map(round => {
      const selected = active === round, p = progress(round);
      return el('button.round-choice'+(selected?'.active':''), {
        type:'button', dataset:{roundTarget:String(round)}, 'aria-pressed':String(selected),
        'aria-label':round+'しゅうめ　'+(round === 1 ? 'これまでの きろく' : open ? 'ぜんぶ さいしょから もういちど' : '１しゅうめの シール156まいで ひらくよ'),
        onclick(){Sound.sfx.tap();go(round);}
      }, el('span.round-choice-icon', {'aria-hidden':'true',text:round === 1?'🗺️':open?'🚀':'🔒'}),
        el('span.round-choice-copy',null,el('strong',{text:round === 1?'１しゅうめ':'２しゅうめ'}),
          el('small',{text:round === 1?'ちずも ほんも あそぼう':'ぜんぶ さいしょから'})),
        el('span.round-choice-progress',{text:selected?'いまここ':round === 2&&!open?'あと '+first.missing.length+'まい':p.got+'／'+p.total+'まい'}));
    }));
  }
  function collection(){
    const p = progress(1), open = unlocked();
    return el('section.round-collection',{'aria-label':'２しゅうめの ひらきかた'},
      el('h3',{text:open?'🚀 ２しゅうめで ぜんぶ もういちど':'🔒 ほんまで ぜんぶ あつめて ２しゅうめへ'}),
      el('p',{text:open?'１しゅうめの きろくを のこして、すべての あそびを さいしょから。べつの ポケモンシール156まいが まっているよ。'
        :'１しゅうめの シール '+p.got+'／'+p.total+'まい。ちず・たからばこ・ぼうけん・ほんの ふくしゅうまで あつめよう。かりの シールは、いろが ついてから かぞえるよ。'}),switcher());
  }
  function parentSummary(){
    return el('section.section.round-parent',null,el('h3',{text:'周回ごとの記録'}),
      [1,2].map(round=>{
        const data = Store.roundData(round), p = progress(round);
        const stars = data ? Object.values(data.stars).reduce((n,x)=>n+x,0) : 0;
        return el('p',{text:round+'周目：確定シール '+p.got+'／'+p.total+'、星 '+stars+(round===2&&!data?'（未開始）':'')});
      }),el('p',{text:'地図60レベル、学んだことを使う冒険、教科書の復習20レッスンとまとめ5つを含めて1周です。2周目の進み具合・シールは1周目と別に保存します。'}));
  }
  function decorate(name,node){
    if (name === 'title' || name === 'orientation') return;
    const round = current(); node.dataset.round = String(round);
    let status = Array.from(node.children).find(n=>n.classList.contains('round-status'));
    if (!status){
      status = el('div.round-status',{role:'status','aria-live':'polite'});
      const head = $('.topbar, .home-head',node);
      if (head) head.after(status); else node.prepend(status);
    }
    clear(status);
    status.append(el('b',{text:round===1?'🗺️ いまは １しゅうめ':'🚀 いまは ２しゅうめ'}),
      el('span',{text:round===1?'ちずも ほんも あそぼう':'ぜんぶ さいしょから もういちど'}));
  }
  return {current,progress,unlocked,select,go,switcher,collection,parentSummary,rewardKeys:()=>gate.slice(),decorate};
})();
