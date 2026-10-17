/* ===========================================================
   02 — progress storage (per-device, localStorage; degrades to memory)
   =========================================================== */
'use strict';

/* What「考えずに言える」means in milliseconds for the number facts in けいさんの やま.
   Under FAST the answer arrived; over SLOW it was worked out — almost always by
   counting. Between the two it is on its way. These are deliberately generous:
   the point is to tell retrieval from counting, not to run a race. */
const FLUENT_FAST_MS = 3000, FLUENT_SLOW_MS = 9000;
const TREASURE_WORLDS = ['shima', 'umi', 'yama', 'mori', 'kyoshitsu'];
function transferSessionValid(s){
  const integer=(n,max=10000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
  if (!s || typeof s!=='object' || Array.isArray(s) || !integer(s.at,Number.MAX_SAFE_INTEGER)
    || !s.run || !integer(s.run.id,5) || !integer(s.run.step,5) || !Array.isArray(s.run.results)
    || s.run.results.length!==s.run.step || s.run.results.some(r=>!['independent','revised','supported'].includes(r))) return false;
  if (s.q===null) return true;
  if (s.run.step===5) return false;
  const q=s.q;
  return !!q && typeof q==='object' && !Array.isArray(q) && integer(q.total,10) && q.total>=6
    && ['a','b','value','phase','left','mistakes'].every(k=>integer(q[k],k==='mistakes'?10000:10))
    && (q.previous===null || integer(q.previous,10)) && typeof q.supported==='boolean'
    && q.done===false && typeof q.subject==='string' && q.subject.length<=8;
}
const reviewRecordValid = (k, v) => !!v && typeof v === 'object' && !Array.isArray(v)
  && (/^r2:(?:[0-9]|1[0-9])$/.test(k) || /^r2chapter:[0-4]$/.test(k))
  && Number.isInteger(v.day) && v.day >= 0 && Number.isSafeInteger(v.at) && v.at >= 0
  && Number.isInteger(v.runs) && v.runs >= 1 && ['lesson', 'check', 'chapter'].includes(v.kind)
  && (k.startsWith('r2chapter:') ? v.kind === 'chapter' : v.kind !== 'chapter')
  && [v.independent, v.revised, v.supported].every(n => Number.isInteger(n) && n >= 0 && n <= 8)
  && v.independent + v.revised + v.supported === ({lesson:8, check:3, chapter:5})[v.kind];

const Store = (() => {
  const KEY = 'kazu-no-bouken.v1';
  const endedDayValid = v => v === null || Number.isSafeInteger(v) && v >= 0;
  const blank = () => ({
    stars: {},        // "gameId:levelIndex" -> 0..3
    plays: {},        // "gameId:levelIndex" -> attempts
    seen:  {},        // gameId -> total questions answered
    firstTry: {},     // gameId -> [correctFirstTry, total] (lifetime)
    /* Per-game aggregates can only ever say "this game is shaky". These two say
       *what* is shaky and *when* — which is what lets the app come back to the
       exact fact the child missed, and lets the parent page name it. */
    /* facts: item key -> [asked, firstTryRight, lastDayNumber, label,
                           "gameId:levelIndex", typicalMs, {missKind: count}]
       The last slot is *what kind* of wrong it was. Right/wrong is one bit and it
       cannot separate a child who read back the part they could see from one who
       was a single count out — see 06-miss.js. */
    facts: {},
    factRecent: {},  // item key -> last 12 first-try outcomes; recovered facts can graduate
    recent: {},       // "gameId:levelIndex" -> last 30 first-try outcomes, "1011…"
    /* One-question visits form a course across visits. Unchecked short answers
       remain observations in recent, but do not become readiness evidence until
       eight practice questions and a later-day check have been completed. */
    shortCourses: {},
    last:  {},        // "gameId:levelIndex" -> day number last played
    swift: {},        // "gameId:levelIndex" -> 1 when cleared without counting
    /* "gameId:levelIndex" -> 1 once the hand has shown this level's method and the
       child has done one alongside it. Until then, opening the level starts with
       those two questions instead of a test. */
    intro: {},
    /* Observed progress only; seeing a method and solving alone stay distinct. */
    milestones: {},  // "game:level:kind" -> {day, label of an actual question}
    /* "gameId:levelIndex" -> [clearDay, lastCheckDay, failedChecks]. A clear below
       ★★★ goes on the shelf provisionally: eight questions at 4 right is a pass that
       random tapping reaches on a three-choice level about one time in four. It is
       confirmed by two of three right on another day (or by clearing it again on
       another day, or by ★★★). The door and おすすめ count confirmed clears. */
    pending: {},
    stickers: [],     // earned sticker keys
    treasures: [],    // world IDs whose chest was opened; separate from stickers
    daily: {},        // "YYYY-MM-DD" -> questions done
    practice: [0, 0],   // [firstTryRight, total] across きょうの れんしゅう
    practiceDays: {}, // "YYYY-MM-DD" -> 1 only after the whole daily set is finished
    diagnostic: null, // { completedDay, outcomes, recommended }
    savedSession: null, // this lap's unfinished visit; completed answers are already recorded
    orientation: false,
    missions: {},     // "YYYY-MM-DD" -> { id, gameId, text, prompt, done, reviewed }
    /* A child can put the stickers they earned somewhere of their own.  This is
       deliberately presentation-only: moving a rabbit around must not be able to
       change a learning record or an unlock.  Coordinates are percentages so the
       picture survives an iPad rotation and a different-sized iPad. */
    stickerWorld: { background: 'meadow', items: {} },
    islandJobs: {}, // boat/snack -> current hands-on work and a lasting completed scene
    transferReached: false,
    transferRecords: {}, // mission index -> last actual run, separate from mastery/stars
    transferSession: null,
    transferStickerRule: 2, // version 1 awarded a sticker for finishing even with no right answers
    secondRoundReached: false, // legacy name: this lap's textbook course opened after the original 131 rewards
    selectedRound: 1, // the last chosen adventure; shared collections retain this context
    roundSchema: 1, // genuine repeat laps; older "second round" records are textbook work in lap 1
    roundTwoReached: false,
    roundTwo: null,
    reviewRecords: {}, // textbook observations, separate from this lap's map stars/facts
    reviewChaptersOpen: {}, // chapter number -> 1; related preparation opens each entrance once
    reviewSession: null, // unfinished textbook run and the exact current question
    // Ending is the child's choice for the whole day, shared across both laps.
    // It changes presentation only; unfinished visits and learning stay intact.
    endedDay: null,
    name: '',
    sfx: true, voice: true, voiceId: null,
    /* The 小1 world opens by itself when every sticker is on the shelf. This flag is
       the parent's override: a child who is ready but cannot get ★★★ on とけい must
       not be held behind a padlock they cannot move — the same reason a level opens
       after three honest attempts. Once true it stays true. */
    g1Open: false,
    /* Set by the app the first time every 入学前 level is cleared. The door is
       worked out from the shelf, and a release that adds a 入学前 level would
       otherwise shut it again on a child who had already gone through. */
    g1Reached: false,
    g1GamesOpen: {}, // game ID -> 1 once that game's preparation route has opened it
    /* Day number of the last export. Six months of records live in one localStorage
       key on a device whose OS is documented to throw them away, and the only
       defence — 書き出す — sat behind an adult gate that nobody had a reason to open.
       Nothing here backs anything up by itself; it just knows when to ask. */
    backupAt: 0,
    /* The April the child starts school. Guessed from the first day of use and
       overridable, because「入学までの半年」is the premise of the whole app and until
       now the app had no idea when that was: the roadmap on the parent page was
       fixed prose that could not say which month this child is actually in. */
    schoolYear: 0,
    createdAt: Date.now()
  });

  /* The original top-level fields remain lap 1 on disk. Only these learning
     fields are routed to the independent second record while playing lap 2.
     Settings and the decorated island belong to the child, across both laps. */
  const LOCAL_FIELDS = new Set([
    'stars', 'plays', 'seen', 'firstTry', 'facts', 'factRecent', 'recent', 'shortCourses', 'last',
    'swift', 'intro', 'milestones', 'pending', 'stickers', 'treasures', 'daily',
    'practice', 'practiceDays', 'diagnostic', 'savedSession', 'missions', 'islandJobs',
    'transferReached', 'transferRecords', 'transferSession', 'transferStickerRule', 'secondRoundReached',
    'reviewRecords', 'reviewChaptersOpen', 'reviewSession', 'g1Open', 'g1Reached', 'g1GamesOpen'
  ]);
  const localFields = data => Object.fromEntries(Array.from(LOCAL_FIELDS, k => [k, data[k]]));
  const blankProgress = () => localFields(blank());

  function shortCourseValid(v){
    const count = n => Number.isSafeInteger(n) && n >= 0;
    const bits = (s, max) => typeof s === 'string' && s.length <= max && /^[01]*$/.test(s);
    if (!v || typeof v !== 'object' || Array.isArray(v)
        || !bits(v.answers, 8) || !bits(v.checks, 3) || !bits(v.evidence, 30)
        || !(v.readyDay === null || count(v.readyDay)) || !(v.checkDay === null || count(v.checkDay))
        || typeof v.confirmed !== 'boolean' || !count(v.at)
        || typeof v.lastId !== 'string' || v.lastId.length > 120
        || !['practice','ready','check','confirmed','retry'].includes(v.lastResult)) return false;
    if (v.items !== undefined && (!Array.isArray(v.items) || v.items.length > 64
        || v.items.some(item => typeof item !== 'string' || item.length > 240))) return false;
    if (v.rewardKeys !== undefined && (!Array.isArray(v.rewardKeys) || v.rewardKeys.length > 2
        || v.rewardKeys.some(k => typeof k !== 'string' || !/^[a-z0-9]+:\d+(?::g)?$/.test(k)))) return false;
    if (v.gold !== undefined){
      const g = v.gold;
      if (!g || typeof g !== 'object' || Array.isArray(g) || typeof g.active !== 'boolean'
          || !bits(g.answers, 8) || !bits(g.checks, 3)
          || !(g.readyDay === null || count(g.readyDay)) || !(g.checkDay === null || count(g.checkDay))
          || !['practice','ready','check','confirmed','retry'].includes(g.lastResult)) return false;
      if (g.readyDay !== null && g.answers !== '11111111') return false;
      if (g.checks.length && (g.readyDay === null || g.checkDay === null || g.checkDay <= g.readyDay)) return false;
      if (!g.checks.length && g.checkDay !== null) return false;
      if (!g.active && (g.lastResult !== 'confirmed' || g.checks !== '111')) return false;
      if (g.lastResult === 'confirmed' && (g.active || g.answers !== '11111111' || g.checks !== '111')) return false;
    }
    if (v.adaptive !== undefined){
      const a = v.adaptive;
      if (!a || typeof a !== 'object' || Array.isArray(a) || !bits(a.recent, 12)
          || !bits(a.sinceRest, 12) || !count(a.lastDay)
          || typeof a.supportDone !== 'boolean'
          || !(a.restUntil === null || count(a.restUntil))
          || typeof a.kinds !== 'string' || !/^[irsv]*$/.test(a.kinds)
          || a.kinds.length !== a.recent.length || !Array.isArray(a.misses)
          || a.misses.length !== a.recent.length
          || a.misses.some(m => typeof m !== 'string' || m.length > 40 || !/^[a-z0-9-]*$/.test(m))
          || !a.recent.endsWith(a.sinceRest)
          || (a.restUntil !== null && a.restUntil > a.lastDay + 3)) return false;
      // The observation's meaning travels with its outcome, including on import.
      if (Array.from(a.recent).some((bit, i) => (bit === '1') !== (a.kinds[i] === 'i')
          || bit === '1' && a.misses[i] !== '')) return false;
    }
    if (v.readyDay !== null && (v.answers.length !== 8 || v.answers.split('1').length - 1 < 6)) return false;
    if (v.checks.length && (v.readyDay === null || v.checkDay === null || v.checkDay <= v.readyDay)) return false;
    if (!v.checks.length && v.checkDay !== null) return false;
    if (!v.lastId && (v.answers.length || v.checks.length || v.readyDay !== null
        || v.confirmed || v.lastResult !== 'practice')) return false;
    if (v.confirmed && (v.checks.length !== 3 || v.checks.split('1').length - 1 < 2)) return false;
    return true;
  }

  function normalizeReviewSession(s){
    const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
    const count=(v,max=10)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
    const text=v=>typeof v==='string'&&v.length<=300;
    const kinds=['group','count','five','zero','horizontal','vertical','train','cardinal','splitSmall','splitLarge','hidden','makeTen','combine','increase','zeroAdd','sumCards','take','subEquation','difference','subStory'];
    const art=v=>['animal','flower','umbrella'].includes(v);
    if(!object(s)||!count(s.at,Number.MAX_SAFE_INTEGER)||!object(s.run)||!object(s.q))return null;
    const r=s.run,q=s.q,total=({lesson:8,check:3,chapter:5})[r.kind];
    if(!total||r.total!==total||!count(r.step,total-1)||!Array.isArray(r.outcomes)
      ||r.outcomes.some(v=>!['independent','revised','supported'].includes(v)))return null;
    const chapter=r.kind==='chapter';
    if(chapter?(!count(r.chapter,4)||r.id!=null||r.key!=='r2chapter:'+r.chapter)
      :(!count(r.id,19)||r.chapter!=null||r.key!=='r2:'+r.id))return null;
    const lessonId=chapter?(r.step<4?r.chapter*4+r.step:r.chapter?r.chapter*4-1:3):r.id;
    const expectedType=lessonId===0?(r.step%2?'match':'group'):lessonId===3?(r.step%2?'sequence':'zeroCount'):kinds[lessonId];
    if(q.lessonId!==lessonId||q.type!==expectedType||!art(q.thing)||![q.a,q.b].every(v=>count(v))
      ||!text(q.prompt)||!['missed','supported','done'].every(k=>typeof q[k]==='boolean')
      ||r.outcomes.length!==r.step+Number(q.done)||!count(q.active,2)||!count(q.left,q.a)
      ||![null,'＋','−'].includes(q.op)||!Array.isArray(q.values)||q.values.length!==3
      ||q.values.some(v=>v!==null&&!count(v))||!Array.isArray(q.selected)||q.selected.length>10
      ||q.selected.some(v=>!count(v,9))||new Set(q.selected).size!==q.selected.length
      ||!Array.isArray(q.pairs)||q.pairs.length>q.a||q.pairs.some(p=>!Array.isArray(p)||p.length!==2||!count(p[0],q.a-1)||!count(p[1],q.b-1))
      ||new Set(q.pairs.map(p=>p[0])).size!==q.pairs.length||new Set(q.pairs.map(p=>p[1])).size!==q.pairs.length)return null;
    if(q.done&&r.outcomes.at(-1)!==(q.supported?'supported':q.missed?'revised':'independent'))return null;
    for(const k of ['message','hintText','result'])if(q[k]!==undefined&&!text(q[k]))return null;
    for(const k of ['reverse','cardinality','showHint'])if(q[k]!==undefined&&typeof q[k]!=='boolean')return null;
    if(q.supportStage!==undefined&&(!count(q.supportStage,3)||(q.supportStage>0&&!q.supported)))return null;
    if(q.wrongAttempts!==undefined&&(!count(q.wrongAttempts,100000)||(q.wrongAttempts>0&&!q.missed)))return null;
    if(q.expectedOp!==undefined&&!['＋','−'].includes(q.expectedOp))return null;
    if(q.n!==undefined&&!count(q.n))return null;
    if(q.done&&!text(q.result)||q.showHint&&!text(q.hintText))return null;
    if(q.value!==undefined&&!count(q.value)||q.target!==undefined&&!count(q.target,q.a-1))return null;
    if(q.type==='group'){
      if(!Array.isArray(q.things)||!q.things.length||q.things.length>10||!q.things.every(art)
        ||!Array.isArray(q.answer)||q.answer.some(v=>!count(v,9))||JSON.stringify(q.answer)!==JSON.stringify(q.things.map((v,i)=>v===q.thing?i:-1).filter(i=>i>=0)))return null;
    }else if(q.type==='sumCards'){
      if(!Array.isArray(q.cards)||q.cards.length!==4||q.cards.some(c=>!object(c)||!count(c.a)||!count(c.b))
        ||!Array.isArray(q.answer)||q.answer.length!==2||q.answer.some(v=>!count(v,3))||JSON.stringify(q.answer)!==JSON.stringify(q.cards.map((c,i)=>c.a+c.b===q.a?i:-1).filter(i=>i>=0)))return null;
    }else if(!count(q.answer))return null;
    if(['horizontal','vertical','train','cardinal'].includes(q.type)
      &&(!count(q.n,q.a)||q.n<1||typeof q.reverse!=='boolean'||typeof q.cardinality!=='boolean'))return null;
    if(q.type==='subStory'&&(!Array.isArray(q.stories)||q.stories.length!==4||q.stories.some(v=>!object(v)||!text(v.text)||typeof v.correct!=='boolean')
      ||q.stories.filter(v=>v.correct).length!==1||!q.stories[q.answer]||!q.stories[q.answer].correct))return null;
    if(['combine','increase','zeroAdd','subEquation'].includes(q.type)&&!['＋','−'].includes(q.expectedOp))return null;
    const savedQ={};
    for(const k of ['type','thing','a','b','answer','prompt','lessonId','missed','supported','done','selected','pairs','active','values','op','left','n','reverse','cardinality','expectedOp','value','target','message','hintText','showHint','result','supportStage','wrongAttempts']){
      if(q[k]!==undefined)savedQ[k]=q[k];
    }
    if(q.type==='group')savedQ.things=q.things;
    if(q.type==='sumCards')savedQ.cards=q.cards.map(c=>({a:c.a,b:c.b}));
    if(q.type==='subStory')savedQ.stories=q.stories.map(v=>({text:v.text,correct:v.correct}));
    return JSON.parse(JSON.stringify({at:s.at,run:{id:r.id??null,chapter:r.chapter??null,kind:r.kind,step:r.step,total:r.total,outcomes:r.outcomes,key:r.key},q:savedQ}));
  }

  /* A resumable visit contains only data, never game functions, timers or DOM.
     Games register after Store starts, so the runner checks that these IDs still
     exist before restoring a visit. Keep this shape check independent of them. */
  function normalizeSavedSession(s){
    const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const count = (v, max = 100000) => Number.isSafeInteger(v) && v >= 0 && v <= max;
    const text = (v, max = 240) => typeof v === 'string' && v.length <= max;
    const gameId = v => typeof v === 'string' && /^[a-z0-9]{1,40}$/.test(v);
    const levelIndex = v => count(v, 1000);
    const target = v => object(v) && gameId(v.gameId) && levelIndex(v.levelIndex);
    const strings = (v, max = 512) => Array.isArray(v) && v.length <= max && v.every(x => text(x));
    const safe = k => !['__proto__', 'prototype', 'constructor'].includes(k);
    if (!object(s) || s.v !== 1 || !text(s.id, 100) || !s.id || !count(s.at, Number.MAX_SAFE_INTEGER)
        || !['level', 'daily', 'focus', 'adventure', 'first', 'diagnostic'].includes(s.mode)
        || !text(s.title) || !(s.gameId === null || gameId(s.gameId)) || !levelIndex(s.levelIndex)
        || !Array.isArray(s.plan) || !s.plan.length || s.plan.length > 128
        || !count(s.index, s.plan.length)) return null;
    for (const p of s.plan){
      if (!target(p) || (p.intro !== undefined && !['show', 'together'].includes(p.intro))
          || (p.check !== undefined && (!text(p.check) || !safe(p.check)))
          || (p.want !== undefined && p.want !== null && !text(p.want))
          || (p.seed !== undefined && !count(p.seed, 0xffffffff))) return null;
    }
    if (![s.firstTryRight, s.swiftCount].every(n => count(n, s.index))
        || s.swiftCount > s.firstTryRight || !count(s.mistakes)
        || !Array.isArray(s.results) || s.results.length !== s.index
        || s.results.some(x => !['introdone', 'done', 'miss'].includes(x))
        || !Array.isArray(s.sessionOutcomes) || s.sessionOutcomes.length > s.index
        || s.sessionOutcomes.some(x => !target(x) || typeof x.clean !== 'boolean')
        || !Array.isArray(s.shaky) || s.shaky.length > 128
        || s.shaky.some(x => !object(x) || !text(x.key) || !text(x.label))
        || !strings(s.focusKeys, 32) || !strings(s.usedItems) || !strings(s.announced, 128)
        || !object(s.checkTally) || Object.keys(s.checkTally).length > 128) return null;
    for (const [k, v] of Object.entries(s.checkTally)){
      if (!safe(k) || !text(k) || !object(v) || !count(v.n, s.plan.length) || !count(v.right, v.n)) return null;
    }
    if (!(s.rewardKey === null || text(s.rewardKey))
        || !(s.adventureTarget === null || (target(s.adventureTarget)
          && (s.adventureTarget.want === null || text(s.adventureTarget.want))))
        || !(s.firstTarget === null || target(s.firstTarget))
        || ![null, 'show', 'together', 'independent', 'check'].includes(s.firstPhase)
        || !(s.visitMilestone === null || (target(s.visitMilestone)
          && ['viewed', 'together', 'supported', 'revised', 'independent'].includes(s.visitMilestone.kind)
          && text(s.visitMilestone.label)))) return null;
    if (s.question !== null){
      const q = s.question;
      if (!object(q) || !count(q.wrongThisQ) || typeof q.helped !== 'boolean'
          || typeof q.taughtQ !== 'boolean' || !(q.missType === null || text(q.missType, 40))) return null;
    }
    /* Select known fields so neither prototypes nor accidental runtime state can
       enter the portable record. JSON cloning also severs every caller reference. */
    const out = {};
    for (const k of ['v', 'id', 'at', 'mode', 'title', 'gameId', 'levelIndex', 'index', 'firstTryRight',
      'mistakes', 'swiftCount', 'results', 'sessionOutcomes', 'shaky', 'focusKeys', 'usedItems',
      'announced', 'checkTally', 'rewardKey', 'adventureTarget', 'firstTarget', 'firstPhase',
      'visitMilestone', 'question']) out[k] = s[k];
    out.plan = s.plan.map(p => {
      const step = { gameId: p.gameId, levelIndex: p.levelIndex };
      for (const k of ['intro', 'check', 'want', 'seed']) if (p[k] !== undefined) step[k] = p[k];
      return step;
    });
    out.sessionOutcomes = s.sessionOutcomes.map(x => ({gameId:x.gameId, levelIndex:x.levelIndex, clean:x.clean}));
    out.shaky = s.shaky.map(x => ({key:x.key, label:x.label}));
    out.checkTally = Object.fromEntries(Object.entries(s.checkTally).map(([k, x]) => [k, {n:x.n, right:x.right}]));
    out.adventureTarget = s.adventureTarget === null ? null : {
      gameId:s.adventureTarget.gameId, levelIndex:s.adventureTarget.levelIndex, want:s.adventureTarget.want
    };
    out.firstTarget = s.firstTarget === null ? null : {gameId:s.firstTarget.gameId, levelIndex:s.firstTarget.levelIndex};
    out.visitMilestone = s.visitMilestone === null ? null : {
      gameId:s.visitMilestone.gameId, levelIndex:s.visitMilestone.levelIndex,
      kind:s.visitMilestone.kind, label:s.visitMilestone.label
    };
    out.question = s.question === null ? null : {
      wrongThisQ:s.question.wrongThisQ, helped:s.question.helped,
      taughtQ:s.question.taughtQ, missType:s.question.missType
    };
    try{ return JSON.parse(JSON.stringify(out)); }catch(e){ return null; }
  }

  /* Three different failures, kept apart because each needs a different sentence
     on the parent page:
       avail      — can this page use localStorage at all (blocked site data,
                    some file:// origins). Nothing is written.
       ok         — did the last write land. A full disk is not permanent, so the
                    next save tries again instead of giving up for good.
       unreadable — there was a record and it would not parse. It used to switch
                    saving off for ever on that device, and「消す」and「読み込む」
                    reported success while writing nothing. Now the bytes are set
                    aside under their own key and a fresh record starts. */
  let record = blank(), avail = true, ok = true, unreadable = false;
  const round = () => record.selectedRound === 2 && record.roundTwoReached && record.roundTwo ? 2 : 1;
  const active = () => round() === 2 ? record.roundTwo : record;
  /* A stable facade also survives import/reset replacing the persisted root.
     Never serialize this facade: doing so while lap 2 is selected would put its
     stars in lap 1's top-level slots. Persistence always uses `record` itself. */
  const mem = new Proxy({}, {
    get(target, k){ return LOCAL_FIELDS.has(k) ? active()[k] : record[k]; },
    set(target, k, value){ (LOCAL_FIELDS.has(k) ? active() : record)[k] = value; return true; },
    ownKeys(){ return Reflect.ownKeys(record); },
    getOwnPropertyDescriptor(target, k){
      return Object.hasOwn(record, k) ? { enumerable: true, configurable: true,
        writable: true, value: LOCAL_FIELDS.has(k) ? active()[k] : record[k] } : undefined;
    }
  });
  const ASIDE = KEY + '.unreadable';
  let startupRaw = null;

  try{
    const raw = localStorage.getItem(KEY);
    if (raw){
      let parsed = null;
      try{ parsed = JSON.parse(raw); }catch(e){}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
        record = Object.assign(blank(), parsed);
        startupRaw = raw;
        if (parsed.transferStickerRule === undefined) record.transferStickerRule = 0;
        /* It parsed, but a field can still have the wrong shape — `stickers` that is
           not a list stopped Home from drawing at all, so the app never opened and
           the record could not even be written out. A field like that goes back to
           empty, and the whole record as it was is kept aside first. (The full
           check in normalizeData needs 06-miss.js, which has not loaded yet here.) */
        const fresh = blank();
        const shape = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
        let bent = false;
        for (const k of Object.keys(fresh)){
          const want = shape(fresh[k]), got = shape(record[k]);
          if (want === got) continue;
          if ((['diagnostic', 'savedSession', 'reviewSession', 'transferSession'].includes(k) && got === 'object') || (k === 'voiceId' && got === 'string')
              || (k === 'roundTwo' && got === 'object') || (k === 'endedDay' && got === 'number')) continue;
          record[k] = fresh[k];
          bent = true;
        }
        if (!endedDayValid(record.endedDay)){ record.endedDay = null; bent = true; }
        if (parsed.roundSchema !== 1){
          // A legacy selectedRound=2 meant the textbook, not a fresh repeat lap.
          record.roundSchema = 1; record.selectedRound = 1;
          record.roundTwoReached = false; record.roundTwo = null;
          if (parsed.roundSchema !== undefined) bent = true;
        }
        if (![1, 2].includes(record.selectedRound)){
          record.selectedRound = 1; bent = true;
        }
        if (parsed.roundTwo != null && (typeof parsed.roundTwo !== 'object' || Array.isArray(parsed.roundTwo)))
          record.selectedRound = 1;
        if (!record.roundTwoReached) record.selectedRound = 1;
        for (const [k, v] of Object.entries(record.reviewRecords)){
          if (!reviewRecordValid(k, v)){ delete record.reviewRecords[k]; bent = true; }
        }
        if (record.transferSession !== null && !transferSessionValid(record.transferSession)){
          record.transferSession=null; bent=true;
        }
        if (record.savedSession !== null){
          const visit = normalizeSavedSession(record.savedSession);
          if (!visit) bent = true;
          record.savedSession = visit;
        }
        for(const [k,v] of Object.entries(record.reviewChaptersOpen)){
          if(!/^[0-4]$/.test(k)||v!==1){delete record.reviewChaptersOpen[k];bent=true;}
        }
        for (const [k, v] of Object.entries(record.shortCourses)){
          if (!/^[a-z0-9]+:\d+$/.test(k) || !shortCourseValid(v)){
            delete record.shortCourses[k]; bent = true;
          }
        }
        if(record.reviewSession!==null){
          const visit=normalizeReviewSession(record.reviewSession);
          if(!visit)bent=true;
          record.reviewSession=visit;
        }
        if (bent){ try{ localStorage.setItem(ASIDE, raw); }catch(e){} }
      } else {
        unreadable = true;
        // if the copy cannot be made, the original is the only one: leave it be
        try{ localStorage.setItem(ASIDE, raw); }catch(e){ avail = false; }
      }
    }
  }catch(e){ avail = false; }

  let pending = null;
  function writeNow(){
    if (!avail) return;
    clearTimeout(pending); pending = null;
    try{ localStorage.setItem(KEY, JSON.stringify(record)); ok = true; }
    catch(e){ ok = false; }          // quota or private mode: the next save tries again
  }
  function save(){
    if (!avail) return;
    clearTimeout(pending);
    pending = setTimeout(writeNow, 120);
  }
  // the app is usually closed straight after finishing a level; don't lose that write
  addEventListener('pagehide', writeNow);
  addEventListener('visibilitychange', () => { if (document.hidden) writeNow(); });

  const key = (g, l) => g + ':' + l;
  const MILESTONE_TEXT = {
    viewed: 'やりかたを みたね',
    together: 'いっしょに こたえたね',
    supported: 'ヒントを つかって こたえたね',
    revised: 'もういちど ためして こたえたね',
    independent: 'ひとりで こたえたね'
  };
  const MILESTONE_RANK = { viewed: 0, together: 1, supported: 2, revised: 3, independent: 4 };
  /* Whole-day resolution keeps six months of daily use small enough for
     localStorage, and days are the only unit the scheduling actually needs. */
  const DAY = 86400000;
  /* The local calendar day, not the UTC one. Counted in UTC, a day in Japan ended at
     9 in the morning: a backup written at 8:30 was「1日前」by 9:30, and every
     「何日ふれていない」and the pace to 入学 were a day out for half of each morning. */
  const dayOf = ms => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / DAY);
  const dayNo = () => dayOf(Date.now());
  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ---- backup ----------------------------------------------------------
     localStorage is scoped to one origin and one browser, so the same app on a
     different URL (or after clearing site data) starts empty. Export/import is
     the only thing that makes six months of records actually portable. */
  const FILE_TAG = 'kazu-no-bouken';

  function exportText(){
    return JSON.stringify({ app: FILE_TAG, v: 1, savedAt: new Date().toISOString(), data: record }, null, 2);
  }

  const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isCount = v => Number.isFinite(v) && v >= 0;
  const safeKey = k => k !== '__proto__' && k !== 'prototype' && k !== 'constructor';
  /** {missKind: count} — a small tally, and every key has to be one we know */
  const isMissMap = (v, startup) => isRecord(v) && Object.keys(v).every(
    k => safeKey(k) && (startup || MISS_KINDS[k]) && isCount(v[k]));

  /** Validate into a fresh object before touching the live record. Older backups
      may omit newer fields, but a field that is present must have the shape the
      rest of Store expects. */
  function normalizeData(data, localOnly = false, startup = false){
    if (!isRecord(data)) return null;
    if (localOnly && Object.keys(data).some(k => !LOCAL_FIELDS.has(k))) return null;
    const out = blank();
    const copyMap = (name, valid) => {
      if (data[name] == null) return data[name] === undefined;
      if (!isRecord(data[name])) return false;
      const next = {};
      for (const k of Object.keys(data[name])){
        if (!safeKey(k) || !valid(data[name][k])) return false;
        next[k] = data[name][k];
      }
      out[name] = next;
      return true;
    };

    if (!copyMap('stars', v => isCount(v) && v <= 3)
     || !copyMap('plays', isCount)
     || !copyMap('seen', isCount)
     || !copyMap('daily', isCount)
     || !copyMap('last', isCount)
     || !copyMap('swift', v => v === 0 || v === 1)
     || !copyMap('intro', v => v === 1)
     || !copyMap('g1GamesOpen', v => v === 1)
     || !copyMap('practiceDays', v => v === 1)
     || !copyMap('reviewRecords', isRecord)
     || !copyMap('reviewChaptersOpen', v => v === 1)
     || !copyMap('transferRecords', v => isRecord(v) && Number.isInteger(v.day) && v.day >= 0
          && Number.isInteger(v.independent) && v.independent >= 0 && v.independent <= 5
          && Number.isInteger(v.supported) && v.supported >= 0 && v.supported <= 5
          && Number.isInteger(v.revised) && v.revised >= 0 && v.revised <= 5
          && [3, 5].includes(v.independent + v.supported + v.revised))
     || !copyMap('milestones', v => isRecord(v) && isCount(v.day)
          && typeof v.label === 'string' && v.label.length <= 80)
     || !copyMap('pending', v => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(isCount))
     || !copyMap('recent', v => typeof v === 'string' && /^[01]{0,30}$/.test(v))
     || !copyMap('shortCourses', shortCourseValid)
     || !copyMap('factRecent', v => typeof v === 'string' && /^[01]{0,12}$/.test(v))
     || !copyMap('firstTry', v => Array.isArray(v) && v.length >= 2
          && isCount(v[0]) && isCount(v[1]) && v[0] <= v[1])
     || !copyMap('facts', v => Array.isArray(v) && v.length >= 3
          && isCount(v[0]) && isCount(v[1]) && v[1] <= v[0] && isCount(v[2])
          && (v[3] == null || typeof v[3] === 'string')
          && (v[4] == null || typeof v[4] === 'string')
          && (v[5] == null || isCount(v[5]))
          && (v[6] == null || isMissMap(v[6], startup)))) return null;
    for (const k of Object.keys(out.milestones))
      if (!/^[a-z0-9]+:\d+:(viewed|together|supported|revised|independent)$/.test(k)) return null;
    if (Object.keys(out.shortCourses).some(k => !/^[a-z0-9]+:\d+$/.test(k))) return null;
    if (Object.keys(out.transferRecords).some(k => !/^[0-5]$/.test(k))) return null;
    if (Object.entries(out.reviewRecords).some(([k, v]) => !reviewRecordValid(k, v))) return null;
    if (Object.keys(out.reviewChaptersOpen).some(k => !/^[0-4]$/.test(k))) return null;
    if (Object.keys(out.g1GamesOpen).some(k => !/^[a-z0-9]+$/.test(k))) return null;
    if (Object.keys(out.practiceDays).some(k => !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(k))) return null;

    if (data.stickers !== undefined){
      if (!Array.isArray(data.stickers) || data.stickers.some(v => typeof v !== 'string')) return null;
      out.stickers = Array.from(new Set(data.stickers));
    }
    if (data.treasures !== undefined){
      if (!Array.isArray(data.treasures) || data.treasures.some(id => !TREASURE_WORLDS.includes(id))) return null;
      out.treasures = Array.from(new Set(data.treasures));
    }
    if (data.practice !== undefined){
      if (!Array.isArray(data.practice) || data.practice.length < 2
       || !isCount(data.practice[0]) || !isCount(data.practice[1])
       || data.practice[0] > data.practice[1]) return null;
      out.practice = data.practice.slice(0, 2);
    }
    if (data.diagnostic !== undefined && data.diagnostic !== null){
      const d = data.diagnostic;
      if (!isRecord(d) || !isCount(d.completedDay)
       || !Array.isArray(d.outcomes)
       || d.outcomes.some(x => !isRecord(x) || typeof x.gameId !== 'string'
          || !isCount(x.levelIndex) || typeof x.clean !== 'boolean')
       || (d.recommended != null && (!isRecord(d.recommended)
          || typeof d.recommended.gameId !== 'string'
          || !isCount(d.recommended.levelIndex)))) return null;
      out.diagnostic = {
        completedDay: d.completedDay,
        outcomes: d.outcomes.map(x => ({
          gameId: x.gameId, levelIndex: x.levelIndex, clean: x.clean
        })),
        recommended: d.recommended == null ? null : {
          gameId: d.recommended.gameId, levelIndex: d.recommended.levelIndex
        }
      };
    }
    if (data.transferSession !== undefined && data.transferSession !== null){
      if (!transferSessionValid(data.transferSession)){if (!startup) return null;}
      else out.transferSession=JSON.parse(JSON.stringify(data.transferSession));
    }
    if (data.savedSession !== undefined && data.savedSession !== null){
      const visit = normalizeSavedSession(data.savedSession);
      // A damaged interrupted visit must never discard a lap's lasting history.
      if (!visit && !startup) return null;
      out.savedSession = visit;
    }
    if(data.reviewSession!==undefined&&data.reviewSession!==null){
      const visit=normalizeReviewSession(data.reviewSession);
      if(!visit&&!startup)return null;
      out.reviewSession=visit;
    }
    if (data.missions !== undefined){
      if (!isRecord(data.missions)) return null;
      out.missions = {};
      for (const day of Object.keys(data.missions)){
        const m = data.missions[day];
        if (!safeKey(day) || !isRecord(m)
         || typeof m.day !== 'string' || typeof m.id !== 'string'
         || typeof m.gameId !== 'string' || typeof m.text !== 'string'
         || typeof m.prompt !== 'string'
         || (m.done !== undefined && typeof m.done !== 'boolean')
         || (m.reviewed !== undefined && typeof m.reviewed !== 'boolean')
         || (m.doneDay !== undefined && !isCount(m.doneDay))) return null;
        out.missions[day] = {
          day: m.day, id: m.id, gameId: m.gameId, text: m.text, prompt: m.prompt,
          done: !!m.done, reviewed: !!m.reviewed
        };
        if (m.doneDay !== undefined) out.missions[day].doneDay = m.doneDay;
      }
    }
    if (data.stickerWorld !== undefined){
      const w = data.stickerWorld;
      if (!isRecord(w) || typeof w.background !== 'string' || !isRecord(w.items)) return null;
      const items = {};
      for (const k of Object.keys(w.items)){
        const p = w.items[k];
        if (!safeKey(k) || !isRecord(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)
         || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
        items[k] = { x: p.x, y: p.y };
      }
      out.stickerWorld = { background: w.background.slice(0, 24), items };
    }
    if (data.islandJobs !== undefined){
      if (!isRecord(data.islandJobs)) return null;
      out.islandJobs = {};
      for (const scene of Object.keys(data.islandJobs)){
        const j = data.islandJobs[scene];
        if (!['boat', 'snack'].includes(scene) || !isRecord(j)
          || ![5, 10].includes(j.size) || !Number.isInteger(j.start) || j.start < 1 || j.start >= j.size
          || !Number.isInteger(j.placed) || j.placed < 0 || j.placed > j.size - j.start
          || typeof j.done !== 'boolean' || typeof j.completed !== 'boolean'
          || (j.done && (j.placed !== j.size - j.start || !j.completed))) return null;
        out.islandJobs[scene] = { size: j.size, start: j.start, placed: j.placed,
          done: j.done, completed: j.completed };
      }
    }
    if (data.name !== undefined){
      if (typeof data.name !== 'string') return null;
      out.name = data.name.slice(0, 12);
    }
    for (const k of ['sfx', 'voice', 'orientation', 'g1Open', 'g1Reached', 'transferReached', 'secondRoundReached']){
      if (data[k] !== undefined){
        if (typeof data[k] !== 'boolean') return null;
        out[k] = data[k];
      }
    }
    if (data.selectedRound !== undefined){
      if (![1, 2].includes(data.selectedRound)) return null;
      out.selectedRound = data.selectedRound;
    }
    if (!localOnly){
      if (data.roundSchema !== undefined && data.roundSchema !== 1) return null;
      if (data.roundTwoReached !== undefined && typeof data.roundTwoReached !== 'boolean') return null;
      let second = null;
      if (data.roundTwo !== undefined && data.roundTwo !== null){
        second = normalizeData(data.roundTwo, true, startup);
        if (!second) return null;
      }
      if (data.roundSchema === 1){
        out.roundTwoReached = data.roundTwoReached === true;
        out.roundTwo = second;
        if (out.selectedRound === 2){
          if (!out.roundTwoReached) out.selectedRound = 1;
          else if (!out.roundTwo) out.roundTwo = blankProgress();
        }
      } else {
        out.selectedRound = 1;
      }
    }
    if (data.endedDay !== undefined){
      if (!endedDayValid(data.endedDay)) return null;
      out.endedDay = data.endedDay;
    }
    if (data.voiceId !== undefined){
      if (data.voiceId !== null && typeof data.voiceId !== 'string') return null;
      out.voiceId = data.voiceId;
    }
    for (const k of ['backupAt', 'schoolYear', 'createdAt']){
      if (data[k] !== undefined){
        if (!isCount(data[k])) return null;
        out[k] = data[k];
      }
    }
    if (data.transferStickerRule !== undefined && ![0, 2].includes(data.transferStickerRule)) return null;
    if (data.transferStickerRule === undefined) out.transferStickerRule = 0;
    upgradeTransferStickers(out);
    return localOnly ? localFields(out) : out;
  }

  /** A legacy medal only has evidence of three questions. Keep it when all three
      were independent first tries; re-earn the others under the new 4/5 rule.
      This also runs on imported backups so an old file cannot restore a medal
      that was earned only by finishing. Ordinary stickers and records are intact. */
  function upgradeTransferStickers(data){
    if (data.transferStickerRule === 2) return false;
    const retain = k => {
      const m = /^transfer:([0-5])$/.exec(k);
      return !m || !!(data.transferRecords && data.transferRecords[m[1]]
        && data.transferRecords[m[1]].independent === 3);
    };
    if (Array.isArray(data.stickers)) data.stickers = data.stickers.filter(retain);
    const items = data.stickerWorld && data.stickerWorld.items;
    if (items && typeof items === 'object'){
      Object.keys(items).forEach(k => { if (!retain(k)) delete items[k]; });
    }
    data.transferStickerRule = 2;
    return true;
  }
  /* Startup must tolerate a damaged second-lap record without discarding the
     original top-level history. MISS_KINDS loads later, so only its key lookup
     is deferred here; miss tallies still require safe keys and numeric counts. */
  if (record.roundTwo){
    const normalized = normalizeData(record.roundTwo, true, true);
    if (normalized) record.roundTwo = normalized;
    else {
      record.roundTwo = null; record.selectedRound = 1;
      if (startupRaw){ try{ localStorage.setItem(ASIDE, startupRaw); }catch(e){} }
      save();
    }
  }
  if (record.selectedRound === 2 && record.roundTwoReached && !record.roundTwo)
    record.roundTwo = blankProgress();
  if (upgradeTransferStickers(record)) save();

  const maxNum = (a, b) => Math.max(a || 0, b || 0);
  function mergeState(base, add){
    const out = Object.assign(blank(), base);
    // A historical backup must not make this device end (or reopen) its day.
    // Replacement deliberately restores that saved presentation state instead.
    out.endedDay = base.endedDay == null ? null : base.endedDay;
    /* Merging a historical backup must not resurrect a visit finished since it
       was exported. Only replacement restores the backup's interrupted visit. */
    out.savedSession = normalizeSavedSession(base.savedSession);
    out.transferSession = transferSessionValid(base.transferSession) ? JSON.parse(JSON.stringify(base.transferSession)) : null;
    out.reviewSession = normalizeReviewSession(base.reviewSession);
    // A course is one coherent snapshot, never a sum of two copies of a backup.
    out.shortCourses = {};
    for (const k of new Set(Object.keys(base.shortCourses || {}).concat(Object.keys(add.shortCourses || {})))){
      const mine = base.shortCourses && base.shortCourses[k], theirs = add.shortCourses && add.shortCourses[k];
      const latest = !mine || theirs && theirs.at > mine.at ? theirs : mine;
      out.shortCourses[k] = JSON.parse(JSON.stringify(latest));
    }
    ['stars', 'plays', 'seen', 'daily', 'swift', 'intro', 'g1GamesOpen', 'reviewChaptersOpen', 'practiceDays'].forEach(k => {
      const src = add[k] || {};
      out[k] = Object.assign({}, base[k] || {});
      // max, never sum: importing the same backup twice must not inflate anything
      for (const id in src) out[k][id] = maxNum(out[k][id], src[id]);
    });
    out.milestones = Object.assign({}, add.milestones || {}, base.milestones || {});
    for (const k of Object.keys(add.milestones || {})){
      const a = add.milestones[k], b = base.milestones && base.milestones[k];
      if (!b || a.day < b.day) out.milestones[k] = Object.assign({}, a);
    }
    out.firstTry = Object.assign({}, base.firstTry || {});
    const af = add.firstTry || {};
    for (const g in af){
      const cur = out.firstTry[g];
      if (!cur || (af[g][1] || 0) > (cur[1] || 0)) out.firstTry[g] = af[g].slice();
    }
    // facts: keep the record that has been practised more; never sum
    out.facts = Object.assign({}, base.facts || {});
    out.factRecent = Object.assign({}, base.factRecent || {});
    const af2 = add.facts || {};
    for (const k in af2){
      const cur = out.facts[k];
      const mine = (base.facts && base.facts[k] && base.facts[k][6]) || null;
      const theirs = af2[k][6] || null;
      const incomingWindow = add.factRecent && add.factRecent[k];
      // The previous importer could lose just the window. A backup of the same
      // observation can repair it without replacing a newer or different record.
      const restoresWindow = cur && out.factRecent[k] === undefined && incomingWindow !== undefined
        && af2[k][0] === cur[0] && af2[k][1] === cur[1] && af2[k][2] === cur[2];
      if (!cur || (af2[k][0] || 0) > (cur[0] || 0) || restoresWindow){
        out.facts[k] = af2[k].slice();
        // The recent window belongs to this actual record, not the other device's.
        // An older-format backup may have no window; do not attach a stale one.
        delete out.factRecent[k];
        if (incomingWindow !== undefined) out.factRecent[k] = incomingWindow;
      }
      else if (cur){
        cur[2] = maxNum(cur[2], af2[k][2]);
        if (!cur[4] && af2[k][4]) cur[4] = af2[k][4];   // keep whichever side knows where to ask it
      }
      // miss tallies: max per kind, never sum — the same rule the rest of the
      // merge follows, so importing one backup twice cannot invent mistakes
      if (mine || theirs){
        const m = {};
        if (mine) for (const t in mine) m[t] = mine[t];
        if (theirs) for (const t in theirs) m[t] = maxNum(m[t], theirs[t]);
        out.facts[k] = out.facts[k].slice();
        out.facts[k][6] = m;
      }
    }
    /* recent / last: follow whichever side actually played that level more, and on
       a tie the side that met it last. `plays` only counts whole levels, so a level
       met only inside きょうの れんしゅう or とっくん is 0 on both sides — and a strict
       「more」 dropped its record even when this device had none at all. */
    out.recent = Object.assign({}, base.recent || {});
    const recentSource = Object.fromEntries(Object.keys(base.recent || {}).map(k => [k, base]));
    out.last   = Object.assign({}, base.last || {});
    for (const k in (add.recent || {})){
      const ap = (add.plays && add.plays[k]) || 0, bp = (base.plays && base.plays[k]) || 0;
      const newer = ((add.last && add.last[k]) || 0) > ((base.last && base.last[k]) || 0);
      if (!(k in out.recent) || ap > bp || (ap === bp && newer)){
        out.recent[k] = add.recent[k]; recentSource[k] = add;
      }
    }
    for (const [k, course] of Object.entries(out.shortCourses)){
      // Follow the same actual observations as recent. A normal-only record has
      // no short-course wrapper: all of its recent answers are valid evidence.
      // Never promote recent from a record that contains unchecked short work.
      const source = recentSource[k];
      let evidence = source ? source.shortCourses && source.shortCourses[k]
        ? source.shortCourses[k].evidence : source.recent[k] || '' : course.evidence;
      for (const candidate of [base, add]){
        const short = candidate.shortCourses && candidate.shortCourses[k];
        const ordinary = short ? short.evidence : candidate.recent && candidate.recent[k] || '';
        // More unchecked short visits can win recent's source selection while
        // containing fewer eligible observations. Keep the fuller actual window;
        // ties follow recent's selected source and no windows are ever summed.
        if (ordinary.length > evidence.length) evidence = ordinary;
      }
      if (course.evidence !== evidence){
        course.evidence = evidence;
        course.at = Math.max(Date.now(), course.at + 1);
      }
    }
    for (const k in (add.last || {})) out.last[k] = maxNum(out.last[k], add.last[k]);
    out.stickers = Array.from(new Set((base.stickers || []).concat(add.stickers || [])));
    out.treasures = Array.from(new Set((base.treasures || []).concat(add.treasures || [])));
    const bp = base.practice || [0, 0], ap = add.practice || [0, 0];
    out.practice = (ap[1] || 0) > (bp[1] || 0) ? ap.slice() : bp.slice();
    out.orientation = !!(base.orientation || add.orientation);
    const bd = base.diagnostic, ad = add.diagnostic;
    out.diagnostic = !bd ? ad : !ad ? bd
      : ((ad.completedDay || 0) > (bd.completedDay || 0) ? ad : bd);
    out.missions = Object.assign({}, base.missions || {});
    for (const d in (add.missions || {})){
      const cur = out.missions[d], incoming = add.missions[d];
      if (!cur) out.missions[d] = Object.assign({}, incoming);
      else if (cur.id === incoming.id) out.missions[d] = Object.assign({}, cur, incoming, {
        done: !!(cur.done || incoming.done),
        reviewed: !!(cur.reviewed || incoming.reviewed)
      });
      else {
        // A catalog update can assign a different mission to the same date.
        // Keep one actual record intact; never transfer completion to other text.
        const score = m => (m.reviewed ? 4 : 0) + (m.done ? 2 : 0) + (m.doneDay || 0) / 1e9;
        out.missions[d] = Object.assign({}, score(incoming) > score(cur) ? incoming : cur);
      }
    }
    /* provisional clears: confirmed on either device (on that shelf, not waiting)
       stays confirmed; otherwise keep the earliest clear and the latest check */
    out.pending = {};
    const bpend = base.pending || {}, apend = add.pending || {};
    const shelved = (rec, k) => (rec.stickers || []).indexOf(k) >= 0;
    new Set(Object.keys(bpend).concat(Object.keys(apend))).forEach(k => {
      if ((shelved(base, k) && !bpend[k]) || (shelved(add, k) && !apend[k])) return;
      const x = bpend[k], y = apend[k];
      if (!x || !y){ out.pending[k] = (x || y).slice(0, 3); return; }
      out.pending[k] = [Math.min(x[0], y[0]), Math.max(x[1], y[1]), Math.max(x[2], y[2])];
    });
    // a stage that has been opened on either device stays open
    out.g1Open = !!(base.g1Open || add.g1Open);
    out.g1Reached = !!(base.g1Reached || add.g1Reached);
    out.transferReached = !!(base.transferReached || add.transferReached);
    out.secondRoundReached = !!(base.secondRoundReached || add.secondRoundReached);
    out.reviewRecords = Object.assign({}, base.reviewRecords || {});
    for (const [k, incoming] of Object.entries(add.reviewRecords || {})){
      const current = out.reviewRecords[k];
      out.reviewRecords[k] = Object.assign({}, !current || incoming.at > current.at ? incoming : current,
        { runs: Math.max(current ? current.runs : 0, incoming.runs) });
    }
    out.transferStickerRule = 2;
    out.transferRecords = Object.assign({}, base.transferRecords || {});
    for (const k of Object.keys(add.transferRecords || {})){
      const incoming = add.transferRecords[k], current = out.transferRecords[k];
      if (!current || incoming.day > current.day) out.transferRecords[k] = Object.assign({}, incoming);
    }
    out.backupAt = maxNum(base.backupAt, add.backupAt);
    out.schoolYear = base.schoolYear || add.schoolYear || 0;
    out.name = base.name || add.name || '';
    /* A layout is personal rather than cumulative.  Keep every sticker placement
       from either copy; when the same sticker was moved on both devices, preserve
       this device's current position rather than silently jumping it elsewhere. */
    const bw = base.stickerWorld || { background: 'meadow', items: {} };
    const aw = add.stickerWorld || { background: 'meadow', items: {} };
    out.stickerWorld = {
      background: bw.background || aw.background || 'meadow',
      items: Object.assign({}, aw.items || {}, bw.items || {})
    };
    out.islandJobs = Object.assign({}, add.islandJobs || {}, base.islandJobs || {});
    for (const scene of ['boat', 'snack']){
      const a = add.islandJobs && add.islandJobs[scene], b = base.islandJobs && base.islandJobs[scene];
      if (a || b) out.islandJobs[scene] = Object.assign({}, b || a, {
        completed: !!((a && a.completed) || (b && b.completed))
      });
    }
    out.createdAt = Math.min(base.createdAt || Date.now(), add.createdAt || Date.now());
    return out;
  }

  function mergeInto(base, add){
    const out = mergeState(base, add);
    out.roundSchema = 1;
    out.roundTwoReached = !!(base.roundTwoReached || add.roundTwoReached);
    // Never merge first-lap mastery into the repeat. A legacy backup has no
    // second record and can only contribute to the original top-level history.
    if (base.roundTwo && add.roundTwo)
      out.roundTwo = localFields(mergeState(base.roundTwo, add.roundTwo));
    else out.roundTwo = base.roundTwo || (add.roundTwo
      ? Object.assign({}, add.roundTwo, {savedSession:null,reviewSession:null,transferSession:null}) : null);
    out.selectedRound = base.selectedRound === 2 && out.roundTwoReached ? 2 : 1;
    if (out.selectedRound === 2 && !out.roundTwo) out.roundTwo = blankProgress();
    return out;
  }

  /** mode: 'merge' (default, never loses or inflates) or 'replace' */
  function importText(text, mode){
    if (typeof text !== 'string' || text.length > 2 * 1024 * 1024){
      return { ok: false, msg: 'ファイルが大きすぎるか、読み取れない形式です。' };
    }
    let parsed;
    try{ parsed = JSON.parse(text); }
    catch(e){ return { ok: false, msg: 'ファイルの中身を読み取れませんでした。' }; }
    const data = (parsed && parsed.app === FILE_TAG && parsed.data) ? parsed.data
               : (parsed && isRecord(parsed.stars)) ? parsed // a bare data object is fine too
               : null;
    const normalized = normalizeData(data);
    if (!normalized) return { ok: false, msg: '記録の形式がこわれているため、読み込みませんでした。' };
    const levelsIn = data => Object.keys(data.stars || {}).length
      + Object.keys(data.roundTwo && data.roundTwo.stars || {}).length;
    const before = levelsIn(record);
    const next = mode === 'replace' ? normalized : mergeInto(record, normalized);
    record = next;
    writeNow();
    const after = levelsIn(record);
    const stickerCount = record.stickers.length + (record.roundTwo ? record.roundTwo.stickers.length : 0);
    const summary = `（★のついたレベル ${before} → ${after}、シール ${stickerCount} 枚）`;
    // the record is in use either way; say plainly when it will not outlive the app
    if (!(avail && ok)){
      return { ok: true, saved: false, savedAt: parsed.savedAt || null,
               msg: '読み込みましたが、この端末に保存できませんでした' + summary
                  + '。アプリを閉じると元に戻ります。' };
    }
    return { ok: true, saved: true, msg: '読み込みました' + summary, savedAt: parsed.savedAt || null };
  }

  /** How much this fact is owed a turn: 0 (fresh and solid) … ~2 (missed, or long unseen).
      A fact that has never been asked scores 1, so nothing is starved at the start. */
  function dueOf(k){
    const f = mem.facts[k];
    if (!f || !f[0]) return 1;
    const acc = f[1] / f[0];
    const age = Math.min(30, dayNo() - f[2]);
    /* Right but slow is not the same as known. Right-first-time cannot tell a child
       who remembers「10は4と6」from one who counted the six empty cells for nine
       seconds, and only the first of those makes a carry sum fast. */
    const slow = f[5] ? clamp((f[5] - FLUENT_FAST_MS) / (FLUENT_SLOW_MS - FLUENT_FAST_MS), 0, 1) : 0;
    return (1 - acc) * 1.6 + (age / 30) * 0.6 + (f[0] < 3 ? 0.25 : 0) + slow * 0.5;
  }

  /** One reading of item-level progress for both the child's practice and the
      parent page. Lifetime misses remain in the backup, while recent independent
      answers can retire an old difficulty without rewriting that history. */
  function factStatus(k){
    const f = mem.facts[k];
    if (!f || !f[0]) return null;
    const recent = (mem.factRecent && mem.factRecent[k]) || '';
    const recentRight = recent.split('1').length - 1;
    const missed = f[0] - f[1], accuracy = f[1] / f[0];
    const recovered = recent.length >= 6 && recentRight / recent.length >= .85;
    const slow = f[5] >= FLUENT_SLOW_MS;
    const needsPractice = !!f[4] && (slow || missed >= 1 && !recovered
      && !(accuracy >= .8 && missed < 2));
    return {key:k, label:f[3] || k, at:f[4] || null, n:f[0], right:f[1], accuracy,
      recentN:recent.length, recentAccuracy:recent.length ? recentRight / recent.length : null,
      recovered, slow, needsPractice, daysSince:Math.max(0, dayNo() - f[2]),
      missed, due:dueOf(k), ms:f[5] || null};
  }

  /** The facts this child keeps missing, worst first.
      Only facts they have actually met and actually got wrong: 集中練習 is practice,
      not first contact, and one slip is not a gap. */
  function weakFacts(limit){
    const out = [];
    for (const k in mem.facts){
      const status = factStatus(k);
      if (!status || !status.needsPractice) continue;
      out.push(status);
    }
    out.sort((a, b) => b.due - a.due || b.missed - a.missed);
    return limit ? out.slice(0, limit) : out;
  }

  function selectRound(next){
    if (![1, 2].includes(next) || (next === 2 && !record.roundTwoReached)) return false;
    if (next === 2 && !record.roundTwo) record.roundTwo = blankProgress();
    record.selectedRound = next;
    save();
    return true;
  }
  const dailyTotal = day => (record.daily[day] || 0)
    + (record.roundTwo && record.roundTwo.daily[day] || 0);
  const worldSource = fullKey => {
    if (typeof fullKey !== 'string' || !fullKey) return null;
    const second = fullKey.startsWith('lap2:');
    const base = second ? fullKey.slice(5) : fullKey;
    if (!base || base.startsWith('lap2:')) return null;
    const source = second ? record.roundTwo : record;
    return source ? { source, base } : null;
  };
  function hasOwnedSticker(fullKey){
    const item = worldSource(fullKey);
    if (!item) return false;
    return item.base.startsWith('treasure:')
      ? item.source.treasures.includes(item.base.slice(9))
      : item.source.stickers.includes(item.base);
  }
  function ownedStickerKeys(){
    const keys = data => data.stickers.filter(k => typeof k === 'string' && !k.startsWith('lap2:'))
      .concat(data.treasures.map(id => 'treasure:' + id));
    return Array.from(new Set(keys(record).concat(record.roundTwo
      ? keys(record.roundTwo).map(k => 'lap2:' + k) : [])));
  }

  const rightIn = bits => bits.split('1').length - 1;
  function shortSupportReason(bits, misses){
    const repeated = misses && misses.length >= 3 && misses.slice(-3).every(m => m && m === misses[misses.length - 1]);
    if (repeated) return 'repeated-error';
    if (bits.endsWith('000') || bits.length >= 6 && rightIn(bits.slice(-6)) < 3) return 'support';
    return null;
  }
  function shortAdaptive(k, s){
    if (s.adaptive) return s.adaptive;
    // Older one-question courses already contain real observations. Use them to
    // offer relief immediately, without inventing an ordinary level attempt.
    const recent = (s.answers + s.checks).slice(-12), lastDay = mem.last[k] || dayOf(s.at);
    const reason = shortSupportReason(recent);
    return {recent, kinds:Array.from(recent, bit => bit === '1' ? 'i' : 's').join(''),
      misses:Array.from(recent, () => ''), sinceRest:reason ? '' : recent,
      lastDay, restUntil:reason ? lastDay + 3 : null, supportDone:false};
  }
  function shortProgress(s, complete, required){
    const today = dayNo();
    const failed = !!(s && s.checks.length === 3 && rightIn(s.checks) < required);
    const due = !!(s && s.readyDay !== null && today > s.readyDay && !(failed && s.checkDay >= today));
    const restart = failed && due;
    return {phase:!complete && due ? 'check' : 'independent',
      answered:s ? s.answers.length : 0, right:s ? rightIn(s.answers) : 0,
      readyDay:s ? s.readyDay : null, checks:s && !restart ? s.checks.length : 0,
      checkRight:s && !restart ? rightIn(s.checks) : 0,
      waiting:!!(s && s.readyDay !== null && !complete && !due),
      lastResult:s ? s.lastResult : 'practice'};
  }
  function shortStatus(g, l){
    const k = key(g, l), s = mem.shortCourses[k], today = dayNo();
    const confirmed = !!(s && s.confirmed) || mem.stickers.includes(k) && !mem.pending[k];
    const hasGold = mem.stickers.includes(k + ':g');
    const goldActive = !!(confirmed && !hasGold && s && s.gold && s.gold.active);
    const goldStatus = s && s.gold ? Object.assign(shortProgress(s.gold, hasGold, 3),
      {active:goldActive, complete:hasGold, independentRun:s.gold.answers.match(/1*$/)[0].length}) : null;
    const adaptive = s ? shortAdaptive(k, s) : null;
    const supportReason = adaptive ? shortSupportReason(adaptive.recent, adaptive.misses) : null;
    const learning = !confirmed || goldActive;
    return Object.assign(goldActive ? shortProgress(s.gold, false, 3) : shortProgress(s, confirmed, 2), {
      confirmed, goldActive, goldStatus, canStartGold:confirmed && !hasGold && !goldActive,
      rewardKeys:s && s.rewardKeys ? Array.from(new Set(s.rewardKeys))
        .filter(r => (r === k || r === k + ':g') && mem.stickers.includes(r)) : [],
      lastId:s ? s.lastId : '',
      at:s ? s.at : 0, lastDay:adaptive ? adaptive.lastDay : null,
      supportNeeded:learning && !!supportReason && adaptive.restUntil !== null && !adaptive.supportDone,
      supportReason:learning ? supportReason : null,
      resting:learning && !!(adaptive && adaptive.restUntil !== null && today < adaptive.restUntil),
      restUntil:learning && adaptive ? adaptive.restUntil : null });
  }

  function startShortCourse(g, l){
    if (typeof g !== 'string' || !/^[a-z0-9]+$/.test(g) || !Number.isSafeInteger(l) || l < 0)
      return shortStatus(g, l);
    const k = key(g, l);
    if (!mem.shortCourses[k]){
      mem.shortCourses[k] = {answers:'', readyDay:null, checks:'', checkDay:null,
        confirmed:false, evidence:mem.recent[k] || '', items:[], lastId:'', lastResult:'practice', at:Date.now()};
      save();
    }
    return shortStatus(g, l);
  }

  function startShortGold(g, l){
    if (typeof g !== 'string' || !/^[a-z0-9]+$/.test(g) || !Number.isSafeInteger(l) || l < 0
        || !shortStatus(g, l).canStartGold) return shortStatus(g, l);
    startShortCourse(g, l);
    const s = mem.shortCourses[key(g, l)];
    s.gold = {active:true, answers:'', readyDay:null, checks:'', checkDay:null, lastResult:'practice'};
    s.rewardKeys = [];
    // This optional challenge observes a fresh run of independent work. Its
    // guidance cycle is separate from difficulties before the ordinary clear.
    s.adaptive = {recent:'', kinds:'', misses:[], sinceRest:'', lastDay:dayNo(), restUntil:null, supportDone:false};
    s.at = Math.max(Date.now(), s.at + 1);
    save();
    return shortStatus(g, l);
  }

  function recordShortAnswer(g, l, clean, runId, phase, items, observation){
    const unchanged = () => Object.assign(shortStatus(g, l),
      {updated:false, newSticker:false, gold:false, justConfirmed:false});
    if (typeof g !== 'string' || !/^[a-z0-9]+$/.test(g) || !Number.isSafeInteger(l) || l < 0
        || typeof clean !== 'boolean' || typeof runId !== 'string' || !runId || runId.length > 120
        || !['independent','check'].includes(phase)) return unchanged();
    const k = key(g, l), today = dayNo();
    let s = mem.shortCourses[k];
    if (s && s.lastId === runId) return unchanged();
    if (!s){
      // Call this before noteOutcome(..., false): legacy ordinary answers retain
      // their readiness evidence while this first short answer remains ungraded.
      startShortCourse(g, l);
      s = mem.shortCourses[k];
    }
    const before = shortStatus(g, l);
    const adaptive = shortAdaptive(k, s), bit = clean ? '1' : '0';
    const kind = clean ? 'i' : observation && ['revised','viewed'].includes(observation.kind)
      ? observation.kind[0] : 's';
    const miss = !clean && observation && typeof observation.missType === 'string'
      && /^[a-z0-9-]{1,40}$/.test(observation.missType) ? observation.missType : '';
    adaptive.recent = (adaptive.recent + bit).slice(-12);
    adaptive.kinds = (adaptive.kinds + kind).slice(-12);
    adaptive.misses = adaptive.misses.concat(miss).slice(-12);
    // Free practice remains available during a rest, but does not keep pushing
    // its end further away. A new rest needs fresh observations after it ends.
    if (adaptive.restUntil === null || today >= adaptive.restUntil){
      adaptive.sinceRest = (adaptive.sinceRest + bit).slice(-12);
      if (adaptive.sinceRest.length >= 3 && shortSupportReason(adaptive.sinceRest,
          adaptive.misses.slice(-adaptive.sinceRest.length))){
        adaptive.restUntil = today + 3;
        adaptive.sinceRest = '';
        adaptive.supportDone = false;
      }
    }
    adaptive.lastDay = Math.max(adaptive.lastDay, today);
    s.adaptive = adaptive;
    let newSticker = false, gold = false, justConfirmed = false;
    if (Array.isArray(items)) s.items = Array.from(new Set(items.filter(item =>
      typeof item === 'string' && item.length <= 240))).slice(-64);
    s.lastId = runId;
    s.lastResult = 'practice';
    s.rewardKeys = [];
    // Each one-question visit is complete in its own right. Keep every observed
    // answer in lifetime statistics, including extra practice and failed checks.
    mem.seen[g] = (mem.seen[g] || 0) + 1;
    const ft = mem.firstTry[g] || [0, 0];
    mem.firstTry[g] = [ft[0] + Number(clean), ft[1] + 1];
    if (before.goldActive){
      const challenge = s.gold;
      challenge.lastResult = 'practice';
      if (phase === 'check' && before.phase === 'check'){
        if (challenge.checks.length === 3) challenge.checks = '';
        challenge.checks += clean ? '1' : '0';
        challenge.checkDay = today;
        challenge.lastResult = 'check';
        if (challenge.checks.length === 3){
          if (challenge.checks === '111'){
            challenge.active = false; challenge.lastResult = 'confirmed';
            mem.stars[k] = Math.max(mem.stars[k] || 0, 3);
            if (!mem.stickers.includes(k + ':g')){
              mem.stickers.push(k + ':g'); gold = true; s.rewardKeys.push(k + ':g');
            }
            // This completed challenge supplies eleven real observations, not
            // an invented ordinary session or another award for the first clear.
            s.evidence = (s.evidence + challenge.answers + challenge.checks).slice(-30);
          } else challenge.lastResult = 'retry';
        }
      } else if (challenge.readyDay === null){
        challenge.answers = (challenge.answers + bit).slice(-8);
        if (challenge.answers === '11111111'){
          challenge.readyDay = today; challenge.lastResult = 'ready';
        }
      }
      s.lastResult = challenge.lastResult;
    } else if (!before.confirmed && phase === 'check' && before.phase === 'check'){
      if (s.checks.length === 3) s.checks = '';
      s.checks += clean ? '1' : '0';
      s.checkDay = today;
      s.lastResult = 'check';
      if (s.checks.length === 3){
        if (rightIn(s.checks) >= 2){
          s.confirmed = true; justConfirmed = true; s.lastResult = 'confirmed';
          const perfect = rightIn(s.answers) === 8 && rightIn(s.checks) === 3;
          const stars = perfect ? 3 : 2;
          mem.stars[k] = Math.max(mem.stars[k] || 0, stars);
          mem.plays[k] = (mem.plays[k] || 0) + 1;
          if (!mem.stickers.includes(k)){ mem.stickers.push(k); newSticker = true; s.rewardKeys.push(k); }
          delete mem.pending[k];
          if (perfect && !mem.stickers.includes(k + ':g')){ mem.stickers.push(k + ':g'); gold = true; s.rewardKeys.push(k + ':g'); }
          s.evidence = (s.evidence + s.answers + s.checks).slice(-30);
        } else s.lastResult = 'retry';
      }
    } else if (!before.confirmed && s.readyDay === null){
      s.answers = (s.answers + (clean ? '1' : '0')).slice(-8);
      if (s.answers.length === 8 && rightIn(s.answers) >= 6){
        s.readyDay = today; s.lastResult = 'ready';
      }
    }
    // Advancing the same snapshot within a millisecond must still beat its backup.
    s.at = Math.max(Date.now(), s.at + 1);
    save();
    return Object.assign(shortStatus(g, l), {updated:true, newSticker, gold, justConfirmed});
  }

  function noteShortSupport(g, l){
    const k = key(g, l), s = mem.shortCourses[k];
    if (!s) return false;
    const needed = shortStatus(g, l).supportNeeded, reward = s.rewardKeys && s.rewardKeys.length;
    if (!needed && !reward) return false;
    if (needed){
      const adaptive = shortAdaptive(k, s);
      adaptive.supportDone = true;
      s.adaptive = adaptive;
    }
    s.rewardKeys = [];
    s.at = Math.max(Date.now(), s.at + 1);
    save();
    return true;
  }

  /** Today's actual observations, across both laps. A familiar item need not earn
      another milestone: its last-practised day still proves it was tried today.
      Such entries deliberately say nothing about independent correctness. */
  function todaySummary(){
    const day = dayNo(), entries = new Map();
    [record, record.roundTwo].forEach((source, index) => {
      if (!source) return;
      const lap = index + 1;
      for (const [key, m] of Object.entries(source.milestones || {})){
        const match = /^([a-z0-9]+):(\d+):(viewed|together|supported|revised|independent)$/.exec(key);
        if (!match || !m || m.day !== day) continue;
        const group = lap + ':' + match[1] + ':' + match[2], current = entries.get(group);
        if (!current || MILESTONE_RANK[match[3]] > MILESTONE_RANK[current.kind])
          entries.set(group, {round:lap, type:'milestone', gameId:match[1], levelIndex:Number(match[2]), kind:match[3], label:m.label});
      }
      for (const [key, r] of Object.entries(source.reviewRecords || {}))
        if (r && r.day === day) entries.set(lap + ':review:' + key, {round:lap, type:'review', key});
      for (const [key, r] of Object.entries(source.transferRecords || {}))
        if (r && r.day === day) entries.set(lap + ':transfer:' + key, {round:lap, type:'transfer', key:'transfer:' + key});
      for (const f of Object.values(source.facts || {})){
        const match = f && typeof f[4] === 'string' && /^([a-z0-9]+):(\d+)$/.exec(f[4]);
        if (!match || !f[0] || f[2] !== day) continue;
        const group = lap + ':' + match[1] + ':' + match[2];
        if (!entries.has(group)) entries.set(group, {round:lap, type:'practice', gameId:match[1], levelIndex:Number(match[2]),
          label:typeof f[3] === 'string' ? f[3].slice(0,80) : ''});
      }
    });
    return {day, date:todayKey(), total:dailyTotal(todayKey()), entries:Array.from(entries.values())};
  }

  return {
    get data(){ return mem; },
    endToday(){
      const today = dayNo();
      if (record.endedDay === today) return false;
      record.endedDay = today; save(); return true;
    },
    endedToday: () => record.endedDay === dayNo(),
    todaySummary,
    round, selectRound,
    roundData: n => n === 1 ? record : n === 2 ? record.roundTwo : null,
    unlockRoundTwo(){
      if (record.roundTwoReached) return false;
      record.roundTwoReached = true; save(); return true;
    },
    worldKey: base => typeof base === 'string' && !base.startsWith('lap2:') && round() === 2
      ? 'lap2:' + base : base,
    ownedStickerKeys, hasOwnedSticker,
    ownedStickerPending(fullKey){
      const item = worldSource(fullKey);
      return !!(item && item.source.pending[item.base]);
    },
    /** false when this device/origin cannot persist — the parent page says so. */
    get persists(){ return avail && ok; },
    /** why not: 'ok' | 'unavailable' (no storage for this page) | 'failed' (a write did not land) */
    get storage(){ return !avail ? 'unavailable' : ok ? 'ok' : 'failed'; },
    /** the record on this device would not parse; its bytes were kept aside */
    get unreadable(){ return unreadable; },
    get origin(){ return location.origin === 'null' ? 'file://' : location.origin; },
    exportText, importText,
    savedSession(){ return normalizeSavedSession(mem.savedSession); },
    saveSession(session){
      const visit = normalizeSavedSession(session);
      if (!visit) return false;
      mem.savedSession = visit;
      save();
      return true;
    },
    clearSavedSession(){
      if (mem.savedSession === null) return false;
      mem.savedSession = null;
      save();
      return true;
    },
    reviewSession(){return normalizeReviewSession(mem.reviewSession);},
    saveReviewSession(session){
      const visit=normalizeReviewSession(session);
      if(!visit)return false;
      mem.reviewSession=visit;save();return true;
    },
    clearReviewSession(){
      if(mem.reviewSession===null)return false;
      mem.reviewSession=null;save();return true;
    },
    todayKey,
    flush: writeNow,
    stars: (g, l) => mem.stars[key(g, l)] || 0,
    gameStars(g, levels){
      let s = 0; for (let i = 0; i < levels; i++) s += mem.stars[key(g, i)] || 0; return s;
    },
    totalStars(){ let s = 0; for (const k in mem.stars) s += mem.stars[k]; return s; },
    plays: (g, l) => mem.plays[key(g, l)] || 0,
    /* A pass opens the next level. Three honest attempts also open it: a five-year-old
       must never end up staring at a padlock they cannot move, and the parent page
       shows the low score either way. */
    levelUnlocked(g, l){
      if (l === 0) return true;
      const k = key(g, l - 1);
      return (mem.stars[k] || 0) >= 1 || (mem.plays[k] || 0) >= 3;
    },

    /** One question's first-try result, attributed to the level it came from.
        Recorded per question rather than per level so that a question met inside
        きょうの れんしゅう counts towards that level's recent form too. */
    noteOutcome(g, l, ok, eligible = true){
      const k = key(g, l);
      mem.recent[k] = ((mem.recent[k] || '') + (ok ? '1' : '0')).slice(-30);
      const course = mem.shortCourses[k];
      if (course && eligible){
        course.evidence = (course.evidence + (ok ? '1' : '0')).slice(-30);
        course.at = Math.max(Date.now(), course.at + 1);
      }
      mem.last[k] = dayNo();
      save();
    },

    shortStatus, startShortCourse, startShortGold, recordShortAnswer, noteShortSupport,
    shortItems(g, l){
      const course = mem.shortCourses[key(g, l)];
      return course && course.items ? course.items.slice() : [];
    },
    readiness(g, l){
      const k = key(g, l), s = mem.shortCourses[k];
      const evidence = s ? s.evidence : mem.recent[k] || '';
      return {count:evidence.length, accuracy:evidence.length ? rightIn(evidence) / evidence.length : null};
    },

    recordLevel(g, l, stars, right, total, alreadyCounted = false){
      const k = key(g, l);
      mem.stars[k] = Math.max(mem.stars[k] || 0, stars);
      mem.plays[k] = (mem.plays[k] || 0) + 1;
      mem.last[k]  = dayNo();
      mem.seen[g]  = (mem.seen[g] || 0) + total;
      const ft = mem.firstTry[g] || [0, 0];
      mem.firstTry[g] = [ft[0] + right, ft[1] + total];
      if (!alreadyCounted){
        const t = todayKey();
        mem.daily[t] = (mem.daily[t] || 0) + total;
      }
      save();
    },
    recordReview(k, outcomes, kind){
      const old = mem.reviewRecords[k];
      mem.reviewRecords[k] = { day: dayNo(), at: Date.now(), runs: (old ? old.runs : 0) + 1, kind,
        independent: outcomes.filter(x => x === 'independent').length,
        revised: outcomes.filter(x => x === 'revised').length,
        supported: outcomes.filter(x => x === 'supported').length };
      save();
    },
    recordPractice(right, total, alreadyCounted = false){
      if (!alreadyCounted){
        const t = todayKey();
        mem.daily[t] = (mem.daily[t] || 0) + total;
      }
      const p = mem.practice || (mem.practice = [0, 0]);
      p[0] += right; p[1] += total;
      save();
    },
    practiceDoneToday(){ return mem.practiceDays[todayKey()] === 1; },
    completePracticeToday(){ mem.practiceDays[todayKey()] = 1; save(); },
    /* 集中練習 counts towards today's total, but not towards the「きょうの れんしゅう」
       accuracy the parent page reports — that number names one specific set. */
    recordFocus(right, total, alreadyCounted = false){
      if (!alreadyCounted){
        const t = todayKey();
        mem.daily[t] = (mem.daily[t] || 0) + total;
      }
      save();
    },
    recordDiagnostic(outcomes, recommended){
      mem.diagnostic = {
        completedDay: dayNo(),
        outcomes: (outcomes || []).map(x => ({
          gameId: x.gameId, levelIndex: x.levelIndex || 0, clean: !!x.clean
        })),
        recommended: recommended || null
      };
      save();
    },
    recordMission(mission){
      if (!mission || !mission.day) return;
      mem.missions[mission.day] = Object.assign({}, mission, { done: false, reviewed: false });
      save();
    },
    completeMission(day){
      const m = mem.missions[day];
      if (!m) return false;
      m.done = true;
      m.doneDay = dayNo();
      save();
      return true;
    },
    reviewMission(day){
      const m = mem.missions[day];
      if (!m) return false;
      m.reviewed = true;
      save();
      return true;
    },
    mission: day => mem.missions[day] || null,
    /* ---- My sticker world -------------------------------------------------- */
    hasTreasure: worldId => mem.treasures.includes(worldId),
    claimTreasure(worldId){
      if (!TREASURE_WORLDS.includes(worldId) || this.hasTreasure(worldId)) return false;
      const games = Games.list.filter(g => g.world === worldId);
      if (!games.length || !games.every(g => g.levels.every((lv, i) => this.hasSticker(g.id + ':' + i + ':g')))) return false;
      mem.treasures.push(worldId);
      save();
      return true;
    },
    stickerWorld(){
      const w = mem.stickerWorld || (mem.stickerWorld = { background: 'meadow', items: {} });
      return { background: w.background, items: Object.assign({}, w.items) };
    },
    setStickerWorldBackground(background){
      const w = mem.stickerWorld || (mem.stickerWorld = { background: 'meadow', items: {} });
      w.background = String(background || 'meadow').slice(0, 24);
      save();
    },
    putWorldSticker(stickerKey, x, y){
      if (!hasOwnedSticker(stickerKey)) return false;
      const w = mem.stickerWorld || (mem.stickerWorld = { background: 'meadow', items: {} });
      w.items[stickerKey] = { x: clamp(Number(x) || 0, 0, 100), y: clamp(Number(y) || 0, 0, 100) };
      save();
      return true;
    },
    removeWorldSticker(stickerKey){
      const w = mem.stickerWorld;
      if (!w || !w.items || !w.items[stickerKey]) return false;
      delete w.items[stickerKey];
      save();
      return true;
    },
    islandJob(scene){ return (mem.islandJobs || {})[scene] || null; },
    startIslandJob(scene, fresh){
      if (!['boat', 'snack'].includes(scene)) return null;
      const jobs = mem.islandJobs || (mem.islandJobs = {});
      if (jobs[scene] && !fresh) return jobs[scene];
      const size = this.stars('bond', 0) >= 1 ? 10 : 5;
      const prior = jobs[scene];
      const start = size === 10 ? (prior && prior.start === 7 ? 6 : 7)
        : (prior && prior.start === 3 ? 2 : 3);
      jobs[scene] = { size, start, placed: 0, done: false, completed: !!(prior && prior.completed) };
      save(); return jobs[scene];
    },
    addIslandJobPiece(scene){
      const j = this.islandJob(scene);
      if (!j || j.done || j.placed >= j.size - j.start) return false;
      j.placed++; save(); return true;
    },
    finishIslandJob(scene){
      const j = this.islandJob(scene);
      if (!j || j.placed !== j.size - j.start) return false;
      j.done = true; j.completed = true; save(); return true;
    },
    practiceAccuracy(){
      const p = mem.practice;
      return (p && p[1]) ? p[0] / p[1] : null;
    },
    todayCount(){ return dailyTotal(todayKey()); },
    /** Questions answered today that no grade counts — the lesson and check questions.
        They took the child's time, so「きょうは ここまで」has to count them too. */
    countToday(n){
      if (!(n > 0)) return;
      const t = todayKey();
      mem.daily[t] = (mem.daily[t] || 0) + n;
      save();
    },
    /** calendar days this app has actually been used on — how much there is to lose */
    usedDays(){ return new Set(Object.keys(record.daily).concat(
      Object.keys(record.roundTwo && record.roundTwo.daily || {}))).size; },
    /** calendar days since the app was first opened on this device */
    daysSinceStart(){
      return Math.max(0, dayNo() - dayOf(mem.createdAt || Date.now()));
    },
    /** 1 April of the year this child starts school — set, or guessed from day one.
        School starts in April, so a first run in April or later belongs to next April. */
    schoolDate(){
      if (mem.schoolYear) return new Date(mem.schoolYear, 3, 1);
      const d = new Date(mem.createdAt || Date.now());
      return new Date(d.getFullYear() + (d.getMonth() >= 3 ? 1 : 0), 3, 1);
    },
    setSchoolYear(y){ mem.schoolYear = y || 0; save(); },
    /** calendar days from today to 入学 (negative once it has passed). Days, not
        rounded milliseconds: rounded, 31 March said「入学しています」from 1 p.m. */
    daysToSchool(){
      return dayOf(this.schoolDate().getTime()) - dayNo();
    },
    noteBackup(){ mem.backupAt = dayNo(); writeNow(); },
    lastBackupDays(){ return mem.backupAt ? Math.max(0, dayNo() - mem.backupAt) : null; },
    /** { never, days } when it is time to ask again, otherwise null.
        Never on the first days: there is nothing yet worth the interruption. */
    backupDue(){
      if (this.usedDays() < 10) return null;
      const d = this.lastBackupDays();
      if (d == null) return { never: true, days: null };
      return d >= 30 ? { never: false, days: d } : null;
    },
    streak(){
      let n = 0; const d = new Date();
      for (;;){
        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (dailyTotal(k) > 0) n++; else break;
        d.setDate(d.getDate() - 1);
        if (n > 400) break;
      }
      return n;
    },
    accuracy(g){
      const ft = mem.firstTry[g];
      if (!ft || !ft[1]) return null;
      return ft[0] / ft[1];
    },

    milestoneText(kind){ return MILESTONE_TEXT[kind] || ''; },
    milestoneRank(kind){ return MILESTONE_RANK[kind] || 0; },
    recordMilestone(gameId, levelIndex, kind, label){
      if (!/^[a-z0-9]+$/.test(gameId) || !Number.isInteger(levelIndex) || levelIndex < 0
          || !Object.prototype.hasOwnProperty.call(MILESTONE_TEXT, kind)) return null;
      const k = gameId + ':' + levelIndex + ':' + kind;
      if (mem.milestones[k] != null) return null;
      mem.milestones[k] = { day: dayNo(), label: String(label || '').slice(0, 80) };
      save();
      return { gameId, levelIndex, kind, day: mem.milestones[k].day, label: mem.milestones[k].label };
    },
    milestones(){
      return Object.keys(mem.milestones || {}).map(k => {
        const m = /^([a-z0-9]+):(\d+):(viewed|together|supported|revised|independent)$/.exec(k);
        const rec = mem.milestones[k];
        return m ? { gameId: m[1], levelIndex: Number(m[2]), kind: m[3],
          day: rec.day, label: rec.label } : null;
      }).filter(Boolean).sort((a, b) => b.day - a.day || MILESTONE_RANK[b.kind] - MILESTONE_RANK[a.kind]);
    },

    /* ---- item-level memory ---- */
    noteFact(k, firstTryOk, label, from, ms, miss){
      if (!k) return;
      const f = mem.facts[k] || (mem.facts[k] = [0, 0, 0]);
      f[0]++;
      if (firstTryOk) f[1]++;
      f[2] = dayNo();
      if (label) f[3] = label;      // so the parent page can say「3と7」, not「ten:3」
      /* Where this fact can be asked again. Without it the app can name a weak fact
         and still have no way to bring it back: the item key says which game, never
         which level. */
      if (from) f[4] = from;
      const recent = mem.factRecent || (mem.factRecent = {});
      recent[k] = ((recent[k] || '') + (firstTryOk ? '1' : '0')).slice(-12);
      /* How long the answer took, kept only where speed is the goal and only for
         clean answers — a wrong answer times a guess. A single interrupted question
         (the iPad put down mid-problem) is clamped rather than dropped, so it cannot
         decide the average on its own. An answer given while the question was still
         being read out arrives as 0 — the fastest answer there is, not a missing one:
         dropping it left the average made of the slow answers alone, and a fact the
         child knew cold was reported as「数えている」and sent to とっくん. */
      if (ms != null && ms >= 0){
        const capped = Math.max(1, Math.min(ms, 20000));
        f[5] = f[5] ? Math.round(f[5] * 0.65 + capped * 0.35) : capped;
      }
      /* What kind of wrong it was, from the first mistake on this question. A
         percentage says how often; this says what to do about it. */
      if (miss && MISS_KINDS[miss]){
        const m = f[6] || (f[6] = {});
        m[miss] = (m[miss] || 0) + 1;
      }
      save();
    },
    fact: k => mem.facts[k] || null,
    factStatus,
    /** The mistake this child keeps making on this fact: { kind, n, of } or null.
        Only the diagnostic kinds, only when it has happened more than once, and
        only when it is actually the dominant reading — one stray tap is not a
        pattern, and naming the wrong pattern is worse than naming none. */
    factMiss(k){
      const f = mem.facts[k];
      const m = f && f[6];
      if (!m) return null;
      let best = null, total = 0;
      for (const t in m){
        total += m[t];
        if (MISS_DIAGNOSTIC.indexOf(t) < 0) continue;
        if (!best || m[t] > best.n) best = { kind: t, n: m[t] };
      }
      if (!best || best.n < 2 || best.n * 2 < total) return null;
      best.of = total;
      return best;
    },
    factOrigin(k){ const f = mem.facts[k]; return f && f[4] || null; },
    factSpeed(k){ const f = mem.facts[k]; return f && f[5] || null; },
    /** Typical time to answer this game's facts, in ms — null until something has
        been timed. Median across facts, so one bad question does not move it. */
    gameSpeed(g){
      const xs = [];
      for (const k in mem.facts){
        if (k.indexOf(g + ':') !== 0) continue;
        const f = mem.facts[k];
        if (f && f[5]) xs.push(f[5]);
      }
      if (!xs.length) return null;
      xs.sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)];
    },
    /** Cleared with every answer right first time *and* without counting. */
    recordSwift(g, l){ mem.swift[key(g, l)] = 1; save(); },
    introduced: (g, l) => !!(mem.intro && mem.intro[key(g, l)]),
    markIntroduced(g, l){ (mem.intro || (mem.intro = {}))[key(g, l)] = 1; save(); },
    completeOrientation(){ mem.orientation = true; save(); },
    hasG1GameOpen: gameId => mem.g1GamesOpen[gameId] === 1,
    markG1GameOpen(gameId){
      if (typeof gameId !== 'string' || !safeKey(gameId) || !/^[a-z0-9]+$/.test(gameId)
          || mem.g1GamesOpen[gameId]) return false;
      mem.g1GamesOpen[gameId] = 1; save(); return true;
    },

    /* ---- provisional clears ---- */
    dayNumber: () => dayNo(),
    /** on the shelf, but waiting for another day to confirm it */
    addPending(k){
      if (mem.stickers.indexOf(k) >= 0) return false;
      mem.stickers.push(k);
      (mem.pending || (mem.pending = {}))[k] = [dayNo(), 0, 0];
      save();
      return true;
    },
    isPending: k => typeof k === 'string' && k.startsWith('lap2:')
      ? !!(record.roundTwo && record.roundTwo.pending[k.slice(5)])
      : !!(mem.pending && mem.pending[k]),
    hasConfirmed: k => mem.stickers.indexOf(k) >= 0 && !(mem.pending && mem.pending[k]),
    pendingFrom: k => (mem.pending && mem.pending[k]) ? mem.pending[k][0] : null,
    checkFailed: k => !!(mem.pending && mem.pending[k] && mem.pending[k][2] > 0),
    /** waiting clears from an earlier day that have not been checked today, oldest first */
    pendingDue(){
      const t = dayNo(), p = mem.pending || {};
      return Object.keys(p).filter(k => p[k][0] < t && p[k][1] < t).sort((a, b) => p[a][0] - p[b][0]);
    },
    confirmSticker(k){
      if (!mem.pending || !mem.pending[k]) return false;
      delete mem.pending[k];
      save();
      return true;
    },
    failCheck(k){
      const p = mem.pending && mem.pending[k];
      if (!p) return;
      p[1] = dayNo(); p[2]++;
      save();
    },
    isSwift: (g, l) => !!mem.swift[key(g, l)],
    factDue: dueOf,
    weakFacts,

    /* ---- recent (windowed) performance ----
       A lifetime average cannot show that a child recovered, and it cannot show
       that a child has just started slipping. Both are what a parent needs. */
    recentAccuracy(g, l){
      const s = mem.recent[key(g, l)];
      if (!s) return null;
      let r = 0;
      for (let i = 0; i < s.length; i++) if (s[i] === '1') r++;
      return s.length ? r / s.length : null;
    },
    /** how many outcomes the recent window actually holds — a percentage over one
        question must never be presented as a judgement about a child */
    recentCount(g, l){ return (mem.recent[key(g, l)] || '').length; },
    gameRecentAccuracy(g, levels){
      let r = 0, n = 0;
      for (let i = 0; i < levels; i++){
        const s = mem.recent[key(g, i)] || '';
        for (let j = 0; j < s.length; j++){ n++; if (s[j] === '1') r++; }
      }
      return n ? r / n : null;
    },
    /** days since this level was last played; large when never played */
    daysSince(g, l){
      const d = mem.last[key(g, l)];
      return d ? Math.max(0, dayNo() - d) : 99;
    },
    addSticker(k){
      if (mem.stickers.indexOf(k) < 0){ mem.stickers.push(k); save(); return true; }
      return false;
    },
    hasSticker: k => mem.stickers.indexOf(k) >= 0,
    setPref(k, v){ mem[k] = v; save(); },
    /** What to call this child. Kept short: it is spoken and it goes in a heading. */
    get name(){ return mem.name || ''; },
    setName(v){ mem.name = String(v || '').trim().slice(0, 12); save(); },
    reset(){ record = blank(); save(); }
  };
})();
