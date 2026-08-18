import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ad, AdSlot, fetchAd, recordAdClick, recordAdImpression } from '../api/ads';

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
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.8}>
      <Text style={styles.label}>Reklam</Text>
      <View style={styles.row}>
        {ad.image_url ? (
          <Image source={{ uri: ad.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>{ad.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.headline} numberOfLines={1}>
            {ad.headline ?? ad.name}
          </Text>
          {ad.body && (
            <Text style={styles.body} numberOfLines={2}>
              {ad.body}
            </Text>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 10,
    backgroundColor: '#fafafa',
    padding: 10,
    marginTop: 14,
  },
  // "Reklam" etiketi zorunlu: kullanıcı neyin içerik neyin reklam olduğunu
  // ayırt edebilmeli.
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  image: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#eee' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#dcdcdc' },
  imagePlaceholderText: { fontSize: 18, fontWeight: '700', color: '#777' },
  text: { flex: 1, marginLeft: 10 },
  headline: { fontSize: 14, fontWeight: '600' },
  body: { fontSize: 12, color: '#666', marginTop: 2 },
  chevron: { fontSize: 22, color: '#bbb', marginLeft: 6 },
});
