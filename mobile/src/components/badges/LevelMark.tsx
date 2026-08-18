import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';
import Text from '../ui/Text';
import { makeStyles, useTheme } from '../../theme';

/**
 * Seviye amblemi. On ayrı görsel çizmek yerine seviyeden **türetiliyor**:
 * çevredeki yaprak sayısı `3 + seviye`, yani 1. seviyede dört, 10. seviyede
 * on üç. Böylece hem tek bir çizim kodu yetiyor hem de seviye atlamak görsel
 * olarak da fark ediliyor — sadece sayı değişmiyor, amblem "büyüyor".
 *
 * Rakam SVG içinde değil üstüne binen normal `Text` ile yazılıyor; SVG metni
 * uygulamanın Nunito'sunu almıyor.
 */
type Props = {
  level: number;
  size?: number;
};

const VIEWBOX = 48;

/** Ortadan `count` yönde, sırayla uzun ve kısa yarıçapla giden yıldız köşeleri. */
function rosettePoints(count: number, outer: number, inner: number): string {
  const points: string[] = [];
  const center = VIEWBOX / 2;
  const steps = count * 2;
  for (let i = 0; i < steps; i += 1) {
    // -90°: ilk yaprak tam yukarı baksın, amblem simetrik dursun.
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? outer : inner;
    points.push(`${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

export default function LevelMark({ level, size = 44 }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const petals = 3 + Math.max(1, level);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
        <Polygon points={rosettePoints(petals, 23, 18.5)} fill={colors.brandTint} />
        <Circle cx={24} cy={24} r={16} fill={colors.brand} />
      </Svg>
      <View style={styles.label} pointerEvents="none">
        <Text
          variant="bodyStrong"
          style={[styles.number, { fontSize: size * 0.4, lineHeight: size * 0.5 }]}
        >
          {level}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  container: { alignItems: 'center', justifyContent: 'center' },
  label: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { color: c.textOnBrand },
}));
