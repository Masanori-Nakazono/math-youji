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
console.log('Motivation storage checks passed');
