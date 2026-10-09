import React from 'react';
import { Alert, Linking, Modal, Pressable, View } from 'react-native';
import type { Petshop } from '../api/petshops';
import { linkLabel, telHref } from '../map/petshopMarker';
import { Button, Text } from './ui';
import { Icon, type IconName } from './brand';
import { makeStyles, radius, spacing, useTheme } from '../theme';

/**
 * A tapped petshop pin's card (owner, 2026-10-07): the listing's name and
 * whichever of address, hours, phone and link the admin entered. The phone
 * row dials, the link row opens the shop's page. Web's PetshopSheet is the
 * same card.
 */
export default function PetshopSheet({
  shop,
  onClose,
}: {
  shop: Petshop | null;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  async function open(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      // A simulator has no phone app, and a device may have nothing that
      // takes the address: say so instead of failing silently.
      Alert.alert('Açılamadı', 'Bu cihaz bağlantıyı açamadı.');
    }
  }

  return (
    <Modal visible={!!shop} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps so a tap on the card does not close it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {shop && (
            <>
              <View style={styles.head}>
                <View style={styles.headIcon}>
                  <Icon name="shop" size={22} color={colors.brand} />
                </View>
                <View style={styles.headText}>
                  <Text variant="micro" color="brand">
                    petshop
                  </Text>
                  <Text variant="heading">{shop.name}</Text>
                </View>
              </View>
              {shop.address && <Row icon="pin" text={shop.address} />}
              {shop.opening_hours && <Row icon="clock" text={shop.opening_hours} />}
              {shop.phone && (
                <Row
                  icon="phone"
                  text={shop.phone}
                  action="Ara"
                  onPress={() => open(telHref(shop.phone!))}
                />
              )}
              {shop.website_url && (
                <Row
                  icon="link"
                  text={linkLabel(shop.website_url)}
                  action="Aç"
                  onPress={() => open(shop.website_url!)}
                />
              )}
              <Button
                title="Kapat"
                variant="ghost"
                onPress={onClose}
                fullWidth
                style={styles.close}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  text,
  action,
  onPress,
}: {
  icon: IconName;
  text: string;
  action?: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const body = (
    <>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={colors.brand} />
      </View>
      <Text variant="body" color={onPress ? 'text' : 'textBody'} style={styles.rowText}>
        {text}
      </Text>
      {action && (
        <Text variant="button" color="brand">
          {action}
        </Text>
      )}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${text}`}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
    ...shadow.modal,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  headIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  headText: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  rowPressed: { backgroundColor: c.brandTint },
  rowIcon: { marginRight: spacing.md },
  rowText: { flex: 1, marginRight: spacing.sm },
  close: { marginTop: spacing.sm },
}));
