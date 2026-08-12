import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import type { Animal } from '../api/animals';
import {
  acceptFriendRequest,
  fetchMe,
  fetchMyFriendships,
  FriendshipEntry,
  FriendshipsResponse,
  Me,
  removeFriendship,
  uploadAvatar,
} from '../api/users';
import { BADGE_LABELS, CATEGORY_LABELS, NEXT_TIER_THRESHOLD, TIER_EMOJI } from '../badges';

export default function UserProfileScreen({ navigation }: any) {
  const { logout } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [myAnimals, setMyAnimals] = useState<Animal[]>([]);
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [meData, animalsRes, friendshipsData] = await Promise.all([
        fetchMe(),
        apiClient.get<Animal[]>('/users/me/animals'),
        fetchMyFriendships(),
      ]);
      setMe(meData);
      setMyAnimals(animalsRes.data);
      setFriendships(friendshipsData);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error ?? err?.message ?? 'Profil yüklenemedi');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleChangeAvatar() {
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const asset = result.assets?.[0];
    if (result.didCancel || !asset?.uri) return;

    setUploading(true);
    try {
      const updated = await uploadAvatar({ uri: asset.uri, type: asset.type, fileName: asset.fileName });
      setMe(updated);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setUploading(false);
    }
  }

  async function handleAccept(entry: FriendshipEntry) {
    try {
      await acceptFriendRequest(entry.friendship_id);
      await load();
    } catch (err: any) {
      Alert.alert('Kabul edilemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    }
  }

  async function handleRemove(entry: FriendshipEntry) {
    try {
      await removeFriendship(entry.friendship_id);
      await load();
    } catch (err: any) {
      Alert.alert('İşlem başarısız', err?.response?.data?.error ?? 'Bir hata oluştu');
    }
  }

  // Profil verisi gelmese bile çıkış yapabilmek kritik: aksi halde geçersiz bir
  // oturumla uygulamada kilitli kalınıyor.
  if (!me) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{loadError ?? 'Yükleniyor...'}</Text>
        {loadError && (
          <>
            <View style={styles.retryButton}>
              <Button title="Tekrar Dene" onPress={load} />
            </View>
            <Button title="Çıkış Yap" onPress={logout} color="#c62828" />
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleChangeAvatar} disabled={uploading}>
          {me.avatar_url ? (
            <Image source={{ uri: me.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarPlaceholderText}>{me.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.avatarHint}>{uploading ? 'Yükleniyor...' : 'Fotoğrafı değiştir'}</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{me.name}</Text>
          <Text style={styles.meta}>{me.email}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Rozetlerim</Text>
      <View style={styles.badgeRow}>
        {(['feeder', 'water', 'registrar'] as const).map((category) => {
          const badge = me.badges[category];
          const nextThreshold = NEXT_TIER_THRESHOLD[badge.tier ?? 'none'];
          return (
            <View key={category} style={styles.badgeCard}>
              <Text style={styles.badgeEmoji}>{badge.tier ? TIER_EMOJI[badge.tier] : '⬜'}</Text>
              <Text style={styles.badgeLabel}>
                {badge.tier ? BADGE_LABELS[category][badge.tier] : CATEGORY_LABELS[category]}
              </Text>
              <Text style={styles.badgeStreak}>
                {Number.isFinite(nextThreshold)
                  ? `${badge.streakDays} / ${nextThreshold} gün`
                  : `${badge.streakDays} gün (en üst seviye)`}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Bakım Verdiğim Hayvanlar</Text>
      <FlatList
        data={myAnimals}
        keyExtractor={(item) => String(item.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.listRow}>
            <Text>{item.name ?? (item.species === 'cat' ? 'Kedi' : 'Köpek')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.meta}>Henüz bir hayvana bakım vermiyorsunuz.</Text>}
      />

      <View style={styles.friendsHeader}>
        <Text style={styles.sectionTitle}>Arkadaşlarım</Text>
        <Button title="Arkadaş Bul" onPress={() => navigation.navigate('FindFriends')} />
      </View>

      {friendships && friendships.incomingRequests.length > 0 && (
        <>
          <Text style={styles.subTitle}>Gelen İstekler</Text>
          {friendships.incomingRequests.map((entry) => (
            <View key={entry.friendship_id} style={styles.friendRow}>
              <TouchableOpacity
                style={styles.friendInfo}
                onPress={() => navigation.navigate('PublicProfile', { userId: entry.id })}
              >
                <Text>{entry.name}</Text>
              </TouchableOpacity>
              <View style={styles.friendActions}>
                <Button title="Kabul Et" onPress={() => handleAccept(entry)} />
                <Button title="Reddet" color="#c62828" onPress={() => handleRemove(entry)} />
              </View>
            </View>
          ))}
        </>
      )}

      <FlatList
        data={friendships?.friends ?? []}
        keyExtractor={(item) => String(item.friendship_id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.listRow}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
          >
            <Text>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.meta}>Henüz arkadaşınız yok.</Text>}
      />

      <View style={styles.logoutButton}>
        <Button title="Çıkış Yap" onPress={logout} color="#c62828" />
      </View>
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { textAlign: 'center', color: '#555', marginBottom: 16 },
  retryButton: { marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  avatarHint: { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4, width: 72 },
  headerText: { marginLeft: 16, flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#555', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 8 },
  subTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginTop: 8, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  badgeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  badgeEmoji: { fontSize: 28 },
  badgeLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  badgeStreak: { fontSize: 11, color: '#888', marginTop: 2 },
  listRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  friendsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  friendRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  friendInfo: { marginBottom: 6 },
  friendActions: { flexDirection: 'row', gap: 8 },
  logoutButton: { marginTop: 24 },
  bottomSpacer: { height: 40 },
});
