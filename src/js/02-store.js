/* ===========================================================
   02 — progress storage (per-device, localStorage; degrades to memory)
   =========================================================== */
'use strict';

const Store = (() => {
  const KEY = 'kazu-no-bouken.v1';
  const blank = () => ({
    stars: {},        // "gameId:levelIndex" -> 0..3
    plays: {},        // "gameId:levelIndex" -> attempts
    seen:  {},        // gameId -> total questions answered
    firstTry: {},     // gameId -> [correctFirstTry, total]
    stickers: [],     // earned sticker keys
    daily: {},        // "YYYY-MM-DD" -> questions done
    practice: [0, 0],   // [firstTryRight, total] across きょうの れんしゅう
    name: '',
    sfx: true, voice: true,
    createdAt: Date.now()
  });

  let mem = blank(), ok = true;

  try{
    const raw = localStorage.getItem(KEY);
    if (raw) mem = Object.assign(blank(), JSON.parse(raw));
  }catch(e){ ok = false; }

  let pending = null;
  function writeNow(){
    if (!ok) return;
    clearTimeout(pending); pending = null;
    try{ localStorage.setItem(KEY, JSON.stringify(mem)); }
    catch(e){ ok = false; }          // quota, private mode, or a file:// origin
  }
  function save(){
    if (!ok) return;
    clearTimeout(pending);
    pending = setTimeout(writeNow, 120);
  }
  // the app is usually closed straight after finishing a level; don't lose that write
  addEventListener('pagehide', writeNow);
  addEventListener('visibilitychange', () => { if (document.hidden) writeNow(); });

  const key = (g, l) => g + ':' + l;
  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  return {
    get data(){ return mem; },
    /** false when this device/origin cannot persist — the parent page says so. */
    get persists(){ return ok; },
    todayKey,
    flush: writeNow,
    stars: (g, l) => mem.stars[key(g, l)] || 0,
    gameStars(g, levels){
      let s = 0; for (let i = 0; i < levels; i++) s += mem.stars[key(g, i)] || 0; return s;
    },
    totalStars(){ let s = 0; for (const k in mem.stars) s += mem.stars[k]; return s; },
    levelUnlocked(g, l){ return l === 0 || (mem.stars[key(g, l - 1)] || 0) >= 1; },

    recordLevel(g, l, stars, right, total){
      const k = key(g, l);
      mem.stars[k] = Math.max(mem.stars[k] || 0, stars);
      mem.plays[k] = (mem.plays[k] || 0) + 1;
      mem.seen[g]  = (mem.seen[g] || 0) + total;
      const ft = mem.firstTry[g] || [0, 0];
      mem.firstTry[g] = [ft[0] + right, ft[1] + total];
      const t = todayKey();
      mem.daily[t] = (mem.daily[t] || 0) + total;
      save();
    },
    recordPractice(right, total){
      const t = todayKey();
      mem.daily[t] = (mem.daily[t] || 0) + total;
      const p = mem.practice || (mem.practice = [0, 0]);
      p[0] += right; p[1] += total;
      save();
    },
    practiceAccuracy(){
      const p = mem.practice;
      return (p && p[1]) ? p[0] / p[1] : null;
    },
    todayCount(){ return mem.daily[todayKey()] || 0; },
    streak(){
      let n = 0; const d = new Date();
      for (;;){
        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if ((mem.daily[k] || 0) > 0) n++; else break;
        d.setDate(d.getDate() - 1);
        if (n > 400) break;
      }
      return n;
    },
    accuracy(g){
      const ft = mem.firstTry[g];
      if (!ft || !ft[1]) return null;
      return ft[0] / ft[1];
    },
    addSticker(k){
      if (mem.stickers.indexOf(k) < 0){ mem.stickers.push(k); save(); return true; }
      return false;
    },
    hasSticker: k => mem.stickers.indexOf(k) >= 0,
    setPref(k, v){ mem[k] = v; save(); },
    reset(){ mem = blank(); save(); }
  };
})();
