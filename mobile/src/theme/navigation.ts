import { DarkTheme, DefaultTheme, Theme as NavTheme } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { Theme } from './ThemeContext';
import { fonts } from './typography';
import { spacing } from './layout';

/**
 * react-navigation's own theme. Without it, a flash of white ground shows
 * during screen transitions (the default theme is white), clashing with the
 * cream/dark background.
 */
export function navigationTheme({ name, colors }: Theme): NavTheme {
  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.brand,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

/** Stack headers: same color as the ground, no divider, brand-colored back arrow. */
export function screenOptions({ colors }: Theme): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTintColor: colors.brand,
    headerTitleStyle: {
      fontFamily: fonts.bold,
      fontSize: 18,
      color: colors.text,
    },
    headerBackTitleVisible: false,
    contentStyle: { backgroundColor: colors.background },
  };
}

/** The tab bar: card color, a single divider on top, brand orange for the active tab. */
export function tabBarOptions({ colors }: Theme): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textSubtle,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      // No height set: bottom-tabs adds the bottom safe area itself, and a
      // fixed height clips the labels on notched phones.
      paddingTop: spacing.sm,
    },
    tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
  };
}
