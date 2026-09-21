import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Icon } from '../brand';
import Text from '../ui/Text';
import { hitSlop, makeStyles, radius, spacing, useTheme } from '../../theme';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** The link on the right of the sheet header (e.g. "arkadaş bul"). */
  action?: React.ReactNode;
  /** iOS only, like RN's own: fires once the modal finished dismissing. */
  onDismiss?: () => void;
  /**
   * Give the card a definite height and the body `flex: 1`. A body that
   * scrolls itself (a FlatList, a map) needs a bounded parent; a short body
   * (the settings list) hugs its content instead.
   */
  fill?: boolean;
  /** Set false when the body brings its own scrolling. */
  scroll?: boolean;
  children: React.ReactNode;
};

/**
 * A sheet over the profile. Per DESIGN.md §8 point 3 a sheet is not a page:
 * the screen behind it stays, the backdrop and the close button are the way
 * out, and Android's hardware back (`onRequestClose`) closes the sheet
 * instead of leaving the screen.
 */
export default function Sheet({
  visible,
  onClose,
  title,
  action,
  onDismiss,
  fill = false,
  scroll = true,
  children,
}: SheetProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  const body = scroll ? (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.bodyContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.body, fill && styles.bodyFill]}>{children}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      {/* The sheet is bottom-anchored and RN's Modal does not move for the
          keyboard, so a text field in the body (the settings sheet's
          change-password form) would type from behind it. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          {/* The way out is a SIBLING behind the card, not a parent around it.
              It used to wrap the card, with a second no-op Pressable as the
              card itself to swallow taps — which put the body's ScrollView
              inside two Pressables, and there it never received the drag: the
              sheet did not scroll on any device. On a tall iPhone the content
              nearly fit and nobody noticed; in the short window App Review
              uses (an iPad running the iPhone app), "Hesabımı sil" sat below
              the fold and could not be reached — both findings of the
              2026-09-18 rejection. Not labelled: it is the backdrop, and the
              close button is what a screen reader should find. */}
          <Pressable style={styles.backdropPress} onPress={onClose} accessible={false} />
          <View style={[styles.card, fill && styles.cardFill]}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text variant="heading" numberOfLines={1} style={styles.title}>
                {title}
              </Text>
              {action}
              <Pressable
                onPress={onClose}
                hitSlop={hitSlop}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
              >
                <Icon name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {body}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  backdropPress: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  card: {
    maxHeight: '88%',
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    paddingTop: spacing.sm,
    // The sheet sits over the home indicator; without this the last row of a
    // filling list ends flush against it.
    paddingBottom: spacing.lg,
  },
  cardFill: { height: '88%' },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: c.border,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { flex: 1 },
  // flexShrink keeps the ScrollView bounded by the card's maxHeight. This
  // comment used to credit it with making the sheet scroll (2026-09-11); it
  // did not — RN's ScrollView already shrinks by default, and the sheet went
  // on not scrolling until 2026-09-21, when the real cause turned out to be
  // the two Pressables the body was nested in (see the backdrop above).
  body: { paddingHorizontal: spacing.lg, flexShrink: 1 },
  bodyContent: { paddingBottom: spacing.xxl },
  bodyFill: { flex: 1 },
}));
