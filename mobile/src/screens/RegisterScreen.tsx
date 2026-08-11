import React, { useState } from 'react';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleRegister() {
    setSubmitting(true);
    try {
      await register(name, email, password);
    } catch (err: any) {
      Alert.alert('Kayıt başarısız', err?.response?.data?.error ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hesap Oluştur</Text>
      <TextInput style={styles.input} placeholder="Ad Soyad" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="E-posta"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Şifre (en az 8 karakter)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title={submitting ? 'Kaydediliyor...' : 'Kayıt Ol'} onPress={handleRegister} disabled={submitting} />
      <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
        Zaten hesabın var mı? Giriş yap
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  link: { marginTop: 16, textAlign: 'center', color: '#2e7d32' },
});
