import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Text from './Text';
import Button from './Button';
import { palette, radius, spacing } from '../../theme';

export type EmptyStateProps = {
  /** Büyük emoji ya da ikon. */
  emoji?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Boş liste, hata ve "henüz yok" durumlarının ortak görünümü. */
export default function EmptyState({
  emoji,
  icon,
  title,
  description,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
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

/** Aynı boşlukta duran yükleniyor hâli — liste zıplamasın diye aynı hizada. */
export function LoadingState({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={palette.brand} />
      <Text variant="caption" center style={styles.desc}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: palette.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emoji: { fontSize: 36, lineHeight: 44 },
  desc: { marginTop: spacing.sm, maxWidth: 300 },
  action: { marginTop: spacing.xl, alignSelf: 'center' },
});
