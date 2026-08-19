import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { useTheme, type Theme } from './ThemeContext';

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * A theme-bound `StyleSheet`. Use this instead of `StyleSheet.create(...)`:
 *
 *   const useStyles = makeStyles(({ colors: c, shadow }) => ({
 *     card: { backgroundColor: c.surface, ...shadow.card },
 *   }));
 *
 *   function Component() {
 *     const styles = useStyles();
 *   }
 *
 * The stylesheet is built once per theme and cached; calling
 * `StyleSheet.create` on every render would be wasted work. With only two
 * themes, the cache never grows unbounded.
 */
export function makeStyles<T extends NamedStyles>(factory: (theme: Theme) => T) {
  const cache: Partial<Record<Theme['name'], T>> = {};

  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache[theme.name];
    if (!styles) {
      styles = StyleSheet.create(factory(theme)) as T;
      cache[theme.name] = styles;
    }
    return styles;
  };
}
