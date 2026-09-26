/* ===========================================================
   02 — progress storage (per-device, localStorage; degrades to memory)
   =========================================================== */
'use strict';

/* What「考えずに言える」means in milliseconds for the number facts in けいさんの やま.
   Under FAST the answer arrived; over SLOW it was worked out — almost always by
   counting. Between the two it is on its way. These are deliberately generous:
   the point is to tell retrieval from counting, not to run a race. */
const FLUENT_FAST_MS = 3000, FLUENT_SLOW_MS = 9000;
const TREASURE_WORLDS = ['shima', 'umi', 'yama', 'mori', 'kyoshitsu'];

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
    /* facts: item key -> [asked, firstTryRight, lastDayNumber, label,
                           "gameId:levelIndex", typicalMs, {missKind: count}]
       The last slot is *what kind* of wrong it was. Right/wrong is one bit and it
       cannot separate a child who read back the part they could see from one who
       was a single count out — see 06-miss.js. */
    facts: {},
    factRecent: {},  // item key -> last 12 first-try outcomes; recovered facts can graduate
    recent: {},       // "gameId:levelIndex" -> last 30 first-try outcomes, "1011…"
    last:  {},        // "gameId:levelIndex" -> day number last played
    swift: {},        // "gameId:levelIndex" -> 1 when cleared without counting
    /* "gameId:levelIndex" -> 1 once the hand has shown this level's method and the
       child has done one alongside it. Until then, opening the level starts with
       those two questions instead of a test. */
    intro: {},
    /* Observed progress only; seeing a method and solving alone stay distinct. */
    milestones: {},  // "game:level:kind" -> {day, label of an actual question}
    /* "gameId:levelIndex" -> [clearDay, lastCheckDay, failedChecks]. A clear below
       ★★★ goes on the shelf provisionally: eight questions at 4 right is a pass that
       random tapping reaches on a three-choice level about one time in four. It is
       confirmed by two of three right on another day (or by clearing it again on
       another day, or by ★★★). The door and おすすめ count confirmed clears. */
    pending: {},
    stickers: [],     // earned sticker keys
    treasures: [],    // world IDs whose chest was opened; separate from stickers
    daily: {},        // "YYYY-MM-DD" -> questions done
    practice: [0, 0],   // [firstTryRight, total] across きょうの れんしゅう
    diagnostic: null, // { completedDay, outcomes, recommended }
    orientation: false,
    missions: {},     // "YYYY-MM-DD" -> { id, gameId, text, prompt, done, reviewed }
    /* A child can put the stickers they earned somewhere of their own.  This is
       deliberately presentation-only: moving a rabbit around must not be able to
       change a learning record or an unlock.  Coordinates are percentages so the
       picture survives an iPad rotation and a different-sized iPad. */
    stickerWorld: { background: 'meadow', items: {} },
    islandJobs: {}, // boat/snack -> current hands-on work and a lasting completed scene
    name: '',
    sfx: true, voice: true, voiceId: null,
    /* The 小1 world opens by itself when every sticker is on the shelf. This flag is
       the parent's override: a child who is ready but cannot get ★★★ on とけい must
       not be held behind a padlock they cannot move — the same reason a level opens
       after three honest attempts. Once true it stays true. */
    g1Open: false,
    /* Set by the app the first time every 入学前 level is cleared. The door is
       worked out from the shelf, and a release that adds a 入学前 level would
       otherwise shut it again on a child who had already gone through. */
    g1Reached: false,
    /* Day number of the last export. Six months of records live in one localStorage
       key on a device whose OS is documented to throw them away, and the only
       defence — 書き出す — sat behind an adult gate that nobody had a reason to open.
       Nothing here backs anything up by itself; it just knows when to ask. */
    backupAt: 0,
    /* The April the child starts school. Guessed from the first day of use and
       overridable, because「入学までの半年」is the premise of the whole app and until
       now the app had no idea when that was: the roadmap on the parent page was
       fixed prose that could not say which month this child is actually in. */
    schoolYear: 0,
    createdAt: Date.now()
  });

  /* Three different failures, kept apart because each needs a different sentence
     on the parent page:
       avail      — can this page use localStorage at all (blocked site data,
                    some file:// origins). Nothing is written.
       ok         — did the last write land. A full disk is not permanent, so the
                    next save tries again instead of giving up for good.
       unreadable — there was a record and it would not parse. It used to switch
                    saving off for ever on that device, and「消す」and「読み込む」
                    reported success while writing nothing. Now the bytes are set
                    aside under their own key and a fresh record starts. */
  let mem = blank(), avail = true, ok = true, unreadable = false;
  const ASIDE = KEY + '.unreadable';

  try{
    const raw = localStorage.getItem(KEY);
    if (raw){
      let parsed = null;
      try{ parsed = JSON.parse(raw); }catch(e){}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
        mem = Object.assign(blank(), parsed);
        /* It parsed, but a field can still have the wrong shape — `stickers` that is
           not a list stopped Home from drawing at all, so the app never opened and
           the record could not even be written out. A field like that goes back to
           empty, and the whole record as it was is kept aside first. (The full
           check in normalizeData needs 06-miss.js, which has not loaded yet here.) */
        const fresh = blank();
        const shape = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
        let bent = false;
        for (const k of Object.keys(fresh)){
          const want = shape(fresh[k]), got = shape(mem[k]);
          if (want === got) continue;
          if ((k === 'diagnostic' && got === 'object') || (k === 'voiceId' && got === 'string')) continue;
          mem[k] = fresh[k];
          bent = true;
        }
        if (bent){ try{ localStorage.setItem(ASIDE, raw); }catch(e){} }
      } else {
        unreadable = true;
        // if the copy cannot be made, the original is the only one: leave it be
        try{ localStorage.setItem(ASIDE, raw); }catch(e){ avail = false; }
      }
    }
  }catch(e){ avail = false; }

  let pending = null;
  function writeNow(){
    if (!avail) return;
    clearTimeout(pending); pending = null;
    try{ localStorage.setItem(KEY, JSON.stringify(mem)); ok = true; }
    catch(e){ ok = false; }          // quota or private mode: the next save tries again
  }
  function save(){
    if (!avail) return;
    clearTimeout(pending);
    pending = setTimeout(writeNow, 120);
  }
  // the app is usually closed straight after finishing a level; don't lose that write
  addEventListener('pagehide', writeNow);
  addEventListener('visibilitychange', () => { if (document.hidden) writeNow(); });

  const key = (g, l) => g + ':' + l;
  const MILESTONE_TEXT = {
    viewed: 'やりかたを みたね',
    together: 'いっしょに こたえたね',
    supported: 'ヒントを つかって こたえたね',
    revised: 'もういちど ためして こたえたね',
    independent: 'ひとりで こたえたね'
  };
  const MILESTONE_RANK = { viewed: 0, together: 1, supported: 2, revised: 3, independent: 4 };
  /* Whole-day resolution keeps six months of daily use small enough for
     localStorage, and days are the only unit the scheduling actually needs. */
  const DAY = 86400000;
  /* The local calendar day, not the UTC one. Counted in UTC, a day in Japan ended at
     9 in the morning: a backup written at 8:30 was「1日前」by 9:30, and every
     「何日ふれていない」and the pace to 入学 were a day out for half of each morning. */
  const dayOf = ms => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60000) / DAY);
  const dayNo = () => dayOf(Date.now());
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

  const isRecord = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isCount = v => Number.isFinite(v) && v >= 0;
  const safeKey = k => k !== '__proto__' && k !== 'prototype' && k !== 'constructor';
  /** {missKind: count} — a small tally, and every key has to be one we know */
  const isMissMap = v => isRecord(v) && Object.keys(v).every(
    k => safeKey(k) && MISS_KINDS[k] && isCount(v[k]));

  /** Validate into a fresh object before touching the live record. Older backups
      may omit newer fields, but a field that is present must have the shape the
      rest of Store expects. */
  function normalizeData(data){
    if (!isRecord(data)) return null;
    const out = blank();
    const copyMap = (name, valid) => {
      if (data[name] == null) return data[name] === undefined;
      if (!isRecord(data[name])) return false;
      const next = {};
      for (const k of Object.keys(data[name])){
        if (!safeKey(k) || !valid(data[name][k])) return false;
        next[k] = data[name][k];
      }
      out[name] = next;
      return true;
    };

    if (!copyMap('stars', v => isCount(v) && v <= 3)
     || !copyMap('plays', isCount)
     || !copyMap('seen', isCount)
     || !copyMap('daily', isCount)
     || !copyMap('last', isCount)
     || !copyMap('swift', v => v === 0 || v === 1)
     || !copyMap('intro', v => v === 1)
     || !copyMap('milestones', v => isRecord(v) && isCount(v.day)
          && typeof v.label === 'string' && v.label.length <= 80)
     || !copyMap('pending', v => Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every(isCount))
     || !copyMap('recent', v => typeof v === 'string' && /^[01]{0,30}$/.test(v))
     || !copyMap('firstTry', v => Array.isArray(v) && v.length >= 2
          && isCount(v[0]) && isCount(v[1]) && v[0] <= v[1])
     || !copyMap('facts', v => Array.isArray(v) && v.length >= 3
          && isCount(v[0]) && isCount(v[1]) && v[1] <= v[0] && isCount(v[2])
          && (v[3] == null || typeof v[3] === 'string')
          && (v[4] == null || typeof v[4] === 'string')
          && (v[5] == null || isCount(v[5]))
          && (v[6] == null || isMissMap(v[6])))) return null;
    for (const k of Object.keys(out.milestones))
      if (!/^[a-z0-9]+:\d+:(viewed|together|supported|revised|independent)$/.test(k)) return null;

    if (data.stickers !== undefined){
      if (!Array.isArray(data.stickers) || data.stickers.some(v => typeof v !== 'string')) return null;
      out.stickers = Array.from(new Set(data.stickers));
    }
    if (data.treasures !== undefined){
      if (!Array.isArray(data.treasures) || data.treasures.some(id => !TREASURE_WORLDS.includes(id))) return null;
      out.treasures = Array.from(new Set(data.treasures));
    }
    if (data.practice !== undefined){
      if (!Array.isArray(data.practice) || data.practice.length < 2
       || !isCount(data.practice[0]) || !isCount(data.practice[1])
       || data.practice[0] > data.practice[1]) return null;
      out.practice = data.practice.slice(0, 2);
    }
    if (data.diagnostic !== undefined && data.diagnostic !== null){
      const d = data.diagnostic;
      if (!isRecord(d) || !isCount(d.completedDay)
       || !Array.isArray(d.outcomes)
       || d.outcomes.some(x => !isRecord(x) || typeof x.gameId !== 'string'
          || !isCount(x.levelIndex) || typeof x.clean !== 'boolean')
       || (d.recommended != null && (!isRecord(d.recommended)
          || typeof d.recommended.gameId !== 'string'
          || !isCount(d.recommended.levelIndex)))) return null;
      out.diagnostic = {
        completedDay: d.completedDay,
        outcomes: d.outcomes.map(x => ({
          gameId: x.gameId, levelIndex: x.levelIndex, clean: x.clean
        })),
        recommended: d.recommended == null ? null : {
          gameId: d.recommended.gameId, levelIndex: d.recommended.levelIndex
        }
      };
    }
    if (data.missions !== undefined){
      if (!isRecord(data.missions)) return null;
      out.missions = {};
      for (const day of Object.keys(data.missions)){
        const m = data.missions[day];
        if (!safeKey(day) || !isRecord(m)
         || typeof m.day !== 'string' || typeof m.id !== 'string'
         || typeof m.gameId !== 'string' || typeof m.text !== 'string'
         || typeof m.prompt !== 'string'
         || (m.done !== undefined && typeof m.done !== 'boolean')
         || (m.reviewed !== undefined && typeof m.reviewed !== 'boolean')
         || (m.doneDay !== undefined && !isCount(m.doneDay))) return null;
        out.missions[day] = {
          day: m.day, id: m.id, gameId: m.gameId, text: m.text, prompt: m.prompt,
          done: !!m.done, reviewed: !!m.reviewed
        };
        if (m.doneDay !== undefined) out.missions[day].doneDay = m.doneDay;
      }
    }
    if (data.stickerWorld !== undefined){
      const w = data.stickerWorld;
      if (!isRecord(w) || typeof w.background !== 'string' || !isRecord(w.items)) return null;
      const items = {};
      for (const k of Object.keys(w.items)){
        const p = w.items[k];
        if (!safeKey(k) || !isRecord(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y)
         || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
        items[k] = { x: p.x, y: p.y };
      }
      out.stickerWorld = { background: w.background.slice(0, 24), items };
    }
    if (data.islandJobs !== undefined){
      if (!isRecord(data.islandJobs)) return null;
      out.islandJobs = {};
      for (const scene of Object.keys(data.islandJobs)){
        const j = data.islandJobs[scene];
        if (!['boat', 'snack'].includes(scene) || !isRecord(j)
          || ![5, 10].includes(j.size) || !Number.isInteger(j.start) || j.start < 1 || j.start >= j.size
          || !Number.isInteger(j.placed) || j.placed < 0 || j.placed > j.size - j.start
          || typeof j.done !== 'boolean' || typeof j.completed !== 'boolean'
          || (j.done && (j.placed !== j.size - j.start || !j.completed))) return null;
        out.islandJobs[scene] = { size: j.size, start: j.start, placed: j.placed,
          done: j.done, completed: j.completed };
      }
    }
    if (data.name !== undefined){
      if (typeof data.name !== 'string') return null;
      out.name = data.name.slice(0, 12);
    }
    for (const k of ['sfx', 'voice', 'g1Open', 'g1Reached']){
      if (data[k] !== undefined){
        if (typeof data[k] !== 'boolean') return null;
        out[k] = data[k];
      }
    }
    if (data.voiceId !== undefined){
      if (data.voiceId !== null && typeof data.voiceId !== 'string') return null;
      out.voiceId = data.voiceId;
    }
    for (const k of ['backupAt', 'schoolYear', 'createdAt']){
      if (data[k] !== undefined){
        if (!isCount(data[k])) return null;
        out[k] = data[k];
      }
    }
    return out;
  }

  const maxNum = (a, b) => Math.max(a || 0, b || 0);
  function mergeInto(base, add){
    const out = Object.assign(blank(), base);
    ['stars', 'plays', 'seen', 'daily', 'swift', 'intro'].forEach(k => {
      const src = add[k] || {};
      out[k] = Object.assign({}, base[k] || {});
      // max, never sum: importing the same backup twice must not inflate anything
      for (const id in src) out[k][id] = maxNum(out[k][id], src[id]);
    });
    out.milestones = Object.assign({}, add.milestones || {}, base.milestones || {});
    for (const k of Object.keys(add.milestones || {})){
      const a = add.milestones[k], b = base.milestones && base.milestones[k];
      if (!b || a.day < b.day) out.milestones[k] = Object.assign({}, a);
    }
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
      const mine = (base.facts && base.facts[k] && base.facts[k][6]) || null;
      const theirs = af2[k][6] || null;
      if (!cur || (af2[k][0] || 0) > (cur[0] || 0)) out.facts[k] = af2[k].slice();
      else if (cur){
        cur[2] = maxNum(cur[2], af2[k][2]);
        if (!cur[4] && af2[k][4]) cur[4] = af2[k][4];   // keep whichever side knows where to ask it
      }
      // miss tallies: max per kind, never sum — the same rule the rest of the
      // merge follows, so importing one backup twice cannot invent mistakes
      if (mine || theirs){
        const m = {};
        if (mine) for (const t in mine) m[t] = mine[t];
        if (theirs) for (const t in theirs) m[t] = maxNum(m[t], theirs[t]);
        out.facts[k] = out.facts[k].slice();
        out.facts[k][6] = m;
      }
    }
    /* recent / last: follow whichever side actually played that level more, and on
       a tie the side that met it last. `plays` only counts whole levels, so a level
       met only inside きょうの れんしゅう or とっくん is 0 on both sides — and a strict
       「more」 dropped its record even when this device had none at all. */
    out.recent = Object.assign({}, base.recent || {});
    out.last   = Object.assign({}, base.last || {});
    for (const k in (add.recent || {})){
      const ap = (add.plays && add.plays[k]) || 0, bp = (base.plays && base.plays[k]) || 0;
      const newer = ((add.last && add.last[k]) || 0) > ((base.last && base.last[k]) || 0);
      if (!(k in out.recent) || ap > bp || (ap === bp && newer)) out.recent[k] = add.recent[k];
    }
    for (const k in (add.last || {})) out.last[k] = maxNum(out.last[k], add.last[k]);
    out.stickers = Array.from(new Set((base.stickers || []).concat(add.stickers || [])));
    out.treasures = Array.from(new Set((base.treasures || []).concat(add.treasures || [])));
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
    /* provisional clears: confirmed on either device (on that shelf, not waiting)
       stays confirmed; otherwise keep the earliest clear and the latest check */
    out.pending = {};
    const bpend = base.pending || {}, apend = add.pending || {};
    const shelved = (rec, k) => (rec.stickers || []).indexOf(k) >= 0;
    new Set(Object.keys(bpend).concat(Object.keys(apend))).forEach(k => {
      if ((shelved(base, k) && !bpend[k]) || (shelved(add, k) && !apend[k])) return;
      const x = bpend[k], y = apend[k];
      if (!x || !y){ out.pending[k] = (x || y).slice(0, 3); return; }
      out.pending[k] = [Math.min(x[0], y[0]), Math.max(x[1], y[1]), Math.max(x[2], y[2])];
    });
    // a stage that has been opened on either device stays open
    out.g1Open = !!(base.g1Open || add.g1Open);
    out.g1Reached = !!(base.g1Reached || add.g1Reached);
    out.backupAt = maxNum(base.backupAt, add.backupAt);
    out.schoolYear = base.schoolYear || add.schoolYear || 0;
    out.name = base.name || add.name || '';
    /* A layout is personal rather than cumulative.  Keep every sticker placement
       from either copy; when the same sticker was moved on both devices, preserve
       this device's current position rather than silently jumping it elsewhere. */
    const bw = base.stickerWorld || { background: 'meadow', items: {} };
    const aw = add.stickerWorld || { background: 'meadow', items: {} };
    out.stickerWorld = {
      background: bw.background || aw.background || 'meadow',
      items: Object.assign({}, aw.items || {}, bw.items || {})
    };
    out.islandJobs = Object.assign({}, add.islandJobs || {}, base.islandJobs || {});
    for (const scene of ['boat', 'snack']){
      const a = add.islandJobs && add.islandJobs[scene], b = base.islandJobs && base.islandJobs[scene];
      if (a || b) out.islandJobs[scene] = Object.assign({}, b || a, {
        completed: !!((a && a.completed) || (b && b.completed))
      });
    }
    out.createdAt = Math.min(base.createdAt || Date.now(), add.createdAt || Date.now());
    return out;
  }

  /** mode: 'merge' (default, never loses or inflates) or 'replace' */
  function importText(text, mode){
    if (typeof text !== 'string' || text.length > 2 * 1024 * 1024){
      return { ok: false, msg: 'ファイルが大きすぎるか、読み取れない形式です。' };
    }
    let parsed;
    try{ parsed = JSON.parse(text); }
    catch(e){ return { ok: false, msg: 'ファイルの中身を読み取れませんでした。' }; }
    const data = (parsed && parsed.app === FILE_TAG && parsed.data) ? parsed.data
               : (parsed && isRecord(parsed.stars)) ? parsed // a bare data object is fine too
               : null;
    const normalized = normalizeData(data);
    if (!normalized) return { ok: false, msg: '記録の形式がこわれているため、読み込みませんでした。' };
    const before = Object.keys(mem.stars || {}).length;
    const next = mode === 'replace' ? normalized : mergeInto(mem, normalized);
    mem = next;
    writeNow();
    const after = Object.keys(mem.stars || {}).length;
    const summary = `（★のついたレベル ${before} → ${after}、シール ${mem.stickers.length} 枚）`;
    // the record is in use either way; say plainly when it will not outlive the app
    if (!(avail && ok)){
      return { ok: true, saved: false, savedAt: parsed.savedAt || null,
               msg: '読み込みましたが、この端末に保存できませんでした' + summary
                  + '。アプリを閉じると元に戻ります。' };
    }
    return { ok: true, saved: true, msg: '読み込みました' + summary, savedAt: parsed.savedAt || null };
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
      const recent = (mem.factRecent && mem.factRecent[k]) || '';
      const recentRight = recent.split('').filter(x => x === '1').length;
      const recovered = recent.length >= 6 && recentRight / recent.length >= .85;
      // right every time but still being counted out: the case a percentage cannot show
      const slow = f[5] >= FLUENT_SLOW_MS;
      if ((missed < 1 || recovered) && !slow) continue;
      if (!slow && f[1] / f[0] >= 0.8 && missed < 2) continue;   // one slip on a solid fact
      out.push({ key: k, label: f[3] || k, at: f[4], due: dueOf(k), missed, ms: f[5] || null, slow });
    }
    out.sort((a, b) => b.due - a.due || b.missed - a.missed);
    return limit ? out.slice(0, limit) : out;
  }

  return {
    get data(){ return mem; },
    /** false when this device/origin cannot persist — the parent page says so. */
    get persists(){ return avail && ok; },
    /** why not: 'ok' | 'unavailable' (no storage for this page) | 'failed' (a write did not land) */
    get storage(){ return !avail ? 'unavailable' : ok ? 'ok' : 'failed'; },
    /** the record on this device would not parse; its bytes were kept aside */
    get unreadable(){ return unreadable; },
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
    /* ---- My sticker world -------------------------------------------------- */
    hasTreasure: worldId => mem.treasures.includes(worldId),
    claimTreasure(worldId){
      if (!TREASURE_WORLDS.includes(worldId) || this.hasTreasure(worldId)) return false;
      const games = Games.list.filter(g => g.world === worldId);
      if (!games.length || !games.every(g => g.levels.every((lv, i) => this.hasSticker(g.id + ':' + i + ':g')))) return false;
      mem.treasures.push(worldId);
      save();
      return true;
    },
    stickerWorld(){
      const w = mem.stickerWorld || (mem.stickerWorld = { background: 'meadow', items: {} });
      return { background: w.background, items: Object.assign({}, w.items) };
    },
    setStickerWorldBackground(background){
      const w = mem.stickerWorld || (mem.stickerWorld = { background: 'meadow', items: {} });
      w.background = String(background || 'meadow').slice(0, 24);
      save();
    },
    putWorldSticker(stickerKey, x, y){
      if (typeof stickerKey !== 'string') return false;
      const owned = stickerKey.startsWith('treasure:')
        ? this.hasTreasure(stickerKey.slice(9)) : this.hasSticker(stickerKey);
      if (!owned) return false;
      const w = mem.stickerWorld || (mem.stickerWorld = { background: 'meadow', items: {} });
      w.items[stickerKey] = { x: clamp(Number(x) || 0, 0, 100), y: clamp(Number(y) || 0, 0, 100) };
      save();
      return true;
    },
    removeWorldSticker(stickerKey){
      const w = mem.stickerWorld;
      if (!w || !w.items || !w.items[stickerKey]) return false;
      delete w.items[stickerKey];
      save();
      return true;
    },
    islandJob(scene){ return (mem.islandJobs || {})[scene] || null; },
    startIslandJob(scene, fresh){
      if (!['boat', 'snack'].includes(scene)) return null;
      const jobs = mem.islandJobs || (mem.islandJobs = {});
      if (jobs[scene] && !fresh) return jobs[scene];
      const size = this.stars('bond', 0) >= 1 ? 10 : 5;
      const prior = jobs[scene];
      const start = size === 10 ? (prior && prior.start === 7 ? 6 : 7)
        : (prior && prior.start === 3 ? 2 : 3);
      jobs[scene] = { size, start, placed: 0, done: false, completed: !!(prior && prior.completed) };
      save(); return jobs[scene];
    },
    addIslandJobPiece(scene){
      const j = this.islandJob(scene);
      if (!j || j.done || j.placed >= j.size - j.start) return false;
      j.placed++; save(); return true;
    },
    finishIslandJob(scene){
      const j = this.islandJob(scene);
      if (!j || j.placed !== j.size - j.start) return false;
      j.done = true; j.completed = true; save(); return true;
    },
    practiceAccuracy(){
      const p = mem.practice;
      return (p && p[1]) ? p[0] / p[1] : null;
    },
    todayCount(){ return mem.daily[todayKey()] || 0; },
    /** Questions answered today that no grade counts — the lesson and check questions.
        They took the child's time, so「きょうは ここまで」has to count them too. */
    countToday(n){
      if (!(n > 0)) return;
      const t = todayKey();
      mem.daily[t] = (mem.daily[t] || 0) + n;
      save();
    },
    /** calendar days this app has actually been used on — how much there is to lose */
    usedDays(){ return Object.keys(mem.daily || {}).length; },
    /** calendar days since the app was first opened on this device */
    daysSinceStart(){
      return Math.max(0, dayNo() - dayOf(mem.createdAt || Date.now()));
    },
    /** 1 April of the year this child starts school — set, or guessed from day one.
        School starts in April, so a first run in April or later belongs to next April. */
    schoolDate(){
      if (mem.schoolYear) return new Date(mem.schoolYear, 3, 1);
      const d = new Date(mem.createdAt || Date.now());
      return new Date(d.getFullYear() + (d.getMonth() >= 3 ? 1 : 0), 3, 1);
    },
    setSchoolYear(y){ mem.schoolYear = y || 0; save(); },
    /** calendar days from today to 入学 (negative once it has passed). Days, not
        rounded milliseconds: rounded, 31 March said「入学しています」from 1 p.m. */
    daysToSchool(){
      return dayOf(this.schoolDate().getTime()) - dayNo();
    },
    noteBackup(){ mem.backupAt = dayNo(); writeNow(); },
    lastBackupDays(){ return mem.backupAt ? Math.max(0, dayNo() - mem.backupAt) : null; },
    /** { never, days } when it is time to ask again, otherwise null.
        Never on the first days: there is nothing yet worth the interruption. */
    backupDue(){
      if (this.usedDays() < 10) return null;
      const d = this.lastBackupDays();
      if (d == null) return { never: true, days: null };
      return d >= 30 ? { never: false, days: d } : null;
    },
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

    milestoneText(kind){ return MILESTONE_TEXT[kind] || ''; },
    milestoneRank(kind){ return MILESTONE_RANK[kind] || 0; },
    recordMilestone(gameId, levelIndex, kind, label){
      if (!/^[a-z0-9]+$/.test(gameId) || !Number.isInteger(levelIndex) || levelIndex < 0
          || !Object.prototype.hasOwnProperty.call(MILESTONE_TEXT, kind)) return null;
      const k = gameId + ':' + levelIndex + ':' + kind;
      if (mem.milestones[k] != null) return null;
      mem.milestones[k] = { day: dayNo(), label: String(label || '').slice(0, 80) };
      save();
      return { gameId, levelIndex, kind, day: mem.milestones[k].day, label: mem.milestones[k].label };
    },
    milestones(){
      return Object.keys(mem.milestones || {}).map(k => {
        const m = /^([a-z0-9]+):(\d+):(viewed|together|supported|revised|independent)$/.exec(k);
        const rec = mem.milestones[k];
        return m ? { gameId: m[1], levelIndex: Number(m[2]), kind: m[3],
          day: rec.day, label: rec.label } : null;
      }).filter(Boolean).sort((a, b) => b.day - a.day || MILESTONE_RANK[b.kind] - MILESTONE_RANK[a.kind]);
    },

    /* ---- item-level memory ---- */
    noteFact(k, firstTryOk, label, from, ms, miss){
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
      const recent = mem.factRecent || (mem.factRecent = {});
      recent[k] = ((recent[k] || '') + (firstTryOk ? '1' : '0')).slice(-12);
      /* How long the answer took, kept only where speed is the goal and only for
         clean answers — a wrong answer times a guess. A single interrupted question
         (the iPad put down mid-problem) is clamped rather than dropped, so it cannot
         decide the average on its own. An answer given while the question was still
         being read out arrives as 0 — the fastest answer there is, not a missing one:
         dropping it left the average made of the slow answers alone, and a fact the
         child knew cold was reported as「数えている」and sent to とっくん. */
      if (ms != null && ms >= 0){
        const capped = Math.max(1, Math.min(ms, 20000));
        f[5] = f[5] ? Math.round(f[5] * 0.65 + capped * 0.35) : capped;
      }
      /* What kind of wrong it was, from the first mistake on this question. A
         percentage says how often; this says what to do about it. */
      if (miss && MISS_KINDS[miss]){
        const m = f[6] || (f[6] = {});
        m[miss] = (m[miss] || 0) + 1;
      }
      save();
    },
    fact: k => mem.facts[k] || null,
    /** The mistake this child keeps making on this fact: { kind, n, of } or null.
        Only the diagnostic kinds, only when it has happened more than once, and
        only when it is actually the dominant reading — one stray tap is not a
        pattern, and naming the wrong pattern is worse than naming none. */
    factMiss(k){
      const f = mem.facts[k];
      const m = f && f[6];
      if (!m) return null;
      let best = null, total = 0;
      for (const t in m){
        total += m[t];
        if (MISS_DIAGNOSTIC.indexOf(t) < 0) continue;
        if (!best || m[t] > best.n) best = { kind: t, n: m[t] };
      }
      if (!best || best.n < 2 || best.n * 2 < total) return null;
      best.of = total;
      return best;
    },
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
    introduced: (g, l) => !!(mem.intro && mem.intro[key(g, l)]),
    markIntroduced(g, l){ (mem.intro || (mem.intro = {}))[key(g, l)] = 1; save(); },
    completeOrientation(){ mem.orientation = true; save(); },

    /* ---- provisional clears ---- */
    dayNumber: () => dayNo(),
    /** on the shelf, but waiting for another day to confirm it */
    addPending(k){
      if (mem.stickers.indexOf(k) >= 0) return false;
      mem.stickers.push(k);
      (mem.pending || (mem.pending = {}))[k] = [dayNo(), 0, 0];
      save();
      return true;
    },
    isPending: k => !!(mem.pending && mem.pending[k]),
    hasConfirmed: k => mem.stickers.indexOf(k) >= 0 && !(mem.pending && mem.pending[k]),
    pendingFrom: k => (mem.pending && mem.pending[k]) ? mem.pending[k][0] : null,
    checkFailed: k => !!(mem.pending && mem.pending[k] && mem.pending[k][2] > 0),
    /** waiting clears from an earlier day that have not been checked today, oldest first */
    pendingDue(){
      const t = dayNo(), p = mem.pending || {};
      return Object.keys(p).filter(k => p[k][0] < t && p[k][1] < t).sort((a, b) => p[a][0] - p[b][0]);
    },
    confirmSticker(k){
      if (!mem.pending || !mem.pending[k]) return false;
      delete mem.pending[k];
      save();
      return true;
    },
    failCheck(k){
      const p = mem.pending && mem.pending[k];
      if (!p) return;
      p[1] = dayNo(); p[2]++;
      save();
    },
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
    /** What to call this child. Kept short: it is spoken and it goes in a heading. */
    get name(){ return mem.name || ''; },
    setName(v){ mem.name = String(v || '').trim().slice(0, 12); save(); },
    reset(){ mem = blank(); save(); }
  };
})();
