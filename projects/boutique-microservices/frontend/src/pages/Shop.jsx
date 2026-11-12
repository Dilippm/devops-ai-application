import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatPrice } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Shop() {
  const { token, setCartCount } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    api('/products/categories').then((d) => setCategories(d.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    api(`/products${query}`)
      .then((d) => { setProducts(d.products); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [category]);

  async function addToCart(product) {
    if (!token) return navigate('/login', { state: { from: '/' } });
    setAdding(product.id);
    setNotice('');
    try {
      const cart = await api('/cart/items', { method: 'POST', body: { productId: product.id, quantity: 1 } });
      setCartCount(cart.items.reduce((n, i) => n + i.quantity, 0));
      setNotice(`${product.name} added to your cart`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(null);
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>Shop</h1>
        <div className="filters">
          <button type="button" className={category === '' ? 'chip active' : 'chip'} onClick={() => setCategory('')}>All</button>
          {categories.map((c) => (
            <button type="button" key={c} className={category === c ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      </div>

      {notice && <p className="alert success">{notice}</p>}
      {error && <p className="alert error">{error}</p>}
      {loading ? <p className="muted">Loading products…</p> : (
        <div className="grid">
          {products.map((p) => (
            <article key={p.id} className="card product">
              <div className="product-art" aria-hidden="true">{p.emoji}</div>
              <div className="product-body">
                <span className="muted small">{p.category}</span>
                <h3>{p.name}</h3>
                <p className="muted">{p.description}</p>
              </div>
              <div className="product-foot">
                <strong>{formatPrice(p.priceCents)}</strong>
                {p.stock > 0 ? (
                  <button type="button" className="button" disabled={adding === p.id} onClick={() => addToCart(p)}>
                    {adding === p.id ? 'Adding…' : 'Add to cart'}
                  </button>
                ) : <span className="muted">Sold out</span>}
              </div>
              {p.stock > 0 && p.stock <= 5 && <span className="low-stock">Only {p.stock} left</span>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
