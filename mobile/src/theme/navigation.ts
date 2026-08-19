import { DarkTheme, DefaultTheme, Theme as NavTheme } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { Theme } from './ThemeContext';
import { fonts, type } from './typography';
import { spacing } from './layout';

/**
 * react-navigation's own theme. Without it, a flash of white ground shows
 * during screen transitions (the default theme is white), clashing with the
 * app's background.
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

/**
 * Stack headers: the same white as the screen, no divider, an accent-colored
 * back arrow, and a medium-weight title — headings in this design are never
 * bold (docs/design/studio-aesthetic-handoff.md).
 */
export function screenOptions({ colors }: Theme): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: colors.background },
    headerShadowVisible: false,
    headerTintColor: colors.brand,
    headerTitleStyle: {
      fontFamily: fonts.medium,
      fontSize: 17,
      color: colors.text,
    },
    headerBackTitleVisible: false,
    contentStyle: { backgroundColor: colors.background },
  };
}

/**
 * The tab bar: white with a single hairline on top, lowercase widely spaced
 * labels, and the accent orange on the active tab.
 */
export function tabBarOptions({ colors }: Theme): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textSubtle,
    tabBarStyle: {
      backgroundColor: colors.background,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      // No height set: bottom-tabs adds the bottom safe area itself, and a
      // fixed height clips the labels on notched phones.
      paddingTop: spacing.sm,
    },
    tabBarLabelStyle: {
      fontFamily: type.tab.fontFamily,
      fontSize: type.tab.fontSize,
      letterSpacing: type.tab.letterSpacing,
      marginTop: 2,
    },
  };
}
