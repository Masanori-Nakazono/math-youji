#!/usr/bin/env node
/* Deterministic regression tests for downloaded speech and playback ownership.
   No browser, network, installed voice, generated audio, or npm dependency needed.
   Run with: node tools/test-voices.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const packsSource = fs.readFileSync(path.join(ROOT, 'src/js/00-voice-packs.js'), 'utf8');
const audioSource = fs.readFileSync(path.join(ROOT, 'src/js/01-audio.js'), 'utf8');
const fixture = { voices: ['a', 'b', 'c'].map((name, i) => ({
  id: 'natural:' + name, name: '声' + name, description: 'テスト音声', file: 'voices/' + name + '.pack', bytes: 8,
  clips: { 'こんにちは': [0, 2], 'いっしょにあそぼう': [2, 2], '一つ': [4, 2],
    'こんにちは。今日も一緒に、数を数えよう': [6, 2] }, index: i
})) };
const JAPANESE = { lang: 'ja-JP', name: '日本語の声', voiceURI: 'device-ja', localService: true };
const byteBuffer = (n = 8, first = 1) => { const bytes = new Uint8Array(n); for(let i = 0; i < n; i++) bytes[i] = first + i; return bytes.buffer; };
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = async () => { for(let i = 0; i < 25; i++) await Promise.resolve(); };

class Response {
  constructor(data, opts = {}){ this.data = data.slice(0); this.ok = opts.ok !== false; }
  async arrayBuffer(){ return this.data.slice(0); }
  clone(){ return new Response(this.data, { ok:this.ok }); }
}

// A fetch stream whose chunks and pauses are explicitly controlled by each test.
// Aborting behaves like the browser: the pending reader rejects immediately.
function streamResponse(signal){
  const chunks=[];let waiting=null,closed=false,cancels=0;
  const abort=()=>{if(waiting){waiting.reject(new Error('aborted'));waiting=null;}};
  signal.addEventListener('abort',abort);
  const reader={
    read(){
      if(signal.aborted)return Promise.reject(new Error('aborted'));
      if(chunks.length)return Promise.resolve({done:false,value:chunks.shift()});
      if(closed)return Promise.resolve({done:true});
      waiting=deferred();return waiting.promise;
    },
    cancel(){cancels++;closed=true;signal.removeEventListener('abort',abort);if(waiting){waiting.resolve({done:true});waiting=null;}return Promise.resolve();}
  };
  return {
    response:{ok:true,body:{getReader:()=>reader}},
    write(bytes){assert.equal(closed,false);if(waiting){waiting.resolve({done:false,value:bytes});waiting=null;}else chunks.push(bytes);},
    close(){closed=true;if(waiting){waiting.resolve({done:true});waiting=null;}},
    get cancels(){return cancels;}
  };
}
function environment(options = {}){
  let now = 0, timerId = 0;
  const timers = new Map(), windowEvents = new Map(), speechEvents = new Map();
  const log = { fetch:[], decoded:[], sources:[], spoken:[], canceled:0, resumes:0, cacheReads:0, cacheWrites:0, cacheDeletes:0, events:0 };
  const cacheData = options.cacheData || new Map();
  const cache = {
    async match(url){ log.cacheReads++; if(options.cacheReadError) throw new Error('CacheStorage unavailable'); return cacheData.has(url) ? new Response(cacheData.get(url)) : undefined; },
    async put(url,response){ if(options.cacheWriteError) throw new Error('quota'); log.cacheWrites++; cacheData.set(url, await response.arrayBuffer()); },
    async delete(request){ if(options.cacheDeleteError) throw new Error('cannot delete'); log.cacheDeletes++; return cacheData.delete(typeof request==='string'?request:request.url); },
    async keys(){return [...cacheData.keys()].map(url=>({url}));}
  };
  const setTimer = (fn,delay = 0) => { const id=++timerId; timers.set(id,{fn,at:now + Number(delay)}); return id; };
  const clearTimer = id => timers.delete(id);
  async function advance(ms){
    await flush(); const until = now + ms;
    let guard = 0;
    while(true){
      const entry = [...timers].filter(([,t])=>t.at <= until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!entry) break;
      if(++guard > 1000) throw new Error('Timer did not settle');
      const [id,timer] = entry; timers.delete(id); now=timer.at; timer.fn(); await flush();
    }
    now=until; await flush();
  }
  class AudioContext {
    constructor(){ this.state = options.audioState || 'running'; this.destination={}; this.currentTime=0; this.sampleRate=44100; }
    resume(){ log.resumes++; if(options.resumeError) return Promise.reject(new Error('gesture required')); this.state='running'; return Promise.resolve(); }
    createGain(){ return {gain:{value:1},connect(){},disconnect(){}}; }
    async decodeAudioData(data){
      log.decoded.push([...new Uint8Array(data)]);
      if(options.decodeError) throw new Error('bad codec');
      if(options.decode) return options.decode(data);
      return {duration:.4, bytes:[...new Uint8Array(data)]};
    }
    createBufferSource(){
      if(options.sourceError) throw new Error('audio context lost');
      const source={onended:null,buffer:null,started:false,stopped:false,disconnected:false,
        connect(){},disconnect(){source.disconnected=true;},
        start(){ if(options.startError) throw new Error('start failed'); source.started=true; },
        stop(){source.stopped=true;},end(){if(source.onended) source.onended();}};
      log.sources.push(source); return source;
    }
  }
  class SpeechSynthesisUtterance { constructor(text){ this.text=text; } }
  const speech = {
    voices:options.voices === undefined ? [JAPANESE] : options.voices,
    getVoices(){return this.voices;},
    addEventListener(name,fn){ if(!speechEvents.has(name)) speechEvents.set(name,new Set()); speechEvents.get(name).add(fn); },
    removeEventListener(name,fn){speechEvents.get(name)?.delete(fn);},
    speak(utterance){
      if(options.speakError) throw new Error('speech engine unavailable');
      log.spoken.push(utterance);
    },
    cancel(){log.canceled++;},
    changed(){for(const fn of speechEvents.get('voiceschanged') || []) fn();}
  };
  const window = {
    AudioContext: options.noAudio ? undefined : AudioContext,
    speechSynthesis: options.noSpeech ? undefined : speech,
    caches: options.noCache ? undefined : {open:async()=>cache},
    crypto:options.crypto ? webcrypto : undefined,
    addEventListener(name,fn){if(!windowEvents.has(name)) windowEvents.set(name,new Set()); windowEvents.get(name).add(fn);},
    dispatchEvent(event){log.events++;for(const fn of windowEvents.get(event.type)||[]) fn();}
  };
  const context = vm.createContext({window,location:{protocol:options.protocol||'https:'},document:{baseURI:'https://example.test/app/'},
    URL,Response,AbortController,Event:class Event{constructor(type){this.type=type;}},
    SpeechSynthesisUtterance,speechSynthesis:window.speechSynthesis,caches:window.caches,
    crypto:window.crypto,
    setTimeout:setTimer,clearTimeout:clearTimer,
    fetch:async(url,init)=>{log.fetch.push({url,init}); return options.fetch ? options.fetch(url,init) : new Response(byteBuffer());}
  });
  vm.runInContext(packsSource.replace(/\/\*__VOICE_PACK_MANIFEST__\*\/\s*\{ voices: \[\] \}/, JSON.stringify(options.manifest || fixture)) + '\nglobalThis.VoicePacks = VoicePacks;', context);
  vm.runInContext(audioSource + '\nglobalThis.Sound = Sound;', context);
  const Sound=context.Sound, VoicePacks=context.VoicePacks;
  return {Sound,VoicePacks,advance,log,speech,cacheData,options,
    onVoiceChange:fn=>window.addEventListener('kazu-voices-changed',fn),
    activeSources:()=>log.sources.filter(s=>s.started && !s.stopped),
    realSpoken:()=>log.spoken.filter(u=>u.text.trim()),
    endAudio:async()=>{log.sources.find(s=>s.started && !s.stopped)?.end();await flush();},
    endSpeech:async(error=false)=>{const utterance=log.spoken.findLast(u=>u.text.trim() && (u.onend || u.onerror));const fn=utterance && (error?utterance.onerror:utterance.onend); if(fn)fn();await flush();},
    timers,speechEvents};
}
const tests=[];
function test(name,fn){tests.push({name,fn});}

test('one shared download and decoded phrase reuse',async()=>{
  const held=deferred(), env=environment({fetch:()=>held.promise});
  const a=env.VoicePacks.load('natural:a'), b=env.VoicePacks.load('natural:a');
  assert.equal(a,b); await flush(); assert.equal(env.log.fetch.length,1);
  held.resolve(new Response(byteBuffer())); await a;
  env.Sound.say('こんにちは',{delay:0}); await env.advance(0); await env.endAudio();
  env.Sound.say('こんにちは',{delay:0}); await env.advance(0); await env.endAudio();
  assert.equal(env.log.decoded.length,1); assert.equal(env.log.cacheWrites,1);
});

test('cancel during download settles once and never starts late audio',async()=>{
  const held=deferred(), env=environment({fetch:()=>held.promise}); let ended=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++}); await env.advance(0);
  env.Sound.hush(); assert.equal(ended,1);
  held.resolve(new Response(byteBuffer())); await flush(); await env.advance(5000);
  assert.equal(env.activeSources().length,0);assert.equal(env.realSpoken().length,0);assert.equal(ended,1);
});

test('a newer line owns audio even if the old decode finishes last',async()=>{
  const old=deferred(), env=environment({decode:data=>new Uint8Array(data)[0]===1 ? old.promise : Promise.resolve({duration:.4})});
  let oldEnded=0, newEnded=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>oldEnded++});await env.advance(0);
  env.Sound.say('一つ',{delay:0,onend:()=>newEnded++});await env.advance(0);
  assert.equal(oldEnded,1);assert.equal(env.activeSources().length,1);
  old.resolve({duration:.4});await flush();assert.equal(env.log.sources.length,1);
  await env.endAudio();assert.equal(newEnded,1);
});

test('slow normal download falls back once, without replaying after completion',async()=>{
  const held=deferred(), env=environment({fetch:()=>held.promise});let ended=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++});await env.advance(1800);
  assert.equal(env.realSpoken().length,1);
  held.resolve(new Response(byteBuffer()));await flush();assert.equal(env.log.sources.length,0);
  await env.endSpeech();assert.equal(ended,1);assert.equal(env.Sound.voiceStatus.state,'fallback');
});

test('downloaded pack works offline in a fresh session',async()=>{
  const first=environment();await first.VoicePacks.load('natural:a');
  const offline=environment({cacheData:first.cacheData,fetch:()=>{throw new Error('offline');}});
  offline.Sound.say('こんにちは',{delay:0});await offline.advance(0);
  assert.equal(offline.log.fetch.length,0);assert.equal(offline.activeSources().length,1);
  await offline.endAudio();assert.equal(offline.Sound.voiceStatus.state,'ready');
});

test('corrupt cached data is replaced and invalid network data is rejected',async()=>{
  const url='https://example.test/app/voices/a.pack';
  const env=environment({cacheData:new Map([[url,byteBuffer(2)]])});
  assert.ok(await env.VoicePacks.load('natural:a'));assert.equal(env.log.cacheDeletes,1);assert.equal(env.log.fetch.length,1);
  const bad=environment({fetch:async()=>new Response(byteBuffer(3))});
  assert.equal(await bad.VoicePacks.load('natural:a'),null);assert.equal(bad.VoicePacks.status('natural:a').state,'error');
  assert.equal(bad.cacheData.size,0);
});

test('cache quota failure preserves playback and reports online-only storage',async()=>{
  const env=environment({cacheWriteError:true});
  assert.ok(await env.VoicePacks.load('natural:a'));
  assert.match(env.VoicePacks.status('natural:a').text,/保存できなかった/);
  env.Sound.say('こんにちは',{delay:0});await env.advance(0);assert.equal(env.activeSources().length,1);await env.endAudio();
});

test('failed downloads do not retry on every count; explicit preview retries',async()=>{
  let online=false;const env=environment({fetch:async()=>{if(!online)throw new Error('offline');return new Response(byteBuffer());}});
  assert.equal(await env.VoicePacks.load('natural:a'),null);
  await env.VoicePacks.load('natural:a');await env.VoicePacks.load('natural:a');assert.equal(env.log.fetch.length,1);
  online=true;env.Sound.preview({});await env.advance(60);
  assert.equal(env.log.fetch.length,2);assert.equal(env.activeSources().length,1);await env.endAudio();
});

test('preview works while narration and sound effects are disabled',async()=>{
  const env=environment();env.Sound.voiceOn=false;env.Sound.sfxOn=false;let ended=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++});await env.advance(0);assert.equal(ended,1);assert.equal(env.log.sources.length,0);
  env.Sound.preview({onend:()=>ended++});await env.advance(60);assert.equal(env.activeSources().length,1);
  await env.endAudio();assert.equal(ended,2);assert.equal(env.Sound.voiceOn,false);assert.equal(env.Sound.sfxOn,false);
});

test('missing saved device preference is retained until its voice arrives',async()=>{
  const env=environment();env.Sound.voiceId='later-ja';
  assert.equal(env.Sound.voicePreference,'later-ja');assert.equal(env.Sound.voiceId,'device-ja');assert.equal(env.Sound.voiceStatus.state,'fallback');
  env.Sound.say('こんにちは',{delay:0});await env.advance(0);assert.equal(env.realSpoken()[0].voice.voiceURI,'device-ja');await env.endSpeech();
  env.speech.voices.push({...JAPANESE,name:'あとから読み込んだ声',voiceURI:'later-ja'});env.speech.changed();
  assert.equal(env.Sound.voicePreference,'later-ja');assert.equal(env.Sound.voiceId,'later-ja');
});

test('unrecorded sentences fall back individually and preserve order',async()=>{
  const env=environment();let ended=0;
  env.Sound.say('こんにちは。未収録のなまえ！一つ。',{delay:0,onend:()=>ended++});await env.advance(0);
  assert.equal(env.activeSources().length,1);assert.equal(env.realSpoken().length,0);await env.endAudio();
  assert.equal(env.realSpoken()[0].text,'未収録のなまえ！');await env.endSpeech();
  assert.equal(env.activeSources().length,1);await env.endAudio();assert.equal(ended,1);assert.equal(env.Sound.voiceStatus.state,'fallback');
});

test('decode failures use the device voice and settle exactly once',async()=>{
  const env=environment({decodeError:true});let ended=0,errors=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++,onerror:()=>errors++});await env.advance(0);
  assert.equal(env.realSpoken().length,1);await env.endSpeech();await env.advance(5000);
  assert.equal(ended,1);assert.equal(errors,0);assert.equal(env.Sound.voiceStatus.state,'fallback');
});

test('async device error calls onerror and onend once; stale events cannot repeat',async()=>{
  const env=environment();env.Sound.voiceId='device:auto';let ended=0,errors=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++,onerror:()=>errors++});await env.advance(0);
  const old=env.realSpoken()[0].onerror;await env.endSpeech(true);old();env.Sound.hush();await env.advance(5000);
  assert.equal(errors,1);assert.equal(ended,1);assert.equal(env.Sound.voiceStatus.state,'error');
});

test('speech engine watchdog cannot strand a question or callback',async()=>{
  const env=environment();env.Sound.voiceId='device:auto';let ended=0,errors=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++,onerror:()=>errors++});await env.advance(5000);
  assert.equal(ended,1);assert.equal(errors,1);assert.ok(env.log.canceled>0);
});

test('switching voices cancels current playback, and old onended stays harmless',async()=>{
  const env=environment();let ended=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++});await env.advance(0);
  const source=env.activeSources()[0], stale=source.onended;env.Sound.voiceId='natural:b';
  assert.equal(ended,1);assert.ok(source.stopped);assert.ok(source.disconnected);stale();await flush();assert.equal(ended,1);
  env.Sound.say('こんにちは',{delay:0});await env.advance(0);assert.equal(env.activeSources().length,1);await env.endAudio();
});

test('file URLs use device voices without downloading natural packs',async()=>{
  const env=environment({protocol:'file:'});assert.equal(env.Sound.voiceId,'device-ja');
  env.Sound.say('こんにちは',{delay:0});await env.advance(0);assert.equal(env.log.fetch.length,0);assert.equal(env.realSpoken().length,1);await env.endSpeech();
  env.Sound.voiceId='natural:a';env.Sound.preview({});await env.advance(60);
  assert.equal(env.log.fetch.length,0);assert.equal(env.realSpoken().length,2);await env.endSpeech();assert.equal(env.Sound.voiceStatus.state,'fallback');
});

test('device voice probing waits for late voices and removes its listener',async()=>{
  const env=environment({voices:[]});env.Sound.voiceId='device:auto';
  let result;env.Sound.probeVoice(1200).then(v=>result=v);await env.advance(400);assert.equal(result,undefined);
  env.speech.voices.push(JAPANESE);env.speech.changed();await flush();assert.equal(result,true);
  assert.equal(env.speechEvents.get('voiceschanged').size,1);await env.advance(1200);assert.equal(result,true);
});

test('cache-read rejection still allows a network download',async()=>{
  const env=environment({cacheReadError:true});
  assert.ok(await env.VoicePacks.load('natural:a'));assert.equal(env.log.fetch.length,1);
});

test('audio construction failure falls back without silently claiming success',async()=>{
  const env=environment({sourceError:true});let ended=0,errors=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>ended++,onerror:()=>errors++});await env.advance(0);
  assert.equal(env.realSpoken().length,1);await env.endSpeech();assert.equal(ended,1);assert.equal(errors,0);assert.equal(env.Sound.voiceStatus.state,'fallback');
});

test('only two compressed packs remain in memory; evicted packs use browser cache',async()=>{
  const env=environment();
  for(const id of ['natural:a','natural:b','natural:c']) await env.VoicePacks.load(id);
  assert.equal(env.log.fetch.length,3);const reads=env.log.cacheReads;
  await env.VoicePacks.load('natural:b');assert.equal(env.log.cacheReads,reads);
  await env.VoicePacks.load('natural:a');assert.equal(env.log.cacheReads,reads+1);assert.equal(env.log.fetch.length,3);
});

test('decoded cache evicts older phrases and retains a recently used phrase',async()=>{
  const manifest={voices:[{...fixture.voices[0],bytes:40,
    clips:Object.fromEntries(Array.from({length:20},(_,i)=>['文'+i,[i*2,2]]))}]};
  const env=environment({manifest,fetch:async()=>new Response(byteBuffer(40))});
  const play=async text=>{env.Sound.say(text,{delay:0});await env.advance(0);await env.endAudio();};
  for(let i=0;i<18;i++) await play('文'+i);
  await play('文0');assert.equal(env.log.decoded.length,18);
  await play('文18');await play('文19');assert.equal(env.log.decoded.length,20);
  await play('文0');assert.equal(env.log.decoded.length,20);
  await play('文1');assert.equal(env.log.decoded.length,21);
});

test('checksum detects same-length corruption before any audio is cached',async()=>{
  const sha256=createHash('sha256').update(Buffer.from(byteBuffer())).digest('hex');
  const manifest={voices:[{...fixture.voices[0],sha256}]};
  const bad=environment({manifest,crypto:true,fetch:async()=>new Response(byteBuffer(8,9))});
  assert.equal(await bad.VoicePacks.load('natural:a'),null);assert.equal(bad.cacheData.size,0);assert.equal(bad.VoicePacks.status('natural:a').state,'error');
  const good=environment({manifest,crypto:true});assert.ok(await good.VoicePacks.load('natural:a'));assert.equal(good.log.cacheWrites,1);
});

test('invalid clip ranges fall back without attempting native audio decoding',async()=>{
  const manifest={voices:[{...fixture.voices[0],clips:{'こんにちは':[7,4]}}]};
  const env=environment({manifest});env.Sound.say('こんにちは',{delay:0});await env.advance(0);
  assert.equal(env.log.decoded.length,0);assert.equal(env.realSpoken().length,1);await env.endSpeech();
});

test('a stalled download aborts and preview settles through the device fallback',async()=>{
  const env=environment({fetch:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  let ended=0;env.Sound.preview({onend:()=>ended++});await env.advance(45000);
  assert.equal(env.log.fetch[0].init.signal.aborted,true);assert.equal(env.realSpoken().length,1);
  await env.endSpeech();assert.equal(ended,1);await env.advance(5000);assert.equal(ended,1);
});

test('canceling a delayed line prevents both downloads and playback',async()=>{
  const env=environment();let ended=0;
  env.Sound.say('こんにちは',{delay:900,onend:()=>ended++});env.Sound.hush();await env.advance(10000);
  assert.equal(ended,1);assert.equal(env.log.fetch.length,0);assert.equal(env.log.sources.length,0);assert.equal(env.realSpoken().length,0);
});

test('when both speech paths are unavailable, callbacks finish and expose failure',async()=>{
  const env=environment({noSpeech:true,fetch:async()=>{throw new Error('offline');}});let ended=0,errors=0;
  env.Sound.preview({onend:()=>ended++,onerror:()=>errors++});await env.advance(60);
  assert.equal(ended,1);assert.equal(errors,1);assert.equal(env.Sound.voiceStatus.state,'error');assert.equal(env.Sound.hasVoice,false);
});

test('suspended audio and failed starts use the available device voice',async()=>{
  for(const options of [{audioState:'suspended',resumeError:true},{startError:true}]){
    const env=environment(options);let ended=0;env.Sound.preview({onend:()=>ended++});await env.advance(60);
    assert.equal(env.realSpoken().length,1);await env.endSpeech();assert.equal(ended,1);assert.equal(env.Sound.voiceStatus.state,'fallback');
  }
});

test('normal narration resumes suspended or interrupted audio even with effects off',async()=>{
  for(const audioState of ['suspended','interrupted']){
    const env=environment({audioState});env.Sound.sfxOn=false;let ended=0;
    env.Sound.say('こんにちは',{delay:0,onend:()=>ended++});await env.advance(0);
    assert.equal(env.log.resumes,1);assert.equal(env.activeSources().length,1);assert.equal(env.realSpoken().length,0);
    await env.endAudio();assert.equal(ended,1);assert.equal(env.Sound.sfxOn,false);
  }
});

test('a late error loading the previous voice does not change current voice status',async()=>{
  const old=deferred();const env=environment({fetch:url=>url.endsWith('/a.pack')?old.promise:Promise.resolve(new Response(byteBuffer()))});
  const previous=env.Sound.prepareVoice();await flush();env.Sound.voiceId='natural:b';await env.Sound.prepareVoice();
  assert.equal(env.Sound.voiceStatus.state,'ready');old.reject(new Error('offline'));await previous;
  assert.equal(env.Sound.voicePreference,'natural:b');assert.equal(env.Sound.voiceStatus.state,'ready');
});

test('deleting corrupt cached data can fail without blocking healthy network audio',async()=>{
  const env=environment({cacheData:new Map([['https://example.test/app/voices/a.pack',byteBuffer(2)]]),cacheDeleteError:true});
  assert.ok(await env.VoicePacks.load('natural:a'));assert.equal(env.log.fetch.length,1);
});

test('streamed downloads report chunk progress and cache complete bytes only',async()=>{
  let stream;const env=environment({fetch:async(url,{signal})=>(stream=streamResponse(signal)).response});
  const progress=[];env.onVoiceChange(()=>progress.push(env.VoicePacks.status('natural:a').text));
  const loaded=env.VoicePacks.load('natural:a');await flush();
  for(let i=0;i<4;i++){
    stream.write(Uint8Array.from([i*2+1,i*2+2]));await flush();
    assert.match(env.VoicePacks.status('natural:a').text,new RegExp((i+1)*25+'%'));
    assert.equal(env.log.cacheWrites,0);
  }
  stream.close();const bytes=await loaded;
  assert.deepEqual([...new Uint8Array(bytes)],[1,2,3,4,5,6,7,8]);
  assert.equal(progress.filter(text=>text.includes('%')).length,4);
  assert.equal(env.VoicePacks.status('natural:a').state,'ready');assert.equal(env.log.cacheWrites,1);
  assert.equal(stream.cancels,1);assert.equal(env.timers.size,0);
});

test('a continuously progressing download may take longer than 45 seconds',async()=>{
  let stream;const env=environment({fetch:async(url,{signal})=>(stream=streamResponse(signal)).response});
  const loaded=env.VoicePacks.load('natural:a');await flush();
  for(let i=0;i<4;i++){
    await env.advance(40000);assert.equal(env.log.fetch[0].init.signal.aborted,false);
    stream.write(Uint8Array.from([i*2+1,i*2+2]));await flush();
  }
  stream.close();assert.ok(await loaded);assert.equal(env.log.cacheWrites,1);assert.equal(env.timers.size,0);
});

test('a stream aborts after 45 seconds without a new chunk',async()=>{
  let stream;const env=environment({fetch:async(url,{signal})=>(stream=streamResponse(signal)).response});
  const loaded=env.VoicePacks.load('natural:a');await flush();
  stream.write(Uint8Array.from([1,2]));await flush();
  await env.advance(44999);assert.equal(env.log.fetch[0].init.signal.aborted,false);
  await env.advance(1);assert.equal(env.log.fetch[0].init.signal.aborted,true);assert.equal(await loaded,null);
  assert.equal(env.VoicePacks.status('natural:a').state,'error');assert.equal(env.log.cacheWrites,0);
  assert.equal(stream.cancels,1);assert.equal(env.timers.size,0);
});

test('the five-minute overall deadline bounds an endlessly progressing stream',async()=>{
  let stream;const manifest={voices:[{...fixture.voices[0],bytes:16}]};
  const env=environment({manifest,fetch:async(url,{signal})=>(stream=streamResponse(signal)).response});
  const loaded=env.VoicePacks.load('natural:a');await flush();
  for(let i=0;i<7;i++){
    await env.advance(40000);stream.write(Uint8Array.from([i+1]));await flush();
    assert.equal(env.log.fetch[0].init.signal.aborted,false);
  }
  await env.advance(20000);assert.equal(env.log.fetch[0].init.signal.aborted,true);assert.equal(await loaded,null);
  assert.equal(env.log.cacheWrites,0);assert.equal(stream.cancels,1);assert.equal(env.timers.size,0);
});

test('oversized and truncated streams never enter persistent audio storage',async()=>{
  for(const length of [9,3]){
    let stream;const env=environment({fetch:async(url,{signal})=>(stream=streamResponse(signal)).response});
    const loaded=env.VoicePacks.load('natural:a');await flush();
    stream.write(new Uint8Array(length));await flush();if(length<8)stream.close();
    assert.equal(await loaded,null);assert.equal(env.VoicePacks.status('natural:a').state,'error');
    assert.equal(env.log.cacheWrites,0);assert.equal(stream.cancels,1);assert.equal(env.timers.size,0);
  }
});

test('successful replacement prunes only obsolete versions of the same voice',async()=>{
  const prefix='https://example.test/app/voices/';
  const manifest={voices:[{...fixture.voices[0],id:'nemo-a',file:'voices/nemo-a-new.bin'}]};
  const entries=[prefix+'nemo-a-old.bin',prefix+'nemo-b-old.bin',prefix+'unrelated.bin',
    'https://example.test/another-app/voices/nemo-a-old.bin'];
  const env=environment({manifest,cacheData:new Map(entries.map(url=>[url,byteBuffer()]))});
  assert.ok(await env.VoicePacks.load('nemo-a'));
  assert.equal(env.cacheData.has(entries[0]),false);
  assert.equal(env.cacheData.has(entries[1]),true);assert.equal(env.cacheData.has(entries[2]),true);
  assert.equal(env.cacheData.has(entries[3]),true);
  assert.equal(env.cacheData.has(prefix+'nemo-a-new.bin'),true);assert.equal(env.log.cacheDeletes,1);
  const full=environment({manifest,cacheWriteError:true,cacheData:new Map([[entries[0],byteBuffer()]])});
  assert.ok(await full.VoicePacks.load('nemo-a'));assert.equal(full.cacheData.has(entries[0]),true);assert.equal(full.log.cacheDeletes,0);
});

test('afterSpeech is immediate when narration is already idle or muted',async()=>{
  const env=environment();let ready=0;env.Sound.afterSpeech(()=>ready++);assert.equal(ready,1);
  env.Sound.voiceOn=false;env.Sound.say('こんにちは');env.Sound.afterSpeech(()=>ready++);assert.equal(ready,2);
});

test('afterSpeech waits for delayed speech and for a replacement line',async()=>{
  const env=environment();let ready=0;
  env.Sound.say('こんにちは',{delay:300});env.Sound.afterSpeech(()=>ready++);
  await env.advance(299);assert.equal(ready,0);
  env.Sound.say('一つ',{delay:100});await env.advance(100);assert.equal(ready,0);
  assert.equal(env.activeSources().length,1);await env.endAudio();assert.equal(ready,1);
  env.Sound.hush();await flush();assert.equal(ready,1);
});

test('afterSpeech survives cancel-and-replace in one stack and settles on plain cancel',async()=>{
  const held=deferred(),env=environment({fetch:()=>held.promise});let ready=0;
  env.Sound.say('こんにちは',{delay:0});await env.advance(0);env.Sound.afterSpeech(()=>ready++);
  env.Sound.hush();env.Sound.say('一つ',{delay:0});await env.advance(0);assert.equal(ready,0);
  env.Sound.hush();await flush();assert.equal(ready,1);
  held.resolve(new Response(byteBuffer()));await flush();assert.equal(ready,1);assert.equal(env.activeSources().length,0);
});

test('afterSpeech subscriptions can be canceled before silence',async()=>{
  const env=environment();let ready=0;
  env.Sound.say('こんにちは',{delay:0});const cancel=env.Sound.afterSpeech(()=>ready++);
  cancel();cancel();await env.advance(0);await env.endAudio();assert.equal(ready,0);
});

test('afterSpeech waits when the speech completion callback starts another line',async()=>{
  const env=environment();let ready=0;
  env.Sound.say('こんにちは',{delay:0,onend:()=>env.Sound.say('一つ',{delay:0})});env.Sound.afterSpeech(()=>ready++);
  await env.advance(0);await env.endAudio();assert.equal(ready,0);await env.advance(0);assert.equal(env.activeSources().length,1);
  await env.endAudio();assert.equal(ready,1);
});

test('one idle callback starting narration postpones the remaining idle callbacks',async()=>{
  const env=environment();let advanced=0;
  env.Sound.say('こんにちは',{delay:0});
  env.Sound.afterSpeech(()=>env.Sound.say('一つ',{delay:0}));
  env.Sound.afterSpeech(()=>advanced++);
  await env.advance(0);await env.endAudio();assert.equal(advanced,0);
  await env.advance(0);assert.equal(env.activeSources().length,1);await env.endAudio();assert.equal(advanced,1);
});

test('unsubscribing a later idle callback during dispatch prevents it from running',async()=>{
  const env=environment();let advanced=0,cancel;
  env.Sound.say('こんにちは',{delay:0});env.Sound.afterSpeech(()=>cancel());cancel=env.Sound.afterSpeech(()=>advanced++);
  await env.advance(0);await env.endAudio();assert.equal(advanced,0);
});

(async()=>{
  let failed=0;
  for(const {name,fn} of tests){
    try{await fn();console.log('PASS '+name);}
    catch(error){failed++;console.error('FAIL '+name+'\n  '+error.stack.replace(/\n/g,'\n  '));}
  }
  console.log('\n'+(tests.length-failed)+'/'+tests.length+' voice tests passed');
  process.exitCode=failed?1:0;
})();
