import React from 'react';
import { ActivityIndicator, StyleProp, View, ViewStyle } from 'react-native';
import Text from './Text';
import Button from './Button';
import { makeStyles, radius, spacing, useTheme } from '../../theme';

export type EmptyStateProps = {
  /** A large emoji or icon. */
  emoji?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The shared look of empty lists, errors and "nothing yet" states. */
export default function EmptyState({
  emoji,
  icon,
  title,
  description,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={[styles.wrap, style]}>
      {icon ? (
        <View style={styles.iconWrap}>{icon}</View>
      ) : emoji ? (
        <View style={styles.iconWrap}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      ) : null}
      <Text variant="heading" center>
        {title}
      </Text>
      {description ? (
        <Text variant="caption" center style={styles.desc}>
          {description}
        </Text>
      ) : null}
      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

/** The loading state occupying the same space — aligned so the list doesn't jump. */
export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text variant="caption" center style={styles.desc}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emoji: { fontSize: 36, lineHeight: 44 },
  desc: { marginTop: spacing.sm, maxWidth: 300 },
  action: { marginTop: spacing.xl, alignSelf: 'center' },
}));
