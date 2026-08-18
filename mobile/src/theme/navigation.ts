import { DarkTheme, DefaultTheme, Theme as NavTheme } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { Theme } from './ThemeContext';
import { fonts } from './typography';
import { spacing } from './layout';

/**
 * react-navigation'ın kendi teması. Bunu vermezsek ekran geçişlerinde bir an
 * beyaz zemin görünüyor (varsayılan tema beyaz), krem/koyu arka planla
 * çarpışıyor.
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

/** Stack başlıkları: zeminle aynı renk, ayraç yok, marka rengi geri oku. */
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

/** Sekme çubuğu: kart rengi, üstte tek ayraç, seçili sekme marka turuncusu. */
export function tabBarOptions({ colors }: Theme): BottomTabNavigationOptions {
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textSubtle,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: 1,
      // Yükseklik verilmedi: bottom-tabs alt güvenli alanı kendi ekliyor, sabit
      // yükseklik çentikli telefonlarda etiketleri kırpıyor.
      paddingTop: spacing.sm,
    },
    tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
  };
}
