import React, { useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { changePassword } from '../../api/auth';
import { Button, Input, Text } from '../ui';
import { makeStyles, spacing } from '../../theme';

/**
 * "Şifremi değiştir" as a self-contained block, so it can sit inside whatever
 * sheet the profile grows (it is mounted by the settings sheet, not by this
 * track). It renders a heading, its fields and its own button — no modal
 * chrome, no navigation.
 *
 * Two shapes, one form. An account that HAS a password types the current one:
 * an unlocked phone must not be enough to lock its owner out. An account
 * created through Apple/Google has none — asking it for a password nobody
 * ever chose would leave those users unable to set one at all — so for them
 * this is "şifre belirle" and the session they are already holding is the
 * proof.
 *
 * Mirrors the web client's ChangePasswordForm.
 */
export default function ChangePasswordForm({
  hasPassword,
  onChanged,
  style,
}: {
  /** `me.hasPassword`; false only for accounts that never had one. */
  hasPassword: boolean;
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

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await changePassword({
        password,
        ...(hasPassword ? { currentPassword: current } : {}),
      });
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

  return (
    <View style={style}>
      <Text variant="subheading" style={styles.title}>
        {hasPassword ? 'Şifreni değiştir' : 'Şifre belirle'}
      </Text>
      <Text variant="caption" color="textMuted" style={styles.lead}>
        {hasPassword
          ? 'Yeni şifren en az 8 karakter olmalı.'
          : 'Hesabın Apple/Google ile açılmış. Şifre belirlersen e-postanla da giriş yapabilirsin.'}
      </Text>

      {hasPassword ? (
        <Input
          label="mevcut şifren"
          placeholder="••••••••"
          secureTextEntry
          autoComplete="current-password"
          value={current}
          onChangeText={(value) => {
            setCurrent(value);
            setError(null);
            setDone(false);
          }}
          containerStyle={styles.field}
        />
      ) : null}
      <Input
        label="yeni şifre"
        placeholder="en az 8 karakter"
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setError(null);
          setDone(false);
        }}
        containerStyle={styles.field}
      />
      <Input
        label="yeni şifre (tekrar)"
        placeholder="••••••••"
        secureTextEntry
        autoComplete="new-password"
        value={repeat}
        onChangeText={(value) => {
          setRepeat(value);
          setError(null);
          setDone(false);
        }}
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

      <Button
        title={hasPassword ? 'Şifreyi değiştir' : 'Şifreyi belirle'}
        onPress={submit}
        loading={busy}
        disabled={!ready}
        fullWidth
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  title: { marginBottom: spacing.xs },
  lead: { marginBottom: spacing.lg, lineHeight: 18 },
  field: { marginBottom: spacing.md },
  message: { marginBottom: spacing.sm },
}));
