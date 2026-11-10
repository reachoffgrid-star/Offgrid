/* OFFGRID cart, kept in Shopify's own cart (the AJAX cart API) and shared by every page.
   - any button with data-add-to-cart and data-variant-id adds that variant;
     once it is in the cart the button turns into a  −  qty  +  stepper so more can be added
   - a button that also has data-pick="3" is a pack where the customer chooses a colour for each item:
     it opens a picker, and the choices go into the cart line as "Item 1: White" and so on
   - any element with class "cart-count" shows the number of items */
(() => {
  const root = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/';
  let cart = window.OFFGRID_CART || { items: [], item_count: 0, total_price: 0 };
  let queue = Promise.resolve();

  const json = r => r.json().then(b => (r.ok ? b : Promise.reject(b)));
  const post = (path, body) => fetch(root + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body)
  }).then(json);
  const load = () => fetch(root + 'cart.js', { headers: { Accept: 'application/json' } }).then(json).then(set);
  function set(c) { cart = c; changed(); return c; }
  // one request at a time, so quick taps on + and − land in order
  const run = job => (queue = queue.then(job).catch(e => {
    document.dispatchEvent(new CustomEvent('cart:error', { detail: { message: (e && (e.description || e.message)) || 'Something went wrong.' } }));
    return load().catch(() => {});
  }));

  const line = v => cart.items.find(i => String(i.variant_id) === String(v));
  const shown = props => Object.entries(props || {}).filter(([k, val]) => k[0] !== '_' && val !== '');

  const Cart = {
    items: () => cart.items.map(i => ({
      key: i.key, id: String(i.variant_id), name: i.product_title, variant: i.variant_title, price: i.final_price / 100,
      qty: i.quantity, img: i.image || '', url: i.url, props: shown(i.properties)
    })),
    // every line of this variant together: a colour-picked pack can sit in the cart several times
    qty: v => cart.items.reduce((n, i) => n + (String(i.variant_id) === String(v) ? i.quantity : 0), 0),
    count: () => cart.item_count,
    subtotal: () => cart.total_price / 100,
    add: (v, qty = 1, properties) => run(() => post('cart/add.js', { items: [{ id: Number(v), quantity: qty, ...(properties ? { properties } : {}) }] }).then(load)),
    setQty: (v, qty) => run(() => {
      const l = line(v);
      return l ? post('cart/change.js', { id: l.key, quantity: Math.max(0, Math.min(99, qty)) }).then(set) : null;
    }),
    setLineQty: (key, qty) => run(() => post('cart/change.js', { id: key, quantity: Math.max(0, Math.min(99, qty)) }).then(set)),
    remove: v => Cart.setQty(v, 0),
    refresh: () => run(load),
    sync: () => syncButtons(),
    checkoutUrl: root + 'checkout',
    money: n => '₹' + Math.round(n).toLocaleString('en-IN')
  };
  window.OffgridCart = Cart;

  function changed() {
    paintCount();
    syncButtons();
    document.dispatchEvent(new CustomEvent('cart:change', { detail: { cart } }));
  }

  function paintCount() {
    const n = Cart.count();
    document.querySelectorAll('.cart-count').forEach(el => { el.textContent = n; el.classList.toggle('has', n > 0); });
  }

  // each add-to-cart button gets a sibling stepper; whichever fits the cart is shown
  function syncButtons() {
    document.querySelectorAll('[data-add-to-cart]').forEach(b => {
      const q = Cart.qty(b.dataset.variantId);
      if (b.dataset.pick) {                                    // packs stay a button: every add is a new choice of colours
        b.textContent = q > 0 ? 'Add another' : 'Add to cart';
        return;
      }
      let st = b.nextElementSibling;
      if (!st || !st.classList.contains('qty-step')) {
        st = document.createElement('div');
        st.className = 'qty-step';
        st.setAttribute('role', 'group');
        st.setAttribute('aria-label', 'Quantity of ' + (b.dataset.name || 'item'));
        st.innerHTML = '<button type="button" data-dec aria-label="One fewer">&minus;</button><output aria-live="polite">0</output><button type="button" data-inc aria-label="One more">+</button>';
        b.after(st);
      }
      st.querySelector('output').textContent = q;
      b.hidden = q > 0;
      st.hidden = q === 0;
    });
  }

  /* ---------- colour picker for packs ---------- */
  let dlg = null;
  function pickColours(n, colours, name) {
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'pick';
      document.body.appendChild(dlg);
    }
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const rows = Array.from({ length: n }, (_, i) => `
      <fieldset>
        <legend>Item ${i + 1}</legend>
        ${colours.map((c, j) => `<label><input type="radio" name="item${i + 1}" value="${esc(c)}"${j === i % colours.length ? ' checked' : ''}><span><i data-colour="${esc(c.toLowerCase())}"></i>${esc(c)}</span></label>`).join('')}
      </fieldset>`).join('');
    dlg.innerHTML = `
      <form method="dialog">
        <p class="pick-eyebrow">Choose your colours</p>
        <h3>${esc(name)}</h3>
        ${rows}
        <div class="pick-actions">
          <button type="submit" value="cancel" class="ghost">Cancel</button>
          <button type="submit" value="ok">Add to cart</button>
        </div>
      </form>`;
    return new Promise(resolve => {
      dlg.addEventListener('close', () => {
        if (dlg.returnValue !== 'ok') return resolve(null);
        const props = {};
        for (let i = 1; i <= n; i++) props['Item ' + i] = dlg.querySelector(`input[name="item${i}"]:checked`).value;
        resolve(props);
      }, { once: true });
      dlg.returnValue = '';
      dlg.showModal();
      dlg.querySelector('input:checked').focus();
    });
  }
  // a click on the dimmed backdrop closes the picker
  document.addEventListener('click', e => { if (dlg && e.target === dlg) dlg.close('cancel'); });

  // the cart may have changed in another tab, or this page came back from the browser's cache
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Cart.refresh(); });
  addEventListener('pageshow', e => { if (e.persisted) Cart.refresh(); });

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add-to-cart]');
    if (add) {
      if (add.dataset.pick) {
        const colours = (add.dataset.colours || 'White,Blush Pink').split(',').map(s => s.trim());
        pickColours(Number(add.dataset.pick), colours, add.dataset.name || '').then(props => {
          if (!props) return add.focus();
          add.disabled = true;
          Cart.add(add.dataset.variantId, 1, props).then(() => { add.disabled = false; add.focus(); });
        });
        return;
      }
      add.disabled = true;
      Cart.add(add.dataset.variantId).then(() => {
        add.disabled = false;
        const inc = add.nextElementSibling && add.nextElementSibling.querySelector('[data-inc]');
        if (inc && add.hidden) inc.focus();                    // keep keyboard focus on the control that replaced the button
      });
      return;
    }
    const step = e.target.closest('.qty-step [data-inc], .qty-step [data-dec]');
    if (step) {
      const st = step.closest('.qty-step'), b = st.previousElementSibling, v = b.dataset.variantId;
      const out = st.querySelector('output'), next = Number(out.textContent) + (step.hasAttribute('data-inc') ? 1 : -1);
      out.textContent = Math.max(0, next);                     // show the tap at once; the cart catches up
      Cart.setQty(v, next).then(() => { if (!Cart.qty(v)) b.focus(); });
    }
  });

  paintCount(); syncButtons();
})();
