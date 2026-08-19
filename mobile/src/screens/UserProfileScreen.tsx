import React, { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';
import { useBadgeAwards } from '../context/BadgeAwardContext';
import {
  acceptFriendRequest,
  fetchMe,
  fetchMyFriendships,
  fetchUserAnimals,
  FriendshipEntry,
  FriendshipsResponse,
  Me,
  ProfileAnimal,
  removeFriendship,
  setAvatarKey,
  setFeaturedBadges,
  uploadAvatar,
} from '../api/users';
import { badgeProgressText, badgeTitle } from '../badges';
import { mergeById } from '../paging';
import AnimalAvatar from '../components/AnimalAvatar';
import BadgeCatalogModal from '../components/BadgeCatalogModal';
import { AvatarPickerModal } from '../components/avatars';
import { BadgeSymbol } from '../components/badges';
import LevelBar from '../components/LevelBar';
import StatStrip from '../components/StatStrip';
import DeleteAccountLink from '../components/DeleteAccountModal';
import RecentComments from '../components/RecentComments';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  LoadingState,
  LoadMoreButton,
  Screen,
  SectionHeader,
  Text,
} from '../components/ui';
import { Icon } from '../components/brand';
import { brand, makeStyles, radius, spacing, useTheme, useThemeMode, type ThemeMode } from '../theme';

// The profile is a summary screen: 3 rows per section (same as comments),
// the rest in pages of 20 via "show more".
const PROFILE_PREVIEW = 3;
const PROFILE_PAGE = 20;

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'sistem' },
  { key: 'light', label: 'açık' },
  { key: 'dark', label: 'koyu' },
];

export default function UserProfileScreen({ navigation }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { mode, setMode } = useThemeMode();
  const { logout } = useAuth();
  const { checkPending } = useBadgeAwards();
  const [me, setMe] = useState<Me | null>(null);
  const [myAnimals, setMyAnimals] = useState<ProfileAnimal[]>([]);
  const [animalTotal, setAnimalTotal] = useState(0);
  const [loadingMoreAnimals, setLoadingMoreAnimals] = useState(false);
  // The friend list arrives in one request (it's short); revealed piecewise
  // client-side to keep the profile lean.
  const [visibleFriends, setVisibleFriends] = useState(PROFILE_PREVIEW);
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const [meData, animalPage, friendshipsData] = await Promise.all([
        fetchMe(),
        fetchUserAnimals('me', PROFILE_PREVIEW, 0),
        fetchMyFriendships(),
      ]);
      setMe(meData);
      setMyAnimals(animalPage.animals);
      setAnimalTotal(animalPage.total);
      setFriendships(friendshipsData);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err?.response?.data?.error ?? err?.message ?? 'Profil yüklenemedi');
    }
  }, []);

  async function handleLoadMoreAnimals() {
    setLoadingMoreAnimals(true);
    try {
      const page = await fetchUserAnimals('me', PROFILE_PAGE, myAnimals.length);
      setMyAnimals((prev) => mergeById(prev, page.animals));
      setAnimalTotal(page.total);
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setLoadingMoreAnimals(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
      // Badges possibly earned while the app was closed are caught here.
      checkPending();
    }, [load, checkPending])
  );

  async function handlePickPhoto() {
    setAvatarPickerVisible(false);
    const result = await launchImageLibrary({ mediaType: 'photo' });
    const asset = result.assets?.[0];
    if (result.didCancel || !asset?.uri) return;

    setUploading(true);
    try {
      const updated = await uploadAvatar({
        uri: asset.uri,
        type: asset.type,
        fileName: asset.fileName,
      });
      // Merged into the current profile instead of swapped in wholesale:
      // even with a missing field the screen stays renderable.
      setMe((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err: any) {
      Alert.alert('Yüklenemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setUploading(false);
    }
  }

  async function handlePickAvatar(key: string) {
    setUploading(true);
    try {
      const updated = await setAvatarKey(key);
      setMe((prev) => (prev ? { ...prev, ...updated } : updated));
      setAvatarPickerVisible(false);
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveFeatured(keys: string[]) {
    try {
      await setFeaturedBadges(keys);
      await load();
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
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

  // Being able to sign out even without profile data is critical: otherwise
  // an invalid session locks you inside the app.
  if (!me) {
    return (
      <Screen edges={['top']}>
        {loadError ? (
          <EmptyState
            emoji="😿"
            title="Profil yüklenemedi"
            description={loadError}
            actionTitle="Tekrar dene"
            onAction={load}
          />
        ) : (
          <LoadingState />
        )}
        {loadError ? <Button title="Çıkış yap" variant="ghost" onPress={logout} fullWidth /> : null}
      </Screen>
    );
  }

  const featured = me.featuredBadges ?? [];
  const incoming = friendships?.incomingRequests ?? [];
  const friends = friendships?.friends ?? [];

  return (
    <Screen edges={['top']} scroll>
      {/* Header (handoff 3d): avatar + name + email + the orange micro label
          that opens the avatar picker. No card — it sits on white. */}
      <View style={styles.header}>
        <Pressable onPress={() => setAvatarPickerVisible(true)} disabled={uploading}>
          <Avatar uri={me.avatar_url} name={me.name} size={60} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="title" numberOfLines={1}>
            {me.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {me.email}
          </Text>
          <Pressable onPress={() => setAvatarPickerVisible(true)} disabled={uploading}>
            <Text variant="micro" color="brand" style={styles.avatarHint}>
              {uploading ? 'kaydediliyor…' : 'dokun, avatarını seç'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Stat strip: points / rank / level — the rank cell opens the board. */}
      <StatStrip
        style={styles.statStrip}
        stats={[
          { value: String(me.points?.total ?? 0), label: 'puan' },
          {
            value: me.rank ? `${me.rank.rank}. / ${me.rank.totalUsers}` : '—',
            label: 'sıra',
            onPress: () => navigation.navigate('Leaderboard'),
          },
          { value: String(me.level?.level ?? 1), label: 'seviye' },
        ]}
      />

      <View style={styles.levelCard}>
        <LevelBar level={me.level} points={me.points?.total ?? 0} />
      </View>

      <SectionHeader
        title="Öne çıkan rozetlerim"
        actionLabel="seç / tümü"
        onAction={() => setCatalogVisible(true)}
      />
      {featured.length === 0 ? (
        <Card variant="flat" onPress={() => setCatalogVisible(true)} style={styles.block}>
          <Text variant="caption">
            Henüz rozet seçmedin. Profilinde gösterilecek 3 rozeti seçmek için dokun.
          </Text>
        </Card>
      ) : (
        <View style={styles.badgeRow}>
          {featured.map((badge) => (
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

      <AvatarPickerModal
        visible={avatarPickerVisible}
        currentValue={me.avatar_url}
        onClose={() => setAvatarPickerVisible(false)}
        onSelect={handlePickAvatar}
        onUploadPhoto={handlePickPhoto}
        saving={uploading}
      />

      <BadgeCatalogModal
        visible={catalogVisible}
        onClose={() => setCatalogVisible(false)}
        badges={me.badges}
        selectable
        featuredKeys={featured.map((b) => b.key)}
        onSaveFeatured={handleSaveFeatured}
      />

      <SectionHeader title="Bakım verdiğim hayvanlar" style={styles.sectionTop} />
      {myAnimals.length === 0 ? (
        <Card variant="flat" style={styles.block}>
          <Text variant="caption">Henüz bir hayvana bakım vermiyorsun.</Text>
        </Card>
      ) : (
        myAnimals.map((animal) => (
          <Card
            key={animal.id}
            variant="flat"
            padding="md"
            style={styles.animalRow}
            onPress={() => navigation.navigate('AnimalProfile', { animalId: animal.id })}
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
        remaining={animalTotal - myAnimals.length}
        loading={loadingMoreAnimals}
        onPress={handleLoadMoreAnimals}
      />

      <View style={styles.sectionTop}>
        <RecentComments
          comments={me.recentComments ?? []}
          total={me.commentCount ?? 0}
          title="Son yorumlarım"
          emptyText="Henüz yorum yapmadın."
          onSeeAll={() => navigation.navigate('UserComments', { userId: 'me' })}
          onOpenAnimal={(animalId) => navigation.navigate('AnimalProfile', { animalId })}
        />
      </View>

      <SectionHeader
        title="Arkadaşlarım"
        actionLabel="arkadaş bul"
        onAction={() => navigation.navigate('FindFriends')}
        style={styles.sectionTop}
      />

      {incoming.length > 0 && (
        <>
          <Text variant="micro" style={styles.subLabel}>
            gelen istekler
          </Text>
          {incoming.map((entry) => (
            <Card key={entry.friendship_id} variant="flat" padding="md" style={styles.block}>
              <Pressable onPress={() => navigation.navigate('PublicProfile', { userId: entry.id })}>
                <Text variant="bodyStrong">{entry.name}</Text>
              </Pressable>
              <View style={styles.friendActions}>
                <Button title="Kabul et" size="sm" onPress={() => handleAccept(entry)} />
                <Button
                  title="Reddet"
                  size="sm"
                  variant="ghost"
                  onPress={() => handleRemove(entry)}
                />
              </View>
            </Card>
          ))}
        </>
      )}

      {friends.length === 0 ? (
        <Card variant="flat" style={styles.block}>
          <Text variant="caption">Henüz arkadaşın yok.</Text>
        </Card>
      ) : (
        friends.slice(0, visibleFriends).map((item) => (
          <Card
            key={item.friendship_id}
            variant="flat"
            padding="md"
            style={styles.friendRow}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
          >
            <Avatar uri={item.avatar_url} name={item.name} size={36} />
            <Text variant="bodyStrong" style={styles.friendName} numberOfLines={1}>
              {item.name}
            </Text>
            <Icon name="chevronRight" size={18} color={colors.textSubtle} />
          </Card>
        ))
      )}
      <LoadMoreButton
        remaining={friends.length - visibleFriends}
        onPress={() => setVisibleFriends((n) => n + PROFILE_PAGE)}
      />

      <SectionHeader title="Görünüm" style={styles.sectionTop} />
      <View style={styles.themeRow}>
        {THEME_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={mode === option.key}
            onPress={() => setMode(option.key)}
          />
        ))}
      </View>

      <Pressable onPress={logout} style={styles.logout} accessibilityRole="button">
        <Text variant="captionStrong" color="textSubtle" center>
          çıkış yap
        </Text>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL(brand.legalUrl).catch(() => {})}
        style={styles.legal}
        accessibilityRole="link"
      >
        <Text variant="caption" color="textSubtle" center>
          gizlilik ve kullanım koşulları
        </Text>
      </Pressable>
      <DeleteAccountLink />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  headerText: { flex: 1, marginLeft: spacing.lg },
  avatarHint: { marginTop: spacing.sm - 2 },
  statStrip: { marginBottom: spacing.md },
  levelCard: { marginBottom: spacing.xl },
  sectionTop: { marginTop: spacing.xl },
  block: { marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', gap: spacing.sm },
  badgeCard: { flex: 1, alignItems: 'center' },
  badgeSymbol: { marginBottom: spacing.xs },
  badgeStreak: { marginTop: 2 },
  animalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  animalText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  subLabel: { marginBottom: spacing.sm },
  friendActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  friendName: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  logout: { marginTop: spacing.xxl, alignSelf: 'center' },
  legal: { marginTop: spacing.md, marginBottom: spacing.lg, alignSelf: 'center' },
}));
