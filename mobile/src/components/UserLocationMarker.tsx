import React from 'react';
import { StyleSheet, View } from 'react-native';
import { mapColors, palette, radius } from '../theme';

// Haritalarda alışılmış "konum noktası" göstergesi: dış halka konumun yaklaşık
// olduğunu ima eder, beyaz çerçeveli iç nokta ise haritanın üzerinde her zaman
// seçilebilir kalır. Daha önce kullanılan düz Circle, harita zemininde kaybolan
// ve boyutu zoom'a göre değişen bir leke gibi görünüyordu.
// Renk marka turuncusu: haritadaki yeşil/kırmızı bakım katmanlarıyla karışmıyor.
export default function UserLocationMarker() {
  return (
    <View style={styles.halo}>
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: mapColors.userRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: palette.brand,
    borderWidth: 2.5,
    borderColor: palette.surface,
    shadowColor: palette.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
