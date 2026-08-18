import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { makeStyles, useTheme } from '../theme';

// Kalplerin toplam süresi; MapScreen bunun bitiminde marker'ı tekrar "donuk"
// (tracksViewChanges=false) moda alıyor. Buradaki değerle oradaki bekleme aynı
// olmalı, aksi halde animasyon yarıda kesilir ya da harita gereksiz yere
// yeniden çizilmeye devam eder.
export const HEART_BURST_DURATION_MS = 1500;

const HEART_COUNT = 5;
const STAGGER_MS = 110;
const RISE_MS = HEART_BURST_DURATION_MS - STAGGER_MS * (HEART_COUNT - 1);

// Icon.tsx'teki kalp yolu; burada dolu (fill) çizildiği için ayrı tutuluyor.
const HEART_PATH =
  'M12 20.2S4.4 15.3 4.4 10.5A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.8c0 4.8-7.6 9.7-7.6 9.7Z';

// Her kalbin yatay sapması ve boyutu sabit (rastgele değil): aynı anda birden
// çok marker patladığında hepsi aynı ritimde uçuyor, ekran karmaşaya dönmüyor.
const SPREAD = [-14, 8, -4, 14, 2];
const SCALES = [1, 0.8, 1.15, 0.85, 0.95];

/** Kalplerin avatar merkezinden ne kadar yükseleceği; katmanı yerleştiren
 * bileşen (MapScreen) kutuyu buna göre boyutlandırıyor. */
export function heartRiseFor(size: number) {
  return Math.round(size * 1.6);
}

type Props = {
  /** Kalplerin çıktığı avatarın çapı; yükselme mesafesi buna göre ölçekleniyor. */
  size: number;
};

/**
 * Bir avatarın tepesinden yukarı süzülüp sönen kalpler. Mama/su bırakılınca
 * etki alanındaki hayvanların "teşekkürü". Bileşen kendi kendine bir kez oynar;
 * tekrar oynatmak için yeniden mount edilir (MapScreen key ile yapıyor).
 */
export default function HeartBurst({ size }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const progress = useRef(Array.from({ length: HEART_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progress.map((value, index) =>
      Animated.sequence([
        Animated.delay(index * STAGGER_MS),
        Animated.timing(value, {
          toValue: 1,
          duration: RISE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    const group = Animated.parallel(animations);
    group.start();
    return () => group.stop();
  }, [progress]);

  const rise = heartRiseFor(size);
  const heartSize = Math.max(12, Math.round(size * 0.42));

  return (
    <View pointerEvents="none" style={[styles.layer, { width: size, height: size + rise }]}>
      {progress.map((value, index) => {
        const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] });
        const translateX = value.interpolate({
          inputRange: [0, 1],
          outputRange: [0, SPREAD[index]],
        });
        // Önce belirip sonra sönüyor: 0→%15 arası görünür olur, %55'ten
        // sonra kaybolur. Böylece kalp avatarın içinden "doğuyor" gibi duruyor.
        const opacity = value.interpolate({
          inputRange: [0, 0.15, 0.55, 1],
          outputRange: [0, 1, 0.9, 0],
        });
        const scale = value.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0.5, SCALES[index], SCALES[index] * 0.9],
        });
        return (
          <Animated.View
            key={index}
            style={[
              styles.heart,
              {
                left: size / 2 - heartSize / 2,
                bottom: size * 0.55,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          >
            <Svg width={heartSize} height={heartSize} viewBox="0 0 24 24">
              <Path d={HEART_PATH} fill={colors.brand} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  // Katman avatarın üstüne biner; kalpler avatarın merkezinden yukarı çıkar.
  layer: { position: 'absolute', left: 0, bottom: 0 },
  heart: { position: 'absolute' },
}));
