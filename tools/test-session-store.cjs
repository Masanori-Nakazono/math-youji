#!/usr/bin/env node
'use strict';
// Exercise saved visits using isolated in-memory storage, never a child's record.
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

function load(initial){
  const storage = new Map(initial === undefined ? [] : [['kazu-no-bouken.v1', JSON.stringify(initial)]]);
  const timers = new Map(), events = new Map();
  let nextTimer = 0, now = new Date(2026, 9, 17, 23, 59).getTime();
  class Clock extends Date {
    constructor(...args){ super(...(args.length ? args : [now])); }
    static now(){ return now; }
  }
  const context = {
    Date: Clock,
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
    setTimeout(fn){ timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id){ timers.delete(id); },
    addEventListener(name, fn){ events.set(name, fn); }, document: { hidden: false },
    location: { origin: 'https://test.invalid' }, clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
    Games: { list: [{ id: 'count', world: 'shima', levels: [{}] }] }
  };
  vm.runInNewContext(source, context, { filename: 'session-store-test.js' });
  return { store: context.testStore, storage, events, advance: ms => { now += ms; } };
}

function visit(id = 'visit-one'){
  return {
    v: 1, id, at: Date.now(), mode: 'level', title: 'かぞえて みよう', gameId: 'count', levelIndex: 0,
    index: 1, plan: Array.from({length:8}, (_, i) => ({gameId:'count', levelIndex:0, seed:i + 1})),
    firstTryRight: 1, mistakes: 1, swiftCount: 1, results: ['done'],
    sessionOutcomes: [{gameId:'count', levelIndex:0, clean:true}],
    shaky: [{key:'count:countL:3', label:'３こ'}], focusKeys: [], usedItems: ['count:countL:2'],
    announced: [], checkTally: {}, rewardKey: 'count:0', adventureTarget: null, firstTarget: null,
    firstPhase: null, visitMilestone: {gameId:'count', levelIndex:0, kind:'independent', label:'２こ'},
    question: {wrongThisQ:1, helped:true, taughtQ:false, missType:'down'}
  };
}

const loaded = load(), S = loaded.store;
assert.equal(S.savedSession(), null);
const first = visit();
assert.equal(S.saveSession(first), true);
first.plan[1].seed = 99; first.question.helped = false;
const returned = S.savedSession();
assert.equal(returned.plan[1].seed, 2); assert.equal(returned.question.helped, true);
returned.plan[1].seed = 77; returned.shaky[0].label = 'changed';
assert.equal(S.savedSession().plan[1].seed, 2);
assert.equal(S.savedSession().shaky[0].label, '３こ');
loaded.events.get('pagehide')();
assert.equal(JSON.parse(loaded.storage.get('kazu-no-bouken.v1')).savedSession.id, 'visit-one');
assert.deepEqual(clone(load(raw(S)).store.savedSession()), clone(S.savedSession()));
passed('saved visits clone all input/output references and survive pagehide and startup');

const modes = load().store;
for (const mode of ['level', 'daily', 'focus', 'adventure', 'first', 'diagnostic']){
  const checkpoint = visit('mode-' + mode);
  Object.assign(checkpoint, {
    mode, gameId:mode === 'level' || mode === 'first' ? 'count' : null,
    index:3, firstTryRight:0, swiftCount:0, results:['introdone', 'introdone', 'miss'],
    sessionOutcomes:[{gameId:'count', levelIndex:0, clean:false}],
    focusKeys:['count:countL:3'], announced:['count:0'], checkTally:{'count:0':{n:1, right:0}},
    adventureTarget:{gameId:'count', levelIndex:0, want:'count:countL:3'},
    firstTarget:{gameId:'count', levelIndex:0}, firstPhase:'together'
  });
  checkpoint.plan[0].intro = 'show'; checkpoint.plan[0].seed = 0;
  checkpoint.plan[1].intro = 'together'; checkpoint.plan[1].seed = 0xffffffff;
  checkpoint.plan[2].check = 'count:0'; checkpoint.plan[2].want = null;
  assert.equal(modes.saveSession(checkpoint), true, mode);
  assert.deepEqual(clone(modes.savedSession()), checkpoint);
}
passed('all runner modes retain introduction, check, target, seed and scoring state');

S.recordLevel('count', 0, 3, 8, 8);
S.unlockRoundTwo(); S.selectRound(2);
assert.equal(S.savedSession(), null);
S.saveSession(visit('visit-two'));
assert.equal(S.roundData(1).savedSession.id, 'visit-one');
assert.equal(S.roundData(2).savedSession.id, 'visit-two');
const backup = S.exportText();
const reloaded = load(raw(S)).store;
assert.equal(reloaded.round(), 2); assert.equal(reloaded.savedSession().id, 'visit-two');
reloaded.selectRound(1); assert.equal(reloaded.savedSession().id, 'visit-one');
S.reset(); assert.equal(S.savedSession(), null);
assert.equal(S.importText(backup, 'replace').ok, true);
assert.equal(S.round(), 2); assert.equal(S.savedSession().id, 'visit-two');
S.selectRound(1); assert.equal(S.savedSession().id, 'visit-one');
passed('each lap retains its own unfinished visit through export, replace, reset and reload');

S.clearSavedSession(); S.selectRound(2); S.clearSavedSession();
assert.equal(S.importText(backup).ok, true);
assert.equal(S.savedSession(), null); assert.equal(S.roundData(1).savedSession, null);
S.saveSession(visit('local-newer'));
S.importText(backup); S.importText(backup);
assert.equal(S.savedSession().id, 'local-newer');
const cleanMerge = load().store;
cleanMerge.importText(backup);
assert.equal(cleanMerge.roundData(1).savedSession, null);
assert.equal(cleanMerge.roundData(2).savedSession, null);
assert.equal(cleanMerge.roundData(1).stars['count:0'], 3);
passed('merges preserve the local visit and cannot resurrect interrupted visits from old backups');

S.importText(backup, 'replace');
const before = raw(S);
for (const change of [
  x => { x.v = 2; }, x => { x.mode = 'unknown'; }, x => { x.index = -1; },
  x => { x.index = 9; }, x => { x.results = []; }, x => { x.plan = []; },
  x => { x.plan[0].seed = 0x100000000; }, x => { x.plan[0].gameId = '__proto__'; },
  x => { x.question.helped = 'yes'; }, x => { x.swiftCount = 2; },
  x => { x.firstTryRight = 2; },
  x => { x.checkTally = JSON.parse('{"__proto__":{"n":1,"right":1}}'); },
  x => { x.plan = Array(129).fill({gameId:'count',levelIndex:0}); },
  x => { x.at = Infinity; }
]){
  const bad = visit(); change(bad);
  assert.equal(S.saveSession(bad), false);
  assert.deepEqual(raw(S), before);
  const file = JSON.parse(backup); file.data.roundTwo.savedSession = bad;
  assert.equal(S.importText(JSON.stringify(file), 'replace').ok, false);
  assert.deepEqual(raw(S), before, 'bad backup rejected without changing history');
}
const complete = visit('last-answer');
complete.index = 8; complete.results = Array(8).fill('done'); complete.question = null;
assert.equal(S.saveSession(complete), true);
assert.equal(S.savedSession().index, 8);
passed('invalid checkpoints are rejected atomically; a final-answer cursor is valid');

for (const mutate of [
  data => { data.savedSession.index = -2; },
  data => { data.savedSession = []; },
  data => { data.roundTwo.savedSession.question = 'broken'; }
]){
  const data = JSON.parse(backup).data; mutate(data);
  const recovered = load(data).store;
  assert.equal(recovered.roundData(1).stars['count:0'], 3);
  if (data.savedSession && !Array.isArray(data.savedSession) && data.savedSession.index === 1)
    assert.equal(recovered.roundData(1).savedSession.id, 'visit-one');
  else assert.equal(recovered.roundData(1).savedSession, null);
  if (data.roundTwo.savedSession.question === 'broken') assert.equal(recovered.roundData(2).savedSession, null);
  else assert.equal(recovered.roundData(2).savedSession.id, 'visit-two');
}
const legacy = JSON.parse(backup).data;
delete legacy.savedSession; delete legacy.roundTwo.savedSession;
assert.equal(load(legacy).store.savedSession(), null);
passed('startup discards only a damaged visit and preserves both laps and legacy records');

const day = load(), D = day.store;
D.countToday(1);
const firstDay = D.todayKey();
D.saveSession(visit('overnight'));
day.advance(2 * 60 * 1000);
const secondDay = D.todayKey();
assert.notEqual(secondDay, firstDay);
D.countToday(7);
D.recordLevel('count', 0, 3, 8, 8, true);
assert.equal(D.todayCount(), 7);
assert.equal(D.data.daily[firstDay], 1); assert.equal(D.data.daily[secondDay], 7);
assert.equal(D.data.seen.count, 8); assert.deepEqual(clone(D.data.firstTry.count), [8, 8]);
D.recordPractice(6, 8, true); D.recordFocus(6, 8, true);
assert.equal(D.todayCount(), 7); assert.deepEqual(clone(D.data.practice), [6, 8]);
D.completePracticeToday(); assert.equal(D.practiceDoneToday(), true);
assert.equal(D.data.practiceDays[firstDay], undefined);
D.recordLevel('count', 0, 1, 4, 8); D.recordPractice(5, 10); D.recordFocus(3, 4);
assert.equal(D.todayCount(), 29);
assert.equal(D.clearSavedSession(), true); assert.equal(D.clearSavedSession(), false);
assert.equal(D.savedSession(), null);
passed('per-question counts retain their calendar day; completion flags prevent double counting and preserve old callers');
