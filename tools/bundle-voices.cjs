#!/usr/bin/env node
/* Validate immutable generated audio before publishing, then embed only the
   small index in the app. The larger recordings are downloaded on demand. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tools/bundle-voices.cjs INPUT OUTPUT');
const source = path.join(root, 'src/voices');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const corpus = JSON.parse(fs.readFileSync(path.join(source, 'phrases.json'), 'utf8'));
const phrases = new Set(corpus.phrases.map(p => p.key));
const expectedIds = new Set(['nemo-female1', 'nemo-female2', 'nemo-male1']);
if (manifest.version !== 1 || manifest.voices.length !== expectedIds.size || !phrases.size) throw new Error('Incomplete natural voice packs');
const ids = new Set();
for (const voice of manifest.voices){
  if (!expectedIds.has(voice.id) || ids.has(voice.id)) throw new Error('Invalid voice id');
  ids.add(voice.id);
  const recorded = Object.keys(voice.clips);
  if (recorded.length !== phrases.size || recorded.some(key => !phrases.has(key))) throw new Error('Voice corpus is incomplete or out of date: ' + voice.id);
  if (!new RegExp('^voices/' + voice.id + '-[a-f0-9]{12}\\.bin$').test(voice.file)) throw new Error('Invalid voice filename');
  const audio = fs.readFileSync(path.join(source, path.basename(voice.file)));
  const hash = crypto.createHash('sha256').update(audio).digest('hex');
  if (audio.length !== voice.bytes || hash !== voice.sha256 || !voice.file.includes(hash.slice(0, 12))) throw new Error('Audio does not match manifest: ' + voice.id);
  for (const entry of Object.values(voice.clips)){
    const [offset, length] = entry;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 100 || offset + length > audio.length) throw new Error('Invalid clip: ' + voice.id);
  }
  const ranges = Object.values(voice.clips).sort((a, b) => a[0] - b[0]);
  if (!ranges.length || ranges[0][0] !== 0
      || ranges.some(([offset, length], i) => i + 1 < ranges.length && offset + length !== ranges[i + 1][0])
      || ranges.at(-1)[0] + ranges.at(-1)[1] !== audio.length) throw new Error('Gaps or overlaps in voice pack: ' + voice.id);
}
const script = fs.readFileSync(input, 'utf8');
const marker = '/*__VOICE_PACK_MANIFEST__*/ { voices: [] }';
if (!script.includes(marker)) throw new Error('Missing voice manifest marker');
fs.writeFileSync(output, script.replace(marker, JSON.stringify(manifest).replace(/</g, '\\u003c')));
const destination = path.join(root, 'dist/voices');
fs.mkdirSync(destination, { recursive: true });
const keep = new Set(manifest.voices.map(v => path.basename(v.file)));
for (const file of fs.readdirSync(destination)){
  if (/^nemo-[a-z0-9]+-[a-f0-9]{12}\.bin$/.test(file) && !keep.has(file)) fs.unlinkSync(path.join(destination, file));
}
for (const file of keep) fs.copyFileSync(path.join(source, file), path.join(destination, file));
fs.copyFileSync(path.join(source, 'README.md'), path.join(destination, 'README.md'));
