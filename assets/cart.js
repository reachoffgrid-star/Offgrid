/* OFFGRID cart: kept in this browser's localStorage, shared by every page.
   - any button with data-add-to-cart (and data-id / data-name / data-price) adds that item;
     once the item is in the cart the button turns into a  −  qty  +  stepper so more can be added
   - any element with class "cart-count" shows the number of items */
(() => {
  const KEY = 'offgrid-cart';

  function read() {
    try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  let items = read();

  function changed() {
    paintCount();
    syncButtons();
    document.dispatchEvent(new CustomEvent('cart:change', { detail: { items: items.slice() } }));
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* private mode: the cart lasts for this page only */ }
    changed();
  }

  const Cart = {
    items: () => items.map(i => ({ ...i })),
    qty: id => (items.find(i => i.id === id) || { qty: 0 }).qty,
    count: () => items.reduce((n, i) => n + i.qty, 0),
    subtotal: () => items.reduce((n, i) => n + i.qty * i.price, 0),
    add(item, qty = 1) {
      const found = items.find(i => i.id === item.id);
      if (found) found.qty = Math.min(99, found.qty + qty);
      else items.push({ id: item.id, name: item.name, price: Number(item.price) || 0, qty: Math.min(99, qty) });
      save();
    },
    setQty(id, qty) {
      const found = items.find(i => i.id === id);
      if (!found) return;
      if (qty <= 0) items = items.filter(i => i.id !== id); else found.qty = Math.min(99, qty);
      save();
    },
    remove(id) { items = items.filter(i => i.id !== id); save(); },
    clear() { items = []; save(); },
    money: n => '$' + n.toFixed(2)
  };
  window.OffgridCart = Cart;

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
      const q = Cart.qty(b.dataset.id);
      st.querySelector('output').textContent = q;
      b.hidden = q > 0;
      st.hidden = q === 0;
    });
  }

  // another tab changed the cart: pick it up
  addEventListener('storage', e => { if (e.key === KEY) { items = read(); changed(); } });

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add-to-cart]');
    if (add) {
      Cart.add({ id: add.dataset.id, name: add.dataset.name, price: add.dataset.price });
      const inc = add.nextElementSibling && add.nextElementSibling.querySelector('[data-inc]');
      if (inc) inc.focus();                                   // keep keyboard focus on the control that replaced the button
      return;
    }
    const step = e.target.closest('.qty-step [data-inc], .qty-step [data-dec]');
    if (step) {
      const b = step.closest('.qty-step').previousElementSibling, id = b.dataset.id;
      if (step.hasAttribute('data-inc')) Cart.add({ id, name: b.dataset.name, price: b.dataset.price });
      else { Cart.setQty(id, Cart.qty(id) - 1); if (!Cart.qty(id)) b.focus(); }
    }
  });

  function boot() { paintCount(); syncButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
