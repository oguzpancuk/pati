import {
  TAB_GROUP_HEIGHT,
  TAB_HOME_INDICATOR_CLEARANCE,
  TAB_INDICATOR_BAND,
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
  // The numbers themselves, not a second copy of the formula: a test that
  // recomputes the rule passes whichever constants the rule is given, and
  // the owner has now reported this bar sitting wrong twice.
  // Android and home-button iPhones (0), thin Android gesture insets, an
  // iPad or landscape indicator (20-24) and the notched iPhones (34+).
  it.each([
    // inset, bar height, air above the icons, air under the labels
    [0, 56, 8, 8],
    [4, 56, 8, 8],
    [8, 56, 8, 8],
    [12, 60, 8, 12],
    [16, 64, 8, 16],
    [20, 68, 8, 20],
    [21, 69, 8, 21],
    [24, 72, 8, 24],
    [34, 82, 13, 29],
    [48, 82, 13, 29],
  ])('inset %i: a %i pt bar with %i above and %i below', (inset, height, top, bottom) => {
    const { g, above, below } = gaps(inset);
    expect([g.height, above, below]).toEqual([height, top, bottom]);
  });

  it.each([0, 4, 8, 12, 16, 20, 21, 24, 34, 48])('adds up at inset %i', (inset) => {
    const { g, above, below } = gaps(inset);
    expect(g.height).toBe(above + TAB_GROUP_HEIGHT + below);
    // Never pressed against the edge, never more air than the indicator needs.
    expect(above).toBeGreaterThanOrEqual(8);
    expect(below).toBeGreaterThanOrEqual(8);
    expect(below).toBeLessThanOrEqual(TAB_HOME_INDICATOR_CLEARANCE);
    // The part of the bar that is not an item is exactly the part a home
    // indicator could be under.
    expect(g.barPaddingBottom).toBeLessThanOrEqual(inset);
    // No padding is ever negative: React Native would not complain, it
    // would just lay the group out somewhere nobody meant.
    expect(g.itemPaddingTop).toBeGreaterThanOrEqual(0);
    expect(g.itemPaddingBottom).toBeGreaterThanOrEqual(0);
  });

  it('discounts exactly the home indicator band from the gap above', () => {
    // 29 of room below, 16 of which the indicator owns, so 13 above it.
    expect(TAB_INDICATOR_BAND).toBe(16);
    expect(TAB_HOME_INDICATOR_CLEARANCE).toBe(29);
    const { above, below } = gaps(34);
    expect(below - above).toBe(TAB_INDICATOR_BAND);
  });

  it('keeps the labels and the touch area above a home indicator', () => {
    const { g, above, below } = gaps(34);
    // The indicator occupies the bottom 13 pt.
    expect(g.barPaddingBottom).toBeGreaterThan(13);
    expect(g.itemPaddingBottom).toBe(0);
    // And it is the lower half of the bar's air that carries it.
    expect(below).toBeGreaterThan(above);
  });

  it('lifts the group above where centring on the screen edge put it', () => {
    // The 2026-09-15 geometry at inset 34: a 76 pt bar with 18 pt of padding
    // under the items and 17 above them, which put the icons 58 pt from the
    // screen edge. They now sit 11 pt higher — the position the owner picked
    // from three rendered candidates on 2026-09-16.
    const inkTopAboveEdge = (g: ReturnType<typeof tabBarGeometry>) =>
      g.height - 1 - g.itemPaddingTop;
    expect(inkTopAboveEdge(tabBarGeometry(34))).toBe(58 + 11);
  });

  it('sizes the bar against the library one it replaces', () => {
    // bottom-tabs 6 on an iPhone 17 Pro: 49 + (34 - 4) = 79, items at the top.
    expect(tabBarGeometry(34).height).toBe(82);
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
    expect(options.tabBarStyle).toMatchObject({ height: 82, paddingTop: 0, paddingBottom: 29 });
    expect(options.tabBarItemStyle).toMatchObject({ paddingTop: 12, paddingBottom: 0 });
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
