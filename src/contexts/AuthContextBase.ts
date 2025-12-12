import { createContext } from 'react';

export interface User {
  username: string;
  role: 'admin' | 'teacher';
  teacherId?: number; // Nur für Lehrer
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
