import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  acceptFriendRequest,
  fetchUserAnimals,
  fetchUserProfile,
  ProfileAnimal,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
} from '../api/users';
import { badgeProgressText, badgeTitle, sortBadges } from '../badges';
import AnimalAvatar from '../components/AnimalAvatar';
import BadgeCatalogModal from '../components/BadgeCatalogModal';
import { BadgeSymbol } from '../components/badges';
import LevelBar from '../components/LevelBar';
import RecentComments from '../components/RecentComments';
import {
  Avatar,
  Button,
  Card,
  Divider,
  LoadingState,
  LoadMoreButton,
  Screen,
  SectionHeader,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, spacing, useTheme } from '../theme';

// Profil özet; hayvanların ilk sayfası profille geliyor, gerisi buradan.
const ANIMAL_PAGE = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PublicProfileScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { userId } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [animals, setAnimals] = useState<ProfileAnimal[]>([]);
  const [loadingMoreAnimals, setLoadingMoreAnimals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [catalogVisible, setCatalogVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchUserProfile(userId);
      setProfile(data);
      setAnimals(data.animals);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    }
  }, [userId]);

  async function handleLoadMoreAnimals() {
    setLoadingMoreAnimals(true);
    try {
      const page = await fetchUserAnimals(userId, ANIMAL_PAGE, animals.length);
      setAnimals((prev) => [...prev, ...page.animals]);
      setProfile((prev) => (prev ? { ...prev, animalCount: page.total } : prev));
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setLoadingMoreAnimals(false);
    }
  }

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
      <Screen>
        <LoadingState label="Profil yükleniyor…" />
      </Screen>
    );
  }

  const displayBadges =
    profile.featuredBadges?.length > 0
      ? profile.featuredBadges
      : sortBadges(profile.badges.filter((b) => b.tier)).slice(0, 3);

  const stats = [
    { value: profile.stats.foodCount, label: 'Mama' },
    { value: profile.stats.waterCount, label: 'Su' },
    { value: profile.stats.animalCount, label: 'Kayıt' },
    { value: profile.friendCount, label: 'Arkadaş' },
  ];

  return (
    <Screen scroll>
      <Card style={styles.headerCard}>
        <View style={styles.headerTop}>
          <Avatar uri={profile.avatar_url} name={profile.name} size={88} />
          <Text variant="title" center style={styles.name}>
            {profile.name}
          </Text>
          <Text variant="caption" center>
            {formatDate(profile.created_at)} tarihinde katıldı
          </Text>
          {profile.rank && (
            <Text variant="captionStrong" color="brand" center style={styles.rankLine}>
              {profile.rank.rank}. / {profile.rank.totalUsers} · {profile.points.total} puan
            </Text>
          )}
        </View>

        <LevelBar level={profile.level} points={profile.points?.total ?? 0} />

        <Divider />

        <View style={styles.statsRow}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statBox}>
              <Text variant="heading">{stat.value}</Text>
              <Text variant="micro">{stat.label.toLocaleUpperCase('tr-TR')}</Text>
            </View>
          ))}
        </View>
      </Card>

      {profile.friendshipStatus === 'none' && (
        <Button
          title="Arkadaş ekle"
          onPress={() => runAction(() => sendFriendRequest(userId), 'Gönderilemedi')}
          loading={busy}
          fullWidth
          icon={<Icon name="users" size={18} color={colors.textOnBrand} />}
          style={styles.action}
        />
      )}
      {profile.friendshipStatus === 'pending_sent' && (
        <Card variant="tinted" padding="md" style={styles.action}>
          <Text variant="caption" center>
            İstek gönderildi, yanıt bekleniyor.
          </Text>
        </Card>
      )}
      {profile.friendshipStatus === 'pending_received' && profile.friendshipId && (
        <Button
          title="Arkadaşlık isteğini kabul et"
          onPress={() =>
            runAction(() => acceptFriendRequest(profile.friendshipId!), 'Kabul edilemedi')
          }
          loading={busy}
          fullWidth
          style={styles.action}
        />
      )}
      {profile.friendshipStatus === 'friends' && profile.friendshipId && (
        <Button
          title="Arkadaşlıktan çık"
          variant="secondary"
          onPress={() =>
            runAction(() => removeFriendship(profile.friendshipId!), 'İşlem başarısız')
          }
          loading={busy}
          fullWidth
          style={styles.action}
        />
      )}

      <SectionHeader
        title="Rozetler"
        actionLabel="Tüm rozetler"
        onAction={() => setCatalogVisible(true)}
      />
      {/* Kullanıcı öne çıkanları seçtiyse onları, seçmediyse en güçlü rozetlerini
          gösteriyoruz; boş bir alan görünmesin. */}
      {displayBadges.length === 0 ? (
        <Card variant="flat" style={styles.block}>
          <Text variant="caption">Henüz rozet kazanmamış.</Text>
        </Card>
      ) : (
        <View style={styles.badgeRow}>
          {displayBadges.map((badge) => (
            <Card
              key={badge.key}
              variant="flat"
              padding="md"
              style={styles.badgeCard}
              onPress={() => setCatalogVisible(true)}
            >
              <View style={styles.badgeSymbol}>
                <BadgeSymbol symbol={badge.symbol} tier={badge.tier} size={40} />
              </View>
              <Text variant="captionStrong" color="text" center numberOfLines={2}>
                {badgeTitle(badge)}
              </Text>
              <Text variant="micro" center style={styles.badgeStreak}>
                {badgeProgressText(badge)}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title="Bakım verdiği hayvanlar" style={styles.sectionTop} />
      {animals.length === 0 ? (
        <Card variant="flat" style={styles.block}>
          <Text variant="caption">Henüz bir hayvana bakım vermiyor.</Text>
        </Card>
      ) : (
        animals.map((animal) => (
          <Card
            key={animal.id}
            variant="flat"
            padding="md"
            style={styles.animalRow}
            onPress={() => navigation.push('AnimalProfile', { animalId: animal.id })}
          >
            <AnimalAvatar species={animal.species} breed={animal.breed} size={44} />
            <View style={styles.animalText}>
              <Text variant="subheading" numberOfLines={1}>
                {animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {animal.breed ?? 'Türü belirtilmemiş'}
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          </Card>
        ))
      )}
      <LoadMoreButton
        remaining={(profile.animalCount ?? animals.length) - animals.length}
        loading={loadingMoreAnimals}
        onPress={handleLoadMoreAnimals}
      />

      <View style={styles.sectionTop}>
        <RecentComments
          comments={profile.recentComments ?? []}
          total={profile.commentCount ?? 0}
          title="Son yorumları"
          emptyText="Henüz yorum yapmamış."
          onSeeAll={() =>
            navigation.push('UserComments', {
              userId: profile.id,
              name: profile.name,
            })
          }
          onOpenAnimal={(animalId) => navigation.push('AnimalProfile', { animalId })}
        />
      </View>

      <BadgeCatalogModal
        visible={catalogVisible}
        onClose={() => setCatalogVisible(false)}
        badges={profile.badges}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  headerCard: { marginBottom: spacing.lg },
  headerTop: { alignItems: 'center', marginBottom: spacing.lg },
  name: { marginTop: spacing.md },
  rankLine: { marginTop: spacing.xs },
  statsRow: { flexDirection: 'row' },
  statBox: { flex: 1, alignItems: 'center' },
  action: { marginBottom: spacing.xl },
  block: { marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  badgeCard: { flex: 1, alignItems: 'center' },
  badgeSymbol: { marginBottom: spacing.xs },
  badgeStreak: { marginTop: 2 },
  sectionTop: { marginTop: spacing.xl },
  animalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  animalText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
}));
