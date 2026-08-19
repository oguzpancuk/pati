import React from 'react';
import { RefreshControl, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { makeStyles, spacing, useTheme } from '../../theme';

export type ScreenProps = {
  children: React.ReactNode;
  /** Whether the content scrolls (pass false on screens containing lists). */
  scroll?: boolean;
  /** Whether to leave a top safe area — unneeded on screens with a header. */
  edges?: ('top' | 'bottom')[];
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Theme background + safe area + optional scrolling/refresh. */
export default function Screen({
  children,
  scroll = false,
  edges = [],
  padded = true,
  refreshing,
  onRefresh,
  style,
  contentStyle,
}: ScreenProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const inner = padded ? [styles.padded, contentStyle] : contentStyle;

  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, inner]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={!!refreshing}
                onRefresh={onRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  safe: { flex: 1, backgroundColor: c.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xxl },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
}));
