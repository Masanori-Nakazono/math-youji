/* ===========================================================
   01 — sound & speech
   All effects are synthesised: nothing to download, works offline.
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
    if (c && c.state === 'suspended') c.resume().catch(() => {});
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
    if (c.state === 'suspended') c.resume().catch(() => {});
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
     How natural this sounds is decided by which voice the device has installed,
     not by anything we do here: the bundled "compact" Kyoko is the flat, robotic
     one, while the enhanced / premium download (設定 → アクセシビリティ →
     読み上げコンテンツ → 声) and the Siri voices sound like a person reading.
     So rank the candidates instead of taking the first ja voice, and let the
     parent page override the pick for the device actually in their hands. */
  const VOICE_RANK = [
    [/siri/i,                                     60],
    [/premium|プレミアム/i,                        50],
    [/enhanced|拡張|高品質/i,                       40],
    // Apple's current voice family (Ventura / iOS 16 onward) shares the engine
    // behind Siri, so it phrases a sentence instead of reciting it — it beats the
    // old compact Kyoko even though Kyoko is the name everyone recognises.
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
    const vs = speechSynthesis.getVoices();
    if (!vs || !vs.length) return;
    voicesReady = true;
    jaVoices = vs.filter(v => /^ja(-|_|$)/i.test(v.lang || ''))
                 .sort((a, b) => voiceScore(b) - voiceScore(a));
    jaVoice = (prefVoice && jaVoices.find(v => v.voiceURI === prefVoice || v.name === prefVoice))
           || jaVoices[0] || null;
  }
  if (window.speechSynthesis){
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
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

  let speakTimer = null;
  function say(text, opts){
    if (!voiceOn || !text || !window.speechSynthesis) return;
    const o = opts || {};
    clearTimeout(speakTimer);
    const go = () => {
      try{
        if (!voicesReady) loadVoices();
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(forSpeech(text));
        u.lang  = 'ja-JP';
        if (jaVoice) u.voice = jaVoice;
        // 1.0 is the voice's own recorded prosody; pushing rate or pitch away
        // from it is what made this sound synthetic. Only nudge, never shove.
        u.rate   = o.rate   == null ? 0.95 : o.rate;
        u.pitch  = o.pitch  == null ? 1 : o.pitch;
        u.volume = o.volume == null ? 1 : o.volume;
        speechSynthesis.speak(u);
      }catch(e){}
    };
    // a beat of delay lets the sfx land first and avoids iOS cancel/speak races
    speakTimer = setTimeout(go, o.delay == null ? 90 : o.delay);
  }
  function hush(){
    clearTimeout(speakTimer);
    try{ window.speechSynthesis && speechSynthesis.cancel(); }catch(e){}
  }

  return {
    sfx: S, unlock, say, hush,
    get sfxOn(){ return sfxOn; },  set sfxOn(v){ sfxOn = !!v; },
    get voiceOn(){ return voiceOn; }, set voiceOn(v){ voiceOn = !!v; if (!v) hush(); },
    get hasVoice(){ return !!jaVoice; },
    /** The parent page lists these so a device with a better voice installed can use it. */
    get voices(){ if (!voicesReady) loadVoices(); return jaVoices.slice(); },
    get voiceId(){ return jaVoice ? jaVoice.voiceURI : null; },
    set voiceId(id){ prefVoice = id || null; loadVoices(); }
  };
})();
