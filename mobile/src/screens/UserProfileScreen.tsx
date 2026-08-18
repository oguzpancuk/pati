import React, { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
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
import { makeStyles, radius, spacing, useTheme, useThemeMode, type ThemeMode } from '../theme';

// Profil bir özet ekranı: her bölümden 3 satır (yorumlarla aynı), gerisi
// "daha fazla göster" ile 20'lik sayfalar.
const PROFILE_PREVIEW = 3;
const PROFILE_PAGE = 20;

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Sistem' },
  { key: 'light', label: 'Açık' },
  { key: 'dark', label: 'Koyu' },
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
  // Arkadaş listesi tek istekte geliyor (kısa); profili şişirmemek için
  // istemci tarafında parça parça açılıyor.
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
      // Uygulama kapalıyken kazanılmış olabilecek rozetler burada yakalanır.
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
      // Yanıtı doğrudan yerine koymak yerine mevcut profille birleştiriyoruz:
      // eksik bir alan gelse bile ekran render edilebilir durumda kalır.
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

  // Profil verisi gelmese bile çıkış yapabilmek kritik: aksi halde geçersiz bir
  // oturumla uygulamada kilitli kalınıyor.
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
      {/* Başlık kartı: avatar, isim, seviye çubuğu bir arada */}
      <Card style={styles.headerCard}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => setAvatarPickerVisible(true)} disabled={uploading}>
            <Avatar uri={me.avatar_url} name={me.name} size={72} />
            <View style={styles.avatarBadge}>
              <Icon name="camera" size={13} color={colors.textOnBrand} />
            </View>
          </Pressable>
          <View style={styles.headerText}>
            <Text variant="title" numberOfLines={1}>
              {me.name}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {me.email}
            </Text>
            <Text variant="micro" color="brand" style={styles.avatarHint}>
              {uploading ? 'KAYDEDİLİYOR…' : 'DOKUN, AVATARINI SEÇ'}
            </Text>
          </View>
        </View>

        <LevelBar level={me.level} points={me.points?.total ?? 0} />
      </Card>

      <Card
        variant="tinted"
        style={styles.rankCard}
        onPress={() => navigation.navigate('Leaderboard')}
      >
        <View style={styles.rankIcon}>
          <Icon name="trophy" size={22} color={colors.brand} />
        </View>
        <View style={styles.rankText}>
          <Text variant="label">SIRALAMAN</Text>
          <Text variant="heading" numberOfLines={1}>
            {me.rank ? `${me.rank.rank}. / ${me.rank.totalUsers}` : '—'}
          </Text>
        </View>
        <View style={styles.rankRight}>
          <Text variant="bodyStrong" color="brand" numberOfLines={1}>
            {me.points?.total ?? 0} puan
          </Text>
          <Icon name="chevronRight" size={18} color={colors.textSubtle} />
        </View>
      </Card>

      <SectionHeader
        title="Öne çıkan rozetlerim"
        actionLabel="Seç / tümü"
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
        actionLabel="Arkadaş bul"
        onAction={() => navigation.navigate('FindFriends')}
        style={styles.sectionTop}
      />

      {incoming.length > 0 && (
        <>
          <Text variant="label" style={styles.subLabel}>
            GELEN İSTEKLER
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

      <Button
        title="Çıkış yap"
        variant="ghost"
        onPress={logout}
        fullWidth
        icon={<Icon name="logout" size={18} color={colors.brand} />}
        style={styles.logout}
      />
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c }) => ({
  headerCard: { marginBottom: spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1, marginLeft: spacing.lg },
  avatarHint: { marginTop: spacing.xs },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.surface,
  },
  rankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  rankIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: c.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rankText: { flex: 1 },
  rankRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
  logout: { marginTop: spacing.xxl },
}));
