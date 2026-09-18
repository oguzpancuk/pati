import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Chip, Divider, Text } from '../ui';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_LABEL } from '../../map/attribution';
import { brand, makeStyles, spacing, type ThemeMode } from '../../theme';
import BlockedUsersSection from './BlockedUsersSection';
import Sheet from './Sheet';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'sistem' },
  { key: 'light', label: 'açık' },
  { key: 'dark', label: 'koyu' },
];

export type SettingsSheetProps = {
  visible: boolean;
  onClose: () => void;
  mode: ThemeMode;
  onSelectMode: (mode: ThemeMode) => void;
  /** `false` means the showcase world is hidden; absent means on. */
  showDemo: boolean;
  demoBusy: boolean;
  onToggleDemo: () => void;
  onLogout: () => void;
  /** Track Ş's ChangePasswordForm; the screen owns `me` and the reload. */
  changePassword: React.ReactNode;
  /** The account-deletion link with its own modal, owned by the screen. */
  deleteAccount: React.ReactNode;
};

/**
 * The settings that used to be scattered down the profile, gathered behind
 * the gear (owner, 2026-09-11). Order is the owner's: görünüm, demo
 * verileri, the people you blocked, then the account block below a hairline.
 */
export default function SettingsSheet({
  visible,
  onClose,
  mode,
  onSelectMode,
  showDemo,
  demoBusy,
  onToggleDemo,
  onLogout,
  changePassword,
  deleteAccount,
}: SettingsSheetProps) {
  const styles = useStyles();

  return (
    <Sheet visible={visible} onClose={onClose} title="Ayarlar">
      <Text variant="micro" style={styles.label}>
        görünüm
      </Text>
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={mode === option.key}
            onPress={() => onSelectMode(option.key)}
          />
        ))}
      </View>

      {/* The showcase (demo) world is each person's own choice (owner,
          2026-09-09): on by default so a new user finds a neighbourhood in
          use, off with one tap when the tour is over. */}
      <Text variant="micro" style={styles.label}>
        demo verileri
      </Text>
      <View style={styles.demoRow}>
        <View style={styles.demoText}>
          {/* No heading of its own: the micro label above already names the
              section, and the two together read as the words repeating. */}
          <Text variant="caption">
            {showDemo
              ? 'Örnek mahalleler haritada ve listelerde görünüyor.'
              : 'Sadece gerçek kayıtlar görünüyor.'}
          </Text>
        </View>
        {/* "görünüyor / gizli", not "açık / kapalı": the theme chips sit
            directly above and one of THEM is called "açık" (light) — same
            word, different meaning (QA). */}
        <Chip
          label={showDemo ? 'görünüyor' : 'gizli'}
          selected={showDemo}
          onPress={demoBusy ? undefined : onToggleDemo}
        />
      </View>

      {/* Loads itself each time the sheet mounts it — the list is short and
          a block is rare, so no state has to be threaded through the screen. */}
      <BlockedUsersSection />

      <Divider style={styles.divider} />

      {changePassword}

      {/* Directly under the password form, above the legal line and the
          logout: the account block's two destructive-ish actions together,
          and deletion no longer the last thing in a scrolling sheet. */}
      {deleteAccount}

      <Divider style={styles.divider} />

      <Text variant="caption" color="textSubtle" center style={styles.legal}>
        <Text
          variant="caption"
          color="textSubtle"
          onPress={() => Linking.openURL(brand.privacyUrl).catch(() => {})}
        >
          gizlilik (kvkk)
        </Text>
        {'   ·   '}
        <Text
          variant="caption"
          color="textSubtle"
          onPress={() => Linking.openURL(brand.termsUrl).catch(() => {})}
        >
          kullanım koşulları
        </Text>
      </Text>

      <Pressable onPress={onLogout} style={styles.logout} accessibilityRole="button">
        <Text variant="captionStrong" color="textSubtle" center>
          çıkış yap
        </Text>
      </Pressable>

      {/* The basemap credit (owner, 2026-09-11 demo note 15). It left every
          map surface and lives here instead — the last line of this sheet
          rather than behind a further tap, which is what keeps ODbL's
          "discoverable" true one level deeper. The words come from
          map/attribution.ts so both clients say the same sentence. */}
      <Divider style={styles.divider} />
      <Text variant="micro" style={styles.label}>
        {MAP_ATTRIBUTION_LABEL}
      </Text>
      <Text variant="caption">{MAP_ATTRIBUTION}</Text>
    </Sheet>
  );
}

const useStyles = makeStyles(() => ({
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  demoText: { flex: 1 },
  divider: { marginVertical: spacing.xl },
  legal: { marginBottom: spacing.lg },
  logout: { alignSelf: 'center', marginBottom: spacing.sm },
}));
