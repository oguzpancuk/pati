import React, { useCallback, useState } from 'react';
import { Alert, Button, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  acceptFriendRequest,
  fetchUserProfile,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
} from '../api/users';
import { BADGE_LABELS, CATEGORY_LABELS, TIER_EMOJI } from '../badges';

export default function PublicProfileScreen({ route }: any) {
  const { userId } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function handleAddFriend() {
    setBusy(true);
    try {
      await sendFriendRequest(userId);
      await load();
    } catch (err: any) {
      Alert.alert('Gönderilemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (!profile?.friendshipId) return;
    setBusy(true);
    try {
      await acceptFriendRequest(profile.friendshipId);
      await load();
    } catch (err: any) {
      Alert.alert('Kabul edilemedi', err?.response?.data?.error ?? 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!profile?.friendshipId) return;
    setBusy(true);
    try {
      await removeFriendship(profile.friendshipId);
      await load();
    } catch (err: any) {
      Alert.alert('İşlem başarısız', err?.response?.data?.error ?? 'Bir hata oluştu');
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
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.stat}>{profile.stats.foodCount} mama</Text>
        <Text style={styles.stat}>{profile.stats.waterCount} su</Text>
        <Text style={styles.stat}>{profile.stats.animalCount} hayvan</Text>
      </View>

      <Text style={styles.sectionTitle}>Rozetler</Text>
      <View style={styles.badgeRow}>
        {(['feeder', 'water', 'registrar'] as const).map((category) => {
          const badge = profile.badges?.[category] ?? { streakDays: 0, tier: null };
          return (
            <View key={category} style={styles.badgeCard}>
              <Text style={styles.badgeEmoji}>{badge.tier ? TIER_EMOJI[badge.tier] : '⬜'}</Text>
              <Text style={styles.badgeLabel}>
                {badge.tier ? BADGE_LABELS[category][badge.tier] : CATEGORY_LABELS[category]}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.actionArea}>
        {profile.friendshipStatus === 'none' && (
          <Button title="Arkadaş Ekle" onPress={handleAddFriend} disabled={busy} />
        )}
        {profile.friendshipStatus === 'pending_sent' && (
          <Text style={styles.meta}>İstek gönderildi, yanıt bekleniyor.</Text>
        )}
        {profile.friendshipStatus === 'pending_received' && (
          <Button title="Arkadaşlık İsteğini Kabul Et" onPress={handleAccept} disabled={busy} />
        )}
        {profile.friendshipStatus === 'friends' && (
          <Button title="Arkadaşlıktan Çık" color="#c62828" onPress={handleRemove} disabled={busy} />
        )}
      </View>
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
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 16 },
  stat: { color: '#555' },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
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
  actionArea: { alignItems: 'center' },
  meta: { color: '#555' },
});
