#!/usr/bin/env node
/* Compare real UI/session speech against the bundled sentence corpus.
 * This is a coverage audit, not a substitute for tools/run-tests.cjs: speech is
 * recorded silently and the offline service-worker test is omitted here.
 * Usage: node tools/audit-speech.cjs [--output=/tmp/speech-audit.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
const phrases = require(path.join(ROOT, 'src/voices/phrases.json')).phrases;
const files = fs.readdirSync(path.join(ROOT, 'src/js')).filter(f => f.endsWith('.js')).sort();
const recording = String.raw`
  const auditLines = new Map();
  function auditRecord(text){
    if (text == null) return;
    const line = String(text);
    auditLines.set(line, (auditLines.get(line) || 0) + 1);
  }
  // Tests sometimes replace Sound.say to inspect a particular utterance. Wrap
  // those replacements too, without changing their callback behavior.
  const wrappers = new WeakSet();
  let currentSay;
  Object.defineProperty(Sound, 'say', {
    configurable: true,
    get(){ return currentSay; },
    set(fn){
      if (wrappers.has(fn)){ currentSay = fn; return; }
      currentSay = function(text, opts){ auditRecord(text); return fn(text, opts); };
      wrappers.add(currentSay);
    }
  });
  Sound.say = (text, opts) => { if (opts && opts.onend) opts.onend(); };
  Sound.hush = () => {};
  window.speechAudit = { lines: auditLines, record: auditRecord };
`;
const app = '(function(){\n' + files.map(f => {
  const source = fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8');
  return f === '99-main.js' ? recording + '\n' + source + '\nSound.sfxOn = false;\n' : source;
}).join('\n') + '\n})();';
const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
  + fs.readFileSync(path.join(ROOT, 'src/head.html'), 'utf8')
  + '<style>html,body{margin:0;padding:0}img{max-width:100%}[hidden]{display:none!important}</style>'
  + '<style>' + fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8') + '</style></head><body>'
  + fs.readFileSync(path.join(ROOT, 'src/body.html'), 'utf8')
  + '<script>' + app.replace(/<\/script>/g, '<\\/script>') + '</script></body></html>';

(async () => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__audit__'){
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body><iframe id="app" src="/dist/kazu-no-bouken.html" style="width:1180px;height:820px;border:0"></iframe></body></html>');
      return;
    }
    if (url.pathname.endsWith('.html') || url.pathname === '/'){
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    const file = path.resolve(ROOT, '.' + url.pathname);
    if (!file.startsWith(ROOT + path.sep)){ res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200); res.end(err ? '' : data); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try{
    browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/__audit__');
    const appFrame = page.frames().find(f => f.url().includes('/dist/kazu-no-bouken.html'));
    await appFrame.waitForFunction(() => !!window.KazuApp);
    let regression = fs.readFileSync(path.join(ROOT, 'test/regression.js'), 'utf8')
      .replace('serviceWorkerOffline())', 'Promise.resolve())');
    if (args.targeted){
      const method = args.targeted === 'timing' ? 'narratedTransitions' : 'picturedAnswerSpeech';
      const start = regression.indexOf('  function ' + method + '(){');
      const end = regression.indexOf('  function ' + (method === 'narratedTransitions' ? 'picturedAnswerSpeech' : 'finish') + '(){', start);
      regression = '(function(){const K=window.KazuApp,S=K.Session._test,results=[];S.intro(false);'
        + 'const q=s=>document.querySelector(s),qa=s=>Array.from(document.querySelectorAll(s));'
        + 'const check=(name,ok,detail)=>results.push({name,ok,detail});'
        + 'function finishSpeech(t,o){if(o&&o.onend)o.onend();}'
        + 'function leavePlay(){const b=q("#play .backbtn");b.click();b.click();}'
        + regression.slice(start,end) + method + '();return {pass:results.filter(x=>x.ok).length,fail:results.filter(x=>!x.ok).length,results};})();';
    }
    const suite = await appFrame.evaluate(source => window.eval(source), regression);
    await appFrame.evaluate(() => {
      const K = window.KazuApp;
      K.Store.reset();
      for (const g of K.Games.list){
        K.Levels.render(g); K.Sound.say(K.Levels.speech());
      }
      for (const name of ['', 'あおい']){
        K.Store.setPref('name', name);
        for (const mode of ['level', 'daily', 'focus', 'adventure', 'diagnostic'])
          for (const stars of [0, 1, 2, 3]) for (const news of [0, 1, 2, 3]){
            const game = K.Games.list[0];
            K.Result.show({ game, mode, stars, levelIndex: 0, total: 8, right: stars * 2,
              swift: stars === 3 && news === 3, unlockedG1: news === 3,
              stickers: news === 1 ? [{ key: 'count:0', pending: true, emoji: '🐰' }] : [],
              confirmed: news === 2 ? [{ key: 'count:0', emoji: '🐰' }] : [],
              focusKeys: [], shaky: [], lastGameId: game.id });
          }
      }
      K.Store.setPref('name', '');
      K.Home.render(); K.UI.show('home');
      document.querySelector('#home .speakbtn').click();
      K.Book.open(); K.StickerWorld.open();
    });
    const lines = await appFrame.evaluate(() => Array.from(window.speechAudit.lines, ([text, count]) => ({ text, count })));
    const keys = new Set(phrases.map(p => p.key));
    const missing = new Map();
    let sentences = 0, matched = 0;
    for (const line of lines){
      for (const text of line.text.match(/[^。！？!?]+[。！？!?]*/g) || []){
        const key = text.replace(/\s+/g, '').replace(/[。！？!?]+$/g, '');
        if (!key) continue;
        sentences += line.count;
        if (keys.has(key)){ matched += line.count; continue; }
        const value = missing.get(key) || { key, text, count: 0, example: line.text };
        value.count += line.count; missing.set(key, value);
      }
    }
    const testOnly = new Set(['あ', '3こかぞえよう', 'ひとつずつかぞえよう', '選んでね']);
    const missingLines = Array.from(missing.values()).sort((a, b) => b.count - a.count);
    missingLines.forEach(x => { x.kind = x.key.startsWith('あおい、') ? 'personalized'
      : testOnly.has(x.key) ? 'test-only' : 'production'; });
    const out = { utterances: lines.length, sentenceEvents: sentences, matchedEvents: matched,
      coverage: sentences ? matched / sentences : 1, missing: missingLines,
      productionMissing: missingLines.filter(x => x.kind === 'production').length,
      runtimeErrors: errors, regression: { pass: suite.pass, fail: suite.fail, failed: suite.results.filter(r => !r.ok) } };
    const output = args.output || '/tmp/speech-audit.json';
    fs.writeFileSync(output, JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify({ output, ...out }, null, 2));
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
