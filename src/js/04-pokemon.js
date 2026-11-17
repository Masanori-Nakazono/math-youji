/* Fixed Pokémon rewards. The build embeds every selected illustration so a
   saved HTML file has the same stickers without a network or an API call. */
'use strict';
const POKEMON_MANIFEST = /*__POKEMON_MANIFEST__*/ { pokemon: {}, slots: {}, dailyPool: [] };

const PokemonStickers = (() => {
  const LABELS = { 1: 'なかま', 2: 'レア', 3: 'スーパーレア', 4: 'でんせつ', 5: 'とくべつ' };
  function isSecondRound(key, round){
    if (typeof key === 'string' && key.startsWith('lap2:')) return true;
    if (round === 1 || round === 2) return round === 2;
    return typeof Store !== 'undefined' && typeof Store.round === 'function' && Store.round() === 2;
  }
  const baseKey = key => typeof key === 'string' && key.startsWith('lap2:') ? key.slice(5) : key;
  function reward(key, round){
    const secondRound = isSecondRound(key, round), base = baseKey(key);
    const slots = secondRound ? POKEMON_MANIFEST.roundTwoSlots : POKEMON_MANIFEST.slots;
    const fixed = Object.hasOwn(slots, base) ? slots[base] : null;
    if (fixed) return Object.assign({}, POKEMON_MANIFEST.pokemon[fixed.id], { key, rarity: fixed.rarity, round: secondRound ? 2 : 1 });
    // Daily practice and short supported adventures are participation rewards;
    // they cannot bypass a chest or the post-clear mastery adventures.
    let h = 0;
    for (const c of String(base)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const pool = secondRound ? POKEMON_MANIFEST.roundTwoDailyPool : POKEMON_MANIFEST.dailyPool;
    const id = pool[h % pool.length];
    return Object.assign({}, POKEMON_MANIFEST.pokemon[id], { key, rarity: 1, round: secondRound ? 2 : 1 });
  }
  function label(r){
    return r.rarity === 5 ? (r.mythical ? 'まぼろし' : 'とくべつな でんせつ') : LABELS[r.rarity];
  }
  function artwork(key, options){
    const opts = options || {}, r = reward(key, opts.round);
    const secondRound = r.round === 2, chapter = secondRound && baseKey(key).startsWith('r2chapter:');
    const roundLabel = secondRound ? (chapter ? '　２しゅうめの まとめシール' : '　２しゅうめの シール') : '';
    const card = el('span.pokemon-sticker.rarity-' + r.rarity + (opts.silhouette ? '.unearned' : '')
      + (secondRound ? '.pokemon-second-round' : '') + (chapter ? '.pokemon-second-round-chapter' : ''), {
      role: 'img', 'aria-label': (opts.silhouette ? 'まだ もっていない ' : '') + r.name + '　' + label(r) + roundLabel,
      dataset: { pokemon: r.id, rarity: r.rarity, stickerKey: key, round: r.round },
      title: r.name + '　' + label(r) + roundLabel
    });
    if (secondRound) card.append(el('span.pokemon-round-badge', { text: '２しゅうめ', 'aria-hidden': 'true' }));
    card.append(el('img.pokemon-image', { src: r.image, alt: '', width: 256, height: 256, decoding: 'async', draggable: 'false' }));
    if (opts.name !== false) card.append(el('span.pokemon-name', { text: r.name }));
    if (opts.rarity !== false) card.append(el('span.pokemon-rarity', { text: label(r) }));
    return card;
  }
  function keyForName(name){
    const first = Object.keys(POKEMON_MANIFEST.slots).find(k => reward(k, 1).name === name);
    if (first) return first;
    const second = Object.keys(POKEMON_MANIFEST.roundTwoSlots).find(k => reward(k, 2).name === name);
    return second ? 'lap2:' + second : undefined;
  }
  function legend(){
    return el('div.pokemon-legend', { 'aria-label': 'ポケモンシールの あつめかた' },
      el('b', { text: 'ポケモンの なかまを あつめよう' }),
      el('span', { text: 'クリア → なかま・レア　／　きんの シール → スーパーレア' }),
      el('span', { text: 'きんを ぜんぶ あつめる → でんせつ　／　ぜんぶ クリアして ぼうけん → とくべつな でんせつ・まぼろし' }),
      el('span', { text: '２しゅうめ → あたらしい ポケモン156しゅるい。あおい「２しゅうめ」が めじるし。まとめは きんの ふち。' }));
  }
  return { reward, label, artwork, keyForName, isSecondRound, legend, manifest: POKEMON_MANIFEST };
})();

/* ---------- the companion ----------
   The Pokémon a child collects lived in the book and on the island; the eight
   questions — where nearly all the time goes — only ever had かずぴょん. One
   collected Pokémon can be brought along: it stands beside the question, walks the
   road, hops at a right answer, and waits on the home screen. かずぴょん stays and
   still does the talking. It is a picture and nothing more: no record reads it. */
const Buddy = (() => {
  function info(){
    const key = Store.buddy();
    if (!key) return null;
    const r = PokemonStickers.reward(key);
    return r && r.image ? { key, name: r.name, image: r.image } : null;
  }
  /** an <img> of the companion, or null when none is chosen */
  function node(cls){
    const b = info();
    return b ? el('img.' + cls, { src: b.image, alt: '', draggable: 'false', dataset: { name: b.name } }) : null;
  }
  /** restart a one-shot hop on a node that may still be mid-hop */
  function hop(n){
    if (!n) return;
    n.classList.remove('hop');
    void n.offsetWidth;
    n.classList.add('hop');
  }
  /* ---------- なかよし ----------
     The companion stood beside the questions and hopped, and that was all it would
     ever do: the hundredth question together was the same as the first. Now each
     question done together counts — right or wrong, helped or not, because it is
     time spent together and not a mark — and five hearts fill over about a week.
     Each heart is something the Pokémon starts doing (see the .bond-N rules), so
     the child can see what the hearts are. It is kept per Pokémon: a new companion
     starts from the beginning, and an old one keeps what it had. */
  const HEARTS = [8, 24, 48, 80, 120];        // questions together for ♥1 … ♥5
  const BERRY_BOND = 3;                       // a berry is worth a few questions
  function bondOf(key){
    const n = key ? Store.bond(key) : 0;
    let h = 0;
    while (h < HEARTS.length && n >= HEARTS[h]) h++;
    const lo = h ? HEARTS[h - 1] : 0, hi = h < HEARTS.length ? HEARTS[h] : null;
    return { n, hearts: h, max: HEARTS.length, full: hi == null,
             left: hi == null ? 0 : hi - n, part: hi == null ? 1 : (n - lo) / (hi - lo) };
  }
  /** Add to one Pokémon's count. Returns the state after, with `grew` true when a
      heart was filled by this. */
  function addBond(key, n){
    const before = bondOf(key);
    if (!key || !Store.addBond(key, n)) return Object.assign(before, { grew: false });
    const after = bondOf(key);
    after.grew = after.hearts > before.hearts;
    return after;
  }
  /** five hearts for one Pokémon; the one being filled shows how far it has got */
  function meter(key, cls){
    const row = el('span.bondmeter' + (cls ? '.' + cls : ''), { role: 'img' });
    paintMeter(row, key);
    return row;
  }
  function paintMeter(row, key){
    if (!row) return;
    const b = bondOf(key);
    clear(row);
    row.dataset.hearts = String(b.hearts);
    row.classList.toggle('full', b.full);
    row.setAttribute('aria-label', 'なかよし ハート ' + b.hearts + 'こ'
      + (b.full ? '。だいの なかよし' : '。つぎの ハートまで あと ' + b.left + 'もん'));
    for (let i = 0; i < b.max; i++){
      const part = i < b.hearts ? 1 : i === b.hearts ? b.part : 0;
      row.append(el('span.bh' + (part >= 1 ? '.on' : part > 0 ? '.part' : ''),
        { style: { '--fill': Math.round(part * 100) + '%' }, 'aria-hidden': 'true' }, '♥'));
    }
  }
  /** a small heart leaves the Pokémon and floats up: the count went up by one */
  function floatHeart(from){
    if (!from || !from.getBoundingClientRect) return;
    const r = from.getBoundingClientRect();
    if (!r.width) return;
    const h = el('span.bond-float', { 'aria-hidden': 'true',
      style: { left: (r.left + r.width / 2) + 'px', top: (r.top + r.height * .2) + 'px' } }, '♥');
    document.body.append(h);
    setTimeout(() => h.remove(), 1100);
  }
  /** what a heart is worth saying, by the number just reached */
  function grewLine(name, hearts){
    /* spoken as the name and then the news: each half has a recording, where one
       sentence per Pokémon would need six hundred more */
    return hearts >= HEARTS.length
      ? [name + 'と だいの なかよしに なったよ！', name + '！大の仲良しに、なったよ！']
      : [name + 'と もっと なかよく なったよ！', name + '！もっと、仲良くなったよ！'];
  }
  return { info, node, hop, bond: bondOf, addBond, meter, paintMeter, floatHeart, grewLine,
           HEARTS, BERRY_BOND };
})();
