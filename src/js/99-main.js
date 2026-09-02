/* ===========================================================
   99 — bootstrap
   =========================================================== */
'use strict';

(function main(){
  /* viewport: the Artifact host injects its own meta; make it iPad-app-like */
  (function fixViewport(){
    let m = document.querySelector('meta[name="viewport"]');
    if (!m){ m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
    m.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
  })();

  /* scale unit from the real stage size so the layout is identical on any iPad */
  function resize(){
    const w = window.innerWidth, h = window.innerHeight;
    const u = clamp(Math.min(w * 0.0135, h * 0.0152), 7, 17).toFixed(2) + 'px';
    if (document.documentElement.style.getPropertyValue('--u') !== u){
      document.documentElement.style.setProperty('--u', u);
    }
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  /* stop iOS double-tap zoom and rubber-band scrolling on the stage */
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if (!e.target.closest('.worlds, .sheet, .levels, .book, .queue, .train')) e.preventDefault();
  }, { passive: false });
  UI.init();
  Sound.sfxOn   = Store.data.sfx   !== false;
  Sound.voiceOn = Store.data.voice !== false;

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
})();

/* Expose the internals for debugging / automated checks. */
window.KazuApp = {
  Games, WORLDS, Store, Sound, UI, Session, Home, Levels, Result, Book, Parent,
  el, svg, clear, $, $$,
  STICKER_POOL, stickerFor,
  numKana, koKana, tsuKana, banmeKana, jiKana, distractors
};
