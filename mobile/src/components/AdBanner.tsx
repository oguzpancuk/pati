import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Ad, AdSlot, fetchAd, recordAdClick, recordAdImpression } from '../api/ads';
import Text from './ui/Text';
import Icon from './brand/Icon';
import { makeStyles, radius, spacing, useTheme } from '../theme';

interface Props {
  slot: AdSlot;
  /** Bant yalnızca görünürken yüklensin diye: pop-up kapalıyken false geçilir. */
  visible?: boolean;
}

/**
 * Yerleşime göre tek bir reklam gösteren bant.
 *
 * Yayında reklam yoksa hiçbir şey çizilmez — boş bir kutu bırakmak düzeni
 * bozardı. Gösterim, reklam gerçekten ekrana geldiğinde bildirilir; bu hem
 * faturalamayı doğru tutar hem de sıradaki markaya geçişi tetikler.
 */
export default function AdBanner({ slot, visible = true }: Props) {
  const [ad, setAd] = useState<Ad | null>(null);
  const styles = useStyles();
  const { colors } = useTheme();
  // Aynı reklam için gösterimi iki kez bildirmemek adına (React yeniden render
  // ettiğinde ya da pop-up tekrar açıldığında).
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
          // Gösterim bildirimi başarısız olursa reklam yine görünür; yalnızca
          // sayaç ve rotasyon bir adım geride kalır.
          recordAdImpression(next.id).catch(() => {});
        }
      })
      .catch(() => {
        // Reklam ikincil bir özellik: hata durumunda bant sessizce görünmez.
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
      // Açılamayan bağlantı için kullanıcıyı uyarmıyoruz; reklam akışı kesmemeli.
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      {/* "REKLAM" etiketi zorunlu: kullanıcı neyin içerik neyin reklam olduğunu
          ayırt edebilmeli. Marka renginden uzak, nötr bir tonda duruyor ki
          uygulamanın kendi eylemleriyle karışmasın. */}
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
