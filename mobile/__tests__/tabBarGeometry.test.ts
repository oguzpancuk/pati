import {
  TAB_GROUP_HEIGHT,
  TAB_HOME_INDICATOR_CLEARANCE,
  tabBarGeometry,
  tabBarOptions,
} from '../src/theme/navigation';
import { palettes } from '../src/theme/colors';
import type { Theme } from '../src/theme/ThemeContext';

/** Space between the hairline's top and the icon, and between the label and the screen edge. */
function gaps(inset: number) {
  const g = tabBarGeometry(inset);
  const above = 1 + g.itemPaddingTop;
  const below = g.itemPaddingBottom + g.barPaddingBottom;
  return { g, above, below };
}

describe('the tab bar geometry', () => {
  // Android and home-button iPhones, small Android gesture insets, a landscape
  // or iPad home indicator, and the notched iPhones.
  it.each([0, 4, 8, 12, 16, 20, 21, 24, 34, 48])(
    'centres the icon and label at inset %i',
    (inset) => {
      const { g, above, below } = gaps(inset);
      expect(above).toBe(below);
      expect(g.height).toBe(above + TAB_GROUP_HEIGHT + below);
      // Never pressed against the edge, never more air than the indicator needs.
      expect(below).toBeGreaterThanOrEqual(8);
      expect(below).toBeLessThanOrEqual(TAB_HOME_INDICATOR_CLEARANCE);
      // The part of the bar that is not an item is exactly the part a home
      // indicator could be under.
      expect(g.barPaddingBottom).toBeLessThanOrEqual(inset);
    }
  );

  it('keeps the labels and the touch area above a home indicator', () => {
    const { g } = gaps(34);
    // The indicator occupies the bottom 13 pt.
    expect(g.barPaddingBottom).toBeGreaterThan(13);
    expect(g.itemPaddingBottom).toBe(0);
  });

  it('sizes the bar against the library one it replaces', () => {
    // bottom-tabs 6 on an iPhone 17 Pro: 49 + (34 - 4) = 79, items at the top.
    expect(tabBarGeometry(34).height).toBe(76);
    // Without an inset: 49, labels flush with the edge. The 7 pt are the gap under them.
    expect(tabBarGeometry(0).height).toBe(56);
  });
});

describe('tabBarOptions', () => {
  // why: tabBarOptions reads only the colours; shadows and map colours are irrelevant here.
  const theme = { name: 'light', colors: palettes.light } as unknown as Theme;

  it('sets the computed height and stacked labels in portrait', () => {
    const options = tabBarOptions(theme, { bottomInset: 34, landscape: false });
    expect(options.tabBarLabelPosition).toBe('below-icon');
    expect(options.tabBarStyle).toMatchObject({ height: 76, paddingTop: 0, paddingBottom: 18 });
    expect(options.tabBarItemStyle).toMatchObject({ paddingTop: 17, paddingBottom: 0 });
  });

  it('leaves the landscape bar to the library', () => {
    const options = tabBarOptions(theme, { bottomInset: 21, landscape: true });
    expect(options.tabBarLabelPosition).toBeUndefined();
    expect(options.tabBarItemStyle).toBeUndefined();
    expect(options.tabBarStyle).not.toHaveProperty('height');
  });

  it('gives the label a line height, so the group height is what the geometry assumes', () => {
    const options = tabBarOptions(theme, { bottomInset: 0, landscape: false });
    expect(options.tabBarLabelStyle).toMatchObject({ lineHeight: 13, marginTop: 2 });
  });
});
