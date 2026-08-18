import React from 'react';
import { StyleSheet, View } from 'react-native';

// Haritalarda alışılmış "mavi nokta" göstergesi: dış halka konumun yaklaşık
// olduğunu ima eder, beyaz çerçeveli iç nokta ise haritanın üzerinde her zaman
// seçilebilir kalır. Daha önce kullanılan düz Circle, harita zemininde kaybolan
// ve boyutu zoom'a göre değişen bir leke gibi görünüyordu.
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
    borderRadius: 14,
    backgroundColor: 'rgba(25, 118, 210, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1976d2',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
});
