import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import type { AuthStackParamList } from '../navigation';
import { Button, Input, Screen, Text } from '../components/ui';
import { Icon, Wordmark } from '../components/brand';
import { brand, hitSlop, makeStyles, spacing, useTheme } from '../theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/** Registration — the same language as login: logo, bare fields, one gradient button. */
export default function RegisterScreen({ navigation }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Registration requires an explicit terms acceptance (owner decision).
  const [termsAccepted, setTermsAccepted] = useState(false);

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
    // KAV wraps the ScrollView, never the other way around: with the KAV
    // inside `Screen scroll`, the keyboard's padding grew the scroll
    // content, which re-triggered the KAV measurement — a layout loop that
    // froze the JS thread on real devices (found on the first physical
    // install). Login has no scroll, which is why it never hit this.
    <Screen edges={['top', 'bottom']} padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
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
          {/* Terms acceptance gates registration; the links open the hosted
              legal pages. The tap targets are separate: the box toggles, the
              colored titles open the pages. */}
          <View style={styles.termsRow}>
            <Pressable
              onPress={() => setTermsAccepted((prev) => !prev)}
              hitSlop={hitSlop}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}
            >
              {termsAccepted && <Icon name="check" size={14} color={colors.textOnBrand} />}
            </Pressable>
            <Text variant="caption" style={styles.termsText}>
              <Text
                variant="caption"
                color="brand"
                onPress={() => Linking.openURL(brand.termsUrl).catch(() => {})}
              >
                Kullanım Koşulları
              </Text>
              {"'"}nı okudum, kabul ediyorum;{' '}
              <Text
                variant="caption"
                color="brand"
                onPress={() => Linking.openURL(brand.privacyUrl).catch(() => {})}
              >
                Aydınlatma Metni
              </Text>
              {"'"}ni okudum.
            </Text>
          </View>

          <Button
            title="Kayıt ol"
            onPress={handleRegister}
            loading={submitting}
            disabled={!termsAccepted}
            fullWidth
          />

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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  flex: { flex: 1 },
  // flexGrow (not flex): a scroll content container with flex:1 can't grow
  // past the viewport, which would clip the form under the keyboard.
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingVertical: spacing.xl,
  },
  brand: { marginBottom: spacing.xxl },
  lastField: { marginBottom: spacing.sm },
  link: { marginTop: spacing.lg },
  note: { marginTop: spacing.xl, paddingHorizontal: spacing.sm, lineHeight: 19 },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: c.brand, borderColor: c.brand },
  termsText: { flex: 1, lineHeight: 19 },
}));
