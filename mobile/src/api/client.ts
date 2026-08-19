import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';

// The Android emulator resolves "localhost" to itself; Google's reserved
// 10.0.2.2 address reaches the developer machine. On the iOS simulator (and
// on real devices via the LAN IP) localhost works directly.
// When testing on a real device, replace this with your machine's LAN IP.
export const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3000/api',
  default: 'http://localhost:3000/api',
});

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// When the session becomes invalid (token expired or user deleted) we clear
// the stored session and notify AuthProvider; otherwise the app gets stuck
// in a "half signed-in" state where no request succeeds.
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  onSessionExpired = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await AsyncStorage.multiRemove(['token', 'user']);
      onSessionExpired?.();
    }
    return Promise.reject(error);
  }
);
