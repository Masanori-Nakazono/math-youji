/* Natural Japanese voices, generated ahead of time with VOICEVOX Nemo.
   Only static audio leaves the server; no child's text or record is uploaded.
   build.sh replaces the manifest marker from src/voices/manifest.json. */
'use strict';

const VoicePacks = (() => {
  const manifest = /*__VOICE_PACK_MANIFEST__*/ { voices: [] };
  const CACHE = 'kazu-natural-voices-v1';
  const states = new Map(), pending = new Map(), buffers = new Map();
  const decoded = new Map();
  const supported = () => /^https?:$/.test(location.protocol)
    && !!(window.AudioContext || window.webkitAudioContext);
  const key = text => String(text).replace(/\s+/g, '').replace(/[。！？!?]+$/g, '');
  const sentences = text => String(text).match(/[^。！？!?]+[。！？!?]*/g) || [];
  const get = id => manifest.voices.find(v => v.id === id) || null;
  const notify = () => window.dispatchEvent(new Event('kazu-voices-changed'));
  function state(id, value){ states.set(id, value); notify(); }
  function status(id){
    if (!supported()) return { state: 'fallback', text: '自然な声は公開サイトで使えます。この開き方では端末の声で読み上げます。' };
    return states.get(id) || { state: 'idle', text: '初めて使う声は音声データを読み込みます。' };
  }

  async function valid(data, voice){
    if (data.byteLength !== voice.bytes) return false;
    if (window.crypto && crypto.subtle && voice.sha256){
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      if (hex !== voice.sha256) return false;
    }
    return true;
  }

  function load(id, retry){
    const voice = get(id);
    if (!voice || !supported()) return Promise.resolve(null);
    if (buffers.has(id)) return Promise.resolve(buffers.get(id));
    if (pending.has(id)) return pending.get(id);
    // A failed download must not be retried for every count tapped by a child.
    if (!retry && status(id).state === 'error') return Promise.resolve(null);
    state(id, { state: 'loading', text: '自然な声を読み込み中です…（約' + Math.ceil(voice.bytes / 1048576) + ' MB）' });
    const job = (async () => {
      const url = new URL(voice.file, document.baseURI).href;
      let cache = null, data = null, saved = false;
      try{
        try{ if (window.caches) cache = await caches.open(CACHE); }catch(e){}
        if (cache){
          try{
            const hit = await cache.match(url);
            if (hit){
              data = await hit.arrayBuffer();
              if (await valid(data, voice)) saved = true;
              else { data = null; await cache.delete(url); }
            }
          }catch(e){ data = null; saved = false; }
        }
        if (!data){
          const abort = new AbortController();
          let timeout = setTimeout(() => abort.abort(), 45000);
          const deadline = setTimeout(() => abort.abort(), 300000);
          try{
            const response = await fetch(url, { signal: abort.signal, cache: 'no-cache' });
            if (!response.ok) throw new Error('voice download failed');
            if (response.body && response.body.getReader){
              const reader = response.body.getReader(), bytes = new Uint8Array(voice.bytes);
              let count = 0, lastPercent = -1;
              try{
                for (;;){
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (count + value.byteLength > voice.bytes) throw new Error('oversized voice pack');
                  bytes.set(value, count); count += value.byteLength;
                  clearTimeout(timeout);
                  timeout = setTimeout(() => abort.abort(), 45000);
                  const percent = Math.floor(count * 100 / voice.bytes);
                  if (percent !== lastPercent){
                    lastPercent = percent;
                    state(id, { state: 'loading', text: '自然な声を読み込み中です… ' + percent + '%（約'
                      + Math.ceil(voice.bytes / 1048576) + ' MB）' });
                  }
                }
                if (count !== voice.bytes) throw new Error('incomplete voice pack');
                data = bytes.buffer;
              } finally { reader.cancel().catch(() => {}); }
            } else data = await response.arrayBuffer();
            if (!await valid(data, voice)) throw new Error('incomplete voice pack');
          } finally { clearTimeout(timeout); clearTimeout(deadline); }
          if (cache){
            try{
              await cache.put(url, new Response(data, { headers: { 'Content-Type': 'application/octet-stream' } }));
              saved = true;
              const old = await cache.keys();
              const directory = new URL('.', url).href;
              await Promise.all(old.filter(r => r.url !== url && r.url.startsWith(directory)
                && new URL(r.url).pathname.split('/').pop().startsWith(voice.id + '-'))
                .map(r => cache.delete(r)));
            }catch(e){}
          }
        }
        // Keep at most two compressed packs in memory; all downloaded voices
        // remain in CacheStorage and can be reloaded without the network.
        if (buffers.size >= 2) buffers.delete(buffers.keys().next().value);
        buffers.set(id, data);
        state(id, { state: 'ready', text: saved
          ? '準備できました。この声はオフラインでも使えます。'
          : '準備できました。端末に保存できなかったため、次回は通信が必要です。' });
        return data;
      }catch(e){
        state(id, { state: 'error', text: '音声を読み込めませんでした。端末の声で読み上げます。通信を確認して「試しに聴く」で再試行できます。' });
        return null;
      }
    })().finally(() => pending.delete(id));
    pending.set(id, job);
    return job;
  }

  function has(id, text){ const v = get(id); return !!(v && Object.prototype.hasOwnProperty.call(v.clips, key(text))); }
  async function decode(id, text, context){
    const v = get(id), k = key(text), cacheKey = id + ':' + k;
    if (!v || !has(id, text)) return null;
    if (decoded.has(cacheKey)){
      const value = decoded.get(cacheKey); decoded.delete(cacheKey); decoded.set(cacheKey, value);
      return value;
    }
    const data = await load(id);
    if (!data) return null;
    const [offset, length] = v.clips[k];
    if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0 || offset + length > data.byteLength) return null;
    try{
      // Each slice is an entire MP3, including its own header, not an arbitrary
      // fragment of a long recording. Safari can decode it independently.
      const audio = await context.decodeAudioData(data.slice(offset, offset + length));
      if (decoded.size >= 18) decoded.delete(decoded.keys().next().value);
      decoded.set(cacheKey, audio);
      return audio;
    }catch(e){ return null; }
  }
  return { get, load, decode, has, key, sentences, status, notify, supported,
    get voices(){ return manifest.voices.map(({ clips, ...v }) => v); } };
})();
