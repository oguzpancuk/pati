import React, { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { deleteMyAccount } from '../api/users';
import { useAuth } from '../context/AuthContext';
import { Button, Text } from './ui';
import { fonts, hitSlop, makeStyles, radius, spacing, useTheme } from '../theme';

/**
 * Self-service account deletion (the KVKK promise on /gizlilik + App Store
 * 5.1.1(v), which requires it in-app). A faint link opens a modal that spells
 * out what is deleted and what stays anonymized, then re-authenticates with
 * the password — an unlocked phone must not be enough to destroy an account.
 * Mirrors the web client's DeleteAccountDialog.
 */
export default function DeleteAccountLink() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setPassword('');
    setError(null);
  }

  async function submit() {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(password);
      // The session is dead server-side; drop it locally too.
      await logout();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Silinemedi, tekrar dene.');
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={hitSlop} style={styles.link}>
        <Text variant="caption" color="textSubtle" center>
          hesabı sil
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={reset}>
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

            <TextInput
              style={styles.input}
              placeholder="Şifren"
              placeholderTextColor={colors.textSubtle}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoComplete="current-password"
            />

            {error && (
              <Text variant="caption" color="danger" center style={styles.error}>
                {error}
              </Text>
            )}

            <Button
              title="Hesabımı kalıcı olarak sil"
              variant="danger"
              onPress={submit}
              loading={busy}
              disabled={!password}
              fullWidth
            />
            <Button title="Vazgeç" variant="ghost" onPress={reset} disabled={busy} fullWidth />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
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
