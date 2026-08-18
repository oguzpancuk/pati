import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation';
import { Button, Card, Input, Screen, Text } from '../components/ui';
import { Wordmark } from '../components/brand';
import { hitSlop, spacing } from '../theme';

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
    <Screen edges={['top', 'bottom']} padded={false} scroll>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.center}>
          <Wordmark size="md" style={styles.brand} />
          <Text variant="title" center style={styles.heading}>
            Aramıza katıl
          </Text>
          <Text variant="caption" center style={styles.sub}>
            Mahallendeki hayvanlara birlikte bakalım.
          </Text>

          <Card style={styles.card}>
            <Input label="AD SOYAD" placeholder="Adın" value={name} onChangeText={setName} />
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
              hint="En az 8 karakter"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              containerStyle={styles.lastField}
            />
            <Button
              title="Kayıt ol"
              onPress={handleRegister}
              loading={submitting}
              fullWidth
              size="lg"
            />
          </Card>

          <Pressable
            onPress={() => navigation.navigate('Login')}
            hitSlop={hitSlop}
            style={styles.link}
          >
            <Text variant="caption" center>
              Zaten hesabın var mı?{' '}
              <Text variant="captionStrong" color="brand">
                Giriş yap
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
  brand: { marginBottom: spacing.xl },
  heading: { marginBottom: spacing.xs },
  sub: { marginBottom: spacing.xl },
  card: { paddingTop: spacing.xl },
  lastField: { marginBottom: spacing.xl },
  link: { marginTop: spacing.xl },
});
