/* ===========================================================
   99 — bootstrap
   =========================================================== */
'use strict';

(function main(){
  /* viewport: the Artifact host injects its own meta; make it iPad-app-like */
  (function fixViewport(){
    let m = document.querySelector('meta[name="viewport"]');
    if (!m){ m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
    m.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  })();

  /* scale unit from the real stage size so the layout is identical on any iPad */
  function resize(){
    const w = window.innerWidth, h = window.innerHeight;
    // the base unit sizes the chrome (topbar, prompt, answer buttons); the question
    // itself is grown to fill its own box afterwards by UI.fitPlayfield
    const u = clamp(Math.min(w * 0.0145, h * 0.0165), 7, 21).toFixed(2) + 'px';
    if (document.documentElement.style.getPropertyValue('--u') !== u){
      document.documentElement.style.setProperty('--u', u);
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  UI.init();
  Sound.sfxOn   = Store.data.sfx   !== false;
  Sound.voiceOn = Store.data.voice !== false;
  if (Store.data.voiceId) Sound.voiceId = Store.data.voiceId;

  Title.build();
  Home.build();
  Levels.build();
  Session.build();
  Result.build();
  Book.build();

  UI.show('title', { replace: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Sound.hush(); else resize();
  });

  /* Offline. The app is one self-contained file, so caching it is a few lines —
     and without them the route the README recommends (ホーム画面に追加 from GitHub
     Pages) cannot open with no network, which is exactly when an iPad gets handed
     to a child in a car. Only the hosted build ships a manifest, so use that as
     the signal: the AirDropped file:// copy and the Artifact build skip this. */
  if ('serviceWorker' in navigator
      && /^https?:$/.test(location.protocol)
      && document.querySelector('link[rel="manifest"]')){
    // not deferred to 'load': that waits on the Google Fonts stylesheet, which is
    // exactly the request that stalls on the flaky connection we want to survive
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

/* Expose the internals for debugging / automated checks. */
window.KazuApp = {
  Games, WORLDS, Store, Sound, UI, Session, Home, Levels, Result, Book, Parent,
  Diagnostic, Missions,
  el, svg, clear, $, $$,
  STICKER_POOL, stickerFor,
  numKana, koKana, tsuKana, banmeKana, jiKana, distractors
};
