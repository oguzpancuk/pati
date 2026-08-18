import { DefaultTheme, Theme } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { palette } from './colors';
import { fonts } from './typography';
import { spacing } from './layout';

/**
 * react-navigation'ın kendi teması. Bunu vermezsek ekran geçişlerinde bir an
 * beyaz zemin görünüyor (varsayılan tema beyaz), krem arka planla çarpışıyor.
 */
export const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.brand,
    background: palette.background,
    card: palette.background,
    text: palette.text,
    border: palette.border,
    notification: palette.danger,
  },
};

/** Stack başlıkları: krem zemin, ince ayraç yok, marka rengi geri oku. */
export const screenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: palette.background },
  headerShadowVisible: false,
  headerTintColor: palette.brand,
  headerTitleStyle: { fontFamily: fonts.bold, fontSize: 18, color: palette.text },
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: palette.background },
};

/** Sekme çubuğu: beyaz, üstte tek sıcak çizgi, seçili sekme marka turuncusu. */
export const tabBarOptions: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarActiveTintColor: palette.brand,
  tabBarInactiveTintColor: palette.textSubtle,
  tabBarStyle: {
    backgroundColor: palette.surface,
    borderTopColor: palette.border,
    borderTopWidth: 1,
    // Yükseklik verilmedi: bottom-tabs alt güvenli alanı kendi ekliyor, sabit
    // yükseklik çentikli telefonlarda etiketleri kırpıyor.
    paddingTop: spacing.sm,
  },
  tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12 },
};
