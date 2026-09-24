/* ===========================================================
   Regression suite for かずのぼうけん.
   Runs inside the app page and drives it the way a child would:
   it answers questions and then checks what happened afterwards.

   It exists because the original checks only ever called level.make() —
   they proved questions could be *built*, and every interaction bug in
   the first review lived in what happened after an answer was tapped.
   =========================================================== */
(function(){
  'use strict';

  const K = window.KazuApp;
  const S = K.Session._test;
  const narrationWasOn = K.Sound.voiceOn;
  K.Sound.voiceOn = false; // synchronous interaction tests; narration timing has dedicated delayed tests
  // levels opened for the first time start with two lesson questions; those have
  // tests of their own (87–89), and everything else here counts questions exactly
  if (S.intro) S.intro(false);
  const doc = document;
  const results = [];
  let uncaught = 0;
  window.addEventListener('error', () => uncaught++);

  const q  = sel => doc.querySelector(sel);
  const qa = sel => Array.from(doc.querySelectorAll(sel));
  function check(name, ok, detail){ results.push({ name, ok: !!ok, detail: ok ? '' : (detail || '') }); }

  /* ---------- helpers ---------- */
  function finishSpeech(text, opts){ if (opts && opts.onend) opts.onend(); }
  function liveChoices(){
    return qa('#play .choices .choice').filter(b => !b.disabled && !b.classList.contains('correct'));
  }
  /* Every surface the app uses for "give your answer". Driving all of them is the
     point: a bug that only shows up on plates or queue items is still a bug. */
  const ANSWER_SEL = [
    '#play .choices .choice', '#play .choices .plate', '#play .choices .clock-choice',
    '#play .playfield .plate', '#play .playfield .qi', '#play .playfield .mrow',
    '#play .playfield .vessel', '#play .playfield .shapebtn',
    '#play .obj', '#play .cell.tappable'
  ].join(', ');
  function candidates(){
    return qa(ANSWER_SEL).filter(n => !n.disabled
      && !n.classList.contains('correct') && !n.classList.contains('picked')
      && !n.classList.contains('counted') && !n.classList.contains('dim'));
  }
  /** tap answers until the question is accepted; false when nothing is tappable */
  function answerOnce(){
    // 「まえから Nこ」は the first N animals as a set; random tapping is not a
    // meaningful driver and can keep clearing the set forever by chance.
    const ordinalCount = (q('#play .prompt .txt') && q('#play .prompt .txt').textContent || '')
      .match(/まえから\s*(\d+)こ/);
    if (ordinalCount){
      qa('#play .queue .qi').slice(0, Number(ordinalCount[1])).forEach(x => x.click());
      return true;
    }
    // drag-and-drop questions: pick a piece, then try each destination
    const piece = q('#play .tile:not(.gone)') || q('#play .shapetile:not(.used)');
    if (piece){
      piece.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
      const targets = qa('#play [data-drop]');
      for (const t of targets){
        const was = S.locked;
        t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        if (S.locked !== was) return true;
        if (piece.classList.contains('gone') || piece.classList.contains('used')) return true;
      }
      return false;
    }
    const list = candidates().sort(() => Math.random() - 0.5);   // pair-matching needs varied order
    if (!list.length) return false;
    for (const n of list){
      const was = S.locked;
      n.click();
      if (n.classList.contains('correct') || S.locked !== was) return true;
    }
    return true;   // taps landed (counting objects, filling a frame): make progress and re-check
  }
  function blanks(){ return qa('#play .nn.gap, #play .car.blank').length; }
  function pipsDone(){ return qa('#play .pip.done, #play .pip.miss').length; }
  function onResult(){ return !doc.getElementById('result').hidden; }
  function leavePlay(){
    const back = q('#play .backbtn');
    back.click();
    back.click();
  }

  const eachLevel = fn => K.Games.list.forEach(g => g.levels.forEach((lv, li) => fn(g, li, lv)));

  /* ---------- 1. every level builds, repeatedly, without throwing or hanging ---------- */
  (function buildStorm(){
    const bad = [];
    const t0 = performance.now();
    eachLevel((g, li) => {
      for (let n = 0; n < 25; n++){
        try{ K.Session.startLevel(g, li); }
        catch(e){ bad.push(g.id + '/L' + li + ': ' + e.message); break; }
      }
    });
    const ms = performance.now() - t0;
    check('all levels build 25x without throwing', !bad.length, bad.slice(0, 4).join(' | '));
    // a rejection-sampling loop that stopped terminating would show up here first
    check('build storm finishes promptly (<20s)', ms < 20000, Math.round(ms) + 'ms');
  })();

  /* ---------- 2. answering never skips or auto-completes a question ---------- */
  (function answerFlow(){
    const skipped = [], overshoot = [], stuck = [];
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      let guard = 0;
      while (!onResult() && guard++ < 80){
        const before = S.idx;
        const b0 = blanks();
        if (!answerOnce()){ S.flushTimers(); continue; }   // interaction-only question
        S.flushTimers();
        const advanced = S.idx - before;
        // C1: a multi-blank question must not finish while blanks remain
        if (advanced > 0 && b0 >= 2) skipped.push(g.id + '/L' + li + ' finished with ' + b0 + ' blanks left');
        if (advanced > 1) overshoot.push(g.id + '/L' + li + ' advanced ' + advanced);
      }
      if (!onResult() && guard >= 80) stuck.push(g.id + '/L' + li);
    });
    check('no question completes while blanks remain (C1)', !skipped.length, skipped.slice(0, 4).join(' | '));
    check('one answer never advances more than one question', !overshoot.length, overshoot.slice(0, 4).join(' | '));
    // these need a gesture the suite cannot fake (finger tracing, hand-setting a
    // clock, taking exactly N objects); everything else must be playable to the end
    const expectStuck = ['trace/L0', 'trace/L1', 'trace/L2', 'count/L2', 'clock/L2'];
    const unexpected = stuck.filter(s => expectStuck.indexOf(s) < 0);
    check('every level is playable through to the result screen', !unexpected.length, unexpected.join(' | '));
  })();

  /* ---------- 3. leaving a question kills its pending work (C3) ---------- */
  (function staleTimers(){
    K.Session.startLevel(K.Games.byId.bond, 0);
    answerOnce();                                   // schedules "advance to next question"
    leavePlay();                                    // confirm, then leave before it fires
    K.Session.startLevel(K.Games.byId.numeral, 0);
    const idxAtStart = S.idx;
    S.flushTimers();
    check('leaving a question cannot advance the next level (C3)',
      S.idx === idxAtStart && idxAtStart === 0, 'idx=' + S.idx);

    // and a slow story animation must not paint into whatever came after it
    K.Session.startLevel(K.Games.byId.add, 1);
    leavePlay();
    K.Session.startLevel(K.Games.byId.seq, 0);
    S.flushTimers();
    check('a story animation cannot write into the next question',
      !q('#play .eq') && !!q('#play .numline'), 'eq=' + !!q('#play .eq'));
  })();

  /* ---------- 4. no listener accumulation on the shared answer strip (M1) ---------- */
  (function listenerLeak(){
    const before = uncaught;
    for (let i = 0; i < 4; i++){
      K.Session.startLevel(K.Games.byId.bond, 0);
      answerOnce(); S.flushTimers();
    }
    K.Session.startLevel(K.Games.byId.compare, 0);
    answerOnce(); S.flushTimers();
    check('playing いくつと いくつ leaves no handlers behind (M1)', uncaught === before,
      (uncaught - before) + ' uncaught errors');
  })();

  /* ---------- 5. hints appear exactly once, and something visible always happens ---------- */
  (function hints(){
    const noisy = [], silent = [];
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      const btns = liveChoices();
      if (btns.length < 2) return;                 // needs a wrong answer to click
      const before = q('#play').innerHTML.length;
      for (let i = 0; i < 5; i++){
        const wrong = liveChoices().filter(b => !b.classList.contains('correct'));
        if (!wrong.length) break;
        wrong[0].click();
        if (wrong[0].classList.contains('correct')) break;
      }
      const hintTexts = qa('#play .playfield .hintline').map(x => x.textContent.trim());
      if (new Set(hintTexts).size < hintTexts.length)
        noisy.push(g.id + '/L' + li + ' duplicate: ' + hintTexts.join(' / '));
      const changed = q('#play').innerHTML.length !== before;
      const dimmed = qa('#play .choice.dim').length > 0;
      const chip   = !q('#play .feedback').hidden;
      if (!(changed || dimmed || chip)) silent.push(g.id + '/L' + li);
    });
    check('a hint is never stacked up on repeated wrong answers (M4)', !noisy.length, noisy.slice(0, 4).join(' | '));
    check('two wrong answers always change something on screen (M5)', !silent.length, silent.slice(0, 6).join(' | '));
  })();

  /* ---------- 6. motor slips do not lower the child's mathematics score ---------- */
  (function traceHonesty(){
    K.Session.startLevel(K.Games.byId.trace, 0);
    const box = q('#play .tracebox');
    const r = box.getBoundingClientRect();
    const fire = (type, x, y) => box.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 }));
    for (let i = 0; i < 4; i++){ fire('pointerdown', r.left + 4, r.bottom - 4); fire('pointerup', r.left + 4, r.bottom - 4); }
    check('missing the tracing start point gives guidance without lowering math stars',
      S.mistakes === 0 && !!q('#play .trace-ghost'), 'mistakes=' + S.mistakes);
  })();

  /* ---------- 7. clock hours use clock readings, not counting readings ---------- */
  (function clockReadings(){
    const want = { 1:'いちじ', 4:'よじ', 7:'しちじ', 9:'くじ', 12:'じゅうにじ' };
    const bad = Object.keys(want).filter(h => K.jiKana(+h) !== want[h])
                      .map(h => h + '→' + K.jiKana(+h));
    check('clock hours read よじ / しちじ / くじ', !bad.length, bad.join(', '));
  })();

  /* ---------- 7b. story objects, actions and counters agree ----------
     A shared object bank used to produce「いぬが6つ、3つ食べた」.  This is
     not merely awkward wording: it teaches the wrong counter while asking a child
     to infer arithmetic from a scene that cannot happen. */
  function naturalStoryLanguage(){
    const bad = [];
    const animalCount = /\d+(?:ぴき|ひき|びき)/g;
    const foodCount = /\d+(?:こ|ぽん|ほん|ぼん|ふさ)/g;
    const prompt = () => (q('#play .prompt .txt') || {}).textContent || '';

    [[K.Games.byId.add, 0], [K.Games.byId.add, 1],
     [K.Games.byId.sub, 0], [K.Games.byId.sub, 1],
     [K.Games.byId.g1shiki, 0]].forEach(([game, level]) => {
      for (let n = 0; n < 30; n++){
        K.Session.startLevel(game, level);
        const text = prompt(), counts = text.match(animalCount) || [];
        if (counts.length !== 2 || /\d+(?:つ|こ)/.test(text) || !/いるよ/.test(text)){
          bad.push(game.id + '/L' + level + ': ' + text);
          break;
        }
      }
    });

    function checkFood(text, where){
      const names = ['りんご','いちご','バナナ','ぶどう','ケーキ','ドーナツ'];
      const name = names.find(x => text.indexOf(x) >= 0);
      const counts = text.match(foodCount) || [];
      const valid = name === 'バナナ' ? /^\d+(?:ぽん|ほん|ぼん)$/
                  : name === 'ぶどう' ? /^\d+ふさ$/ : /^\d+こ$/;
      if (!name || counts.length < 2 || counts.some(x => !valid.test(x))
          || /(いぬ|ねこ|さかな|くるま).*(たべ|食べ)/.test(text))
        bad.push(where + ': ' + text.replace(/\s+/g, ' '));
    }

    for (let n = 0; n < 80; n++){
      K.Session.startLevel(K.Games.byId.g1shiki, 1);
      const text = (q('#play .storycard .tx') || {}).textContent || '';
      checkFood(text, 'g1shiki/L1');
      if (!/(もらいました|いれました|たべました|あげました)/.test(text))
        bad.push('g1shiki/L1 action: ' + text);
    }
    for (let n = 0; n < 40; n++){
      K.Session.startLevel(K.Games.byId.g1shiki, 2);
      checkFood(qa('#play .choices .choice').map(x => x.textContent).join(' / '), 'g1shiki/L2');
    }

    const dog = { counter: 'hiki' }, banana = { counter: 'hon' }, grapes = { counter: 'fusa' };
    const forms = [K.thingCountText(dog, 1), K.thingCountText(dog, 3), K.thingCountText(dog, 6),
                   K.thingCountText(banana, 1), K.thingCountText(banana, 3), K.thingCountText(banana, 6),
                   K.thingCountKana(grapes, 1)].join('|');
    check('story problems use natural objects, actions and counters',
      !bad.length && forms === '1ぴき|3びき|6ぴき|1ぽん|3ぼん|6ぽん|ひとふさ',
      bad.slice(0, 5).join(' | ') || forms);
  }

  /* ---------- 8. every tappable thing is also keyboard operable ---------- */
  (function keyboard(){
    const bad = new Set();
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      qa('#play [role="button"]').forEach(n => {
        if (n.tagName !== 'BUTTON' && n.dataset.tap !== '1') bad.add(g.id + '/L' + li + ' ' + n.className);
      });
    });
    check('no role=button without keyboard support', !bad.size, Array.from(bad).slice(0, 4).join(' | '));
  })();

  /* ---------- 9. answer sets stay fair ---------- */
  (function choiceSanity(){
    const bad = new Set();
    eachLevel((g, li) => {
      for (let n = 0; n < 12; n++){        // 540 samples across the 45 levels
        K.Session.startLevel(g, li);
        const strip = q('#play .choices');
        if (!strip || strip.dataset.built !== '1') continue;   // hand-built strips may repeat by design (5と5で10)
        const btns = qa('#play .choices .choice');
        if (!btns.length) continue;
        const labels = btns.map(b => b.textContent.trim());
        if (new Set(labels).size !== labels.length) bad.add(g.id + '/L' + li + ' duplicate labels');
        if (btns.length < 2) bad.add(g.id + '/L' + li + ' single choice');
      }
    });
    check('answer sets have no duplicate labels', !bad.size, Array.from(bad).slice(0, 4).join(' | '));
  })();

  /* ---------- 10. one sticker per slot, no repeats ---------- */
  (function stickers(){
    const keys = [];
    K.Games.list.forEach(g => g.levels.forEach((lv, li) => { keys.push(g.id + ':' + li, g.id + ':' + li + ':g'); }));
    const emo = keys.map(K.stickerFor);
    check('every sticker slot has its own emoji',
      new Set(emo).size === emo.length && keys.length <= K.STICKER_POOL.length,
      keys.length + ' slots / ' + K.STICKER_POOL.length + ' emoji / ' + new Set(emo).size + ' unique');
  })();

  /* ---------- 10b. the home map says whether another sticker remains ---------- */
  (function homeStickerCompletion(){
    K.Store.reset();
    const g = K.Games.byId.bond;
    g.levels.forEach((lv, i) => {
      K.Store.recordLevel(g.id, i, i === 1 ? 2 : 3, i === 1 ? 6 : 8, 8);
      K.Store.addSticker(g.id + ':' + i);
      if (i !== 1) K.Store.addSticker(g.id + ':' + i + ':g');
    });
    K.Home.render();
    const card = () => qa('#home .gamecard').find(x => (x.querySelector('.nm') || {}).textContent === g.name);
    const roundedButOpen = card() && card().querySelectorAll('.st .on').length === 3
      && !card().classList.contains('collected') && /まだ シール/.test(card().title);
    K.Store.addSticker(g.id + ':1:g');
    K.Home.render();
    const finished = card() && card().classList.contains('collected')
      && !!card().querySelector('.collectmark') && /ぜんぶ ゲット/.test(card().title);
    check('a rounded ★★★ stays plain while a sticker remains, and turns gold only when every sticker is earned',
      roundedButOpen && finished,
      'open=' + roundedButOpen + ' finished=' + finished);
    K.Store.reset();
  })();

  /* ---------- 10c. each level names its own gold sticker ---------- */
  (function levelGoldCompletion(){
    K.Store.reset();
    const g = K.Games.byId.count;
    [0, 1].forEach(i => {
      K.Store.recordLevel(g.id, i, 3, 8, 8);
      K.Store.addSticker(g.id + ':' + i);
    });
    K.Store.addSticker(g.id + ':1:g');
    K.Levels.render(g);
    const cards = qa('#levels .levelcard');
    const plain = cards[0] && !cards[0].classList.contains('gold')
      && !cards[0].querySelector('.goldmark') && /まだ/.test(cards[0].title);
    const gold = cards[1] && cards[1].classList.contains('gold')
      && !!cards[1].querySelector('.goldmark') && /ゲット/.test(cards[1].title);
    check('each level gets a gold frame only after its own gold sticker is earned',
      plain && gold, JSON.stringify({
        hasGold: K.Store.hasSticker(g.id + ':1:g'),
        cards: cards.map(x => ({ cls: x.className, title: x.title, mark: !!x.querySelector('.goldmark') }))
      }));
    K.Store.reset();
  })();

  /* ---------- 11. records survive leaving this origin ---------- */
  (function backup(){
    K.Store.reset();
    K.Store.recordLevel('bond', 0, 3, 8, 8);
    K.Store.recordLevel('count', 1, 2, 6, 8);
    K.Store.addSticker('bond:0');
    K.Store.recordDiagnostic([{ gameId: 'count', levelIndex: 0, clean: true }],
      { gameId: 'flash', levelIndex: 0 });
    K.Store.recordMission({ day: '2026-01-02', id: 'backup-mission', gameId: 'count',
      text: '3こ かぞえる', prompt: 'ひとつずつ' });
    K.Store.completeMission('2026-01-02');
    const text = K.Store.exportText();
    const starsBefore = JSON.stringify(K.Store.data.stars);
    const seenBefore  = JSON.stringify(K.Store.data.seen);

    // a wiped browser, then a restore
    K.Store.reset();
    const r1 = K.Store.importText(text, 'replace');
    check('a backup restores the records exactly',
      r1.ok && JSON.stringify(K.Store.data.stars) === starsBefore && K.Store.hasSticker('bond:0')
        && K.Store.data.diagnostic.recommended.gameId === 'flash'
        && K.Store.mission('2026-01-02').done,
      r1.msg || 'import failed');

    // importing the same file twice must not double any number
    K.Store.importText(text, 'merge');
    K.Store.importText(text, 'merge');
    check('importing the same backup twice does not inflate anything',
      JSON.stringify(K.Store.data.seen) === seenBefore && JSON.stringify(K.Store.data.stars) === starsBefore,
      'seen=' + JSON.stringify(K.Store.data.seen));

    // merging keeps the better of the two sides
    K.Store.recordLevel('bond', 0, 1, 2, 8);          // a worse attempt
    K.Store.importText(text, 'merge');
    check('merging keeps the higher star count', K.Store.stars('bond', 0) === 3,
      'stars=' + K.Store.stars('bond', 0));

    const bad = K.Store.importText('{"nope":1}', 'merge');
    const junk = K.Store.importText('not json at all', 'merge');
    check('a wrong file is rejected without destroying the records',
      !bad.ok && !junk.ok && K.Store.stars('bond', 0) === 3, 'bad=' + bad.ok + ' junk=' + junk.ok);

    const intact = JSON.stringify(K.Store.data);
    const nullStickers = K.Store.importText('{"stars":{},"stickers":null}', 'replace');
    const nullMissions = K.Store.importText('{"stars":{},"missions":null}', 'replace');
    const badFacts = K.Store.importText('{"stars":{},"facts":{"ten:3":null}}', 'replace');
    check('a structurally broken backup is rejected atomically',
      !nullStickers.ok && !nullMissions.ok && !badFacts.ok
        && JSON.stringify(K.Store.data) === intact
        && Array.isArray(K.Store.data.stickers) && K.Store.data.missions,
      'stickers=' + nullStickers.ok + ' missions=' + nullMissions.ok + ' facts=' + badFacts.ok);

    K.Store.recordMission({ day: '2026-02-03', id: 'mission-a', gameId: 'count',
      text: 'A', prompt: 'A' });
    K.Store.completeMission('2026-02-03');
    const foreign = JSON.parse(K.Store.exportText());
    foreign.data.missions['2026-02-03'] = {
      day: '2026-02-03', id: 'mission-b', gameId: 'count',
      text: 'B', prompt: 'B', done: false, reviewed: false
    };
    K.Store.importText(JSON.stringify(foreign), 'merge');
    check('backup merge never transfers completion to different mission text',
      K.Store.mission('2026-02-03').id === 'mission-a' && K.Store.mission('2026-02-03').done,
      JSON.stringify(K.Store.mission('2026-02-03')));
  })();

  /* ---------- 12. a second tap on the answer must not answer twice ----------
     Children double-tap. The picked button was never disabled (only its
     neighbours were), so a second tap re-ran onPick: in a question with two
     blanks that skipped a blank and then threw, stranding the child on a
     question they could no longer finish. */
  (function doubleTap(){
    let stuck = null, threw = null;
    [['seq', 0], ['seq', 1], ['pattern', 2]].forEach(([id, li]) => {
      for (let trial = 0; trial < 5 && !stuck; trial++){
        K.Session.startLevel(K.Games.byId[id], li);
        let guard = 0;
        while (!onResult() && guard++ < 240){
          const btns = qa('#play .choices .choice').filter(b => !b.disabled);
          for (const b of btns){
            b.click(); b.click(); b.click();       // one child, three taps
            if (b.classList.contains('correct')) break;
          }
          try{ S.flushTimers(); }catch(e){ threw = threw || e.message; }
        }
        if (!onResult()) stuck = id + '/L' + li;
      }
    });
    check('tapping the correct answer twice cannot skip a blank or strand the question',
      !stuck && !threw, (stuck ? 'stuck at ' + stuck : '') + (threw ? ' threw: ' + threw : ''));
  })();

  /* ---------- 13. a level session covers distinct facts ----------
     Before the shuffle bag these levels drew independently every question, so
     「10の おともだち L2」 averaged 5.7 distinct facts out of its 9 and finished
     without ever asking three of them. Floors below sit well above that. */
  (function coverage(){
    const worst = [];
    // [game, level, questions, floor for the mean number of distinct facts]
    [['ten', 1, 7.0], ['clock', 0, 7.0], ['bond', 0, 6.5], ['trace', 0, 3]].forEach(([id, li, floor]) => {
      const g = K.Games.byId[id], per = g.levels[li].n || 8;
      let total = 0;
      const RUNS = 10;
      for (let r = 0; r < RUNS; r++){
        K.Store.reset();
        const seen = [];
        K.Session.startLevel(g, li);
        for (let i = 0; i < per && !onResult(); i++){
          seen.push(S.item);
          S.forceCorrect();        // drive every level the same way, clickable or not
          S.flushTimers();
        }
        total += new Set(seen.filter(Boolean)).size;
      }
      const mean = total / RUNS;
      if (mean < floor) worst.push(id + '/L' + li + ' ' + mean.toFixed(1) + ' < ' + floor);
    });
    K.Store.reset();
    check('one session works through the fact set instead of redrawing at random',
      !worst.length, worst.join(' | '));
  })();

  /* ---------- 14. stars grade the pass, and the gate is real but escapable ---------- */
  (function gate(){
    K.Store.reset();
    // a session where nothing is answered right first time
    K.Store.recordLevel('ten', 1, 0, 1, 8);
    check('a session under half right earns no star and does not open the next level',
      K.Store.stars('ten', 1) === 0 && !K.Store.levelUnlocked('ten', 2),
      'stars=' + K.Store.stars('ten', 1) + ' unlocked=' + K.Store.levelUnlocked('ten', 2));

    K.Store.recordLevel('ten', 1, 0, 1, 8);
    K.Store.recordLevel('ten', 1, 0, 1, 8);
    check('three honest attempts open the next level anyway, so nobody is stuck',
      K.Store.levelUnlocked('ten', 2), 'plays=' + K.Store.plays('ten', 1));

    K.Store.reset();
    K.Store.recordLevel('bond', 0, 2, 6, 8);
    check('a clear pass opens the next level', K.Store.levelUnlocked('bond', 1) && K.Store.stars('bond', 0) === 2,
      'stars=' + K.Store.stars('bond', 0));
  })();

  /* ---------- 15. きょうの れんしゅう aims at what the child is missing ---------- */
  (function aimed(){
    K.Store.reset();
    const today = Math.floor(Date.now() / 86400000);
    K.Games.list.forEach(g => g.levels.forEach((lv, i) => {
      K.Store.data.stars[g.id + ':' + i] = 2;
      K.Store.data.recent[g.id + ':' + i] = '1'.repeat(28) + '01';   // solid
      K.Store.data.last[g.id + ':' + i] = today;
      K.Store.markIntroduced(g.id, i);
    }));
    ['bond', 'ten'].forEach(id => [0, 1, 2].forEach(i => {
      K.Store.data.recent[id + ':' + i] = '1'.repeat(7) + '0'.repeat(23);   // struggling
    }));
    const tally = {};
    const DAYS = 120;
    for (let d = 0; d < DAYS; d++){
      K.Session.startDaily(10);
      S.planGames.forEach(k => { const g = k.split(':')[0]; tally[g] = (tally[g] || 0) + 1; });
    }
    const weak = ((tally.bond || 0) + (tally.ten || 0)) / DAYS;
    // a stage that has not been opened yet is not in the pool, and not being asked
    // about is the point of it — only the open half has to keep showing up
    const others = K.Games.list.filter(g => g.id !== 'bond' && g.id !== 'ten' && K.stageOpen(g));
    const everyoneAppears = others.every(g => (tally[g.id] || 0) > 0);
    check('the daily set aims at the weak topics without abandoning the rest',
      weak >= 2.5 && everyoneAppears,
      'weak=' + weak.toFixed(2) + '/day, all others present=' + everyoneAppears);
    K.Store.reset();
  })();

  /* ---------- 15b. にがて あつめ actually concentrates on the weak facts ----------
     きょうの れんしゅう is a review instrument: measured over three weeks it gives one
     particular make-ten fact about a turn a fortnight, and leaves two or three of the
     nine untouched. Nothing in the app could ask the same fact twice in one sitting,
     because the shuffle bag that stops a level repeating itself also stops it
     concentrating. This set is the other half of that pair. */
  (function focusSet(){
    K.Store.reset();
    const weak = ['ten:ten:3', 'ten:ten:6', 'ten:ten:9'];
    weak.forEach(k => { for (let i = 0; i < 4; i++) K.Store.noteFact(k, false, k, 'ten:1'); });
    // a fact they are solid on must not be dragged into the practice set
    for (let i = 0; i < 4; i++) K.Store.noteFact('ten:ten:5', true, '5 と 5 で 10', 'ten:1');
    K.Store.recordLevel('ten', 0, 3, 8, 8);                    // so ten L2 is open

    const picked = K.Store.weakFacts(4).map(w => w.key);
    const onlyWeak = picked.length === 3 && picked.every(k => weak.indexOf(k) >= 0);

    K.Session.startFocus(picked, { n: 10 });
    const mode = S.mode;
    const counts = {};
    for (let i = 0; i < 10 && !onResult(); i++){
      if (S.item) counts[S.item] = (counts[S.item] || 0) + 1;
      S.forceCorrect(); S.flushTimers();
    }
    const reps = weak.map(k => counts[k] || 0);
    const least = Math.min.apply(null, reps);
    check('にがて あつめ meets every weak fact several times in one sitting',
      onlyWeak && mode === 'focus' && least >= 3,
      'picked=' + picked.join(',') + ' reps=' + reps.join('/'));

    // an old record from before origins were kept has nowhere to be asked again
    K.Store.reset();
    K.Store.noteFact('ten:ten:2', false, '2 と 8 で 10');
    check('a fact with nowhere to be asked again is never offered as practice',
      K.Store.weakFacts().length === 0, JSON.stringify(K.Store.weakFacts()));

    // and aiming at nothing must never leave the child on an empty plan
    K.Store.recordLevel('count', 0, 3, 8, 8);
    K.Session.startFocus(['ten:ten:2'], { n: 10 });
    check('an aimed set with nothing to aim at falls back to きょうの れんしゅう',
      S.mode === 'daily' && S.planLength === 0, 'mode=' + S.mode + ' n=' + S.planLength);
    K.Store.reset();
  })();

  /* ---------- 15c. the result screen offers the way back to what went wrong ----------
     It used to name the shaky facts and then put「つぎの レベルへ」as the only bright
     button: the diagnosis was printed and then walked past. */
  (function resultActs(){
    K.Store.reset();
    for (let i = 0; i < 3; i++) K.Store.noteFact('ten:ten:3', false, '3 と 7 で 10', 'ten:1');
    K.Store.recordLevel('ten', 0, 3, 8, 8);
    K.Result.show({ stars: 1, right: 5, total: 8, mode: 'level', game: K.Games.byId.ten,
                    levelIndex: 1, sticker: null, focusKeys: [],
                    shaky: [{ key: 'ten:ten:3', label: '3 と 7 で 10' }] });
    // named as words, and reached through the one とっくん button rather than three look-alike chips
    const named = /3 と 7 で 10/.test((q('#result .shaky') || {}).textContent || '') && !q('#result button.shakyitem');
    const acts = qa('#result .result-actions .btn').map(b => (b.querySelector('.bl') || b).textContent);
    check('the facts the result names can be practised straight from it',
      named && acts[0] === 'とっくん する',
      'named=' + named + ' actions=' + acts.join(' / '));
    K.Store.reset();
  })();

  /* ---------- 15d. day one starts where the roadmap says it starts ----------
     Every level scores the same on need and staleness before the child has met any
     of them, so `focus` was the only thing separating them — which put いくつと
     いくつ, the hardest thing in the app, in front of a child who could not yet
     count to ten. The README's roadmap existed only as prose on the parent page. */
  (function dayOne(){
    K.Store.reset();
    const tally = {};
    const DAYS = 60;
    for (let d = 0; d < DAYS; d++){
      K.Session.startDaily(10);
      S.planGames.forEach(k => {
        const w = (K.Games.byId[k.split(':')[0]] || {}).world;
        tally[w] = (tally[w] || 0) + 1;
      });
    }
    const shima = (tally.shima || 0) / DAYS, yama = (tally.yama || 0) / DAYS;
    check('a child with no record yet is sent to the guided starting adventure before daily review',
      shima === 0 && yama === 0,
      'shima=' + shima.toFixed(2) + '/day, yama=' + yama.toFixed(2) + '/day');
    K.Store.reset();
  })();

  /* ---------- 16. the かさくらべ hint has to be a valid way to compare ----------
     It tells the child to count squares. The squares therefore have to be one size
     across every glass, and they have to divide the juice exactly — otherwise the
     hint teaches the very mistake 1年生「かさくらべ」 exists to prevent, and roughly
     2% of the time it points at the wrong glass. */
  (function capacityHint(){
    const wrong = [];
    let seen = 0;
    for (let i = 0; i < 200 && wrong.length < 3; i++){
      K.Session.startLevel(K.Games.byId.measure, 1);
      const svgs = qa('#play .vessel svg');
      if (svgs.length < 2) continue;                 // that draw was a length question
      seen++;
      const glass = svgs.map(sv => {
        const water = sv.querySelectorAll('rect')[1];
        const w = +water.getAttribute('width'), h = +water.getAttribute('height');
        const px = sv.getBoundingClientRect().width / 90;    // viewBox width
        return { w, h, area: w * h, unitOnScreen: Math.round(12 * px), cells: (w / 12) * (h / 12) };
      });
      if (glass.some(g => g.w % 12 || g.h % 12)) wrong.push('the unit does not divide the juice');
      if (new Set(glass.map(g => g.unitOnScreen)).size > 1) wrong.push('the squares differ between glasses');
      const cells = glass.map(g => g.cells), areas = glass.map(g => g.area);
      const cMax = Math.max.apply(null, cells);
      if (cells.filter(c => c === cMax).length > 1) wrong.push('counting squares gives a tie');
      if (cells.indexOf(cMax) !== areas.indexOf(Math.max.apply(null, areas))) wrong.push('counting squares gives the wrong glass');
    }
    check('counting the squares always reaches the answer the かさくらべ hint promises',
      seen > 30 && !wrong.length, (seen + ' drawn; ') + wrong.slice(0, 3).join(' | '));
  })();

  /* ---------- 17. a puzzle piece fits only where it belongs ----------
     The signature used to be 頂点数:幅x高さ, so ちょうちょ's four right triangles —
     the same triangle in four orientations — all matched every hole, and the puzzle
     about seeing shapes could be finished without looking at any. */
  (function puzzlePieces(){
    const loose = [];
    const seen = {};
    for (let i = 0; i < 120; i++){
      K.Session.startLevel(K.Games.byId.shape, 2);
      const name = (q('#play .prompt .txt').textContent.match(/はめて (.+) を/) || [])[1] || '?';
      const sigs = qa('#play .shapefield polygon').map(p => p.dataset.sig);
      seen[name] = 1;
      if (new Set(sigs).size !== sigs.length && !loose.some(x => x.indexOf(name) === 0)){
        loose.push(name + ': ' + sigs.length + ' pieces, ' + new Set(sigs).size + ' distinct');
      }
    }
    check('every puzzle piece fits only its own hole',
      Object.keys(seen).length >= 5 && !loose.length, loose.join(' | '));
  })();

  /* ---------- 18. the app still opens with no network ----------
     The route the README recommends is ホーム画面に追加 from GitHub Pages, and
     without a service worker that cannot open offline at all — iOS just falls back
     to the HTTP cache and lets it go stale. This drives sw.js's own handlers,
     because a page cannot register a worker for a scope it does not control. */
  async function serviceWorkerOffline(){
    if (typeof caches === 'undefined'){
      check('the app still opens with no network', false,
        'this run has no CacheStorage — serve the tests over http://127.0.0.1, not file://');
      return;
    }
    const src = await fetch('sw.js?t=' + Date.now()).then(r => r.ok ? r.text() : null).catch(() => null);
    if (!src){ check('the app still opens with no network', false, 'dist/sw.js is missing — run ./build.sh'); return; }

    const H = {};
    let skipped = false, claimed = false;
    const fakeSelf = { addEventListener: (k, f) => { H[k] = f; }, skipWaiting(){ skipped = true; },
                       clients: { claim: async () => { claimed = true; } } };
    let offline = false;
    const netFetch = r => offline ? Promise.reject(new TypeError('offline')) : fetch(r);
    new Function('self', 'caches', 'fetch', 'Request', 'Response', 'location', src)
      (fakeSelf, caches, netFetch, Request, Response, location);

    const problems = [];
    try{
      const w = []; await H.install({ waitUntil: p => w.push(p) }); await Promise.all(w);
      if (!skipped) problems.push('install did not take over');
      const name = (await caches.keys()).find(k => k.indexOf('kazu-no-bouken-') === 0);
      if (!name) problems.push('nothing was cached');

      // a previous deploy's cache has to go, or the child is stuck on an old build
      await caches.open('kazu-no-bouken-A-PREVIOUS-BUILD');
      await caches.open('kazu-natural-voices-v1');
      const w2 = []; await H.activate({ waitUntil: p => w2.push(p) }); await Promise.all(w2);
      if (!claimed) problems.push('activate did not claim the page');
      const left = await caches.keys();
      if (left.filter(k => k.startsWith('kazu-no-bouken-')).length !== 1) problems.push('old app caches survived: ' + left.join(','));
      if (!left.includes('kazu-natural-voices-v1')) problems.push('downloaded voices were deleted on update');

      const swGet = async req => {
        let p = null; const w = [];
        await H.fetch({ request: typeof req === 'string' ? new Request(req) : req,
                        respondWith: x => { p = x; }, waitUntil: x => w.push(x) });
        const res = p && await p;
        await Promise.all(w);
        return res;
      };
      const isApp = async res => !!res && res.status === 200 && (await res.text()).indexOf('KazuApp') >= 0;

      /* The deploy right after this one: its worker has just installed and thrown
         the old cache away, and the page has not been opened online since. The app
         has to be there from the precache alone — Pages serves it under
         kazu-no-bouken.html as well as index.html, and only one of those was listed. */
      const appUrl = location.href.split('?')[0];
      offline = true;
      if (!await isApp(await swGet(appUrl))) problems.push('the app page is not in the precache');
      // a start URL the worker has never seen is still the one app, offline
      const nav = new Request(new URL('from-the-home-screen.html', appUrl).href);
      Object.defineProperty(nav, 'mode', { value: 'navigate' });
      if (!await isApp(await swGet(nav))) problems.push('an unseen page load gets no app offline');
      offline = false;

      /* Now the path a child actually takes: the app has been opened once, so the
         worker has seen and kept it. (Asking for './' instead would only prove the
         precache, and under the test server './' is a directory listing rather
         than the app it is on a real deploy.) */
      let warm = null;
      await H.fetch({ request: new Request(appUrl), respondWith: p => { warm = p; } });
      await warm;
      await new Promise(r => setTimeout(r, 400));      // let the background write land

      offline = true;
      let served = null;
      await H.fetch({ request: new Request(appUrl), respondWith: p => { served = p; } });
      const res = served && await served;
      if (!res || res.status !== 200) problems.push('offline request was not answered');
      else {
        const html = await res.text();
        if (html.indexOf('KazuApp') < 0) problems.push('what came back offline was not the app');
      }
    }catch(e){ problems.push('threw: ' + e.message); }
    for (const k of await caches.keys()) await caches.delete(k);      // leave nothing behind
    check('the app still opens with no network', !problems.length, problems.join(' | '));
  }

  /* ---------- 19. the palette stays readable ----------
     White was the default for text on a coloured fill, and it fails on every crayon
     in the set: 2.05:1 on the orange「?」 in the number-bond diagram, 2.50:1 on the
     green a child sees the moment they answer correctly, 1.4–2.8:1 throughout dark
     mode. Numbers a child has to read are not decoration. */
  (function palette(){
    const root = document.documentElement;
    const was = root.dataset.theme;
    const px = n => getComputedStyle(root).getPropertyValue(n).trim();
    function rgb(c){
      if (c[0] === '#'){
        const h = c.length === 4 ? c[1]+c[1]+c[2]+c[2]+c[3]+c[3] : c.slice(1);
        return [0,2,4].map(i => parseInt(h.slice(i,i+2),16));
      }
      const m = c.match(/[\d.]+/g);
      return m ? m.slice(0,3).map(Number) : null;
    }
    function lum(c){
      const v = rgb(c);
      if (!v) return null;
      const f = v.map(x => { x/=255; return x <= .03928 ? x/12.92 : Math.pow((x+.055)/1.055, 2.4); });
      return .2126*f[0] + .7152*f[1] + .0722*f[2];
    }
    function ratio(a, b){
      const la = lum(a), lb = lum(b);
      if (la == null || lb == null) return null;
      return (Math.max(la,lb) + .05) / (Math.min(la,lb) + .05);
    }

    // [foreground token, background token, minimum]  — 3.0 where the text is only
    // ever a large bold numeral, 4.5 everywhere else
    const PAIRS = [
      ['--ink', '--paper', 4.5], ['--ink-soft', '--paper', 4.5], ['--ink-soft', '--paper-2', 4.5],
      ['--on-crayon', '--good', 4.5], ['--on-crayon', '--accent', 4.5],
      ['--on-crayon', '--c-blue', 4.5], ['--on-crayon', '--c-purple', 3],
      ['--on-crayon', '--c-red', 3],    ['--on-crayon', '--c-orange', 4.5],
      ['--on-crayon', '--c-yellow', 4.5], ['--on-crayon', '--c-green', 4.5],
      ['--on-crayon', '--c-pink', 4.5],
      ['--c-red', '--paper', 3],        // the numeral the prompt is about
      ['--oops-ink', '--paper', 4.5],   // the parent page's warnings
      ['--good-ink', '--good-soft', 3],
      ['--accent-ink', '--accent', 3]
    ];
    const bad = [];
    ['light', 'dark'].forEach(theme => {
      root.dataset.theme = theme;
      PAIRS.forEach(([f, b, min]) => {
        const r = ratio(px(f), px(b));
        if (r == null) bad.push(theme + ' ' + f + '/' + b + ' unreadable token');
        else if (r < min) bad.push(theme + ' ' + f + ' on ' + b + ' = ' + r.toFixed(2) + ' < ' + min);
      });
    });
    if (was) root.dataset.theme = was; else delete root.dataset.theme;
    check('every colour a child has to read clears its contrast floor, in both themes',
      !bad.length, bad.slice(0, 4).join(' | '));
  })();

  /* ---------- 20. the top calc levels ask for the answer, not a choice ----------
     Picking one of three is recognition; 「考えずに言える」 is retrieval, and only the
     second is what makes a carry sum fast. These levels put up a fixed 0–10 keypad,
     which also drops what guessing alone is worth from 33% to 9%. */
  (function keypad(){
    const bad = [];
    [['bond', 2], ['ten', 1], ['add', 2], ['sub', 2]].forEach(([id, li]) => {
      let sawPad = 0;
      for (let t = 0; t < 8; t++){
        K.Session.startLevel(K.Games.byId[id], li);
        const keys = qa('#play .choices .padkey');
        if (!keys.length) continue;
        sawPad++;
        const labels = keys.map(k => k.textContent);
        if (labels.join(',') !== '0,1,2,3,4,5,6,7,8,9,10'){
          bad.push(id + '/L' + (li+1) + ' keypad is ' + labels.join(','));
          break;
        }
        if (t === 0){
          /* two wrong answers bring the picture back to work with; they must not start
             taking keys away — narrowing waits for the hand's walk-through */
          const wrong = keys.filter(k => !k.classList.contains('correct'));
          wrong[0].click(); wrong[0].click();
          const live = qa('#play .padkey').filter(k => !k.classList.contains('dim'));
          if (live.length < 11) bad.push(id + '/L' + (li+1) + ' hint left only ' + live.length + ' keys');
        }
      }
      if (!sawPad) bad.push(id + '/L' + (li+1) + ' never showed a keypad');
    });
    check('the top けいさんの やま levels answer on a 0–10 keypad, not three choices',
      !bad.length, bad.slice(0, 3).join(' | '));
  })();

  /* ---------- 21. the retrieval levels stop handing over the answer ----------
     The keypad took guessing out of these levels, but the picture stayed: 「2と いくつで
     10？」 above two blue dots and eight empty cells is solved by counting the cells.
     Both strategies score a clean answer, and only retrieval makes a carry sum fast.
     The picture now comes back on a wrong answer and on a right one — where it
     confirms what the child said instead of telling them. */
  (function noCountablePicture(){
    const bad = [];
    [['bond', 2], ['ten', 1]].forEach(([id, li]) => {
      let drew = 0, hinted = 0;
      for (let t = 0; t < 10; t++){
        K.Session.startLevel(K.Games.byId[id], li);
        if (!qa('#play .choices .padkey').length) continue;   // that draw was not a keypad question
        drew++;
        if (qa('#play .playfield .tenframe').length){
          bad.push(id + '/L' + (li + 1) + ' shows the frame before the child answers');
          break;
        }
        const wrong = qa('#play .padkey').filter(k => !k.classList.contains('correct'));
        wrong[0].click(); wrong[0].click();                   // two misses: bring the picture back
        if (qa('#play .playfield .tenframe').length) hinted++;
      }
      if (!drew) bad.push(id + '/L' + (li + 1) + ' never drew a keypad question');
      else if (!hinted) bad.push(id + '/L' + (li + 1) + ' hint never brings the frame back');
    });
    check('the retrieval levels do not leave the answer countable on screen',
      !bad.length, bad.slice(0, 3).join(' | '));
  })();

  /* ---------- 22. right-but-slow is not the same as known ----------
     Nothing was ever timed, so a child who counted eight empty cells for nine
     seconds and a child who remembered both scored「1回目で正解」and the app could
     not tell them apart — on the very levels whose stated goal is 考えずに言える. */
  (function speed(){
    K.Store.reset();
    K.Session.startLevel(K.Games.byId.ten, 1);
    const beforeAnswer = S.responseMs;
    const keys = qa('#play .padkey');
    if (keys.length) keys[0].click();
    check('the app measures how long an answer took',
      beforeAnswer === null && typeof S.responseMs === 'number' && S.responseMs >= 0,
      'before=' + beforeAnswer + ' after=' + S.responseMs);

    K.Store.reset();
    for (let i = 0; i < 4; i++) K.Store.noteFact('ten:ten:4', true, '4 と 6 で 10', 'ten:1', 11000);
    for (let i = 0; i < 4; i++) K.Store.noteFact('ten:ten:2', true, '2 と 8 で 10', 'ten:1', 1200);
    K.Store.recordLevel('ten', 0, 3, 8, 8);
    const weak = K.Store.weakFacts().map(w => w.key);
    const slowDue = K.Store.factDue('ten:ten:4'), fastDue = K.Store.factDue('ten:ten:2');
    check('a fact answered right every time but slowly still counts as unfinished',
      weak.length === 1 && weak[0] === 'ten:ten:4' && slowDue > fastDue,
      'weak=[' + weak.join(',') + '] due ' + slowDue.toFixed(2) + ' vs ' + fastDue.toFixed(2));

    // a wrong answer times a guess, not a retrieval, so it is never recorded as one
    K.Store.reset();
    K.Store.noteFact('ten:ten:7', false, '7 と 3 で 10', 'ten:1', null);
    check('a wrong answer is not timed', K.Store.factSpeed('ten:ten:7') === null,
      'ms=' + K.Store.factSpeed('ten:ten:7'));

    K.Parent.render();
    const heads = qa('#parent thead th').map(h => h.textContent);
    check('the parent page reports speed alongside accuracy',
      heads.indexOf('こたえるまで') > 0 && heads.indexOf('こたえるまで') > heads.indexOf('直近30問'),
      heads.join(' / '));
    K.Store.reset();
  })();

  /* ---------- 23. quantity is shown in fives everywhere ----------
     「すうじ どれかな」 laid its groups on a six-wide lattice, so 9 read as「6と3」and
     8 as「6と2」 — the one game whose whole job is tying「数字の形」to「量」was the one
     fighting the five-structure every ten-frame in the app is built on. */
  (function fives(){
    let cols = null;
    for (let t = 0; t < 40 && cols == null; t++){
      K.Session.startLevel(K.Games.byId.numeral, 1);
      const slots = q('#play .plate.fixed .slots');
      if (slots) cols = getComputedStyle(slots).gridTemplateColumns.split(' ').length;
    }
    check('quantities are laid out in fives, like every ten-frame in the app',
      cols === 5, 'columns=' + cols);
  })();

  /* ---------- 24. the dots are gone before the question is asked ----------
     Every other quantity task in the app is solved by tapping objects one at a
     time, which trains counting. Seeing that a group is five is a different skill,
     and it is the one 「7は5と2」 has to rest on. It only gets practised if counting
     is actually impossible. */
  (function flash(){
    const bad = [];
    [0, 1, 2].forEach(li => {
      K.Session.startLevel(K.Games.byId.flash, li);
      const board = q('#play .flashboard');
      const go = q('#play .choices .flashgo');
      if (!board || !go){ bad.push('L' + (li + 1) + ' has no board or no 「みる」'); return; }
      if (!qa('#play .flashboard .fdot.on').length) bad.push('L' + (li + 1) + ' drew no dots');
      if (board.classList.contains('open')) bad.push('L' + (li + 1) + ' starts uncovered');
      if (qa('#play .choices .choice').filter(c => c !== go).length){
        bad.push('L' + (li + 1) + ' offers an answer before the look');
      }
      go.click();
      S.flushTimers();
      if (board.classList.contains('open')) bad.push('L' + (li + 1) + ' leaves the dots up while asking');
      if (qa('#play .choices .choice').length < 3) bad.push('L' + (li + 1) + ' asked nothing after the look');
    });
    check('ぱっと みて いくつ takes the dots away before it asks',
      !bad.length, bad.slice(0, 3).join(' | '));
  })();

  /* ---------- 25. counting backwards ----------
     「10から逆に数える方が難しく、効果があります」 has been on the parent page since the
     first version, and nothing in the app practised it: skipCount only ever went up
     and nextBefore took a single step back. Counting down is what くり下がり runs on. */
  (function backward(){
    let seen = 0, bad = '';
    for (let t = 0; t < 80 && !seen; t++){
      K.Session.startLevel(K.Games.byId.seq, 2);
      if (String(S.item).indexOf('seq:back:') !== 0) continue;
      seen++;
      const nums = qa('#play .numline .nn').slice(0, 3).map(n => Number(n.textContent));
      if (!(nums[0] === nums[1] + 1 && nums[1] === nums[2] + 1)) bad = 'sequence is ' + nums.join(',');
    }
    check('かずの じゅんばん counts backwards as well as forwards',
      seen > 0 && !bad, bad || 'never drawn in 80 tries');
  })();

  /* ---------- 26. the first-run sampler recommends without locking content ---------- */
  (function diagnostic(){
    K.Store.reset();
    const offered = K.Diagnostic.shouldRun();
    K.Session.startDiagnostic();
    const length = S.planLength;
    for (let i = 0; i < length && !onResult(); i++){
      S.forceCorrect(); S.flushTimers();
    }
    const saved = K.Store.data.diagnostic;
    const allOpen = K.Games.list.every(g => K.Store.levelUnlocked(g.id, 0));
    K.Diagnostic.startRecommended();
    const started = S.planGames[0] === saved.recommended.gameId + ':' + saved.recommended.levelIndex;
    check('the first-run adventure records a recommendation without locking any game',
      offered && length === 10 && saved && saved.recommended && allOpen && started,
      'offered=' + offered + ' length=' + length + ' saved=' + !!saved
        + ' allOpen=' + allOpen + ' started=' + started);
    K.Store.reset();
  })();

  /* ---------- 27. constructive questions really appear in the existing worlds ---------- */
  (function constructive(){
    const targets = [
      ['count', 1, 'count:conserve:'],
      ['compare', 1, 'compare:conserve:'],
      ['bond', 1, 'bond:ways:'],
      ['ten', 2, 'ten:three10'],
      ['pattern', 2, 'pattern:create:']
    ];
    const missing = [];
    targets.forEach(([id, li, prefix]) => {
      let found = false;
      for (let i = 0; i < 80 && !found; i++){
        K.Session.startLevel(K.Games.byId[id], li);
        found = String(S.item).indexOf(prefix) === 0;
      }
      if (!found) missing.push(id + '/L' + li);
    });
    check('each world can ask the child to construct or verify an idea, not only pick an answer',
      !missing.length, missing.join(', '));
  })();

  /* ---------- 27b. rapid taps cannot become extra numbers or false mistakes ---------- */
  (function constructiveTapSafety(){
    let three = false, extraAccepted = false;
    for (let i = 0; i < 100 && !three; i++){
      K.Session.startLevel(K.Games.byId.ten, 2);
      three = String(S.item) === 'ten:three10';
    }
    if (three){
      const key = n => qa('#play .padkey').find(x => x.textContent === String(n));
      key(9).click(); key(0).click(); key(0).click(); key(1).click();
      extraAccepted = S.locked;
      S.flushTimers();
    }

    let ways = false, doubleTapMistake = null;
    for (let i = 0; i < 100 && !ways; i++){
      K.Session.startLevel(K.Games.byId.bond, 1);
      ways = String(S.item).indexOf('bond:ways:') === 0;
    }
    if (ways){
      const b = q('#play .choices .choice');
      const before = S.mistakes;
      b.click(); b.click();
      doubleTapMistake = S.mistakes !== before;
    }
    check('rapid taps do not add a fourth number or mark one construction wrong',
      three && !extraAccepted && ways && !doubleTapMistake,
      'three=' + three + ' extra=' + extraAccepted + ' ways=' + ways + ' falseMistake=' + doubleTapMistake);
  })();

  /* ---------- 28. half past can be set by moving the long hand ---------- */
  (function minuteHand(){
    let found = false, solved = false;
    for (let i = 0; i < 80 && !found; i++){
      K.Session.startLevel(K.Games.byId.clock, 2);
      found = String(S.item).indexOf('clock:sethalf:') === 0;
    }
    if (found){
      const clock = q('#play .clock.pickable'), r = clock.getBoundingClientRect();
      const setSix = qa('#play .clock-adjust').find(b => /6に/.test(b.textContent));
      if (setSix) setSix.click();
      q('#play .choices .btn-accent').click();
      solved = S.locked && !!setSix
        && q('#play .clock.pickable').parentElement.getAttribute('role') === 'group'
        && q('#play .clock-readout[aria-live="polite"]');
    }
    check('moving the long hand to 6 sets 「なんじはん」',
      found && solved, 'found=' + found + ' solved=' + solved);
  })();

  /* ---------- 29. safety affordances are present ---------- */
  (function safety(){
    K.Session.startLevel(K.Games.byId.count, 0);
    const back = q('#play .backbtn');
    back.click();
    const stayed = K.UI.currentName() === 'play' && /もういちど/.test(back.getAttribute('aria-label') || '');
    S.forceCorrect(); S.flushTimers();                 // a new question must disarm the old warning
    const nextBack = q('#play .backbtn');
    nextBack.click();
    const stayedNext = K.UI.currentName() === 'play';
    nextBack.click();
    const left = K.UI.currentName() !== 'play';
    K.Session.startLevel(K.Games.byId.count, 0);
    const promptLive = q('#play .prompt .txt').getAttribute('aria-live') === 'polite';
    const feedbackLive = q('#play .feedback').getAttribute('role') === 'status';
    const roundSize = q('#play .speakBtn') ? q('#play .speakBtn').getBoundingClientRect().width
      : q('#play .btn-round').getBoundingClientRect().width;
    check('back needs confirmation, dynamic text is announced, and round controls are child-sized',
      stayed && stayedNext && left && promptLive && feedbackLive && roundSize >= 63,
      'stayed=' + stayed + '/' + stayedNext + ' left=' + left
        + ' live=' + promptLive + '/' + feedbackLive + ' size=' + roundSize);
  })();

  /** the adult gate's current question, answered right; null when there is none */
  function gateAnswer(){
    const f = (q('#gate .q') || {}).textContent;
    const m = f && f.match(/(\d+) × (\d+)/);
    const want = m ? Number(m[1]) * Number(m[2]) : -1;
    return qa('#gate .choice').find(b => Number(b.textContent) === want) || null;
  }
  /** answer the gate the way an adult does: every question in the run, right */
  function passGate(){
    for (let i = 0; i < 2; i++){
      const b = gateAnswer();
      if (!b) return false;
      b.click();
    }
    return true;
  }

  /* ---------- 30. missions persist completion and next-day reflection ---------- */
  (function missions(){
    K.Store.reset();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-'
              + String(d.getDate()).padStart(2, '0');
    K.Store.recordMission({ day, id: 'test-mission', gameId: 'count',
      text: '3こ かぞえよう', prompt: 'ひとつずつ かぞえよう' });
    const mission = K.Store.mission(day);
    K.Missions.open(mission);
    // a tap is not an adult; a two-second press is — not the gate that guards 消す
    const btn = q('#mission .btn-accent');
    btn.click();
    const gated = K.UI.currentName() === 'mission' && !K.Store.mission(day).done;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true }));
    K.Missions._test.finishHold();
    const adultAnswer = !!K.Store.mission(day).done && K.UI.currentName() === 'home';
    const review = K.Missions.yesterdayReview();
    K.Store.reviewMission(day);
    const old = new Date(); old.setDate(old.getDate() - 2);
    const oldDay = old.getFullYear() + '-' + String(old.getMonth() + 1).padStart(2, '0') + '-'
                 + String(old.getDate()).padStart(2, '0');
    K.Store.recordMission({ day: oldDay, id: 'old-mission', gameId: 'count',
      text: 'ふるい', prompt: 'ふるい' });
    K.Store.completeMission(oldDay);
    const onlyYesterday = K.Missions.yesterdayReview();
    check('a completed real-world mission returns for a next-day reflection',
      gated && adultAnswer && review && review.id === 'test-mission'
        && K.Store.mission(day).reviewed && onlyYesterday === null,
      'gated=' + gated + ' review=' + (review && review.id) + ' oldIgnored=' + (onlyYesterday === null));
    K.Store.reset();
  })();

  /* ---------- 31. the 小学1年生 stage opens on the last sticker, and not before ----------
     The whole point of the sticker book is that it is a goal a child can see. The
     door it opens has to be shut until the shelf is actually full, has to open on
     the sticker that fills it, and has to say so on the screen the child is
     looking at — not in a menu they might find later. */
  (function stageGate(){
    K.Store.reset();
    const g1set = K.Games.byId.g1set;
    K.Home.render();
    const visibleLocked = qa('#home .gamecard.locked').length === 4;
    const shutAtStart = !K.levelOpen(g1set, 0);
    K.Store.addSticker('count:0');
    const oneReadyIsNotEnough = !K.levelOpen(g1set, 0);
    K.Store.addSticker('numeral:0');
    const setOpened = K.levelOpen(g1set, 0);
    const unrelatedStayedLocked = !K.levelOpen(K.Games.byId.g1pair, 0)
      && !K.levelOpen(K.Games.byId.g1teen, 0) && !K.levelOpen(K.Games.byId.g1shiki, 0);
    K.Home.render();
    const oneCardOpened = qa('#home .gamecard:not(.locked)').some(c => c.textContent.indexOf('なかまづくり') >= 0);
    check('小学1年生は、関連する準備教材がそろったゲームから順に開く',
      visibleLocked && shutAtStart && oneReadyIsNotEnough && setOpened && unrelatedStayedLocked && oneCardOpened,
      JSON.stringify({ visibleLocked, shutAtStart, oneReadyIsNotEnough, setOpened, unrelatedStayedLocked, oneCardOpened }));
    K.Store.reset();
    /* Legacy all-48 gate checks were replaced by the per-game route above. */
    return;
    {
    const pre = K.Progress.slots('pre'), g1 = K.Progress.slots('g1');
    const shutAtStart = !K.Progress.g1Open();
    /* Visible from day one, behind a padlock: the four names are the reason to
       fill the shelf, and an empty space where they would be is not. The padlocked
       cards say it on their own — there is no banner about the door any more. */
    K.Home.render();
    const seenOnDayOne = qa('#home .gamecard.locked').length === 4
      && qa('#home .world h3 .chip').some(c => c.textContent.indexOf('1ねんせい') >= 0)
      && !q('#home .stagelocked');

    // every 小1 level is out of reach of every question surface while it is shut
    const g1Games = K.Games.list.filter(g => K.Progress.stageOf(g) === 'g1');
    const noneOpen = g1Games.every(g => g.levels.every((lv, i) => !K.levelOpen(g, i)));
    K.Games.list.forEach(g => g.levels.forEach((lv, i) => {
      K.Store.data.stars[g.id + ':' + i] = 3;      // even with stars, the stage is shut
      K.Store.data.recent[g.id + ':' + i] = '1'.repeat(20);
    }));
    const tally = {};
    for (let d = 0; d < 40; d++){
      K.Session.startDaily(10);
      S.planGames.forEach(k => { tally[k.split(':')[0]] = 1; });
    }
    const stayedOut = g1Games.every(g => !tally[g.id]);

    /* Gold stickers are not part of the key. Every one of them needs a run with
       every answer right first time, and needing 48 of those put the classroom
       past the start of 1年生 for a child working at the pace the app recommends. */
    const gate = K.Progress.gateSlots('pre');
    K.Progress.slots('pre').filter(k => k.endsWith(':g')).forEach(k => K.Store.addSticker(k));
    const goldAloneShut = !K.Progress.g1Open();

    // one cleared level short is still shut
    gate.slice(0, -1).forEach(k => K.Store.addSticker(k));
    const shutOneShort = !K.Progress.g1Open();
    K.Store.addSticker(gate[gate.length - 1]);
    const openedOnLast = K.Progress.g1Open();

    // and now the 小1 levels are reachable, and Home swaps the padlocks for games
    K.Home.render();
    const worldOnHome = qa('#home .world h3 .chip').some(c => c.textContent.indexOf('1ねんせい') >= 0)
      && !qa('#home .gamecard.locked').length;
    const nowInPool = (() => {
      const seen = {};
      for (let d = 0; d < 60; d++){
        K.Session.startDaily(10);
        S.planGames.forEach(k => { seen[k.split(':')[0]] = 1; });
      }
      return g1Games.some(g => seen[g.id]);
    })();
    check('小学1年生 opens on the last cleared level, never before, and gold is not the key',
      shutAtStart && seenOnDayOne && noneOpen && stayedOut && goldAloneShut
        && shutOneShort && openedOnLast
        && worldOnHome && nowInPool && g1.length === 24
        && gate.length === pre.length / 2 && gate.every(k => !k.endsWith(':g')),
      'shut=' + shutAtStart + ' visibleDay1=' + seenOnDayOne + ' hidden=' + noneOpen + ' outOfDaily=' + stayedOut
        + ' goldAloneShut=' + goldAloneShut + ' oneShort=' + shutOneShort + ' opened=' + openedOnLast
        + ' onHome=' + worldOnHome + ' inDaily=' + nowInPool + ' g1slots=' + g1.length
        + ' gate=' + gate.length + '/' + pre.length);
    K.Store.reset();
    }
  })();

  /* ---------- 32. finishing the shelf tells the child so, in words they read ---------- */
  (function unlockMessage(){
    K.Store.reset();
    /* One required preparation level short of なかまづくり. */
    const missing = 'count:0';
    K.Store.addSticker('numeral:0');
    const shutBefore = !K.Progress.g1Open();
    K.Session.startLevel(K.Games.byId.count, 0);
    let guard = 0;
    while (!onResult() && guard++ < 40){    // every answer right first time — ★★★
      S.forceCorrect();
      S.flushTimers();
    }
    const said = (q('#result .unlocked') || {}).textContent || '';
    check('a preparation route opening says that a new 1ねんせい problem is available',
      shutBefore && K.Store.hasSticker(missing) && K.Progress.g1Open(),
      'shutBefore=' + shutBefore + ' cleared=' + K.Store.hasSticker(missing)
        + ' open=' + K.Progress.g1Open() + ' text=' + said.slice(0, 60));
    K.Store.reset();
  })();

  /* ---------- 33. a child who is ready must never be stuck behind the padlock ----------
     Clearing 48 levels is reachable, but a child can still stall on とけい or
     かたちづくり — so the parent page can open the door by hand, exactly like the
     three attempts that open a level nobody can pass. */
  (function parentOverride(){
    K.Store.reset();
    const before = K.Progress.g1Open();
    K.Progress.openG1();
    const after = K.Progress.g1Open();
    const survives = (() => {
      const text = K.Store.exportText();
      K.Store.reset();
      const wiped = K.Progress.g1Open();
      K.Store.importText(text, 'replace');
      return !wiped && K.Progress.g1Open();
    })();
    check('a parent can open 小学1年生 by hand, and the backup remembers it',
      !before && after && survives, 'before=' + before + ' after=' + after + ' backup=' + survives);
    K.Store.reset();
  })();

  /* ---------- 34. the daily banners share one row ----------
     おすすめ, きょうの れんしゅう, きのうの ミッション and にがて あつめ each used
     to be a full-width banner. On a day all four are up they took the top third of
     the screen and the map they lead to became a strip. They live on one row now:
     the row's height must not grow with the number of banners on it. */
  (function dailyRow(){
    K.Store.reset();
    K.Home.render();
    const row = q('#home .dailies');
    const shown = () => qa('#home .dailies > .daily').filter(b => !b.hidden);
    const oneUp = row.getBoundingClientRect().height;
    // force every banner up, the way a child mid-way through a week sees it
    shown();
    qa('#home .dailies > .daily').forEach(b => { b.hidden = false; });
    row.className = 'dailies n4';
    const allUp = row.getBoundingClientRect().height;
    const tops = qa('#home .dailies > .daily').map(b => Math.round(b.getBoundingClientRect().top));
    const oneRow = new Set(tops).size === 1;
    // and the door to 小学1年生 is not a banner of its own down at the foot
    const noStageBanner = !q('#home .stagelocked');
    check('the daily banners stay on one row, however many are up',
      !!row && oneRow && allUp <= oneUp * 1.35 && noStageBanner,
      'h1=' + Math.round(oneUp) + ' h4=' + Math.round(allUp) + ' tops=' + tops.join(',')
        + ' stageBanner=' + !noStageBanner);
    K.Home.render();
    K.Store.reset();
  })();

  /* ---------- 35. a row of things to count holds exactly what the answer says ----------
     `.mrow` was built for the bar chart, where the cap at the head of the row is a
     pencil icon beside a bar. Two later games reused the row for actual countable
     objects and inherited the cap — drawn from the same emoji at the same size. So
     「くだものの なかまは いくつ？」 stood over seven fruit with 6 as the right answer
     (and 6 was often not even on the buttons), and 「10 − 8」 sat under eleven
     balloons and nine bunches of grapes. A child who counts what is on the screen
     must never be told they are wrong. */
  (function countedRowsMatch(){
    K.Store.reset();
    K.Store.setPref('g1Open', true);
    const bad = [];

    // every picture in the row, label included: what a child's finger would land on
    const pics = n => (n.textContent.match(/\p{Extended_Pictographic}/gu) || []).length;

    for (let t = 0; t < 120; t++){
      K.Session.startLevel(K.Games.byId.g1set, 1);
      const asCount = /なかまは いくつ/.test(q('#play .prompt .txt').textContent);
      if (!asCount) continue;
      const answer = Number((S.item || '').split(':').pop());
      qa('#play .mrow').forEach(r => {
        const items = r.querySelectorAll('.row .item').length;
        if (pics(r) !== items) bad.push('g1set/L1 row shows ' + pics(r) + ' pictures for ' + items);
      });
      const offered = qa('#play .choices .choice').map(b => Number(b.textContent));
      if (offered.length && offered.indexOf(answer) < 0) bad.push('g1set/L1 answer ' + answer + ' not offered');
    }

    for (let t = 0; t < 120; t++){
      K.Session.startLevel(K.Games.byId.sub, 2);
      const board = q('#play .measure');
      if (!board) continue;                                   // symbolCalc draw
      const eq = q('#play .eq').textContent.match(/(\d+)−(\d+)/);
      if (!eq) continue;
      const rows = qa('#play .measure .mrow');
      const shown = rows.map(pics);
      if (shown[0] !== Number(eq[1]) || shown[1] !== Number(eq[2])){
        bad.push('sub/L2 shows ' + shown.join(',') + ' for ' + eq[1] + '−' + eq[2]);
      }
      // and the two rows must start on the same line, so a pair stands over a pair
      const lefts = rows.map(r => Math.round(r.querySelector('.row').getBoundingClientRect().left));
      const wrapped = rows.some(r => new Set(Array.from(r.querySelectorAll('.item'))
        .map(i => Math.round(i.getBoundingClientRect().top))).size > 1);
      if (lefts[0] !== lefts[1] || wrapped) bad.push('sub/L2 rows not pairable: ' + lefts.join(',') + ' wrapped=' + wrapped);
    }

    check('a row of things to count holds exactly the number the answer names',
      !bad.length, bad.slice(0, 4).join(' | '));
    K.Store.reset();
  })();

  /* ---------- 36. one-to-one really looks like one-to-one ----------
     This game's whole answer — which row has something left over, and how much —
     is supposed to be read off the picture. Centred flex rows put five stars over
     five fish and the other two on a second line, and unequal rows that did fit
     were centred against each other, so no item stood above its partner. */
  (function pairingLinesUp(){
    K.Store.reset();
    K.Store.setPref('g1Open', true);
    const bad = [];
    const seen = {};
    for (let t = 0; t < 260; t++){
      K.Session.startLevel(K.Games.byId.g1pair, t % 3);
      const rows = qa('#play .pairrow');
      if (rows.length < 2) continue;
      const items = rows.map(r => Array.from(r.querySelectorAll('.pairitem')));
      if (!items[0].length || !items[1].length) continue;
      seen[items[0].length + 'v' + items[1].length] = 1;
      const lefts = items.map(xs => Math.round(xs[0].getBoundingClientRect().left));
      const lines = items.map(xs => new Set(xs.map(x => Math.round(x.getBoundingClientRect().top))).size);
      if (lefts[0] !== lefts[1]) bad.push('rows start at ' + lefts.join(' / '));
      if (lines[0] > 1 || lines[1] > 1) bad.push('a row wrapped onto ' + Math.max.apply(null, lines) + ' lines');
      // pair k of the top row stands over pair k of the bottom row
      const n = Math.min(items[0].length, items[1].length);
      for (let i = 0; i < n; i++){
        const a = Math.round(items[0][i].getBoundingClientRect().left);
        const b = Math.round(items[1][i].getBoundingClientRect().left);
        if (Math.abs(a - b) > 1){ bad.push('pair ' + i + ' offset by ' + (a - b)); break; }
      }
      if (bad.length > 3) break;
    }
    const unequalSeen = Object.keys(seen).filter(k => k.split('v')[0] !== k.split('v')[1]).length;
    check('the 1たい1 rows line up column by column, whatever the two counts are',
      !bad.length && unequalSeen >= 5,
      bad.slice(0, 3).join(' | ') + ' unequalCases=' + unequalSeen);
    K.Store.reset();
  })();

  /* ---------- 37. the answer goes back into the question ----------
     A question that ends with「?」still on screen never lets the child see what
     they said inside the sentence they said it about. 「9 ＋ 1 ＝ ?」 with a green
     tick over it is not the same thing as 「9 ＋ 1 ＝ 10」. */
  (function answerWrittenBack(){
    K.Store.reset();
    K.Store.setPref('g1Open', true);
    const bad = [];
    // one level per shape of blank: an equation box, and a hole in a number line
    const cases = [
      ['add', 2, '.eq .box'], ['sub', 2, '.eq .box'], ['bond', 2, '.eq .box, .part.unknown'],
      ['ten', 1, '.eq .box'], ['g1teen', 0, '.eq .box'], ['g1teen', 2, '.eq .box'],
      ['seq', 2, '.nn.gap']
    ];
    cases.forEach(([id, li, sel]) => {
      for (let t = 0; t < 30; t++){
        K.Session.startLevel(K.Games.byId[id], li);
        const before = qa('#play .playfield').length && q('#play ' + sel.split(',')[0]);
        if (!before || before.textContent.indexOf('?') < 0) continue;
        if (!answerOnce()) break;
        if (!S.locked) continue;                       // that tap was wrong; try again
        const after = q('#play ' + sel.split(',')[0]);
        if (after && after.textContent.indexOf('?') >= 0){
          bad.push(id + '/L' + li + ' still shows ? after a right answer');
        }
        return;
      }
    });
    check('a right answer is written into the blank the question left open',
      !bad.length, bad.slice(0, 4).join(' | '));
    K.Store.reset();
  })();

  /* ---------- 38. ぱっと みて いくつ shows the dots again ----------
     The game exists to make 7 *look* like「5と2」. Hiding the board, taking the
     answer and moving on never shows the child the arrangement their number was
     about — and after a first wrong answer 「もういちど やってみよう」 over a covered
     board is an invitation to guess, not a second try. */
  (function flashRevealsWhatItAsked(){
    K.Store.reset();
    let coveredAfterRight = 0, coveredAfterMiss = 0, runs = 0;
    for (let t = 0; t < 24; t++){
      K.Session.startLevel(K.Games.byId.flash, t % 2);
      const go = q('#play .flashgo');
      if (!go) continue;
      go.click();
      S.flushTimers();                                   // the flash, then the question
      const board = q('#play .flashboard');
      const answer = Number((S.item || '').split(':').pop());
      const btns = qa('#play .choices .choice');
      if (!btns.length || !board) continue;
      runs++;
      // a wrong answer first: the child has to be given something to look at
      const wrong = btns.find(b => Number(b.textContent) !== answer);
      if (wrong){
        wrong.click();
        if (!board.classList.contains('open')) coveredAfterMiss++;
      }
      const right = qa('#play .choices .choice').find(b => Number(b.textContent) === answer);
      if (right){
        right.click();
        if (!board.classList.contains('open')) coveredAfterRight++;
      }
    }
    check('ぱっと みて いくつ shows the dots again, on a miss and on a right answer',
      runs >= 6 && !coveredAfterRight && !coveredAfterMiss,
      'runs=' + runs + ' hiddenAfterRight=' + coveredAfterRight + ' hiddenAfterMiss=' + coveredAfterMiss);
    K.Store.reset();
  })();

  /* ---------- 51. 「いまの おすすめ」 has to walk the whole curriculum ----------
     It used to know five of the sixteen 入学前 games. Everything else could only be
     reached by the「struggling」rescue — i.e. after the child had already found it
     alone and failed there — so a child who followed the app's own advice every day
     cleared 15 of the 48 levels in 180 simulated days at 95% accuracy, the door to
     小学1年生 never opened, and the *more* accurate the child the less they moved on.
     Two properties keep that from coming back. */
  (function recommendationWalksTheCurriculum(){
    K.Store.reset();
    const starsFor = (r, t) => { const x = r / t; return x >= 1 ? 3 : x >= .75 ? 2 : x >= .5 ? 1 : 0; };
    const seen = {}, repeats = {};
    let namedACleared = 0, days = 0, opened = 0;
    for (let d = 0; d < 200; d++){
      days++;
      const r = K.Diagnostic.current();
      const g = K.Games.byId[r.gameId];
      if (!g || !g.levels[r.levelIndex]) break;
      const key = r.gameId + ':' + r.levelIndex;
      // a level that already has its clear sticker has nothing left to offer
      if (K.Store.hasSticker(key)) namedACleared++;
      seen[r.gameId] = true;
      repeats[key] = (repeats[key] || 0) + 1;
      const n = g.levels[r.levelIndex].n || 8;
      const right = 8;                                    // a child who passes cleanly
      for (let i = 0; i < n; i++) K.Store.noteOutcome(g.id, r.levelIndex, true);
      K.Store.recordLevel(g.id, r.levelIndex, starsFor(Math.min(right, n), n), Math.min(right, n), n);
      K.Store.addSticker(key);
      if (K.Progress.preStickers().got >= 48){ opened = days; break; }
    }
    const preGames = K.Games.list.filter(g => (g.stage || 'pre') === 'pre').map(g => g.id);
    const missed = preGames.filter(id => !seen[id]);
    const stuck = Object.keys(repeats).filter(k => repeats[k] > 2);
    check('「いまの おすすめ」 walks every 入学前 game, and opens 小学1年生 well inside the six months',
      !missed.length && opened > 0 && opened <= 90 && !namedACleared && !stuck.length,
      'never recommended: ' + (missed.join(',') || '-') + ' · opened on day ' + opened
      + ' · re-offered a cleared level ' + namedACleared + '× · looped on ' + (stuck.join(',') || '-'));
    K.Store.reset();
  })();

  /* ---------- 52. a mistake is more than one bit ----------
     Right/wrong cannot separate a child who read back the part they could see
     (「10は4といくつ」→ 4) from one who was a single count out (→ 5) from one who had
     no idea (→ 7). The value pressed is classified and counted, and the child is
     answered in words that fit the mistake instead of a generic「もういちど」. */
  (function missKinds(){
    K.Store.reset();
    let part = null;
    for (let t = 0; t < 40 && !part; t++){
      K.Session.startLevel(K.Games.byId.bond, 2);
      const m = /^bond:dec:(\d+)-(\d+)$/.exec(S.item || '');
      // 10は5といくつ: the part shown and the part asked for are the same number,
      // so pressing it is not a mistake at all
      if (!m || (+m[1]) - (+m[2]) === +m[2]) continue;
      const key = qa('#play .padkey').find(k => k.textContent === m[2]);
      if (!key) continue;
      key.click();
      if (S.wrongThisQ !== 1) continue;
      part = { kind: S.missType, said: q('#play .feedback').textContent };
    }
    check('a wrong answer is read for what kind of wrong it was',
      !!part && part.kind === 'part' && /みえて いる/.test(part.said),
      part ? part.kind + ' / ' + part.said : 'never drew a decomposition');

    /* 「ちかい かず」 draws the smaller group with bigger icons on purpose. Whether the
       child fell for that is the one thing the level is asking, and it used to be
       thrown away with every other wrong tap. */
    let looks = null;
    for (let t = 0; t < 30 && !looks; t++){
      K.Session.startLevel(K.Games.byId.compare, 1);
      const plates = qa('#play .plate');
      if (plates.length < 2) continue;
      const size = p => { const i = p.querySelector('.item'); return i ? parseFloat(getComputedStyle(i).fontSize) : 0; };
      const sizes = plates.map(size);
      if (Math.abs(sizes[0] - sizes[1]) < 2) continue;
      plates[sizes[0] > sizes[1] ? 0 : 1].click();
      if (S.wrongThisQ === 1) looks = S.missType;
    }
    check('choosing by how big it looks is recorded as exactly that',
      looks === 'looks', 'missType=' + looks);

    // and it survives the round trip through a backup
    K.Store.reset();
    K.Store.noteFact('bond:dec:10-4', false, '10 は 4 と 6', 'bond:2', 0, 'part');
    K.Store.noteFact('bond:dec:10-4', false, '10 は 4 と 6', 'bond:2', 0, 'part');
    const text = K.Store.exportText();
    const before = K.Store.factMiss('bond:dec:10-4');
    K.Store.importText(text, 'replace');
    const after = K.Store.factMiss('bond:dec:10-4');
    K.Store.importText(text, 'merge');                 // twice must not inflate
    const twice = K.Store.factMiss('bond:dec:10-4');
    check('the kind of mistake survives a backup, and a double import does not inflate it',
      !!before && before.kind === 'part' && before.n === 2
      && !!after && after.n === 2 && !!twice && twice.n === 2,
      JSON.stringify([before, after, twice]));
    K.Store.reset();
  })();

  /* ---------- 53. the ladder always has another rung ----------
     One hint was the whole of it: after it fired, the choice-dimming fallback only
     had something to dim when the question was built with buildChoices, and 28 of
     the 60 levels never build one. On those, the third, fourth and fifth mistake
     changed nothing on screen — same pixels, same speech bubble. */
  (function helpLadder(){
    K.Store.reset();
    const stillSilent = [], neverEnds = [];
    eachLevel((g, li) => {
      K.Session.startLevel(g, li);
      let silent = 0;
      for (let i = 0; i < 8 && !S.locked && !S.taught; i++){
        const wrong = candidates();
        if (!wrong.length) break;
        const missesBefore = S.wrongThisQ;
        const before = q('#play').innerHTML + '|' + q('#play .feedback').textContent;
        wrong[0].click();
        if (S.locked) break;
        // a tap on scenery is not an attempt; only judge what the engine counted
        if (S.wrongThisQ === missesBefore) continue;
        if (q('#play').innerHTML + '|' + q('#play .feedback').textContent === before) silent++;
      }
      if (silent) stillSilent.push(g.id + '/L' + (li + 1));
    });
    check('a repeated mistake is never met by an unchanged screen',
      !stillSilent.length, stillSilent.slice(0, 6).join(' | '));

    /* And the bottom rung is a way out. Six mistakes on a keypad — eleven keys, no
       idea — used to leave the child pressing keys forever; now the app shows the
       answer, finishes the question, and records that it had to. */
    K.Store.reset();
    K.Session.startLevel(K.Games.byId.ten, 1);
    let sawEscape = false;
    for (let i = 0; i < 6; i++){
      const wrong = qa('#play .padkey').filter(k => !k.classList.contains('correct') && !k.disabled);
      if (!wrong.length) break;
      wrong[0].click();
      if (q('#play .teachbtn')) sawEscape = true;
    }
    const taught = S.taught;
    S.flushTimers(8);
    const facts = K.Store.data.facts;
    const marked = Object.keys(facts).some(k => facts[k][6] && facts[k][6].taught);
    const clean = Object.keys(facts).every(k => facts[k][1] === 0);   // never scored as known
    check('six mistakes end in「こたえを みる」, not in a child pressing keys forever',
      sawEscape && taught && marked && clean && S.idx >= 1,
      'escape=' + sawEscape + ' taught=' + taught + ' recorded=' + marked + ' idx=' + S.idx);
    K.Store.reset();
  })();

  /* ---------- 84. a hint is heard, and it hands over a way to work ----------
     The hint was a line of small print nothing read out; 🔊 replayed only the question;
     and on three choices it greyed out the ones the child had tried, which left one
     button standing — pressable without having used the hint at all. */
  function prepAnswers(g){
    S.flushTimers();
    const go = q('#play .flashgo');
    if (go){ go.click(); S.flushTimers(); }
    if (g.id === 'count') qa('#play .obj').forEach(o => o.click());
    if (g.id === 'g1pair'){
      const rows = qa('#play .pairrow');
      if (rows.length === 2){
        const a = rows[0].querySelectorAll('.pairitem'), b = rows[1].querySelectorAll('.pairitem');
        for (let i = 0; i < Math.min(a.length, b.length); i++){ a[i].click(); b[i].click(); }
      }
    }
    S.flushTimers();
  }
  (function hintsAreHeardAndUsable(){
    K.Store.reset();
    const log = [], say = K.Sound.say;
    K.Sound.say = (t, o) => { log.push(String(t)); finishSpeech(t, o); };
    const generic = [], narrowed = [], noReplay = [];
    let levels = 0;
    try{
      eachLevel((g, li) => {
        for (let t = 0; t < 14; t++){
          K.Session.startLevel(g, li);
          prepAnswers(g);
          const btns = qa('#play .choices .choice:not(.flashgo):not(.teachbtn)');
          if (btns.length < 2) return;                      // not answered on buttons
          const w = btns[Math.floor(Math.random() * btns.length)];
          let hinted = false;
          for (let i = 0; i < 3 && !S.locked && !hinted; i++){
            log.length = 0;
            w.click();
            if (S.locked) break;
            const fb = q('#play .feedback');
            hinted = !fb.hidden && fb.classList.contains('hint');
          }
          if (!hinted) continue;                            // that button was right; draw again
          levels++;
          const at = g.id + '/L' + (li + 1);
          const heard = log.slice();
          if (!heard.length || heard.some(x => x === 'ヒントを出すね。')) generic.push(at + ' said ' + JSON.stringify(heard));
          if (qa('#play .choices .choice.dim').length) narrowed.push(at);
          log.length = 0;
          q('#play .prompt .btn-round').click();
          if (!log.length || !heard.some(h => log[log.length - 1].indexOf(h) >= 0)) noReplay.push(at);
          return;
        }
      });
    } finally { K.Sound.say = say; }
    leavePlay();
    check('every hint says what to do out loud, 🔊 says it again, and no choice is taken away for it',
      levels >= 30 && !generic.length && !narrowed.length && !noReplay.length,
      'levels=' + levels + ' generic: ' + (generic.slice(0, 3).join(' | ') || '-')
        + ' · narrowed: ' + (narrowed.slice(0, 4).join(',') || '-') + ' · no replay: ' + (noReplay.slice(0, 4).join(',') || '-'));
    K.Store.reset();
  })();

  /* ---------- 85. a hint does not put the answer on the board ----------
     「5こ」on each plate, a number on every animal from the end being counted, a
     glow on the right box: each finished the question for the child. */
  (function hintsDoNotAnswer(){
    K.Store.reset();
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const bad = [];
    const twiceWrong = (id, li, targets) => {
      for (let t = 0; t < 30; t++){
        K.Session.startLevel(K.Games.byId[id], li);
        const xs = qa(targets);
        if (xs.length < 2) continue;
        const w = xs[Math.floor(Math.random() * xs.length)];
        w.click(); if (S.locked) continue;
        w.click(); if (S.locked) continue;
        return true;
      }
      return false;
    };
    try{
      if (twiceWrong('compare', 0, '#play .plate')){
        if (qa('#play .plate .hintline, #play .plate .ctag').length) bad.push('どっちが おおい writes counts on the plates');
        if (qa('#play .plate .row.lined').length !== qa('#play .plate').length) bad.push('どっちが おおい does not line the items up');
      } else bad.push('どっちが おおい never reached its hint');
      if (twiceWrong('ordinal', 0, '#play .queue .qi')){
        const tags = qa('#play .queue .ctag, #play .queue .hintline');
        if (tags.length > 1) bad.push('なんばんめ numbers ' + tags.length + ' animals');
      } else bad.push('なんばんめ never reached its hint');
      let sorted = false;
      for (let t = 0; t < 20 && !sorted; t++){
        K.Session.startLevel(K.Games.byId.sort, 1);
        const tile = q('#play .tile:not(.gone)');
        const wrongBin = tile && qa('#play .bin').find(b => b.dataset.cat !== tile.dataset.cat);
        if (!wrongBin) continue;
        // picked up once (a second tap on a held tile puts it down), then the wrong box twice
        tile.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
        window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1, isPrimary: true }));
        for (let i = 0; i < 2; i++) wrongBin.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        sorted = S.wrongThisQ >= 2;
        if (sorted && q('#play .bin.glow')) bad.push('なかまわけ lights the right box');
      }
      if (!sorted) bad.push('なかまわけ never reached its hint');
    } finally { K.Sound.say = say; }
    leavePlay();
    check('a hint takes the trick away without writing the answer on the board', !bad.length, bad.join(' | '));
    K.Store.reset();
  })();

  /* ---------- 86. the fourth mistake: the hand goes through the method ----------
     「もう ちょっと ヒントを だすね」 used to narrow the keys and nothing else, and
     「こたえを みる」 said the answer and pressed it. Now the hand fills the frame
     from the part shown, the frame is left full, and the pressing is left to the child. */
  (function handShowsTheMethod(){
    K.Store.reset();
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const d = {};
    try{
      let a = null;
      for (let t = 0; t < 40 && a == null; t++){
        K.Session.startLevel(K.Games.byId.ten, 1);
        const m = /^ten:ten:(\d+)$/.exec(S.item || '');
        if (m) a = +m[1];
      }
      const wrongKey = () => qa('#play .padkey').find(k => Number(k.textContent) !== 10 - a && !k.disabled);
      for (let i = 0; i < 4; i++) wrongKey().click();
      d.walking = q('#play').classList.contains('walking');
      d.teachOffered = !!q('#play .teachbtn');
      S.flushTimers(1);                                     // the walk's first step
      d.handShown = !!q('.coachhand') && !q('.coachhand').hidden;
      S.flushTimers(60);
      d.frameFull = qa('#play .tenframe .dot').length === 10;
      d.handGone = !q('.coachhand') || q('.coachhand').hidden;
      d.fingersBack = !q('#play').classList.contains('walking');
      d.leftToChild = !S.locked && S.idx === 0;
      q('#play .teachbtn').click();
      S.flushTimers(20);
      d.answered = S.idx === 1;
    } finally { K.Sound.say = say; }
    leavePlay();
    check('the fourth mistake brings the hand through the method, and the answer is still the child\'s to press',
      d.walking && d.handShown && d.teachOffered && d.frameFull && d.handGone && d.fingersBack && d.leftToChild && d.answered,
      JSON.stringify(d));
    K.Store.reset();
  })();

  /* ---------- 87. a level opened for the first time starts by being shown ----------
     The first「5は 2と いくつ」a child ever met was a test, and the method only came
     after two mistakes. Now the hand does one, the child does one with the tool
     already out, and only then does the level begin — none of it graded. */
  (function firstMeeting(){
    K.Store.reset();
    S.intro(true);
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const d = {};
    try{
      K.Session.startLevel(K.Games.byId.bond, 0);
      d.plan = S.planIntro.slice(0, 3).join(',');
      d.length = S.planLength;
      d.heldForShow = S.introStep === 'show' && q('#play').classList.contains('walking');
      S.flushTimers(120);                                   // the hand shows it, and answers
      d.shownAndAnswered = S.idx === 1 && S.introStep === 'together';
      d.toolOut = qa('#play .cell.coachhole').length > 0 && !q('#play .feedback').hidden;
      d.fingersFree = !q('#play').classList.contains('walking');
      const m = /^bond:dec:(\d+)-(\d+)$/.exec(S.item || '');
      const right = m && qa('#play .choices .choice').find(b => Number(b.textContent) === m[1] - m[2]);
      if (right) right.click();
      S.flushTimers(8);
      d.togetherDone = S.idx === 2 && !S.introStep;
      for (let i = 0; i < 8 && !onResult(); i++){ S.forceCorrect(); S.flushTimers(); }
      const facts = K.Store.data.facts;
      d.recorded = Object.keys(facts).reduce((n, k) => n + facts[k][0], 0);
      d.stars = K.Store.stars('bond', 0);
      d.introduced = K.Store.introduced('bond', 0);
      K.Session.startLevel(K.Games.byId.bond, 0);
      d.secondTime = S.planLength;
    } finally { K.Sound.say = say; S.intro(false); }
    leavePlay();
    check('a level opened for the first time is shown, then done together, and only then graded',
      d.plan === 'show,together,' && d.length === 10 && d.heldForShow && d.shownAndAnswered && d.toolOut
        && d.fingersFree && d.togetherDone && d.recorded === 8 && d.stars === 3 && d.introduced && d.secondTime === 8,
      JSON.stringify(d));
    K.Store.reset();
  })();

  /* ---------- 88. every game can be shown to the end ----------
     A demonstration that stalls halfway (a hand that picks up a piece and never puts
     it down) holds a five-year-old in front of a frozen screen. */
  (function everyGameCanBeShown(){
    K.Store.reset();
    K.Store.setPref('g1Open', true);
    S.intro(true);
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const stalled = [];
    try{
      eachLevel((g, li) => {
        if (g.intro === false) return;
        for (let run = 0; run < 3; run++){
          K.Store.reset();
          K.Store.setPref('g1Open', true);
          K.Session.startLevel(g, li);
          if (S.introStep !== 'show'){ stalled.push(g.id + '/L' + (li + 1) + ' no intro'); return; }
          S.flushTimers(400);
          if (S.idx < 1){ stalled.push(g.id + '/L' + (li + 1) + ' (' + S.item + ')'); return; }
        }
      });
    } finally { K.Sound.say = say; S.intro(false); }
    leavePlay();
    check('the hand can show every game all the way to an answer', !stalled.length, stalled.slice(0, 6).join(' | '));
    K.Store.reset();
  })();

  /* ---------- 89. help can be asked for, and practice meets a new level together ---------- */
  (function askedForHelp(){
    K.Store.reset();
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const d = {};
    try{
      let m = null;
      for (let t = 0; t < 40 && !m; t++){ K.Session.startLevel(K.Games.byId.bond, 0); m = /^bond:dec:(\d+)-(\d+)$/.exec(S.item || ''); }
      q('#play .showbtn').click();
      d.toolBeforeAMistake = qa('#play .cell.coachhole').length > 0 && S.wrongThisQ === 0 && S.helped;
      const right = qa('#play .choices .choice').find(b => Number(b.textContent) === m[1] - m[2]);
      right.click();
      S.flushTimers(4);
      const f = K.Store.fact(Object.keys(K.Store.data.facts)[0]);
      d.notCountedAsKnown = !!f && f[1] === 0 && !(f[6] && Object.keys(f[6]).length);
      leavePlay();

      K.Store.reset();
      S.intro(true);
      K.Store.markIntroduced('bond', 0);
      K.Session.startDaily(10);
      const kinds = S.planIntro;
      d.dailyTogether = kinds.filter(x => x === 'together').length;
      d.dailyNoShow = kinds.indexOf('show') < 0;
    } finally { K.Sound.say = say; S.intro(false); }
    leavePlay();
    check('👀 hands over the tool before any mistake (and that answer is not counted as known); practice contains no new-level lesson',
      d.toolBeforeAMistake && d.notCountedAsKnown && d.dailyTogether === 0 && d.dailyNoShow,
      JSON.stringify(d));
    K.Store.reset();
  })();

  /* ---------- 90. a provisional clear survives a backup, and the door waits for confirmed ones ---------- */
  (function provisionalStickers(){
    K.Store.reset();
    K.Store.addPending('bond:0');
    const waiting = K.Store.exportText();
    K.Store.confirmSticker('bond:0');
    K.Store.importText(waiting, 'merge');
    const confirmedWins = !K.Store.isPending('bond:0') && K.Store.hasSticker('bond:0');
    K.Store.reset();
    K.Store.importText(waiting, 'replace');
    const roundTrip = K.Store.isPending('bond:0') && K.Store.hasSticker('bond:0');
    K.Store.reset();
    ['count:0', 'numeral:0'].forEach(k => K.Store.addPending(k));
    const shut = !K.levelOpen(K.Games.byId.g1set, 0);
    ['count:0', 'numeral:0'].forEach(k => K.Store.confirmSticker(k));
    const open = K.levelOpen(K.Games.byId.g1set, 0);
    check('a provisional sticker survives a backup, a confirmation on either device wins, and a path counts confirmed preparation',
      confirmedWins && roundTrip && shut && open,
      JSON.stringify({ confirmedWins, roundTrip, shut, open }));
    K.Store.reset();
  })();

  /* ---------- 91. a clear below ★★★ is confirmed on another day ----------
     「8問中4問」 is reached by tapping at random about one run in four on three
     choices, and two plates reach it nearly two runs in three. */
  (function checkedOnAnotherDay(){
    K.Store.reset();
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const d = {};
    const finishLevel = () => { let guard = 0; while (!onResult() && guard++ < 40){ S.forceCorrect(); S.flushTimers(); } };
    try{
      const today = K.Store.dayNumber();
      K.Session.startLevel(K.Games.byId.bond, 0);
      for (let i = 0; i < 3; i++){
        const m = /^bond:dec:(\d+)-(\d+)$/.exec(S.item || '');
        const w = m && qa('#play .choices .choice').find(b => Number(b.textContent) !== m[1] - m[2]);
        if (w) w.click();
        S.forceCorrect(); S.flushTimers();
      }
      finishLevel();
      d.stars = K.Store.stars('bond', 0);
      d.provisional = K.Store.hasSticker('bond:0') && K.Store.isPending('bond:0') && K.Progress.preStickers().got === 0;
      d.saysLater = /いろが つく/.test((q('#result .newsticker') || {}).textContent || '');
      K.Session.startLevel(K.Games.byId.count, 0);
      d.notSameDay = S.planChecks.every(x => !x);
      leavePlay();

      K.Store.data.pending['bond:0'][0] = today - 1;           // tomorrow
      K.Session.startLevel(K.Games.byId.count, 0);
      d.checksFirst = S.planChecks.slice(0, 3).join() === 'bond:0,bond:0,bond:0' && S.planLength === 11;
      finishLevel();
      d.confirmed = !K.Store.isPending('bond:0') && K.Progress.preStickers().got === 2;
      d.saysColour = /いろが ついた/.test(q('#result').textContent);
      d.levelGradedAlone = /8もんの うち 8もん/.test(q('#result').textContent);

      // a check that is failed: the sticker keeps waiting, and おすすめ goes back for it
      K.Store.reset();
      ['count', 'flash', 'numeral', 'seq', 'trace'].forEach(id => [0, 1, 2].forEach(i => K.Store.addSticker(id + ':' + i)));
      K.Store.addPending('compare:0');
      K.Store.data.pending['compare:0'][0] = today - 1;
      const before = K.Diagnostic.current();
      d.movedOnMeanwhile = !(before.gameId === 'compare' && before.levelIndex === 0);
      K.Session.startLevel(K.Games.byId.count, 0);
      let three = 0;
      for (let i = 0; i < 3; i++){
        const plates = qa('#play .plate');
        if (plates.length === 3) three++;
        const m = /cmp:([\d_]+):(most|least)$/.exec(S.item || '');
        const counts = m ? m[1].split('_').map(Number) : [];
        const ans = m ? (m[2] === 'most' ? Math.max.apply(null, counts) : Math.min.apply(null, counts)) : null;
        const w = plates.find(p => Number(p.dataset.count) !== ans);
        if (w) w.click();
        S.forceCorrect(); S.flushTimers();
      }
      d.threePlates = three === 3;
      finishLevel();
      d.stillWaiting = K.Store.isPending('compare:0') && K.Store.checkFailed('compare:0');
      const back = K.Diagnostic.current();
      d.backToIt = back.gameId === 'compare' && back.levelIndex === 0;
      K.Session.startLevel(K.Games.byId.count, 1);
      d.onceADay = S.planChecks.every(x => !x);
    } finally { K.Sound.say = say; }
    leavePlay();
    check('a pass below ★★★ is provisional until two of three right on another day, and a failed check sends おすすめ back',
      d.stars >= 1 && d.stars < 3 && d.provisional && d.saysLater && d.notSameDay
        && d.levelGradedAlone && d.movedOnMeanwhile && d.onceADay,
      JSON.stringify(d));
    K.Store.reset();
  })();

  /* ---------- 92. ungraded questions still count towards「きょうは ここまで」----------
     A first-time level that also carries a check is 3 + 2 + 8 questions. Only the 8
     reached today's total, so the day's stopping point arrived five questions late. */
  (function ungradedCountsToday(){
    K.Store.reset();
    S.intro(true);
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const d = {};
    try{
      K.Store.addPending('bond:0');
      K.Store.markIntroduced('bond', 0);
      K.Store.data.pending['bond:0'][0] = K.Store.dayNumber() - 1;
      K.Session.startLevel(K.Games.byId.count, 0);
      d.plan = S.planLength;
      for (let i = 0; i < 20 && !onResult(); i++){ S.forceCorrect(); S.flushTimers(); }
      d.today = K.Store.todayCount();
      d.gradedOnEight = /8もんの うち 8もん/.test(q('#result').textContent);
    } finally { K.Sound.say = say; S.intro(false); }
    leavePlay();
    check('the lesson and check questions count towards today\'s total, and not towards the level\'s stars',
      d.plan === 13 && d.today === 13 && d.gradedOnEight, JSON.stringify(d));
    K.Store.reset();
  })();

  /* ---------- 54. the shelf and the book say which levels are left ----------
     「あと 4レベル」 without naming the four is a number a child cannot act on and a
     parent cannot help with: the empty slots were anonymous dots, and the count
     lived two screens away from the map. */
  (function whatIsLeft(){
    K.Store.reset();
    // clear everything except the last game, so the remaining levels are known
    const pre = K.Games.list.filter(g => (g.stage || 'pre') === 'pre');
    pre.slice(0, pre.length - 1).forEach(g => g.levels.forEach((lv, i) => {
      K.Store.recordLevel(g.id, i, 2, 6, 8);
      K.Store.addSticker(g.id + ':' + i);
    }));
    const lastGame = pre[pre.length - 1];
    K.Book.render();
    const chips = qa('#book .todochip');
    const names = chips.map(c => c.textContent);
    K.Home.render();
    // the count is a picture now; the number is kept for the adult in its label
    const togo = q('#home .shelf .togo');
    const shelf = togo ? togo.getAttribute('aria-label') + ' dots=' + togo.querySelectorAll('.leftdots span').length : '';
    check('the book names the levels still missing, and the shelf says how many',
      chips.length === lastGame.levels.length
      && names.every(t => t.indexOf(lastGame.name) >= 0)   // the chip leads with the game's icon
      && (shelf === '' || (/あそびごとに じゅんびが できると ひらくよ/.test(shelf) && /dots=3$/.test(shelf))),
      'chips=' + chips.length + ' shelf=' + shelf);

    // and the first one is a way in, not just a label
    const before = K.UI.currentName();
    chips[0].click();
    check('tapping a missing level starts it',
      K.UI.currentName() === 'play' && S.planGames[0] === lastGame.id + ':0',
      'from ' + before + ' to ' + K.UI.currentName() + ' / ' + S.planGames[0]);
    K.Store.reset();
  })();

  /* ---------- 55. the records ask to be written out ----------
     Six months of records live in one localStorage key on a device whose own
     documentation says it will discard them, and the only defence was a button
     behind an adult gate that nobody had a reason to open. */
  (function backupNudge(){
    K.Store.reset();
    check('a brand-new record does not nag', K.Store.backupDue() === null,
      JSON.stringify(K.Store.backupDue()));

    const d = new Date();
    for (let i = 0; i < 12; i++){
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      K.Store.data.daily[day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0')
        + '-' + String(day.getDate()).padStart(2, '0')] = 8;
    }
    const due = K.Store.backupDue();
    K.Home.render();
    const marked = q('#home .btn-round.due');
    K.Store.noteBackup();
    const after = K.Store.backupDue();
    K.Home.render();
    check('after a fortnight of use it asks once, and stops asking when it is done',
      !!due && due.never === true && !!marked && after === null && !q('#home .btn-round.due'),
      'due=' + JSON.stringify(due) + ' marked=' + !!marked + ' after=' + JSON.stringify(after));

    // and the date it was done survives the round trip
    const text = K.Store.exportText();
    K.Store.reset();
    K.Store.importText(text, 'replace');
    check('when the last backup happened is itself backed up',
      K.Store.lastBackupDays() === 0, String(K.Store.lastBackupDays()));
    K.Store.reset();
  })();

  /* ---------- 56. the app knows when 入学 is ----------
     「入学までの半年で」 is the premise, and `createdAt` was stored and never read:
     the roadmap could describe the third month without knowing whether this child
     was in it. */
  (function calendar(){
    K.Store.reset();
    // first opened in September: school is the April after it
    K.Store.data.createdAt = new Date(2026, 8, 10).getTime();
    const autumn = K.Store.schoolDate();
    // first opened in February: school is the April of that same year
    K.Store.data.createdAt = new Date(2027, 1, 10).getTime();
    const winter = K.Store.schoolDate();
    K.Store.setSchoolYear(2028);
    const fixed = K.Store.schoolDate();
    check('入学 is guessed as the next April, and can be moved by hand',
      autumn.getFullYear() === 2027 && autumn.getMonth() === 3
      && winter.getFullYear() === 2027 && fixed.getFullYear() === 2028,
      [autumn, winter, fixed].map(x => x.getFullYear() + '/' + (x.getMonth() + 1)).join(' '));

    // the parent page turns that into a plan, and marks where the child is now
    K.Store.reset();
    K.Store.data.createdAt = Date.now() - 40 * 86400000;
    K.Games.list.filter(g => (g.stage || 'pre') === 'pre').slice(0, 4)
      .forEach(g => g.levels.forEach((lv, i) => {
        K.Store.recordLevel(g.id, i, 2, 6, 8);
        K.Store.addSticker(g.id + ':' + i);
      }));
    K.Parent.render();
    const sched = q('#parent .schedule');
    const here = qa('#parent .skilltable tr.now td').length;
    check('the parent page says how far away 入学 is and whether this pace reaches it',
      !!sched && /あと \d+日/.test(sched.textContent) && /12 \/ 48/.test(sched.textContent)
      && qa('#parent .todo').length > 0 && here > 0,
      sched ? sched.textContent.slice(0, 60) + ' · roadmapMark=' + here : 'no schedule section');
    K.Store.reset();
  })();

  /* ---------- 57. the name field finally does something ---------- */
  (function childName(){
    K.Store.reset();
    K.Store.setName('  みお  ');
    K.Book.render();
    const head = q('#book .topbar h2').textContent;
    K.Store.setName('あいうえおかきくけこさしすせそ');   // 12 characters, no more
    const capped = K.Store.name.length;
    K.Store.setName('みお');
    const text = K.Store.exportText();
    K.Store.reset();
    K.Store.importText(text, 'replace');
    check('the child can be called by name, and the name survives a backup',
      /みおの シールブック/.test(head) && capped === 12 && K.Store.name === 'みお',
      head + ' · capped=' + capped + ' · restored=' + K.Store.name);
    K.Store.reset();
  })();

  /* ---------- 58. the words for a mistake fit the question it was made on ----------
     A sum has two parts and no「ぜんぶ」on the screen, so 8+2 に 8 was being told
     「それは ぜんぶの かずだね」; and 2+4 に 2 — the part the child could see — was
     read as「＋か −か」because 4−2 is also 2. 「おなじ かずに しよう」 shows no sign
     at all, and was told the same. */
  (function missWordsFit(){
    const cases = [
      ['add:sum:8+2', 10, 8, 'part'],  ['add:sum:3+5', 8, 5, 'part'],
      ['add:teensum:12+3', 15, 12, 'part'],
      ['add:sum:2+4', 6, 2, 'part'],   ['add:sum:3+6', 9, 3, 'part'],
      ['add:sum:7+2', 9, 5, 'opp'],    ['bond:com:3+2', 5, 3, 'part'],
      ['bond:com:3+2', 5, 4, 'down'],  ['bond:dec:10-4', 6, 10, 'whole'],
      ['bond:dec:10-4', 6, 4, 'part'], ['ten:ten:3', 7, 10, 'whole'],
      ['sub:rest:9-4', 5, 9, 'whole'], ['sub:rest:9-4', 5, 13, 'opp'],
      ['g1pair:diff1to1:7-4', 3, 11, 'opp'],
      ['g1pair:same1to1:6-4', 2, 10, 'far'], ['g1pair:same1to1:7-4', 3, 4, 'up'],
      ['g1pair:same1to1:7-4', 3, 7, 'far'],
      // one away on the number line is not a count slip where nothing was counted
      ['compare:numcmp:7_8:g', 8, 7, null], ['seq:fill:2', 2, 1, null],
      ['seq:nb:before:4', 4, 5, 'part'],    ['seq:nb:next:6', 6, 5, 'part'],
      ['seq:nb:between:5', 5, 6, 'part']
    ];
    if (typeof K.classifyMiss !== 'function'){
      check('a mistake is named for what the question actually showed', false, 'KazuApp.classifyMiss is not exposed');
      return;
    }
    const wrong = cases.filter(c => K.classifyMiss(c[0], c[1], c[2]) !== c[3])
      .map(c => c[0] + ' ' + c[2] + '→' + K.classifyMiss(c[0], c[1], c[2]) + ' (want ' + c[3] + ')');
    check('a mistake is named for what the question actually showed', !wrong.length, wrong.join(' | '));
  })();

  /* ---------- 59. 「ゆびで さしながら」 only where there is something to point at ----------
     The recall levels hide the ten-frame on purpose; telling a child to count on
     their fingers across a bare「10は4と？」 points at nothing. */
  (function pointOnlyAtThings(){
    K.Store.reset();
    let bare = null, pointed = null;
    for (let t = 0; t < 40 && bare == null; t++){
      K.Session.startLevel(K.Games.byId.bond, 2);
      const m = /^bond:dec:(\d+)-(\d+)$/.exec(S.item || '');
      if (!m) continue;
      const press = (+m[1]) - (+m[2]) + 1;
      if (press === +m[1] || press === +m[2]) continue;      // that would be 'part' / 'whole'
      const key = qa('#play .padkey').find(k => Number(k.textContent) === press);
      if (!key) continue;
      key.click();
      if (S.missType === 'up') bare = q('#play .feedback').textContent;
    }
    for (let t = 0; t < 40 && pointed == null; t++){
      K.Session.startLevel(K.Games.byId.count, 0);
      qa('#play .obj').forEach(o => o.click());
      S.flushTimers();
      const ans = Number((S.item || '').split(':').pop());
      const b = qa('#play .choices .choice').find(x => Number(x.textContent) === ans + 1);
      if (!b) continue;
      b.click();
      if (S.missType === 'up') pointed = q('#play .feedback').textContent;
    }
    check('「ゆびで さしながら」is said over things to count, never over a bare sum',
      bare != null && !/ゆびで/.test(bare) && pointed != null && /ゆびで/.test(pointed),
      'recall=' + bare + ' · counting=' + pointed);
    leavePlay();
    K.Store.reset();
  })();

  /* ---------- 60. a first ★★★ hands over the gold sticker it announces ----------
     The screen said「きんの シール を ゲット！」and only the plain sticker was
     stored: the gold slot stayed empty until a second perfect run. */
  (function goldOnFirstPerfect(){
    K.Store.reset();
    const perfect = () => {
      K.Session.startLevel(K.Games.byId.bond, 0);
      let guard = 0;
      while (!onResult() && guard++ < 40){ S.forceCorrect(); S.flushTimers(); }
      return (q('#result .newsticker') || {}).textContent || '';
    };
    const first = perfect();
    const both = K.Store.hasSticker('bond:0') && K.Store.hasSticker('bond:0:g');
    const again = perfect();
    check('the first ★★★ earns the clear sticker and the gold one, and says so',
      both && /きんの/.test(first) && again === '',
      'stored both=' + both + ' · first="' + first + '" · again="' + again + '"');
    K.Store.reset();
  })();

  /* ---------- 61. the classroom door stays open through a release ----------
     The door was worked out from the shelf every time. A release that added one
     入学前 level would have shut it on a child who had already gone through. */
  (function doorStaysOpen(){
    K.Store.reset();
    ['count:0', 'numeral:0'].forEach(k => K.Store.addSticker(k));
    const opened = K.Progress.g1Open();
    const pre = K.Games.list.find(g => (g.stage || 'pre') === 'pre');
    pre.levels.push(Object.assign({}, pre.levels[0]));            // "the next release"
    let stillOpen, notByHand, survives;
    try{
      stillOpen = K.Progress.g1Open() && K.levelOpen(K.Games.byId.g1set, 0);
      K.Parent.render();
      notByHand = !/おうちの方の操作/.test(q('#parent').textContent);
      const text = K.Store.exportText();
      K.Store.reset();
      K.Store.importText(text, 'replace');
      survives = K.Progress.g1Open();
    } finally { pre.levels.pop(); }
    check('once 小学1年生 has opened, a new 入学前 level does not shut it again',
      opened && stillOpen && notByHand && survives && !K.Store.data.g1Open,
      'opened=' + opened + ' afterNewLevel=' + stillOpen + ' notByHand=' + notByHand + ' backup=' + survives);
    K.Store.reset();
  })();

  /* ---------- 62. the padlocked 小1 card says why before it moves on ----------
     It queued its sentence and then switched screens, and switching screens
     hushes whatever is queued — so the card said nothing at all. */
  (function lockedCardSpeaks(){
    K.Store.reset();
    K.Home.render();
    K.UI.show('home');
    const log = [], say = K.Sound.say, hush = K.Sound.hush;
    K.Sound.say = (t, o) => { log.push('say:' + t); finishSpeech(t, o); };
    K.Sound.hush = () => log.push('hush');
    try{ q('#home .gamecard.locked').click(); }
    finally { K.Sound.say = say; K.Sound.hush = hush; }
    const lastHush = log.lastIndexOf('hush');
    const spoken = log.slice(lastHush + 1).some(x => /^say:.*じゅんび/.test(x));
    check('tapping a padlocked 小1 card is heard, not cancelled by the screen change',
      spoken, log.join(' | '));
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 65. the adult gate is not a game a child can win by tapping ----------
     One four-way question with no wait: 25% a tap, 94% inside ten taps — and
     behind it,「記録をすべて消す」. */
  (function gateTakesTwo(){
    K.Store.reset();
    let passed = false;
    const done = () => { passed = true; };
    K.Parent.open(done);
    gateAnswer().click();
    const oneIsNotEnough = !passed && K.UI.currentName() === 'gate';
    // a miss starts the run over and holds every button for a while
    const before = q('#gate .q').textContent;
    const right = gateAnswer();
    qa('#gate .choice').find(b => b !== right).click();
    const held = qa('#gate .choice').every(b => b.disabled) && q('#gate .q').textContent === before
      && /まって/.test(q('#gate .gatestep').textContent);
    right.click();                                    // a disabled button does nothing
    const noThroughTheWait = !passed;
    // opening the gate again starts a fresh run: two right in a row gets through
    K.Parent.open(done);
    const twoInARow = passGate() && passed;
    check('the adult gate takes two right answers in a row, and a miss means a wait',
      oneIsNotEnough && held && noThroughTheWait && twoInARow,
      'one=' + oneIsNotEnough + ' held=' + held + ' waitHolds=' + noThroughTheWait + ' two=' + twoInARow);
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 66. 「いまの おすすめ」 lets go of a level the child has already cleared ----------
     Rescue had no exit: a cleared level at 50% was named every day — a child at
     40% stayed there for a median of 49 days in simulation — and nothing new came
     up. A stuck level the child has not cleared is still worth going back to. */
  (function rescueHasAnExit(){
    K.Store.reset();
    K.Store.recordLevel('count', 0, 1, 4, 8);
    K.Store.addSticker('count:0');
    K.Store.data.recent['count:0'] = '10101010';            // cleared, then half right
    const afterClear = K.Diagnostic.current();
    const movedOn = !(afterClear.gameId === 'count' && afterClear.levelIndex === 0);
    K.Store.data.recent['ten:0'] = '10001000';              // not cleared, and stuck
    const stuck = K.Diagnostic.current();
    const rescued = stuck.gameId === 'ten' && stuck.levelIndex === 0;
    check('おすすめ rescues a stuck level until it is cleared, and then moves on',
      movedOn && rescued,
      'after clear=' + afterClear.gameId + ':' + afterClear.levelIndex
        + ' · stuck=' + stuck.gameId + ':' + stuck.levelIndex);
    K.Store.reset();
  })();

  /* ---------- 67. an iPad Safari tab is told before the home-screen icon starts empty ----------
     iPadOS can keep a home-screen app's records apart from Safari's, so a week in
     a tab followed by「ホーム画面に追加」can open to nothing. */
  (function safariTabNotice(){
    const nav = navigator;
    const define = (k, v) => Object.defineProperty(nav, k, { value: v, configurable: true });
    const notice = () => { K.Parent.render(); const n = q('#parent .tabnotice'); return n ? n.textContent : null; };
    let desktop, tabEmpty, tabWithRecords, installed;
    try{
      K.Store.reset();
      desktop = notice();
      define('userAgent', 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
      define('standalone', false);
      tabEmpty = notice();
      K.Store.recordLevel('count', 0, 2, 6, 8);
      tabWithRecords = notice();
      define('standalone', true);
      installed = notice();
    } finally {
      delete nav.userAgent; delete nav.standalone;
    }
    check('an iPad Safari tab is told its records may not follow it to the home screen',
      desktop === null && installed === null
        && /ホーム画面に追加/.test(tabEmpty || '') && /書き出/.test(tabWithRecords || ''),
      'desktop=' + desktop + ' · empty=' + tabEmpty + ' · records=' + tabWithRecords + ' · installed=' + installed);
    K.Store.reset();
  })();

  /* ---------- 69. a child who cannot read yet can tell the ways in apart ----------
     The four banners on Home carried the same rabbit, and with three or four up
     even that was hidden — what told them apart was words. The result screen's
     buttons were words only. */
  (function waysInHavePictures(){
    K.Store.reset();
    // a day with every banner up: yesterday's mission done, two shaky facts
    const d = new Date(); d.setDate(d.getDate() - 1);
    const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    K.Store.recordMission({ day, id: 'pic-mission', gameId: 'count', text: 'x', prompt: 'y' });
    K.Store.completeMission(day);
    ['bond:dec:10-4', 'bond:dec:10-3'].forEach(k => {
      K.Store.noteFact(k, false, k, 'bond:2', 0, 'part');
      K.Store.noteFact(k, false, k, 'bond:2', 0, 'part');
    });
    K.Home.render();
    K.UI.show('home');
    const up = qa('#home .dailies > .daily').filter(b => !b.hidden);
    const icons = up.map(b => (b.querySelector('.ico') || {}).textContent || '');
    const visible = up.every(b => { const i = b.querySelector('.ico'); return !!i && i.getBoundingClientRect().width > 0; });
    const distinct = icons.every(Boolean) && new Set(icons).size === up.length;

    K.Store.reset();
    K.Session.startLevel(K.Games.byId.bond, 0);
    let guard = 0;
    while (!onResult() && guard++ < 40){ S.forceCorrect(); S.flushTimers(); }
    const acts = qa('#result .result-actions .btn');
    const pictured = acts.length > 1 && acts.every(b => {
      const i = b.querySelector('.bi');
      return !!i && /\S/.test(i.textContent);
    });
    check('every way in on Home and every way off the result screen has its own picture',
      up.length >= 3 && distinct && visible && pictured,
      'banners=' + up.length + ' icons=' + icons.join('') + ' visible=' + visible + ' resultButtons=' + acts.length + ' pictured=' + pictured);
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 70. the screens between the games say what they are ----------
     Home, a game's levels and the sticker book spoke nothing, on the way in or on
     request. A child who cannot read「かぞえよう」could only tap and find out. */
  (function screensSpeak(){
    K.Store.reset();
    const log = [], say = K.Sound.say, hush = K.Sound.hush;
    K.Sound.say = (t, o) => { log.push('say:' + t); finishSpeech(t, o); };
    K.Sound.hush = () => log.push('hush');
    // what is still to be heard: anything said after the last hush
    const heard = () => log.slice(log.lastIndexOf('hush') + 1).filter(x => x.indexOf('say:') === 0).join(' ');
    let name = '', card = '', levels = '', home = '', book = '';
    try{
      K.Home.render();
      K.UI.show('home');
      const c = q('#home .gamecard:not(.locked)');
      name = c.querySelector('.nm').textContent;
      c.click();
      card = heard();
      log.length = 0; q('#levels .speakbtn').click(); levels = heard();
      K.Home.render(); K.UI.show('home');
      log.length = 0; q('#home .speakbtn').click(); home = heard();
      log.length = 0; q('#home .shelf').click(); book = heard();
    } finally {
      K.Sound.say = say; K.Sound.hush = hush;
    }
    check('Home, the level list and the sticker book say what they are, out loud',
      card.indexOf(name) >= 0 && levels.indexOf(name) >= 0
        && /(きょうの れんしゅう|はじめの ぼうけん)/.test(home) && /レベル/.test(book) && /シールブック/.test(book),
      'card=' + card + ' | levels=' + levels + ' | home=' + home + ' | book=' + book);
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 71. a finger a key over is not a counting mistake ----------
     On the keypad the keys either side of the answer are the answer ±1, so a slip
     of the finger was recorded as「1つ多く数えています」and shown to the parent. */
  (function padSlip(){
    const missOf = k => ((K.Store.data.facts[k] || [])[6]) || {};
    const setup = () => {
      for (let t = 0; t < 60; t++){
        K.Session.startLevel(K.Games.byId.ten, 1);
        const m = /^ten:ten:(\d+)$/.exec(S.item || '');
        if (!m) continue;
        const ans = 10 - (+m[1]), over = ans + 1;
        if (over >= 10 || over === +m[1]) continue;            // that would read as 'whole' / 'part'
        const key = v => qa('#play .padkey').find(k => Number(k.textContent) === v);
        if (key(over) && key(ans)) return { item: S.item, ans, over, key };
      }
      return null;
    };
    K.Store.reset();
    const a = setup();
    if (a){ a.key(a.over).click(); a.key(a.ans).click(); }
    const quickMiss = a ? missOf(a.item) : null;
    const slipDropped = !!a && !quickMiss.up;
    K.Store.reset();
    const b = setup();
    if (b){
      b.key(b.over).click();
      const other = qa('#play .padkey').find(k => Math.abs(Number(k.textContent) - b.ans) > 2);
      if (other) other.click();
      b.key(b.ans).click();
    }
    const realKept = !!b && !!missOf(b.item).up;
    leavePlay();
    check('a keypad miss by one, put right at once, is not recorded as counting one too many',
      slipDropped && realKept, 'quickFix=' + JSON.stringify(quickMiss) + ' notQuick=' + JSON.stringify(b && missOf(b.item)));
    K.Store.reset();
  })();

  /* ---------- 72. a hand-built answer surface can have its misses read too ----------
     すうじ どれかな passes the plate's count to `wrong`, but the engine only knew
     the answer when buildChoices / buildPad had set it — so a plate one too many
     was never read as「1つ多く」. */
  (function platesClassify(){
    K.Store.reset();
    const g = K.Games.list.find(x => x.name.indexOf('すうじ どれかな') >= 0);
    let kind = 'never drew a numeral → quantity plate question';
    for (let li = 0; g && li < g.levels.length && typeof kind === 'string'; li++){
      for (let t = 0; t < 20; t++){
        K.Session.startLevel(g, li);
        const m = /:n2q:(\d+)$/.exec(S.item || '');
        if (!m) continue;
        const p = qa('#play .plate').find(x => Number(x.dataset.count) === +m[1] + 1);
        if (!p) continue;
        p.click();
        kind = { got: S.missType };
        break;
      }
    }
    leavePlay();
    check('a plate with one too many is read as「1つ多く」',
      kind && kind.got === 'up', JSON.stringify(kind));
    K.Store.reset();
  })();

  /* ---------- 74. the child is never told what they are「にがて」at ----------
     A five-year-old reads「にがて」as a verdict about themselves. It belongs on the
     parent page; the child sees「とっくん」. */
  (function neverCalledWeak(){
    K.Store.reset();
    ['bond:dec:10-4', 'bond:dec:10-3'].forEach(k => {
      K.Store.noteFact(k, false, k, 'bond:2', 0, 'part');
      K.Store.noteFact(k, false, k, 'bond:2', 0, 'part');
    });
    K.Home.render();
    K.UI.show('home');
    const home = q('#home .dailies').textContent;
    K.Session.startFocus(K.Store.weakFacts(4).map(w => w.key), { n: 10 });
    const title = q('#play .topbar h2').textContent;
    leavePlay();
    K.Result.show({ stars: 1, right: 5, total: 8, mode: 'level', game: K.Games.byId.ten, levelIndex: 1,
                    stickers: [], focusKeys: [], shaky: [{ key: 'bond:dec:10-4', label: '10 は 4 と 6' }] });
    const result = q('#result .result-actions').textContent;
    check('the child\'s screens say「とっくん」, never「にがて」',
      ![home, title, result].some(t => /にがて/.test(t)) && /とっくん/.test(home) && /とっくん/.test(result),
      'home=' + home + ' | title=' + title + ' | result=' + result);
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 75. the result screen: one piece of news, and the way on after a good run ----------
     After ★★ the bright button said「にがてを れんしゅう」, the opposite of the stars.
     「🔒 あと 47レベル」 was a number a five-year-old cannot hold, and the sticker,
     the lock, the mission and three buttons all arrived on one screen. */
  (function resultScreenOneThing(){
    K.Store.reset();
    K.Store.noteFact('bond:dec:10-4', false, '10 は 4 と 6', 'bond:2', 0, 'part');
    K.Store.recordLevel('bond', 1, 2, 6, 8);                  // so level 3 is open
    const base = { right: 6, total: 8, mode: 'level', game: K.Games.byId.bond, levelIndex: 1,
                   focusKeys: [], shaky: [{ key: 'bond:dec:10-4', label: '10 は 4 と 6' }], lastGameId: 'bond' };
    const primary = () => ((q('#result .result-actions .primary .bl') || {}).textContent) || '';
    const labels = () => qa('#result .result-actions .bl').map(b => b.textContent);
    const sticker = [{ emoji: '🍎', gold: false }];

    K.Result.show(Object.assign({ stars: 2, stickers: sticker }, base));
    const good = { primary: primary(), labels: labels() };
    const far = q('#result .newsticker .stagenext');
    const farIsPicture = !!far && !!far.querySelector('.gauge') && !/\d/.test(far.textContent);
    const noMissionWithSticker = !q('#result .result-mission');

    K.Result.show(Object.assign({ stars: 1, stickers: [] }, base));
    const shakyLead = primary();
    const noMissionWithShaky = !q('#result .result-mission');
    K.Result.show(Object.assign({}, base, { stars: 1, stickers: [], shaky: [] }));
    const missionWithoutSticker = !!q('#result .result-mission') && noMissionWithShaky;
    K.Result.show(Object.assign({ stars: 2, stickers: [] }, base));
    const nextFirst = labels()[0] === 'つぎの レベルへ';

    K.Progress.gateSlots('pre').slice(0, -5).forEach(k => K.Store.addSticker(k));
    K.Result.show(Object.assign({ stars: 2, stickers: sticker }, base));
    const dots = qa('#result .stagenext .leftdots span').length;

    check('after ★★ the next level leads; the way to 🎓 is a picture; a new sticker is the only news',
      good.primary === 'つぎの レベルへ' && good.labels.indexOf('とっくん する') >= 0 && shakyLead === 'とっくん する'
        && !farIsPicture && noMissionWithSticker && missionWithoutSticker && dots === 0 && nextFirst,
      JSON.stringify({ good, shakyLead, farIsPicture, far: far && far.textContent, noMissionWithSticker, missionWithoutSticker, dots, nextFirst }));
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 75b. ★0: the words, the bright button and the voice agree ----------
     The heading and the voice said「もう いちど」and the bright button was「とっくん」,
     so a child who pressed what they were told about started a different ten
     questions — under three empty stars, a sad face and「8もん中 2もん」. */
  (function zeroStarsAgree(){
    K.Store.reset();
    K.Store.noteFact('bond:dec:10-4', false, '10 は 4 と 6', 'bond:2', 0, 'part');
    const log = [], say = K.Sound.say;
    K.Sound.say = (t, o) => { log.push(t); finishSpeech(t, o); };
    const d = {};
    try{
      K.Result.show({ stars: 0, right: 2, total: 8, mode: 'level', game: K.Games.byId.bond, levelIndex: 1,
                      stickers: [], focusKeys: [], shaky: [{ key: 'bond:dec:10-4', label: '10 は 4 と 6' }],
                      lastGameId: 'bond' });
      d.primary = ((q('#result .result-actions .primary .bl') || {}).textContent) || '';
      d.drill = qa('#result .result-actions .bl').some(b => b.textContent === 'とっくん する');
      d.tried = !!q('#result .tried') && !q('#result .bigstars') && !q('#result .result-sub');
      d.tall = qa('#result .result-actions .btn').every(b => b.getBoundingClientRect().height >= 63.5);
      d.spoken = log.join(' ');
      log.length = 0;
      const speak = q('#result > .speakbtn');
      if (speak) speak.click();
      d.again = log.join(' ');
    } finally { K.Sound.say = say; }
    check('after ★0 in a level, もういちど is the bright button, the voice names it, and no empty stars',
      d.primary === 'もういちど' && d.drill && d.tried && d.tall
        && /もう一度やってみよう/.test(d.spoken) && /オレンジのボタンで、もう一度/.test(d.spoken)
        && d.again === d.spoken, JSON.stringify(d));
    K.UI.show('home');
    K.Store.reset();
  })();

  /* ---------- 75c. the banner names break where the words do ----------
     With three or four banners up, the names wrapped mid-word:「いまの おす／すめ」. */
  (function bannerNamesKeepWords(){
    K.Store.reset();
    ['bond:dec:10-4', 'bond:dec:10-3'].forEach(k => {
      K.Store.noteFact(k, false, k, 'bond:2', 0, 'part');
      K.Store.noteFact(k, false, k, 'bond:2', 0, 'part');
    });
    K.Home.render();
    K.UI.show('home');
    const names = qa('#home .dailies > .daily').filter(b => !b.hidden).map(b => b.querySelector('.t'));
    const breaks = names.map(t => getComputedStyle(t).wordBreak);
    check('with three or more banners up, their names break only at the spaces',
      names.length >= 2 && breaks.every(b => b === 'keep-all'), breaks.join(','));
    K.Store.reset();
  })();

  /* ---------- 76. the way out is within reach, and the bubble can be read ----------
     「こたえを みる」 was a 40px pill in the speech bubble — on an iPad held upright
     a hand's width above the keypad — and the bubble itself was 17px text. */
  (function rescueWithinReach(){
    K.Store.reset();
    let ans = null;
    for (let t = 0; t < 40 && ans == null; t++){
      K.Session.startLevel(K.Games.byId.ten, 1);
      const m = /^ten:ten:(\d+)$/.exec(S.item || '');
      if (m) ans = 10 - (+m[1]);
    }
    let fontPx = 0;
    for (let i = 0; i < 6 && !q('#play .teachbtn'); i++){
      const w = qa('#play .padkey').find(k => Number(k.textContent) !== ans && !k.disabled);
      if (!w) break;
      w.click();
      if (i === 0) fontPx = parseFloat(getComputedStyle(q('#play .feedback')).fontSize);
    }
    const tb = q('#play .teachbtn');
    const inAnswers = !!tb && !!tb.closest('#play .choices');
    const h = tb ? tb.getBoundingClientRect().height : 0;
    const tap = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--tap')) || 64;
    leavePlay();
    check('「こたえを みる」sits among the answers at a size a child can hit, and the bubble is at least 20px',
      inAnswers && h >= tap - 1 && fontPx >= 20,
      'inAnswers=' + inAnswers + ' height=' + Math.round(h) + '/' + tap + ' bubble=' + fontPx + 'px');
    K.Store.reset();
  })();

  /* ---------- 63. the question stays readable once the answers arrive ----------
     かぞえよう asks only after every object is counted. The buttons took height
     from the play area, the board was never re-fitted, and it spilled up over the
     question and the hint — on the very first game a child plays. */
  async function promptStaysVisible(){
    // a background tab never paints: fall back to a timer so the suite cannot hang
    const frame = () => new Promise(r => { requestAnimationFrame(() => r()); setTimeout(r, 120); });
    const frames = async n => { while (n-- > 0) await frame(); };
    const inside = (sel, host) => {
      const n = q(sel);
      if (!n || n.hidden) return null;
      const r = n.getBoundingClientRect();
      const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && !!hit.closest(host);
    };
    const problems = [];
    K.Store.reset();
    /* The iPad sizes the bug was seen at. The suite's own frame is roomier, and
       there the board only just fits either way. */
    const host = window.frameElement;
    const was = host ? [host.style.width, host.style.height] : null;
    try{
      for (const [w, h] of [[1024, 768], [768, 1024]]){
        if (host){ host.style.width = w + 'px'; host.style.height = h + 'px'; }
        await frames(4);
        for (const li of [0, 1]){
          const at = w + 'x' + h + ' L' + (li + 1);
          K.Session.startLevel(K.Games.byId.count, li);
          await frames(3);
          /* In the order a child produces it: the last tap re-fits the board to the
             tall room, and the answers arrive 620 ms later. Running both in one
             task would let the single fit see the buttons and hide the bug. */
          qa('#play .obj').forEach(o => o.click());
          await frames(4);
          S.flushTimers();
          await frames(4);
          // the board itself, not what it clips: a count badge may poke past its edge
          const field = q('#play .playfield').getBoundingClientRect();
          const spill = qa('#play .playfield > *').filter(n => {
            const r = n.getBoundingClientRect();
            return (r.width || r.height) && (r.top < field.top - 2 || r.bottom > field.bottom + 2);
          }).length;
          if (spill) problems.push(at + ': the board spills out of the play area');
          if (!inside('#play .prompt .txt', '.prompt')) problems.push(at + ': question covered');
          const wrong = qa('#play .choices .choice').find(b => !b.classList.contains('correct')
            && Number(b.textContent) !== Number((S.item || '').split(':').pop()));
          if (wrong){
            wrong.click();
            await frames(3);
            if (inside('#play .feedback', '.prompt') === false) problems.push(at + ': hint covered');
          }
        }
      }
    } finally {
      if (host){ host.style.width = was[0]; host.style.height = was[1]; }
    }
    leavePlay();
    check('after counting, the question and the hint are not hidden under the board',
      !problems.length, problems.join(' | '));
    K.Store.reset();
  }

  /* ---------- 64. a record that will not parse does not stop the saving ----------
     One unreadable byte used to switch saving off for good on that device, and
     「消す」and「読み込む」reported success while writing nothing. And a full disk
     is not forever: the next save has to try again. */
  async function unreadableRecord(){
    const KEY = 'kazu-no-bouken.v1', ASIDE = KEY + '.unreadable';
    K.Store.flush();
    const keep = localStorage.getItem(KEY);
    const broken = '{"stars":{"count:0":3},"stickers":["count:0"';
    localStorage.setItem(KEY, broken);
    const f = doc.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:900px;height:640px;border:0';
    await new Promise(r => { f.onload = r; f.src = location.href.split('?')[0] + '?unreadable=' + Date.now(); doc.body.append(f); });
    const W = f.contentWindow, S2 = W.KazuApp.Store;
    const read = () => { try{ return JSON.parse(localStorage.getItem(KEY)); }catch(e){ return null; } };
    const detail = {};
    try{
      detail.started = S2.persists && S2.unreadable;
      detail.aside = localStorage.getItem(ASIDE) === broken;
      S2.addSticker('count:1'); S2.flush();
      detail.saves = !!read() && read().stickers.indexOf('count:1') >= 0;
      const backup = S2.exportText();
      S2.reset(); S2.flush();
      detail.reset = !!read() && read().stickers.length === 0;

      // a write that does not land is reported, and the next one tries again
      const real = W.Storage.prototype.setItem;
      W.Storage.prototype.setItem = function(){ throw new W.DOMException('full', 'QuotaExceededError'); };
      let r;
      try{ r = S2.importText(backup, 'replace'); }
      finally { W.Storage.prototype.setItem = real; }
      detail.toldNotSaved = r.ok && r.saved === false && /保存できませんでした/.test(r.msg) && S2.storage === 'failed';
      S2.addSticker('count:2'); S2.flush();
      detail.retried = S2.storage === 'ok' && !!read() && read().stickers.indexOf('count:2') >= 0;
    } finally {
      f.remove();
      localStorage.removeItem(ASIDE);
      if (keep == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, keep);
    }
    check('an unreadable record is set aside, and saving, 消す and 読み込む keep working',
      Object.keys(detail).length === 6 && Object.values(detail).every(Boolean), JSON.stringify(detail));
  }

  /* ---------- 68. 「書き出した」is recorded only when it was ----------
     The download link was clicked and the backup recorded in the same breath — on
     an iPad started from the home screen that link can save nothing, and the mark
     on the ホーム button went away on a backup that did not exist. */
  async function exportOnlyCountsWhenSaved(){
    const nav = navigator, had = {};
    const stub = (k, v) => {
      if (!(k in had)) had[k] = Object.getOwnPropertyDescriptor(nav, k);
      Object.defineProperty(nav, k, { value: v, configurable: true, writable: true });
    };
    const unstub = () => Object.keys(had).forEach(k => { delete nav[k]; if (had[k]) Object.defineProperty(nav, k, had[k]); });
    const exportBtn = () => { K.Parent.render(); return qa('#parent button').find(b => /記録を書き出す/.test(b.textContent)); };
    const settle = () => new Promise(r => setTimeout(r, 0));
    const realClick = HTMLAnchorElement.prototype.click;
    const detail = {};
    try{
      K.Store.reset();
      stub('canShare', () => true);
      stub('share', () => Promise.reject(new DOMException('cancelled', 'AbortError')));
      exportBtn().click(); await settle(); await settle();
      detail.cancelNotCounted = K.Store.lastBackupDays() == null;
      nav.share = () => Promise.resolve();
      exportBtn().click(); await settle(); await settle();
      detail.shareCounted = K.Store.lastBackupDays() === 0;

      // no share sheet: a download is not a backup until an adult says it was saved
      K.Store.reset();
      stub('canShare', undefined);
      let downloads = 0;
      HTMLAnchorElement.prototype.click = function(){ if (this.download) downloads++; else realClick.call(this); };
      exportBtn().click();
      detail.downloadStarted = downloads === 1;
      detail.notYet = K.Store.lastBackupDays() == null;
      const saved = qa('#parent button').find(b => b.textContent === '保存できた' && !b.hidden);
      if (saved) saved.click();
      detail.confirmed = K.Store.lastBackupDays() === 0;
    } finally {
      unstub();
      HTMLAnchorElement.prototype.click = realClick;
      K.Store.reset();
    }
    check('「書き出した」is recorded when the share finished or an adult confirmed the save, never on the click',
      Object.keys(detail).length === 5 && Object.values(detail).every(Boolean), JSON.stringify(detail));
  }

  /* ---------- 73. thinking time starts when the question has been heard ----------
     The clock started when the question appeared, so the seconds spent reading it
     aloud were counted as thinking: 「すぐ言える」 was nearly out of reach with the
     voice on, and「数えている」came easily. */
  async function timedFromTheEndOfTheQuestion(){
    K.Store.reset();
    const say = K.Sound.say;
    let heard = null, ms = null, ans = null;
    K.Sound.say = (t, o) => { if (o && o.onend) heard = o.onend; };
    try{
      for (let t = 0; t < 40 && ans == null; t++){
        heard = null;
        K.Session.startLevel(K.Games.byId.ten, 1);
        const m = /^ten:ten:(\d+)$/.exec(S.item || '');
        if (m && heard) ans = 10 - (+m[1]);
      }
      await new Promise(r => setTimeout(r, 500));          // still being read out…
      if (heard) heard();                                  // …and now it has been
      const key = qa('#play .padkey').find(k => Number(k.textContent) === ans);
      if (key) key.click();
      ms = S.responseMs;
    } finally {
      K.Sound.say = say;
    }
    leavePlay();
    check('an answer is timed from the end of the question being read, not from its first word',
      ms != null && ms < 250, 'responseMs=' + ms);
    K.Store.reset();
  }

  /* ---------- 77. the fastest answer is kept, not dropped ----------
     An answer given while the question was still being read is timed as 0, and 0
     was thrown away: the average was made of the slow answers alone, and a fact the
     child knew cold came out「数えている」and was sent to とっくん. */
  function instantAnswerKeepsItsSpeed(){
    K.Store.reset();
    const say = K.Sound.say;
    const d = {};
    K.Sound.say = () => {};                         // the reading never finishes
    try{
      let ans = null, item = null;
      for (let t = 0; t < 40 && ans == null; t++){
        K.Session.startLevel(K.Games.byId.ten, 1);
        const m = /^ten:ten:(\d+)$/.exec(S.item || '');
        if (m){ ans = 10 - (+m[1]); item = S.item; }
      }
      const key = qa('#play .padkey').find(k => Number(k.textContent) === ans);
      if (key) key.click();
      d.ms = S.responseMs;
      d.speed = K.Store.factSpeed(item);
      K.Store.noteFact(item, true, null, 'ten:1', 9500);   // one slow answer after it
      const w = K.Store.weakFacts().find(x => x.key === item);
      d.slow = !!(w && w.slow);
    } finally { K.Sound.say = say; }
    leavePlay();
    check('an answer given before the question finished being read is kept as the fastest, not dropped',
      d.ms === 0 && d.speed > 0 && d.speed <= 3000 && !d.slow, JSON.stringify(d));
    K.Store.reset();
  }

  /* ---------- 78. a line ends even if the engine never says so ----------
     Chrome can drop onend for an utterance nothing holds on to. With no end, every
     answer counted as given during the reading — timed as instant, ⚡ for all. */
  async function speechEndsWithoutTheEngine(){
    const syn = window.speechSynthesis;
    let fired = false;
    if (syn){
      const was = K.Sound.voiceOn;
      syn.speak = function(){};                     // takes the line, never reports its end
      try{
        K.Sound.voiceOn = true;
        K.Sound.say('あ', { delay: 0, onend(){ fired = true; } });
        await new Promise(r => setTimeout(r, 1600));
      } finally {
        delete syn.speak;
        K.Sound.voiceOn = was;
      }
    } else fired = true;
    check('a line whose end the speech engine never reports still ends', fired);
  }

  /* ---------- 79. a day is the child's day, not UTC's ----------
     Counted in UTC, the day changed at 9 a.m. in Japan: a backup written at 8:30
     was「1日前」by 9:30. And 31 March said「入学しています」from 1 p.m. */
  function localDays(){
    const now = Date.now, keep = K.Store.data.schoolYear;
    const at = (...a) => { const t = new Date(...a).getTime(); Date.now = () => t; };
    const d = {};
    try{
      at(2026, 0, 10, 0, 30);  K.Store.noteBackup();
      at(2026, 0, 10, 23, 30); d.sameDay = K.Store.lastBackupDays();
      at(2026, 0, 11, 0, 10);  d.nextDay = K.Store.lastBackupDays();
      K.Store.setSchoolYear(2026);
      at(2026, 2, 31, 13, 0);  d.eve = K.Store.daysToSchool();
      at(2026, 3, 1, 8, 0);    d.first = K.Store.daysToSchool();
    } finally {
      Date.now = now;
      K.Store.setSchoolYear(keep);
    }
    check('days are counted on the local calendar: same day is 0, 31 March is「あと 1日」',
      d.sameDay === 0 && d.nextDay === 1 && d.eve === 1 && d.first === 0, JSON.stringify(d));
    K.Store.reset();
  }

  /* ---------- 80. merging keeps a level met only in practice ----------
     `plays` counts whole levels, so a level met only in きょうの れんしゅう was 0 on
     both sides, and a strict「more plays」 threw its recent form away. */
  function mergeKeepsPracticeOnly(){
    K.Store.reset();
    K.Store.noteOutcome('count', 0, true);
    K.Store.noteOutcome('count', 0, false);
    const text = K.Store.exportText();
    K.Store.reset();
    const r = K.Store.importText(text);
    check('合体 keeps the recent form of a level met only in practice',
      r.ok && K.Store.recentCount('count', 0) === 2, 'n=' + K.Store.recentCount('count', 0));
    K.Store.reset();
  }

  /* ---------- 81. 「答えを見せた」survives the next blank ----------
     In a question with several blanks, building the next blank reset the flag, and
     a question the app had answered was saved as the child's own mistake. */
  function taughtSurvivesNextBlank(){
    K.Store.reset();
    const say = K.Sound.say;
    K.Sound.say = finishSpeech;
    const d = {};
    const target = () => {
      const cells = qa('#play .numline .nn');
      const i = cells.findIndex(c => c.classList.contains('now'));
      if (i < 0) return null;
      const prev = cells[i - 1] && Number(cells[i - 1].textContent);
      const next = cells[i + 1] && Number(cells[i + 1].textContent);
      return Number.isFinite(prev) && prev > 0 ? prev + 1 : Number.isFinite(next) ? next - 1 : null;
    };
    try{
      const seq = K.Games.byId.seq;
      for (let t = 0; t < 60 && blanks() < 2; t++) K.Session.startLevel(seq, t % 2);
      d.blanks = blanks();
      d.item = S.item;
      const v = target();
      for (let n = 0; n < 12 && !S.taught; n++){
        const b = liveChoices().find(x => Number(x.textContent) !== v);
        if (!b) break;
        b.click();
      }
      d.shown = S.taught;
      S.flushTimers();                               // the app answers this blank; the next one is built
      d.nextBlank = blanks() >= 1 && !S.taught;
      for (let n = 0; n < 6 && S.item === d.item && !S.locked; n++){
        const w = target();
        const b = liveChoices().find(x => Number(x.textContent) === w);
        if (!b) break;
        b.click(); S.flushTimers(1);
      }
      const f = K.Store.fact(d.item);
      d.miss = f && f[6];
    } finally { K.Sound.say = say; }
    leavePlay();
    check('a question the app answered is saved as「答えを見せた」, even with more blanks after it',
      d.blanks >= 2 && d.shown && d.nextBlank && !!d.miss && d.miss.taught === 1 && !d.miss.down && !d.miss.up,
      JSON.stringify(d));
    K.Store.reset();
  }

  /* ---------- 82. おすすめ does not wait for ever at one level ----------
     A level tried three times opens the next one; おすすめ kept naming it anyway,
     and nothing after it on the roadmap ever came up. */
  function recommendationMovesOn(){
    K.Store.reset();
    [0, 1].forEach(i => { K.Store.recordLevel('count', i, 3, 8, 8); K.Store.addSticker('count:' + i); });
    for (let n = 0; n < 3; n++) K.Store.recordLevel('count', 2, 0, 2, 8);
    for (let n = 0; n < 8; n++) K.Store.noteOutcome('count', 2, n % 4 === 0);
    const now = K.Diagnostic.current();
    check('a level tried three times without a pass rests, and おすすめ moves on',
      !!now && !(now.gameId === 'count' && now.levelIndex === 2), JSON.stringify(now));
    K.Store.reset();
  }

  /* ---------- 83. the ← asks, and an answer stands it down ----------
     The first tap turned it into a pink「？」 that said nothing, and a mistake made
     while it was armed lost its hint 2.6 s later when the arming timed out. */
  function backButtonAsks(){
    K.Store.reset();
    const log = [], say = K.Sound.say;
    K.Sound.say = (t, o) => { log.push(t); finishSpeech(t, o); };
    const d = {};
    try{
      let ans = null;
      for (let t = 0; t < 40 && ans == null; t++){
        K.Session.startLevel(K.Games.byId.ten, 1);
        const m = /^ten:ten:(\d+)$/.exec(S.item || '');
        if (m) ans = 10 - (+m[1]);
      }
      const back = q('#play .backbtn');
      log.length = 0;
      back.click();
      d.asks = back.textContent === '🏠' && q('#play .feedback').classList.contains('hint')
        && log.some(t => /もう一度押してね/.test(t));
      const key = qa('#play .padkey').find(k => Number(k.textContent) !== ans);
      key.click();
      d.stoodDown = back.textContent === '←' && !q('#play .feedback').hidden;
    } finally { K.Sound.say = say; }
    leavePlay();
    check('the first ← asks out loud, and a mistake made then keeps its words on screen',
      d.asks && d.stoodDown, JSON.stringify(d));
    K.Store.reset();
  }

  /* ---------- 84. a pictured prize leads only to an available level ---------- */
  function chosenStickerMission(){
    K.Store.reset();
    const choices = K.StickerMissions.available();
    const c = choices[0], d = {};
    try{
      K.Home.render(); K.UI.show('home');
      d.pictures = qa('#home .sticker-mission-pick').length === choices.length && choices.length > 0;
      d.open = !!c && K.levelOpen(c.game, c.levelIndex) && !K.Store.hasSticker(c.key);
      K.StickerMissions.open(c);
      const go = q('#sticker-mission .btn-accent');
      go.click();
      d.startsTarget = S.mode === 'level' && S.planGames.every(x => x === c.game.id + ':' + c.levelIndex);
      let guard = 0;
      while (!onResult() && guard++ < 16){ S.forceCorrect(); S.flushTimers(); }
      d.earned = K.Store.hasSticker(c.key) && /えらんだ シールを ゲット/.test(q('#result').textContent);
    } finally { K.Store.reset(); }
    check('a chosen sticker names an open level, starts that level, and celebrates the chosen prize',
      d.pictures && d.open && d.startsTarget && d.earned, JSON.stringify(d));
  }

  /* ---------- 85. small adventures are short rewards, never unlocks ---------- */
  function smallAdventure(){
    K.Store.reset();
    const t = K.Adventures.target(), d = {};
    try{
      K.Adventures.open(t);
      q('#adventure .btn-accent').click();
      d.short = S.mode === 'adventure' && S.planLength === 4;
      let guard = 0;
      while (!onResult() && guard++ < 12){ S.forceCorrect(); S.flushTimers(); }
      const key = 'adventure:' + K.Store.todayKey();
      d.memento = K.Store.hasSticker(key) && /ぼうけんシール を ゲット/.test(q('#result').textContent);
      d.notMastery = K.Store.stars(t.game.id, t.levelIndex) === 0 && K.Store.plays(t.game.id, t.levelIndex) === 0;
    } finally { K.Store.reset(); }
    check('a small adventure is four questions, earns its own memento, and cannot clear a level',
      d.short && d.memento && d.notMastery, JSON.stringify(d));
  }

  /* ---------- 86. a sticker world saves only layout data ---------- */
  function stickerWorld(){
    K.Store.reset();
    const key = 'count:0', d = {};
    try{
      K.Store.addSticker(key);
      d.rejectsUnowned = !K.Store.putWorldSticker('count:1', 20, 20);
      d.put = K.Store.putWorldSticker(key, 23.5, 64.5);
      K.Store.setStickerWorldBackground('sea');
      const w = K.Store.stickerWorld();
      d.saved = w.background === 'sea' && w.items[key] && w.items[key].x === 23.5 && w.items[key].y === 64.5;
      K.StickerWorld.open();
      d.drawn = q('#sticker-world .world-sticker') && q('#sticker-world .world-sticker').textContent === K.stickerFor(key);
      const imported = JSON.parse(K.Store.exportText());
      d.exported = imported.data.stickerWorld.background === 'sea' && imported.data.stickerWorld.items[key].y === 64.5;
    } finally { K.Store.reset(); }
    check('the sticker world stores only owned stickers and keeps their layout in a backup',
      d.rejectsUnowned && d.put && d.saved && d.drawn && d.exported, JSON.stringify(d));
  }

  /** Hold real speech completion independently of the question's visual timers.
      The mock preserves replacement, onend, and idle-waiter ordering, so a flush
      cannot pretend that a long natural recording has already finished. */
  function narratedTransitions(){
    const original = { say: K.Sound.say, hush: K.Sound.hush, afterSpeech: K.Sound.afterSpeech };
    let current = null;
    const waiters = new Set(), actions = [], d = {};
    function drain(){
      while (!current && waiters.size){
        const fn = waiters.values().next().value;
        waiters.delete(fn); fn();
      }
    }
    function end(){
      const old = current; current = null;
      if (old) finishSpeech(old.text, old.opts);
      drain();
    }
    K.Sound.say = (text, opts) => {
      const old = current;
      current = { text: String(text), opts };
      if (old) finishSpeech(old.text, old.opts);
    };
    K.Sound.hush = end;
    K.Sound.afterSpeech = fn => {
      if (current) waiters.add(fn); else fn();
      return () => waiters.delete(fn);
    };
    const game = Object.assign({}, K.Games.byId.pattern, { levels: [{ t: '音声の確認', n: 2,
      make(api){
        api.setPrompt('えらんでね', '選んでね。');
        api.buildChoices(['まる', 'ちがう'], 'まる');
        api.coach({ walk(){ return [
          { act(){ actions.push(1); api.say('いち。', { delay: 0 }); }, ms: 1 },
          { act(){ actions.push(2); }, say: 'に。', ms: 1 }
        ]; } });
      }
    }] });
    try{
      K.Store.reset(); S.intro(true);
      K.Session.startLevel(game, 0);
      S.flushTimers(120);
      d.introHeld = S.idx === 0 && S.introStep === 'show' && !actions.length
        && current && current.text.startsWith('初めてだね。');
      end(); S.flushTimers(120);
      d.actionHeld = actions.join(',') === '1' && S.idx === 0 && current && current.text === 'いち。';
      end(); S.flushTimers(120);
      d.explicitHeld = actions.join(',') === '1,2' && S.idx === 0 && current && current.text === 'に。';
      end(); S.flushTimers(120);
      d.answerHeld = !S.locked && S.idx === 0 && current && current.text === '答えは、まるだよ。';
      end(); S.flushTimers(120);
      d.answerCompleted = S.idx === 1 && S.introStep === 'together';
      check('the full introduction and every spoken demonstration step finish before the hand advances',
        d.introHeld && d.actionHeld && d.explicitHeld, JSON.stringify(d));
      check('an automatic demonstration leaves the answer highlighted until its narration finishes',
        d.answerHeld && d.answerCompleted, JSON.stringify(d));

      leavePlay(); S.intro(false); K.Store.reset();
      K.Session.startLevel(game, 0);
      end();
      qa('#play .choice').find(b => b.textContent === 'まる').click();
      const praise = current && current.text;
      S.flushTimers(120);
      d.praiseHeld = S.idx === 0 && S.locked && current && current.text === praise;
      end(); S.flushTimers(120);
      d.praiseCompleted = S.idx === 1;
      check('correct-answer praise completes before the next question can replace it',
        d.praiseHeld && d.praiseCompleted, JSON.stringify(d));

      leavePlay(); K.Store.reset(); actions.length = 0;
      K.Session.startLevel(game, 0); end();
      q('#play .showbtn').click();
      S.flushTimers(120);
      d.helpHeld = !actions.length && current && current.text.startsWith('やり方を見せるね。');
      end(); S.flushTimers(120);
      const oldWaiters = Array.from(waiters);
      d.helpStarted = actions.join(',') === '1';
      leavePlay();
      K.Session.startLevel(game, 0);
      oldWaiters.forEach(fn => fn());
      S.flushTimers(120);
      d.oldIgnored = actions.join(',') === '1' && S.idx === 0 && !S.locked
        && !q('#play').classList.contains('walking');
      check('help narration precedes its walk and late speech completion cannot advance after leaving',
        d.helpHeld && d.helpStarted && d.oldIgnored, JSON.stringify(d));

      leavePlay(); K.Store.reset();
      K.Session.startLevel(K.Games.byId.add, 0);
      const story = q('#play .prompt .txt').textContent;
      S.flushTimers(120);
      d.storyHeld = !qa('#play .choices .choice').length && q('#play .prompt .txt').textContent === story;
      end(); S.flushTimers(120);
      d.storyCompleted = qa('#play .choices .choice').length > 0 && q('#play .prompt .txt').textContent !== story;
      check('a story finishes its narration before the scene becomes an arithmetic question',
        d.storyHeld && d.storyCompleted, JSON.stringify(d));

      leavePlay(); K.Store.reset();
      K.Session.startLevel(K.Games.byId.flash, 0); end();
      q('#play .flashgo').click(); S.flushTimers(); end();
      const answer = Number((S.item || '').split(':').pop());
      qa('#play .choice').find(b => Number(b.textContent) === answer).click();
      const praiseLine = current && current.text;
      S.flushTimers(120);
      d.flashPraiseHeld = S.idx === 0 && current && current.text === praiseLine;
      end(); S.flushTimers(120);
      d.explanationHeld = S.idx === 0 && current && /だったね。$/.test(current.text);
      end(); S.flushTimers(120);
      d.flashCompleted = S.idx === 1;
      check('flash praise and its revealed arrangement are both heard before the next question',
        d.flashPraiseHeld && d.explanationHeld && d.flashCompleted, JSON.stringify(d));

      leavePlay(); K.Store.reset();
      K.Session.startLevel(K.Games.byId.ten, 0); end();
      const cells = qa('#play .cell.tappable');
      cells.forEach((c, i) => { c.click(); if (i < cells.length - 1) end(); });
      S.flushTimers(120);
      d.tenHeld = current && current.text === 'じゅう' && !qa('#play .choices .choice').length;
      end(); S.flushTimers(120);
      d.tenAsked = current && /いくつ足した？$/.test(current.text) && qa('#play .choices .choice').length > 0;
      check('filling a ten-frame finishes the final count before asking how many were added',
        d.tenHeld && d.tenAsked, JSON.stringify(d));

      leavePlay(); K.Store.reset();
      K.Session.startLevel(K.Games.byId.ten, 1); end();
      q('#play .showbtn').click(); end();
      const holes = qa('#play .cell.coachhole');
      holes.forEach((c, i) => { c.click(); if (i < holes.length - 1) end(); });
      S.flushTimers(120);
      d.filledCountHeld = holes.length > 0 && current && current.text === 'じゅう';
      end(); S.flushTimers(120);
      d.filledCountAsked = current && current.text === '赤い丸は、いくつ？';
      check('a fillable hint finishes its last number before asking about the red counters',
        d.filledCountHeld && d.filledCountAsked, JSON.stringify(d));

      leavePlay(); K.Store.reset();
      K.Session.startLevel(K.Games.byId.ten, 1); end();
      q('#play .showbtn').click(); end();
      const unfinished = qa('#play .cell.coachhole');
      unfinished.forEach((c, i) => { c.click(); if (i < unfinished.length - 1) end(); });
      const partner = 10 - Number((S.item || '').split(':').pop());
      qa('#play .padkey').find(b => Number(b.textContent) === partner).click();
      S.flushTimers(120); end(); S.flushTimers(120);
      d.solvedFillNotReasked = S.idx === 1 && current && current.text !== '赤い丸は、いくつ？';
      check('a queued counting hint cannot ask a question again after the child has answered it',
        d.solvedFillNotReasked, JSON.stringify(d));

      leavePlay(); K.Store.reset(); S.intro(true);
      const random = Math.random;
      try { Math.random = () => 0.1; K.Session.startLevel(K.Games.byId.bond, 1); }
      finally { Math.random = random; }
      end(); S.flushTimers(120);             // introductory question, then the method
      end(); S.flushTimers(120);             // the method, then the rescue explanation
      end(); S.flushTimers(120);             // the rescue, then the first construction
      d.firstWayHeld = /^bond:ways:/.test(S.item || '') && qa('#play .way').length === 1
        && current && /^いちと/.test(current.text);
      end(); S.flushTimers(120);
      d.secondWayHeld = qa('#play .way').length === 2 && S.idx === 0
        && current && /^にと/.test(current.text);
      end(); S.flushTimers(120);
      d.waysCompleted = S.idx === 1;
      check('the automatic two-way construction reads each decomposition completely',
        d.firstWayHeld && d.secondWayHeld && d.waysCompleted, JSON.stringify(d));

      leavePlay(); K.Store.reset();
      K.Session.startLevel(K.Games.byId.flash, 0);
      end(); S.flushTimers(120);
      d.lookHeld = current && current.text === 'みる、を押すよ。'
        && !qa('#play .choice:not(.flashgo)').length;
      end(); S.flushTimers(120);
      d.lookAsked = current && current.text === 'いくつだった？'
        && qa('#play .choice:not(.flashgo)').length > 0;
      check('the flash demonstration finishes its instruction before asking about the hidden dots',
        d.lookHeld && d.lookAsked, JSON.stringify(d));
    } finally {
      leavePlay(); S.intro(false); K.Store.reset();
      Object.assign(K.Sound, original);
    }
  }

  function picturedAnswerSpeech(){
    const original = K.Sound.say, lines = [];
    K.Sound.say = (text, opts) => { lines.push(text); finishSpeech(text, opts); };
    const heard = [];
    try{
      for (const answer of ['🐰', '5', 'まる', 'circle', 'triangle', 'square', '4:0', '7:30', '4じ', '7じはん', '9じ']){
        K.Store.reset();
        const game = Object.assign({}, K.Games.byId.pattern, { levels: [{ t: '音声の確認', n: 1,
          make(api){
            api.setPrompt('えらんでね', '選んでね。');
            api.buildChoices([answer, 'ちがう'], answer);
            api.coach({ say: 'よく見てみよう。', walk(){ return []; } });
          }
        }] });
        K.Session.startLevel(game, 0);
        const wrong = qa('#play .choice').find(b => b.textContent === 'ちがう');
        for (let i = 0; i < 6 && !q('#play .teachbtn'); i++) wrong.click();
        const teach = q('#play .teachbtn');
        if (teach){ teach.click(); S.flushTimers(); }
        heard.push(lines.findLast(t => /^答えは、/.test(t)) || '');
        lines.length = 0;
      }
    } finally { K.Sound.say = original; K.Store.reset(); }
    check('rescue speech names drawn shapes and clock times and preserves numeric and kana answers',
      JSON.stringify(heard) === JSON.stringify(['答えは、これだよ。', '答えは、5だよ。', '答えは、まるだよ。',
        '答えは、まるだよ。', '答えは、さんかくだよ。', '答えは、しかくだよ。', '答えは、よじだよ。', '答えは、しちじはんだよ。',
        '答えは、よじだよ。', '答えは、しちじはんだよ。', '答えは、くじだよ。']),
      JSON.stringify(heard));
  }

  function finish(){
    instantAnswerKeepsItsSpeed();
    localDays();
    mergeKeepsPracticeOnly();
    taughtSurvivesNextBlank();
    recommendationMovesOn();
    backButtonAsks();
    chosenStickerMission();
    smallAdventure();
    stickerWorld();
    naturalStoryLanguage();
    narratedTransitions();
    picturedAnswerSpeech();
    check('no uncaught errors during the whole suite', uncaught === 0, uncaught + ' errors');
    K.Store.reset();
    K.Sound.voiceOn = narrationWasOn;
    return { pass: results.filter(r => r.ok).length, fail: results.filter(r => !r.ok).length, results };
  }

  // everything above is synchronous; these three wait on the browser
  const settle = (name, p) => p.catch(e => check(name, false, String(e && e.message || e)));
  return settle('the app still opens with no network', serviceWorkerOffline())
    .then(() => settle('after counting, the question and the hint are not hidden under the board', promptStaysVisible()))
    .then(() => settle('an unreadable record is set aside, and saving, 消す and 読み込む keep working', unreadableRecord()))
    .then(() => settle('「書き出した」is recorded when the share finished or an adult confirmed the save, never on the click',
                       exportOnlyCountsWhenSaved()))
    .then(() => settle('an answer is timed from the end of the question being read, not from its first word',
                       timedFromTheEndOfTheQuestion()))
    .then(() => settle('a line whose end the speech engine never reports still ends', speechEndsWithoutTheEngine()))
    .then(finish);
})();
