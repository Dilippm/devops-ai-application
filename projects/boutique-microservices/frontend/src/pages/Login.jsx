import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { token, saveSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = location.state?.from || '/';

  if (token) return <Navigate to={destination} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token: newToken, user } = await api(`/auth/${mode}`, {
        method: 'POST',
        body: { email, password },
        token: null,
      });
      saveSession(newToken, user);
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <section className="narrow">
      <h1>{isLogin ? 'Log in' : 'Create an account'}</h1>
      {error && <p className="alert error">{error}</p>}
      <form className="card form" onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
          />
        </label>
        <button type="submit" className="button" disabled={busy}>
          {busy ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
        </button>
        <p className="muted small center">
          {isLogin ? 'New here?' : 'Already have an account?'}{' '}
          <button type="button" className="link-button" onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }}>
            {isLogin ? 'Create an account' : 'Log in'}
          </button>
        </p>
        {isLogin && <p className="muted small center">Demo account: demo@boutique.local / demo1234</p>}
      </form>
    </section>
  );
}
