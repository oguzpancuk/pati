import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as authApi from '../api/auth';
import { setSessionExpiredHandler } from '../api/client';

interface AuthContextValue {
  user: authApi.User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  /** Apple/Google: the provider's identity token becomes a pati session. */
  loginWithProvider: (
    provider: authApi.SocialProvider,
    identityToken: string,
    name?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<authApi.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('user').then((stored) => {
      if (stored) {
        setUser(JSON.parse(stored));
      }
      setIsLoading(false);
    });
  }, []);

  useEffect(() => {
    // The API layer already clears the stored session on a 401; here we
    // also reset the user so they land back on the login screen.
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  async function persistSession(response: authApi.AuthResponse) {
    await AsyncStorage.setItem('token', response.token);
    await AsyncStorage.setItem('user', JSON.stringify(response.user));
    setUser(response.user);
  }

  async function login(email: string, password: string) {
    const response = await authApi.login(email, password);
    await persistSession(response);
  }

  async function register(name: string, email: string, password: string) {
    const response = await authApi.register(name, email, password);
    await persistSession(response);
  }

  async function loginWithProvider(
    provider: authApi.SocialProvider,
    identityToken: string,
    name?: string
  ) {
    const response = await authApi.socialLogin(provider, identityToken, name);
    await persistSession(response);
  }

  async function logout() {
    await AsyncStorage.multiRemove(['token', 'user']);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, loginWithProvider, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
