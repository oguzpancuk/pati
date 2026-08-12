import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Platform } from 'react-native';

// Android emülatörü "localhost"u kendi üzerinde arar; geliştirici makinesine
// ulaşmak için Google'ın ayırdığı 10.0.2.2 adresi kullanılır. iOS simülatöründe
// (ve gerçek cihazlarda LAN IP'si ile) localhost doğrudan çalışır.
// Gerçek bir cihazda test ederken bu değeri makinenizin LAN IP'siyle değiştirin.
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

// Oturum geçersizleştiğinde (token süresi dolmuş ya da kullanıcı silinmiş)
// saklanan oturumu temizleyip AuthProvider'a haber veriyoruz; aksi halde
// uygulama, hiçbir isteği geçmeyen "yarı giriş yapmış" bir durumda takılıyor.
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
