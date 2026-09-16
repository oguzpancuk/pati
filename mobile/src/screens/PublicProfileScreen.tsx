import React, { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  acceptFriendRequest,
  blockUser,
  fetchUserProfile,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
  unblockUser,
} from '../api/users';
import { sortBadges } from '../badges';
import BadgeCatalogModal from '../components/BadgeCatalogModal';
import { Icon } from '../components/brand';
import LevelBar from '../components/LevelBar';
import RecentComments from '../components/RecentComments';
import { ReportSheet } from '../components/ReportSheet';
import {
  BadgeBlock,
  CarerGallery,
  FriendshipButton,
  HeaderIconButton,
  ProfileHeader,
  ProfileStats,
  useCaredAnimals,
} from '../components/profile';
import { Button, LoadingState, Screen } from '../components/ui';
import { makeStyles, spacing, useTheme } from '../theme';

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
 * difference is the header's top-right, where the friendship button and a
 * "⋯" disc (report, block — App Store guideline 1.2) stand in for bell /
 * arkadaşlar / ayarlar. Once blocked, the friendship button gives way to
 * "engellendi", which is also where the block is undone.
 */
export default function PublicProfileScreen({ route, navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { userId } = route.params;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  // The profile brings the first few cared-for animals; the gallery pages
  // through the rest as it is scrolled.
  const cared = useCaredAnimals(userId);
  const resetAnimals = cared.reset;
  const [busy, setBusy] = useState(false);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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

  // Both confirmations say what actually changes, and the unblock says what
  // does NOT come back: the friendship is asked for again, never restored.
  function confirmBlock() {
    Alert.alert(
      'Engelle',
      `${profile!.name} sana mesaj gönderemez ve arkadaşlık isteği yollayamaz; yorumlarını görmezsin. Arkadaşsanız arkadaşlık biter.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: () => runAction(() => blockUser(userId), 'Engellenemedi'),
        },
      ]
    );
  }
  function confirmUnblock() {
    Alert.alert(
      'Engeli kaldır',
      `${profile!.name} yeniden arkadaşlık isteği gönderebilir ve yorumları görünür. Arkadaşlık kendiliğinden geri gelmez.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Engeli kaldır',
          onPress: () => runAction(() => unblockUser(userId), 'Kaldırılamadı'),
        },
      ]
    );
  }
  function openMenu() {
    Alert.alert(profile!.name, undefined, [
      { text: 'Şikayet et', onPress: () => setReportOpen(true) },
      profile!.blocked
        ? { text: 'Engeli kaldır', onPress: confirmUnblock }
        : { text: 'Engelle', style: 'destructive', onPress: confirmBlock },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
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
          <>
            {profile.blocked ? (
              <Button
                title="Engellendi"
                variant="secondary"
                size="sm"
                loading={busy}
                onPress={confirmUnblock}
              />
            ) : (
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
            )}
            {/* Not on your own profile. Web redirects `/kullanici/<my id>`
                to /profil; here `pati://user/<my id>` lands on this screen,
                and the menu would offer to report and block yourself — both
                bounce with a Turkish 400, but they should not be offered
                (review finding). FriendshipButton already hides on 'self'. */}
            {profile.friendshipStatus !== 'self' && (
              <HeaderIconButton label="Diğer işlemler" onPress={openMenu}>
                <Icon name="more" size={20} color={colors.brand} />
              </HeaderIconButton>
            )}
          </>
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

      {/* Hidden rather than empty when blocked: the server stops sending
          their comments, and an empty list under this heading would read as
          "Henüz yorum yapmamış." — a statement about them that is not true
          (review finding). */}
      {!profile.blocked && (
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
      )}

      <BadgeCatalogModal
        visible={catalogVisible}
        onClose={() => setCatalogVisible(false)}
        badges={profile.badges}
      />
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={userId}
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
