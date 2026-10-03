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
const assigned = new Set();
for (const [key, slot] of Object.entries(manifest.slots)){
  if (!manifest.pokemon[slot.id] || assigned.has(slot.id)) throw new Error('Missing or duplicate Pokémon: ' + key);
  assigned.add(slot.id);
  if (slot.rarity < 1 || slot.rarity > 5) throw new Error('Invalid rarity: ' + key);
  const p = manifest.pokemon[slot.id];
  if (slot.rarity >= 4 && !p.legendary && !p.mythical) throw new Error('Special reward must be legendary or mythical: ' + key);
  if (slot.rarity < 4 && (p.legendary || p.mythical)) throw new Error('Legendary cannot be earned through ordinary play: ' + key);
}
for (const p of Object.values(manifest.pokemon)){
  if (!/^[ァ-ヶー・２]+$/.test(p.name) || p.file !== p.id + '.webp') throw new Error('Invalid name or file: ' + p.id);
  const bytes = fs.readFileSync(path.join(root, p.file));
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP'
      || crypto.createHash('sha256').update(bytes).digest('hex') !== p.sha256) throw new Error('Invalid image: ' + p.id);
  p.image = 'data:image/webp;base64,' + bytes.toString('base64');
}
if (manifest.dailyPool.some(id => !manifest.pokemon[id] || manifest.pokemon[id].legendary || manifest.pokemon[id].mythical)) throw new Error('Invalid daily pool');
const marker = '/*__POKEMON_MANIFEST__*/ { pokemon: {}, slots: {}, dailyPool: [] }';
const script = fs.readFileSync(input, 'utf8');
if (!script.includes(marker)) throw new Error('Missing Pokémon manifest marker');
fs.writeFileSync(output, script.replace(marker, JSON.stringify(manifest).replace(/</g, '\\u003c')));
