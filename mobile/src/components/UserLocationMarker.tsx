import React from 'react';
import { View } from 'react-native';
import { makeStyles, mapColors, radius } from '../theme';

// Haritalarda alışılmış "konum noktası" göstergesi: dış halka konumun yaklaşık
// olduğunu ima eder, beyaz çerçeveli iç nokta ise haritanın üzerinde her zaman
// seçilebilir kalır. Daha önce kullanılan düz Circle, harita zemininde kaybolan
// ve boyutu zoom'a göre değişen bir leke gibi görünüyordu.
// Renk marka turuncusu: haritadaki yeşil bakım daireleriyle karışmıyor.
export default function UserLocationMarker() {
  const styles = useStyles();
  return (
    <View style={styles.halo}>
      <View style={styles.dot} />
    </View>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
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
    // Nokta haritanın üstünde duruyor; harita zemini temayı takip etmediği
    // için çerçeve her iki temada da açık kalıyor.
    backgroundColor: mapColors.userRadiusStroke,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: c.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
}));
