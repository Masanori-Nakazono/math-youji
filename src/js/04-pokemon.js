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
