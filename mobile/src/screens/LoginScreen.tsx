import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation';
import { Button, Input, Screen, Text } from '../components/ui';
import { Wordmark } from '../components/brand';
import { hitSlop, makeStyles, spacing } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Login (handoff 3a): a vertically centered logo + wordmark, no tagline, and
 * fields sitting directly on white — no card. The faint note at the bottom
 * tells new users the server assigns them a random avatar.
 */
export default function LoginScreen({ navigation }: Props) {
  const styles = useStyles();
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
          <Wordmark size="lg" style={styles.brand} />

          <Input
            label="e-posta"
            placeholder="ornek@eposta.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="şifre"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            containerStyle={styles.lastField}
          />
          <Button title="Giriş yap" onPress={handleLogin} loading={submitting} fullWidth />

          <Pressable
            onPress={() => navigation.navigate('Register')}
            hitSlop={hitSlop}
            style={styles.link}
          >
            <Text variant="bodyStrong" center>
              Hesabın yok mu?{' '}
              <Text variant="bodyStrong" color="brand">
                Kayıt ol
              </Text>
            </Text>
          </Pressable>

          <Text variant="caption" color="textSubtle" center style={styles.note}>
            Kayıt olursan sana rastgele bir avatar atanır, profilden değiştirebilirsin.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  // 34pt horizontal padding comes from the handoff's 390pt canvas.
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 34 },
  brand: { marginBottom: spacing.xxl + 2 },
  lastField: { marginBottom: spacing.lg },
  link: { marginTop: spacing.lg },
  note: { marginTop: spacing.xxl + 8, paddingHorizontal: spacing.sm, lineHeight: 19 },
}));
