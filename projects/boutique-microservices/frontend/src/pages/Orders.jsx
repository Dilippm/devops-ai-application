import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, formatDate, formatPrice } from '../api.js';

export default function Orders() {
  const location = useLocation();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const placed = location.state?.placed;

  useEffect(() => {
    api('/orders').then((d) => setOrders(d.orders)).catch((err) => setError(err.message));
  }, []);

  async function cancel(id) {
    if (!window.confirm(`Cancel order #${id}?`)) return;
    setCancelling(id);
    setError('');
    try {
      const { order } = await api(`/orders/${id}/cancel`, { method: 'POST' });
      setOrders((list) => list.map((o) => (o.id === id ? order : o)));
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(null);
    }
  }

  if (!orders) return error ? <p className="alert error">{error}</p> : <p className="muted">Loading orders…</p>;

  return (
    <section>
      <h1>Your orders</h1>
      {placed && <p className="alert success">Thanks! Order #{placed} has been placed.</p>}
      {error && <p className="alert error">{error}</p>}
      {orders.length === 0 && <div className="card empty"><p>You haven’t placed any orders yet.</p></div>}

      <div className="stack">
        {orders.map((o) => (
          <article key={o.id} className="card order">
            <div className="order-head">
              <div>
                <strong>Order #{o.id}</strong>
                <span className="muted small"> · {formatDate(o.createdAt)}</span>
              </div>
              <span className={`status ${o.status}`}>{o.status}</span>
            </div>
            <ul className="order-items">
              {o.items.map((item) => (
                <li key={item.productId}>
                  <span>{item.quantity} × {item.name}</span>
                  <span>{formatPrice(item.priceCents * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="order-foot">
              <strong>{formatPrice(o.totalCents)}</strong>
              {o.status === 'placed' && (
                <button type="button" className="button secondary" disabled={cancelling === o.id} onClick={() => cancel(o.id)}>
                  {cancelling === o.id ? 'Cancelling…' : 'Cancel order'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
