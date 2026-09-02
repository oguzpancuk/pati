import { apiClient } from './client';

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  user: User;
  token: string;
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
