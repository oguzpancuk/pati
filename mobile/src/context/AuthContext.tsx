import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as authApi from '../api/auth';
import { fetchMe } from '../api/users';
import { setSessionExpiredHandler, setVerificationRequiredHandler } from '../api/client';

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
  /**
   * Whether the last registration/login reported a code on its way. False
   * after a cold start or a login: the code screen then leads with "send".
   */
  codeSent: boolean;
  /** The typed code; on success the session leaves the pending state. */
  verifyEmail: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<authApi.User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('user').then((stored) => {
      if (stored) {
        const parsed: authApi.User = JSON.parse(stored);
        setUser(parsed);
        // A stored pending user may have verified elsewhere (web) since;
        // without asking, the code screen would stay up and resend would
        // answer "already verified" (review finding). Only the pending case
        // asks — a verified session is trusted as before.
        if (parsed.email_verification_pending) {
          fetchMe()
            .then((me) => {
              if (me.email_verification_pending) return;
              // Functional update, and only onto the same user: a logout
              // during the request must not be undone by its late answer
              // (review finding).
              setUser((current) => {
                if (!current || current.id !== parsed.id) return current;
                const verified = { ...current, email_verification_pending: false };
                AsyncStorage.setItem('user', JSON.stringify(verified)).catch(() => {});
                return verified;
              });
            })
            .catch(() => {});
        }
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

  useEffect(() => {
    // A 403 "verify your e-mail" from anywhere means the stored user is
    // pending and the app did not know (a session stored before the flag
    // existed). Mark it so navigation swaps to the code screen instead of
    // leaving every request to fail on the map.
    setVerificationRequiredHandler(() => {
      setUser((current) => {
        if (!current || current.email_verification_pending) return current;
        const pending = { ...current, email_verification_pending: true };
        AsyncStorage.setItem('user', JSON.stringify(pending)).catch(() => {});
        return pending;
      });
    });
    return () => setVerificationRequiredHandler(null);
  }, []);

  async function persistUser(next: authApi.User) {
    await AsyncStorage.setItem('user', JSON.stringify(next));
    setUser(next);
  }

  async function persistSession(response: authApi.AuthResponse) {
    await AsyncStorage.setItem('token', response.token);
    setCodeSent(!!response.codeSent);
    await persistUser(response.user);
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
    setCodeSent(false);
  }

  async function verifyEmail(code: string) {
    const { user: verified } = await authApi.verifyEmail(code);
    await persistUser(verified);
  }

  async function resendCode() {
    await authApi.resendVerificationCode();
    setCodeSent(true);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        loginWithProvider,
        logout,
        codeSent,
        verifyEmail,
        resendCode,
      }}
    >
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
