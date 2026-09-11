import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable } from 'react-native';
import { forgotPassword, resetPassword } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { Button, Input, Text } from '../ui';
import { hitSlop, makeStyles, radius, spacing } from '../../theme';

/** Mirrors utils/passwordReset.js RESEND_COOLDOWN_S. */
const RESEND_COOLDOWN_S = 60;

type Step = 'email' | 'code';

/**
 * "Şifremi unuttum" — a sheet on the login screen, not a route: the code is
 * six digits typed in the app (never a link), so nothing has to be
 * deep-linkable and the user never leaves the screen they were on
 * (docs/DESIGN.md §8 — a sheet is not a page; Android's back closes it
 * through onRequestClose).
 *
 * Two steps in one sheet: the address, then the code plus the new password.
 * The server answers the first step identically whether or not the address
 * has an account, so the sheet cannot say "no such user" either — it moves on
 * to the code step regardless, which is the honest UI for a flow built not to
 * disclose who has an account.
 *
 * Mirrors the web client's ForgotPasswordDialog.
 */
export default function ForgotPasswordSheet({
  visible,
  onClose,
  initialEmail = '',
}: {
  visible: boolean;
  onClose: () => void;
  /** Whatever the login form already has typed, so it is not typed twice. */
  initialEmail?: string;
}) {
  const styles = useStyles();
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Mirrors the server's per-account cooldown so the button says why it is
  // disabled. The server cannot tell us — a visible cooldown would answer
  // "yes, that address has an account".
  const [cooldown, setCooldown] = useState(0);

  // Opening the sheet starts from the login form's address, not from whatever
  // the previous attempt left behind.
  useEffect(() => {
    if (!visible) return;
    setStep('email');
    setEmail(initialEmail);
    setCode('');
    setPassword('');
    setError(null);
    setNotice(null);
    setCooldown(0);
    // initialEmail is read once per opening on purpose: retyping the address
    // inside the sheet must not be overwritten by the field behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function message(err: any, fallback: string): string {
    return err?.response?.data?.error ?? fallback;
  }

  async function sendCode() {
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await forgotPassword(address);
      setStep('code');
      setCooldown(RESEND_COOLDOWN_S);
      setNotice(`${address} adresine bir kod gönderdik.`);
    } catch (err: any) {
      // 503 (this deployment sends no mail) and 429 (the IP limiter) are the
      // only refusals; neither depends on the address. A 429 parks the button
      // for as long as the server said, the way the verification screens do —
      // otherwise every impatient tap burns another slot of the /api/auth
      // brake and shows the same message.
      if (err?.response?.status === 429) {
        const retryAfter = err?.response?.data?.retryAfter;
        setCooldown(typeof retryAfter === 'number' ? retryAfter : RESEND_COOLDOWN_S);
      }
      setError(message(err, 'Kod gönderilemedi, biraz sonra tekrar dene.'));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const address = email.trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resetPassword(address, code, password);
    } catch (err: any) {
      setError(message(err, 'Şifre değiştirilemedi.'));
      setBusy(false);
      return;
    }
    // The password is already changed server-side. A failure from here on is
    // only about signing in, so it must never read as "the reset failed" —
    // the user can close the sheet and use the form behind it.
    try {
      await login(address, password);
      onClose();
    } catch {
      setNotice('Şifren değişti. Yeni şifrenle giriş yapabilirsin.');
      setStep('email');
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={() => !busy && onClose()}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text variant="micro" center>
              şifremi unuttum
            </Text>
            <Text variant="heading" center style={styles.title}>
              {step === 'email' ? 'Yeni şifre al' : 'Kodu gir'}
            </Text>

            {step === 'email' ? (
              <>
                <Text variant="body" style={styles.lead}>
                  E-posta adresini yaz; hesabın varsa 6 haneli bir kod gönderelim.
                </Text>
                <Input
                  label="e-posta"
                  placeholder="ornek@eposta.com"
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setError(null);
                  }}
                  containerStyle={styles.field}
                />
                {notice ? (
                  <Text variant="caption" color="onSuccess" center style={styles.notice}>
                    {notice}
                  </Text>
                ) : null}
                {error ? (
                  <Text variant="caption" color="danger" center style={styles.notice}>
                    {error}
                  </Text>
                ) : null}
                <Button
                  title={cooldown > 0 ? `Kod gönder (${cooldown})` : 'Kod gönder'}
                  onPress={sendCode}
                  loading={busy}
                  disabled={!email.trim() || cooldown > 0}
                  fullWidth
                />
              </>
            ) : (
              <>
                <Text variant="body" style={styles.lead}>
                  {notice ?? `${email.trim()} adresine gönderdiğimiz kodu ve yeni şifreni gir.`}
                </Text>
                <Input
                  label="kod"
                  placeholder="······"
                  value={code}
                  onChangeText={(raw) => {
                    setCode(raw.replace(/\D/g, '').slice(0, 6));
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  style={styles.codeInput}
                  containerStyle={styles.field}
                />
                <Input
                  label="yeni şifre"
                  placeholder="en az 8 karakter"
                  secureTextEntry
                  autoComplete="new-password"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    setError(null);
                  }}
                  containerStyle={styles.field}
                />
                {error ? (
                  <Text variant="caption" color="danger" center style={styles.notice}>
                    {error}
                  </Text>
                ) : null}
                <Button
                  title="Şifreyi değiştir"
                  onPress={submit}
                  loading={busy}
                  disabled={code.length !== 6 || password.length < 8}
                  fullWidth
                />
                <Button
                  title={cooldown > 0 ? `Kodu yeniden gönder (${cooldown})` : 'Kodu yeniden gönder'}
                  variant="ghost"
                  onPress={sendCode}
                  disabled={busy || cooldown > 0}
                  fullWidth
                  style={styles.resend}
                />
              </>
            )}

            <Pressable onPress={onClose} hitSlop={hitSlop} style={styles.cancel} disabled={busy}>
              <Text variant="bodyStrong" center color="textMuted">
                Vazgeç
              </Text>
            </Pressable>

            <Text variant="caption" color="textSubtle" center style={styles.note}>
              Kod 15 dakika geçerli. Gelen kutunda yoksa spam klasörüne bak.
            </Text>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  flex: { flex: 1 },
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
  lead: { marginBottom: spacing.lg, lineHeight: 21 },
  field: { marginBottom: spacing.md },
  // Large, spaced digits; lineHeight set alongside fontSize so iOS does not
  // clip the glyphs (CLAUDE.md, Mobile UI).
  codeInput: { fontSize: 26, lineHeight: 32, letterSpacing: 8, textAlign: 'center' },
  notice: { marginBottom: spacing.md },
  resend: { marginTop: spacing.xs },
  cancel: { marginTop: spacing.md },
  note: { marginTop: spacing.md, lineHeight: 19 },
}));
