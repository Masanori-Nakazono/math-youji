/* Second round: textbook representations with original illustrations.
   This gate is the original collection, frozen independently of the live catalog. */
'use strict';
const SECOND_ROUND_GATE = Object.freeze(["count:0", "count:0:g", "count:1", "count:1:g", "count:2", "count:2:g", "flash:0", "flash:0:g", "flash:1", "flash:1:g", "flash:2", "flash:2:g", "numeral:0", "numeral:0:g", "numeral:1", "numeral:1:g", "numeral:2", "numeral:2:g", "seq:0", "seq:0:g", "seq:1", "seq:1:g", "seq:2", "seq:2:g", "trace:0", "trace:0:g", "trace:1", "trace:1:g", "trace:2", "trace:2:g", "compare:0", "compare:0:g", "compare:1", "compare:1:g", "compare:2", "compare:2:g", "ordinal:0", "ordinal:0:g", "ordinal:1", "ordinal:1:g", "ordinal:2", "ordinal:2:g", "measure:0", "measure:0:g", "measure:1", "measure:1:g", "measure:2", "measure:2:g", "bond:0", "bond:0:g", "bond:1", "bond:1:g", "bond:2", "bond:2:g", "ten:0", "ten:0:g", "ten:1", "ten:1:g", "ten:2", "ten:2:g", "add:0", "add:0:g", "add:1", "add:1:g", "add:2", "add:2:g", "sub:0", "sub:0:g", "sub:1", "sub:1:g", "sub:2", "sub:2:g", "shape:0", "shape:0:g", "shape:1", "shape:1:g", "shape:2", "shape:2:g", "sort:0", "sort:0:g", "sort:1", "sort:1:g", "sort:2", "sort:2:g", "pattern:0", "pattern:0:g", "pattern:1", "pattern:1:g", "pattern:2", "pattern:2:g", "clock:0", "clock:0:g", "clock:1", "clock:1:g", "clock:2", "clock:2:g", "g1set:0", "g1set:0:g", "g1set:1", "g1set:1:g", "g1set:2", "g1set:2:g", "g1pair:0", "g1pair:0:g", "g1pair:1", "g1pair:1:g", "g1pair:2", "g1pair:2:g", "g1teen:0", "g1teen:0:g", "g1teen:1", "g1teen:1:g", "g1teen:2", "g1teen:2:g", "g1shiki:0", "g1shiki:0:g", "g1shiki:1", "g1shiki:1:g", "g1shiki:2", "g1shiki:2:g", "treasure:shima", "treasure:umi", "treasure:yama", "treasure:mori", "treasure:kyoshitsu", "transfer:0", "transfer:1", "transfer:2", "transfer:3", "transfer:4", "transfer:5"]);
const SecondRound = (() => {
  const chapters = [
    { title:'なかまづくりと かず', subtitle:'むすぶ・かぞえる・０から10', color:'var(--c-blue)' },
    { title:'なんばんめ', subtitle:'むきと じゅんばん', color:'var(--c-green)' },
    { title:'いくつと いくつ', subtitle:'わける・かくす・10を つくる', color:'var(--c-yellow)' },
    { title:'あわせて いくつ', subtitle:'あわせる・ふえる・たしざん', color:'var(--c-orange)' },
    { title:'のこりと ちがい', subtitle:'とる・くらべる・ひきざん', color:'var(--c-purple)' }
  ];
  const lessons = [
    ['なかまを あつめよう','group'], ['１から５の かず','count'], ['５と あといくつ','five'], ['０と かずの ならび','zero'],
    ['ひだり・みぎから','horizontal'], ['うえ・したから','vertical'], ['まえ・うしろから','train'], ['なんこ？ なんばんめ？','cardinal'],
    ['５と６を わけよう','splitSmall'], ['７と８を わけよう','splitLarge'], ['９と10の かくれた かず','hidden'], ['10の あいぼう','makeTen'],
    ['あわせる おはなし','combine'], ['ふえる おはなし','increase'], ['０の たしざん','zeroAdd'], ['おなじ こたえの カード','sumCards'],
    ['とると のこりは？','take'], ['ひきざんの しき','subEquation'], ['ちがいは いくつ？','difference'], ['しきに あう おはなし','subStory']
  ].map(([title, type], id) => ({ id, title, type, chapter:Math.floor(id/4), key:'r2:'+id }));
  const chapterKey = i => 'r2chapter:'+i;
  let node, body, heading, speech='', run=null, q=null, exitArmed=false;
  function progress(){
    const groups = [
      {label:'ふつう', keys:SECOND_ROUND_GATE.filter(k => !k.endsWith(':g') && !/^(transfer|treasure):/.test(k))},
      {label:'きん', keys:SECOND_ROUND_GATE.filter(k => k.endsWith(':g'))},
      {label:'たからばこ', keys:SECOND_ROUND_GATE.filter(k => k.startsWith('treasure:'))},
      {label:'とくべつ', keys:SECOND_ROUND_GATE.filter(k => k.startsWith('transfer:'))}
    ];
    const owns = k => k.startsWith('treasure:') ? Store.hasTreasure(k.split(':')[1]) : Store.hasConfirmed(k);
    groups.forEach(g => { g.got=g.keys.filter(owns).length; g.total=g.keys.length; });
    return {got:groups.reduce((n,g)=>n+g.got,0), total:131, groups, missing:SECOND_ROUND_GATE.filter(k=>!owns(k))};
  }
  function unlocked(){
    if (Store.data.secondRoundReached) return true;
    if (progress().got !== 131) return false;
    Store.setPref('secondRoundReached',true); return true;
  }
  const rewardKeys = () => lessons.map(l=>l.key).concat(chapters.map((c,i)=>chapterKey(i)));
  const earned = () => rewardKeys().filter(k=>Store.hasSticker(k)).length;
  function lessonOpen(id){
    if (!unlocked() || !lessons[id]) return false;
    if (id===0 || Store.hasSticker(lessons[id].key)) return true;
    const previous=lessons[id-1].key, r=Store.data.reviewRecords[previous];
    return Store.hasSticker(previous) || !!(r && r.runs>=3);
  }
  const chapterReady = i => unlocked() && lessons.slice(i*4,i*4+4).every(l=>Store.hasConfirmed(l.key));
  const due = k => Store.isPending(k) && Store.pendingDue().includes(k);
  function button(text, fn, cls='btn-ghost'){
    return el('button.btn.'+cls,{type:'button',text,onclick(){exitArmed=false;Sound.sfx.tap();fn();}});
  }
  function say(text){speech=text;Sound.say(text,{delay:80});}
  function gateCard(){
    const p=progress();
    return el('section.review-gate',{'aria-label':'うらの さんすうの ひらきかた'},
      el('h3',{text:'📖 うらの さんすう　'+p.got+'／131'}),
      el('p',{text:'１しゅうめの シールが ぜんぶ そろうと、ほんの うらが ひらくよ。'}),
      el('div.review-ledger',null,p.groups.map(g=>el('span',{text:g.label+' '+g.got+'／'+g.total}))),
      el('div.review-missing',null,p.groups.map(g=>{
        const k=g.keys.find(k=>p.missing.includes(k));
        return k ? button(g.label+'を あつめにいく',()=>openOriginal(k)) : null;
      })));
  }
  function openOriginal(k){
    if(k.startsWith('treasure:')){Treasures.open(k.split(':')[1]);return;}
    if(k.startsWith('transfer:')){TransferAdventure.open();return;}
    const [id]=k.split(':'), g=Games.byId[id];
    if(!g) return;
    if(!stageOpen(g)){Home.render();UI.show('home');say(Progress.unlockHint(g));return;}
    Levels.render(g);UI.show('levels');Sound.say(Levels.speech(),{delay:120});
  }
  function homeCard(){
    if(!unlocked()){
      if(!TransferAdventure.unlocked()) return null;
      return el('button.home-quest.review-home',{type:'button',onclick:()=>Book.open()},
        el('span.review-cover',{text:'📖','aria-hidden':'true'}),el('span',null,
          el('strong',{text:'うらの さんすうが まっているよ'}),el('small',{text:'１しゅうめ '+progress().got+'／131　シールブックで たしかめる'})),el('span',{text:'→'}));
    }
    return el('button.home-quest.review-home',{type:'button',onclick:open},
      PokemonStickers.artwork('r2:0',{rarity:false}),el('span',null,
        el('strong',{text:'ほんを うらがえす　うらの さんすう'}),el('small',{text:'もういちど できるかな？　あたらしい シール '+earned()+'／25'})),el('span',{text:'↪','aria-hidden':'true'}));
  }
  function collection(){
    if(!unlocked()) return gateCard();
    return el('section.review-collection',{'aria-label':'うらの さんすうシール'},
      el('h3',{text:'📖 うらの さんすう　'+earned()+'／25'}),
      button('ほんを うらがえして あそぶ',open,'btn-accent'),
      el('p',{text:'レッスンの シール20まいと、たんげんの まとめ５まい。'}),
      chapters.map((c,i)=>el('div.review-collection-chapter',null,el('h4',{text:(i+1)+'　'+c.title}),
        el('div.review-collection-grid',null,lessons.slice(i*4,i*4+4).map(l=>collectible(l.key,l.title,()=>open(l.id))),
          collectible(chapterKey(i),'まとめ',()=>open(null,i))))));
  }
  function collectible(k,title,fn){
    const has=Store.hasSticker(k), pending=Store.isPending(k);
    return el('button.review-collectible'+(pending?'.pending':''),{type:'button',onclick:()=>has&&!pending?StickerWorld.open(k):fn()},
      PokemonStickers.artwork(k,{silhouette:!has}),el('span',{text:title+(pending?'・かりの シール':'')}));
  }
  function parentSummary(){
    const rows=Object.entries(Store.data.reviewRecords||{});
    if(!unlocked() && !rows.length) return null;
    return el('section.section.review-parent',null,el('h3',{text:'2周目：教科書の見せ方で復習'}),
      el('p',{text:'東京書籍「あたらしいさんすう1 上」（平成20年発行）の添付範囲を、独自の絵と1問ずつの操作に対応させています。通常は8問中4問の自力初回正解で仮獲得、8問すべてなら即確定。別の日の3問中2問で確定します。まとめは各単元4枚の確定後、5問中4問の自力初回正解で獲得します。'}),
      rows.map(([k,r])=>el('p',{text:(k.startsWith('r2chapter:')?chapters[Number(k.split(':')[1])].title+'のまとめ':lessons[Number(k.split(':')[1])].title)
        +'：自力で初回正解 '+r.independent+'問／答え直して正解 '+r.revised+'問／ヒント・見本を使用 '+r.supported+'問（直近の'+({lesson:'レッスン',check:'別の日の確認',chapter:'まとめ'})[r.kind]+'）'})));
  }
  function build(){
    if(node) return;
    body=el('div.review-body');heading=el('h2');
    const exit=el('button.btn.btn-ghost.btn-round',{type:'button','aria-label':'おもてに もどる',text:'←',onclick(){
      Sound.sfx.tap();
      if(run&&!exitArmed){
        exitArmed=true;
        if(!$('.review-exit',body)) body.prepend(el('p.review-exit',{role:'status',text:'ここで おわる？ ← を もういちど おすと もどるよ（つぎは１もんめから）'}));
        say('ここでおわる？ もどるをもう一度押すと、つぎは１問目からだよ。');return;
      }
      if(run){run=null;menu();}else{Home.render();UI.show('home',{replace:true});}
    }});
    node=el('div#review',null,el('div.topbar',null,exit,heading,speakBtn(()=>speech)),body);
    UI.register('review',node);
  }
  function open(id,chapter){
    if(!unlocked()){Book.open();return;}
    build();run=null;menu();UI.show('review');
    if(Number.isInteger(id)&&lessonOpen(id)) start(id);
    else if(Number.isInteger(chapter)&&chapterReady(chapter)) start(null,chapter);
    else say('ほんのうらがひらいたよ。教科書のじゅんばんで、もういちどやってみよう。');
  }
  function menu(){
    run=null;q=null;exitArmed=false;clear(body);heading.textContent='うらの さんすう';
    body.append(el('div.review-menu-intro',null,
      el('span.review-bookmark',{text:'２しゅうめ'}),el('h3',{text:'もういちど、できるかな？'}),
      el('p',{text:'あたらしい なかま '+earned()+'／25　・　１レッスン ８もん'}),
      button('おもての ぼうけんへ',()=>{Home.render();UI.show('home');})),
      ...chapters.map((c,i)=>el('section.review-chapter',{style:{'--chapter-color':c.color}},
        el('div.review-chapter-heading',null,el('span.review-chapter-number',{text:i+1}),el('div',null,el('h3',{text:c.title}),el('p',{text:c.subtitle}))),
        el('div.review-lesson-grid',null,lessons.slice(i*4,i*4+4).map(l=>{
          const available=lessonOpen(l.id), has=Store.hasSticker(l.key), pending=Store.isPending(l.key);
          return el('div.review-lesson-slot'+(pending?'.pending':''),null,
            el('button.review-lesson',{type:'button',disabled:!available,dataset:{lesson:l.id}},
              PokemonStickers.artwork(l.key,{silhouette:!has,rarity:false}),
              el('strong',{text:l.title}),el('small',{text:!available?'まえの レッスンから':pending?'かりの シール':has?'また あそぶ':'８もん あそぶ'})),
            due(l.key)?button('３もん たしかめる',()=>start(l.id,null,true),'btn-accent.review-due'):null);
        })),
        el('div.review-chapter-footer',null,el('span',{text:'まとめ：４つの シールに いろが ついたら'}),
          el('button.btn.btn-accent.review-summary',{type:'button',disabled:!chapterReady(i),dataset:{chapter:i},text:'５もんの まとめ'+(Store.hasSticker(chapterKey(i))?' ✓':'')})))));
    $$('[data-lesson]',body).forEach(b=>b.addEventListener('click',()=>{Sound.sfx.tap();start(Number(b.dataset.lesson));}));
    $$('[data-chapter]',body).forEach(b=>b.addEventListener('click',()=>{Sound.sfx.tap();start(null,Number(b.dataset.chapter));}));
    focusHeading();
  }
  function focusHeading(){heading.tabIndex=-1;heading.focus({preventScroll:true});body.scrollTop=0;}
  function start(id,chapter,check=false){
    if(Number.isInteger(chapter)?!chapterReady(chapter):!lessonOpen(id)) return;
    if(check&&!due(lessons[id].key)) return;
    const kind=Number.isInteger(chapter)?'chapter':check?'check':'lesson';
    run={id,chapter,kind,step:0,total:kind==='chapter'?5:check?3:8,outcomes:[],key:kind==='chapter'?chapterKey(chapter):lessons[id].key};
    nextQuestion();
  }
  function nextQuestion(){
    const id=run.kind==='chapter'?(run.step<4?run.chapter*4+run.step:run.chapter?run.chapter*4-1:3):run.id;
    q=generate(id,run.step);q.lessonId=id;q.missed=false;q.supported=false;q.done=false;q.selected=[];q.pairs=[];q.active=0;q.values=[null,null,null];q.op=null;q.left=0;
    exitArmed=false;renderQuestion();focusHeading();say(q.prompt);
  }
  // Own vector illustrations: keep quantity and spatial direction clear at any screen size.
  function illustration(kind='animal',variant=0){
    const colors=['#E8A275','#83BFB0','#A4B5D6','#D5A4BA','#DBBE69'];
    const art=svg('svg',{viewBox:'0 0 64 64',class:'review-art','aria-hidden':'true'},svg('ellipse',{cx:32,cy:58,rx:22,ry:3,fill:'#665540',opacity:.12}));
    if(kind==='flower') art.append(svg('path',{d:'M32 50 V28 M32 43 Q12 34 18 48 Q25 53 32 47 M32 40 Q53 31 48 44 Q42 49 32 45',stroke:'#4C9471','stroke-width':4,fill:'#83BFB0'}),
      ...[0,60,120,180,240,300].map(a=>svg('ellipse',{cx:32,cy:15,rx:8,ry:11,fill:colors[variant%5],transform:'rotate('+a+' 32 26)'})),svg('circle',{cx:32,cy:26,r:7,fill:'#EED07B'}));
    else if(kind==='umbrella') art.append(svg('path',{d:'M32 27 V48 Q32 60 22 54',fill:'none',stroke:'#746252','stroke-width':4,'stroke-linecap':'round'}),svg('path',{d:'M6 30 Q10 3 32 6 Q54 3 58 30 Q45 22 32 30 Q19 22 6 30 Z',fill:colors[variant%5],stroke:'#746252','stroke-width':2}),svg('path',{d:'M32 6 Q21 12 20 27 M32 6 Q43 12 44 27',fill:'none',stroke:'#FFF7E6','stroke-width':2}));
    else art.append(svg('circle',{cx:15,cy:17,r:10,fill:colors[variant%5]}),svg('circle',{cx:49,cy:17,r:10,fill:colors[variant%5]}),svg('rect',{x:18,y:35,width:28,height:22,rx:10,fill:colors[(variant+1)%5]}),svg('ellipse',{cx:32,cy:28,rx:24,ry:21,fill:'#DEC5A3'}),svg('ellipse',{cx:32,cy:37,rx:12,ry:9,fill:'#FFF3DA'}),svg('circle',{cx:23,cy:27,r:2.6,fill:'#403D3E'}),svg('circle',{cx:41,cy:27,r:2.6,fill:'#403D3E'}),svg('path',{d:'M29 34 Q32 30 35 34 L32 37 Z',fill:'#403D3E'}),svg('path',{d:'M26 41 Q32 45 38 41',fill:'none',stroke:'#403D3E','stroke-width':1.7,'stroke-linecap':'round'}));
    return art;
  }
  function generate(id,step=0){
    const l=lessons[id], r={type:l.type,thing:pick(['animal','flower','umbrella']),a:0,b:0,answer:0};
    if(id===0){
      r.type=step%2?'match':'group';r.a=ri(2,5);r.b=r.a+ri(1,2);
      if(r.type==='group'){
        r.things=shuffle(range(0,r.a-1).map(()=>r.thing).concat(range(0,ri(1,3)-1).map(()=>r.thing==='flower'?'umbrella':'flower')));
        r.answer=r.things.map((v,i)=>v===r.thing?i:-1).filter(i=>i>=0);
        r.prompt=({animal:'くま',flower:'おはな',umbrella:'かさ'})[r.thing]+'の なかまを ぜんぶ えらぼう。';
      }else{r.prompt='くまに かさを １つずつ むすぼう。あまっても だいじょうぶ。';r.answer=r.a;}
    }else if(r.type==='count'||r.type==='five'){
      r.a=r.type==='count'?ri(1,5):ri(6,10);r.answer=r.type==='count'?r.a:r.a-5;
      r.prompt=r.type==='count'?'ぜんぶで いくつ？':'５と あと いくつで '+r.a+'に なるかな？';
    }else if(r.type==='zero'){
      if(step%2===0){r.type='zeroCount';r.a=step%4===0?0:ri(1,10);r.answer=r.a;r.prompt='おさらの なかは いくつ？';}
      else{r.type='sequence';r.a=ri(1,9);r.reverse=step%4===3;r.answer=r.a;r.prompt=(r.reverse?'おおきい かずから':'ちいさい かずから')+' じゅんに ならべよう。□は いくつ？';}
    }else if(['horizontal','vertical','train','cardinal'].includes(r.type)){
      r.a=ri(5,8);r.n=ri(1,r.a);r.reverse=step%2===1;r.answer=r.reverse?r.a-r.n:r.n-1;
      r.cardinality=r.type==='cardinal'&&step%2===0;
      const dir=r.type==='vertical'?(r.reverse?'した':'うえ'):r.type==='train'?(r.reverse?'うしろ':'まえ'):(r.reverse?'みぎ':'ひだり');
      r.prompt=r.cardinality?r.n+'こ えらぼう。':dir+'から '+r.n+'ばんめを えらぼう。';
    }else if(['splitSmall','splitLarge','hidden','makeTen'].includes(r.type)){
      r.a=r.type==='splitSmall'?5+step%2:r.type==='splitLarge'?7+step%2:r.type==='hidden'?9+step%2:10;
      r.b=ri(1,r.a-1);r.answer=r.a-r.b;
      r.prompt=r.type==='hidden'?r.a+'は '+r.b+'と いくつ？ かくれた かずを あてよう。'
        :r.type==='makeTen'?r.b+'と いくつで 10？':r.a+'こを、ひだりに '+r.b+'こ、みぎに のこりを わけよう。';
    }else if(['combine','increase','zeroAdd','subEquation','take','difference','subStory'].includes(r.type)){
      const sub=['subEquation','take','difference','subStory'].includes(r.type);
      r.a=ri(2,9);r.b=sub?ri(1,r.a):ri(1,10-r.a);
      if(r.type==='zeroAdd'){r.a=step%3===2?0:ri(1,10);r.b=0;if(step%3===1)[r.a,r.b]=[r.b,r.a];}
      r.answer=sub?r.a-r.b:r.a+r.b;r.expectedOp=sub?'−':'＋';
      r.prompt=({combine:'あわせると いくつ？ しきと こたえを つくろう。',increase:'ふえると いくつ？ しきと こたえを つくろう。',zeroAdd:'０の たしざん。しきと こたえを つくろう。',subEquation:'とると のこりは？ しきと こたえを つくろう。',take:'とると のこりは いくつ？',difference:'１つずつ くらべよう。ちがいは いくつ？',subStory:'しきに あう おはなしを えらぼう。'})[r.type];
      if(r.type==='subStory'){
        r.stories=shuffle([{text:r.a+'こ あって、'+r.b+'こ とりました。',correct:true},
          {text:r.a+'こ あって、'+r.b+'こ ふえました。',correct:false},
          {text:r.a+'こと、'+r.b+'こを あわせました。',correct:false},
          {text:(r.a+1)+'こ あって、'+r.b+'こ とりました。',correct:false}]);
        r.answer=r.stories.findIndex(s=>s.correct);
      }
    }else if(r.type==='sumCards'){
      r.a=ri(4,10);const a=ri(1,r.a-1), b=a===1?2:1;
      r.cards=shuffle([{a,b:r.a-a},{a:b,b:r.a-b},{a:0,b:r.a-1},{a:1,b:r.a}]);
      r.answer=r.cards.map((c,i)=>c.a+c.b===r.a?i:-1).filter(i=>i>=0);
      r.prompt='こたえが '+r.a+'に なる カードを ２まい えらぼう。';
    }
    return r;
  }
  const equationTypes=['combine','increase','zeroAdd','subEquation'];
  function items(n,kind=q.thing,variant=0){return range(0,n-1).map((_,i)=>illustration(kind,variant+i%5));}
  function blocks(n){return el('div.review-blocks',{'aria-label':n+'この ブロック'},range(0,n-1).map(()=>el('span.review-block',{'aria-hidden':'true'})));}
  function tray(n,label,kind=q.thing){return el('div.review-tray',null,el('span.review-tray-label',{text:label}),
    el('div.review-objects',{role:'img','aria-label':({animal:'くま',flower:'おはな',umbrella:'かさ'})[kind]+' '+n+'こ'},items(n,kind)));}
  function action(fn){if(q.done) return;exitArmed=false;Sound.sfx.tap();fn();renderQuestion(true);}
  function renderQuestion(restore=false){
    const focus=restore&&document.activeElement&&document.activeElement.getAttribute('data-focus');
    clear(body);const c=chapters[lessons[q.lessonId].chapter];
    heading.textContent=run.kind==='chapter'?chapters[run.chapter].title+'の まとめ':lessons[run.id].title;
    const scene=el('div.review-scene');
    body.append(el('div.review-question-head',null,el('span.review-bookmark',{text:'２しゅうめ　'+(run.kind==='check'?'べつのひの たしかめ':run.kind==='chapter'?'まとめ':(lessons[q.lessonId].chapter+1)+'　'+c.title)}),
      el('span.review-progress',{text:(run.step+1)+'／'+run.total+'もん'})),el('h3.review-prompt',{text:q.prompt}),scene);
    if(q.type==='group'){
      scene.append(el('div.review-select-grid',null,q.things.map((kind,i)=>el('button.review-object-choice',{type:'button','aria-label':({animal:'くま',flower:'おはな',umbrella:'かさ'})[kind]+' '+(i+1),'aria-pressed':String(q.selected.includes(i)),dataset:{focus:'object'+i},onclick:()=>action(()=>toggle(i))},illustration(kind,i)))));
    }else if(q.type==='match'){
      scene.append(el('div.review-pair-columns',null,
        el('div',null,range(0,q.a-1).map(i=>el('button.review-pair-target',{type:'button',disabled:q.pairs.some(p=>p[0]===i),dataset:{focus:'target'+i},'aria-label':(i+1)+'ばんめの くま','aria-pressed':String(q.target===i),onclick:()=>action(()=>q.target=i)},illustration('animal',i),el('small',{text:q.pairs.some(p=>p[0]===i)?'✓ '+(q.pairs.find(p=>p[0]===i)[1]+1):i+1})))),
        el('span.review-pair-arrow',{'aria-hidden':'true',text:'↔'}),
        el('div',null,range(0,q.b-1).map(i=>el('button.review-pair-object',{type:'button',disabled:q.pairs.some(p=>p[1]===i),dataset:{focus:'pair'+i},'aria-label':(i+1)+'ばんめの かさ',onclick:()=>action(()=>{if(q.target!==undefined&&!q.pairs.some(p=>p[0]===q.target)){q.pairs.push([q.target,i]);q.target=undefined;}})},illustration('umbrella',i),el('small',{text:q.pairs.some(p=>p[1]===i)?'✓ '+(q.pairs.find(p=>p[1]===i)[0]+1):i+1}))))),
        el('p',{text:'くま → かさ の じゅんに タップ。１ぴきに １つずつ。'}));
    }else if(['horizontal','vertical','train','cardinal'].includes(q.type)){
      const row=el('div.review-order.'+(q.type==='vertical'?'vertical':'horizontal')+(q.type==='train'?'.train':''));
      const dir=q.type==='vertical'?['うえ','した']:q.type==='train'?['まえ','うしろ']:['ひだり','みぎ'];
      row.append(el('span.review-direction',{text:dir[0]}),el('div.review-order-items',null,range(0,q.a-1).map(i=>el('button.review-object-choice',{type:'button','aria-label':'ならびの '+(i+1)+'こめ','aria-pressed':String(q.selected.includes(i)),dataset:{focus:'order'+i},onclick:()=>action(()=>{if(q.cardinality)toggle(i);else q.selected=[i];})},illustration('animal',i)))),el('span.review-direction',{text:dir[1]}));
      scene.append(row);
    }else if(q.type==='splitSmall'||q.type==='splitLarge'){
      const plates=[q.left,q.a-q.left].map((n,side)=>el('div.review-plate',null,
        el('strong',{text:(side?'みぎ':'ひだり')+'　'+n+'こ'}),
        el('div.review-objects',null,range(0,n-1).map((_,i)=>el('button.review-piece',{
          type:'button','aria-label':side?'ひだりへ １つ':'みぎへ １つ',dataset:{focus:'piece'+side+i},
          onclick:()=>action(()=>q.left+=side?1:-1)
        },illustration(q.thing,i))))));
      scene.append(el('p.review-total',{text:'ぜんぶで '+q.a+'こ'}),el('div.review-plates',null,plates),
        el('p',{text:'ものを タップして もうひとつの おさらに うつそう。'}));
    }else if(q.type==='hidden'||q.type==='makeTen'||q.type==='five'){
      const known=q.type==='five'?5:q.b;
      scene.append(el('p.review-total',{text:'ぜんぶで '+q.a}),el('div.review-part-whole',null,blocks(known),el('span',{text:'と'}),
        el('div.review-hidden',{'aria-label':q.done?'かくれていた '+q.answer:'かずを かくした はこ'},
          q.done?blocks(q.answer):el('span',{text:'？','aria-hidden':'true'}))));
      if(q.type==='five') scene.prepend(tray(q.a,'５つで ひとまとまり'));
    }else if(q.type==='sequence'){
      const seq=range(q.a-1,q.a+1);if(q.reverse)seq.reverse();
      scene.append(el('div.review-sequence',null,seq.map(n=>el('span',{text:n===q.a?'□':n}))),blocks(q.a-1));
    }else if(q.type==='sumCards'){
      scene.append(el('div.review-card-options',null,q.cards.map((v,i)=>el('button.review-expression',{type:'button','aria-pressed':String(q.selected.includes(i)),dataset:{focus:'card'+i},text:v.a+' ＋ '+v.b,onclick:()=>action(()=>toggle(i))}))));
    }else if(q.type==='subStory'){
      scene.append(el('div.review-equation-title',{text:q.a+' − '+q.b+' = □'}),el('div.review-stories',null,q.stories.map((s,i)=>el('div',null,
        el('button.review-story',{type:'button','aria-pressed':String(q.selected.includes(i)),dataset:{focus:'story'+i},text:s.text,onclick:()=>action(()=>q.selected=[i])}),
        el('button.btn.btn-ghost.btn-round',{type:'button','aria-label':(i+1)+'ばんの おはなしを きく',text:'🔊',onclick:()=>Sound.say(s.text)})))));
    }else if(equationTypes.includes(q.type)||q.type==='take'||q.type==='difference'){
      if(q.type==='difference')scene.append(el('div.review-compare',null,tray(q.a,'うえ'),tray(q.b,'した')));
      else if(q.type==='take'||q.type==='subEquation')scene.append(tray(q.a,'はじめに '+q.a+'こ'),tray(q.b,'とる '+q.b+'こ'),el('p',{text:'はじめの '+q.a+'こから、'+q.b+'こを とります。'}));
      else scene.append(el('div.review-two-scenes',null,tray(q.a,'はじめに '+q.a+'こ'),el('span.review-action-arrow',{text:q.type==='combine'?'＋':'←','aria-hidden':'true'}),tray(q.b,(q.type==='combine'?'あわせる ': 'ふえる ')+q.b+'こ')),
        el('p',{text:q.a+'こ'+(q.type==='combine'?'と '+q.b+'こを あわせます。':' あって、'+q.b+'こ ふえます。')}));
      if(equationTypes.includes(q.type))scene.append(equation());
    }else scene.append(tray(q.a,q.type==='zeroCount'?'おさらの なか':'よく みて かぞえよう'));
    const numeric=['count','five','zeroCount','sequence','hidden','makeTen','take','difference'].includes(q.type)||equationTypes.includes(q.type);
    if(numeric){
      if(!equationTypes.includes(q.type)) body.append(el('div.review-answer',{text:'こたえ　'+(q.value===undefined?'□':q.value)}));
      body.append(el('div.review-keypad',{'aria-label':'０から10の こたえ'},range(0,10).map(n=>el('button.review-number',{type:'button',disabled:q.done,text:n,dataset:{number:n,focus:'number'+n},'aria-label':String(n),'aria-pressed':String(equationTypes.includes(q.type)?q.values[q.active]===n:q.value===n),onclick:()=>action(()=>{if(equationTypes.includes(q.type)){q.values[q.active]=n;if(q.active<2)q.active++;}else q.value=n;})}))));
    }
    const feedback=el('p.review-feedback',{role:'status','aria-live':'polite',text:q.done?q.result:q.message||''});
    body.append(feedback,el('div.review-actions',null,q.done?button(run.step+1===run.total?'できた！':'つぎの もんだい',advance,'btn-accent.review-next'):
      [button('👀 ヒント',hint),button('たしかめる',check,'btn-accent.review-check')]));
    if(q.showHint&&!q.done)body.append(el('div.review-hint',{role:'status'},el('p',{text:q.hintText}),button('いっしょに やってみる',model)));
    if(q.done) $$('button',scene).forEach(b=>b.disabled=true);
    if(focus){const b=$('[data-focus="'+focus+'"]',body);if(b&&!b.disabled)b.focus({preventScroll:true});}
  }
  function equation(){
    return el('div.review-equation',null,el('p',{text:'□を えらんで、すうじを いれよう。＋か − も えらぼう。'}),el('div.review-equation-row',null,
      el('div.review-operands',null,field(0),el('div.review-operators',null,['＋','−'].map(op=>el('button.review-operator',{type:'button',text:op,'aria-label':op==='＋'?'たす':'ひく','aria-pressed':String(q.op===op),dataset:{focus:'op'+op},onclick:()=>action(()=>q.op=op)}))),field(1)),
      el('div.review-equation-result',null,el('span',{text:'＝'}),field(2))));
  }
  function field(i){return el('button.review-field',{type:'button',text:q.values[i]===null?'□':q.values[i],'aria-label':['さいしょの かず','つぎの かず','こたえ'][i], 'aria-pressed':String(q.active===i),dataset:{focus:'field'+i},onclick:()=>action(()=>q.active=i)});}
  function toggle(i){q.selected=q.selected.includes(i)?q.selected.filter(v=>v!==i):q.selected.concat(i);}
  function correct(){
    if(q.type==='match')return q.pairs.length===q.a&&new Set(q.pairs.map(p=>p[0])).size===q.a&&new Set(q.pairs.map(p=>p[1])).size===q.a;
    if(q.type==='group'||q.type==='sumCards')return q.selected.length===q.answer.length&&q.answer.every(i=>q.selected.includes(i));
    if(q.type==='splitSmall'||q.type==='splitLarge')return q.left===q.b;
    if(q.cardinality)return q.selected.length===q.n;
    if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))return q.selected.length===1&&q.selected[0]===q.answer;
    if(equationTypes.includes(q.type))return q.op===q.expectedOp&&q.values[2]===q.answer&&
      ((q.values[0]===q.a&&q.values[1]===q.b)||(q.type==='combine'&&q.values[0]===q.b&&q.values[1]===q.a));
    return q.value===q.answer;
  }
  function check(){
    if(!run||q.done) return;
    const incomplete=equationTypes.includes(q.type)?q.values.some(v=>v===null)||!q.op:
      ['count','five','zeroCount','sequence','hidden','makeTen','take','difference'].includes(q.type)?q.value===undefined:
      q.type==='match'?q.pairs.length<q.a:['splitSmall','splitLarge'].includes(q.type)?false:q.selected.length===0;
    if(incomplete){q.message='まだ えらんでいない ところが あるよ。';renderQuestion();$('.review-check',body).focus({preventScroll:true});say(q.message);return;}
    if(!correct()){q.missed=true;q.message='もういちど、えや むきを よく みてみよう。';Sound.sfx.tap();renderQuestion();$('.review-check',body).focus({preventScroll:true});say(q.message);return;}
    q.done=true;
    const outcome=q.supported?'supported':q.missed?'revised':'independent';run.outcomes.push(outcome);Store.countToday(1);
    q.result=({independent:'じぶんで できたね！',revised:'もういちど ためして できたね！',supported:'ヒントで できたね！'})[outcome];
    Sound.sfx.correct();renderQuestion();say(q.result);
    const next=$('.review-next',body);if(next)next.focus({preventScroll:true});
  }
  function hint(){
    if(!q||q.done) return;q.supported=true;q.showHint=true;
    q.hintText=q.type==='hidden'?'ぜんぶの かずから、みえている かずを とると、かくれた かずが わかるよ。'
      :['horizontal','vertical','train','cardinal'].includes(q.type)?'「どちらから」と「なんばんめ」を たしかめて、１つずつ かぞえよう。'
      :q.type==='match'?'くまを １ぴき えらんで、まだ むすんでいない かさを １つ えらぼう。'
      :q.type==='group'?'おなじ なかまだけを えらぼう。ちがう なかまは えらばないよ。'
      :q.type==='difference'?'１つずつ むすんで くらべると、あまった ぶんが ちがいだよ。'
      :equationTypes.includes(q.type)?'はじめの かず、あわせる・ふえる・とる かずを しきに しよう。０は １つもない かずだよ。'
      :q.type==='subStory'?'「ひく」は、とる おはなし。はじめの かずと、とる かずも たしかめよう。'
      :'１つずつ かぞえたり、５つの まとまりを つかったりして たしかめよう。';
    renderQuestion();$('.review-hint button',body).focus({preventScroll:true});say(q.hintText);
  }
  function model(){
    if(!q||q.done)return;q.supported=true;
    if(q.type==='match')q.pairs=range(0,q.a-1).map(i=>[i,i]);
    else if(q.type==='group'||q.type==='sumCards')q.selected=q.answer.slice();
    else if(q.type==='splitSmall'||q.type==='splitLarge')q.left=q.b;
    else if(q.cardinality)q.selected=range(0,q.n-1);
    else if(['horizontal','vertical','train','cardinal','subStory'].includes(q.type))q.selected=[q.answer];
    else if(equationTypes.includes(q.type)){q.values=[q.a,q.b,q.answer];q.op=q.expectedOp;}
    else q.value=q.answer;
    q.message='いっしょに できたね。えと こたえを たしかめよう。';renderQuestion();say(q.message);
  }
  function advance(){if(!run||!q.done)return;run.step++;if(run.step<run.total)nextQuestion();else finish();}
  function finish(){
    const done=run, clean=done.outcomes.filter(v=>v==='independent').length;
    Store.recordReview(done.key,done.outcomes,done.kind);
    let fresh=false, confirmed=false, passed=false;
    if(done.kind==='chapter'){
      passed=clean>=4;if(passed)fresh=Store.addSticker(done.key);
    }else if(done.kind==='check'){
      passed=clean>=2;if(passed)confirmed=Store.confirmSticker(done.key);else Store.failCheck(done.key);
    }else{
      passed=clean>=4;
      if(clean===8){fresh=Store.addSticker(done.key);confirmed=Store.confirmSticker(done.key);}
      else if(passed){
        if(Store.isPending(done.key)&&Store.pendingFrom(done.key)<Store.dayNumber())confirmed=Store.confirmSticker(done.key);
        else fresh=Store.addPending(done.key);
      }
    }
    run=null;q=null;exitArmed=false;clear(body);heading.textContent='やりとげたね！';
    const has=Store.hasSticker(done.key), pending=Store.isPending(done.key), record=Store.data.reviewRecords[done.key];
    let note=confirmed?'シールに いろが ついたよ！':fresh?(pending?'かりの シールを ゲット！ べつのひに ３もん たしかめよう。':'あたらしい なかまを ゲット！'):
      passed?(pending?'べつのひに ３もん たしかめると いろが つくよ。':'もういちど できたね！'):
      'じぶんで さいしょから '+(done.kind==='chapter'?'４／５':done.kind==='check'?'２／３':'４／８')+'もん できたら '+(done.kind==='check'?'いろが つくよ。':'シールを もらえるよ。');
    const nextId=done.kind==='chapter'?(done.chapter+1)*4:done.id+1;
    body.append(el('div.review-result',null,has?PokemonStickers.artwork(done.key):illustration('animal'),
      el('h3',{text:note}),el('p',{text:'じぶんで '+record.independent+'もん・もういちど '+record.revised+'もん・ヒント '+record.supported+'もん'}),
      el('div.review-actions',null,
        lessonOpen(nextId)?button('つぎの レッスン',()=>start(nextId),'btn-accent'):null,
        has&&!pending?button('じぶんの しまに かざる',()=>StickerWorld.open(done.key)):null,
        button('もういちど あそぶ',()=>start(done.id,done.chapter,done.kind==='check'&&due(done.key))),button('ほんの もくじへ',menu),
        button('きょうは ここまで',()=>{Home.render();UI.show('home');}))));
    if(fresh||confirmed)UI.confetti(40);focusHeading();say((fresh?stickerFor(done.key)+'の シール。':'')+note);
  }
  return {open,unlocked,progress,homeCard,collection,parentSummary,lessons,chapters,generate,lessonOpen,chapterReady,rewardKeys,
    // Same debug surface as the first-round engine; answers are not attached to child-facing DOM.
    inspect:()=>run?{run,q}:null};
})();
