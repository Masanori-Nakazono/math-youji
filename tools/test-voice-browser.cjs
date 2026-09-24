#!/usr/bin/env node
/* Exercise real MP3 decoding, playback, settings and offline persistence.
   Device TTS is stubbed because CI machines have no Japanese system voice.
   Natural audio uses the browser's real Web Audio implementation.
   Run: node tools/test-voice-browser.cjs (Chromium), or BROWSER=webkit for WebKit.
   Add NO_DEVICE_SPEECH=1 to exercise a browser with no system speech API.
   Add SILENT_AUDIO=1 on Chromium to render real audio through its silent sink
   when the host has no working audio output. Decoding and the audio clock stay native.
   WebKit uses a temporary on-disk profile: its automated private mode discards
   CacheStorage entries on reload. PERSISTENT_PROFILE=1 also enables this on Chromium. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { chromium, webkit } = require('playwright');
const browserName = process.env.BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(browserName), 'BROWSER must be chromium or webkit');
const silentAudio = process.env.SILENT_AUDIO === '1';
assert.ok(!silentAudio || browserName === 'chromium', 'SILENT_AUDIO requires Chromium');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/voices/manifest.json'), 'utf8'));
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error){ res.writeHead(404).end(); return; }
    const mime = file.endsWith('.html') ? 'text/html; charset=utf-8'
      : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }); res.end(data);
  });
});
let browser, persistentContext, profile;
async function showSettings(page){
  await page.evaluate(() => { KazuApp.Parent.render(); KazuApp.UI.show('parent'); });
  await page.locator('.voice-settings').scrollIntoViewIfNeeded();
}
async function preview(page){
  const before = await page.evaluate(() => ({ audio: window.audioStarts.length, device: window.deviceLines.length }));
  await page.getByRole('button', { name: '試しに聴く', exact: true }).click();
  try{
    await page.waitForFunction(n => window.audioStarts.length >= n + 2, before.audio, { timeout: 60000 });
    await page.getByRole('button', { name: '試しに聴く', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.getByRole('button', { name: '停止', exact: true }).isDisabled(), true);
    assert.deepEqual(await page.evaluate(n => window.deviceLines.slice(n), before.device), [],
      'recorded preview unexpectedly used a device voice');
  }catch(error){
    console.error('Preview diagnostics:', await page.evaluate(async () => ({
      voice: KazuApp.Sound.voiceId, status: KazuApp.Sound.voiceStatus,
      audioState: window.lastAudioContext && window.lastAudioContext.state,
      audioTime: window.lastAudioContext && window.lastAudioContext.currentTime,
      audioStarts: window.audioStarts, deviceLines: window.deviceLines, errors: window.errors,
      cacheOps: window.cacheOps,
      caches: await Promise.all((await caches.keys()).map(async name => {
        const cache = await caches.open(name);
        return { name, entries: await Promise.all((await cache.keys()).map(async request => ({
          url: request.url, bytes: (await (await cache.match(request)).arrayBuffer()).byteLength
        }))) };
      }))
    })));
    throw error;
  }
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = browserName === 'webkit' ? webkit : chromium;
  const launchOptions = browserName === 'chromium' && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const contextOptions = { viewport: { width: 820, height: 1180 }, serviceWorkers: 'block',
    ...(browserName === 'webkit' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) };
  let context;
  if (process.env.PERSISTENT_PROFILE === '1' || (browserName === 'webkit' && process.env.PERSISTENT_PROFILE !== '0')){
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kazu-voice-browser-'));
    context = persistentContext = await engine.launchPersistentContext(profile, { ...launchOptions, ...contextOptions });
  } else {
    browser = await engine.launch(launchOptions);
    context = await browser.newContext(contextOptions);
  }
  await context.addInitScript(({ disableDeviceSpeech, silentAudio }) => {
    window.audioStarts = []; window.deviceLines = []; window.errors = []; window.cacheOps = [];
    addEventListener('error', event => window.errors.push(event.message));
    if (disableDeviceSpeech) Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    if (silentAudio){
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = new Proxy(NativeAudioContext, {
        construct(target, [options], newTarget){
          const audioContext = Reflect.construct(target, [{ ...options, sinkId: { type: 'none' } }], newTarget);
          if (audioContext.sinkId?.type !== 'none') throw new Error('Chromium does not support the silent audio sink');
          return audioContext;
        }
      });
      if (window.webkitAudioContext === NativeAudioContext) window.webkitAudioContext = window.AudioContext;
    }
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function(...args){ window.lastAudioContext = this; return createGain.apply(this, args); };
    if (window.Cache){
      for (const method of ['put', 'delete']){
        const original = Cache.prototype[method];
        Cache.prototype[method] = function(...args){
          return original.apply(this, args).then(result => {
            window.cacheOps.push({ method, url: typeof args[0] === 'string' ? args[0] : args[0].url, result }); return result;
          }, error => { window.cacheOps.push({ method, error: error.name + ': ' + error.message }); throw error; });
        };
      }
    }
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args){
      const data = this.buffer && this.buffer.getChannelData(0);
      let peak = 0;
      if (data) for (let i = 0; i < data.length; i += 11) peak = Math.max(peak, Math.abs(data[i]));
      const record = { duration: this.buffer && this.buffer.duration, peak, startedAt: performance.now(), audioTime: this.context.currentTime };
      window.audioStarts.push(record);
      try{ return start.apply(this, args); }
      catch(error){ record.error = error.name + ': ' + error.message; throw error; }
    };
    if (window.speechSynthesis) speechSynthesis.speak = utterance => {
      if (utterance.text.trim()) window.deviceLines.push(utterance.text);
      queueMicrotask(() => { if (utterance.onend) utterance.onend(); });
    };
  }, { disableDeviceSpeech: process.env.NO_DEVICE_SPEECH === '1', silentAudio });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const url = `http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`;
  await page.goto(url);
  await showSettings(page);
  assert.equal(await page.locator('#reading-voice optgroup').first().locator('option').count(), manifest.voices.length);
  for (const voice of manifest.voices){
    await page.getByLabel('読み上げの声', { exact: true }).selectOption(voice.id);
    await preview(page);
    assert.equal(await page.evaluate(() => KazuApp.Store.data.voiceId), voice.id);
    console.log('PASS real decoding and playback: ' + voice.name);
    if (process.env.VOICE_DEBUG) console.log('Cache diagnostics:', await page.evaluate(async () => ({
      status: KazuApp.Sound.voiceStatus, operations: window.cacheOps, audio: window.audioStarts,
      cached: await Promise.all((await caches.keys()).map(async name => ({ name, urls: (await (await caches.open(name)).keys()).map(request => request.url) })))
    })));
  }
  assert.deepEqual(await page.evaluate(() => window.deviceLines), []);
  assert.ok(await page.evaluate(() => window.audioStarts.every(x => x.duration > .1 && x.peak > .01)));

  await page.getByRole('button', { name: '読み上げ：オン', exact: true }).click();
  await page.getByRole('button', { name: '効果音：オン', exact: true }).click();
  await preview(page);
  assert.deepEqual(await page.evaluate(() => [KazuApp.Sound.voiceOn, KazuApp.Sound.sfxOn]), [false, false]);
  console.log('PASS preview while narration and effects are off');

  await page.getByRole('button', { name: '試しに聴く', exact: true }).click();
  await page.getByRole('button', { name: '停止', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '試しに聴く', exact: true }).isEnabled(), true);
  const stoppedCount = await page.evaluate(() => window.audioStarts.length);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.audioStarts.length), stoppedCount);
  console.log('PASS stopping a preview prevents later sentences');

  // A reload discards all JS memory. Block pack requests afterwards: the new
  // page must get its audio from CacheStorage, not from the previous buffer.
  await page.waitForTimeout(150); // Store's documented debounced save
  await page.reload();
  await showSettings(page);
  assert.equal(await page.locator('#reading-voice').inputValue(), manifest.voices.at(-1).id);
  await context.setOffline(true);
  await preview(page);
  assert.deepEqual(await page.evaluate(() => window.deviceLines), []);
  console.log('PASS saved selection and audio survive reload without network');
  await context.setOffline(false);

  // The female2 recording of さん is longer than the old fixed 620 ms delay.
  // Drive the real counting game and check its prompt against the audio clock.
  assert.ok(manifest.voices.some(voice => voice.id === 'nemo-female2' && voice.clips['さん']));
  await page.evaluate(() => {
    const K = KazuApp, random = Math.random;
    K.Sound.voiceOn = true; K.Sound.sfxOn = false; K.Sound.voiceId = 'nemo-female2';
    K.Session._test.intro(false);
    Math.random = () => .4;
    try{ K.Session.startLevel(K.Games.byId.count, 0); }finally{ Math.random = random; }
  });
  assert.equal(await page.locator('#play .obj').count(), 3);
  await page.evaluate(() => {
    const objects = document.querySelectorAll('#play .obj');
    objects[0].click(); objects[1].click();
    window.countAskAt = null;
    const prompt = document.querySelector('#play .prompt .txt');
    const observer = new MutationObserver(() => {
      if (prompt.textContent.includes('ぜんぶで')){ window.countAskAt = performance.now(); observer.disconnect(); }
    });
    observer.observe(prompt, { childList: true, characterData: true, subtree: true });
  });
  const countIndex = await page.evaluate(() => {
    const index = window.audioStarts.length;
    document.querySelectorAll('#play .obj')[2].click();
    return index;
  });
  await page.waitForFunction(index => window.countAskAt != null && window.audioStarts[index] != null, countIndex);
  const countTiming = await page.evaluate(index => ({ audio: window.audioStarts[index], askedAt: window.countAskAt }), countIndex);
  assert.ok(countTiming.audio.duration > .62, 'the test recording must exercise the former cutoff');
  assert.ok(countTiming.askedAt >= countTiming.audio.startedAt + countTiming.audio.duration * 1000 - 40,
    'the question interrupted the final count: ' + JSON.stringify(countTiming));
  console.log('PASS the final recorded count finishes before the next question is spoken');
  await showSettings(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.voice-settings').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => {
    const box = document.querySelector('.voice-settings').getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth;
  }));
  assert.deepEqual(failures, []);
  console.log('PASS settings fit a narrow screen without browser errors');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (persistentContext) await persistentContext.close();
  if (browser) await browser.close();
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
  server.close();
});
