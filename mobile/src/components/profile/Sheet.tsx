import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
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
      {/* Not labelled: it wraps the whole card, and a label here would
          make a screen reader announce the sheet itself as one button. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows the press so a tap inside the card doesn't close it. */}
        <Pressable style={[styles.card, fill && styles.cardFill]} onPress={() => {}}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  card: {
    maxHeight: '88%',
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    paddingTop: spacing.sm,
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
  body: { paddingHorizontal: spacing.lg },
  bodyContent: { paddingBottom: spacing.xxl },
  bodyFill: { flex: 1 },
}));
