#!/usr/bin/env node
'use strict';
// Exercise the real Store without a browser or a child's localStorage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = ['02-store.js', '06-miss.js'].map(name =>
  fs.readFileSync(path.join(root, 'src/js', name), 'utf8')).join('\n') + '\nglobalThis.testStore = Store;';
const clone = value => JSON.parse(JSON.stringify(value));
function load(raw){
  const storage = new Map(raw === undefined ? [] : [['kazu-no-bouken.v1', JSON.stringify(raw)]]);
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
    setTimeout(fn){ timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id){ timers.delete(id); },
    addEventListener(){}, document: { hidden: false }, location: { origin: 'https://test.invalid' },
    clamp: (n, a, b) => Math.max(a, Math.min(b, n)),
    Games: { list: [{ id: 'count', world: 'shima', levels: [{}] }] }
  };
  vm.runInNewContext(source, context, { filename: 'round-store-test.js' });
  return { store: context.testStore, storage };
}
const raw = store => JSON.parse(store.exportText()).data;
const passed = label => console.log('PASS ' + label);

const { store: S, storage } = load();
const facade = S.data;
assert.equal(S.round(), 1);
assert.equal(S.selectRound(2), false);
assert.equal(S.roundData(2), null);
S.recordLevel('count', 0, 3, 8, 8);
S.noteOutcome('count', 0, true);
S.noteFact('count:count:3', false, '３こ', 'count:0', 9000, 'down');
S.recordMilestone('count', 0, 'independent', '３こ');
S.markIntroduced('count', 0);
S.recordSwift('count', 0);
S.addSticker('count:0'); S.addSticker('count:0:g'); S.claimTreasure('shima');
S.addPending('r2:0');
S.recordReview('r2:0', Array(8).fill('independent'), 'lesson');
S.setPref('secondRoundReached', true);
S.setPref('g1Open', true);
S.setPref('transferReached', true);
S.setPref('transferRecords', { 0: { day: S.dayNumber(), independent: 4, revised: 1, supported: 0 } });
S.completePracticeToday();
S.completeOrientation();
S.setName('はな');
S.setPref('voice', false);
S.startIslandJob('boat');
assert.equal(S.putWorldSticker('count:0', 10, 20), true);
assert.equal(S.unlockRoundTwo(), true);
assert.equal(S.unlockRoundTwo(), false);
assert.equal(S.selectRound(2), true);
const fields = Object.keys(S.roundData(2));
const firstBefore = clone(Object.fromEntries(fields.map(k => [k, S.roundData(1)[k]])));
assert.equal(S.totalStars(), 0);
assert.equal(S.hasSticker('count:0'), false);
assert.equal(S.hasTreasure('shima'), false);
assert.equal(S.introduced('count', 0), false);
assert.equal(S.practiceDoneToday(), false);
assert.equal(S.data.g1Open, false);
assert.equal(S.data.transferReached, false);
assert.equal(S.data.secondRoundReached, false);
assert.equal(S.islandJob('boat'), null);
assert.equal(S.data.diagnostic, null);
assert.equal(S.name, 'はな');
assert.equal(S.data.voice, false);
assert.equal(S.data.orientation, true);
for (const k of fields){
  const first = S.roundData(1)[k], second = S.roundData(2)[k];
  if (first && typeof first === 'object') assert.notEqual(first, second, 'independent allocation: ' + k);
}
passed('lap 2 starts with independent empty learning fields while child settings remain shared');

S.recordLevel('count', 0, 1, 4, 8);
S.noteOutcome('count', 0, false);
S.noteFact('count:count:3', true, '３こ', 'count:0', 1000);
S.addPending('count:0');
S.recordReview('r2:0', Array(8).fill('supported'), 'lesson');
S.recordDiagnostic([{ gameId: 'count', levelIndex: 0, clean: true }], { gameId: 'count', levelIndex: 0 });
S.setPref('transferRecords', { 1: { day: S.dayNumber(), independent: 5, revised: 0, supported: 0 } });
S.completePracticeToday();
assert.equal(S.totalStars(), 1);
assert.equal(S.roundData(1).stars['count:0'], 3);
assert.equal(S.roundData(2).stars['count:0'], 1);
assert.deepEqual(clone(Object.fromEntries(fields.map(k => [k, S.roundData(1)[k]]))), firstBefore);
assert.equal(S.roundData(1).diagnostic, null);
assert.equal(S.roundData(2).diagnostic.outcomes.length, 1);
assert.deepEqual(Object.keys(S.roundData(1).transferRecords), ['0']);
assert.deepEqual(Object.keys(S.roundData(2).transferRecords), ['1']);
assert.equal(S.todayCount(), 16);
assert.equal(S.usedDays(), 1);
assert.equal(S.streak(), 1);
assert.equal(S.roundData(1).daily[S.todayKey()], 8);
assert.equal(S.roundData(2).daily[S.todayKey()], 8);
passed('all writes, replaced record maps and pending rewards stay in their lap; daily totals include both laps');

assert.equal(S.worldKey('count:0'), 'lap2:count:0');
assert.equal(S.worldKey('lap2:count:0'), 'lap2:count:0');
assert.equal(S.hasOwnedSticker('count:0'), true);
assert.equal(S.hasOwnedSticker('lap2:count:0'), true);
assert.equal(S.hasOwnedSticker('lap2:count:0:g'), false);
assert.equal(S.hasOwnedSticker('lap2:lap2:count:0'), false);
assert.equal(S.ownedStickerPending('count:0'), false);
assert.equal(S.ownedStickerPending('lap2:count:0'), true);
assert.equal(S.putWorldSticker('lap2:count:0', 70, 80), true);
assert.equal(S.putWorldSticker('lap2:count:0:g', 50, 50), false);
assert.deepEqual(clone(S.stickerWorld().items), {
  'count:0': { x: 10, y: 20 }, 'lap2:count:0': { x: 70, y: 80 }
});
assert.ok(S.ownedStickerKeys().includes('treasure:shima'));
assert.ok(S.ownedStickerKeys().includes('lap2:count:0'));
S.selectRound(1);
assert.equal(S.worldKey('count:0'), 'count:0');
assert.equal(S.hasOwnedSticker('lap2:count:0'), true);
assert.equal(S.isPending('lap2:count:0'), true);
assert.equal(S.isPending('count:0'), false);
S.selectRound(2);
passed('the shared island keeps separately owned and placed stickers from both laps');

const backup = S.exportText();
const original = JSON.parse(backup);
assert.equal(original.data.roundSchema, 1);
assert.equal(original.data.selectedRound, 2);
assert.equal(original.data.stars['count:0'], 3);
assert.equal(original.data.roundTwo.stars['count:0'], 1);
S.flush();
assert.equal(JSON.parse(storage.get('kazu-no-bouken.v1')).stars['count:0'], 3);
const reloaded = load(raw(S)).store;
assert.equal(reloaded.round(), 2);
assert.equal(reloaded.totalStars(), 1);
assert.equal(reloaded.roundData(1).stars['count:0'], 3);
assert.deepEqual(clone(reloaded.stickerWorld()), clone(S.stickerWorld()));
S.reset();
assert.equal(S.data, facade, 'the active facade survives replacing the root');
assert.equal(S.round(), 1);
assert.equal(S.roundData(2), null);
assert.equal(facade.stars['count:0'], undefined);
assert.equal(S.importText(backup, 'replace').ok, true);
assert.equal(S.data, facade);
assert.equal(S.round(), 2);
assert.equal(facade.stars['count:0'], 1);
passed('export, physical persistence, reload, reset and replace never flatten lap 2 over lap 1');

const firstBackup = clone(original);
firstBackup.data.selectedRound = 1;
assert.equal(S.importText(JSON.stringify(firstBackup)).ok, true);
assert.equal(S.round(), 2, 'merge preserves local selection');
const afterMerge = S.exportText();
S.importText(backup); S.importText(backup);
assert.deepEqual(raw(S), JSON.parse(afterMerge).data, 'repeated two-lap merges do not inflate or cross records');
const legacy = clone(original);
delete legacy.data.roundSchema;
delete legacy.data.roundTwo;
delete legacy.data.roundTwoReached;
legacy.data.selectedRound = 2; // this formerly meant the textbook module
legacy.data.stars['count:1'] = 2;
const secondBeforeLegacy = clone(S.roundData(2));
assert.equal(S.importText(JSON.stringify(legacy)).ok, true);
assert.equal(S.round(), 2);
assert.equal(S.roundData(1).stars['count:1'], 2);
assert.deepEqual(clone(S.roundData(2)), secondBeforeLegacy);
assert.equal(S.importText(JSON.stringify(legacy), 'replace').ok, true);
assert.equal(S.round(), 1);
assert.equal(S.roundData(2), null);
assert.equal(S.data.roundTwoReached, false);
assert.equal(S.data.secondRoundReached, true);
assert.equal(S.hasSticker('r2:0'), true);
assert.equal(S.data.reviewRecords['r2:0'].independent, 8);
assert.equal(S.selectRound(2), false);
const legacyLoaded = load(legacy.data).store;
assert.equal(legacyLoaded.round(), 1);
assert.equal(legacyLoaded.data.selectedRound, 1);
assert.equal(legacyLoaded.data.secondRoundReached, true);
assert.equal(legacyLoaded.roundData(2), null);
passed('legacy textbook records migrate into lap 1; merging old backups never imports them into lap 2');

S.importText(backup, 'replace');
const beforeInvalid = raw(S);
for (const change of [
  d => { d.roundSchema = 2; }, d => { d.roundSchema = null; },
  d => { d.roundTwoReached = null; }, d => { d.selectedRound = 3; },
  d => { d.roundTwo = []; }, d => { d.roundTwo = 'broken'; },
  d => { d.roundTwo.stars = null; }, d => { d.roundTwo.daily = []; },
  d => { d.roundTwo.stickers = [9]; }, d => { d.roundTwo.roundTwo = {}; },
  d => { d.roundTwo.reviewRecords['r2:0'].supported = 9; },
  d => { d.roundTwo.facts.bad = [1, 0, 1, '', '', 1, { unknown: 1 }]; }
]){
  const incoming = clone(original); change(incoming.data);
  assert.equal(S.importText(JSON.stringify(incoming), 'replace').ok, false);
  assert.deepEqual(raw(S), beforeInvalid, 'malformed nested data is rejected atomically');
}
for (const change of [
  d => { d.roundTwo.stars = null; }, d => { d.roundTwo = []; },
  d => { d.roundSchema = 9; }, d => { d.selectedRound = 99; }
]){
  const damaged = clone(original.data); change(damaged);
  const recovered = load(damaged).store;
  assert.equal(recovered.round(), 1);
  assert.equal(recovered.roundData(1).stars['count:0'], 3);
  assert.equal(recovered.roundData(1).reviewRecords['r2:0'].independent, 8);
}
passed('bad backup fields are atomic; damaged raw second-lap data recovers safely without losing lap 1');
