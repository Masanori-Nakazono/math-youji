#!/usr/bin/env node
'use strict';

/* Storage invariants for observed progress and island jobs.
   Uses only the store: no browser or child's saved data is touched. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/js/02-store.js'), 'utf8');
function fresh(initial){
  const values = new Map(initial || []);
  const context = vm.createContext({
    Date, Math, JSON, Number, Object, Array, String, Set, Map,
    setTimeout, clearTimeout, addEventListener(){},
    location: { origin: 'test://local' },
    localStorage: {
      getItem(k){ return values.has(k) ? values.get(k) : null; },
      setItem(k, v){ values.set(k, String(v)); }
    },
    clamp: (n, lo, hi) => Math.max(lo, Math.min(hi, n)),
    MISS_KINDS: {}, MISS_DIAGNOSTIC: []
  });
  vm.runInContext(source + '\nthis.testStore = Store;', context);
  return { store: context.testStore, values };
}

const first = fresh(), a = first.store;
assert.equal(a.recordMilestone('bond', 0, 'viewed', '5は2といくつ').kind, 'viewed');
assert.equal(a.recordMilestone('bond', 0, 'viewed', '5は2といくつ'), null);
assert.equal(a.milestones().length, 1);
assert.equal(a.milestones()[0].kind, 'viewed');
assert.equal(a.milestones()[0].label, '5は2といくつ');
assert.equal(a.recordMilestone('bond', 0, 'together', '5は2といくつ').kind, 'together');
assert.equal(a.recordMilestone('bond', 0, 'independent', '5は2といくつ').kind, 'independent');
assert.equal(a.recordMilestone('bond', 0, 'invented', 'x'), null);
assert.equal(a.stars('bond', 0), 0); // album entries cannot clear a level

let job = a.startIslandJob('boat');
assert.equal(job.size, 5);
assert.equal(job.start, 3);
assert.equal(a.finishIslandJob('boat'), false);
assert.equal(a.addIslandJobPiece('boat'), true);
assert.equal(a.addIslandJobPiece('boat'), true);
assert.equal(a.addIslandJobPiece('boat'), false);
assert.equal(a.finishIslandJob('boat'), true);
assert.equal(a.islandJob('boat').completed, true);
a.startIslandJob('boat', true);
assert.equal(a.islandJob('boat').completed, true); // the finished scene stays on the island
assert.equal(a.islandJob('boat').placed, 0);
a.recordLevel('bond', 0, 1, 4, 8);
job = a.startIslandJob('snack');
assert.equal(job.size, 10);
a.flush();
const reloaded = fresh(first.values).store;
assert.equal(reloaded.milestones().length, 3);
assert.equal(reloaded.islandJob('boat').completed, true);
assert.equal(reloaded.islandJob('snack').size, 10);

const backup = a.exportText();
const b = fresh().store;
assert.equal(b.importText(backup).ok, true);
assert.equal(b.importText(backup).ok, true); // merging twice does not duplicate progress
assert.equal(b.milestones().length, 3);
assert.equal(b.islandJob('boat').completed, true);
assert.equal(b.islandJob('snack').size, 10);
const tampered = JSON.parse(backup);
tampered.data.islandJobs.boat.placed = 99;
assert.equal(b.importText(JSON.stringify(tampered)).ok, false);
assert.equal(b.islandJob('boat').completed, true);
const badMilestone = JSON.parse(backup);
badMilestone.data.milestones['bond:0:independent'].label = { false: 'record' };
assert.equal(b.importText(JSON.stringify(badMilestone)).ok, false);

// Recovery windows must travel with the fact record that actually produced them.
const recovery = fresh(), recovered = recovery.store, factKey = 'ten:ten:4';
for (let i = 0; i < 8; i++) recovered.noteFact(factKey, false, '4 と 6 で 10', 'ten:1');
const older = recovered.exportText();
for (let i = 0; i < 12; i++) recovered.noteFact(factKey, true, '4 と 6 で 10', 'ten:1');
recovered.completeOrientation();
recovered.markG1GameOpen('g1set');
recovered.completePracticeToday();
const recoveryBackup = recovered.exportText();
assert.equal(recovered.weakFacts().length, 0);
assert.equal(recovered.hasG1GameOpen('g1pair'), false);
recovered.flush();
const recoveryReloaded = fresh(recovery.values).store;
assert.equal(recoveryReloaded.data.factRecent[factKey], '111111111111');
assert.equal(recoveryReloaded.data.orientation, true);
assert.equal(recoveryReloaded.hasG1GameOpen('g1set'), true);
assert.equal(recoveryReloaded.hasG1GameOpen('g1pair'), false);
assert.equal(recoveryReloaded.practiceDoneToday(), true);

const restored = fresh().store;
assert.equal(restored.importText(recoveryBackup, 'replace').ok, true);
assert.equal(restored.data.factRecent[factKey], '111111111111');
assert.equal(restored.weakFacts().length, 0);
assert.equal(restored.data.orientation, true);
assert.equal(restored.hasG1GameOpen('g1set'), true);
assert.equal(restored.practiceDoneToday(), true);
assert.equal(restored.importText(older).ok, true);
assert.equal(restored.data.factRecent[factKey], '111111111111'); // fewer attempts cannot undo recovery
assert.equal(restored.data.orientation, true);
assert.equal(restored.practiceDoneToday(), true);

const merged = fresh().store;
assert.equal(merged.importText(older).ok, true);
assert.equal(merged.weakFacts().length, 1);
assert.equal(merged.importText(recoveryBackup).ok, true);
assert.equal(merged.data.factRecent[factKey], '111111111111');
const mergedOnce = merged.exportText();
assert.equal(merged.importText(recoveryBackup).ok, true);
assert.equal(JSON.stringify(merged.data), JSON.stringify(JSON.parse(mergedOnce).data));
assert.equal(merged.hasG1GameOpen('g1pair'), false);
merged.markG1GameOpen('g1pair');
merged.data.practiceDays['2000-01-01'] = 1;
merged.importText(recoveryBackup);
assert.equal(merged.hasG1GameOpen('g1set'), true);
assert.equal(merged.hasG1GameOpen('g1pair'), true);
assert.equal(merged.hasG1GameOpen('g1teen'), false);
assert.equal(merged.data.practiceDays['2000-01-01'], 1);
assert.equal(merged.practiceDoneToday(), true);

// No window is better than incorrectly attaching another device's old window.
const legacy = JSON.parse(recoveryBackup);
delete legacy.data.factRecent;
delete legacy.data.orientation;
delete legacy.data.g1GamesOpen;
delete legacy.data.practiceDays;
const legacyStore = fresh().store;
assert.equal(legacyStore.importText(JSON.stringify(legacy), 'replace').ok, true);
assert.equal(Object.keys(legacyStore.data.factRecent).length, 0);
assert.equal(legacyStore.data.orientation, false);
assert.equal(legacyStore.hasG1GameOpen('g1set'), false);
assert.equal(legacyStore.practiceDoneToday(), false);
assert.equal(legacyStore.importText(recoveryBackup).ok, true);
assert.equal(legacyStore.data.factRecent[factKey], '111111111111'); // repair a window lost by the old importer
const differentTie = fresh().store;
differentTie.importText(recoveryBackup);
delete differentTie.data.factRecent[factKey];
differentTie.data.facts[factKey][1] = 0;
differentTie.importText(recoveryBackup);
assert.equal(differentTie.data.factRecent[factKey], undefined); // a different fact cannot borrow the window
const oldWindow = fresh().store;
oldWindow.importText(older);
oldWindow.importText(JSON.stringify(legacy));
assert.equal(oldWindow.fact(factKey)[0], 20);
assert.equal(oldWindow.data.factRecent[factKey], undefined);

// Completion flags are independent from a question count or a stored practice aggregate.
const incomplete = fresh().store;
incomplete.recordLevel('count', 0, 3, 8, 8);
incomplete.countToday(2);
incomplete.recordPractice(10, 10);
assert.equal(incomplete.practiceDoneToday(), false);
incomplete.completePracticeToday();
assert.equal(incomplete.practiceDoneToday(), true);
incomplete.reset();
incomplete.data.practiceDays['2000-01-01'] = 1;
assert.equal(incomplete.practiceDoneToday(), false);

for (const [field, invalid] of [
  ['factRecent', { [factKey]: '1111111111111' }],
  ['factRecent', { [factKey]: '10x' }],
  ['orientation', 1],
  ['g1GamesOpen', { g1set: true }],
  ['g1GamesOpen', { 'g1set:0': 1 }],
  ['practiceDays', { 'yesterday': 1 }],
  ['practiceDays', { [restored.todayKey()]: 2 }]
]){
  const invalidBackup = JSON.parse(recoveryBackup);
  invalidBackup.data[field] = invalid;
  const before = JSON.stringify(restored.data);
  assert.equal(restored.importText(JSON.stringify(invalidBackup), 'replace').ok, false, field);
  assert.equal(JSON.stringify(restored.data), before, field + ' rejected atomically');
}
console.log('Motivation storage checks passed');
