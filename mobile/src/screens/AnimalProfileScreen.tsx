import React, { useCallback, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import {
  addAnimalComment,
  addHealthRecord,
  addVaccination,
  AnimalComment,
  AnimalDetail,
  fetchAnimal,
  fetchAnimalComments,
  HealthRecord,
  HealthRecordStatus,
  HealthRecordType,
  markHealthRecordRecovered,
  Vaccination,
} from '../api/animals';
import AdBanner from '../components/AdBanner';
import AnimalAvatar from '../components/AnimalAvatar';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ChoiceField,
  Input,
  LoadingState,
  LoadMoreButton,
  Screen,
  SectionHeader,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import { conditionsFor, VACCINE_TYPES } from '../taxonomy';
import { fonts, makeStyles, radius, spacing, useTheme } from '../theme';

const RECORD_TYPE_LABELS: Record<HealthRecordType, string> = {
  illness: 'Hastalık',
  injury: 'Yaralanma',
};

// Durum renkleri tema tonlarından: kırmızı = müdahale bekliyor, turuncu =
// sürüyor, yeşil = kapandı.
const STATUS_META: Record<
  HealthRecordStatus,
  { label: string; tone: 'danger' | 'warning' | 'success' }
> = {
  not_started: { label: 'Tedaviye başlanmadı', tone: 'danger' },
  in_treatment: { label: 'Tedavi sürüyor', tone: 'warning' },
  recovered: { label: 'İyileşti', tone: 'success' },
};

const RECORD_TYPE_OPTIONS: HealthRecordType[] = ['illness', 'injury'];

function recordLabel(record: HealthRecord): string {
  return `${RECORD_TYPE_LABELS[record.record_type]}: ${record.description}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Sohbet profilde bir özet: açılışta yalnızca son 3 yorum (profil uzamasın,
// sağlık/aşı bölümleri gömülmesin); "önceki yorumları yükle" dedikçe 20'lik
// sayfalar üste ekleniyor.
const COMMENT_PREVIEW = 3;
const COMMENT_PAGE = 20;
// Aşı ve sağlık kayıtları profille birlikte tam geliyor (kısa listeler);
// kartları uzun olduğu için (durum rozeti, "iyileşti" düğmesi) 2'den fazlası
// katlanıyor — 3 kart bile sohbeti ekranın altına itiyordu.
const RECORD_PREVIEW = 2;

export default function AnimalProfileScreen({ route }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { celebrate } = useBadgeAwards();
  const { animalId } = route.params;
  const [animal, setAnimal] = useState<AnimalDetail | null>(null);
  const [comments, setComments] = useState<AnimalComment[]>([]);
  const [draft, setDraft] = useState('');
  // Yoruma bağlanacak sağlık kaydı: "şu hastalık için ilacını verdim" gibi
  // yorumların ilgili kayda iliştirilmesini sağlar. Aşıların sohbeti yok.
  const [linkedRecord, setLinkedRecord] = useState<HealthRecord | null>(null);
  const [sending, setSending] = useState(false);

  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [recordType, setRecordType] = useState<HealthRecordType>('illness');
  const [recordDescription, setRecordDescription] = useState<string | null>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  const [vaccineModalVisible, setVaccineModalVisible] = useState(false);
  const [vaccineType, setVaccineType] = useState<string | null>(null);
  const [vaccineNote, setVaccineNote] = useState('');
  const [savingVaccine, setSavingVaccine] = useState(false);

  // Bir sağlık kaydına tıklandığında yalnızca o kayda bağlı yorumlar listelenir.
  const [logRecord, setLogRecord] = useState<HealthRecord | null>(null);
  const [logComments, setLogComments] = useState<AnimalComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [visibleVaccinations, setVisibleVaccinations] = useState(RECORD_PREVIEW);
  const [visibleRecords, setVisibleRecords] = useState(RECORD_PREVIEW);

  const load = useCallback(async () => {
    try {
      const [detail, commentPage] = await Promise.all([
        fetchAnimal(animalId),
        fetchAnimalComments(animalId, { limit: COMMENT_PREVIEW }),
      ]);
      setAnimal(detail);
      setComments(commentPage.comments);
      setCommentTotal(commentPage.total);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bilinmeyen hata');
    }
  }, [animalId]);

  // Sohbet en yeniden geriye açılıyor: son sayfa ekranda, eskiler düğmeyle.
  // Öncekiler listenin *başına* ekleniyor ki kronoloji bozulmasın.
  async function handleLoadOlderComments() {
    setLoadingOlder(true);
    try {
      const page = await fetchAnimalComments(animalId, {
        limit: COMMENT_PAGE,
        offset: comments.length,
      });
      setComments((prev) => [...page.comments, ...prev]);
      setCommentTotal(page.total);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setLoadingOlder(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    try {
      const created = await addAnimalComment(animalId, body, linkedRecord?.id);
      setDraft('');
      setLinkedRecord(null);
      await load();
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Gönderilemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSending(false);
    }
  }

  async function handleSaveRecord() {
    const description = recordDescription?.trim();
    if (!description) {
      Alert.alert('Eksik bilgi', 'Listeden seç ya da "Diğer" ile kendin yaz.');
      return;
    }
    setSavingRecord(true);
    try {
      const created = await addHealthRecord(animalId, recordType, description);
      setRecordDescription(null);
      setRecordType('illness');
      setRecordModalVisible(false);
      await load();
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSavingRecord(false);
    }
  }

  async function handleSaveVaccination() {
    const type = vaccineType?.trim();
    if (!type) {
      Alert.alert('Eksik bilgi', 'Aşı türünü seç ya da "Diğer" ile kendin yaz.');
      return;
    }
    setSavingVaccine(true);
    try {
      const created = await addVaccination(animalId, {
        vaccineType: type,
        note: vaccineNote.trim() || undefined,
      });
      setVaccineType(null);
      setVaccineNote('');
      setVaccineModalVisible(false);
      await load();
      celebrate(created);
    } catch (err: any) {
      Alert.alert('Eklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setSavingVaccine(false);
    }
  }

  async function handleOpenLog(record: HealthRecord) {
    try {
      // Kayıt sohbeti kısa (tek konu); tek sayfada tamamı yeterli.
      const data = await fetchAnimalComments(animalId, { healthRecordId: record.id, limit: 100 });
      setLogComments(data.comments);
      setLogRecord(record);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    }
  }

  function handleMarkRecovered(record: HealthRecord) {
    Alert.alert(
      'İyileşti olarak işaretle',
      `"${record.description}" kaydı kapanacak ve bu kayda artık yorum eklenemeyecek. Emin misin?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İyileşti',
          onPress: async () => {
            try {
              const updated = await markHealthRecordRecovered(animalId, record.id);
              // Yoruma bağlanmak için seçiliyse seçimi kaldır: kapanmış kayda
              // yorum gönderilemez.
              setLinkedRecord((prev) => (prev?.id === record.id ? null : prev));
              await load();
              celebrate(updated);
            } catch (err: any) {
              Alert.alert(
                'İşaretlenemedi',
                err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
              );
            }
          },
        },
      ]
    );
  }

  if (!animal) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const displayName = animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek');
  const latitude = animal.location.coordinates[1];
  const longitude = animal.location.coordinates[0];
  // İyileşmiş kayıtlar kapalı; sunucu da yorum kabul etmediği için seçilebilir
  // listede hiç göstermiyoruz.
  const openRecords = animal.healthRecords.filter((r) => r.status !== 'recovered');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Screen scroll>
        <Card style={styles.headerCard}>
          <Text variant="title">{displayName}</Text>
          <Text variant="caption">
            {animal.color ?? 'Rengi belirtilmemiş'} · {animal.breed ?? 'Türü belirtilmemiş'}
          </Text>
          {animal.markings ? (
            <Text variant="caption" style={styles.markings}>
              İşaretler: {animal.markings}
            </Text>
          ) : null}

          {animal.photos.length > 0 && (
            <ScrollView horizontal style={styles.photoList} showsHorizontalScrollIndicator={false}>
              {animal.photos.map((photo) => (
                <Image key={photo.id} source={{ uri: photo.url }} style={styles.photo} />
              ))}
            </ScrollView>
          )}
        </Card>

        <SectionHeader title="En son görüldüğü yer" style={styles.sectionTop} />
        <Text variant="caption" style={styles.seenAt}>
          {formatDate(animal.location_updated_at)}
        </Text>
        <View style={styles.miniMapWrapper}>
          <MapView
            style={styles.miniMap}
            region={{
              latitude,
              longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }}>
              <AnimalAvatar species={animal.species} breed={animal.breed} size={32} />
            </Marker>
          </MapView>
        </View>

        {/* Aşı, sağlık kaydının üstünde: "bu hayvan aşılı mı" sorusu sokakta
            hastalık geçmişinden önce geliyor (kuduz riski, yaklaşılabilir mi).
            Kartlar dokunulabilir değil — aşının sohbeti yok, tek seferlik ve
            doğrulanabilir bir olay. */}
        <SectionHeader
          title="Aşı kayıtları"
          actionLabel={animal.isCarer ? '+ Aşı ekle' : undefined}
          onAction={animal.isCarer ? () => setVaccineModalVisible(true) : undefined}
          style={styles.sectionTop}
        />
        {animal.vaccinations.length === 0 ? (
          <Card variant="flat" style={styles.block}>
            <Text variant="caption">Henüz aşı kaydı yok.</Text>
          </Card>
        ) : (
          animal.vaccinations.slice(0, visibleVaccinations).map((vaccination) => (
            <Card key={vaccination.id} variant="flat" padding="md" style={styles.block}>
              <View style={styles.recordHeader}>
                <Text variant="bodyStrong" style={styles.recordType} numberOfLines={2}>
                  {vaccination.vaccine_type}
                </Text>
                {vaccination.vet_verified && <Chip label="Veteriner onaylı" tone="success" />}
              </View>
              {vaccination.note ? (
                <Text variant="body" style={styles.recordDesc}>
                  {vaccination.note}
                </Text>
              ) : null}
              <Text variant="caption">
                {formatDate(vaccination.administered_at)} · {vaccination.recorded_by_name ?? ''}
              </Text>
              {vaccination.next_due_at ? (
                <Text variant="caption">Sonraki doz: {formatDate(vaccination.next_due_at)}</Text>
              ) : null}
            </Card>
          ))
        )}

        <LoadMoreButton
          remaining={animal.vaccinations.length - visibleVaccinations}
          onPress={() => setVisibleVaccinations(animal.vaccinations.length)}
        />

        <SectionHeader
          title="Sağlık kayıtları"
          actionLabel={animal.isCarer ? '+ Kayıt ekle' : undefined}
          onAction={animal.isCarer ? () => setRecordModalVisible(true) : undefined}
          style={styles.sectionTop}
        />
        {!animal.isCarer && (
          <Text variant="caption" style={styles.hint}>
            Sağlık kaydı ekleyebilmek için önce bu hayvana yorum yapıp bakım listene ekle.
          </Text>
        )}
        {animal.healthRecords.length === 0 ? (
          <Card variant="flat" style={styles.block}>
            <Text variant="caption">Henüz kayıt yok.</Text>
          </Card>
        ) : (
          animal.healthRecords.slice(0, visibleRecords).map((record) => {
            const status = STATUS_META[record.status];
            return (
              <Card
                key={record.id}
                variant="flat"
                padding="md"
                style={styles.block}
                onPress={() => handleOpenLog(record)}
              >
                <View style={styles.recordHeader}>
                  <Text variant="bodyStrong" style={styles.recordType} numberOfLines={2}>
                    {RECORD_TYPE_LABELS[record.record_type]}
                    {record.vet_verified ? ' · Veteriner onaylı' : ''}
                  </Text>
                  <Chip label={status.label} tone={status.tone} />
                </View>
                <Text variant="body" style={styles.recordDesc}>
                  {record.description}
                </Text>
                <Text variant="caption">
                  {record.recorded_by_name ?? ''} · {record.comment_count} yorum · dokunarak
                  kayıtları gör
                </Text>
                {record.status === 'recovered' && record.recovered_by_name && (
                  <Text variant="caption">
                    {record.recovered_by_name} iyileşti olarak işaretledi
                  </Text>
                )}
                {animal.isCarer && record.status !== 'recovered' && (
                  <Button
                    title="İyileşti"
                    size="sm"
                    variant="success"
                    onPress={() => handleMarkRecovered(record)}
                    icon={<Icon name="check" size={15} color={colors.textOnBrand} />}
                    style={styles.recoverButton}
                  />
                )}
              </Card>
            );
          })
        )}

        <LoadMoreButton
          remaining={animal.healthRecords.length - visibleRecords}
          onPress={() => setVisibleRecords(animal.healthRecords.length)}
        />

        <SectionHeader title="Sohbet" style={styles.sectionTop} />
        <LoadMoreButton
          remaining={commentTotal - comments.length}
          loading={loadingOlder}
          onPress={handleLoadOlderComments}
          label="Önceki yorumları yükle"
          style={styles.olderComments}
        />
        {comments.length === 0 ? (
          <Card variant="flat" style={styles.block}>
            <Text variant="caption">Henüz yorum yok. İlk yorumu sen yap.</Text>
          </Card>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              <Avatar uri={comment.avatar_url} name={comment.user_name} size={34} />
              <View style={styles.commentBody}>
                <View style={styles.commentHead}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.commentAuthor}>
                    {comment.user_name}
                  </Text>
                  <Text variant="micro">{formatDate(comment.created_at)}</Text>
                </View>
                {comment.health_record_type && (
                  <Text variant="captionStrong" color="brand" style={styles.commentTag}>
                    {RECORD_TYPE_LABELS[comment.health_record_type]}:{' '}
                    {comment.health_record_description}
                  </Text>
                )}
                <Text variant="body">{comment.body}</Text>
              </View>
            </View>
          ))
        )}
      </Screen>

      <View style={styles.composer}>
        {openRecords.length > 0 && (
          <ScrollView
            horizontal
            style={styles.tagRow}
            contentContainerStyle={styles.tagRowContent}
            showsHorizontalScrollIndicator={false}
          >
            <Chip label="Genel" selected={!linkedRecord} onPress={() => setLinkedRecord(null)} />
            {openRecords.map((record) => (
              <Chip
                key={record.id}
                label={recordLabel(record)}
                selected={linkedRecord?.id === record.id}
                onPress={() => setLinkedRecord(record)}
              />
            ))}
          </ScrollView>
        )}
        <View style={styles.composerRow}>
          <TextInput
            style={styles.composerInput}
            placeholder="Yorum yaz…"
            placeholderTextColor={colors.textSubtle}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Button
            title="Gönder"
            size="sm"
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            loading={sending}
          />
        </View>
      </View>

      <Modal visible={recordModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text variant="heading" style={styles.modalTitle}>
              Sağlık kaydı ekle
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.chipRow}>
                {RECORD_TYPE_OPTIONS.map((option) => (
                  <Chip
                    key={option}
                    label={RECORD_TYPE_LABELS[option]}
                    selected={recordType === option}
                    onPress={() => {
                      setRecordType(option);
                      // Başlık listesi tipe göre değişiyor; hastalıktan
                      // yaralanmaya geçince eski seçim anlamsız kalıyor.
                      setRecordDescription(null);
                    }}
                  />
                ))}
              </View>
              <ChoiceField
                label={recordType === 'illness' ? 'HASTALIK' : 'YARALANMA'}
                options={conditionsFor(recordType)}
                value={recordDescription}
                onChange={setRecordDescription}
                otherPlaceholder="Ne olduğunu kısaca yaz"
                maxLength={200}
              />

              {/* Hastalık/yaralanma kaydı girenler veteriner arayışında
                  olabiliyor; reklam bu yüzden burada duruyor. */}
              <AdBanner slot="vet_health_record" visible={recordModalVisible} />
            </ScrollView>
            <Button
              title="Kaydet"
              onPress={handleSaveRecord}
              loading={savingRecord}
              fullWidth
              style={styles.modalPrimary}
            />
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => setRecordModalVisible(false)}
              disabled={savingRecord}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={vaccineModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text variant="heading" style={styles.modalTitle}>
              Aşı kaydı ekle
            </Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <ChoiceField
                label="AŞI TÜRÜ"
                options={VACCINE_TYPES}
                value={vaccineType}
                onChange={setVaccineType}
                otherPlaceholder="Örn. Lösemi aşısı"
              />
              <Input
                label="NOT (İSTEĞE BAĞLI)"
                value={vaccineNote}
                onChangeText={setVaccineNote}
                placeholder="Örn. Belediye ekibi yaptı, kulak küpesi takıldı"
                multiline
              />
              <AdBanner slot="vet_health_record" visible={vaccineModalVisible} />
            </ScrollView>
            <Button
              title="Kaydet"
              onPress={handleSaveVaccination}
              loading={savingVaccine}
              fullWidth
              style={styles.modalPrimary}
            />
            <Button
              title="Vazgeç"
              variant="ghost"
              onPress={() => setVaccineModalVisible(false)}
              disabled={savingVaccine}
              fullWidth
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!logRecord} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text variant="heading" style={styles.modalTitle}>
              {logRecord ? recordLabel(logRecord) : ''}
            </Text>
            <ScrollView style={styles.modalScroll}>
              {logComments.length === 0 ? (
                <Text variant="caption">
                  Bu kayıtla ilgili henüz yorum yok. Sohbette bu kaydı seçerek yorum yapabilirsin.
                </Text>
              ) : (
                logComments.map((comment) => (
                  <View key={comment.id} style={styles.logRow}>
                    <View style={styles.commentHead}>
                      <Text variant="bodyStrong" numberOfLines={1} style={styles.commentAuthor}>
                        {comment.user_name}
                      </Text>
                      <Text variant="micro">{formatDate(comment.created_at)}</Text>
                    </View>
                    <Text variant="body">{comment.body}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <Button
              title="Kapat"
              onPress={() => setLogRecord(null)}
              fullWidth
              style={styles.modalPrimary}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  olderComments: { marginBottom: spacing.sm },
  flex: { flex: 1, backgroundColor: c.background },
  headerCard: { marginBottom: spacing.sm },
  markings: { marginTop: spacing.xs },
  photoList: { marginTop: spacing.lg },
  photo: {
    width: 124,
    height: 124,
    borderRadius: radius.md,
    marginRight: spacing.sm,
    backgroundColor: c.skeleton,
  },
  sectionTop: { marginTop: spacing.xl },
  seenAt: { marginTop: -spacing.sm, marginBottom: spacing.sm },
  hint: { marginBottom: spacing.md },
  miniMapWrapper: {
    height: 168,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  miniMap: { flex: 1 },
  block: { marginBottom: spacing.sm },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  recordType: { flexShrink: 1 },
  recordDesc: { marginTop: spacing.xs },
  recoverButton: { marginTop: spacing.md },
  commentRow: { flexDirection: 'row', marginBottom: spacing.lg },
  commentBody: { flex: 1, marginLeft: spacing.md },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  commentAuthor: { flexShrink: 1 },
  commentTag: { marginTop: 2, marginBottom: 2 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: c.border,
    padding: spacing.md,
    backgroundColor: c.surface,
  },
  tagRow: { marginBottom: spacing.sm },
  tagRowContent: { gap: spacing.sm, paddingRight: spacing.sm },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    maxHeight: 100,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: c.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.modal,
  },
  modalTitle: { marginBottom: spacing.lg },
  modalScroll: { flexGrow: 0 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 84,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: c.text,
  },
  modalPrimary: { marginTop: spacing.lg },
  logRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
}));
