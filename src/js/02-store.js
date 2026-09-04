/* ===========================================================
   02 — progress storage (per-device, localStorage; degrades to memory)
   =========================================================== */
'use strict';

/* What「考えずに言える」means in milliseconds for the number facts in けいさんの やま.
   Under FAST the answer arrived; over SLOW it was worked out — almost always by
   counting. Between the two it is on its way. These are deliberately generous:
   the point is to tell retrieval from counting, not to run a race. */
const FLUENT_FAST_MS = 3000, FLUENT_SLOW_MS = 9000;

const Store = (() => {
  const KEY = 'kazu-no-bouken.v1';
  const blank = () => ({
    stars: {},        // "gameId:levelIndex" -> 0..3
    plays: {},        // "gameId:levelIndex" -> attempts
    seen:  {},        // gameId -> total questions answered
    firstTry: {},     // gameId -> [correctFirstTry, total] (lifetime)
    /* Per-game aggregates can only ever say "this game is shaky". These two say
       *what* is shaky and *when* — which is what lets the app come back to the
       exact fact the child missed, and lets the parent page name it. */
    facts: {},        // item key -> [asked, firstTryRight, lastDayNumber, label, "gameId:levelIndex", typicalMs]
    recent: {},       // "gameId:levelIndex" -> last 30 first-try outcomes, "1011…"
    last:  {},        // "gameId:levelIndex" -> day number last played
    swift: {},        // "gameId:levelIndex" -> 1 when cleared without counting
    stickers: [],     // earned sticker keys
    daily: {},        // "YYYY-MM-DD" -> questions done
    practice: [0, 0],   // [firstTryRight, total] across きょうの れんしゅう
    diagnostic: null, // { completedDay, outcomes, recommended }
    missions: {},     // "YYYY-MM-DD" -> { id, gameId, text, prompt, done, reviewed }
    name: '',
    sfx: true, voice: true, voiceId: null,
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
  /* Whole-day resolution keeps six months of daily use small enough for
     localStorage, and days are the only unit the scheduling actually needs. */
  const DAY = 86400000;
  const dayNo = () => Math.floor(Date.now() / DAY);
  const todayKey = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ---- backup ----------------------------------------------------------
     localStorage is scoped to one origin and one browser, so the same app on a
     different URL (or after clearing site data) starts empty. Export/import is
     the only thing that makes six months of records actually portable. */
  const FILE_TAG = 'kazu-no-bouken';

  function exportText(){
    return JSON.stringify({ app: FILE_TAG, v: 1, savedAt: new Date().toISOString(), data: mem }, null, 2);
  }

  const maxNum = (a, b) => Math.max(a || 0, b || 0);
  function mergeInto(base, add){
    const out = Object.assign(blank(), base);
    ['stars', 'plays', 'seen', 'daily', 'swift'].forEach(k => {
      const src = add[k] || {};
      out[k] = Object.assign({}, base[k] || {});
      // max, never sum: importing the same backup twice must not inflate anything
      for (const id in src) out[k][id] = maxNum(out[k][id], src[id]);
    });
    out.firstTry = Object.assign({}, base.firstTry || {});
    const af = add.firstTry || {};
    for (const g in af){
      const cur = out.firstTry[g];
      if (!cur || (af[g][1] || 0) > (cur[1] || 0)) out.firstTry[g] = af[g].slice();
    }
    // facts: keep the record that has been practised more; never sum
    out.facts = Object.assign({}, base.facts || {});
    const af2 = add.facts || {};
    for (const k in af2){
      const cur = out.facts[k];
      if (!cur || (af2[k][0] || 0) > (cur[0] || 0)) out.facts[k] = af2[k].slice();
      else if (cur){
        cur[2] = maxNum(cur[2], af2[k][2]);
        if (!cur[4] && af2[k][4]) cur[4] = af2[k][4];   // keep whichever side knows where to ask it
      }
    }
    // recent / last: follow whichever side actually played that level more
    out.recent = Object.assign({}, base.recent || {});
    out.last   = Object.assign({}, base.last || {});
    for (const k in (add.recent || {})){
      if ((add.plays && add.plays[k] || 0) > (base.plays && base.plays[k] || 0)) out.recent[k] = add.recent[k];
    }
    for (const k in (add.last || {})) out.last[k] = maxNum(out.last[k], add.last[k]);
    out.stickers = Array.from(new Set((base.stickers || []).concat(add.stickers || [])));
    const bp = base.practice || [0, 0], ap = add.practice || [0, 0];
    out.practice = (ap[1] || 0) > (bp[1] || 0) ? ap.slice() : bp.slice();
    const bd = base.diagnostic, ad = add.diagnostic;
    out.diagnostic = !bd ? ad : !ad ? bd
      : ((ad.completedDay || 0) > (bd.completedDay || 0) ? ad : bd);
    out.missions = Object.assign({}, base.missions || {});
    for (const d in (add.missions || {})){
      const cur = out.missions[d], incoming = add.missions[d];
      if (!cur) out.missions[d] = Object.assign({}, incoming);
      else if (cur.id === incoming.id) out.missions[d] = Object.assign({}, cur, incoming, {
        done: !!(cur.done || incoming.done),
        reviewed: !!(cur.reviewed || incoming.reviewed)
      });
      else {
        // A catalog update can assign a different mission to the same date.
        // Keep one actual record intact; never transfer completion to other text.
        const score = m => (m.reviewed ? 4 : 0) + (m.done ? 2 : 0) + (m.doneDay || 0) / 1e9;
        out.missions[d] = Object.assign({}, score(incoming) > score(cur) ? incoming : cur);
      }
    }
    out.createdAt = Math.min(base.createdAt || Date.now(), add.createdAt || Date.now());
    return out;
  }

  /** mode: 'merge' (default, never loses or inflates) or 'replace' */
  function importText(text, mode){
    let parsed;
    try{ parsed = JSON.parse(text); }
    catch(e){ return { ok: false, msg: 'ファイルの中身を読み取れませんでした。' }; }
    const data = (parsed && parsed.app === FILE_TAG && parsed.data) ? parsed.data
               : (parsed && parsed.stars) ? parsed        // a bare data object is fine too
               : null;
    if (!data || typeof data !== 'object') return { ok: false, msg: 'このファイルは かずのぼうけん の記録ではないようです。' };
    const before = Object.keys(mem.stars || {}).length;
    mem = mode === 'replace' ? Object.assign(blank(), data) : mergeInto(mem, data);
    writeNow();
    const after = Object.keys(mem.stars || {}).length;
    return { ok: true, msg: `読み込みました（★のついたレベル ${before} → ${after}、シール ${mem.stickers.length} 枚）`,
             savedAt: parsed.savedAt || null };
  }

  /** How much this fact is owed a turn: 0 (fresh and solid) … ~2 (missed, or long unseen).
      A fact that has never been asked scores 1, so nothing is starved at the start. */
  function dueOf(k){
    const f = mem.facts[k];
    if (!f || !f[0]) return 1;
    const acc = f[1] / f[0];
    const age = Math.min(30, dayNo() - f[2]);
    /* Right but slow is not the same as known. Right-first-time cannot tell a child
       who remembers「10は4と6」from one who counted the six empty cells for nine
       seconds, and only the first of those makes a carry sum fast. */
    const slow = f[5] ? clamp((f[5] - FLUENT_FAST_MS) / (FLUENT_SLOW_MS - FLUENT_FAST_MS), 0, 1) : 0;
    return (1 - acc) * 1.6 + (age / 30) * 0.6 + (f[0] < 3 ? 0.25 : 0) + slow * 0.5;
  }

  /** The facts this child keeps missing, worst first.
      Only facts they have actually met and actually got wrong: 集中練習 is practice,
      not first contact, and one slip is not a gap. */
  function weakFacts(limit){
    const out = [];
    for (const k in mem.facts){
      const f = mem.facts[k];
      if (!f || !f[0] || !f[4]) continue;        // never asked, or nowhere to ask it again
      const missed = f[0] - f[1];
      // right every time but still being counted out: the case a percentage cannot show
      const slow = f[5] >= FLUENT_SLOW_MS;
      if (missed < 1 && !slow) continue;
      if (!slow && f[1] / f[0] >= 0.8 && missed < 2) continue;   // one slip on a solid fact
      out.push({ key: k, label: f[3] || k, at: f[4], due: dueOf(k), missed, ms: f[5] || null, slow });
    }
    out.sort((a, b) => b.due - a.due || b.missed - a.missed);
    return limit ? out.slice(0, limit) : out;
  }

  return {
    get data(){ return mem; },
    /** false when this device/origin cannot persist — the parent page says so. */
    get persists(){ return ok; },
    get origin(){ return location.origin === 'null' ? 'file://' : location.origin; },
    exportText, importText,
    todayKey,
    flush: writeNow,
    stars: (g, l) => mem.stars[key(g, l)] || 0,
    gameStars(g, levels){
      let s = 0; for (let i = 0; i < levels; i++) s += mem.stars[key(g, i)] || 0; return s;
    },
    totalStars(){ let s = 0; for (const k in mem.stars) s += mem.stars[k]; return s; },
    plays: (g, l) => mem.plays[key(g, l)] || 0,
    /* A pass opens the next level. Three honest attempts also open it: a five-year-old
       must never end up staring at a padlock they cannot move, and the parent page
       shows the low score either way. */
    levelUnlocked(g, l){
      if (l === 0) return true;
      const k = key(g, l - 1);
      return (mem.stars[k] || 0) >= 1 || (mem.plays[k] || 0) >= 3;
    },

    /** One question's first-try result, attributed to the level it came from.
        Recorded per question rather than per level so that a question met inside
        きょうの れんしゅう counts towards that level's recent form too. */
    noteOutcome(g, l, ok){
      const k = key(g, l);
      mem.recent[k] = ((mem.recent[k] || '') + (ok ? '1' : '0')).slice(-30);
      mem.last[k] = dayNo();
      save();
    },

    recordLevel(g, l, stars, right, total){
      const k = key(g, l);
      mem.stars[k] = Math.max(mem.stars[k] || 0, stars);
      mem.plays[k] = (mem.plays[k] || 0) + 1;
      mem.last[k]  = dayNo();
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
    /* 集中練習 counts towards today's total, but not towards the「きょうの れんしゅう」
       accuracy the parent page reports — that number names one specific set. */
    recordFocus(right, total){
      const t = todayKey();
      mem.daily[t] = (mem.daily[t] || 0) + total;
      save();
    },
    recordDiagnostic(outcomes, recommended){
      mem.diagnostic = {
        completedDay: dayNo(),
        outcomes: (outcomes || []).map(x => ({
          gameId: x.gameId, levelIndex: x.levelIndex || 0, clean: !!x.clean
        })),
        recommended: recommended || null
      };
      save();
    },
    recordMission(mission){
      if (!mission || !mission.day) return;
      mem.missions[mission.day] = Object.assign({}, mission, { done: false, reviewed: false });
      save();
    },
    completeMission(day){
      const m = mem.missions[day];
      if (!m) return false;
      m.done = true;
      m.doneDay = dayNo();
      save();
      return true;
    },
    reviewMission(day){
      const m = mem.missions[day];
      if (!m) return false;
      m.reviewed = true;
      save();
      return true;
    },
    mission: day => mem.missions[day] || null,
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

    /* ---- item-level memory ---- */
    noteFact(k, firstTryOk, label, from, ms){
      if (!k) return;
      const f = mem.facts[k] || (mem.facts[k] = [0, 0, 0]);
      f[0]++;
      if (firstTryOk) f[1]++;
      f[2] = dayNo();
      if (label) f[3] = label;      // so the parent page can say「3と7」, not「ten:3」
      /* Where this fact can be asked again. Without it the app can name a weak fact
         and still have no way to bring it back: the item key says which game, never
         which level. */
      if (from) f[4] = from;
      /* How long the answer took, kept only where speed is the goal and only for
         clean answers — a wrong answer times a guess. A single interrupted question
         (the iPad put down mid-problem) is clamped rather than dropped, so it cannot
         decide the average on its own. */
      if (ms > 0){
        const capped = Math.min(ms, 20000);
        f[5] = f[5] ? Math.round(f[5] * 0.65 + capped * 0.35) : capped;
      }
      save();
    },
    fact: k => mem.facts[k] || null,
    factOrigin(k){ const f = mem.facts[k]; return f && f[4] || null; },
    factSpeed(k){ const f = mem.facts[k]; return f && f[5] || null; },
    /** Typical time to answer this game's facts, in ms — null until something has
        been timed. Median across facts, so one bad question does not move it. */
    gameSpeed(g){
      const xs = [];
      for (const k in mem.facts){
        if (k.indexOf(g + ':') !== 0) continue;
        const f = mem.facts[k];
        if (f && f[5]) xs.push(f[5]);
      }
      if (!xs.length) return null;
      xs.sort((a, b) => a - b);
      return xs[Math.floor(xs.length / 2)];
    },
    /** Cleared with every answer right first time *and* without counting. */
    recordSwift(g, l){ mem.swift[key(g, l)] = 1; save(); },
    isSwift: (g, l) => !!mem.swift[key(g, l)],
    factDue: dueOf,
    weakFacts,

    /* ---- recent (windowed) performance ----
       A lifetime average cannot show that a child recovered, and it cannot show
       that a child has just started slipping. Both are what a parent needs. */
    recentAccuracy(g, l){
      const s = mem.recent[key(g, l)];
      if (!s) return null;
      let r = 0;
      for (let i = 0; i < s.length; i++) if (s[i] === '1') r++;
      return s.length ? r / s.length : null;
    },
    /** how many outcomes the recent window actually holds — a percentage over one
        question must never be presented as a judgement about a child */
    recentCount(g, l){ return (mem.recent[key(g, l)] || '').length; },
    gameRecentAccuracy(g, levels){
      let r = 0, n = 0;
      for (let i = 0; i < levels; i++){
        const s = mem.recent[key(g, i)] || '';
        for (let j = 0; j < s.length; j++){ n++; if (s[j] === '1') r++; }
      }
      return n ? r / n : null;
    },
    /** days since this level was last played; large when never played */
    daysSince(g, l){
      const d = mem.last[key(g, l)];
      return d ? Math.max(0, dayNo() - d) : 99;
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
