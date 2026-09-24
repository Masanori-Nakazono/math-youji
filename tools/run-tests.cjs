#!/usr/bin/env node
/* Run test/index.html in headless Chromium and fail when the suite does.

   The regression suite drives the real page — it taps answers and checks what
   happened afterwards, and the offline check needs CacheStorage — so it has to run
   in a browser served over http://127.0.0.1, never file://. Until this script it
   only ran when someone remembered to open the page by hand, which meant it
   protected nothing on the way to a deploy.

   Needs `playwright` (CI installs it with --no-save; there is no package.json).
   Usage: node tools/run-tests.cjs */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json'
};
const SUITE_TIMEOUT_MS = 5 * 60 * 1000;

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT + path.sep)){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err){ res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/test/index.html`;
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  let ok = false;
  try{
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', e => console.error('page error:', e.message));
    await page.goto(url);
    // every way the page can end — pass, fail, a thrown suite, an app that did
    // not load — puts a class on the summary
    await page.waitForFunction(() => {
      const s = document.getElementById('summary');
      return !!s && (s.classList.contains('ok') || s.classList.contains('ng'));
    }, null, { timeout: SUITE_TIMEOUT_MS });
    const out = await page.evaluate(() => ({
      summary: document.getElementById('summary').textContent,
      ok: document.getElementById('summary').classList.contains('ok'),
      rows: Array.from(document.querySelectorAll('#list li')).map(li => li.textContent)
    }));
    out.rows.forEach(r => console.log(r));
    console.log('\n' + out.summary);
    if (!out.ok) console.error('::error title=Regression suite failed::' + out.summary + ' | ' + out.rows.filter(r => /FAIL|✗|×/.test(r)).join(' | '));
    ok = out.ok;
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
