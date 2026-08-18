import React, { useCallback, useState } from 'react';
import {
  Alert,
  Button,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  acceptFriendRequest,
  fetchUserProfile,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
} from '../api/users';
import { badgeProgressText, badgeTitle, sortBadges, TIER_EMOJI } from '../badges';
import AnimalAvatar from '../components/AnimalAvatar';
import BadgeCatalogModal from '../components/BadgeCatalogModal';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PublicProfileScreen({ route, navigation }: any) {
  const { userId } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalogVisible, setCatalogVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchUserProfile(userId);
      setProfile(data);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function runAction(action: () => Promise<void>, errorTitle: string) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err: any) {
      Alert.alert(errorTitle, err?.response?.data?.error ?? 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  const displayBadges =
    profile.featuredBadges?.length > 0
      ? profile.featuredBadges
      : sortBadges(profile.badges.filter((b) => b.tier)).slice(0, 3);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {profile.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarPlaceholderText}>{profile.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.title}>{profile.name}</Text>
        <Text style={styles.metaSmall}>{formatDate(profile.created_at)} tarihinde katıldı</Text>
        {profile.rank && (
          <Text style={styles.rankLine}>
            Sıralama: {profile.rank.rank}. / {profile.rank.totalUsers} · {profile.points.total} puan
          </Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.stats.foodCount}</Text>
          <Text style={styles.statLabel}>Mama</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.stats.waterCount}</Text>
          <Text style={styles.statLabel}>Su</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.stats.animalCount}</Text>
          <Text style={styles.statLabel}>Kaydettiği</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{profile.friendCount}</Text>
          <Text style={styles.statLabel}>Arkadaş</Text>
        </View>
      </View>

      <View style={styles.actionArea}>
        {profile.friendshipStatus === 'none' && (
          <Button
            title="Arkadaş Ekle"
            onPress={() => runAction(() => sendFriendRequest(userId), 'Gönderilemedi')}
            disabled={busy}
          />
        )}
        {profile.friendshipStatus === 'pending_sent' && (
          <Text style={styles.meta}>İstek gönderildi, yanıt bekleniyor.</Text>
        )}
        {profile.friendshipStatus === 'pending_received' && profile.friendshipId && (
          <Button
            title="Arkadaşlık İsteğini Kabul Et"
            onPress={() =>
              runAction(() => acceptFriendRequest(profile.friendshipId!), 'Kabul edilemedi')
            }
            disabled={busy}
          />
        )}
        {profile.friendshipStatus === 'friends' && profile.friendshipId && (
          <Button
            title="Arkadaşlıktan Çık"
            color="#c62828"
            onPress={() =>
              runAction(() => removeFriendship(profile.friendshipId!), 'İşlem başarısız')
            }
            disabled={busy}
          />
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Rozetler</Text>
        <TouchableOpacity onPress={() => setCatalogVisible(true)}>
          <Text style={styles.linkText}>Tüm rozetler</Text>
        </TouchableOpacity>
      </View>
      {/* Kullanıcı öne çıkanları seçtiyse onları, seçmediyse en güçlü rozetlerini
          gösteriyoruz; boş bir alan görünmesin. */}
      <View style={styles.badgeRow}>
        {displayBadges.length === 0 ? (
          <Text style={styles.meta}>Henüz rozet kazanmamış.</Text>
        ) : (
          displayBadges.map((badge) => (
            <TouchableOpacity
              key={badge.key}
              style={styles.badgeCard}
              onPress={() => setCatalogVisible(true)}
            >
              <Text style={styles.badgeEmoji}>{badge.tier ? TIER_EMOJI[badge.tier] : '⬜'}</Text>
              <Text style={styles.badgeLabel}>{badgeTitle(badge)}</Text>
              <Text style={styles.badgeStreak}>{badgeProgressText(badge)}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <Text style={styles.sectionTitle}>Bakım Verdiği Hayvanlar</Text>
      {profile.animals.length === 0 ? (
        <Text style={styles.meta}>Henüz bir hayvana bakım vermiyor.</Text>
      ) : (
        profile.animals.map((animal) => (
          <TouchableOpacity
            key={animal.id}
            style={styles.animalRow}
            onPress={() => navigation.push('AnimalProfile', { animalId: animal.id })}
          >
            <AnimalAvatar species={animal.species} photoUrl={animal.cover_photo_url} size={44} />
            <View style={styles.animalText}>
              <Text style={styles.animalName}>
                {animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text style={styles.metaSmall}>{animal.breed ?? '-'}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      <BadgeCatalogModal
        visible={catalogVisible}
        onClose={() => setCatalogVisible(false)}
        badges={profile.badges}
      />
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 16 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: { backgroundColor: '#2e7d32', justifyContent: 'center', alignItems: 'center' },
  avatarPlaceholderText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', marginTop: 12 },
  meta: { color: '#555', marginTop: 4 },
  metaSmall: { color: '#888', fontSize: 12, marginTop: 2 },
  rankLine: { color: '#2e7d32', fontWeight: '600', marginTop: 6 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#888', fontSize: 12, marginTop: 2 },
  actionArea: { alignItems: 'center', marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkText: { color: '#2e7d32', fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginTop: 8, marginBottom: 8 },
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
  animalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  animalText: { flex: 1, marginLeft: 12 },
  animalName: { fontSize: 16, fontWeight: '600' },
  bottomSpacer: { height: 40 },
});
