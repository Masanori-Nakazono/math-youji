/* ===========================================================
   01 — sound & speech
   Effects are synthesised locally. Natural speech uses optional cached audio packs.
   =========================================================== */
'use strict';

const Sound = (() => {
  let ctx = null, master = null;
  let sfxOn = true, voiceOn = true;
  let jaVoice = null, jaVoices = [], voicesReady = false;
  let prefVoice = null;

  function ensure(){
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try{
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
    }catch(e){ ctx = null; }
    return ctx;
  }

  /** Must run inside a user gesture (iOS). */
  function unlock(){
    const c = ensure();
    if (c && (c.state === 'suspended' || c.state === 'interrupted')) c.resume().catch(() => {});
    if (voiceOn) prepareVoice();
    // prime the speech engine with an empty-ish utterance
    if (window.speechSynthesis){
      try{
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0; u.lang = 'ja-JP';
        speechSynthesis.speak(u);
      }catch(e){}
      loadVoices();
    }
  }

  function tone(freq, t0, dur, type, gain, glideTo){
    const c = ensure(); if (!c || !sfxOn) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain == null ? .5 : gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + .02);
  }

  function seq(notes, type, step, gain){
    const c = ensure(); if (!c || !sfxOn) return;
    if (c.state === 'suspended' || c.state === 'interrupted') c.resume().catch(() => {});
    const t0 = c.currentTime + .01, st = step || .09;
    notes.forEach((f, i) => tone(f, t0 + i * st, st * 1.9, type || 'triangle', gain));
  }

  function noiseBurst(dur, gain){
    const c = ensure(); if (!c || !sfxOn) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = .8;
    const g = c.createGain(); g.gain.value = gain == null ? .25 : gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const PENT = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093];

  const S = {
    tap()      { seq([720], 'sine', .05, .35); },
    place()    { seq([420, 620], 'sine', .05, .4); },
    count(i)   { seq([PENT[Math.min(i, PENT.length - 1)]], 'triangle', .07, .42); },
    correct()  { seq([659.25, 830.61, 987.77, 1318.5], 'triangle', .075, .45); },
    wrong()    { seq([311.13, 261.63], 'sine', .13, .32); },
    star(i)    { seq([1046.5 + i * 180, 1568 + i * 200, 2093 + i * 240], 'triangle', .07, .3); noiseBurst(.25, .12); },
    finish()   { seq([523.25, 659.25, 783.99, 1046.5, 1318.5, 1046.5, 1318.5], 'triangle', .1, .42); },
    unlockSfx(){ seq([523.25, 783.99], 'triangle', .1, .35); },
    swoosh()   { noiseBurst(.18, .1); }
  };

  /* ---------- speech ----------
     Voice names do not reliably identify the installed quality tier. Prefer
     explicitly marked enhanced/natural voices, and let parents compare them. */
  const VOICE_RANK = [
    [/siri/i,                                     60],
    [/premium|プレミアム/i,                        50],
    [/enhanced|拡張|高品質/i,                       40],
    [/^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b/i, 30],
    [/^(sandy|flo)\b/i,                            4],  // warmest of that family for a 5-year-old
    [/neural|natural|wavenet|google|microsoft/i,   25],
    [/kyoko|o-?ren|nanami|ayumi|haruka|mizuki/i,   10],
    [/otoya|hattori|ichiro|keita/i,                 5]
  ];
  function voiceScore(v){
    const n = (v.name || '') + ' ' + (v.voiceURI || '');
    let s = v.localService ? 8 : 0;   // offline-first, but never over a much better voice
    for (const [re, w] of VOICE_RANK) if (re.test(n)) s += w;
    return s;
  }

  function loadVoices(){
    if (!window.speechSynthesis) return;
    let vs;
    try{ vs = speechSynthesis.getVoices(); }catch(e){ return; }
    if (!vs) return;
    voicesReady = vs.length > 0;
    jaVoices = vs.filter(v => /^ja(-|_|$)/i.test(v.lang || ''))
                 .sort((a, b) => voiceScore(b) - voiceScore(a));
    jaVoice = (prefVoice && jaVoices.find(v => v.voiceURI === prefVoice || v.name === prefVoice))
           || jaVoices[0] || null;
  }
  if (window.speechSynthesis){
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', () => { loadVoices(); VoicePacks.notify(); });
  }

  /** iOS may populate voices asynchronously after the first user gesture. */
  function probeVoice(timeout){
    if (!voiceOn) return Promise.resolve(false);
    if (naturalVoice() && VoicePacks.supported() && VoicePacks.status(naturalVoice().id).state !== 'error') return Promise.resolve(true);
    if (!window.speechSynthesis) return Promise.resolve(false);
    loadVoices();
    if (jaVoice) return Promise.resolve(true);
    return new Promise(resolve => {
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try{ speechSynthesis.removeEventListener('voiceschanged', changed); }catch(e){}
        resolve(!!ok);
      };
      const changed = () => { loadVoices(); if (jaVoice) finish(true); };
      const timer = setTimeout(() => { loadVoices(); finish(!!jaVoice); },
        timeout == null ? 1200 : timeout);
      try{ speechSynthesis.addEventListener('voiceschanged', changed); }catch(e){}
    });
  }

  /* Japanese TTS decides its phrasing and pitch accent by parsing the sentence,
     and a space inside a sentence breaks that parse — the reason the same line
     can come out either flat or lively. The prompts are written with kanji and
     punctuation for the engine's benefit; this strips any stray spacing left
     between Japanese characters. */
  const JA = /[\u3000-\u30FF\u3400-\u9FFF\uFF00-\uFF9F]/;
  function forSpeech(text){
    return String(text)
      .replace(/[ \u3000]+/g, ' ')
      .replace(/(.) (?=(.))/g, (m, a, b) => JA.test(a) && JA.test(b) ? a : m)
      .trim();
  }

  function naturalVoice(){
    if (prefVoice) return VoicePacks.get(prefVoice);
    return VoicePacks.supported() ? VoicePacks.get((VoicePacks.voices[0] || {}).id) : null;
  }
  function prepareVoice(retry){
    const v = naturalVoice();
    return v ? VoicePacks.load(v.id, retry).then(Boolean) : Promise.resolve(!!jaVoice);
  }
  let playbackStatus = null;
  function report(state, text){ playbackStatus = { state, text }; VoicePacks.notify(); }
  function voiceStatus(){
    const v = naturalVoice();
    if (v){
      const state = VoicePacks.status(v.id);
      return state.state === 'ready' && playbackStatus ? playbackStatus : state;
    }
    if (prefVoice && prefVoice !== 'device:auto' && !jaVoices.some(v => v.voiceURI === prefVoice || v.name === prefVoice)){
      return { state: 'fallback', text: '選んだ声はこの端末で見つかりません。利用できる端末の声で読み上げます。選択はそのまま保存しています。' };
    }
    return playbackStatus || { state: jaVoice ? 'ready' : 'fallback', text: jaVoice
      ? '端末の声「' + jaVoice.name + '」で読み上げます。'
      : '日本語の音声が見つかりません。自然な声を選ぶか、端末に日本語音声を追加してください。' };
  }

  // A single cancellable owner covers the delay, download, decoding, each
  // sentence, and onend. A late async result can never speak on the next screen.
  let current = null;
  const idleWaiters = new Set();
  let idleCheck = false;
  function notifyIdle(){
    if (idleCheck) return;
    idleCheck = true;
    // say() replaces the old owner in the same stack. Do not mistake that
    // cancellation for silence and interrupt a replacement introduction.
    Promise.resolve().then(() => {
      idleCheck = false;
      if (current) return;
      for (const fn of Array.from(idleWaiters)){
        // A callback can begin another sentence or unsubscribe a later waiter.
        // Keep those remaining callbacks until the new narration has ended.
        if (current) break;
        if (idleWaiters.delete(fn)) try{ fn(); }catch(e){}
      }
    });
  }
  function afterSpeech(fn){
    if (!current){ try{ fn(); }catch(e){} return () => {}; }
    idleWaiters.add(fn);
    return () => idleWaiters.delete(fn);
  }
  const sayMs = (t, rate) => 700 + t.length * 250 / (rate || 1);
  function finish(job){
    if (job.done) return;
    job.done = true;
    clearTimeout(job.timer);
    if (job.stop){ const stop = job.stop; job.stop = null; stop(); }
    if (current === job) current = null;
    if (job.opts.onend) try{ job.opts.onend(); }catch(e){}
    notifyIdle();
  }
  function hush(){
    const old = current;
    current = null;
    if (old) finish(old);
    try{ if (window.speechSynthesis) speechSynthesis.cancel(); }catch(e){}
    notifyIdle();
  }
  const live = job => current === job && !job.done;

  function deviceLine(job, text){
    return new Promise(resolve => {
      if (!live(job) || !window.speechSynthesis){ resolve(false); return; }
      let u = null, timer = null, settled = false;
      const end = ok => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (u){ u.onend = u.onerror = null; }
        job.utterance = null; job.stop = null;
        resolve(ok);
      };
      job.stop = () => { end(false); try{ speechSynthesis.cancel(); }catch(e){} };
      try{
        loadVoices();
        u = new SpeechSynthesisUtterance(text);
        job.utterance = u; // keep alive: some engines otherwise drop onend
        u.lang = 'ja-JP';
        if (jaVoice) u.voice = jaVoice;
        u.rate = job.opts.rate == null ? .95 : job.opts.rate;
        u.pitch = job.opts.pitch == null ? 1 : job.opts.pitch;
        u.volume = job.opts.volume == null ? 1 : job.opts.volume;
        u.onend = () => end(true);
        u.onerror = () => end(false);
        timer = setTimeout(() => { end(false); try{ speechSynthesis.cancel(); }catch(e){} }, sayMs(text, u.rate));
        speechSynthesis.speak(u);
      }catch(e){ end(false); }
    });
  }

  function recordedLine(job, audio, context){
    return new Promise(resolve => {
      if (!live(job) || context.state !== 'running'){ resolve(false); return; }
      let source = null, gain = null;
      let timer = null, settled = false;
      const end = ok => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (source){
          source.onended = null;
          try{ source.stop(); }catch(e){}
          try{ source.disconnect(); }catch(e){}
        }
        if (gain) try{ gain.disconnect(); }catch(e){}
        job.stop = null;
        resolve(ok);
      };
      job.stop = () => end(false);
      try{
        source = context.createBufferSource(); gain = context.createGain();
        source.buffer = audio;
        // Keep the recorded intonation and pitch intact. This gain is separate
        // from the effects, so switching effects off never mutes narration.
        gain.gain.value = job.opts.volume == null ? 1 : Math.max(0, Math.min(1, job.opts.volume));
        source.connect(gain); gain.connect(context.destination);
        source.onended = () => end(true);
        timer = setTimeout(() => end(false), audio.duration * 1000 + 1500);
        source.start();
      }catch(e){ end(false); }
    });
  }

  async function speak(job, text){
    const v = naturalVoice(), context = v && ensure();
    const parts = v && !VoicePacks.has(v.id, text) ? VoicePacks.sentences(text) : [text];
    let missing = false, failed = false;
    for (const part of parts){
      if (!live(job)) return;
      let heard = false;
      if (v && context && VoicePacks.supported() && VoicePacks.has(v.id, part)){
        // A slow first download must not hold a question's timing open forever.
        // Preview can wait for the full download; normal play uses the device
        // voice for this line while the download continues in the background.
        let timer;
        const waitMs = job.opts.preview ? 310000 : 1800;
        const audio = await Promise.race([
          VoicePacks.decode(v.id, part, context),
          new Promise(resolve => { timer = setTimeout(() => resolve(null), waitMs); })
        ]).finally(() => clearTimeout(timer));
        if (!live(job)) return;
        if (audio) heard = await recordedLine(job, audio, context);
      }
      if (!live(job)) return;
      if (!heard){
        missing = !!v;
        heard = await deviceLine(job, part);
      }
      if (!live(job)) return;
      if (!heard) failed = true;
    }
    if (!live(job)) return;
    if (failed){
      report('error', '読み上げできない文がありました。「試しに聴く」を押して音声を確認してください。');
      if (job.opts.onerror) try{ job.opts.onerror(); }catch(e){}
    } else if (missing){
      report('fallback', '名前や未収録の文、自然な声を読み込めないときは、端末の声で読み上げます。');
    }
    finish(job);
  }

  function say(text, opts){
    const o = opts || {};
    hush();
    if ((!voiceOn && !o.preview) || !text){
      if (o.onend) try{ o.onend(); }catch(e){}
      return;
    }
    const job = { opts: o, done: false, timer: null, stop: null, utterance: null };
    current = job;
    playbackStatus = null;
    // Safari may suspend an already-unlocked context when the app backgrounds.
    // Request resumption here, while a tap may still supply user activation.
    if (naturalVoice()){
      const c = ensure();
      if (c && (c.state === 'suspended' || c.state === 'interrupted')) c.resume().catch(() => {});
    }
    job.timer = setTimeout(() => {
      if (live(job)) speak(job, forSpeech(text)).catch(() => {
        if (live(job)){
          report('error', '音声を再生できませんでした。もう一度「試しに聴く」を押してください。');
          if (o.onerror) try{ o.onerror(); }catch(e){}
          finish(job);
        }
      });
    }, o.delay == null ? 90 : o.delay);
  }
  function preview(opts){
    unlock();
    prepareVoice(true);
    say('こんにちは。今日も一緒に、数を数えよう！', { ...opts, preview: true, delay: 60 });
  }

  return {
    sfx: S, unlock, say, hush, probeVoice, preview, prepareVoice, afterSpeech,
    get sfxOn(){ return sfxOn; },  set sfxOn(v){ sfxOn = !!v; },
    get voiceOn(){ return voiceOn; }, set voiceOn(v){ voiceOn = !!v; if (!v) hush(); VoicePacks.notify(); },
    get hasVoice(){ return !!jaVoice || !!(naturalVoice() && VoicePacks.supported() && VoicePacks.status(naturalVoice().id).state !== 'error'); },
    /** The parent page lists these so a device with a better voice installed can use it. */
    get voices(){ if (!voicesReady) loadVoices(); return jaVoices.slice(); },
    get naturalVoices(){ return VoicePacks.voices; },
    get voicePreference(){ return prefVoice; },
    get voiceStatus(){ return voiceStatus(); },
    get voiceId(){ const v = naturalVoice(); return v ? v.id : jaVoice ? jaVoice.voiceURI : null; },
    set voiceId(id){ hush(); prefVoice = id || null; playbackStatus = null; loadVoices(); VoicePacks.notify(); }
  };
})();
