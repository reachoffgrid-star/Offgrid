/* OFFGRID cart, kept in Shopify's own cart (the AJAX cart API) and shared by every page.
   - any button with data-add-to-cart and data-variant-id adds that variant;
     once it is in the cart the button turns into a  −  qty  +  stepper so more can be added
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

  const Cart = {
    items: () => cart.items.map(i => ({
      id: String(i.variant_id), name: i.product_title, variant: i.variant_title, price: i.final_price / 100,
      qty: i.quantity, img: i.image || '', url: i.url
    })),
    qty: v => (line(v) || { quantity: 0 }).quantity,
    count: () => cart.item_count,
    subtotal: () => cart.total_price / 100,
    add: (v, qty = 1) => run(() => post('cart/add.js', { items: [{ id: Number(v), quantity: qty }] }).then(load)),
    setQty: (v, qty) => run(() => {
      const l = line(v);
      return l ? post('cart/change.js', { id: l.key, quantity: Math.max(0, Math.min(99, qty)) }).then(set) : null;
    }),
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
      let st = b.nextElementSibling;
      if (!st || !st.classList.contains('qty-step')) {
        st = document.createElement('div');
        st.className = 'qty-step';
        st.setAttribute('role', 'group');
        st.setAttribute('aria-label', 'Quantity of ' + (b.dataset.name || 'item'));
        st.innerHTML = '<button type="button" data-dec aria-label="One fewer">&minus;</button><output aria-live="polite">0</output><button type="button" data-inc aria-label="One more">+</button>';
        b.after(st);
      }
      const q = Cart.qty(b.dataset.variantId);
      st.querySelector('output').textContent = q;
      b.hidden = q > 0;
      st.hidden = q === 0;
    });
  }

  // the cart may have changed in another tab, or this page came back from the browser's cache
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Cart.refresh(); });
  addEventListener('pageshow', e => { if (e.persisted) Cart.refresh(); });

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add-to-cart]');
    if (add) {
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
