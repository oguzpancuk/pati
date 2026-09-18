import React, { useState } from 'react';
import { Modal, Pressable, TextInput } from 'react-native';
import type { SocialProvider } from '../api/auth';
import { deleteMyAccount } from '../api/users';
import { useAuth } from '../context/AuthContext';
import {
  forgetGoogleSession,
  isAppleCancellation,
  signInWithApple,
  signInWithGoogle,
  SocialAuthError,
} from '../socialAuth';
import { Button, Text } from './ui';
import { fonts, hitSlop, makeStyles, radius, spacing, useTheme } from '../theme';

/**
 * Self-service account deletion (the KVKK promise on /gizlilik + App Store
 * 5.1.1(v), which requires it in-app). A faint link opens a modal that spells
 * out what is deleted and what stays anonymized, then re-authenticates — an
 * unlocked phone must not be enough to destroy an account. Password accounts
 * type their password; Apple/Google accounts have none, so they sign in with
 * the provider once more and that token is the proof. Mirrors the web
 * client's DeleteAccountDialog.
 */
export default function DeleteAccountLink({
  initialOpen = false,
  hasPassword = true,
  authProviders = [],
}: {
  initialOpen?: boolean;
  hasPassword?: boolean;
  authProviders?: SocialProvider[];
} = {}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { logout } = useAuth();
  // initialOpen: dev/QA only (deep link `pati://profile?deleteAccount=1`).
  const [open, setOpen] = useState(initialOpen);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setPassword('');
    setError(null);
  }

  async function remove(proof: Parameters<typeof deleteMyAccount>[0]) {
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(proof);
      // Google keeps its own signed-in account at the OS level; leaving it
      // behind would silently re-create the pati account on the next tap.
      if ('provider' in proof && proof.provider === 'google') await forgetGoogleSession();
      // The session is dead server-side; drop it locally too.
      await logout();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Silinemedi, tekrar dene.');
      setBusy(false);
    }
  }

  async function submit() {
    if (!password) return;
    await remove({ password });
  }

  async function confirmWithProvider(provider: SocialProvider) {
    setBusy(true);
    setError(null);
    try {
      const identity = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      // Closing the provider sheet is a decision, not a failure.
      if (!identity) return setBusy(false);
      await remove({ provider, identityToken: identity.identityToken });
    } catch (err: any) {
      // Only two message sources are safe to show: the API's own Turkish
      // error and socialAuth's. Everything else here is an SDK or axios
      // string in English ("Network Error", "DEVELOPER_ERROR"), and
      // product-facing text stays Turkish.
      if (!isAppleCancellation(err)) {
        const message =
          err?.response?.data?.error ??
          (err instanceof SocialAuthError ? err.message : null) ??
          'Doğrulama başarısız, tekrar dene.';
        setError(message);
      }
      setBusy(false);
    }
  }

  return (
    <>
      {/* Named and coloured as what it is. It used to be a faint grey
          "hesabı sil" on the sheet's last line, and App Review (2026-09-18,
          guideline 5.1.1(v)) reported the app has no account deletion at
          all — a control nobody can find is a control that is not there. */}
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={hitSlop}
        style={styles.link}
        accessibilityRole="button"
        accessibilityLabel="Hesabımı sil"
      >
        <Text variant="captionStrong" color="danger" center>
          Hesabımı sil
        </Text>
      </Pressable>

      {/* A sheet is not a page (DESIGN §8): hardware back closes it rather
          than leaving the screen. Unlike the backdrop it is NOT locked while
          a request is in flight — it is the OS's own way out and the last
          one left, since the backdrop and "Vazgeç" are both disabled then. */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        // Unlike the backdrop, hardware back does NOT wait for `busy`: the
        // backdrop and "Vazgeç" are both disabled while the request is in
        // flight, so gating this one too would leave an Android user with no
        // way out of the sheet at all if the request hung. Closing does not
        // cancel the request — it resolves into a dismissed sheet, which is
        // the same thing that happens when the screen is backgrounded.
        onRequestClose={reset}
      >
        <Pressable style={styles.backdrop} onPress={() => !busy && reset()}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text variant="micro" center>
              hesabı sil
            </Text>
            <Text variant="heading" center style={styles.title}>
              Emin misin?
            </Text>
            <Text variant="body" style={styles.warning}>
              Adın, e-postan ve avatarın kalıcı olarak silinir; bu geri alınamaz. Eklediğin hayvan
              kayıtları ve yorumlar sokaktaki hayvanların takibi için "Silinmiş Üye" adıyla, sana
              bağlanamayacak şekilde kalır.
            </Text>

            {hasPassword ? (
              <TextInput
                style={styles.input}
                placeholder="Şifren"
                placeholderTextColor={colors.textSubtle}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                autoComplete="current-password"
              />
            ) : (
              <Text variant="body" style={styles.warning}>
                Hesabın {providerLabel(authProviders)} ile açılmış, şifresi yok. Silmeden önce{' '}
                {providerLabel(authProviders)} ile kimliğini doğrula.
              </Text>
            )}

            {error && (
              <Text variant="caption" color="danger" center style={styles.error}>
                {error}
              </Text>
            )}

            {hasPassword ? (
              <Button
                title="Hesabımı kalıcı olarak sil"
                variant="danger"
                onPress={submit}
                loading={busy}
                disabled={!password}
                fullWidth
              />
            ) : (
              authProviders.map((provider) => (
                <Button
                  key={provider}
                  title={`${providerLabel([provider])} ile doğrula ve sil`}
                  variant="danger"
                  onPress={() => confirmWithProvider(provider)}
                  loading={busy}
                  fullWidth
                />
              ))
            )}
            <Button title="Vazgeç" variant="ghost" onPress={reset} disabled={busy} fullWidth />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** "Apple", "Google" or "Apple ve Google" — for the modal's explanation. */
function providerLabel(providers: SocialProvider[]): string {
  const names = providers.map((p) => (p === 'apple' ? 'Apple' : 'Google'));
  return names.length > 1 ? names.join(' ve ') : names[0] || 'sağlayıcın';
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  link: { marginTop: spacing.sm, alignSelf: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
    ...shadow.modal,
  },
  title: { marginTop: 2, marginBottom: spacing.sm },
  warning: { marginBottom: spacing.lg, lineHeight: 21 },
  input: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.input,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    fontFamily: fonts.semibold,
    fontSize: 15.5,
    lineHeight: 21,
    color: c.text,
  },
  error: { marginBottom: spacing.sm },
}));
