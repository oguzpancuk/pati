import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchMe,
  getToken,
  login as apiLogin,
  Me,
  register as apiRegister,
  resendVerificationCode as apiResendCode,
  setSessionExpiredHandler,
  setToken,
  setVerificationRequiredHandler,
  socialLogin as apiSocialLogin,
  SocialProvider,
  verifyEmail as apiVerifyEmail,
} from './api';

interface AuthValue {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  /** Apple/Google: the provider's identity token becomes a pati session. */
  loginWithProvider: (
    provider: SocialProvider,
    identityToken: string,
    name?: string
  ) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Applies the result of Me-returning calls (like avatar changes) in place. */
  applyMe: (me: Me) => void;
  /**
   * Whether the last registration reported a code on its way. False after a
   * reload or a login: the code page then leads with "send" (mobile parity).
   */
  codeSent: boolean;
  /** The typed code; on success the session leaves the pending state. */
  verifyEmail: (code: string) => Promise<void>;
  resendCode: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [codeSent, setCodeSent] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    // The token this refresh is FOR: a logout, or a logout plus another
    // login, while it is in flight must win. A late answer for the old token
    // would otherwise paint the previous user over the new session, and a
    // late failure would clear the new session (same guard as mobile's
    // cold-start refresh, which compares the user id).
    const started = getToken();
    try {
      const fresh = await fetchMe();
      if (getToken() === started) setMe(fresh);
    } catch {
      if (getToken() === started) {
        setToken(null);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // An expired/revoked token anywhere in the app drops the user to the
  // login screen (mobile parity — see api.ts setSessionExpiredHandler).
  useEffect(() => {
    setSessionExpiredHandler(() => setMe(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  // A 403 "verify your e-mail" from anywhere: the account is pending and the
  // page did not know. Flip the flag so the code page replaces the app.
  useEffect(() => {
    setVerificationRequiredHandler(() =>
      setMe((current) =>
        current && !current.email_verification_pending
          ? { ...current, email_verification_pending: true }
          : current
      )
    );
    return () => setVerificationRequiredHandler(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token } = await apiLogin(email, password);
      setToken(token);
      setCodeSent(false);
      await refresh();
    },
    [refresh]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const { token, codeSent: sent } = await apiRegister(name, email, password);
      setToken(token);
      setCodeSent(!!sent);
      await refresh();
    },
    [refresh]
  );

  const loginWithProvider = useCallback(
    async (provider: SocialProvider, identityToken: string, name?: string) => {
      const { token } = await apiSocialLogin(provider, identityToken, name);
      setToken(token);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    setCodeSent(false);
  }, []);

  const verifyEmail = useCallback(
    async (code: string) => {
      await apiVerifyEmail(code);
      // /users/me carries stats and badges the auth response does not; the
      // app renders from Me, so reload it rather than patching one flag.
      await refresh();
    },
    [refresh]
  );

  const resendCode = useCallback(async () => {
    await apiResendCode();
    setCodeSent(true);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        me,
        loading,
        login,
        register,
        loginWithProvider,
        logout,
        refresh,
        applyMe: setMe,
        codeSent,
        verifyEmail,
        resendCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
