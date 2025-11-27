import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api } from '../services/api';
import { AuthContext } from './AuthContextBase.ts';
import type { User } from './AuthContextBase.ts';

// AuthContext wird in `AuthContextBase.ts` definiert

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        // Nur verifizieren, wenn ein Token vorhanden ist
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setIsAuthenticated(false);
          setUser(null);
          setLoading(false);
          return;
        }

        const response = await api.auth.verify();
        if (response.authenticated && response.user) {
          setIsAuthenticated(true);
          setUser(response.user);
        } else {
          // Token ist ungültig, entfernen
          localStorage.removeItem('auth_token');
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Auth verification failed:', error);
        // Token ist ungültig, entfernen
        localStorage.removeItem('auth_token');
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    verifyAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await api.auth.login(username, password);
      if (response.success && response.user && response.token) {
        localStorage.setItem('auth_token', response.token);
        setIsAuthenticated(true);
        setUser(response.user);
      }
    } catch (error) {
      localStorage.removeItem('auth_token');
      setIsAuthenticated(false);
      setUser(null);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      localStorage.removeItem('auth_token');
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook ausgelagert in separate Datei `useAuth.ts` für besseres Fast Refresh
