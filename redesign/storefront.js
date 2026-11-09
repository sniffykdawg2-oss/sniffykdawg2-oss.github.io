/* Vengeance Project — storefront behaviour shared by every redesigned page (local preview).
 *
 * - Cart: shares the replica's localStorage cart ('vp-local-demo-cart') so /cart and product pages agree.
 *   It is a labelled preview cart; nothing is sent anywhere and checkout is not connected.
 * - Quick add: uses real captured variants/availability from #vp-data; requires a complete, available
 *   variant before adding; reports errors honestly.
 * - Newsletter: preview only — never sends or stores an email.
 * - Promotion: configurable; the countdown counts to a fixed end time and is never restarted.
 */
(() => {
  'use strict';
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = c => '$' + (c % 100 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2));
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const motion = () => root.classList.contains('motion-ok');
  let data = { products: {}, announcement: null };
  try { data = JSON.parse($('#vp-data').textContent); } catch { /* page still works without quick add */ }

  /* ---------- focus + scroll-lock helpers ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function trap(container, event) {
    if (event.key !== 'Tab') return;
    const items = $$(FOCUSABLE, container).filter(el => el.getClientRects().length);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  let locks = 0;
  function lockScroll(on) {
    locks = Math.max(0, locks + (on ? 1 : -1));
    if (locks && on && locks === 1) {
      const gap = window.innerWidth - root.clientWidth;
      root.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingRight = gap + 'px';
    } else if (!locks) { root.style.overflow = ''; document.body.style.paddingRight = ''; }
  }

  /* Overlay controller (drawer + search share behaviour). */
  function overlay(panel, { onOpen } = {}) {
    let opener = null, closeTimer = 0;
    const isOpen = () => panel.classList.contains('is-open');
    const open = trigger => {
      if (isOpen()) return;
      clearTimeout(closeTimer);
      opener = trigger || document.activeElement;
      panel.hidden = false;
      panel.getBoundingClientRect(); // commit initial state so the transition runs
      panel.classList.add('is-open');
      $$(`[aria-controls="${panel.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'true'));
      lockScroll(true);
      onOpen?.();
    };
    const close = ({ restore = true } = {}) => {
      if (!isOpen()) return;
      panel.classList.remove('is-open');
      $$(`[aria-controls="${panel.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'false'));
      lockScroll(false);
      closeTimer = setTimeout(() => { panel.hidden = true; }, motion() ? 520 : 0);
      if (restore && opener?.focus) opener.focus();
    };
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else trap(panel, e); });
    return { open, close, isOpen };
  }

  /* ---------- header ---------- */
  const header = $('[data-header]');
  const heroEl = $('[data-hero]');
  let headerQueued = false, heroEnd = 0;
  const measureHero = () => { heroEnd = heroEl ? heroEl.getBoundingClientRect().bottom + window.scrollY - (header?.offsetHeight || 64) : 0; };
  const syncHeader = () => {
    headerQueued = false;
    const y = window.scrollY;
    header?.classList.toggle('is-scrolled', y > 4);
    header?.classList.toggle('is-over-hero', y < heroEnd - 1);
  };
  window.addEventListener('scroll', () => { if (!headerQueued) { headerQueued = true; requestAnimationFrame(syncHeader); } }, { passive: true });
  window.addEventListener('resize', () => { measureHero(); syncHeader(); });
  window.addEventListener('load', () => { measureHero(); syncHeader(); });
  measureHero();
  syncHeader();

  /* ---------- menu drawer ---------- */
  const drawerEl = $('[data-drawer]');
  const drawer = drawerEl && overlay(drawerEl, { onOpen: () => $('.drawer__panel [data-menu-close]', drawerEl)?.focus() });
  $$('[data-menu-open]').forEach(b => b.addEventListener('click', () => drawer.open(b)));
  $$('[data-menu-close]', drawerEl || document).forEach(b => b.addEventListener('click', () => drawer.close()));
  drawerEl?.addEventListener('click', e => { if (e.target.closest('.drawer__links a[href^="#"]')) drawer.close({ restore: false }); });
  matchMedia('(min-width: 1180px)').addEventListener('change', e => { if (e.matches && drawer?.isOpen()) drawer.close({ restore: false }); });

  /* ---------- search ---------- */
  const searchEl = $('[data-search]');
  const search = searchEl && overlay(searchEl, { onOpen: () => setTimeout(() => $('#search-q')?.focus(), 30) });
  $$('[data-search-open]').forEach(b => b.addEventListener('click', () => search.open(b)));
  $$('[data-search-close]', searchEl || document).forEach(b => b.addEventListener('click', () => search.close()));
  $('[data-search-form]')?.addEventListener('submit', e => {
    const input = $('#search-q');
    if (!input.value.trim()) { e.preventDefault(); input.focus(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]') && search && !search.isOpen()) { e.preventDefault(); search.open($('[data-search-open]')); }
  });

  /* ---------- cart (shared local preview cart) ---------- */
  const CART_KEY = 'vp-local-demo-cart';
  const readCart = () => { try { const c = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(c) ? c : []; } catch { return []; } };
  function renderCartCount(bump = false) {
    const count = readCart().reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    $$('[data-cart-count]').forEach(el => {
      el.textContent = String(count);
      el.classList.toggle('has-items', count > 0);
      if (bump && motion()) { el.classList.remove('is-bumped'); void el.offsetWidth; el.classList.add('is-bumped'); }
    });
    $$('[data-cart-label]').forEach(el => { el.textContent = count ? `, ${count} item${count === 1 ? '' : 's'} in preview cart` : ', empty'; });
  }
  window.addEventListener('storage', e => { if (e.key === CART_KEY) renderCartCount(); });
  renderCartCount();

  /* ---------- quick add ---------- */
  const qa = $('[data-qa]');
  const sheetQuery = matchMedia('(max-width: 699px)');
  let qaState = null;

  function variantsOf(p) {
    return p.variants.map(([id, options, price, compareAt, available]) => ({ id, options, price, compareAt, available: !!available }));
  }
  const label = value => String(value).replace(/\b([a-z])/g, (m, c) => c.toUpperCase()); // display only; data keeps raw values
  const matches = (v, sel, skip = -1) => sel.every((value, j) => j === skip || value == null || v.options[j] === value);

  /** Option buttons for any product: availability is computed per combination from real variants. */
  function optionGroups(p, variants, sel, prefix, idBase) {
    return p.options.map((name, i) => {
      const values = [...new Set(variants.map(v => v.options[i]))];
      const chosen = sel[i];
      return `<div class="${prefix}__group" role="group" aria-labelledby="${idBase}-legend-${i}">
        <p class="${prefix}__legend" id="${idBase}-legend-${i}">${esc(name)}${chosen ? `: <strong>${esc(label(chosen))}</strong>` : ''}</p>
        <div class="${prefix}__options">${values.map(value => {
          const possible = variants.some(v => v.available && v.options[i] === value && matches(v, sel, i));
          const exists = variants.some(v => v.options[i] === value && matches(v, sel, i));
          const text = label(value);
          const aria = !exists ? `${text}, unavailable` : !possible ? `${text}, sold out` : text;
          return `<button class="${prefix}__opt" type="button" data-${prefix}-option="${i}" data-value="${esc(value)}" aria-pressed="${chosen === value}" ${possible ? '' : 'disabled'} aria-label="${esc(aria)}">${esc(text)}</button>`;
        }).join('')}</div>
      </div>`;
    }).join('');
  }
  function initialSelection(p, variants) {
    return p.options.map((_, i) => {
      const values = [...new Set(variants.map(v => v.options[i]))];
      if (values.length === 1) return values[0];
      if (i === p.colorIndex) return values.find(val => variants.some(v => v.available && v.options[i] === val)) || null;
      return null;
    });
  }
  function applyOption(st, i, value) {
    st.sel[i] = st.sel[i] === value && i !== st.prod.colorIndex ? null : value;
    st.sel.forEach((v, j) => { if (j !== i && v != null && !st.variants.some(x => x.available && matches(x, st.sel))) st.sel[j] = null; });
  }
  /** Writes to the shared local preview cart. Returns an error message, or null on success. */
  function saveVariant(handle, title, variant, image, qty = 1) {
    if (!variant || !variant.available) return 'That combination is unavailable. Choose another option.';
    const n = Math.max(1, Math.min(99, Math.round(Number(qty) || 1)));
    try {
      const cart = readCart();
      const existing = cart.find(item => item.id === variant.id);
      if (existing) existing.quantity = Math.min(99, (Number(existing.quantity) || 0) + n);
      else cart.push({ id: variant.id, title, variant: variant.options.join(' / '), handle, price: variant.price, quantity: n, image });
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      return 'Your browser blocked local storage, so the preview cart could not save this item.';
    }
    renderCartCount(true);
    return null;
  }

  function renderQA() {
    const { p, variants, sel } = qaState;
    $('[data-qa-title]', qa).textContent = p.title;
    const body = $('[data-qa-body]', qa);
    const groups = optionGroups(p, variants, sel, 'qa', 'qa');
    const variant = sel.every(v => v != null) ? variants.find(v => matches(v, sel)) : null;
    const missing = p.options.filter((_, i) => sel[i] == null).map(n => n.toLowerCase());
    const ready = variant && variant.available;
    const addLabel = ready ? 'Add to preview cart' : variant && !variant.available ? 'Sold out' : `Select ${missing.join(' & ') || 'options'}`;
    body.innerHTML = `${groups}
      <button class="qa__add" type="button" data-qa-add ${ready ? '' : 'disabled'}><span>${esc(addLabel)}</span>${variant ? `<span>${money(variant.price)}</span>` : ''}</button>
      <p class="qa__hint">Preview cart · checkout not connected · <a href="${esc(p.url)}">View product</a></p>`;
  }

  function setCardImage(color) {
    const { card, p } = qaState;
    const img = $('[data-qa-img]', card);
    if (!img) return;
    const srcset = color && p.colorImages?.[color];
    if (srcset && img.getAttribute('srcset') !== srcset) {
      img.setAttribute('srcset', srcset);
      img.setAttribute('src', srcset.split(',').pop().trim().split(' ')[0]);
    }
  }

  function openQA(button) {
    const handle = button.dataset.quickAdd;
    const p = data.products?.[handle];
    if (!p) { window.location.href = `/products/${handle}`; return; }
    if (qaState?.button === button) { closeQA(); return; }
    closeQA({ restore: false });
    const card = button.closest('[data-qa-card]');
    const img = $('[data-qa-img]', card);
    const variants = variantsOf(p);
    const sel = initialSelection(p, variants);
    qaState = { button, card, p, prod: p, variants, sel, original: img ? { srcset: img.getAttribute('srcset'), src: img.getAttribute('src') } : null };
    renderQA();
    $('[data-qa-status]', qa).textContent = '';
    $('[data-qa-status]', qa).classList.remove('is-error');
    if (sheetQuery.matches) { document.body.append(qa); qa.classList.add('is-sheet'); }
    else { $('[data-qa-stage]', card).append(qa); qa.classList.remove('is-sheet'); }
    qa.hidden = false;
    card.classList.add('qa-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', 'quick-add');
    ($('.qa__opt[aria-pressed="false"]:not(:disabled)', qa) || $('.qa__opt:not(:disabled)', qa) || $('[data-qa-close]', qa)).focus({ preventScroll: true });
  }

  function closeQA({ restore = true } = {}) {
    if (!qaState) return;
    const { button, card, original } = qaState;
    const img = $('[data-qa-img]', card);
    if (img && original) { img.setAttribute('srcset', original.srcset); img.setAttribute('src', original.src); }
    card.classList.remove('qa-open');
    button.setAttribute('aria-expanded', 'false');
    qa.hidden = true;
    document.body.append(qa);
    qaState = null;
    if (restore) button.focus({ preventScroll: true });
  }

  function addToCart() {
    const { p, variants, sel, card } = qaState;
    const variant = variants.find(v => matches(v, sel));
    const status = $('[data-qa-status]', qa);
    status.classList.remove('is-error');
    if (!variant || !variant.available) {
      status.textContent = 'That combination is unavailable. Choose another option.';
      status.classList.add('is-error');
      return;
    }
    const handle = qaState.button.dataset.quickAdd;
    const img = $('[data-qa-img]', card);
    const image = img ? (img.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0] || img.getAttribute('src') : '';
    const err = saveVariant(handle, p.title, variant, image);
    if (err) { status.textContent = err; status.classList.add('is-error'); return; }
    status.innerHTML = `Added ${esc(variant.options.map(label).join(' / '))} to your preview cart. <a href="/cart">View cart</a>`;
  }

  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-quick-add]');
    if (trigger) { e.preventDefault(); openQA(trigger); return; }
    if (!qaState) return;
    const option = e.target.closest('[data-qa-option]');
    if (option && qa.contains(option)) {
      const i = Number(option.dataset.qaOption);
      const value = option.dataset.value;
      applyOption(qaState, i, value);
      if (i === qaState.p.colorIndex) setCardImage(value);
      renderQA();
      $(`.qa__opt[data-qa-option="${i}"][data-value="${CSS.escape(value)}"]`, qa)?.focus({ preventScroll: true });
      $('[data-qa-status]', qa).textContent = '';
      return;
    }
    if (e.target.closest('[data-qa-add]')) { addToCart(); return; }
    if (e.target.closest('[data-qa-close]')) { closeQA(); return; }
    if (!qa.contains(e.target)) closeQA({ restore: false });
  });
  qa?.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeQA(); } });
  sheetQuery.addEventListener('change', () => closeQA({ restore: false }));

  /* ---------- spotlight (one product at a time, big; inline buy) ---------- */
  const GLITCH_FRAMES = [
    { opacity: 1, clipPath: 'inset(10% 0 62% 0)', transform: 'translateX(-22px)', easing: 'steps(1, end)' },
    { offset: .12, clipPath: 'inset(44% 0 30% 0)', transform: 'translateX(16px)', easing: 'steps(1, end)' },
    { offset: .24, clipPath: 'inset(68% 0 8% 0)', transform: 'translateX(-10px)', easing: 'steps(1, end)' },
    { offset: .36, clipPath: 'inset(0% 0 0% 0)', transform: 'translateX(6px)', opacity: .5, easing: 'steps(1, end)' },
    { offset: .48, clipPath: 'inset(0% 0 0% 0)', transform: 'translateX(-2px)', opacity: 1, easing: 'steps(1, end)' },
    { offset: .6, clipPath: 'inset(0% 0 0% 0)', transform: 'none', opacity: 1 },
    { clipPath: 'inset(0% 0 0% 0)', transform: 'none', opacity: 1 },
  ];
  const glitchIn = el => { if (motion() && el?.animate) el.animate(GLITCH_FRAMES, { duration: 480 }); };
  const scanOnce = el => {
    if (motion() && el?.animate) el.animate([{ opacity: 0, transform: 'translateY(-100%)' }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .85 }, { opacity: 0, transform: 'translateY(0)' }], { duration: 480, easing: 'ease-in-out' });
  };
  const srcOf = srcset => (srcset || '').split(',').pop().trim().split(' ')[0];
  const preloaded = new Set();
  const preload = srcset => { if (!srcset || preloaded.has(srcset)) return; preloaded.add(srcset); const im = new Image(); im.sizes = '40vw'; im.srcset = srcset; };

  $$('[data-spotlight]').forEach(root => {
    const list = data.spotlights?.[root.dataset.spotlight];
    if (!list?.length) return;
    const items = $$('[data-spot-index]', root);
    const frame = $('[data-spot-frame]', root);
    const imgEl = $('[data-spot-img]', root);
    let altEl = $('[data-spot-alt]', root);
    const scan = $('.spot__scan', root);
    const nameEl = $('[data-spot-name]', root);
    const priceEl = $('[data-spot-price]', root);
    const factsEl = $('[data-spot-facts]', root);
    const buyEl = $('[data-spot-buy]', root);
    const linkEl = $('[data-spot-link]', root);
    const statusEl = $('[data-spot-status]', root);
    const liveEl = $('[data-spot-live]', root);
    const countEl = $('[data-spot-current]', root);
    let index = 0, state = null;

    const priceMarkup = p => p.compareAt
      ? `<p class="spot__price"><span class="price price--sale"><span class="sr-only">Sale price </span>${money(p.price)}</span><s class="price price--compare"><span class="sr-only">Regular price </span>${money(p.compareAt)}</s></p>`
      : `<p class="spot__price"><span class="price">${money(p.price)}</span></p>`;
    const factsMarkup = f => [
      f?.fit ? `<div><dt>Fit</dt><dd>${esc(f.fit)}</dd></div>` : '',
      f?.fabric ? `<div><dt>Fabric</dt><dd>${esc(f.fabric)}</dd></div>` : '',
      f?.exchanges ? '<div><dt>Exchanges</dt><dd>Available</dd></div>' : '',
    ].join('');
    const typedMarkup = text => {
      let i = 0;
      return text.toUpperCase().split(' ').map(w => { const out = `<span class="tw">${[...w].map(ch => `<span class="type-ch" style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>`; i++; return out; }).join(' ');
    };

    function setStageImage(srcset, focus, { glitch = true } = {}) {
      if (srcset && imgEl.getAttribute('srcset') !== srcset) { imgEl.setAttribute('srcset', srcset); imgEl.setAttribute('src', srcOf(srcset)); }
      if (focus) imgEl.style.objectPosition = focus;
      if (glitch) { glitchIn(imgEl); scanOnce(scan); }
    }

    function renderBuy() {
      const { prod, variants, sel } = state;
      if (!prod) { buyEl.innerHTML = ''; return; }
      const variant = sel.every(v => v != null) ? variants.find(v => matches(v, sel)) : null;
      const missing = prod.options.filter((_, i) => sel[i] == null).map(n => n.toLowerCase());
      const ready = variant && variant.available;
      const addLabel = ready ? 'Add to preview cart' : variant && !variant.available ? 'Sold out' : `Select ${missing.join(' & ') || 'options'}`;
      buyEl.innerHTML = `${optionGroups(prod, variants, sel, 'spot', `spot-${root.dataset.spotlight}`)}
        <button class="spot__add" type="button" data-spot-add ${ready ? '' : 'disabled'}><span>${esc(addLabel)}</span>${variant ? `<span>${money(variant.price)}</span>` : ''}</button>`;
    }

    function select(i, { animate = true, focusItem = false } = {}) {
      index = (i + list.length) % list.length;
      const p = list[index];
      items.forEach((a, k) => {
        const on = k === index;
        a.classList.toggle('is-active', on);
        a.setAttribute('aria-pressed', String(on));
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      if (focusItem) items[index]?.focus();
      // stage
      imgEl.alt = p.title;
      setStageImage(p.primary.srcset, p.focus, { glitch: animate });
      if (p.alt) {
        if (!altEl) { altEl = imgEl.cloneNode(); altEl.className = 'spot__img spot__img--alt'; altEl.alt = ''; altEl.removeAttribute('data-spot-img'); altEl.setAttribute('data-spot-alt', ''); imgEl.after(altEl); }
        altEl.setAttribute('srcset', p.alt.srcset); altEl.setAttribute('src', p.alt.src); altEl.style.objectPosition = p.focus || '';
        altEl.hidden = false;
      } else if (altEl) altEl.hidden = true;
      let badge = $('[data-spot-badge]', frame);
      if (p.compareAt && p.available && !badge) { badge = document.createElement('span'); badge.className = 'pcard__badge'; badge.setAttribute('data-spot-badge', ''); badge.textContent = 'Sale'; frame.append(badge); }
      if (!(p.compareAt && p.available) && badge) badge.remove();
      // details
      nameEl.innerHTML = `<span class="sr-only">${esc(p.title)}</span><span class="spot__name-text" aria-hidden="true">${typedMarkup(p.title)}</span>`;
      nameEl.classList.remove('is-typing');
      if (animate && motion()) { void nameEl.offsetWidth; nameEl.classList.add('is-typing'); }
      priceEl.innerHTML = priceMarkup(p);
      factsEl.innerHTML = factsMarkup(p.facts);
      linkEl.href = p.url;
      if (countEl) countEl.textContent = String(index + 1);
      statusEl.textContent = ''; statusEl.classList.remove('is-error');
      if (animate) liveEl.textContent = `${p.title}, ${money(p.price)}`;
      // buy state
      const prod = data.products?.[p.handle];
      const variants = prod ? variantsOf(prod) : [];
      state = { p, prod, variants, sel: prod ? initialSelection(prod, variants) : [] };
      renderBuy();
      // warm the neighbours
      [list[(index + 1) % list.length], list[(index - 1 + list.length) % list.length]].forEach(n => preload(n.primary.srcset));
    }

    items.forEach((a, k) => {
      a.setAttribute('role', 'button');
      a.setAttribute('aria-pressed', String(k === 0));
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // modified clicks still open the product page
        e.preventDefault();
        if (k !== index) select(k);
      });
      a.addEventListener('keydown', e => {
        if (e.key === ' ') { e.preventDefault(); if (k !== index) select(k); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); select(k + 1, { focusItem: true }); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); select(k - 1, { focusItem: true }); }
      });
      a.addEventListener('pointerenter', () => preload(list[k].primary.srcset));
      a.addEventListener('focus', () => preload(list[k].primary.srcset));
    });
    $('[data-spot-prev]', root)?.addEventListener('click', () => select(index - 1));
    $('[data-spot-next]', root)?.addEventListener('click', () => select(index + 1));

    // Swipe the stage on touch screens
    let start = null;
    frame.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') start = { x: e.clientX, y: e.clientY }; });
    frame.addEventListener('pointerup', e => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) select(index + (dx < 0 ? 1 : -1));
    });
    frame.addEventListener('pointercancel', () => { start = null; });

    buyEl.addEventListener('click', e => {
      const option = e.target.closest('[data-spot-option]');
      if (option) {
        const i = Number(option.dataset.spotOption);
        const value = option.dataset.value;
        applyOption(state, i, value);
        if (i === state.prod.colorIndex) setStageImage(state.prod.colorImages?.[value], null);
        renderBuy();
        $(`[data-spot-option="${i}"][data-value="${CSS.escape(value)}"]`, buyEl)?.focus({ preventScroll: true });
        statusEl.textContent = '';
        return;
      }
      if (e.target.closest('[data-spot-add]')) {
        const variant = state.variants.find(v => matches(v, state.sel));
        const err = saveVariant(state.p.handle, state.prod.title, variant, imgEl.getAttribute('srcset')?.split(',')[0].trim().split(' ')[0] || imgEl.src);
        statusEl.classList.toggle('is-error', Boolean(err));
        if (err) statusEl.textContent = err;
        else statusEl.innerHTML = `Added ${esc(variant.options.map(label).join(' / '))} to your preview cart. <a href="/cart">View cart</a>`;
      }
    });

    select(0, { animate: false });
  });

  /* ---------- rails (explicit controls, no autoplay, no scroll hijack) ---------- */
  $$('[data-rail]').forEach(rail => {
    const track = $('.rail__track', rail);
    const section = rail.closest('.collection');
    const prev = $('[data-rail-prev]', section);
    const next = $('[data-rail-next]', section);
    const bar = $('[data-rail-bar]', rail);
    let queued = false;
    const update = () => {
      queued = false;
      const max = track.scrollWidth - track.clientWidth;
      const x = track.scrollLeft;
      const scrollable = max > 2 && getComputedStyle(track).overflowX !== 'visible';
      section.classList.toggle('is-static', !scrollable);
      if (prev) prev.disabled = !scrollable || x <= 2;
      if (next) next.disabled = !scrollable || x >= max - 2;
      if (bar) {
        const size = Math.min(1, track.clientWidth / Math.max(1, track.scrollWidth));
        const pos = max > 0 ? x / max : 0;
        bar.style.transform = `translateX(${(pos * (1 - size) * 100).toFixed(2)}%) scaleX(${size.toFixed(4)})`;
      }
    };
    const page = dir => {
      const card = $('.pcard', track);
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const step = card ? card.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
      const perPage = Math.max(1, Math.floor((track.clientWidth - parseFloat(getComputedStyle(track).paddingLeft)) / step));
      track.scrollBy({ left: dir * perPage * step, behavior: motion() ? 'smooth' : 'auto' });
    };
    prev?.addEventListener('click', () => page(-1));
    next?.addEventListener('click', () => page(1));
    track.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(track);
    window.addEventListener('load', update);
    update();
  });

  /* ---------- films (muted, in-view playback, accessible pause) ---------- */
  const films = $$('[data-film]');
  const userPaused = new WeakSet();
  const visible = new WeakSet();
  const labelFilm = video => {
    const fig = video.closest('.film');
    const n = films.indexOf(video) + 1;
    const playing = !video.paused;
    fig.classList.toggle('is-playing', playing);
    const label = $('[data-film-label]', fig);
    if (label) label.textContent = `${playing ? 'Pause' : 'Play'} film ${n}`;
  };
  const play = v => { v.muted = true; const pr = v.play(); if (pr?.catch) pr.catch(() => labelFilm(v)); };
  films.forEach(video => {
    video.muted = true;
    video.addEventListener('play', () => labelFilm(video));
    video.addEventListener('pause', () => labelFilm(video));
    $('[data-film-toggle]', video.closest('.film'))?.addEventListener('click', () => {
      if (video.paused) { userPaused.delete(video); play(video); }
      else { userPaused.add(video); video.pause(); }
    });
    labelFilm(video);
  });
  if (films.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      const v = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
        visible.add(v);
        if (motion() && !userPaused.has(v) && !document.hidden) play(v);
      } else {
        visible.delete(v);
        if (!v.paused) v.pause();
      }
    }), { threshold: [0, 0.45, 0.9] });
    films.forEach(v => io.observe(v));
  }
  document.addEventListener('visibilitychange', () => {
    films.forEach(v => {
      if (document.hidden) { if (!v.paused) v.pause(); }
      else if (visible.has(v) && motion() && !userPaused.has(v)) play(v);
    });
  });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { if (e.matches) films.forEach(v => v.pause()); });

  /* ---------- newsletter (preview: never sent or stored) ---------- */
  const newsletter = $('[data-newsletter]');
  newsletter?.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('input[type="email"]', newsletter);
    const status = $('.newsletter__status', newsletter);
    status.classList.remove('is-error');
    if (!input.value.trim() || !input.checkValidity()) {
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'Enter a valid email address.';
      status.classList.add('is-error');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    input.value = '';
    status.textContent = 'Preview only — your email was not subscribed, sent or saved.';
  });

  /* ---------- localization note ---------- */
  $('[data-locale]')?.addEventListener('click', () => {
    const note = $('[data-locale-note]');
    if (note) note.textContent = 'This preview displays prices in USD.';
  });

  /* ---------- promotion countdown (fixed end time; never restarted) ---------- */
  const announce = $('[data-announce]');
  if (announce) {
    const end = Date.parse(announce.dataset.endsAt) || 0;
    const key = announce.dataset.key;
    const clock = $('[data-announce-clock]', announce);
    const pad = n => String(n).padStart(2, '0');
    const setHeight = () => root.style.setProperty('--announce-h', announce.hidden ? '0px' : announce.offsetHeight + 'px');
    const hide = () => { announce.hidden = true; setHeight(); window.VPMotion?.refresh(); };
    let timer = 0;
    const tick = () => {
      const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      if (!left) {
        clearInterval(timer);
        if (announce.dataset.hideExpired === 'true') hide(); else $('[data-announce-timer]', announce).hidden = true;
        return;
      }
      const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
      clock.textContent = `${d ? d + 'd ' : ''}${pad(h)}h ${pad(m)}m ${pad(s)}s`;
    };
    if (!announce.hidden && end) { tick(); timer = setInterval(tick, 1000); }
    $('[data-announce-close]', announce)?.addEventListener('click', () => {
      try { sessionStorage.setItem('vp-announce-dismissed', key); } catch { /* dismissal just won't persist */ }
      clearInterval(timer);
      hide();
      $('.site-header__logo')?.focus();
    });
    setHeight();
    window.addEventListener('resize', setHeight);
  }

  /** Replaces the whole preview cart (cart page). Returns false if storage is blocked. */
  function writeCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { return false; }
    renderCartCount(true);
    return true;
  }

  /* Shared helpers for page scripts (pages.js). */
  window.VPStore = {
    data, money, esc, label, motion, overlay, readCart, writeCart, renderCartCount, saveVariant,
    variantsOf, optionGroups, initialSelection, applyOption, matches, CART_KEY,
  };

  /* Search: keep the query visible in the field on the results page */
  if (/^\/search(\.html)?\/?$/.test(location.pathname)) {
    const q = new URLSearchParams(location.search).get('q');
    if (q && $('#search-q')) $('#search-q').value = q.slice(0, 80);
  }

  /* ---------- global Escape + Back/forward cache restore ---------- */
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && qaState) closeQA(); });
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    renderCartCount();
    closeQA({ restore: false });
    drawer?.close({ restore: false });
    search?.close({ restore: false });
  });
})();
