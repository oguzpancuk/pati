import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

// Geliştirme ortamında API adresini burada değiştirin (örn. Android emülatör için 10.0.2.2).
export const API_BASE_URL = 'http://localhost:3000/api';

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
