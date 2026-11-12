import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Shop from './pages/Shop.jsx';
import Cart from './pages/Cart.jsx';
import Orders from './pages/Orders.jsx';
import Profile from './pages/Profile.jsx';
import Login from './pages/Login.jsx';

function RequireAuth({ children }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  const { token, user, cartCount, logout } = useAuth();

  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="brand">🛍️ Boutique</Link>
        <nav className="nav">
          <NavLink to="/" end>Shop</NavLink>
          {token && <NavLink to="/orders">Orders</NavLink>}
          {token && <NavLink to="/profile">Profile</NavLink>}
          <NavLink to="/cart" className="cart-link">
            Cart{cartCount > 0 && <span className="badge">{cartCount}</span>}
          </NavLink>
          {token ? (
            <button type="button" className="link-button" onClick={logout} title={user?.email}>
              Log out
            </button>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cart" element={<RequireAuth><Cart /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="footer">Boutique microservices demo</footer>
    </div>
  );
}
