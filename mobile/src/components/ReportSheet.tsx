import React, { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import { createReport } from '../api/reports';
import { REPORT_REASONS, ReportReason, ReportTargetType } from '../reportReasons';
import { Button, Chip, DialogBody, Text } from './ui';
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
}: {
  targetType: ReportTargetType;
  targetId: number;
  style?: object;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={hitSlop} style={style}>
        <Text variant="caption" color="textSubtle">
          şikayet et
        </Text>
      </Pressable>
      <ReportSheet
        visible={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
      />
    </>
  );
}

/**
 * The sheet itself, for a surface whose way in is not the text link — the
 * animal profile's header flag. It keeps its own form state and clears it on
 * every way out, so the next opening starts empty.
 */
export function ReportSheet({
  visible,
  onClose,
  targetType,
  targetId,
}: {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason(null);
    setDetails('');
    setError(null);
    setDone(false);
    onClose();
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
      {/* A sheet is not a page (DESIGN §8): hardware back closes it rather
          than leaving the screen. Unlike the backdrop it is NOT locked while
          a request is in flight — it is the OS's own way out and the last
          one left, since the backdrop and "Vazgeç" are both disabled then. */}
      <Modal
        visible={visible}
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
        {/* DialogBody: the multiline note has no return-to-dismiss, so without
            keyboard avoidance "Şikayeti gönder" and "Vazgeç" sat under the
            keyboard with no way back but the backdrop, which discards. */}
        <DialogBody onBackdropPress={() => !busy && reset()}>
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
        </DialogBody>
      </Modal>
    </>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
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
