#!/usr/bin/env node
'use strict';
// Exercise the actual portable app in fresh storage, with every remote request
// blocked. Check all artwork decodes, rarity gates, old rewards and island layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
// Pin every existing identity independently of the live manifest, including the
// textbook keys whose historical "r2" prefix does not mean the second lap.
const ORIGINAL_POKEMON_IDS = {
  'count:0':25, 'count:0:g':26, 'count:1':133, 'count:1:g':134, 'count:2':2, 'count:2:g':3,
  'flash:0':172, 'flash:0:g':40, 'flash:1':39, 'flash:1:g':36, 'flash:2':5, 'flash:2:g':6,
  'numeral:0':7, 'numeral:0:g':9, 'numeral:1':54, 'numeral:1:g':55, 'numeral:2':8, 'numeral:2:g':131,
  'seq:0':152, 'seq:0:g':154, 'seq:1':155, 'seq:1:g':156, 'seq:2':153, 'seq:2:g':157,
  'trace:0':158, 'trace:0:g':160, 'trace:1':175, 'trace:1:g':176, 'trace:2':159, 'trace:2:g':468,
  'compare:0':179, 'compare:0:g':181, 'compare:1':194, 'compare:1:g':195, 'compare:2':180, 'compare:2:g':184,
  'ordinal:0':183, 'ordinal:0:g':62, 'ordinal:1':298, 'ordinal:1:g':186, 'ordinal:2':61, 'ordinal:2:g':230,
  'measure:0':60, 'measure:0:g':121, 'measure:1':116, 'measure:1:g':130, 'measure:2':117, 'measure:2:g':350,
  'bond:0':255, 'bond:0:g':257, 'bond:1':37, 'bond:1:g':38, 'bond:2':256, 'bond:2:g':59,
  'ten:0':258, 'ten:0:g':260, 'ten:1':77, 'ten:1:g':78, 'ten:2':259, 'ten:2:g':324,
  'add:0':252, 'add:0:g':254, 'add:1':58, 'add:1:g':136, 'add:2':253, 'add:2:g':448,
  'sub:0':215, 'sub:0:g':461, 'sub:1':228, 'sub:1:g':197, 'sub:2':229, 'sub:2:g':359,
  'shape:0':74, 'shape:0:g':76, 'shape:1':95, 'shape:1:g':208, 'shape:2':75, 'shape:2:g':142,
  'sort:0':81, 'sort:0:g':82, 'sort:1':304, 'sort:1:g':462, 'sort:2':305, 'sort:2:g':306,
  'pattern:0':10, 'pattern:0:g':12, 'pattern:1':16, 'pattern:1:g':18, 'pattern:2':17, 'pattern:2:g':169,
  'clock:0':163, 'clock:0:g':164, 'clock:1':43, 'clock:1:g':45, 'clock:2':44, 'clock:2:g':182,
  'g1set:0':63, 'g1set:0:g':65, 'g1set:1':280, 'g1set:1:g':282, 'g1set:2':281, 'g1set:2:g':475,
  'g1pair:0':66, 'g1pair:0:g':68, 'g1pair:1':92, 'g1pair:1:g':94, 'g1pair:2':93, 'g1pair:2:g':196,
  'g1teen:0':147, 'g1teen:0:g':149, 'g1teen:1':246, 'g1teen:1:g':248, 'g1teen:2':148, 'g1teen:2:g':445,
  'g1shiki:0':220, 'g1shiki:0:g':473, 'g1shiki:1':371, 'g1shiki:1:g':373, 'g1shiki:2':372, 'g1shiki:2:g':376,
  'treasure:shima':243, 'treasure:umi':244, 'treasure:yama':245, 'treasure:mori':249, 'treasure:kyoshitsu':250,
  'transfer:0':150, 'transfer:1':384, 'transfer:2':483, 'transfer:3':484, 'transfer:4':151, 'transfer:5':493,
  'r2:0':387, 'r2:1':388, 'r2:2':389, 'r2:3':390, 'r2:4':391, 'r2:5':392, 'r2:6':393,
  'r2:7':394, 'r2:8':395, 'r2:9':495, 'r2:10':496, 'r2:11':497, 'r2:12':498, 'r2:13':499,
  'r2:14':500, 'r2:15':501, 'r2:16':502, 'r2:17':503, 'r2:18':427, 'r2:19':428,
  'r2chapter:0':385, 'r2chapter:1':251, 'r2chapter:2':480, 'r2chapter:3':481, 'r2chapter:4':482
};
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://local').pathname);
  if (!file.startsWith(root + path.sep)){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/javascript' });
    res.end(err ? 'not found' : body);
  });
});
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const errors = [], remoteRequests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (route.request().url().startsWith('http://127.0.0.1:')) return route.continue();
      remoteRequests.push(route.request().url()); return route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`, { waitUntil: 'domcontentloaded' });
    const names = await page.evaluate(async originalIds => {
      const K = KazuApp, P = K.PokemonStickers, S = K.Store, names = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); names.push(name); };
      K.Sound.voiceOn = false; K.Sound.sfxOn = false; K.Sound.say = () => {};
      S.reset();
      const levelKeys = K.Games.list.flatMap(g => g.levels.map((lv, i) => g.id + ':' + i));
      const fixed = Object.keys(P.manifest.slots);
      check('156 fixed rewards include 131 map/adventure rewards and 25 distinct textbook Pokémon', fixed.length === 156
        && K.TextbookReview.progress().groups.flatMap(g=>g.keys).length === 131
        && K.TextbookReview.rewardKeys().length === 25
        && new Set(fixed.map(k => P.reward(k).id)).size === 156
        && fixed.every(k => /^[ァ-ヶー]+$/.test(K.stickerFor(k))));
      const firstIds = new Set(fixed.map(k => P.reward(k, 1).id));
      const secondKeys = Object.keys(P.manifest.roundTwoSlots);
      check('all 156 original Pokémon identities remain exactly fixed', Object.keys(originalIds).length === 156
        && fixed.every(k => P.reward(k, 1).id === originalIds[k]));
      check('both full collections contain 312 different Pokémon with matching 156 slots', secondKeys.length === 156
        && secondKeys.every(k => Object.hasOwn(P.manifest.slots, k))
        && new Set(secondKeys.map(k => P.reward(k, 2).id)).size === 156
        && secondKeys.every(k => !firstIds.has(P.reward(k, 2).id))
        && Object.keys(P.manifest.pokemon).length === 312);
      check('every second-lap reward retains its rarity and legendary or mythical category', fixed.every(k => {
        const first = P.reward(k, 1), second = P.reward(k, 2);
        return first.rarity === second.rarity && first.legendary === second.legendary && first.mythical === second.mythical;
      }));
      check('first-lap textbook keys never acquire the second-lap mark', K.TextbookReview.rewardKeys().every(k =>
        !P.isSecondRound(k) && !P.artwork(k).classList.contains('pokemon-second-round')
        && !P.artwork(k).querySelector('.pokemon-round-badge')));
      const forced = P.artwork('lap2:count:0', {round:1, name:false, rarity:false});
      check('qualified island keys force the new blue second-lap artwork even on lap 1', S.round() === 1
        && P.isSecondRound('lap2:count:0', 1) && forced.classList.contains('pokemon-second-round')
        && forced.dataset.pokemon === String(P.reward('count:0', 2).id)
        && forced.querySelector('.pokemon-round-badge').textContent === '２しゅうめ'
        && forced.getAttribute('aria-label').includes('２しゅうめ') && forced.title.includes('２しゅうめ')
        && !forced.querySelector('.pokemon-name') && !forced.querySelector('.pokemon-rarity'));
      const missions = Array.from({length:6}, (_, i) => K.TransferAdventure.missionFor('transfer:' + i));
      const firstMissionNames = missions.map(m => m.reward), firstChestNames = K.WORLDS.map(w => K.Treasures.name(w.id));
      S.unlockRoundTwo();
      check('selecting lap 2 changes every default reward while explicit round 1 stays original', S.selectRound(2) && S.round() === 2
        && fixed.every(k => P.reward(k).id === P.reward(k, 2).id && P.reward(k, 1).id === originalIds[k])
        && P.isSecondRound('count:0') && !P.isSecondRound('count:0', 1));
      check('all second-lap cards are marked and explicit first-lap cards remain unmarked', fixed.every(k =>
        P.artwork(k).classList.contains('pokemon-second-round') && !P.artwork(k, {round:1}).classList.contains('pokemon-second-round'))
        && P.artwork('r2chapter:0', {silhouette:true}).classList.contains('pokemon-second-round-chapter')
        && P.artwork('r2chapter:0', {silhouette:true}).classList.contains('unearned'));
      check('chest and adventure names follow the selected lap, including previously read missions', K.WORLDS.every((w, i) =>
        K.Treasures.name(w.id) === P.reward('treasure:' + w.id, 2).name && K.Treasures.name(w.id) !== firstChestNames[i])
        && missions.every((m, i) => m.reward === P.reward('transfer:' + i, 2).name && m.reward !== firstMissionNames[i]));
      check('second-lap participation rewards use their own ordinary Pokémon pool', P.manifest.roundTwoDailyPool.length === 32
        && P.manifest.roundTwoDailyPool.every(id => !firstIds.has(id) && !P.manifest.pokemon[id].legendary && !P.manifest.pokemon[id].mythical)
        && ['daily:2026-10-15', 'focus:2026-10-15', 'adventure:2026-10-15'].every(k => {
          const r = P.reward(k);
          return r.round === 2 && r.rarity === 1 && !r.legendary && !r.mythical && !firstIds.has(r.id);
        }));
      check('returning to lap 1 restores original default identities and live reward names', S.selectRound(1) && S.round() === 1
        && fixed.every(k => P.reward(k).id === originalIds[k])
        && missions.every((m, i) => m.reward === firstMissionNames[i])
        && K.WORLDS.every((w, i) => K.Treasures.name(w.id) === firstChestNames[i]));
      S.reset();
      check('all 60 levels have a stable normal and rarer gold reward', levelKeys.length === 60
        && levelKeys.every(k => Object.hasOwn(P.manifest.slots, k) && Object.hasOwn(P.manifest.slots, k + ':g')
          && P.reward(k + ':g').rarity > P.reward(k).rarity && !P.reward(k).legendary && !P.reward(k + ':g').mythical));
      check('later levels never lower normal reward rarity', K.Games.list.every(g =>
        g.levels.every((lv, i) => !i || P.reward(g.id + ':' + i).rarity >= P.reward(g.id + ':' + (i - 1)).rarity)));
      check('treasures are legendary and final adventures are more special', K.WORLDS.every(w => P.reward('treasure:' + w.id).legendary
        && P.reward('treasure:' + w.id).rarity === 4)
        && Array.from({length: 6}, (_, i) => P.reward('transfer:' + i)).every(r => r.rarity === 5 && (r.legendary || r.mythical))
        && P.reward('transfer:4').name === 'ミュウ' && P.reward('transfer:5').name === 'アルセウス');
      check('daily and supported adventures cannot supply legendary rewards', ['daily:2026-10-04', 'focus:2026-10-04', 'adventure:2026-10-04'].every(k => P.reward(k).rarity === 1 && !P.reward(k).legendary && !P.reward(k).mythical));
      // Decode every actual embedded image, including those not yet earned.
      for (const r of Object.values(P.manifest.pokemon)){
        const img = new Image(); img.src = r.image; await img.decode();
        check(r.name + ': embedded image decodes without network', img.naturalWidth === 256 && img.naturalHeight === 256 && r.image.startsWith('data:image/webp;base64,'));
      }
      S.addPending('count:0'); S.addSticker('count:0:g');
      S.putWorldSticker('count:0:g', 32, 42);
      const before = S.exportText(), namesBefore = fixed.map(K.stickerFor);
      K.Book.render(); K.UI.show('book');
      check('old owned and pending keys display images with original acquisition state',
        document.querySelector('.sticker.got.pending [data-sticker-key="count:0"] .pokemon-name').textContent === 'ピカチュウ'
        && !!document.querySelector('.sticker.gold [data-sticker-key="count:0:g"] img')
        && document.querySelector('[data-sticker-key="count:1"].unearned .pokemon-name').textContent === 'イーブイ');
      K.StickerWorld.open();
      check('earned gold Pokémon can be placed and named on the island', document.querySelector('.world-sticker [data-sticker-key="count:0:g"] .pokemon-name').textContent === 'ライチュウ');
      S.reset();
      check('backup restores pending, gold, layout and the same Pokémon identities', S.importText(before, 'replace').ok
        && S.isPending('count:0') && S.hasSticker('count:0:g') && S.stickerWorld().items['count:0:g'].x === 32
        && fixed.every((k, i) => K.stickerFor(k) === namesBefore[i]));
      K.Result.show({ mode:'level', game:K.Games.byId.count, levelIndex:0, stars:3, right:8, total:8, stickers:[
        {key:'count:0', emoji:K.stickerFor('count:0'), gold:false},
        {key:'count:0:g', emoji:K.stickerFor('count:0:g'), gold:true}
      ], shaky:[], focusKeys:[] });
      check('result renders the awarded normal and rare Pokémon by key', document.querySelectorAll('#result .newsticker .pokemon-image').length === 2);
      // Existing records remain separate; awarding artwork cannot open a gate.
      check('showing gold and special illustrations cannot unlock learning gates', !K.TransferAdventure.unlocked() && !K.Treasures.status('shima').ready);
      // Test-only full collection, so every special card is visible for layouts.
      levelKeys.forEach(k => { S.addSticker(k); S.confirmSticker(k); S.addSticker(k + ':g'); });
      K.WORLDS.forEach(w => S.claimTreasure(w.id));
      for (let i=0;i<6;i++) S.addSticker('transfer:' + i);
      K.Book.open(); S.flush();
      return names;
    }, ORIGINAL_POKEMON_IDS);
    names.forEach(n => console.log('PASS ' + n));
    // Book.open() creates fresh nodes. Verify their loads separately from their
    // sources: Chromium can reject decode() on a loaded offscreen DOM image even
    // when that exact source decodes in a fresh Image and the DOM supplies pixels.
    // Every source must decode, and every live DOM image must retain that source
    // with the right dimensions; no decoding errors are ignored or retried.
    const verifyImages = async selector => {
      await page.waitForFunction(selector => {
        const images = [...document.querySelectorAll(selector)];
        return images.length > 0 && images.every(img => img.complete && img.currentSrc === img.src);
      }, selector);
      return page.evaluate(async selector => {
        const images = document.querySelectorAll(selector);
        if (!images.length) throw new Error('No artwork found: ' + selector);
        for (const img of images){
          const source = img.src;
          const probe = new Image(); probe.src = source;
          try { await probe.decode(); }
          catch (error) { throw new Error('Collection image decode failed: ' + JSON.stringify({
            key: img.closest('[data-sticker-key]').dataset.stickerKey,
            error: error.name + ': ' + error.message, complete: img.complete,
            width: img.naturalWidth, height: img.naturalHeight, connected: img.isConnected,
            sourceLength: source.length, currentLength: img.currentSrc.length,
            currentMatchesSource: img.currentSrc === source
          })); }
          if (!source.startsWith('data:image/webp;base64,') || !img.isConnected || !img.complete
              || img.src !== source || img.currentSrc !== source
              || img.naturalWidth !== 256 || img.naturalHeight !== 256
              || probe.naturalWidth !== 256 || probe.naturalHeight !== 256){
            throw new Error('Artwork changed or failed to load: ' + img.closest('[data-sticker-key]').dataset.stickerKey);
          }
          // Also require the DOM image to supply real pixels, not just metadata.
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
          const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
          const pixels = context.getImageData(0, 0, 256, 256).data;
          if (!pixels.some((value, index) => index % 4 === 3 && value > 0)){
            throw new Error('Artwork has no rendered pixels: ' + img.closest('[data-sticker-key]').dataset.stickerKey);
          }
        }
      }, selector);
    };
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => KazuApp.Store.hasSticker('count:0:g') && KazuApp.stickerFor('count:0:g') === 'ライチュウ'), true);
    for (const [label, size] of [['landscape', {width:1024,height:768}], ['portrait', {width:768,height:1024}], ['phone', {width:390,height:844}]]){
      await page.setViewportSize(size);
      await page.evaluate(() => { KazuApp.Sound.voiceOn=false; KazuApp.Sound.sfxOn=false; KazuApp.Book.open(); });
      await page.locator('#book .pokemon-image').first().waitFor();
      await verifyImages('#book .pokemon-image');
      const layout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#book .pokemon-sticker')];
        return {overflow:document.documentElement.scrollWidth > innerWidth + 1, broken:cards.some(c => {
          const box=c.getBoundingClientRect(), name=c.querySelector('.pokemon-name').getBoundingClientRect();
          return name.right > box.right + 1 || name.left < box.left - 1 || c.querySelector('img').naturalWidth !== 256;
        })};
      });
      assert.deepEqual(layout, {overflow:false,broken:false}, label + ' names and images fit');
      if (process.env.POKEMON_SCREENSHOTS) await page.screenshot({path:path.join(process.env.POKEMON_SCREENSHOTS, 'pokemon-book-' + label + '.png')});
      console.log('PASS ' + label + ' names, images and collection fit');
    }
    if (process.env.POKEMON_SCREENSHOTS){
      await page.setViewportSize({width:1024,height:768});
      const capture = async name => {
        await verifyImages('.screen:not([hidden]) .pokemon-image');
        await page.screenshot({path:path.join(process.env.POKEMON_SCREENSHOTS, 'pokemon-' + name + '.png')});
      };
      await page.evaluate(() => {
        const K=KazuApp; K.Store.reset(); K.Sound.voiceOn=false; K.Sound.sfxOn=false; K.Sound.say=()=>{};
        K.Store.addSticker('count:0'); K.Store.addSticker('count:0:g'); K.Store.addSticker('count:2');
        K.Home.render(); K.UI.show('home');
      });
      await capture('home');
      await page.evaluate(() => KazuApp.StickerMissions.open(KazuApp.StickerMissions.available()[0]));
      await capture('mission');
      await page.evaluate(() => {KazuApp.Levels.render(KazuApp.Games.byId.count); KazuApp.UI.show('levels');});
      await capture('levels');
      await page.evaluate(() => {KazuApp.Store.putWorldSticker('count:0:g',40,50);KazuApp.Store.putWorldSticker('count:0',60,50);KazuApp.StickerWorld.open();});
      await capture('island');
      await page.evaluate(() => {
        const K=KazuApp; K.Result.show({ mode:'level', game:K.Games.byId.count, levelIndex:0, stars:3, right:8, total:8,
          stickers:[{key:'count:0', gold:false}, {key:'count:0:g', gold:true}], shaky:[], focusKeys:[] });
      });
      await capture('result');
    }
    assert.equal(remoteRequests.some(url => /pokeapi|githubusercontent/.test(url)), false, 'no runtime Pokémon requests');
    assert.deepEqual(errors, []);
    // Open the distributed single file itself, with every network request denied.
    const filePage = await browser.newPage();
    await filePage.route('https://**', r => r.abort());
    await filePage.goto('file://' + path.join(root, 'dist/kazu-no-bouken.html'), {waitUntil:'domcontentloaded'});
    assert.equal(await filePage.evaluate(async () => {
      const K=KazuApp; K.Sound.voiceOn=false; K.Sound.sfxOn=false; K.Store.reset(); K.Store.addSticker('count:0'); K.Book.open();
      const img=document.querySelector('[data-sticker-key="count:0"] img'); await img.decode();
      return img.naturalWidth===256 && document.querySelector('[data-sticker-key="count:0"] .pokemon-name').textContent==='ピカチュウ';
    }), true);
    console.log('PASS portable file works without fetching artwork; reload preserves Pokémon identity; no browser errors');
  } finally { if(browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
