import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  acceptFriendRequest,
  fetchUserProfile,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
} from '../api/users';
import { sortBadges } from '../badges';
import BadgeCatalogModal from '../components/BadgeCatalogModal';
import LevelBar from '../components/LevelBar';
import RecentComments from '../components/RecentComments';
import {
  BadgeBlock,
  CarerGallery,
  FriendshipButton,
  ProfileHeader,
  ProfileStats,
  useCaredAnimals,
} from '../components/profile';
import { LoadingState, Screen } from '../components/ui';
import { makeStyles, spacing } from '../theme';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Someone else's profile. Same skeleton as your own (owner, 2026-09-11):
 * header, stats, level bar, badges, the carer gallery, the comment bubbles —
 * all from components/profile, so the two cannot drift apart again. The only
 * difference is the header's top-right, where one friendship button stands
 * in for bell / arkadaşlar / ayarlar.
 */
export default function PublicProfileScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { userId } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  // The profile brings the first few cared-for animals; the gallery pages
  // through the rest as it is scrolled.
  const cared = useCaredAnimals(userId);
  const resetAnimals = cared.reset;
  const [busy, setBusy] = useState(false);
  const [catalogVisible, setCatalogVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchUserProfile(userId);
      setProfile(data);
      resetAnimals({ animals: data.animals, total: data.animalCount ?? data.animals.length });
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.message ?? 'Bilinmeyen hata');
    }
  }, [userId, resetAnimals]);

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

  // "Öne çıkan" is a claim about a CHOICE this person made. Without one we
  // still show their strongest three, but under a heading that does not put
  // words in their mouth (review finding).
  const hasFeatured = (profile.featuredBadges?.length ?? 0) > 0;
  const displayBadges = hasFeatured
    ? profile.featuredBadges
    : sortBadges(profile.badges.filter((b) => b.tier)).slice(0, 3);

  return (
    <Screen scroll>
      <ProfileHeader
        avatarUrl={profile.avatar_url}
        name={profile.name}
        secondary={`${formatDate(profile.created_at)} tarihinde katıldı`}
        demo={profile.is_demo === true}
        actions={
          <FriendshipButton
            status={profile.friendshipStatus}
            busy={busy}
            onAdd={() => runAction(() => sendFriendRequest(userId), 'Gönderilemedi')}
            onAccept={() =>
              profile.friendshipId != null &&
              runAction(() => acceptFriendRequest(profile.friendshipId!), 'Kabul edilemedi')
            }
            onRemove={() =>
              profile.friendshipId != null &&
              runAction(() => removeFriendship(profile.friendshipId!), 'İşlem başarısız')
            }
          />
        }
      />

      <ProfileStats
        points={profile.points?.total ?? 0}
        rank={profile.rank}
        level={profile.level?.level ?? 1}
        demo={profile.is_demo === true}
        onOpenLeaderboard={() => navigation.push('Leaderboard')}
      />

      <View style={styles.levelCard}>
        <LevelBar level={profile.level} points={profile.points?.total ?? 0} />
      </View>

      <BadgeBlock
        title={hasFeatured ? 'Öne çıkan rozetleri' : 'Rozetleri'}
        actionLabel="tümü"
        onAction={() => setCatalogVisible(true)}
        badges={displayBadges}
        emptyText="Henüz rozet kazanmamış."
      />

      <CarerGallery
        style={styles.sectionTop}
        title="Bakım verdiği hayvanlar"
        animals={cared.animals}
        total={cared.total}
        loadingMore={cared.loadingMore}
        loadFailed={cared.loadFailed}
        onEndReached={cared.loadMore}
        onOpenAnimal={(animalId) => navigation.push('AnimalProfile', { animalId })}
        emptyText="Henüz bir hayvana bakım vermiyor."
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
  // Matches your own profile's level bar so the two read as one layout; the
  // badge block below brings its own hairline and spacing.
  levelCard: { marginBottom: spacing.md },
  sectionTop: { marginTop: spacing.xl },
}));
