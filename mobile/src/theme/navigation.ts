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

/** bottom-tabs 6 hands every `tabBarIcon` this fixed size; it is not an option. */
export const TAB_ICON_SIZE = 25;
const TAB_LABEL_GAP = 2;
// The token sets it; the record's TextStyle type just cannot promise that.
const TAB_LABEL_LINE_HEIGHT = type.tab.lineHeight ?? 13;
const TAB_BORDER = 1;
/** The icon over its label: what the bar centres. */
export const TAB_GROUP_HEIGHT = TAB_ICON_SIZE + TAB_LABEL_GAP + TAB_LABEL_LINE_HEIGHT;
/** Air under the labels where there is nothing to clear (Android, home-button iPhones). */
const TAB_MIN_GAP = spacing.sm;
/**
 * The most of the bottom safe area the bar reserves. The home indicator sits
 * in the bottom 13 pt of the screen; 18 keeps the labels, and every tappable
 * point, a few points above it.
 */
export const TAB_HOME_INDICATOR_CLEARANCE = 18;

export type TabBarGeometry = {
  height: number;
  /** On the bar itself, so the items (and their touch area) stop above it. */
  barPaddingBottom: number;
  itemPaddingTop: number;
  itemPaddingBottom: number;
};

/**
 * The bar's vertical layout for a bottom safe-area inset, with the icon and
 * label centred between the hairline and the screen edge.
 *
 * Why not bottom-tabs' own: it makes the bar 49 pt of items plus the whole
 * inset minus 4, and pins the items to the top of that. On an iPhone with a
 * home indicator (inset 34) the bar was 79 pt with a 30 pt empty band under
 * the labels and 9 above the icons (owner, 2026-09-15). Here the inset is
 * capped at what the indicator needs, and the same gap goes above the group
 * as below it. With no inset the bar keeps 8 pt under its labels, where the
 * library's layout (49 pt of items, our 8 pt of top padding inside it) left
 * the label box flush with the edge.
 */
export function tabBarGeometry(bottomInset: number): TabBarGeometry {
  const barPaddingBottom = Math.min(Math.max(bottomInset, 0), TAB_HOME_INDICATOR_CLEARANCE);
  const gap = Math.max(barPaddingBottom, TAB_MIN_GAP);
  // The part of the gap nothing has to clear belongs to the items, so a tap
  // right at the bottom edge of such a bar still lands on a tab.
  const itemPaddingBottom = gap - barPaddingBottom;
  // The hairline counts towards the gap above.
  const itemPaddingTop = gap - TAB_BORDER;
  return {
    height: TAB_BORDER + itemPaddingTop + TAB_GROUP_HEIGHT + itemPaddingBottom + barPaddingBottom,
    barPaddingBottom,
    itemPaddingTop,
    itemPaddingBottom,
  };
}

/**
 * The tab bar: white with a single hairline on top, lowercase widely spaced
 * labels, and the accent orange on the active tab.
 */
export function tabBarOptions(
  { colors }: Theme,
  { bottomInset, landscape }: { bottomInset: number; landscape: boolean }
): BottomTabNavigationOptions {
  const common: BottomTabNavigationOptions = {
    headerShown: false,
    tabBarActiveTintColor: colors.brand,
    tabBarInactiveTintColor: colors.textSubtle,
    tabBarLabelStyle: {
      fontFamily: type.tab.fontFamily,
      fontSize: type.tab.fontSize,
      lineHeight: TAB_LABEL_LINE_HEIGHT,
      letterSpacing: type.tab.letterSpacing,
      marginTop: TAB_LABEL_GAP,
    },
  };
  const hairline = {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: TAB_BORDER,
  };
  if (landscape) {
    // A landscape phone gets bottom-tabs' compact bar, label beside the icon,
    // as it always has: the centred geometry is for the stacked layout, and
    // 76 pt of a 402 pt-tall screen is too much to give a bar.
    return { ...common, tabBarStyle: { ...hairline, paddingTop: spacing.sm } };
  }
  const geometry = tabBarGeometry(bottomInset);
  return {
    ...common,
    // Stated, not inferred: the library would put labels beside the icons on
    // a portrait window 768 pt wide, which this height does not fit.
    tabBarLabelPosition: 'below-icon',
    tabBarStyle: {
      ...hairline,
      // Computed from the inset, so a notched phone gets the room it needs;
      // setting it also replaces the library's own inset padding below.
      height: geometry.height,
      paddingTop: 0,
      paddingBottom: geometry.barPaddingBottom,
    },
    tabBarItemStyle: {
      paddingTop: geometry.itemPaddingTop,
      paddingBottom: geometry.itemPaddingBottom,
    },
  };
}
