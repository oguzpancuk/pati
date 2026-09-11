/**
 * The password endpoints. Same contract as mobile/src/api/auth.ts's three
 * password functions; the types are repeated here like the rest of web's
 * client, which does not import the mobile axios layer.
 */
import { api, AuthResponse, SocialProvider } from '../api';

/**
 * POST /auth/forgot-password — the server answers the same thing whether or
 * not the address has an account (it must not disclose that), so there is
 * nothing here to branch on: the dialog asks for the code either way.
 */
export async function forgotPassword(email: string): Promise<void> {
  await api.post<{ ok: boolean; message: string }>('/auth/forgot-password', { email });
}

/**
 * POST /auth/reset-password — the mailed code plus the new password. The
 * server returns a session; the page signs in with the new password instead,
 * so the one place that writes the token stays the auth context.
 */
export function resetPassword(
  email: string,
  code: string,
  password: string
): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/reset-password', { email, code, password });
}

/**
 * What POST /auth/change-password takes besides the new password. Every caller
 * re-authenticates: an account that has a password sends the current one, and
 * an account created through Apple/Google (`hasPassword: false` on Me) signs
 * in with its provider once more and sends that fresh token — the same proof
 * account deletion asks for. A bearer token on its own is not accepted for
 * either.
 */
export type ChangePasswordProof =
  { currentPassword: string } | { provider: SocialProvider; identityToken: string };

/** POST /auth/change-password. */
export function changePassword(
  input: ChangePasswordProof & { password: string }
): Promise<{ hasPassword: boolean }> {
  return api.post<{ hasPassword: boolean }>('/auth/change-password', input);
}
