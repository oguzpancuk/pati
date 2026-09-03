import { apiClient } from './client';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  /**
   * True from e-mail registration until the mailed code is typed. While set
   * the server answers 403 to everything but verification, so the app shows
   * the code screen and nothing else. Optional: sessions stored before this
   * field existed have no value, which reads as "not pending".
   */
  email_verification_pending?: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  /** Registration and login say so when the code screen is the next step. */
  verificationRequired?: boolean;
  /** Registration only: whether the code mail actually went out. */
  codeSent?: boolean;
}

/** POST /auth/verify-email — the typed code proves the address. */
export async function verifyEmail(code: string): Promise<{ user: User }> {
  const { data } = await apiClient.post<{ user: User }>('/auth/verify-email', { code });
  return data;
}

/** POST /auth/verify-email/resend — a fresh code, subject to a cooldown. */
export async function resendVerificationCode(): Promise<{ codeSent: boolean; email: string }> {
  const { data } = await apiClient.post<{ codeSent: boolean; email: string }>(
    '/auth/verify-email/resend'
  );
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', {
    email,
    password,
  });
  return data;
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', {
    name,
    email,
    password,
  });
  return data;
}

export type SocialProvider = 'apple' | 'google';

export interface AuthProviders {
  apple: { enabled: boolean; serviceId: string | null; redirectUri: string | null };
  google: { enabled: boolean; webClientId: string | null; iosClientId: string | null };
}

/**
 * Which sign-in providers this backend has credentials for. The buttons are
 * drawn from this answer, so an environment without Apple/Google configured
 * shows the plain e-mail form instead of buttons that could only fail.
 */
export async function fetchAuthProviders(): Promise<AuthProviders> {
  const { data } = await apiClient.get<AuthProviders>('/auth/providers');
  return data;
}

/**
 * Trades a provider's identity token for a pati session. `name` carries
 * Apple's first-authorization name — the only time Apple ever tells us.
 */
export async function socialLogin(
  provider: SocialProvider,
  identityToken: string,
  name?: string
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(`/auth/${provider}`, {
    identityToken,
    ...(name ? { name } : {}),
  });
  return data;
}
