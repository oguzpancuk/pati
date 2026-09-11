import React, { useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { changePassword, ChangePasswordProof, SocialProvider } from '../../api/auth';
import {
  isAppleCancellation,
  signInWithApple,
  signInWithGoogle,
  SocialAuthError,
} from '../../socialAuth';
import { Button, Input, Text } from '../ui';
import { makeStyles, spacing } from '../../theme';

/**
 * "Şifremi değiştir" as a self-contained block, so it can sit inside whatever
 * sheet the profile grows (it is mounted by the settings sheet, not by this
 * track). It renders a heading, its fields and its own button — no modal
 * chrome, no navigation.
 *
 * Two shapes, one form, and BOTH re-authenticate — the rule account deletion
 * already enforces. An account that HAS a password types the current one: an
 * unlocked phone must not be enough to lock its owner out. An account created
 * through Apple/Google has none — asking it for a password nobody ever chose
 * would leave those users unable to set one at all — so for them this is
 * "şifre belirle" and they sign in with the provider once more; that fresh
 * token is the proof. The session alone is not, which is why the button says
 * "doğrula ve belirle" rather than just "belirle" (review finding).
 *
 * Mirrors the web client's ChangePasswordForm.
 */
export default function ChangePasswordForm({
  hasPassword,
  authProviders = [],
  onChanged,
  style,
}: {
  /** `me.hasPassword`; false only for accounts that never had one. */
  hasPassword: boolean;
  /** `me.authProviders` — which providers can prove a password-less account. */
  authProviders?: SocialProvider[];
  /** Fired after a successful change — the parent reloads `me` so this flips. */
  onChanged?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ready = password.length >= 8 && repeat === password && (!hasPassword || current.length > 0);

  function touched(setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      setError(null);
      setDone(false);
    };
  }

  async function save(proof: ChangePasswordProof) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await changePassword({ password, ...proof });
      setCurrent('');
      setPassword('');
      setRepeat('');
      setDone(true);
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Şifre değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!ready) return;
    await save({ currentPassword: current });
  }

  async function submitWithProvider(provider: SocialProvider) {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const identity = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      // Closing the provider sheet is a decision, not a failure.
      if (!identity) return setBusy(false);
      await save({ provider, identityToken: identity.identityToken });
    } catch (err: any) {
      // Only two message sources are safe to show: the API's own Turkish
      // error and socialAuth's. Everything else here is an SDK string in
      // English, and product-facing text stays Turkish.
      if (!isAppleCancellation(err)) {
        setError(
          err?.response?.data?.error ??
            (err instanceof SocialAuthError ? err.message : null) ??
            'Doğrulama başarısız, tekrar dene.'
        );
      }
      setBusy(false);
    }
  }

  return (
    <View style={style}>
      <Text variant="subheading" style={styles.title}>
        {hasPassword ? 'Şifreni değiştir' : 'Şifre belirle'}
      </Text>
      <Text variant="caption" color="textMuted" style={styles.lead}>
        {hasPassword
          ? 'Yeni şifren en az 8 karakter olmalı.'
          : `Hesabın ${providerLabel(
              authProviders
            )} ile açılmış. Şifre belirlersen e-postanla da giriş yapabilirsin; güvenlik için önce ${providerLabel(
              authProviders
            )} ile kimliğini doğrulaman gerekiyor.`}
      </Text>

      {hasPassword ? (
        <Input
          label="mevcut şifren"
          placeholder="••••••••"
          secureTextEntry
          autoComplete="current-password"
          value={current}
          onChangeText={touched(setCurrent)}
          containerStyle={styles.field}
        />
      ) : null}
      <Input
        label="yeni şifre"
        placeholder="en az 8 karakter"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={touched(setPassword)}
        containerStyle={styles.field}
      />
      <Input
        label="yeni şifre (tekrar)"
        placeholder="••••••••"
        secureTextEntry
        autoComplete="new-password"
        value={repeat}
        onChangeText={touched(setRepeat)}
        // Checked here rather than on the server: the server sees one
        // password, and a typo in a field nobody can read back is exactly
        // what locks people out.
        error={repeat.length > 0 && repeat !== password ? 'Şifreler aynı değil' : null}
        containerStyle={styles.field}
      />

      {error ? (
        <Text variant="caption" color="danger" style={styles.message}>
          {error}
        </Text>
      ) : null}
      {done ? (
        <Text variant="caption" color="onSuccess" style={styles.message}>
          Şifren güncellendi.
        </Text>
      ) : null}

      {hasPassword ? (
        <Button
          title="Şifreyi değiştir"
          onPress={submit}
          loading={busy}
          disabled={!ready}
          fullWidth
        />
      ) : (
        authProviders.map((provider) => (
          <Button
            key={provider}
            title={`${providerLabel([provider])} ile doğrula ve belirle`}
            onPress={() => submitWithProvider(provider)}
            loading={busy}
            disabled={!ready}
            fullWidth
            style={styles.providerButton}
          />
        ))
      )}
    </View>
  );
}

/** "Apple", "Google" or "Apple ve Google" — for the lead and the buttons. */
function providerLabel(providers: SocialProvider[]): string {
  const names = providers.map((p) => (p === 'apple' ? 'Apple' : 'Google'));
  return names.length > 1 ? names.join(' ve ') : names[0] || 'sağlayıcın';
}

const useStyles = makeStyles(() => ({
  title: { marginBottom: spacing.xs },
  lead: { marginBottom: spacing.lg, lineHeight: 18 },
  field: { marginBottom: spacing.md },
  message: { marginBottom: spacing.sm },
  providerButton: { marginBottom: spacing.sm },
}));
