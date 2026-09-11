import React from 'react';
import { Pressable, View } from 'react-native';
import Text from '../ui/Text';
import { makeStyles, radius, spacing } from '../../theme';

export type HeaderIconButtonProps = {
  /** Screen-reader label; the button itself carries only the glyph. */
  label: string;
  onPress: () => void;
  /** Drawn as a count badge when greater than zero (bell unread, requests). */
  count?: number;
  children: React.ReactNode;
};

/**
 * One of the round controls in the profile header's top-right row. The count
 * badge is the bell's old number, reused so the bell and the friends button
 * read as one family.
 */
export default function HeaderIconButton({
  label,
  onPress,
  count = 0,
  children,
}: HeaderIconButtonProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label} (${count})` : label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {children}
      {count > 0 && (
        <View style={styles.count}>
          <Text variant="micro" style={styles.countText}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: c.brandTint },
  count: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brand,
    borderWidth: 1,
    borderColor: c.surface,
  },
  // micro's letter spacing adds trailing space after a lone digit and shoves
  // it off-centre; zeroed so the count sits in the middle.
  countText: { color: c.textOnBrand, lineHeight: 12, letterSpacing: 0 },
}));
