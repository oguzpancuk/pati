import React, { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { submitCarePhotos } from '../api/animals';
import type { PhotoAsset } from '../api/care';
import { Icon } from '../components/brand';
import { Button, Card, Screen, Text } from '../components/ui';
import { makeStyles, radius, spacing, useTheme } from '../theme';

const SLOTS = 2;

/**
 * "Bakım ver" (P6 item 8): two fresh photos of the animal, taken now, sent
 * to the server which screens them and compares them with the animal's
 * own gallery. A match makes the user a carer — the profile reloads on
 * focus and shows the carer view. A miss keeps the photos on screen so a
 * slot can be retaken; a wrong species clears the refused slots.
 */
export default function CarePhotoScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { animalId, species, name } = route.params as {
    animalId: number;
    species: 'cat' | 'dog';
    name?: string | null;
  };
  const [photos, setPhotos] = useState<(PhotoAsset | null)[]>([null, null]);
  const [sending, setSending] = useState(false);
  const animalWord = species === 'dog' ? 'köpeğin' : 'kedinin';
  const displayName = name ?? (species === 'dog' ? 'Köpek' : 'Kedi');

  async function takePhoto(slot: number) {
    try {
      let result = await launchCamera({ mediaType: 'photo', saveToPhotos: false });
      // Simulators have no camera; the gallery stands in during development
      // (the same fallback the map's drop flow uses). Never on a device.
      if (__DEV__ && result.errorCode === 'camera_unavailable') {
        result = await launchImageLibrary({ mediaType: 'photo' });
      }
      if (result.didCancel) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert(
          'Fotoğraf alınamadı',
          result.errorMessage ?? result.errorCode ?? 'Bilinmeyen hata'
        );
        return;
      }
      setPhotos((prev) =>
        prev.map((p, i) =>
          i === slot ? { uri: asset.uri!, type: asset.type, fileName: asset.fileName } : p
        )
      );
    } catch (err: any) {
      Alert.alert('Fotoğraf alınamadı', err?.message ?? 'Bilinmeyen hata');
    }
  }

  async function handleSubmit() {
    const ready = photos.filter((p): p is PhotoAsset => !!p);
    if (ready.length < SLOTS) {
      Alert.alert('İki fotoğraf gerekli', `${displayName} için iki yeni fotoğraf çek.`);
      return;
    }
    setSending(true);
    try {
      const result = await submitCarePhotos(animalId, ready);
      Alert.alert(
        result.alreadyCarer ? 'Zaten bakıcısın' : 'Artık bakıcısın',
        result.alreadyCarer
          ? `${displayName} için zaten bakım veriyorsun.`
          : `${
              result.photoChecked ? 'Fotoğraflar eşleşti. ' : ''
            }${displayName} için artık yorum yazabilir, sağlık ve aşı kaydı ekleyebilirsin. Takip de ediyorsun: haberleri sana gelir.`,
        [{ text: 'Tamam', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'photoRejected' && Array.isArray(data.photoIndexes)) {
        // The refused slots empty so the retake is obvious; the reason is
        // the model's own Turkish sentence.
        const refused = new Set<number>(data.photoIndexes);
        setPhotos((prev) => prev.map((p, i) => (refused.has(i) ? null : p)));
        Alert.alert('Fotoğraf uygun görünmüyor', data.error);
      } else {
        Alert.alert(
          data?.code === 'carePhotoMismatch' ? 'Eşleşmedi' : 'Gönderilemedi',
          data?.error ?? err?.message ?? 'Bir hata oluştu'
        );
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen scroll>
      <Text variant="heading">{displayName} için bakım ver</Text>
      <Text variant="body" color="textBody" style={styles.lead}>
        {`Şu an yanındaysan ${animalWord} net göründüğü iki yeni fotoğraf çek. Fotoğraflar bu hayvanın kayıtlı fotoğraflarıyla karşılaştırılır; eşleşince bakıcısı olursun.`}
      </Text>

      <View style={styles.slots}>
        {photos.map((photo, i) => (
          <Pressable
            key={i}
            onPress={() => takePhoto(i)}
            style={[styles.slot, photo ? null : styles.slotEmpty]}
            accessibilityLabel={
              photo ? `${i + 1}. fotoğrafı yeniden çek` : `${i + 1}. fotoğrafı çek`
            }
          >
            {photo ? (
              <Image source={{ uri: photo.uri }} style={styles.slotImage} />
            ) : (
              <>
                <Icon name="camera" size={26} color={colors.brand} />
                <Text variant="captionStrong" color="brand" style={styles.slotLabel}>
                  {i + 1}. fotoğraf
                </Text>
              </>
            )}
          </Pressable>
        ))}
      </View>

      <Card variant="tinted" style={styles.note}>
        <Text variant="caption">
          Bakıcılar yorum yazabilir, görülme bildirebilir, sağlık ve aşı kaydı ekleyebilir. Sadece
          haber almak istiyorsan "takip et" yeter.
        </Text>
      </Card>

      <Button
        title="Fotoğrafları gönder"
        onPress={handleSubmit}
        loading={sending}
        disabled={sending || photos.some((p) => !p)}
        fullWidth
        style={styles.submit}
      />
      <Button title="Vazgeç" variant="ghost" onPress={() => navigation.goBack()} fullWidth />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  lead: { marginTop: spacing.sm, marginBottom: spacing.xl },
  slots: { flexDirection: 'row', gap: spacing.md },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: c.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderDashed },
  slotImage: { width: '100%', height: '100%' },
  slotLabel: { marginTop: spacing.sm },
  note: { marginTop: spacing.xl },
  submit: { marginTop: spacing.xl, marginBottom: spacing.sm },
}));
