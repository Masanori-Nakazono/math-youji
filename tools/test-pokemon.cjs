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
    const names = await page.evaluate(async () => {
      const K = KazuApp, P = K.PokemonStickers, S = K.Store, names = [];
      const check = (name, ok) => { if (!ok) throw new Error(name); names.push(name); };
      K.Sound.voiceOn = false; K.Sound.sfxOn = false; K.Sound.say = () => {};
      S.reset();
      const levelKeys = K.Games.list.flatMap(g => g.levels.map((lv, i) => g.id + ':' + i));
      const fixed = Object.keys(P.manifest.slots);
      check('131 fixed rewards have distinct Pokémon and katakana names', fixed.length === 131
        && new Set(fixed.map(k => P.reward(k).id)).size === 131
        && fixed.every(k => /^[ァ-ヶー]+$/.test(K.stickerFor(k))));
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
    });
    names.forEach(n => console.log('PASS ' + n));
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => KazuApp.Store.hasSticker('count:0:g') && KazuApp.stickerFor('count:0:g') === 'ライチュウ'), true);
    for (const [label, size] of [['landscape', {width:1024,height:768}], ['portrait', {width:768,height:1024}], ['phone', {width:390,height:844}]]){
      await page.setViewportSize(size);
      await page.evaluate(() => { KazuApp.Sound.voiceOn=false; KazuApp.Sound.sfxOn=false; KazuApp.Book.open(); });
      await page.locator('#book .pokemon-image').first().waitFor();
      await page.evaluate(() => Promise.all([...document.querySelectorAll('#book .pokemon-image')].map(i => i.decode())));
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
        await page.evaluate(() => Promise.all([...document.querySelectorAll('.screen.on .pokemon-image')].map(i => i.decode())));
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
