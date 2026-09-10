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
   five-year-old reads; `parent` is the sentence the dashboard writes. */
const MISS_KINDS = {
  up:    { child: 'もういちど、ゆびで さしながら かぞえて みよう',
           parent: '1つ多く数えています' },
  down:  { child: 'もういちど、ゆびで さしながら かぞえて みよう',
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
const missChild  = t => (MISS_KINDS[t] && MISS_KINDS[t].child) || null;
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

  /* The numbers the question put on the screen: [the part that is shown, the whole].
     Answering one of them back is not a slip, it is a reading of the question. */
  let shown = null;
  if ((m = /^dec:(\d+)-(\d+)$/.exec(rest)))                     shown = [+m[2], +m[1]];
  else if ((m = /^ten:(\d+)$/.exec(rest)))                      shown = [+m[1], 10];
  else if ((m = /^teensplit:(\d+)$/.exec(rest)))                shown = [10, +m[1]];
  else if ((m = /^com:(\d+)\+(\d+)$/.exec(rest)))               shown = [+m[1], +m[2]];
  else if ((m = /^(?:sum|teensum):(\d+)\+(\d+)$/.exec(rest))){
    if (g === Math.abs(+m[1] - +m[2])) return 'opp';            // subtracted instead
    shown = [+m[1], +m[2]];
  }
  else if ((m = /^(?:rest|diff|teenrest|diff1to1|same1to1):(\d+)-(\d+)$/.exec(rest))){
    if (g === (+m[1]) + (+m[2])) return 'opp';                  // added instead
    shown = [+m[1], +m[2]];
  }

  if (shown){
    const whole = Math.max(shown[0], shown[1]);
    if (g === whole && whole !== a) return 'whole';
    /* A value can be both「問題に出ている数」and「答えの1つ手前」(9−4 に 4 と答える).
       Read it as the first: at five, saying back a number you can see is the
       commoner move, and it is the one that changes what an adult says next. */
    if (g === shown[0] || g === shown[1]) return 'part';
  }

  if (g === a + 1) return 'up';
  if (g === a - 1) return 'down';
  return 'far';
}
