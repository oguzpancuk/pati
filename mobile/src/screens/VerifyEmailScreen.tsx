import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button, Input, Screen, Text } from '../components/ui';
import { Wordmark } from '../components/brand';
import { hitSlop, makeStyles, spacing } from '../theme';

const RESEND_COOLDOWN_S = 60;

/**
 * The code screen. Shown instead of the app while the session's e-mail is
 * unverified (ADR-0004): the six digits from the mail go in here, the account
 * opens, navigation swaps to the tabs. The same screen serves a fresh
 * registration ("we sent a code") and a later login ("ask for a code") —
 * `codeSent` from the auth context tells the two apart.
 *
 * iOS fills the field from a Mail notification when the input is marked as a
 * one-time code, which is why the code is also in the mail's subject line.
 */
export default function VerifyEmailScreen() {
  const styles = useStyles();
  const { user, codeSent, verifyEmail, resendCode, logout } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Mirrors the server's cooldown so the button says why it is disabled
  // rather than answering a tap with a 429.
  const [cooldown, setCooldown] = useState(codeSent ? RESEND_COOLDOWN_S : 0);
  const submitted = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function submit(value: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyEmail(value);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Bir hata oluştu');
      submitted.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError(null);
    // Six digits is the whole input; submitting on the last one saves a tap
    // (and matches how the iOS autofill hands the code over, all at once).
    if (digits.length === 6 && !submitted.current) {
      submitted.current = true;
      submit(digits);
    }
  }

  async function resend() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await resendCode();
      setCooldown(RESEND_COOLDOWN_S);
      setNotice('Yeni kod gönderildi.');
    } catch (err: any) {
      const retryAfter = err?.response?.data?.retryAfter;
      if (typeof retryAfter === 'number') setCooldown(retryAfter);
      setError(err?.response?.data?.error ?? 'Kod gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <Wordmark size="md" style={styles.brand} />

          <Text variant="heading" center style={styles.title}>
            E-postanı doğrula
          </Text>
          <Text variant="body" center style={styles.lead}>
            {codeSent ? (
              <>
                <Text variant="bodyStrong">{user?.email}</Text> adresine 6 haneli bir kod gönderdik.
                Kodu aşağıya gir.
              </>
            ) : (
              <>
                Devam etmek için <Text variant="bodyStrong">{user?.email}</Text> adresini doğrulaman
                gerekiyor. Yeni bir kod iste, sonra buraya gir.
              </>
            )}
          </Text>

          <Input
            label="doğrulama kodu"
            placeholder="······"
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            error={error}
            style={styles.codeInput}
            containerStyle={styles.lastField}
          />
          {notice ? (
            <Text variant="caption" color="onSuccess" center style={styles.notice}>
              {notice}
            </Text>
          ) : null}

          <Button
            title="Doğrula"
            onPress={() => submit(code)}
            loading={submitting}
            disabled={code.length !== 6}
            fullWidth
          />
          <Button
            title={cooldown > 0 ? `Kodu yeniden gönder (${cooldown})` : 'Kodu yeniden gönder'}
            variant="ghost"
            onPress={resend}
            loading={sending}
            disabled={cooldown > 0}
            fullWidth
            style={styles.resend}
          />

          <Pressable onPress={logout} hitSlop={hitSlop} style={styles.link}>
            <Text variant="bodyStrong" center>
              Yanlış adres mi?{' '}
              <Text variant="bodyStrong" color="brand">
                Çıkış yap
              </Text>
            </Text>
          </Pressable>

          <Text variant="caption" color="textSubtle" center style={styles.note}>
            Kod 15 dakika geçerli. Gelen kutunda yoksa spam klasörüne bak.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 34 },
  brand: { marginBottom: spacing.xl },
  title: { marginBottom: spacing.sm },
  lead: { marginBottom: spacing.xl, paddingHorizontal: spacing.xs },
  // Large, spaced digits; lineHeight set alongside fontSize so iOS does not
  // clip the glyphs (CLAUDE.md, Mobile UI).
  codeInput: { fontSize: 26, lineHeight: 32, letterSpacing: 8, textAlign: 'center' },
  lastField: { marginBottom: spacing.sm },
  notice: { marginBottom: spacing.sm },
  resend: { marginTop: spacing.sm },
  link: { marginTop: spacing.lg },
  note: { marginTop: spacing.xl, paddingHorizontal: spacing.sm, lineHeight: 19 },
}));
