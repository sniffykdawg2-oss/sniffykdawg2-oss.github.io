/* Vengeance Project — motion primitives shared by every redesigned page.
 *
 * Primitives: Intro (skip handling for the CSS-only logo/type intro), RevealLines (heading reveals),
 * ImageSlide (Outfit-style: media slides in from the left into its empty frame, scrubbed by scroll),
 * Parallax (hero photo depth),
 * Magnetic (decorative CTA inner layer), ProductImageSwap (hover alternates, fine pointers only).
 *
 * Rules honoured here:
 *  - Native scrolling; one rAF-batched scroll listener; measurements cached, never read per frame.
 *  - One owner per animated property: CSS owns entrance keyframes and hover transitions; this file
 *    owns scroll-linked transforms on elements CSS does not animate.
 *  - Contexts are created per media-query state and fully reverted when it changes
 *    (breakpoint, hover capability, prefers-reduced-motion), similar to gsap.matchMedia().
 *  - Nothing is hidden unless this script is running and the element is below the fold.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  const mq = {
    reduce: matchMedia('(prefers-reduced-motion: reduce)'),
    wide: matchMedia('(min-width: 1024px) and (min-height: 560px)'),
    fine: matchMedia('(hover: hover) and (pointer: fine)'),
  };
  const motionAllowed = () => !mq.reduce.matches;

  /* ---------- shared scroll loop ---------- */
  const subscribers = new Set();
  let queued = false;
  const tick = () => { queued = false; const y = window.scrollY; subscribers.forEach(fn => fn(y)); };
  const requestTick = () => { if (!queued) { queued = true; requestAnimationFrame(tick); } };
  window.addEventListener('scroll', requestTick, { passive: true });

  /* ---------- measurement refresh (resize, fonts, layout changes) ---------- */
  const measurers = new Set();
  let resizeTimer = 0;
  const refresh = () => { measurers.forEach(fn => fn()); requestTick(); };
  const scheduleRefresh = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refresh, 120); };
  window.addEventListener('resize', scheduleRefresh);
  if (document.fonts?.ready) document.fonts.ready.then(refresh);
  window.addEventListener('load', refresh);

  const headerHeight = () => $('[data-header]')?.offsetHeight || 64;

  /* =====================================================================
     Reveals — first entrance only, and only for elements below the fold at load:
       [data-glitch]          heading glitches in: slices, flicker, scanline (intro emblem motion)
       [data-typer]           heading types itself out with a caret (hero title motion)
       [data-reveal="photo"]  black veil lifts, photo settles from 1.12× (hero photo motion)
       [data-reveal="mark"]   emblem drawn by a scanline, then flickers (intro motion)
       [data-reveal="rule" | "fade"]  hairlines grow, supporting lines fade up
     ===================================================================== */
  function setupReveals() {
    if (!('IntersectionObserver' in window)) return () => {};
    root.classList.add('motion-ready');
    const vh = window.innerHeight;
    const pending = [];
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const t = e.target;
      t.classList.add(t.hasAttribute('data-typer') ? 'is-typing' : t.hasAttribute('data-glitch') ? 'is-glitching' : 'is-in');
      e.target.classList.remove('is-pending');
    }), { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
    $$('[data-reveal], [data-typer], [data-glitch]').forEach(el => {
      if (el.closest('[data-hero]')) return;
      if (el.getBoundingClientRect().top > vh * 0.96) { el.classList.add('is-pending'); pending.push(el); io.observe(el); }
    });
    return () => {
      io.disconnect();
      pending.forEach(el => el.classList.remove('is-pending'));
      $$('[data-reveal]').forEach(el => el.classList.add('is-in'));
      root.classList.remove('motion-ready');
    };
  }

  /* =====================================================================
     ImageSlide — each image starts shifted left (and slightly enlarged) inside its
     frame, leaving the frame empty, then slides right into place as it scrolls up
     the viewport. Scrubbed (reversible) like Outfit; frames further right lag a
     little so rows fill from left to right. Transforms only; cached geometry.
     ===================================================================== */
  function setupSlides() {
    const items = $$('[data-slide]').map(el => ({ el, top: 0, h: 1, lag: 0, last: -1 }));
    if (!items.length) return () => {};
    let vh = window.innerHeight, vw = window.innerWidth;
    const measure = () => {
      vh = window.innerHeight; vw = window.innerWidth;
      const y = window.scrollY;
      items.forEach(it => {
        const r = (it.el.closest('.pcard__stage, .ctile, .film, .gal__frame, .ab-strip') || it.el).getBoundingClientRect();
        it.top = r.top + y; it.h = r.height || 1;
        it.lag = clamp(r.left / vw) * 0.22; // right-hand frames start later
        it.last = -1;
      });
    };
    const render = y => {
      const range = vh * 0.5;
      items.forEach(it => {
        const t = it.top - y;
        if (t > vh + 40 && it.last === 0) return;            // still below the fold, already at start
        if (t + it.h < -40 && it.last === 1) return;         // scrolled past, already settled
        const raw = (vh - t) / range;                        // 0 when the frame's top enters the viewport
        const p = clamp((raw - it.lag) / (1 - it.lag));
        const q = Math.round(easeOut(p) * 1000) / 1000;
        if (q === it.last) return;
        it.last = q;
        if (q >= 1) { it.el.style.transform = ''; it.el.style.willChange = ''; return; }
        it.el.style.willChange = 'transform';
        it.el.style.transform = `translate3d(${(-(1 - q) * 100).toFixed(2)}%, 0, 0) scale(${(1 + (1 - q) * 0.18).toFixed(4)})`;
      });
    };
    measure();
    measurers.add(measure);
    subscribers.add(render);
    render(window.scrollY);
    return () => {
      measurers.delete(measure);
      subscribers.delete(render);
      items.forEach(it => { it.el.style.transform = ''; it.el.style.willChange = ''; });
    };
  }

  /* =====================================================================
     ScrollLit — [data-lit] paragraphs: words brighten one by one as the
     paragraph rises from 88% to 45% of the viewport (CSS reads --lit).
     ===================================================================== */
  function setupLit() {
    const items = $$('[data-lit]').map(el => ({ el, n: el.querySelectorAll('.lit__w').length, top: 0, h: 1, last: -1 }));
    if (!items.length) return () => {};
    let vh = window.innerHeight;
    const measure = () => {
      vh = window.innerHeight;
      const y = window.scrollY;
      items.forEach(it => { const r = it.el.getBoundingClientRect(); it.top = r.top + y; it.h = r.height || 1; it.last = -1; });
    };
    const render = y => items.forEach(it => {
      const start = it.top - vh * 0.88, end = it.top + it.h - vh * 0.45;
      const v = Math.round(clamp((y - start) / Math.max(1, end - start)) * (it.n + 1) * 10) / 10;
      if (v === it.last) return;
      it.last = v;
      it.el.style.setProperty('--lit', String(v));
    });
    measure();
    measurers.add(measure);
    subscribers.add(render);
    render(window.scrollY);
    return () => { measurers.delete(measure); subscribers.delete(render); items.forEach(it => it.el.style.removeProperty('--lit')); };
  }

  /* =====================================================================
     ScrollVars — [data-scroll] scenes get --p (0..1) and CSS does the rest:
       data-scroll="pin"  progress through a tall section whose stage is sticky
       data-scroll="pass" progress while the element crosses the viewport
     The root gets .has-scrollfx while this runs, so pinning/scrubbing CSS only
     applies when it can be driven; otherwise scenes stay static and readable.
     ===================================================================== */
  function setupScrollVars() {
    const items = $$('[data-scroll]').map(el => ({ el, pin: el.dataset.scroll === 'pin', top: 0, h: 1, last: -1 }));
    if (!items.length) return () => {};
    root.classList.add('has-scrollfx');
    let vh = window.innerHeight;
    const measure = () => {
      vh = window.innerHeight;
      const y = window.scrollY;
      items.forEach(it => { const r = it.el.getBoundingClientRect(); it.top = r.top + y; it.h = r.height || 1; it.last = -1; });
    };
    const render = y => items.forEach(it => {
      const raw = it.pin ? (y - it.top) / Math.max(1, it.h - vh) : (y + vh - it.top) / (vh + it.h);
      const p = Math.round(clamp(raw) * 1000) / 1000;
      if (p === it.last) return;
      it.last = p;
      it.el.style.setProperty('--p', String(p));
    });
    measure();
    measurers.add(measure);
    subscribers.add(render);
    render(window.scrollY);
    return () => {
      measurers.delete(measure);
      subscribers.delete(render);
      root.classList.remove('has-scrollfx');
      items.forEach(it => it.el.style.removeProperty('--p'));
    };
  }

  /* Reading progress bar ([data-progress]) — direct scroll mapping, not an animation. */
  function setupProgress() {
    const bar = $('[data-progress]');
    if (!bar) return;
    let max = 1, last = -1;
    const measure = () => { max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight); last = -1; };
    const render = y => { const q = Math.round(clamp(y / max) * 1000) / 1000; if (q === last) return; last = q; bar.style.transform = `scaleX(${q})`; };
    measure();
    measurers.add(measure);
    subscribers.add(render);
    render(window.scrollY);
  }

  /* =====================================================================
     Parallax — hero media depth while the hero leaves the viewport
     Max displacement = speed × hero height (speeds ≤ .08 → ≤ 8%).
     ===================================================================== */
  function setupParallax() {
    const hero = $('[data-hero]');
    if (!hero) return () => {};
    const layers = $$('[data-parallax]', hero).map(el => ({ el, speed: parseFloat(el.dataset.parallax) || 0 }));
    let top = 0, height = 1, last = -1;
    const measure = () => { const r = hero.getBoundingClientRect(); top = r.top + window.scrollY; height = hero.offsetHeight || 1; last = -1; };
    const render = y => {
      const q = clamp((y - top) / height);
      if (q === last) return;
      last = q;
      layers.forEach(({ el, speed }) => { el.style.transform = `translate3d(0, ${(q * speed * height).toFixed(2)}px, 0)`; });
    };
    measure();
    measurers.add(measure);
    subscribers.add(render);
    render(window.scrollY);
    return () => {
      measurers.delete(measure);
      subscribers.delete(render);
      layers.forEach(({ el }) => { el.style.transform = ''; });
    };
  }

  /* =====================================================================
     Intro — the sequence itself is CSS; skip to the end on any interaction,
     on Back/forward restore, or if reduced motion is switched on.
     ===================================================================== */
  function setupIntro() {
    if (!root.classList.contains('intro')) return;
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    let timer = 0;
    const stop = () => {
      events.forEach(t => window.removeEventListener(t, skip, true));
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
    };
    const skip = () => { root.classList.add('intro-skip'); stop(); };
    const onScroll = () => { if (window.scrollY > 8) skip(); };
    events.forEach(t => window.addEventListener(t, skip, { capture: true, passive: true }));
    window.addEventListener('scroll', onScroll, { passive: true });
    timer = setTimeout(stop, 3000); // sequence finished: stop listening
    if (window.scrollY > 8) skip();
    window.addEventListener('pageshow', e => { if (e.persisted) root.classList.add('intro-skip'); });
    mq.reduce.addEventListener('change', e => { if (e.matches) root.classList.add('intro-skip'); });
  }

  /* =====================================================================
     Magnetic — decorative inner layer of the primary CTA, ≤ 4px
     ===================================================================== */
  function setupMagnetic() {
    const offs = $$('[data-magnetic]').map(btn => {
      const inner = $('.btn__inner', btn);
      if (!inner) return () => {};
      const move = e => {
        const r = btn.getBoundingClientRect();
        const dx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
        const dy = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
        inner.style.transform = `translate3d(${(dx * 4).toFixed(2)}px, ${(dy * 3).toFixed(2)}px, 0)`;
      };
      const leave = () => { inner.style.transform = ''; };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerleave', leave);
      return () => { btn.removeEventListener('pointermove', move); btn.removeEventListener('pointerleave', leave); leave(); };
    });
    return () => offs.forEach(off => off());
  }

  /* =====================================================================
     ProductImageSwap — hydrate real alternate images for hover devices
     (touch devices never download hover-only images)
     ===================================================================== */
  function hydrate(img) {
    if (!img.dataset.src) return;
    img.classList.add('is-loading');
    img.addEventListener('load', () => img.classList.remove('is-loading'), { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    img.srcset = img.dataset.srcset; img.src = img.dataset.src;
    delete img.dataset.src; delete img.dataset.srcset;
  }
  function setupImageSwap() {
    const alts = $$('[data-alt][data-src]');
    if (!alts.length) return () => {};
    if (!('IntersectionObserver' in window)) { alts.forEach(hydrate); return () => {}; }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      $$('[data-alt][data-src]', e.target).forEach(hydrate);
    }), { rootMargin: '300px 200px' });
    const cards = new Set(alts.map(img => img.closest('.pcard, .wall__tile') || img));
    cards.forEach(card => io.observe(card));
    return () => io.disconnect();
  }

  /* Primary card images: soft fade-in once decoded (only when they were not ready yet). */
  function setupImageFade() {
    $$('.pcard__img--primary, .wall__img--primary, .ctile__img').forEach(img => {
      if (img.complete) return;
      img.classList.add('is-loading');
      const done = () => img.classList.remove('is-loading');
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  /* =====================================================================
     Context management (matchMedia-style setup / revert)
     ===================================================================== */
  const contexts = { reveals: null, slides: null, lit: null, scrollvars: null, parallax: null, magnetic: null, swap: null };
  const toggle = (name, on, setup) => {
    if (on && !contexts[name]) contexts[name] = setup();
    else if (!on && contexts[name]) { contexts[name](); contexts[name] = null; }
  };
  let booted = false;
  function apply() {
    const motion = motionAllowed();
    root.classList.toggle('motion-ok', motion);
    // Scroll scenes first: they change section heights, which the reveal set-up below measures.
    toggle('scrollvars', motion, setupScrollVars);
    // Reveals are only armed once, at load; turning motion off reveals everything permanently.
    if (!booted) { if (motion) contexts.reveals = setupReveals(); }
    else if (!motion) toggle('reveals', false);
    toggle('slides', motion, setupSlides);
    toggle('lit', motion, setupLit);
    toggle('parallax', motion && mq.wide.matches, setupParallax);
    toggle('magnetic', motion && mq.fine.matches, setupMagnetic);
    toggle('swap', mq.fine.matches, setupImageSwap);
    booted = true;
    refresh();
  }
  Object.values(mq).forEach(q => q.addEventListener('change', apply));
  setupIntro();
  setupImageFade();
  setupProgress();
  apply();

  // Browser Back restore (bfcache): caches stay valid, but re-measure in case the viewport changed.
  window.addEventListener('pageshow', e => { if (e.persisted) refresh(); });

  window.VPMotion = { refresh };
})();
