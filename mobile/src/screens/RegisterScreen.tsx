import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation';
import { Button, Input, Screen, Text } from '../components/ui';
import { Wordmark } from '../components/brand';
import { hitSlop, makeStyles, spacing } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/** Registration — the same language as login: logo, bare fields, one gradient button. */
export default function RegisterScreen({ navigation }: Props) {
  const styles = useStyles();
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

          <Input label="isim" placeholder="Adın" value={name} onChangeText={setName} />
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
            hint="En az 8 karakter"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            containerStyle={styles.lastField}
          />
          <Button title="Kayıt ol" onPress={handleRegister} loading={submitting} fullWidth />

          <Pressable
            onPress={() => navigation.navigate('Login')}
            hitSlop={hitSlop}
            style={styles.link}
          >
            <Text variant="bodyStrong" center>
              Zaten üye misin?{' '}
              <Text variant="bodyStrong" color="brand">
                Giriş yap
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
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 34, paddingVertical: spacing.xl },
  brand: { marginBottom: spacing.xxl },
  lastField: { marginBottom: spacing.lg },
  link: { marginTop: spacing.lg },
  note: { marginTop: spacing.xl, paddingHorizontal: spacing.sm, lineHeight: 19 },
}));
