import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { fetchAuthProviders, type AuthProviders, type SocialProvider } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import {
  appleSupported,
  configureGoogle,
  googleAvailable,
  isAppleCancellation,
  signInWithApple,
  signInWithGoogle,
} from '../socialAuth';
import { brand, makeStyles, minTouch, radius, spacing, useTheme } from '../theme';
import { Text } from './ui';

/**
 * The Apple / Google row under the login and register forms.
 *
 * Renders nothing until the backend confirms a provider is configured, so a
 * build pointed at an environment without credentials shows the plain e-mail
 * form rather than buttons that could only fail. The web client's
 * SocialSignIn does the same from the same endpoint; the difference is that
 * web must use Google's own rendered button (only GIS hands out an ID token
 * in a browser), while here the buttons are ours.
 */
export default function SocialSignIn() {
  const styles = useStyles();
  const { colors, name: themeName } = useTheme();
  const { loginWithProvider } = useAuth();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  useEffect(() => {
    let alive = true;
    // No providers configured is an ordinary state, not an error: stay quiet.
    fetchAuthProviders()
      .then((p) => {
        if (!alive) return;
        configureGoogle(p);
        setProviders(p);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const run = useCallback(
    async (provider: SocialProvider, start: () => Promise<{ identityToken: string; name?: string } | null>) => {
      setBusy(provider);
      try {
        const identity = await start();
        // null means the user closed the sheet — nothing to report.
        if (identity) {
          await loginWithProvider(provider, identity.identityToken, identity.name);
        }
      } catch (err: any) {
        if (!isAppleCancellation(err)) {
          Alert.alert(
            'Giriş başarısız',
            err?.response?.data?.error ?? 'Bir hata oluştu, tekrar deneyin'
          );
        }
      } finally {
        setBusy(null);
      }
    },
    [loginWithProvider]
  );

  const appleBg = themeName === 'dark' ? '#FFFFFF' : '#000000';
  const appleFg = themeName === 'dark' ? '#000000' : '#FFFFFF';

  const showApple = !!providers?.apple.enabled && appleSupported;
  // googleAvailable, not `enabled`: on iOS a missing client id would make the
  // native SDK raise rather than fail (see socialAuth).
  const showGoogle = googleAvailable(providers);
  if (!showApple && !showGoogle) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.rule} />
        <Text variant="caption" color="textSubtle" style={styles.dividerLabel}>
          veya
        </Text>
        <View style={styles.rule} />
      </View>

      {showApple && (
        <Pressable
          onPress={() => run('apple', signInWithApple)}
          disabled={!!busy}
          style={({ pressed }) => [
            styles.button,
            // Apple's guidelines: the mark sits on black in light themes and
            // on white in dark ones. Fixed brand colors, not palette tokens,
            // so they are written here rather than in the stylesheet.
            { backgroundColor: appleBg, borderColor: appleBg },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Apple ile giriş yap"
        >
          {busy === 'apple' ? (
            <ActivityIndicator color={appleFg} />
          ) : (
            <>
              <AppleMark color={appleFg} />
              <Text variant="bodyStrong" style={[styles.label, { color: appleFg }]}>
                Apple ile giriş yap
              </Text>
            </>
          )}
        </Pressable>
      )}

      {showGoogle && (
        <Pressable
          onPress={() => run('google', signInWithGoogle)}
          disabled={!!busy}
          style={({ pressed }) => [styles.button, styles.google, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Google ile devam et"
        >
          {busy === 'google' ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <GoogleMark />
              <Text variant="bodyStrong" style={[styles.label, { color: colors.text }]}>
                Google ile devam et
              </Text>
            </>
          )}
        </Pressable>
      )}

      {/* Registration asks for an explicit tick (owner decision); a provider
          sheet has no room for one, so the consent is stated here — the same
          sentence the web client shows under its buttons. */}
      <Text variant="caption" color="textSubtle" center style={styles.consent}>
        {consentLead(showApple, showGoogle)}{' '}
        <Text
          variant="caption"
          color="brand"
          onPress={() => Linking.openURL(brand.termsUrl).catch(() => {})}
        >
          Kullanım Koşulları
        </Text>
        {"'"}nı kabul etmiş,{' '}
        <Text
          variant="caption"
          color="brand"
          onPress={() => Linking.openURL(brand.privacyUrl).catch(() => {})}
        >
          Aydınlatma Metni
        </Text>
        {"'"}ni okumuş sayılırsın.
      </Text>
    </View>
  );
}

/**
 * Names only the providers actually on screen. iOS can end up with Apple
 * alone (googleAvailable), so a fixed "Apple veya Google" would promise a
 * button that is not there.
 */
function consentLead(apple: boolean, google: boolean): string {
  if (apple && google) return 'Apple veya Google ile devam edersen';
  return `${apple ? 'Apple' : 'Google'} ile devam edersen`;
}

/** Apple's mark, required on the button by their sign-in guidelines. */
function AppleMark({ color }: { color: string }) {
  return (
    <Svg width={15} height={18} viewBox="0 0 14 17">
      <Path
        fill={color}
        d="M11.62 8.99c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.28.69-2.88.69-.59 0-1.5-.67-2.47-.65-1.27.02-2.44.74-3.09 1.87-1.32 2.29-.34 5.68.95 7.54.63.91 1.38 1.93 2.36 1.89.95-.04 1.31-.61 2.45-.61s1.47.61 2.47.59c1.02-.02 1.67-.93 2.29-1.84.72-1.05 1.02-2.07 1.04-2.13-.02-.01-2-.77-2.02-3.05zM9.72 3.35c.52-.64.87-1.52.78-2.4-.75.03-1.66.5-2.2 1.13-.48.56-.9 1.46-.79 2.32.84.06 1.69-.42 2.21-1.05z"
      />
    </Svg>
  );
}

/** Google's four-colour G — their guidelines forbid recolouring it. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  wrap: { marginTop: spacing.lg },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  rule: { flex: 1, height: 1, backgroundColor: c.borderStrong },
  dividerLabel: { marginHorizontal: spacing.md },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: minTouch,
    borderRadius: radius.pill,
    marginBottom: spacing.sm,
    borderWidth: 1,
  },
  google: { backgroundColor: c.surface, borderColor: c.borderStrong },
  pressed: { opacity: 0.85 },
  // The label sets its own lineHeight: overriding fontSize alone lets iOS
  // clip descenders (see CLAUDE.md).
  label: { fontSize: 15, lineHeight: 20 },
  consent: { marginTop: spacing.sm, paddingHorizontal: spacing.sm, lineHeight: 18 },
}));
