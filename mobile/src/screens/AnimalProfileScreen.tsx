import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import {
  addAnimalComment,
  addHealthRecord,
  AnimalComment,
  AnimalDetail,
  fetchAnimal,
  fetchAnimalComments,
  HealthRecord,
  HealthRecordStatus,
  HealthRecordType,
  markHealthRecordRecovered,
} from '../api/animals';
import AnimalAvatar from '../components/AnimalAvatar';
import { useBadgeAwards } from '../context/BadgeAwardContext';

const RECORD_TYPE_LABELS: Record<HealthRecordType, string> = {
  illness: 'Hastalık',
  injury: 'Yaralanma',
  treatment: 'Tedavi',
  vaccination: 'Aşı',
  medication: 'İlaç',
};

const STATUS_META: Record<HealthRecordStatus, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Tedaviye başlanmadı', color: '#c62828', bg: '#ffebee' },
  in_treatment: { label: 'Tedavi sürüyor', color: '#ef6c00', bg: '#fff3e0' },
  recovered: { label: 'İyileşti', color: '#2e7d32', bg: '#e8f5e9' },
};

const RECORD_TYPE_OPTIONS: HealthRecordType[] = [
  'illness',
  'injury',
  'treatment',
  'vaccination',
  'medication',
];

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AnimalProfileScreen({ route }: any) {
  const { celebrate } = useBadgeAwards();
  const { animalId } = route.params;
  const [animal, setAnimal] = useState<AnimalDetail | null>(null);
  const [comments, setComments] = useState<AnimalComment[]>([]);
  const [draft, setDraft] = useState('');
  // Yoruma bağlanacak sağlık kaydı: "şu hastalık için ilacını verdim" gibi
  // yorumların ilgili kayda iliştirilmesini sağlar.
  const [linkedRecord, setLinkedRecord] = useState<HealthRecord | null>(null);
  const [sending, setSending] = useState(false);

  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [recordType, setRecordType] = useState<HealthRecordType>('illness');
  const [recordDescription, setRecordDescription] = useState('');
  const [savingRecord, setSavingRecord] = useState(false);

  // Bir sağlık kaydına tıklandığında yalnızca o kayda bağlı yorumlar listelenir.
  const [logRecord, setLogRecord] = useState<HealthRecord | null>(null);
  const [logComments, setLogComments] = useState<AnimalComment[]>([]);

  const load = useCallback(async () => {
    try {
      const [detail, commentData] = await Promise.all([
        fetchAnimal(animalId),
        fetchAnimalComments(animalId),
      ]);
      setAnimal(detail);
      setComments(commentData);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bilinmeyen hata');
    }
  }, [animalId]);

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
    const description = recordDescription.trim();
    if (!description) {
      Alert.alert('Eksik bilgi', 'Açıklama girmelisiniz.');
      return;
    }
    setSavingRecord(true);
    try {
      const created = await addHealthRecord(animalId, recordType, description);
      setRecordDescription('');
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

  async function handleOpenLog(record: HealthRecord) {
    try {
      const data = await fetchAnimalComments(animalId, record.id);
      setLogComments(data);
      setLogRecord(record);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    }
  }

  function handleMarkRecovered(record: HealthRecord) {
    Alert.alert(
      'İyileşti olarak işaretle',
      `"${record.description}" kaydı kapanacak ve bu kayda artık yorum eklenemeyecek. Emin misiniz?`,
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
      <View style={styles.center}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  const displayName = animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek');
  const latitude = animal.location.coordinates[1];
  const longitude = animal.location.coordinates[0];
  const openRecords = animal.healthRecords.filter((r) => r.status !== 'recovered');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={styles.container}>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.meta}>
          {animal.color ?? '-'} · {animal.breed ?? '-'}
        </Text>
        {animal.markings ? <Text style={styles.meta}>İşaretler: {animal.markings}</Text> : null}

        <ScrollView horizontal style={styles.photoList} showsHorizontalScrollIndicator={false}>
          {animal.photos.map((photo) => (
            <Image key={photo.id} source={{ uri: photo.url }} style={styles.photo} />
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>En Son Görüldüğü Konum</Text>
        <Text style={styles.metaSmall}>{formatDate(animal.location_updated_at)}</Text>
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
              <AnimalAvatar
                species={animal.species}
                photoUrl={animal.photos[0]?.url ?? null}
                size={32}
              />
            </Marker>
          </MapView>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Sağlık Kayıtları</Text>
          {animal.isCarer && (
            <Button title="Kayıt Ekle" onPress={() => setRecordModalVisible(true)} />
          )}
        </View>
        {!animal.isCarer && (
          <Text style={styles.metaSmall}>
            Sağlık kaydı ekleyebilmek için önce bu hayvana yorum yapıp bakım listenize ekleyin.
          </Text>
        )}
        {animal.healthRecords.length === 0 ? (
          <Text style={styles.meta}>Henüz kayıt yok.</Text>
        ) : (
          animal.healthRecords.map((record) => {
            const status = STATUS_META[record.status];
            return (
              <TouchableOpacity
                key={record.id}
                style={styles.recordCard}
                onPress={() => handleOpenLog(record)}
              >
                <View style={styles.recordHeader}>
                  <Text style={styles.recordType}>
                    {RECORD_TYPE_LABELS[record.record_type]}
                    {record.vet_verified ? ' · Veteriner Onaylı' : ''}
                  </Text>
                  <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                </View>
                <Text>{record.description}</Text>
                <Text style={styles.metaSmall}>
                  {record.recorded_by_name ?? ''} · {record.comment_count} yorum · dokunarak
                  kayıtları görün
                </Text>
                {record.status === 'recovered' && record.recovered_by_name && (
                  <Text style={styles.metaSmall}>
                    {record.recovered_by_name} iyileşti olarak işaretledi
                  </Text>
                )}
                {animal.isCarer && record.status !== 'recovered' && (
                  <View style={styles.recoverButton}>
                    <Button title="İyileşti" onPress={() => handleMarkRecovered(record)} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}

        <Text style={styles.sectionTitle}>Sohbet</Text>
        {comments.length === 0 ? (
          <Text style={styles.meta}>Henüz yorum yok. İlk yorumu siz yapın.</Text>
        ) : (
          comments.map((comment) => (
            <View key={comment.id} style={styles.commentRow}>
              {comment.avatar_url ? (
                <Image source={{ uri: comment.avatar_url }} style={styles.commentAvatar} />
              ) : (
                <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
                  <Text style={styles.commentAvatarText}>
                    {comment.user_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>
                  {comment.user_name}
                  <Text style={styles.metaSmall}> · {formatDate(comment.created_at)}</Text>
                </Text>
                {comment.health_record_id && comment.health_record_type && (
                  <Text style={styles.commentTag}>
                    {RECORD_TYPE_LABELS[comment.health_record_type]}:{' '}
                    {comment.health_record_description}
                  </Text>
                )}
                <Text>{comment.body}</Text>
              </View>
            </View>
          ))
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <View style={styles.composer}>
        {/* İyileşmiş kayıtlar kapalıdır; sunucu da yorum kabul etmediği için
            seçilebilir listede hiç göstermiyoruz. */}
        {openRecords.length > 0 && (
          <ScrollView horizontal style={styles.tagRow} showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.tagChip, !linkedRecord && styles.tagChipSelected]}
              onPress={() => setLinkedRecord(null)}
            >
              <Text style={[styles.tagText, !linkedRecord && styles.tagTextSelected]}>Genel</Text>
            </TouchableOpacity>
            {openRecords.map((record) => (
              <TouchableOpacity
                key={record.id}
                style={[styles.tagChip, linkedRecord?.id === record.id && styles.tagChipSelected]}
                onPress={() => setLinkedRecord(record)}
              >
                <Text
                  style={[
                    styles.tagText,
                    linkedRecord?.id === record.id && styles.tagTextSelected,
                  ]}
                >
                  {RECORD_TYPE_LABELS[record.record_type]}: {record.description}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={styles.composerRow}>
          <TextInput
            style={[styles.input, styles.composerInput]}
            placeholder="Yorum yazın..."
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Button title="Gönder" onPress={handleSend} disabled={sending || !draft.trim()} />
        </View>
      </View>

      <Modal visible={recordModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Sağlık Kaydı Ekle</Text>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.chipRow}>
                {RECORD_TYPE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.tagChip, recordType === option && styles.tagChipSelected]}
                    onPress={() => setRecordType(option)}
                  >
                    <Text style={[styles.tagText, recordType === option && styles.tagTextSelected]}>
                      {RECORD_TYPE_LABELS[option]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, styles.modalInput]}
                placeholder="Örn. Göz enfeksiyonu"
                value={recordDescription}
                onChangeText={setRecordDescription}
                multiline
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <View style={styles.modalButton}>
                <Button title="Kaydet" onPress={handleSaveRecord} disabled={savingRecord} />
              </View>
              <Button
                title="İptal"
                color="#c62828"
                onPress={() => setRecordModalVisible(false)}
                disabled={savingRecord}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!logRecord} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.logCard}>
            <Text style={styles.modalTitle}>
              {logRecord ? RECORD_TYPE_LABELS[logRecord.record_type] : ''}: {logRecord?.description}
            </Text>
            <ScrollView style={styles.logScroll}>
              {logComments.length === 0 ? (
                <Text style={styles.meta}>
                  Bu kayıtla ilgili henüz yorum yok. Sohbette bu kaydı seçerek yorum
                  yapabilirsiniz.
                </Text>
              ) : (
                logComments.map((comment) => (
                  <View key={comment.id} style={styles.logRow}>
                    <Text style={styles.commentAuthor}>
                      {comment.user_name}
                      <Text style={styles.metaSmall}> · {formatDate(comment.created_at)}</Text>
                    </Text>
                    <Text>{comment.body}</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <Button title="Kapat" onPress={() => setLogRecord(null)} />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#555', marginTop: 4 },
  metaSmall: { color: '#888', fontSize: 12, marginTop: 2 },
  photoList: { marginVertical: 16 },
  photo: { width: 120, height: 120, borderRadius: 8, marginRight: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  miniMapWrapper: {
    height: 160,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 8,
  },
  miniMap: { flex: 1 },
  recordCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  recordType: { fontWeight: '600', marginBottom: 4, flexShrink: 1 },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  statusPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  recoverButton: { marginTop: 8 },
  commentRow: { flexDirection: 'row', marginBottom: 12 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  commentAvatarPlaceholder: {
    backgroundColor: '#2e7d32',
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: { color: '#fff', fontWeight: '700' },
  commentBody: { flex: 1 },
  commentAuthor: { fontWeight: '600' },
  commentTag: {
    color: '#2e7d32',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 2,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 8,
    backgroundColor: '#fff',
  },
  tagRow: { marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tagChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  tagChipSelected: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  tagText: { color: '#333', fontSize: 12 },
  tagTextSelected: { color: '#fff', fontWeight: '600' },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    maxHeight: 100,
  },
  composerInput: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  modalScroll: { flexGrow: 0 },
  modalInput: { minHeight: 70, textAlignVertical: 'top', marginBottom: 12 },
  modalActions: { marginTop: 4 },
  modalButton: { marginBottom: 10 },
  logCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  logScroll: { marginBottom: 12 },
  logRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  bottomSpacer: { height: 24 },
});
