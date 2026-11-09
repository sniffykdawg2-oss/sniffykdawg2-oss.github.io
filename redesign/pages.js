/* Vengeance Project — page behaviour beyond the homepage (local preview).
 *
 * - Catalog/search: collection chips, captured sort options, grid size, title search. URL keeps the
 *   state (?group, ?sort, ?q) so links like the footer's collection links work.
 * - Product page: real variants/availability, quantity, color → matching photo, size chart, copy link.
 *   Adds to the shared local preview cart ('vp-local-demo-cart'); checkout is not connected.
 * - Cart page: renders the local preview cart; quantity and remove update it in place.
 * - Forms (contact, ambassador registration, login, reset): validated in the browser, then cleared.
 *   Nothing is ever sent, stored or logged — including passwords.
 */
(() => {
  'use strict';
  const S = window.VPStore;
  if (!S) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const { money, esc, label } = S;
  const motion = () => S.motion();
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const headerH = () => $('[data-header]')?.offsetHeight || 64;

  /* =====================================================================
     Catalog / search
     ===================================================================== */
  const cat = $('[data-catalog]');
  if (cat) {
    const grid = $('[data-cat-grid]', cat);
    const items = $$('[data-cat-item]', grid).map(el => ({
      el, index: +el.dataset.index, title: el.dataset.title, price: +el.dataset.price,
      created: +el.dataset.created, groups: el.dataset.groups.split(' ').filter(Boolean),
      imgs: $$('img', el),
    }));
    const band = $('[data-cat-band]', grid);
    const bandAfter = band ? items.findIndex(it => it.el === band.nextElementSibling) : -1;
    const chips = $$('[data-group]', cat);
    const sortSel = $('[data-cat-sort]', cat);
    const views = $$('[data-view]', cat);
    const status = $('[data-cat-status]', cat);
    const clears = $$('[data-cat-clear]', cat);
    const empty = $('[data-cat-empty]', cat);
    const summary = $('[data-cat-summary]');
    const isSearch = cat.hasAttribute('data-search-page');
    const total = items.length;
    const params = new URLSearchParams(location.search);
    const groupIds = chips.map(c => c.dataset.group);
    const sorts = [...sortSel.options].map(o => o.value);
    const groupName = id => chips.find(c => c.dataset.group === id)?.firstChild.textContent || '';
    let view = 'grid';
    try { if (localStorage.getItem('vp-cat-view') === 'large') view = 'large'; } catch { /* default view */ }
    const state = {
      group: groupIds.includes(params.get('group')) ? params.get('group') : 'all',
      sort: sorts.includes(params.get('sort')) ? params.get('sort') : sorts[0],
      q: (params.get('q') || '').trim().slice(0, 80),
    };
    const byIndex = (a, b) => a.index - b.index;
    const sorters = {
      manual: byIndex,
      'title-ascending': (a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : byIndex(a, b)),
      'title-descending': (a, b) => (a.title > b.title ? -1 : a.title < b.title ? 1 : byIndex(a, b)),
      'price-ascending': (a, b) => a.price - b.price || byIndex(a, b),
      'price-descending': (a, b) => b.price - a.price || byIndex(a, b),
      'created-ascending': (a, b) => a.created - b.created || byIndex(a, b),
      'created-descending': (a, b) => b.created - a.created || byIndex(a, b),
    };

    function setView(next, { save = true } = {}) {
      view = next;
      grid.classList.toggle('is-large', view === 'large');
      views.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
      const sizes = view === 'large' ? '(min-width: 700px) 50vw, 100vw' : '(min-width: 1024px) 25vw, (min-width: 700px) 33vw, 50vw';
      items.forEach(it => it.imgs.forEach(im => { im.sizes = sizes; }));
      if (save) { try { localStorage.setItem('vp-cat-view', view); } catch { /* not remembered */ } }
      window.VPMotion?.refresh();
    }

    function syncURL() {
      const u = new URL(location.href);
      ['group', 'sort', 'q'].forEach(k => u.searchParams.delete(k));
      if (state.group !== 'all') u.searchParams.set('group', state.group);
      if (state.sort !== sorts[0]) u.searchParams.set('sort', state.sort);
      if (state.q) u.searchParams.set('q', state.q);
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }

    function animateIn(visible) {
      if (!motion() || !visible.length) return;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length || 4;
      visible.slice(0, cols * 3).forEach((it, i) => {
        const media = $('.wall__media', it.el);
        const delay = (i % cols) * 70 + Math.floor(i / cols) * 90;
        media?.getAnimations?.().forEach(a => a.cancel());
        media?.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 900, delay, easing: EASE, fill: 'backwards' });
        $('.wall__img--primary', it.el)?.animate([{ transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 1400, delay, easing: EASE, fill: 'backwards' });
      });
    }

    function apply({ animate = true, scroll = true } = {}) {
      const tokens = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      const ordered = [...items].sort(sorters[state.sort] || byIndex);
      const visible = ordered.filter(it => (state.group === 'all' || it.groups.includes(state.group)) && tokens.every(t => it.title.includes(t)));
      items.forEach(it => { it.el.hidden = !visible.includes(it); });
      ordered.forEach(it => grid.append(it.el));
      const filtered = state.group !== 'all' || state.sort !== sorts[0] || tokens.length > 0;
      grid.classList.toggle('is-filtered', filtered);
      if (band) { const anchor = visible[bandAfter]; if (anchor) grid.insertBefore(band, anchor.el); else grid.append(band); }
      chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.group === state.group)));
      sortSel.value = state.sort;
      const n = visible.length;
      empty.hidden = n > 0;
      grid.hidden = n === 0;
      const parts = [];
      if (state.q) parts.push(`${n} result${n === 1 ? '' : 's'} for “${state.q}”`);
      else if (state.group !== 'all') parts.push(`${n} of ${total} products · ${groupName(state.group)}`);
      else if (isSearch) parts.push(`Showing all ${total} products`);
      status.textContent = parts.join('');
      clears.forEach(b => { b.hidden = !(state.q || state.group !== 'all'); });
      if (summary) summary.textContent = `${n} product${n === 1 ? '' : 's'}`;
      syncURL();
      window.VPMotion?.refresh();
      if (animate) {
        animateIn(visible);
        const top = cat.getBoundingClientRect().top + window.scrollY - headerH();
        if (scroll && window.scrollY > top + 4) window.scrollTo({ top, behavior: motion() ? 'smooth' : 'auto' });
      }
    }

    chips.forEach(c => c.addEventListener('click', () => {
      if (state.group === c.dataset.group) return;
      state.group = c.dataset.group;
      apply();
      const box = c.parentElement, l = c.offsetLeft - box.offsetLeft;
      if (l < box.scrollLeft || l + c.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, l - 16), behavior: motion() ? 'smooth' : 'auto' });
    }));
    sortSel.addEventListener('change', () => { state.sort = sortSel.value; apply(); });
    views.forEach(b => b.addEventListener('click', () => { if (b.dataset.view !== view) { setView(b.dataset.view); animateIn(items.filter(it => !it.el.hidden)); } }));
    clears.forEach(b => b.addEventListener('click', () => {
      state.group = 'all'; state.q = '';
      apply();
      chips[0]?.focus({ preventScroll: true });
    }));

    if (view !== 'grid') setView(view, { save: false });
    if (state.group !== 'all' || state.sort !== sorts[0] || state.q || isSearch) apply({ animate: false });
  }

  /* =====================================================================
     Product page
     ===================================================================== */
  const pdp = $('[data-pdp]');
  const prod = pdp && S.data.products?.[pdp.dataset.pdp];
  if (pdp && prod) {
    const handle = pdp.dataset.pdp;
    const colorFrames = S.data.pdp?.colorFrames || {};
    const form = $('[data-buy]', pdp);
    const groupsEl = $('[data-buy-groups]', form);
    const addBtn = $('[data-buy-add]', form);
    const addLabel = $('[data-buy-label]', form);
    const addPrice = $('[data-buy-price]', form);
    const status = $('[data-buy-status]', form);
    const qtyInput = $('[data-qty-input]', form);
    const gal = $('[data-gallery]', pdp);
    const frames = $$('[data-gal-frame]', gal);
    const leadImg = frames[0] && $('[data-gal-img]', frames[0]);
    const lead = leadImg ? { srcset: leadImg.getAttribute('srcset'), src: leadImg.getAttribute('src'), alt: leadImg.alt } : null;
    const wide = matchMedia('(min-width: 1024px)');
    const variants = S.variantsOf(prod);
    const st = { prod, variants, sel: S.initialSelection(prod, variants) };
    const minPrice = Math.min(...variants.map(v => v.price));

    const current = () => (st.sel.every(v => v != null) ? variants.find(v => S.matches(v, st.sel)) : null);
    function render() {
      groupsEl.innerHTML = S.optionGroups(prod, variants, st.sel, 'buy', 'buy');
      const variant = current();
      const missing = prod.options.filter((_, i) => st.sel[i] == null).map(n => n.toLowerCase());
      const ready = Boolean(variant && variant.available);
      addBtn.disabled = !ready;
      addLabel.textContent = ready ? 'Add to preview cart' : variant && !variant.available ? 'Sold out' : `Select ${missing.join(' & ') || 'options'}`;
      addPrice.textContent = money(variant ? variant.price : minPrice);
    }

    function showColor(value) {
      const k = colorFrames[value];
      if (k == null || !frames[k]) return;
      if (wide.matches) {
        if (!leadImg) return;
        const srcImg = $('[data-gal-img]', frames[k]);
        const next = k === 0 ? lead : { srcset: srcImg.getAttribute('srcset'), src: srcImg.getAttribute('src'), alt: srcImg.alt };
        if (leadImg.getAttribute('srcset') === next.srcset) return;
        leadImg.setAttribute('srcset', next.srcset); leadImg.setAttribute('src', next.src); leadImg.alt = next.alt;
        if (motion()) { frames[0].classList.remove('is-swapping'); void frames[0].offsetWidth; frames[0].classList.add('is-swapping'); }
      } else {
        gal.scrollTo({ left: frames[k].offsetLeft - frames[0].offsetLeft, behavior: motion() ? 'smooth' : 'auto' });
      }
    }
    frames[0]?.addEventListener('animationend', () => frames[0].classList.remove('is-swapping'));
    // Restore the lead photo when the layout switches to the swipe gallery
    wide.addEventListener('change', () => { if (lead && leadImg) { leadImg.setAttribute('srcset', lead.srcset); leadImg.setAttribute('src', lead.src); leadImg.alt = lead.alt; } });

    groupsEl.addEventListener('click', e => {
      const option = e.target.closest('[data-buy-option]');
      if (!option) return;
      const i = Number(option.dataset.buyOption);
      const value = option.dataset.value;
      S.applyOption(st, i, value);
      if (i === prod.colorIndex) showColor(value);
      render();
      $(`[data-buy-option="${i}"][data-value="${CSS.escape(value)}"]`, groupsEl)?.focus({ preventScroll: true });
      status.textContent = ''; status.classList.remove('is-error');
    });

    const clampQty = v => Math.max(1, Math.min(99, Math.round(Number(v) || 1)));
    form.addEventListener('click', e => {
      const step = e.target.closest('[data-qty-step]');
      if (step) qtyInput.value = String(clampQty(Number(qtyInput.value) + Number(step.dataset.qtyStep)));
    });
    qtyInput.addEventListener('change', () => { qtyInput.value = String(clampQty(qtyInput.value)); });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const variant = current();
      status.classList.remove('is-error');
      if (!variant) {
        const missing = prod.options.filter((_, i) => st.sel[i] == null).map(n => n.toLowerCase());
        status.textContent = `Select ${missing.join(' & ')} first.`; status.classList.add('is-error');
        return;
      }
      const qty = clampQty(qtyInput.value);
      qtyInput.value = String(qty);
      const image = (leadImg?.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0] || leadImg?.getAttribute('src') || '';
      const err = S.saveVariant(handle, prod.title, variant, image, qty);
      if (err) { status.textContent = err; status.classList.add('is-error'); return; }
      status.innerHTML = `Added ${qty} × ${esc(variant.options.map(label).join(' / '))} to your preview cart. <a href="/cart">View cart</a>`;
      if (motion()) { addBtn.classList.remove('is-added'); void addBtn.offsetWidth; addBtn.classList.add('is-added'); }
    });

    // Swipe gallery counter (tablet / phone)
    const count = $('[data-gal-current]', pdp);
    if (count && gal) {
      let queued = false;
      gal.addEventListener('scroll', () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const step = frames[1] ? frames[1].offsetLeft - frames[0].offsetLeft : gal.clientWidth;
          count.textContent = String(Math.min(frames.length, Math.round(gal.scrollLeft / Math.max(1, step)) + 1));
        });
      }, { passive: true });
    }

    // Size chart
    const sheetEl = $('[data-sheet]');
    if (sheetEl) {
      const sheet = S.overlay(sheetEl, { onOpen: () => $('.sheet__panel', sheetEl)?.focus() });
      $$('[data-sheet-open]').forEach(b => b.addEventListener('click', () => sheet.open(b)));
      $$('[data-sheet-close]', sheetEl).forEach(b => b.addEventListener('click', () => sheet.close()));
      window.addEventListener('pageshow', e => { if (e.persisted) sheet.close({ restore: false }); });
    }

    // Copy link (clipboard only; nothing is sent anywhere)
    const share = $('[data-share]', pdp);
    const shareStatus = $('[data-share-status]', pdp);
    let shareTimer = 0;
    share?.addEventListener('click', async () => {
      const url = location.origin + location.pathname;
      let ok = false;
      try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
      shareStatus.textContent = ok ? 'Link copied' : 'Copy the link from the address bar';
      clearTimeout(shareTimer);
      shareTimer = setTimeout(() => { shareStatus.textContent = ''; }, 3200);
    });

    render();
  }

  /* =====================================================================
     Cart page
     ===================================================================== */
  const cartPage = $('[data-cart-page]');
  if (cartPage) {
    const list = $('[data-cart-items]', cartPage);
    const filled = $('[data-cart-filled]', cartPage);
    const emptyEl = $('[data-cart-empty]', cartPage);
    const totalEl = $('[data-cart-total]', cartPage);
    const summaryEl = $('[data-cart-summary]', cartPage);
    const safeImage = src => (typeof src === 'string' && /^\/(?!\/)[\w\-./]+$/.test(src) ? src : '');
    const clean = cart => cart.filter(it => it && it.id != null && Number.isFinite(Number(it.price)) && Number(it.quantity) > 0);
    const handleOk = h => (typeof h === 'string' && /^[\w-]+$/.test(h) ? h : '');

    function row(it, k) {
      const h = handleOk(it.handle);
      const href = h ? `/products/${h}` : '/collections/all';
      const qty = Math.min(99, Math.max(1, Math.round(Number(it.quantity))));
      const img = safeImage(it.image);
      const title = String(it.title || 'Product');
      return `<li class="ci" data-ci="${k}">
        <a class="ci__media" href="${href}" tabindex="-1" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : ''}</a>
        <div class="ci__body">
          <p class="ci__title"><a href="${href}">${esc(title)}</a></p>
          ${it.variant ? `<p class="ci__variant">${esc(String(it.variant).split(' / ').map(label).join(' / '))}</p>` : ''}
          <p class="ci__unit">${money(Number(it.price))} each</p>
        </div>
        <p class="ci__total"><span class="sr-only">Line total </span>${money(Number(it.price) * qty)}</p>
        <div class="ci__controls">
          <div class="qty">
            <button class="qty__btn" type="button" data-ci-step="-1" aria-label="Decrease quantity for ${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14"/></svg></button>
            <label class="sr-only" for="ci-qty-${k}">Quantity for ${esc(title)}</label>
            <input class="qty__input" id="ci-qty-${k}" type="number" inputmode="numeric" min="0" max="99" value="${qty}" data-ci-qty>
            <button class="qty__btn" type="button" data-ci-step="1" aria-label="Increase quantity for ${esc(title)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg></button>
          </div>
          <button class="ci__remove" type="button" data-ci-remove>Remove<span class="sr-only"> ${esc(title)}</span></button>
        </div>
      </li>`;
    }

    function render({ animate = false } = {}) {
      const cart = clean(S.readCart());
      const count = cart.reduce((s, it) => s + Math.min(99, Math.round(Number(it.quantity))), 0);
      filled.hidden = cart.length === 0;
      emptyEl.hidden = cart.length > 0;
      const cont = $('.cart__continue', cartPage); if (cont) cont.hidden = cart.length === 0;
      summaryEl.textContent = cart.length ? `${count} item${count === 1 ? '' : 's'}` : '';
      list.innerHTML = cart.map(row).join('');
      totalEl.textContent = money(cart.reduce((s, it) => s + Number(it.price) * Math.min(99, Math.round(Number(it.quantity))), 0));
      if (animate && motion()) $$('.ci', list).forEach((li, i) => li.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 380 + i * 70, easing: EASE, fill: 'backwards' }));
      cartPage.classList.add('is-ready');
    }

    function update(k, qty, { focus = null } = {}) {
      const cart = clean(S.readCart());
      if (!cart[k]) return render();
      if (qty <= 0) cart.splice(k, 1); else cart[k].quantity = Math.min(99, qty);
      if (!S.writeCart(cart)) { summaryEl.textContent = 'Your browser blocked local storage, so the preview cart could not be updated.'; return; }
      render();
      if (focus) $(focus.replace('{k}', Math.min(k, cart.length - 1)), list)?.focus();
      else if (!cart.length) $('.cart__empty a', cartPage)?.focus();
    }

    list.addEventListener('click', e => {
      const li = e.target.closest('[data-ci]');
      if (!li) return;
      const k = Number(li.dataset.ci);
      const input = $('[data-ci-qty]', li);
      const step = e.target.closest('[data-ci-step]');
      if (step) { update(k, Number(input.value) + Number(step.dataset.ciStep), { focus: `[data-ci="{k}"] [data-ci-step="${step.dataset.ciStep}"]` }); return; }
      if (e.target.closest('[data-ci-remove]')) {
        const done = () => update(k, 0, { focus: '[data-ci="{k}"] [data-ci-remove]' });
        if (motion() && li.animate) {
          li.style.overflow = 'hidden';
          const anim = li.animate([{ opacity: 1, height: li.offsetHeight + 'px' }, { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px' }], { duration: 420, easing: EASE });
          anim.onfinish = done;
        } else done();
      }
    });
    list.addEventListener('change', e => {
      const input = e.target.closest('[data-ci-qty]');
      if (!input) return;
      const k = Number(input.closest('[data-ci]').dataset.ci);
      update(k, Math.round(Number(input.value) || 0), { focus: `#ci-qty-{k}` });
    });
    window.addEventListener('storage', e => { if (e.key === S.CART_KEY) render(); });
    window.addEventListener('pageshow', e => { if (e.persisted) render(); });
    render({ animate: true });
  }

  /* =====================================================================
     Preview forms — validated here, then cleared. Never sent, stored or logged.
     ===================================================================== */
  const MESSAGES = {
    contact: 'Preview only — your message was not sent or saved.',
    registration: 'Preview only — your application was not sent or saved, and no account was created.',
    login: 'Preview only — sign-in is not connected. Nothing was sent or saved.',
    reset: 'Preview only — no email was sent and nothing was saved.',
  };
  $$('[data-preview-form]').forEach(form => {
    const kind = form.dataset.previewForm;
    const status = $('[data-form-status]', form);
    $$('[data-js-enable]', form).forEach(b => { b.disabled = false; });

    // Show / hide password
    form.addEventListener('click', e => {
      const t = e.target.closest('[data-reveal-pw]');
      if (!t) return;
      const input = form.querySelector('#' + CSS.escape(t.getAttribute('aria-controls')));
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.setAttribute('aria-pressed', String(show));
      t.firstChild.textContent = show ? 'Hide' : 'Show';
    });

    // Commission method → matching payout field (PayPal email / Venmo username / none for store credit)
    const payout = $('[data-payout]', form);
    const detail = $('[data-payout-detail]', form);
    const detailField = detail?.closest('[data-field]');
    const detailLabel = detailField && $('.field__label', detailField);
    const PAYOUT = {
      paypal: { label: detailLabel?.firstChild.textContent || 'Paypal email', type: 'email', autocomplete: 'email', show: true },
      venmo: { label: 'Venmo username', type: 'text', autocomplete: 'off', show: true },
      store_credit: { show: false },
    };
    function syncPayout() {
      const v = form.elements.payment_method?.value || 'paypal';
      const cfg = PAYOUT[v] || PAYOUT.paypal;
      detailField.hidden = !cfg.show;
      detail.required = cfg.show;
      if (cfg.show) {
        if (detail.type !== cfg.type) detail.value = '';
        detail.type = cfg.type; detail.autocomplete = cfg.autocomplete;
        detailLabel.firstChild.textContent = cfg.label;
      }
      clearError(detailField);
    }
    if (payout && detail) { payout.addEventListener('change', syncPayout); syncPayout(); }

    function clearError(field) {
      if (!field) return;
      field.classList.remove('is-invalid');
      const err = $('[data-field-error]', field);
      if (err) err.textContent = '';
      $$('input, textarea', field).forEach(i => i.removeAttribute('aria-invalid'));
    }
    const onEdit = e => { const f = e.target.closest('[data-field]'); if (f?.classList.contains('is-invalid')) clearError(f); };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);

    function check(field) {
      const inputs = $$('input, textarea', field);
      const first = inputs[0];
      if (!first) return '';
      if (first.type === 'radio') return inputs.some(i => i.required) && !inputs.some(i => i.checked) ? 'Choose one.' : '';
      if (first.type === 'checkbox') return first.required && !first.checked ? 'This box is required.' : '';
      const v = first.value.trim();
      if (first.required && !v) return 'This field is required.';
      if (v && first.type === 'email' && !first.checkValidity()) return 'Enter a valid email address.';
      if (first.dataset.match && first.value !== (form.elements[first.dataset.match]?.value || '')) return 'Passwords do not match.';
      return '';
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      status.textContent = ''; status.classList.remove('is-error');
      let firstBad = null;
      $$('[data-field]', form).forEach(field => {
        if (field.hidden) return;
        const msg = check(field);
        clearError(field);
        if (!msg) return;
        field.classList.add('is-invalid');
        $('[data-field-error]', field).textContent = msg;
        $$('input, textarea', field).forEach(i => i.setAttribute('aria-invalid', 'true'));
        firstBad = firstBad || $('input, textarea', field);
      });
      if (firstBad) {
        status.textContent = 'Check the highlighted fields.';
        status.classList.add('is-error');
        firstBad.focus();
        return;
      }
      // Valid: clear everything (passwords included) and say plainly that nothing happened.
      form.reset();
      $$('input[data-reveal-pw], [data-reveal-pw]', form).forEach(t => { t.setAttribute('aria-pressed', 'false'); t.firstChild.textContent = 'Show'; });
      $$('input', form).forEach(i => { if (i.id && /password/.test(i.id)) i.type = 'password'; });
      if (payout && detail) syncPayout();
      status.textContent = MESSAGES[kind] || 'Preview only — nothing was sent or saved.';
    });
  });
})();
