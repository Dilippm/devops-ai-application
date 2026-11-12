import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(tokenStore.get);
  const [user, setUser] = useState(null);
  const [cartCount, setCartCount] = useState(0);

  const saveSession = useCallback((nextToken, nextUser) => {
    tokenStore.set(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    if (!nextToken) setCartCount(0);
  }, []);

  const logout = useCallback(() => saveSession(null, null), [saveSession]);

  const refreshCart = useCallback(async () => {
    if (!token) return setCartCount(0);
    try {
      const cart = await api('/cart', { token });
      setCartCount(cart.items.reduce((n, item) => n + item.quantity, 0));
    } catch (err) {
      if (err.status === 401) logout();
    }
  }, [token, logout]);

  // Validate a stored token on load; drop it if it has expired.
  useEffect(() => {
    if (!token) return;
    api('/auth/me', { token })
      .then(({ user: me }) => setUser(me))
      .catch((err) => err.status === 401 && logout());
    refreshCart();
  }, [token, logout, refreshCart]);

  const value = useMemo(
    () => ({ token, user, cartCount, setCartCount, refreshCart, saveSession, logout }),
    [token, user, cartCount, refreshCart, saveSession, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
