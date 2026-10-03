/* ===========================================================
   87 — one chest per world, with keepsakes distinct from stickers
   =========================================================== */
'use strict';

const Treasures = (() => {
  const REWARDS = Object.fromEntries(WORLDS.map(w => [w.id, {
    name: stickerFor('treasure:' + w.id)
  }]));
  let node, heading, sheet, worldId = 'shima';

  function status(id){
    const keys = [];
    Games.list.filter(g => g.world === id).forEach(g =>
      g.levels.forEach((lv, i) => keys.push(g.id + ':' + i + ':g')));
    const got = keys.filter(k => Store.hasSticker(k)).length;
    return { got, total: keys.length, ready: keys.length > 0 && got === keys.length,
      opened: Store.hasTreasure(id) };
  }

  function chestSVG(opened){
    const line = { stroke: '#704932', 'stroke-width': 4, 'stroke-linejoin': 'round' };
    return svg('svg', { viewBox: '0 0 120 100', class: 'treasure-chest-art', 'aria-hidden': 'true' },
      svg('ellipse', { cx: 60, cy: 91, rx: 49, ry: 5, fill: '#704932', opacity: .15 }),
      opened ? svg('path', { d: 'M20 49 L15 18 Q60 0 105 18 L100 49 Z', fill: '#e0a551', ...line }) : null,
      svg('rect', { x: 16, y: 44, width: 88, height: 44, rx: 7, fill: '#b9713d', ...line }),
      svg('path', { d: opened ? 'M16 44 Q60 26 104 44 L100 55 Q60 41 20 55 Z'
        : 'M16 48 L16 36 Q16 12 60 12 Q104 12 104 36 L104 48 Z', fill: opened ? '#49372e' : '#e0a551', ...line }),
      svg('path', { d: 'M32 22 V84 M88 22 V84', stroke: '#ffd86b', 'stroke-width': 8 }),
      svg('rect', { x: 16, y: 49, width: 88, height: 8, rx: 2, fill: '#ffd86b' }),
      svg('rect', { x: 50, y: 46, width: 20, height: 25, rx: 4, fill: '#fff1a4', ...line }),
      svg('circle', { cx: 60, cy: 56, r: 3, fill: '#704932' }),
      svg('path', { d: 'M60 58 V64', stroke: '#704932', 'stroke-width': 3 }));
  }

  // Chest acquisition still lives in the separate treasure record.
  function artwork(id){
    if (!REWARDS[id]) return null;
    const art = PokemonStickers.artwork('treasure:' + id);
    art.classList.add('treasure-art');
    return art;
  }

  function speech(){
    const w = WORLDS.find(w => w.id === worldId), s = status(worldId);
    return w.name + 'の宝箱。' + (s.opened ? REWARDS[worldId].name + 'を手に入れたよ。自分の島に飾れるよ。'
      : s.ready ? '金のシールが全部そろったね！宝箱をタップして、開けてみよう。'
      : 'この場所の金のシールを全部集めると開くよ。あと' + (s.total - s.got) + '枚だよ。');
  }

  function card(id){
    const s = status(id), w = WORLDS.find(w => w.id === id);
    const label = s.opened ? 'たからもの ゲット' : s.ready ? 'たからばこを あけよう' : 'きんの シール ' + s.got + '／' + s.total;
    return el('button.world-chest' + (s.opened ? '.opened' : s.ready ? '.ready' : '.locked'), {
      type: 'button', dataset: { world: id }, 'aria-label': w.name + 'の たからばこ　' + label,
      onclick(){ Sound.sfx.tap(); open(id); }
    }, s.opened ? artwork(id) : chestSVG(false), el('span', { text: label }));
  }

  function collection(){
    const row = el('div.treasure-collection-row');
    WORLDS.filter(w => REWARDS[w.id]).forEach(w => {
      const owned = Store.hasTreasure(w.id);
      row.append(el('button.treasure-keepsake' + (owned ? '.owned' : ''), {
        type: 'button', 'aria-label': w.name + '　' + (owned ? REWARDS[w.id].name : 'まだ あけていない たからばこ'),
        onclick(){ Sound.sfx.tap(); open(w.id); }
      }, owned ? artwork(w.id) : chestSVG(false),
      owned ? null : el('span', { text: '？？？' }), el('small', { text: w.name })));
    });
    return el('section.treasure-collection', { 'aria-label': 'たからもの コレクション' },
      el('h3', { text: 'たからもの　' + Store.data.treasures.length + '／' + TREASURE_WORLDS.length }), row);
  }

  function build(){
    if (node) return node;
    heading = el('h2'); sheet = el('div.treasure-sheet');
    node = el('div#treasure', null,
      el('div.topbar', null,
        el('button.btn.btn-ghost.btn-round', { type: 'button', 'aria-label': 'もどる',
          onclick(){ Sound.sfx.tap(); Home.render(); UI.show('home', { replace: true }); } }, '←'),
        heading, speakBtn(speech)), sheet);
    return UI.register('treasure', node);
  }

  function render(celebrate){
    build();
    const w = WORLDS.find(w => w.id === worldId), s = status(worldId);
    heading.textContent = w.name + 'の たからばこ';
    clear(sheet);
    sheet.append(el('div.treasure-showcase' + (celebrate ? '.reveal' : ''), null, s.opened ? artwork(worldId) : chestSVG(false)),
      el('h3', { text: s.opened ? REWARDS[worldId].name : s.ready ? 'きんの シールが ぜんぶ そろった！' : 'きんの シールで ひらくよ' }),
      el('p', { role: 'status', text: s.opened ? 'とくべつな たからものを ゲット！ じぶんの しまに かざれるよ'
        : s.ready ? 'どんな たからものが でるかな？' : 'きんの シール ' + s.got + '／' + s.total + '　あと ' + (s.total - s.got) + 'まい' }));
    if (s.opened){
      sheet.append(el('button.btn.btn-accent', { type: 'button', text: 'じぶんの しまに かざる',
        onclick(){ Sound.sfx.tap(); StickerWorld.open('treasure:' + worldId); } }));
    } else if (s.ready){
      sheet.append(el('button.btn.btn-accent.treasure-open', { type: 'button', text: 'たからばこを あける', onclick(){
        if (!Store.claimTreasure(worldId)) return;
        Sound.sfx.unlockSfx(); render(true); UI.confetti(70);
        Sound.say(REWARDS[worldId].name + 'を手に入れたよ！自分の島に飾れるよ。', { delay: 150 });
        const next = $('button', sheet); if (next) next.focus();
      } }));
    } else {
      const choices = el('div.treasure-todo');
      Games.list.filter(g => g.world === worldId).forEach(g => {
        const remaining = g.levels.filter((lv, i) => !Store.hasSticker(g.id + ':' + i + ':g')).length;
        if (!remaining) return;
        choices.append(el('button.btn.btn-ghost', { type: 'button', text: g.ico + ' ' + g.name + '　あと ' + remaining + 'まい',
          onclick(){
            Sound.sfx.tap();
            if (!stageOpen(g)){ Book.open(); Sound.say(Progress.unlockHint(g), { delay: 150 }); return; }
            Levels.render(g); UI.show('levels'); Sound.say(Levels.speech(), { delay: 120 });
          }
        }));
      });
      sheet.append(choices);
    }
  }

  function open(id){
    if (!REWARDS[id]) return;
    worldId = id; render(); UI.show('treasure'); Sound.say(speech(), { delay: 150 });
  }
  return { status, card, collection, artwork, chestSVG, open,
    name: id => REWARDS[id] ? REWARDS[id].name : '' };
})();
