import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Ad, AdSlot, fetchAd, recordAdClick, recordAdImpression } from '../api/ads';
import Text from './ui/Text';
import Icon from './brand/Icon';
import { makeStyles, radius, spacing, useTheme } from '../theme';

interface Props {
  slot: AdSlot;
  /** So the banner loads only while visible: false while the popup is closed. */
  visible?: boolean;
}

/**
 * A banner showing a single ad per placement.
 *
 * When nothing is live, nothing renders — leaving an empty box would break
 * the layout. The impression is reported when the ad actually reaches the
 * screen; that keeps billing honest and advances rotation to the next brand.
 */
export default function AdBanner({ slot, visible = true }: Props) {
  const [ad, setAd] = useState<Ad | null>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  // To avoid reporting the same ad's impression twice (on React re-renders
  // or when the popup reopens).
  const reportedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setAd(null);
      reportedRef.current = null;
      return;
    }

    let cancelled = false;
    fetchAd(slot)
      .then((next) => {
        if (cancelled || !next) return;
        setAd(next);
        if (reportedRef.current !== next.id) {
          reportedRef.current = next.id;
          // If the impression report fails the ad still shows; only the
          // counter and rotation fall one step behind.
          recordAdImpression(next.id).catch(() => {});
        }
      })
      .catch(() => {
        // Ads are a secondary feature: on error the banner silently doesn't show.
      });

    return () => {
      cancelled = true;
    };
  }, [slot, visible]);

  if (!ad) return null;

  async function handlePress() {
    if (!ad) return;
    recordAdClick(ad.id).catch(() => {});
    try {
      await Linking.openURL(ad.target_url);
    } catch {
      // No warning for a link that won't open; an ad must not interrupt the flow.
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      {/* The "REKLAM" (ad) label is mandatory: users must be able to tell
          content from ads. Kept in a neutral tone away from the brand color
          so it doesn't blend with the app's own actions. */}
      <Text variant="micro" style={styles.label}>
        REKLAM
      </Text>
      <View style={styles.row}>
        {ad.image_url ? (
          <Image source={{ uri: ad.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text variant="subheading" color="textSubtle">
              {ad.name.charAt(0).toLocaleUpperCase('tr-TR')}
            </Text>
          </View>
        )}
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {ad.headline ?? ad.name}
          </Text>
          {ad.body && (
            <Text variant="caption" numberOfLines={2}>
              {ad.body}
            </Text>
          )}
        </View>
        <Icon name="chevronRight" size={18} color={colors.textSubtle} />
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  container: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    padding: spacing.md,
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.85 },
  label: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  image: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: c.skeleton,
  },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center' },
  text: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
}));
