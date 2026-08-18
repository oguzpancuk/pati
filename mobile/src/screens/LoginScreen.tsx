import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation';
import { Button, Card, Input, Screen, Text } from '../components/ui';
import { Wordmark } from '../components/brand';
import { hitSlop, spacing } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: any) {
      Alert.alert('Giriş başarısız', err?.response?.data?.error ?? 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <Wordmark size="lg" tagline style={styles.brand} />

          <Card style={styles.card}>
            <Input
              label="E-POSTA"
              placeholder="ornek@eposta.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="ŞİFRE"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              containerStyle={styles.lastField}
            />
            <Button
              title="Giriş yap"
              onPress={handleLogin}
              loading={submitting}
              fullWidth
              size="lg"
            />
          </Card>

          <Pressable
            onPress={() => navigation.navigate('Register')}
            hitSlop={hitSlop}
            style={styles.link}
          >
            <Text variant="caption" center>
              Hesabın yok mu?{' '}
              <Text variant="captionStrong" color="brand">
                Kayıt ol
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  brand: { marginBottom: spacing.xxl },
  card: { paddingTop: spacing.xl },
  lastField: { marginBottom: spacing.xl },
  link: { marginTop: spacing.xl },
});
