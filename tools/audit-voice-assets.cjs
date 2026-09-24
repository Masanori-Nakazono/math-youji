#!/usr/bin/env node
/* Decode every shipped sentence, including clips not selected by a UI test.
   Run after generation: node tools/audit-voice-assets.cjs
   Requires Playwright/Chromium, as do the other browser checks. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../src/voices');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const allowed = new Map(manifest.voices.map(v => ['/' + path.basename(v.file), path.join(root, path.basename(v.file))]));
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Voice asset audit</title>'); return; }
  const file = allowed.get(req.url);
  if (!file) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    for (const voice of manifest.voices) {
      const report = await page.evaluate(async voice => {
        const response = await fetch('/' + voice.file.split('/').pop());
        if (!response.ok) throw new Error('Missing audio file');
        const data = await response.arrayBuffer();
        const audio = new OfflineAudioContext(1, 1, 24000);
        const errors = [];
        let count = 0, shortest = Infinity, longest = 0, quietestPeak = Infinity;
        for (const [text, [offset, length]] of Object.entries(voice.clips)) {
          try {
            const clip = await audio.decodeAudioData(data.slice(offset, offset + length));
            const samples = clip.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < samples.length; i++) {
              if (!Number.isFinite(samples[i])) throw new Error('non-finite audio sample');
              peak = Math.max(peak, Math.abs(samples[i]));
            }
            if (clip.duration < .05 || !samples.length || peak < .0001) throw new Error('empty or silent speech');
            count++;
            shortest = Math.min(shortest, clip.duration);
            longest = Math.max(longest, clip.duration);
            quietestPeak = Math.min(quietestPeak, peak);
          } catch (error) { errors.push({ text, error: error.message }); }
        }
        return { count, shortest, longest, quietestPeak, errors };
      }, voice);
      console.log(voice.id + ': ' + JSON.stringify(report));
      assert.equal(report.errors.length, 0, 'Every speech clip must decode to non-silent audio');
      assert.equal(report.count, Object.keys(voice.clips).length);
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
