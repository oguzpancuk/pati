/**
 * Apple and Google sign-in for the app.
 *
 * Both SDKs end in the same place: a signed identity token that goes to
 * POST /auth/{apple,google}, where the server verifies it. Nothing decided
 * here is trusted by the backend — this module only fetches the token and
 * translates each SDK's idea of "the user backed out" into a plain null, so
 * screens can tell a cancellation from a real failure.
 *
 * The Google client ids come from the server (GET /auth/providers) rather
 * than a build-time constant: they differ per environment and are public
 * values, so a rebuild to change them would be pure friction.
 */
import { Platform } from 'react-native';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { AuthProviders } from './api/auth';

/** Sign in with Apple exists on iOS 13+; Android never has it. */
export const appleSupported = Platform.OS === 'ios' && appleAuth.isSupported;

let googleConfigured = false;

/**
 * Must run before any Google call. Safe to call repeatedly — configure() is
 * cheap and idempotent, but the flag keeps it to once per client-id set.
 */
export function configureGoogle(providers: AuthProviders): boolean {
  const { enabled, iosClientId, webClientId } = providers.google;
  if (!enabled) return false;
  // iOS needs its own client id; the web client id is what makes the returned
  // token's audience match what the backend is configured to accept on
  // Android, so both are passed when present.
  if (!googleConfigured) {
    GoogleSignin.configure({
      iosClientId: iosClientId ?? undefined,
      webClientId: webClientId ?? undefined,
      scopes: ['email', 'profile'],
    });
    googleConfigured = true;
  }
  return true;
}

export interface SocialIdentity {
  identityToken: string;
  /** Only Apple's first authorization carries a name; Google's token has one. */
  name?: string;
}

/** Resolves to null when the user dismissed Google's sheet. */
export async function signInWithGoogle(): Promise<SocialIdentity | null> {
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return null;
    const { idToken, user } = response.data;
    if (!idToken) throw new Error('Google kimlik anahtarı alınamadı');
    return { identityToken: idToken, name: user.name ?? undefined };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw err;
  }
}

/** Resolves to null when the user dismissed Apple's sheet. */
export async function signInWithApple(): Promise<SocialIdentity | null> {
  const response = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
  });
  if (!response.identityToken) return null;
  const { givenName, familyName } = response.fullName ?? {};
  const name = [givenName, familyName].filter(Boolean).join(' ').trim();
  return { identityToken: response.identityToken, name: name || undefined };
}

/**
 * Apple reports a user-cancelled sheet as a thrown error rather than a
 * result, so screens ask this instead of matching on messages.
 */
export function isAppleCancellation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === appleAuth.Error.CANCELED || code === '1001';
}

/**
 * Google keeps the last account signed in at the OS level. After deleting the
 * pati account, that stale session would silently re-create it on the next
 * tap, so the app forgets it too.
 */
export async function forgetGoogleSession(): Promise<void> {
  if (!googleConfigured) return;
  await GoogleSignin.signOut().catch(() => undefined);
}
