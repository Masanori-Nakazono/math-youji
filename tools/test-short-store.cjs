#!/usr/bin/env node
'use strict';
// Exercise cumulative one-question courses with disposable in-memory storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = ['02-store.js', '06-miss.js'].map(name =>
  fs.readFileSync(path.join(root, 'src/js', name), 'utf8')).join('\n') + '\nglobalThis.testStore = Store;';
const clone = value => JSON.parse(JSON.stringify(value));
const raw = store => JSON.parse(store.exportText()).data;
const passed = label => console.log('PASS ' + label);

function load(initial, elapsedDays = 0){
  const storage = new Map(initial === undefined ? [] : [['kazu-no-bouken.v1', JSON.stringify(initial)]]);
  const events = new Map();
  let now = new Date(2026, 9, 17, 12).getTime() + elapsedDays * 86400000, timer = 0;
  class Clock extends Date {
    constructor(...args){ super(...(args.length ? args : [now])); }
    static now(){ return now; }
  }
  const context = { Date:Clock,
    localStorage:{getItem:k => storage.get(k) || null, setItem:(k,v) => storage.set(k,String(v))},
    setTimeout(){ return ++timer; }, clearTimeout(){}, addEventListener:(name,fn) => events.set(name,fn),
    document:{hidden:false}, location:{origin:'https://short-course.invalid'},
    clamp:(n,a,b) => Math.max(a,Math.min(b,n)),
    Games:{list:[{id:'count',world:'shima',levels:[{},{},{}]}]}
  };
  vm.runInNewContext(source,context,{filename:'short-course-store-test.js'});
  return {store:context.testStore, storage, events, advance:days => { now += days * 86400000; }};
}

let serial = 0;
function answer(S, clean = true, phase, id = 'short-' + (++serial)){
  const result = S.recordShortAnswer('count',0,clean,id,phase || S.shortStatus('count',0).phase);
  if (result.updated){ S.noteOutcome('count',0,clean,false); S.countToday(1); }
  return result;
}
function prepare(S, bits = '11111111'){
  for (const bit of bits) answer(S,bit === '1','independent');
}

{
  const fixture = load(), S = fixture.store;
  assert.deepEqual(clone(S.readiness('count',0)),{count:0,accuracy:null});
  prepare(S,'11111110');
  const ready = S.shortStatus('count',0);
  assert.equal(ready.answered,8); assert.equal(ready.right,7); assert.equal(ready.waiting,true);
  assert.equal(ready.phase,'independent'); assert.equal(ready.lastResult,'ready');
  assert.equal(S.recentCount('count',0),8); assert.equal(S.todayCount(),8);
  assert.equal(S.readiness('count',0).count,0);
  assert.equal(S.stars('count',0),0); assert.equal(S.hasSticker('count:0'),false);
  for (let i = 0; i < 10; i++) answer(S,false,'independent');
  const stillReady = S.shortStatus('count',0);
  assert.equal(stillReady.readyDay,ready.readyDay); assert.equal(stillReady.right,7);
  answer(S,true,'check'); // A caller cannot consume a check before the later day.
  assert.equal(S.shortStatus('count',0).checks,0);
  fixture.advance(1);
  assert.equal(S.shortStatus('count',0).phase,'check');
  answer(S,true); answer(S,false);
  assert.equal(S.shortStatus('count',0).checks,2);
  const complete = answer(S,true);
  assert.equal(complete.justConfirmed,true); assert.equal(complete.newSticker,true); assert.equal(complete.gold,false);
  assert.equal(S.shortStatus('count',0).confirmed,true); assert.equal(S.shortStatus('count',0).waiting,false);
  assert.equal(S.hasConfirmed('count:0'),true); assert.equal(S.stars('count',0),2);
  assert.equal(S.hasSticker('count:0:g'),false); assert.equal(S.plays('count',0),1);
  assert.equal(S.readiness('count',0).count,11); assert.equal(S.readiness('count',0).accuracy,9/11);
  assert.deepEqual(clone(S.data.firstTry.count),[10,22]); assert.equal(S.data.seen.count,22);
  passed('short practice requires eight answers and a later-day check, preserving waiting through extra practice');
}

{
  const fixture = load(), S = fixture.store;
  prepare(S,'11111000');
  assert.equal(S.shortStatus('count',0).readyDay,null);
  assert.equal(S.stars('count',0),0);
  answer(S,true); answer(S,true); answer(S,true); answer(S,true); answer(S,true); answer(S,true);
  assert.equal(S.shortStatus('count',0).readyDay,S.dayNumber());
  fixture.advance(1);
  answer(S,false); answer(S,false); answer(S,true);
  assert.equal(S.shortStatus('count',0).lastResult,'retry');
  assert.equal(S.shortStatus('count',0).phase,'independent');
  assert.equal(S.shortStatus('count',0).waiting,true);
  answer(S,true,'check');
  assert.equal(S.shortStatus('count',0).checks,3); assert.equal(S.hasSticker('count:0'),false);
  fixture.advance(1);
  assert.equal(S.shortStatus('count',0).phase,'check');
  assert.equal(S.shortStatus('count',0).checks,0);
  answer(S,true); fixture.advance(1); answer(S,true);
  assert.equal(S.shortStatus('count',0).checks,2); // Visits may span several days.
  answer(S,true);
  assert.equal(S.hasConfirmed('count:0'),true);
  passed('supported or revised answers cannot meet the threshold, failed checks rest for the day and later checks accumulate');
}

{
  const fixture = load(), S = fixture.store;
  const first = answer(S,true,'independent','final-answer');
  assert.equal(first.updated,true); assert.equal(S.hasSticker('count:0:g'),false);
  const before = raw(S);
  assert.equal(answer(S,true,'independent','final-answer').updated,false);
  assert.deepEqual(raw(S),before);
  fixture.events.get('pagehide')();
  const reloaded = load(JSON.parse(fixture.storage.get('kazu-no-bouken.v1'))).store;
  assert.equal(answer(reloaded,true,'independent','final-answer').updated,false);
  assert.equal(reloaded.todayCount(),1); assert.equal(reloaded.shortStatus('count',0).answered,1);
  for (let i = 1; i < 8; i++) answer(S);
  fixture.advance(1); answer(S); answer(S);
  const complete = answer(S,true,'check','confirmation-answer');
  assert.equal(complete.gold,true); assert.equal(S.stars('count',0),3);
  assert.equal(S.hasSticker('count:0:g'),true);
  const completeRaw = raw(S);
  assert.equal(answer(S,true,'check','confirmation-answer').updated,false);
  assert.deepEqual(raw(S),completeRaw);
  assert.equal(S.plays('count',0),1); assert.equal(S.todayCount(),3);
  passed('answer IDs prevent reload and finish retries from duplicating observations, course awards or daily counts');
}

{
  const fixture = load(), S = fixture.store;
  for (let i = 0; i < 6; i++) S.noteOutcome('count',0,true);
  assert.equal(S.readiness('count',0).count,6);
  answer(S,false);
  assert.equal(S.readiness('count',0).count,6); assert.equal(S.readiness('count',0).accuracy,1);
  S.noteOutcome('count',0,false);
  assert.equal(S.readiness('count',0).count,7); assert.equal(S.readiness('count',0).accuracy,6/7);
  S.addSticker('count:0');
  assert.equal(S.shortStatus('count',0).confirmed,true);
  assert.equal(S.shortStatus('count',0).phase,'independent');
  passed('legacy and ordinary answers remain readiness evidence while short answers wait, and an ordinary clear ends the wait');
}

{
  const fixture = load(), S = fixture.store;
  prepare(S,'11111100');
  fixture.advance(1); answer(S);
  const backup = S.exportText(), progress = clone(S.shortStatus('count',0));
  S.unlockRoundTwo(); S.selectRound(2);
  assert.equal(S.shortStatus('count',0).answered,0);
  answer(S,false);
  assert.equal(S.roundData(1).shortCourses['count:0'].checks,'1');
  assert.equal(S.roundData(2).shortCourses['count:0'].answers,'0');
  const both = S.exportText(), restored = load(undefined,1).store;
  assert.equal(restored.importText(both,'replace').ok,true);
  assert.equal(restored.round(),2); assert.equal(restored.shortStatus('count',0).right,0);
  restored.selectRound(1);
  assert.deepEqual(clone(restored.shortStatus('count',0)),progress);
  restored.reset(); assert.equal(restored.shortStatus('count',0).answered,0);
  assert.equal(restored.importText(backup,'replace').ok,true);
  assert.deepEqual(clone(restored.shortStatus('count',0)),progress);
  answer(restored,true,'check','local-next');
  const newest = clone(restored.shortStatus('count',0));
  restored.importText(backup); restored.importText(backup);
  assert.deepEqual(clone(restored.shortStatus('count',0)),newest);
  const empty = load(undefined,1).store;
  empty.importText(backup); empty.importText(backup);
  assert.deepEqual(clone(empty.shortStatus('count',0)),progress);
  passed('course progress survives both laps, reload, export, replacement and idempotent snapshot merges');
}

{
  const fixture = load(), S = fixture.store;
  answer(S);
  const valid = raw(S);
  for (const mutate of [
    v => {v.answers='111111111';}, v => {v.evidence='2';}, v => {v.readyDay=-1;},
    v => {v.confirmed=true;}, v => {v.checks='1';v.checkDay=null;},
    v => {v.lastResult='gold';}, v => {v.at=NaN;}, v => {v.lastId='';}
  ]){
    const broken = clone(valid); mutate(broken.shortCourses['count:0']);
    assert.equal(load().store.importText(JSON.stringify(broken),'replace').ok,false);
  }
  const brokenStartup = clone(valid); brokenStartup.shortCourses['count:0'].answers='bad';
  const repaired = load(brokenStartup);
  assert.equal(repaired.store.shortStatus('count',0).answered,0);
  assert.ok(repaired.storage.has('kazu-no-bouken.v1.unreadable'));
  const copy = S.shortStatus('count',0); copy.answered=99;
  assert.equal(S.shortStatus('count',0).answered,1);
  passed('malformed short-course imports are rejected and malformed startup entries are isolated safely');
}

{
  const fixture = load(), S = fixture.store;
  S.noteOutcome('count',0,true);
  const before = raw(S);
  const started = S.startShortCourse('count',0);
  assert.equal(started.answered,0); assert.equal(started.lastId,'');
  assert.equal(S.todayCount(),0); assert.equal(S.recentCount('count',0),1);
  assert.equal(S.readiness('count',0).count,1);
  assert.equal(S.plays('count',0),0); assert.equal(S.hasSticker('count:0'),false);
  const initialized = raw(S);
  assert.deepEqual(initialized.recent,before.recent);
  assert.equal(load(initialized).store.shortStatus('count',0).answered,0);
  assert.equal(load().store.importText(S.exportText(),'replace').ok,true);
  S.startShortCourse('count',0);
  assert.deepEqual(raw(S),initialized);
  passed('supported-course initialization persists a zero-answer continuation without inventing observations or awards');
}

{
  const short = load().store;
  answer(short,false);
  const shortBackup = short.exportText();
  for (const reverse of [false,true]){
    const normal = load().store;
    for (let i = 0; i < 6; i++) normal.noteOutcome('count',0,true);
    const ordinaryBackup = normal.exportText();
    const target = reverse ? load(raw(short)).store : normal;
    const backup = reverse ? ordinaryBackup : shortBackup;
    assert.equal(target.importText(backup).ok,true);
    assert.equal(target.readiness('count',0).count,6);
    assert.equal(target.readiness('count',0).accuracy,1);
    const once = raw(target);
    assert.equal(target.importText(backup).ok,true);
    assert.deepEqual(raw(target),once);
  }
  const mixed = load().store;
  answer(mixed,false);
  for (let i = 0; i < 6; i++) mixed.noteOutcome('count',0,true);
  const mixedBackup = mixed.exportText();
  const moreShort = load(raw(short)).store;
  for (let i = 0; i < 7; i++) answer(moreShort,true);
  assert.equal(moreShort.readiness('count',0).count,0);
  moreShort.importText(mixedBackup);
  assert.equal(moreShort.readiness('count',0).count,6);
  assert.equal(moreShort.readiness('count',0).accuracy,1);
  const unchecked = load().store;
  unchecked.importText(shortBackup); unchecked.importText(moreShort.exportText());
  assert.equal(unchecked.readiness('count',0).count,6);
  passed('merging ordinary and short-only histories preserves valid ordinary evidence without promoting unchecked short answers');
}

{
  const S = load().store;
  S.startShortCourse('count',0);
  const items = ['count:countL:1','count:countL:2'];
  S.recordShortAnswer('count',0,true,'bag-one','independent',items);
  items.push('mutated');
  assert.deepEqual(clone(S.shortItems('count',0)),['count:countL:1','count:countL:2']);
  S.shortItems('count',0).push('mutated-output');
  assert.equal(S.shortItems('count',0).length,2);
  S.recordShortAnswer('count',0,true,'bag-two','independent');
  assert.equal(S.shortItems('count',0).length,2);
  const many = Array.from({length:70},(_,i) => 'count:fact:'+i);
  S.recordShortAnswer('count',0,true,'bag-three','independent',many);
  assert.deepEqual(clone(S.shortItems('count',0)),many.slice(-64));
  const backup = S.exportText();
  assert.deepEqual(clone(load(raw(S)).store.shortItems('count',0)),many.slice(-64));
  const restored = load().store;
  assert.equal(restored.importText(backup,'replace').ok,true);
  assert.deepEqual(clone(restored.shortItems('count',0)),many.slice(-64));
  S.unlockRoundTwo(); S.selectRound(2);
  assert.deepEqual(clone(S.shortItems('count',0)),[]);
  S.recordShortAnswer('count',0,true,'lap-two','independent',['count:countL:5']);
  assert.deepEqual(clone(S.shortItems('count',0)),['count:countL:5']);
  S.selectRound(1);
  assert.deepEqual(clone(S.shortItems('count',0)),many.slice(-64));
  const legacy = raw(S); delete legacy.shortCourses['count:0'].items;
  assert.deepEqual(clone(load(legacy).store.shortItems('count',0)),[]);
  assert.equal(load().store.importText(JSON.stringify(legacy),'replace').ok,true);
  const broken = raw(S); broken.shortCourses['count:0'].items=[{}];
  assert.equal(load().store.importText(JSON.stringify(broken),'replace').ok,false);
  const merged = load().store;
  merged.importText(backup); merged.importText(backup);
  assert.deepEqual(clone(merged.shortItems('count',0)),many.slice(-64));
  passed('short-course shuffle bags clone references, retain only 64 facts, survive backups and remain independent per lap');
}

{
  const S = load().store;
  for (const phase of ['independent','check']){
    const visit = {v:1,id:'saved-'+phase,at:Date.now(),mode:'first',title:'じぶんで 1もん',
      gameId:'count',levelIndex:0,index:1,plan:[{gameId:'count',levelIndex:0,seed:123}],
      firstTryRight:1,mistakes:0,swiftCount:0,results:['done'],
      sessionOutcomes:[{gameId:'count',levelIndex:0,clean:true}],shaky:[],focusKeys:[],usedItems:[],
      announced:[],checkTally:{},rewardKey:null,adventureTarget:null,
      firstTarget:{gameId:'count',levelIndex:0,want:null},firstPhase:phase,
      visitMilestone:{gameId:'count',levelIndex:0,kind:'independent',label:'２こ'},question:null};
    assert.equal(S.saveSession(visit),true);
    const restored = load(raw(S)).store;
    assert.equal(restored.savedSession().firstPhase,phase);
    assert.equal(restored.savedSession().index,1);
    assert.equal(restored.importText(S.exportText(),'replace').ok,true);
    assert.equal(restored.savedSession().firstPhase,phase);
  }
  passed('completed one-question practice and check checkpoints survive persistence and backup replacement');
}

console.log('All short-course store tests passed.');
