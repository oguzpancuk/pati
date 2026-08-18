import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { useTheme, type Theme } from './ThemeContext';

type NamedStyles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Temaya bağlı `StyleSheet`. `StyleSheet.create(...)` yerine bunu kullanın:
 *
 *   const useStyles = makeStyles(({ colors: c, shadow }) => ({
 *     card: { backgroundColor: c.surface, ...shadow.card },
 *   }));
 *
 *   function Component() {
 *     const styles = useStyles();
 *   }
 *
 * Stil sayfası tema başına bir kez üretilip saklanıyor; her render'da yeniden
 * `StyleSheet.create` çağırmak gereksiz iş olurdu. Tema sayısı iki olduğu için
 * önbellek sınırsız büyümüyor.
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
