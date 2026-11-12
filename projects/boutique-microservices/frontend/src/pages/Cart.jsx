import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatPrice } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Cart() {
  const { setCartCount, refreshCart } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const applyCart = (next) => {
    setCart(next);
    setCartCount(next.items.reduce((n, i) => n + i.quantity, 0));
  };

  useEffect(() => {
    api('/cart').then(applyCart).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setQuantity(productId, quantity) {
    setBusy(true);
    setError('');
    try {
      applyCart(await api(`/cart/items/${productId}`, { method: 'PUT', body: { quantity } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const { order } = await api('/checkout', { method: 'POST' });
      setCartCount(0);
      navigate('/orders', { state: { placed: order.id } });
    } catch (err) {
      setError(err.message);
      // Checkout puts the cart back on failure; reload it to show the truth.
      api('/cart').then(applyCart).catch(() => refreshCart());
    } finally {
      setBusy(false);
    }
  }

  if (!cart) return error ? <p className="alert error">{error}</p> : <p className="muted">Loading cart…</p>;

  return (
    <section>
      <h1>Your cart</h1>
      {error && <p className="alert error">{error}</p>}
      {cart.items.length === 0 ? (
        <div className="card empty">
          <p>Your cart is empty.</p>
          <Link to="/" className="button">Browse the shop</Link>
        </div>
      ) : (
        <div className="card">
          <ul className="line-items">
            {cart.items.map(({ product, quantity, lineTotalCents }) => (
              <li key={product.id}>
                <span className="line-emoji" aria-hidden="true">{product.emoji}</span>
                <div className="line-name">
                  <strong>{product.name}</strong>
                  <span className="muted small">{formatPrice(product.priceCents)} each</span>
                </div>
                <div className="stepper">
                  <button type="button" aria-label="Decrease" disabled={busy} onClick={() => setQuantity(product.id, quantity - 1)}>−</button>
                  <span>{quantity}</span>
                  <button type="button" aria-label="Increase" disabled={busy || quantity >= 99} onClick={() => setQuantity(product.id, quantity + 1)}>+</button>
                </div>
                <strong className="line-total">{formatPrice(lineTotalCents)}</strong>
              </li>
            ))}
          </ul>
          <div className="summary">
            <span>Total</span>
            <strong>{formatPrice(cart.totalCents)}</strong>
          </div>
          <button type="button" className="button wide" disabled={busy} onClick={checkout}>
            {busy ? 'Working…' : 'Place order'}
          </button>
        </div>
      )}
    </section>
  );
}
