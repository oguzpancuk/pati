import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Button from './Button';
import { spacing } from '../../theme';

type Props = {
  /** Count of records not yet loaded; at 0 the button doesn't render. */
  remaining: number;
  loading?: boolean;
  onPress: () => void;
  /** Defaults to "show more"; in chat it reads like "load earlier comments". */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The shared "load more" button for paginated lists. Profile screens are
 * ScrollViews, so we use an explicit button instead of infinite scroll: the
 * user sees where the page ends and how many remain. Full-list screens with
 * FlatList load by themselves via onEndReached.
 */
export default function LoadMoreButton({ remaining, loading, onPress, label, style }: Props) {
  if (remaining <= 0) return null;
  return (
    <Button
      title={`${label ?? 'Daha fazla göster'} (${remaining})`}
      variant="ghost"
      size="sm"
      loading={loading}
      onPress={onPress}
      fullWidth
      style={[{ marginTop: spacing.xs }, style]}
    />
  );
}
