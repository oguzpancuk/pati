import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { makeStyles, radius, spacing } from '../../theme';

export type DialogBodyProps = {
  /** A tap outside the card. Callers gate it themselves (e.g. while busy). */
  onBackdropPress: () => void;
  children: React.ReactNode;
};

/**
 * The inside of a centred dialog `Modal`: overlay, card, and the three things
 * every hand-rolled copy of this got wrong before App Review found them
 * (rejection of 1.0 (2), 2026-09-18, reviewed in a 375×667 window):
 *
 * 1. **The keyboard.** A centred card with a text field and no avoidance ends
 *    up with its buttons under the keyboard — in a short window, all of them.
 *    The KeyboardAvoidingView re-centres the card in what is left.
 * 2. **Still too short.** When even that is smaller than the content, the
 *    card shrinks and its body scrolls, so the last button stays reachable.
 * 3. **No Pressable above the ScrollView.** The backdrop is a SIBLING behind
 *    the card. The old shape — backdrop Pressable around a no-op card
 *    Pressable — puts the scroller under a JS responder, and on iOS (old
 *    architecture) RCTScrollView switches its pan off while an ancestor holds
 *    the responder. `__tests__/sheetScrolls.test.tsx` holds this shape.
 *
 * The padding lives on an inner View, not on the KeyboardAvoidingView: its
 * `padding` behaviour writes `paddingBottom`, which would override a
 * `padding` shorthand on the same element and glue the card to the keyboard.
 *
 * The caller keeps the `<Modal>` itself — `visible`, `onRequestClose` and the
 * reasoning about hardware back differ per dialog.
 */
export default function DialogBody({ onBackdropPress, children }: DialogBodyProps) {
  const styles = useStyles();
  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.center}>
        {/* Not labelled: it is the backdrop; each dialog's "Vazgeç"/"Tamam"
            is what a screen reader should find. */}
        <Pressable style={styles.backdropPress} onPress={onBackdropPress} accessible={false} />
        <View style={styles.card}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  overlay: { flex: 1, backgroundColor: c.overlay },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  backdropPress: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // flexShrink lets the card give way to the keyboard; the ScrollView inside
  // takes over from there. No `overflow: hidden` — it would clip the shadow.
  card: {
    width: '100%',
    maxWidth: 380,
    flexShrink: 1,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    ...shadow.modal,
  },
  content: { padding: spacing.xl },
}));
