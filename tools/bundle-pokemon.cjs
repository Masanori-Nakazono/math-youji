#!/usr/bin/env node
'use strict';
// Validate the local collection and embed images into both portable builds.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: bundle-pokemon.cjs INPUT OUTPUT');
const root = path.resolve(__dirname, '../src/pokemon');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const firstKeys = Object.keys(manifest.slots), secondKeys = Object.keys(manifest.roundTwoSlots || {});
if (firstKeys.length !== 156 || secondKeys.length !== firstKeys.length
    || firstKeys.some(key => !Object.hasOwn(manifest.roundTwoSlots, key))){
  throw new Error('Each round must have the same 156 fixed reward keys');
}
const assigned = new Set();
for (const [round, slots] of [[1, manifest.slots], [2, manifest.roundTwoSlots]]){
  for (const [key, slot] of Object.entries(slots)){
    if (!manifest.pokemon[slot.id] || assigned.has(slot.id)) throw new Error('Missing or duplicate Pokémon: round ' + round + ' ' + key);
    assigned.add(slot.id);
    if (!Number.isInteger(slot.rarity) || slot.rarity < 1 || slot.rarity > 5) throw new Error('Invalid rarity: ' + key);
    const p = manifest.pokemon[slot.id];
    if (slot.rarity >= 4 && !p.legendary && !p.mythical) throw new Error('Special reward must be legendary or mythical: ' + key);
    if (slot.rarity < 4 && (p.legendary || p.mythical)) throw new Error('Legendary cannot be earned through ordinary play: ' + key);
    if (round === 2){
      const original = manifest.slots[key], first = manifest.pokemon[original.id];
      if (slot.rarity !== original.rarity || p.legendary !== first.legendary || p.mythical !== first.mythical){
        throw new Error('Second-round reward changed rarity or category: ' + key);
      }
    }
  }
}
for (const p of Object.values(manifest.pokemon)){
  if (!/^[ァ-ヶー・２]+$/.test(p.name) || p.file !== p.id + '.webp') throw new Error('Invalid name or file: ' + p.id);
  const bytes = fs.readFileSync(path.join(root, p.file));
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'
      || crypto.createHash('sha256').update(bytes).digest('hex') !== p.sha256) throw new Error('Invalid image: ' + p.id);
  p.image = 'data:image/webp;base64,' + bytes.toString('base64');
}
for (const [round, pool] of [[1, manifest.dailyPool], [2, manifest.roundTwoDailyPool]]){
  const allowed = new Set(Object.values(round === 1 ? manifest.slots : manifest.roundTwoSlots).map(slot => slot.id));
  if (!Array.isArray(pool) || !pool.length || pool.some(id => !allowed.has(id) || !manifest.pokemon[id]
      || manifest.pokemon[id].legendary || manifest.pokemon[id].mythical)) throw new Error('Invalid daily pool for round ' + round);
}
const marker = '/*__POKEMON_MANIFEST__*/ { pokemon: {}, slots: {}, dailyPool: [] }';
const script = fs.readFileSync(input, 'utf8');
if (!script.includes(marker)) throw new Error('Missing Pokémon manifest marker');
fs.writeFileSync(output, script.replace(marker, JSON.stringify(manifest).replace(/</g, '\\u003c')));
