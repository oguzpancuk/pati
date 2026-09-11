import React, { useState } from 'react';
import { Alert, Image, Pressable, Switch, View } from 'react-native';
import { submitCarePhotos } from '../api/animals';
import type { PhotoAsset } from '../api/care';
import { capturePhoto, SAVE_TO_GALLERY_LABEL, useSaveToGallery } from '../photoCapture';
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
  const { on: saveToGallery, set: setSaveToGallery } = useSaveToGallery();
  const animalWord = species === 'dog' ? 'köpeğin' : 'kedinin';
  const displayName = name ?? (species === 'dog' ? 'Köpek' : 'Kedi');

  async function takePhoto(slot: number) {
    const result = await capturePhoto();
    if (result.status === 'cancelled') return;
    if (result.status === 'error') {
      Alert.alert('Fotoğraf alınamadı', result.message);
      return;
    }
    const photo = result.photos[0];
    setPhotos((prev) => prev.map((p, i) => (i === slot ? photo : p)));
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
      // Two codes, one remedy: `photoRejected` is the model saying it sees
      // no animal, `photoUnreadable` is the server saying it cannot decode
      // the file at all. Either way the offending slot empties so the
      // retake is obvious — without this the slot stayed filled and the
      // next send reproduced the same error (review finding).
      const refusedSlots: number[] | null = Array.isArray(data?.photoIndexes)
        ? data.photoIndexes
        : data?.code === 'photoUnreadable' && Number.isInteger(data.photoIndex)
          ? [data.photoIndex]
          : null;
      if ((data?.code === 'photoRejected' || data?.code === 'photoUnreadable') && refusedSlots) {
        const refused = new Set<number>(refusedSlots);
        setPhotos((prev) => prev.map((p, i) => (refused.has(i) ? null : p)));
        Alert.alert(
          data.code === 'photoUnreadable' ? 'Fotoğraf okunamadı' : 'Fotoğraf uygun görünmüyor',
          data.error
        );
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

      {/* Next to the slots on purpose (demo item 9): whether the photo you
          are about to take also lands in your own gallery is a decision,
          not something the app does behind your back. */}
      <View style={styles.saveRow}>
        <Switch
          value={saveToGallery}
          onValueChange={setSaveToGallery}
          trackColor={{ true: colors.brand, false: colors.border }}
          ios_backgroundColor={colors.border}
          accessibilityLabel={SAVE_TO_GALLERY_LABEL}
        />
        {/* The label is part of the target: a 20pt switch alone is under the
            44pt minimum (DESIGN §4). */}
        <Text
          variant="caption"
          style={styles.saveLabel}
          onPress={() => setSaveToGallery(!saveToGallery)}
          suppressHighlighting
        >
          {SAVE_TO_GALLERY_LABEL}
        </Text>
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
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  saveLabel: { flex: 1 },
  note: { marginTop: spacing.xl },
  submit: { marginTop: spacing.xl, marginBottom: spacing.sm },
}));
