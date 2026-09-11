/* ===========================================================
   06 — what kind of wrong it was
   ===========================================================
   Everything the app knew about a mistake used to be one bit. `noteFact` took
   「一発で正解したか」 and the time, and `onWrong(target)` was handed the very button
   the child pressed and threw the value away. So the record could say
   「10は4といくつ、が62%」 and nothing more — and 62% is the same number whether the
   child said **4** (they read back the part they could see), **5** (they were one
   out), or **7** (they had no idea). Those are three different children and three
   different things to say at the kitchen table.

   This is the third axis, after 正誤 and 速さ, and it needs no new instrument: the
   value is already in hand at the moment it is discarded.

   Two ways a miss gets its name:
     • the engine classifies it, from the item key and the answer (below), or
     • the generator names it, by passing a tag to `api.wrong(el, 'looks')` —
       for the things the key cannot say, like「大きく描いてある方を選んだ」.
   =========================================================== */
'use strict';

/* The vocabulary. `child` is read out at the first mistake, in the words a
   five-year-old reads; `parent` is the sentence the dashboard writes.
   `bare` replaces `child` when the screen has nothing on it to count: the recall
   levels hide the ten-frame on purpose, and「ゆびで さしながら」over a bare
   「3と2で？」 points at something that is not there. */
const MISS_KINDS = {
  up:    { child: 'もういちど、ゆびで さしながら かぞえて みよう',
           bare:  'おしい！ もういちど かんがえて みよう',
           parent: '1つ多く数えています' },
  down:  { child: 'もういちど、ゆびで さしながら かぞえて みよう',
           bare:  'おしい！ もういちど かんがえて みよう',
           parent: '1つ少なく数えています' },
  part:  { child: 'それは みえて いる ほうの かずだね',
           parent: '答えではなく、問題に出ている数をそのまま答えています' },
  whole: { child: 'それは ぜんぶの かずだね',
           parent: '全体の数を答えています（分けた片方ではなく）' },
  opp:   { child: '＋か −か、もういちど みてね',
           parent: 'たし算とひき算を取り違えています' },
  rev:   { child: 'かぞえる むきを たしかめてね',
           parent: '反対の端から数えています' },
  hand:  { child: 'みじかい はりを みてね',
           parent: '長針がさす数字を「何時」として読んでいます' },
  looks: { child: 'おおきさ じゃなくて、かずを かぞえて みよう',
           parent: '数ではなく、見た目の大きさで選んでいます' },
  taught:{ child: null,
           parent: '自力では届かず、答えを見せて終えた回があります' },
  far:   { child: null,
           parent: '見当がついていない答えが混じっています' }
};
/** `countable`: is there anything on the screen the child could count right now? */
const missChild  = (t, countable) => {
  const k = MISS_KINDS[t];
  if (!k) return null;
  return (countable === false && k.bare) || k.child || null;
};
const missParent = t => (MISS_KINDS[t] && MISS_KINDS[t].parent) || null;
/* `far` and `taught` are true, but neither is a *misconception*: naming them in a
   list headed「つまずきの型」would put noise where a parent looks for a lever. */
const MISS_DIAGNOSTIC = ['up', 'down', 'part', 'whole', 'opp', 'rev', 'hand', 'looks'];

/** Name the mistake, or null when nothing can be said honestly.
    `answer` is what buildChoices / buildPad was told is right; `given` is what the
    child pressed. Hand-built answer surfaces pass a tag instead and never reach here. */
function classifyMiss(itemKey, answer, given){
  if (itemKey == null || given == null || answer == null) return null;
  const key = String(itemKey);
  const rest = key.slice(key.indexOf(':') + 1);

  /* とけい. The commonest reading error at five is to read the hand that points at
     a big clear number — the long one. 3じはん read off the long hand is 6じ; a
     whole hour read off it is 12じ. Both answers here are 'h:m' strings. */
  let m = /^(?:read|pick):(\d+):(\d+)$/.exec(rest);
  if (m){
    const gh = Number(String(given).split(':')[0]);
    const longHand = Number(m[2]) === 30 ? 6 : 12;
    if (Number.isFinite(gh) && gh === longHand && gh !== Number(m[1])) return 'hand';
  }

  const g = Number(given), a = Number(answer);
  if (!Number.isFinite(g) || !Number.isFinite(a) || g === a) return null;

  /* The numbers the question put on the screen. Answering one of them back is not
     a slip, it is a reading of the question — and it outranks every other reading
     below: 2+4 に 2 is「見えている方を言った」even though 4−2 is also 2.

     In a sum both numbers are parts, so neither is「ぜんぶ」: 8+2 に 8 is the part
     the child could see, not the whole. `whole` only exists where the question
     shows one — 10は4といくつ, 9−4. */
  let shown = null, whole = null, opp = null;
  if ((m = /^dec:(\d+)-(\d+)$/.exec(rest)))           { shown = [+m[2], +m[1]]; whole = +m[1]; }
  else if ((m = /^ten:(\d+)$/.exec(rest)))            { shown = [+m[1], 10];    whole = 10; }
  else if ((m = /^teensplit:(\d+)$/.exec(rest)))      { shown = [10, +m[1]];    whole = +m[1]; }
  // 「3と2で」 has no sign on it, so there is no other operation to have picked
  else if ((m = /^com:(\d+)\+(\d+)$/.exec(rest)))       shown = [+m[1], +m[2]];
  else if ((m = /^(?:sum|teensum):(\d+)\+(\d+)$/.exec(rest))){
    shown = [+m[1], +m[2]];
    opp = Math.abs(+m[1] - +m[2]);                              // subtracted instead
  }
  else if ((m = /^(?:rest|diff|teenrest|diff1to1):(\d+)-(\d+)$/.exec(rest))){
    shown = [+m[1], +m[2]]; whole = +m[1];
    opp = (+m[1]) + (+m[2]);                                    // added instead
  }
  /* 「4の まえの かずは？」に 5: the 4 is on the screen, and so are both ends of
     「あいだ」. Saying one back is the same reading as in a sum, not a count slip. */
  else if ((m = /^nb:(next|before|between):(\d+)$/.exec(rest))){
    const ans = +m[2];
    shown = m[1] === 'next' ? [ans - 1, ans - 1] : m[1] === 'before' ? [ans + 1, ans + 1] : [ans - 1, ans + 1];
  }
  /* same1to1 (「おなじ かずに しよう」) shows two rows and no numbers or sign at all,
     so neither「見えている数」nor「＋か −か」is something the child could have read.
     It falls through to the count-slip reading. */

  if (shown){
    if (whole != null && g === whole && whole !== a) return 'whole';
    /* A value can be both「問題に出ている数」and「答えの1つ手前」(9−4 に 4 と答える).
       Read it as the first: at five, saying back a number you can see is the
       commoner move, and it is the one that changes what an adult says next. */
    if (g === shown[0] || g === shown[1]) return 'part';
  }
  if (opp != null && g === opp) return 'opp';

  /* 「1つ多く／少なく数えています」 is about counting, so it is only said where the
     answer is a count. 7 chosen over 8 in「どっちが おおきい」, or 1 for the gap in
     1 _ 3, is one away on the number line and says nothing about counting. */
  if (Math.abs(g - a) === 1) return COUNTED.test(rest) ? (g > a ? 'up' : 'down') : null;
  return 'far';
}
/* The item keys whose answer is a number of things, counted or worked out. */
const COUNTED = /^(?:count[LS]|give|q2n|n2q|teen|teensplit|teensum|teenrest|dec|com|ten|fill10|sum|rest|diff|diff1to1|same1to1|same|chart):/;
