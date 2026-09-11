import React, { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { createReport } from '../api/reports';
import { REPORT_REASONS, ReportReason, ReportTargetType } from '../reportReasons';
import { Button, Chip, Text } from './ui';
import { fonts, hitSlop, makeStyles, radius, spacing, useTheme } from '../theme';

/**
 * The report flow, shared by every reportable surface: a faint "şikayet et"
 * text link opening a modal with reason chips + an optional note. The link is
 * deliberately quiet — reporting must exist everywhere but sell nothing.
 * Mirrors the web client's ReportDialog.
 */
export default function ReportLink({
  targetType,
  targetId,
  style,
  initialOpen = false,
}: {
  targetType: ReportTargetType;
  targetId: number;
  style?: object;
  /** Dev/QA: open the sheet on mount (deep link `?report=1`); never set in product flows. */
  initialOpen?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(initialOpen);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setReason(null);
    setDetails('');
    setError(null);
    setDone(false);
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await createReport(targetType, targetId, reason, details.trim() || undefined);
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Gönderilemedi, tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={hitSlop} style={style}>
        <Text variant="caption" color="textSubtle">
          şikayet et
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
            {done ? (
              <>
                <Text variant="body" center style={styles.doneText}>
                  Şikayetin alındı; en kısa sürede incelenecek. Teşekkürler.
                </Text>
                <Button title="Tamam" onPress={reset} fullWidth />
              </>
            ) : (
              <>
                <Text variant="micro" center>
                  şikayet
                </Text>
                <Text variant="heading" center style={styles.title}>
                  Sorun ne?
                </Text>
                <Text variant="caption" center style={styles.sub}>
                  Şikayetin yalnızca moderasyon ekibine gider.
                </Text>

                <View style={styles.chips}>
                  {REPORT_REASONS.map((r) => (
                    <Chip
                      key={r.key}
                      label={r.label}
                      selected={reason === r.key}
                      onPress={() => setReason(r.key)}
                    />
                  ))}
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Açıklama (isteğe bağlı)"
                  placeholderTextColor={colors.textSubtle}
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  maxLength={1000}
                />

                {error && (
                  <Text variant="caption" color="danger" center style={styles.error}>
                    {error}
                  </Text>
                )}

                <Button
                  title="Şikayeti gönder"
                  onPress={submit}
                  loading={busy}
                  disabled={!reason}
                  fullWidth
                />
                <Button title="Vazgeç" variant="ghost" onPress={reset} disabled={busy} fullWidth />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
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
  title: { marginTop: 2 },
  sub: { marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  input: {
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.input,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 14.5,
    lineHeight: 20,
    color: c.text,
  },
  error: { marginBottom: spacing.sm },
  doneText: { marginVertical: spacing.lg },
}));
