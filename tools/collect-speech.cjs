#!/usr/bin/env node
/* Build the offline speech corpus from the real question generators.
 *
 * Usage: node tools/collect-speech.cjs [--samples=1000] [--output=path]
 * Requires Playwright + Chromium (the same dependency as run-tests.cjs).
 * No production files are changed except the requested JSON output. The app is
 * evaluated in an isolated browser with recording speech and a seeded RNG.
 * Sentence clips preserve Japanese phrasing; numbers are never spliced into
 * the middle of a recording. Unbounded user names remain device-TTS text.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
const SAMPLES = Number(args.samples || 1000);
if (!Number.isInteger(SAMPLES) || SAMPLES < 1 || SAMPLES > 10000) throw Error('samples must be 1..10000');
const OUTPUT = path.resolve(ROOT, args.output || 'src/voices/phrases.json');
const files = fs.readdirSync(path.join(ROOT, 'src/js')).filter(x => x.endsWith('.js')).sort();
const sources = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(ROOT, 'src/js', f), 'utf8')]));

/* Literal sentences cover infrequent app flows (results, orientation, rewards).
 * We deliberately do not scrape parent/report/store prose: it is never read.
 * Runtime collection below supplies computed sentences and all game hints.
 */
function literalSentences(source){
  const result = [];
  for (let i = 0; i < source.length; i++){
    const c = source[i], n = source[i + 1];
    if (c === '/' && n === '/'){ i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*'){ i = source.indexOf('*/', i + 2) + 1; continue; }
    if (c !== "'" && c !== '"' && c !== '`') continue;
    let raw = '', interpolated = false;
    for (i++; i < source.length; i++){
      if (source[i] === c) break;
      if (source[i] === '\\'){ raw += source[i] + (source[++i] || ''); continue; }
      if (c === '`' && source[i] === '$' && source[i + 1] === '{') interpolated = true;
      raw += source[i];
    }
    if (interpolated || /^[、，]/.test(raw) || !/[\u3040-\u30ff\u3400-\u9fff]/.test(raw)
        || !/[。！？!?]/.test(raw) || /[<>]/.test(raw) || raw.length > 180) continue;
    try{ result.push(Function('return ' + c + raw + c)()); }catch(e){}
  }
  return result;
}

const staticLines = files.filter(f => /^(05|06|10|11|12|13|14|88|89|90)-/.test(f))
  .flatMap(f => literalSentences(sources[f]));
staticLines.push('こんにちは。今日も一緒に、数を数えよう！');

const harness = String.raw`
const corpus = new Map();
function record(text){
  if (text == null) return;
  const chunks = String(text).match(/[^。！？!?]+[。！？!?]*/g) || [];
  for (const text of chunks){
    const key = text.replace(/\s+/g, '').replace(/[。！？!?]+$/g, '');
    if (!key || !/[\p{L}\p{N}]/u.test(key)) continue;
    // Prefer a question/exclamation-bearing variant over an unpunctuated label.
    const old = corpus.get(key);
    if (!old || (!/[。！？!?]$/.test(old) && /[。！？!?]$/.test(text))) corpus.set(key, text.replace(/\s+/g, '').trim());
  }
}
let randomSeed = 0x4b415a55;
Math.random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296; };
const Sound = {
  say(text, opts){ record(text); if (opts && opts.onend) opts.onend(); },
  afterSpeech(fn){ fn(); return () => {}; },
  sfx: new Proxy({}, { get: () => () => {} }), hush(){}, unlock(){},
  probeVoice: () => Promise.resolve(true), voiceOn: true, sfxOn: false,
  hasVoice: true, voices: [], voiceId: null
};
`;

const collector = String.raw`
window.collectSpeech = async function(samples, staticLines){
  staticLines.forEach(record);
  const counts = { literalSentences: corpus.size };
  const errors = new Map();
  const safe = (fn, where) => {
    try{ return fn(); }catch(e){ const k = where + ': ' + e.message; errors.set(k, (errors.get(k) || 0) + 1); }
  };
  const host = el('div#speech-corpus-host'); document.body.append(host);
  // Animation cosmetics and global drag listeners are unnecessary in a corpus
  // run; the real DOM nodes, callbacks and stateful generators remain intact.
  Coach.pulse = () => {};
  function collectFactory(make, g, li, want){
    clear(host);
    const field = el('div.playfield'), choices = el('div.choices'); host.append(field, choices);
    let delayed = [], coaches = [], shows = [], picks = [];
    const api = {
      field, choices, game: g, level: g.levels[li], levelIndex: li,
      want: want || null, check: false, locked: false,
      item(){}, answer(){}, correct(){}, wrong(){},
      say: record,
      setPrompt(html, speech){ record(speech == null ? String(html).replace(/<[^>]*>/g, '') : speech); },
      later(fn){ delayed.push(fn); return 0; },
      afterSpeech(fn){ fn(); return () => {}; },
      onShow(fn){ shows.push(fn); },
      onHint(fn){ coaches.push({ tool: fn }); },
      coach(c){ coaches.push(c); },
      buildPad(answer, opts){ return this.buildChoices(range(opts && opts.lo || 0, opts && opts.hi != null ? opts.hi : 10), answer, opts); },
      buildChoices(values, answer, opts){
        clear(choices);
        const o = opts || {};
        values.forEach(v => {
          const val = v && typeof v === 'object' && 'v' in v ? v.v : v;
          const b = el('button.choice' + (o.cls ? '.' + o.cls : ''), { type: 'button' });
          const content = o.render ? o.render(val, v) : String(val);
          if (content && content.nodeType) b.append(content); else b.textContent = content;
          choices.append(b);
          const hit = o.match ? o.match(val, answer) : val === answer;
          if (o.speech) record(typeof o.speech === 'function' ? o.speech(val, v) : o.speech);
          if (hit){
            const answerText = typeof content === 'string' ? content : String(val);
            record('答えは、' + spokenAnswerLabel(answerText) + 'だよ。');
            if (o.onPick) picks.push(() => o.onPick(val, b));
          }
        });
        return choices;
      }
    };
    safe(() => make(api), g.id + '/' + li + '/make');
    for (let phase = 0; phase < 5; phase++){
      const cs = coaches; coaches = [];
      for (const c of cs){
        if (c.say) safe(() => record(typeof c.say === 'function' ? c.say() : c.say), g.id + '/hint');
        if (c.tool) safe(() => c.tool(), g.id + '/tool');
        if (c.walk) safe(() => {
          const steps = c.walk() || [];
          steps.forEach(step => { record(step.say); if (step.act) safe(step.act, g.id + '/step'); });
        }, g.id + '/walk');
        if (c.say) safe(() => record(typeof c.say === 'function' ? c.say() : c.say), g.id + '/hint-after');
      }
      const ss = shows; shows = []; ss.forEach(fn => safe(fn, g.id + '/show'));
      const ps = picks; picks = []; ps.forEach(fn => safe(fn, g.id + '/pick'));
      const ds = delayed; delayed = []; ds.forEach(fn => safe(fn, g.id + '/later'));
      if (!coaches.length && !shows.length && !picks.length && !delayed.length) break;
    }
  }
  const perLevel = [];
  for (const g of Games.list){
    for (let li = 0; li < g.levels.length; li++){
      const before = corpus.size;
      for (let i = 0; i < samples; i++) collectFactory(g.levels[li].make, g, li);
      perLevel.push({ game: g.id, level: li, added: corpus.size - before });
      await new Promise(r => setTimeout(r, 0));
    }
  }
  counts.afterGameFactories = corpus.size;
  /* Exhaustive numeric helper domains and sentence templates. These prevent
   * random sampling from missing rare corners, such as 19 - 9 and 12:30.
   * The list mirrors the finite teaching domains in the question source. */
  for (let n = 0; n <= 20; n++){
    record(numKana(n)); record(koKana(n)); record(tsuKana(n)); record(banmeKana(n));
    record('答えは、' + n + 'だよ。');
    record(numKana(n) + 'だったね。');
    record(numKana(n) + 'の、次は？');
    record(numKana(n) + 'の次の数は？');
    record(numKana(n) + 'の前の数は？');
    if (n > 0) record(numKana(n - 1) + 'と' + numKana(n + 1) + 'の間の数は？');
  }
  // Wrong taps and partially completed boards expose states that an answer-only
  // factory walk cannot reach. The live regression audit supplies these domains.
  for (const category of Object.values(CATS)) record('それは' + category.lbl + 'の仲間じゃないね。');
  for (let sum = 2; sum <= 18; sum++){
    if (sum !== 10) record('合わせて' + numKana(sum) + 'になったよ。');
  }
  for (let sum = 0; sum <= 27; sum++){
    if (sum !== 10) record('合わせると' + numKana(sum) + 'だね。');
  }
  record('10になるように変えてみよう。');
  for (let remaining = 0; remaining <= 4; remaining++) record('残りは、' + koKana(remaining) + '。');
  for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++){
    if (a >= 1 && b >= 1 && a + b <= 10){
      record(numKana(a) + 'と' + numKana(b) + 'で、' + numKana(a + b) + '。');
      record(numKana(a) + 'と' + numKana(b) + 'で、いくつ？');
      record(numKana(a) + 'と' + numKana(b) + 'で？');
      record(numKana(a + b) + 'は、' + numKana(a) + 'といくつ？');
      record(numKana(a) + 'と' + numKana(b) + '。');
      record(numKana(a) + 'と' + numKana(b) + 'に、分けることもできるよ。');
    }
    if (a >= 1 && b >= 1 && a + b <= 10){
      record(numKana(a) + '、たす、' + numKana(b) + 'は？');
      record(numKana(a) + '、たす、' + numKana(b) + 'のお話は、どれ？');
    }
    if (a >= 2 && a <= 10 && b >= 1 && b <= a){
      record(numKana(a) + '、ひく、' + numKana(b) + 'は？');
      record(numKana(a) + '、ひく、' + numKana(b) + 'のお話は、どれ？');
    }
  }
  for (const thing of THINGS) for (let n = 0; n <= 10; n++){
    record(thingCountKana(thing, n));
    record(thing.n + 'を' + koKana(n) + '、とって、かごに入れよう。');
    record(thing.n + 'が' + koKana(n) + '、あるのは、どれ？');
    if (thing.moving) record(thing.n + 'が' + thingCountKana(thing, n) + 'いるよ。');
    if (thing.edible){
      for (const st of WORD_STORIES) record(st.s(n, n, thing) + st.q);
      record(thing.n + 'が ' + thingCountText(thing, n) + '。');
      for (const verb of ['もらった', 'たべた']){
        record(thingCountText(thing, n) + ' ' + verb);
        record(thingCountKana(thing, n) + '、' + verb + 'お話。');
      }
    }
  }
  for (const a of THINGS) for (const b of THINGS){
    if (a.e !== b.e) record(a.n + 'と' + b.n + 'を、一つずつペアにしよう。');
  }
  for (let h = 1; h <= 12; h++) for (const half of [false, true]){
    const next = h % 12 + 1;
    record(jiKana(h, half) + 'の時計は、どれ？');
    record('これは、' + jiKana(h, half) + '。');
    record('答えは、' + spokenAnswerLabel(h + ':' + (half ? 30 : 0)) + 'だよ。');
    record('短い針は、' + numKana(h) + 'と' + numKana(next) + 'の間。');
    record('過ぎたほうを読んで、' + jiKana(h, true) + '。');
    record(numKana(h) + 'を指しているね。');
  }
  Object.values(MISS_KINDS).forEach(x => { record(x.child); record(x.bare); });
  Object.values(TOKEN_NAME).forEach(record);
  for (const g of Games.list){
    record(g.name + '。');
    record('前にクリアした、' + g.name + 'を、確かめよう。');
    record(g.name + 'を、4問だけやってみよう。');
    for (const lv of g.levels) record(g.name + 'の、' + lv.t + 'をクリアすると、もらえるよ。');
  }
  for (let left = 0; left <= Progress.preStickers().total; left++) record('あと' + left + 'レベルで、1年生の教室が開くよ。');
  for (const total of [2, 3]) for (let got = 0; got <= total; got++) record('じゅんびの あそびを ' + got + '／' + total + ' できたら ひらくよ');
  record('このシールを取りに行こう。');
  for (const action of ['もう一度特訓できるよ。', '特訓できるよ。', 'おすすめを遊べるよ。',
    'もう一度できるよ。', '次のレベルに行けるよ。', 'もう一度、小さな冒険ができるよ。',
    '一年生の教室に行けるよ。', '遊びを選べるよ。']) record('オレンジのボタンで、' + action);
  // Home speech lists only these four banner titles in this fixed order.
  for (const first of ['', 'はじめの ぼうけん', 'いまの おすすめ'])
    for (const daily of ['', 'きょうの れんしゅう', 'きょうの れんしゅう おわり！'])
      for (const review of ['', 'きのうの ミッション']) for (const focus of ['', 'とっくん'])
        record([first, daily, review, focus].filter(Boolean).join('、') + '。');
  (window.__speechMissionBank || []).forEach(x => { record(x[1] + '。'); record(x[2]); });
  host.remove();
  counts.afterFiniteTemplates = corpus.size;
  return { phrases: Array.from(corpus, ([key, text]) => ({ key, text })).sort((a, b) => a.key.localeCompare(b.key, 'ja')), counts, perLevel, errors: Array.from(errors) };
};
`;

(async () => {
  const appSource = files.filter(f => f !== '01-audio.js' && f !== '99-main.js')
    .map(f => f === '89-experience.js'
      ? sources[f].replace('const BANK = [', 'const BANK = window.__speechMissionBank = [')
      : sources[f]).join('\n');
  const script = '(function(){\n' + harness + '\n' + appSource + '\n' + collector + '\n})();';
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body>'
    + fs.readFileSync(path.join(ROOT, 'src/body.html'), 'utf8')
    + '<script>' + script.replace(/<\/script>/g, '<\\/script>') + '</script></body></html>';
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try{
    browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage();
    page.on('pageerror', e => console.error('page error:', e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    const out = await page.evaluate(async ({ samples, lines }) => window.collectSpeech(samples, lines), { samples: SAMPLES, lines: staticLines });
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify({ version: 1, normalization: 'Remove all whitespace and trailing 。！？!?; preserve internal punctuation.', phrases: out.phrases }, null, 2) + '\n');
    console.log(JSON.stringify({ output: OUTPUT, samplesPerLevel: SAMPLES, phraseCount: out.phrases.length,
      characters: out.phrases.reduce((n, x) => n + x.text.length, 0), counts: out.counts, perLevel: out.perLevel, errors: out.errors }, null, 2));
    if (out.errors.length) console.error('Collector reported generator paths requiring inspection.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
