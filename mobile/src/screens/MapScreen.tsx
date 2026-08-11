import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import MapView, { LatLng, Marker, Polygon } from 'react-native-maps';
import { addRegionAction, fetchRegions, Region, RegionStatus } from '../api/regions';
import { fetchAnimals, Animal } from '../api/animals';

const STATUS_COLORS: Record<RegionStatus, string> = {
  green: 'rgba(46, 125, 50, 0.35)',
  yellow: 'rgba(251, 192, 45, 0.35)',
  red: 'rgba(198, 40, 40, 0.35)',
};

function toLatLngList(polygon: GeoJSON.Polygon): LatLng[] {
  return polygon.coordinates[0].map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

export default function MapScreen({ navigation }: any) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);

  const loadData = useCallback(async () => {
    const [regionData, animalData] = await Promise.all([fetchRegions(), fetchAnimals()]);
    setRegions(regionData);
    setAnimals(animalData);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleRegionPress(region: Region) {
    Alert.alert(region.name, `Durum: ${region.status}`, [
      { text: 'Mama Bıraktım', onPress: () => submitAction(region.id, 'food') },
      { text: 'Su Bıraktım', onPress: () => submitAction(region.id, 'water') },
      { text: 'Hayvan Görüldü', onPress: () => submitAction(region.id, 'sighting') },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function submitAction(regionId: number, actionType: 'food' | 'water' | 'sighting') {
    await addRegionAction(regionId, actionType);
    loadData();
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 39.0,
          longitude: 35.0,
          latitudeDelta: 8,
          longitudeDelta: 8,
        }}
      >
        {regions.map((region) => (
          <Polygon
            key={region.id}
            coordinates={toLatLngList(region.boundary)}
            fillColor={STATUS_COLORS[region.status]}
            strokeColor="#555"
            tappable
            onPress={() => handleRegionPress(region)}
          />
        ))}
        {animals.map((animal) => (
          <Marker
            key={animal.id}
            coordinate={{
              latitude: animal.location.coordinates[1],
              longitude: animal.location.coordinates[0],
            }}
            title={animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
            onPress={() => navigation.navigate('AnimalProfile', { animalId: animal.id })}
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
