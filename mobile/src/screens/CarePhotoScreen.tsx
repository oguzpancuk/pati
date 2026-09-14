import React, { useState } from 'react';
import { Alert, Image, Pressable } from 'react-native';
import { submitCarePhotos } from '../api/animals';
import type { PhotoAsset } from '../api/care';
import { capturePhoto, SaveToGalleryRow } from '../photoCapture';
import { Icon } from '../components/brand';
import { Button, Card, Screen, Text } from '../components/ui';
import { makeStyles, radius, spacing, useTheme } from '../theme';

/**
 * "Bakım ver" (P6 item 8): one fresh photo of the animal, taken now with
 * the camera, sent to the server which screens it and compares it with the
 * animal's own gallery. A match makes the user a carer — the profile
 * reloads on focus and shows the carer view. A miss keeps the photo on
 * screen so it can be retaken; a wrong species or an unreadable file
 * clears it.
 *
 * One slot since 2026-09-14 (owner batch, C1; it was two). The server
 * still takes two for app builds already installed, but a second slot
 * would only buy a second chance at the model's verdict for two more model
 * calls, and the add-animal door already grants carer rights on one photo.
 */
export default function CarePhotoScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { animalId, species, name } = route.params as {
    animalId: number;
    species: 'cat' | 'dog';
    name?: string | null;
  };
  const [photo, setPhoto] = useState<PhotoAsset | null>(null);
  const [sending, setSending] = useState(false);
  const animalWord = species === 'dog' ? 'köpeğin' : 'kedinin';
  const displayName = name ?? (species === 'dog' ? 'Köpek' : 'Kedi');

  async function takePhoto() {
    const result = await capturePhoto();
    if (result.status === 'cancelled') return;
    if (result.status === 'error') {
      Alert.alert('Fotoğraf alınamadı', result.message);
      return;
    }
    setPhoto(result.photos[0]);
  }

  async function handleSubmit() {
    if (!photo) {
      Alert.alert('Fotoğraf gerekli', `${displayName} için yeni bir fotoğraf çek.`);
      return;
    }
    setSending(true);
    try {
      const result = await submitCarePhotos(animalId, [photo]);
      Alert.alert(
        result.alreadyCarer ? 'Zaten bakıcısın' : 'Artık bakıcısın',
        result.alreadyCarer
          ? `${displayName} için zaten bakım veriyorsun.`
          : `${
              result.photoChecked ? 'Fotoğraf eşleşti. ' : ''
            }${displayName} için artık yorum yazabilir, sağlık ve aşı kaydı ekleyebilirsin. Takip de ediyorsun: haberleri sana gelir.`,
        [{ text: 'Tamam', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      const data = err?.response?.data;
      // Two codes, one remedy: `photoRejected` is the model saying it sees
      // no animal, `photoUnreadable` is the server saying it cannot decode
      // the file at all. Either way the slot empties so the retake is
      // obvious — without this the slot stayed filled and the next send
      // reproduced the same error (review finding). With one photo sent,
      // any refusal is about that photo: no index to map.
      if (data?.code === 'photoRejected' || data?.code === 'photoUnreadable') {
        setPhoto(null);
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
        {`Şu an yanındaysan ${animalWord} net göründüğü yeni bir fotoğraf çek. Fotoğraf bu hayvanın kayıtlı fotoğraflarıyla karşılaştırılır; eşleşince bakıcısı olursun.`}
      </Text>

      <Pressable
        onPress={takePhoto}
        style={[styles.slot, photo ? null : styles.slotEmpty]}
        accessibilityRole="button"
        accessibilityLabel={photo ? 'Fotoğrafı yeniden çek' : 'Fotoğraf çek'}
      >
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.slotImage} />
        ) : (
          <>
            <Icon name="camera" size={26} color={colors.brand} />
            <Text variant="captionStrong" color="brand" style={styles.slotLabel}>
              Fotoğraf çek
            </Text>
          </>
        )}
      </Pressable>

      {/* Next to the slot on purpose (demo item 9): whether the photo you
          are about to take also lands in your own gallery is a decision,
          not something the app does behind your back. */}
      <SaveToGalleryRow style={styles.saveRow} />

      <Card variant="tinted" style={styles.note}>
        <Text variant="caption">
          Bakıcılar yorum yazabilir, görülme bildirebilir, sağlık ve aşı kaydı ekleyebilir. Sadece
          haber almak istiyorsan "takip et" yeter.
        </Text>
      </Card>

      <Button
        title="Fotoğrafı gönder"
        onPress={handleSubmit}
        loading={sending}
        disabled={sending || !photo}
        fullWidth
        style={styles.submit}
      />
      <Button title="Vazgeç" variant="ghost" onPress={() => navigation.goBack()} fullWidth />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  lead: { marginTop: spacing.sm, marginBottom: spacing.xl },
  // One slot across the width (C1): a full-width square pushed the send
  // button below the fold, and a phone photo is 4:3 anyway.
  slot: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: c.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmpty: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderDashed },
  slotImage: { width: '100%', height: '100%' },
  slotLabel: { marginTop: spacing.sm },
  saveRow: { marginTop: spacing.lg },
  note: { marginTop: spacing.xl },
  submit: { marginTop: spacing.xl, marginBottom: spacing.sm },
}));
