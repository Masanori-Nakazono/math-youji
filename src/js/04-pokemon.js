/* Fixed Pokémon rewards. The build embeds every selected illustration so a
   saved HTML file has the same stickers without a network or an API call. */
'use strict';
const POKEMON_MANIFEST = /*__POKEMON_MANIFEST__*/ { pokemon: {}, slots: {}, dailyPool: [] };

const PokemonStickers = (() => {
  const LABELS = { 1: 'なかま', 2: 'レア', 3: 'スーパーレア', 4: 'でんせつ', 5: 'とくべつ' };
  function reward(key){
    const fixed = Object.hasOwn(POKEMON_MANIFEST.slots, key) ? POKEMON_MANIFEST.slots[key] : null;
    if (fixed) return Object.assign({}, POKEMON_MANIFEST.pokemon[fixed.id], { key, rarity: fixed.rarity });
    // Daily practice and short supported adventures are participation rewards;
    // they cannot bypass a chest or the post-clear mastery adventures.
    let h = 0;
    for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const id = POKEMON_MANIFEST.dailyPool[h % POKEMON_MANIFEST.dailyPool.length];
    return Object.assign({}, POKEMON_MANIFEST.pokemon[id], { key, rarity: 1 });
  }
  function label(r){
    return r.rarity === 5 ? (r.mythical ? 'まぼろし' : 'とくべつな でんせつ') : LABELS[r.rarity];
  }
  function artwork(key, options){
    const opts = options || {}, r = reward(key);
    const card = el('span.pokemon-sticker.rarity-' + r.rarity + (opts.silhouette ? '.unearned' : ''), {
      role: 'img', 'aria-label': (opts.silhouette ? 'まだ もっていない ' : '') + r.name + '　' + label(r),
      dataset: { pokemon: r.id, rarity: r.rarity, stickerKey: key },
      title: r.name + '　' + label(r)
    }, el('img.pokemon-image', { src: r.image, alt: '', width: 256, height: 256, decoding: 'async', draggable: 'false' }));
    if (opts.name !== false) card.append(el('span.pokemon-name', { text: r.name }));
    if (opts.rarity !== false) card.append(el('span.pokemon-rarity', { text: label(r) }));
    return card;
  }
  function keyForName(name){
    return Object.keys(POKEMON_MANIFEST.slots).find(k => reward(k).name === name);
  }
  function legend(){
    return el('div.pokemon-legend', { 'aria-label': 'ポケモンシールの あつめかた' },
      el('b', { text: 'ポケモンの なかまを あつめよう' }),
      el('span', { text: 'クリア → なかま・レア　／　きんの シール → スーパーレア' }),
      el('span', { text: 'きんを ぜんぶ あつめる → でんせつ　／　ぜんぶ クリアして ぼうけん → とくべつな でんせつ・まぼろし' }));
  }
  return { reward, label, artwork, keyForName, legend, manifest: POKEMON_MANIFEST };
})();
