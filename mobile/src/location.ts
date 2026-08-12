import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export interface Coordinates {
  lat: number;
  lng: number;
}

async function requestAndroidPermission(): Promise<boolean> {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getCurrentLocation(): Promise<Coordinates> {
  if (Platform.OS === 'android') {
    const granted = await requestAndroidPermission();
    if (!granted) {
      throw new Error('Konum izni verilmedi');
    }
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
  });
}
