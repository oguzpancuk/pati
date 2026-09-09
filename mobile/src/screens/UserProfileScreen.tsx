import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Camera, MapView, MarkerView } from '@maplibre/maplibre-react-native';
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
  setShowDemo as saveShowDemo,
  uploadAvatar,
} from '../api/users';
import { deleteCareAction, fetchMyCareActions, MyCareAction } from '../api/care';
import { fetchUnreadCount } from '../api/notifications';
import { unreadCareAlertCount } from '../careAlertLog';
import { mapStyles } from '../map/styles';
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
import {
  brand,
  makeStyles,
  radius,
  spacing,
  useTheme,
  useThemeMode,
  type ThemeMode,
} from '../theme';

// The profile is a summary screen: 3 rows per section (same as comments),
// the rest in pages of 20 via "show more".
const PROFILE_PREVIEW = 3;
const PROFILE_PAGE = 20;

// Drop-history rows show the time too: whether a record is still deletable
// depends on how fresh it is, and a date alone hides that.
function formatCareDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'sistem' },
  { key: 'light', label: 'açık' },
  { key: 'dark', label: 'koyu' },
];

// The bell polls the unread count the way the care alert is polled: on
// focus and every minute while the tab is open (no push yet).
const UNREAD_POLL_MS = 60 * 1000;

export default function UserProfileScreen({ navigation, route }: any) {
  const styles = useStyles();
  const { name: themeName, colors } = useTheme();
  // Server inbox rows plus the device's own food/water alerts (careAlertLog).
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      async function poll() {
        try {
          const [server, device] = await Promise.all([fetchUnreadCount(), unreadCareAlertCount()]);
          if (alive) setUnread(server + device);
        } catch {
          // A background count; the bell just keeps its last number.
        }
      }
      poll();
      const timer = setInterval(poll, UNREAD_POLL_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [])
  );
  const { mode, setMode } = useThemeMode();
  const { logout } = useAuth();
  const { checkPending } = useBadgeAwards();
  // `show_demo` on the profile is each person's own switch for the showcase
  // world (owner, 2026-09-09); an absent field means on, matching the column
  // default. `demoBusy` holds the row while the write is in flight.
  const [me, setMe] = useState<Me | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [myAnimals, setMyAnimals] = useState<ProfileAnimal[]>([]);
  const [animalTotal, setAnimalTotal] = useState(0);
  const [loadingMoreAnimals, setLoadingMoreAnimals] = useState(false);
  const [careHistory, setCareHistory] = useState<MyCareAction[]>([]);
  // The tapped marker's detail popup: what and when (and delete, while the
  // window allows).
  const [careDetail, setCareDetail] = useState<MyCareAction | null>(null);

  // Nearby drops collapse into ONE marker with a count badge — at the
  // fitted zoom even fanned-out markers overlap, and a water drop under a
  // food drop was simply invisible (owner report: "su geçmişi gözükmüyor").
  // Tapping a multi-record marker opens a chooser first.
  const careGroups = useMemo(() => {
    const groups = new Map<string, MyCareAction[]>();
    for (const action of careHistory) {
      // ~110 m buckets: GPS scatter lands repeat drops metres apart. Known
      // limit: two drops straddling a bucket boundary still overlap; a
      // distance-based merge would fix that if it ever bites.
      const key = `${action.location.coordinates[0].toFixed(
        3
      )},${action.location.coordinates[1].toFixed(3)}`;
      groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    return [...groups.values()].map((actions) => ({
      actions,
      lng: actions[0].location.coordinates[0],
      lat: actions[0].location.coordinates[1],
    }));
  }, [careHistory]);
  // The tapped multi-record marker's chooser list.
  const [careGroup, setCareGroup] = useState<MyCareAction[] | null>(null);
  // Chooser → detail must not present the second modal while the first is
  // still dismissing (the iOS RN-modal race silently drops the second one).
  // The picked record parks here and the chooser's onDismiss opens it.
  const pendingCareDetail = useRef<MyCareAction | null>(null);
  const openCareDetailFromGroup = (action: MyCareAction) => {
    if (Platform.OS === 'ios') {
      pendingCareDetail.current = action;
      setCareGroup(null);
    } else {
      // Android modals swap synchronously and never fire onDismiss.
      setCareGroup(null);
      setCareDetail(action);
    }
  };

  // Fit the history map to every marker; a single spot gets a street-scale
  // center instead (a zero-size bounds box over-zooms).
  const careHistoryCamera = useMemo(() => {
    if (careHistory.length === 0) return { zoomLevel: 5 };
    const lngs = careHistory.map((a) => a.location.coordinates[0]);
    const lats = careHistory.map((a) => a.location.coordinates[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    if (maxLng - minLng < 1e-4 && maxLat - minLat < 1e-4) {
      return { centerCoordinate: [lngs[0], lats[0]], zoomLevel: 15 };
    }
    return {
      bounds: {
        ne: [maxLng, maxLat] as [number, number],
        sw: [minLng, minLat] as [number, number],
        paddingLeft: 28,
        paddingRight: 28,
        paddingTop: 28,
        paddingBottom: 28,
      },
    };
  }, [careHistory]);
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
      const [meData, animalPage, friendshipsData, carePage] = await Promise.all([
        fetchMe(),
        fetchUserAnimals('me', PROFILE_PREVIEW, 0),
        fetchMyFriendships(),
        // The history map draws every marker at once; 100 covers weeks of
        // heavy use and stays a single request.
        fetchMyCareActions(100, 0),
      ]);
      setMe(meData);
      setMyAnimals(animalPage.animals);
      setAnimalTotal(animalPage.total);
      setFriendships(friendshipsData);
      setCareHistory(carePage.actions);
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

  function handleDeleteCare(action: MyCareAction) {
    const label = action.action_type === 'food' ? 'mama' : 'su';
    Alert.alert('Kaydı sil', `Bu ${label} kaydı haritadan da kalkacak. Emin misin?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCareAction(action.id);
            setCareHistory((prev) => prev.filter((item) => item.id !== action.id));
            setCareDetail(null);
          } catch (err: any) {
            Alert.alert(
              'Silinemedi',
              err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu'
            );
            // The window may have expired since the list was fetched;
            // refresh so stale "sil" buttons disappear.
            await load();
          }
        },
      },
    ]);
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

  async function toggleShowDemo() {
    if (!me || demoBusy) return;
    const next = me.show_demo === false;
    setDemoBusy(true);
    // Flipped locally first so the chip answers the tap; rolled back if the
    // server refuses.
    setMe((prev) => (prev ? { ...prev, show_demo: next } : prev));
    try {
      await saveShowDemo(next);
      // Re-asserted: a focus reload can land between the optimistic flip and
      // this line and put the old value back (review finding).
      setMe((prev) => (prev ? { ...prev, show_demo: next } : prev));
    } catch (err: any) {
      setMe((prev) => (prev ? { ...prev, show_demo: !next } : prev));
      Alert.alert('Kaydedilemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setDemoBusy(false);
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

      {/* The bell (P6 track C): the inbox of animal events and the
          device's care alerts, with the unread count. */}
      <Card
        variant="flat"
        padding="md"
        style={styles.bellRow}
        onPress={() => navigation.navigate('Notifications')}
      >
        <Icon name="bell" size={20} color={colors.brand} />
        <Text variant="bodyStrong" style={styles.bellLabel}>
          Bildirimler
        </Text>
        {unread > 0 && (
          <View style={styles.bellCount}>
            <Text variant="micro" style={styles.bellCountText}>
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        )}
        <Icon name="chevronRight" size={18} color={colors.textSubtle} />
      </Card>

      {/* Stat strip: points / rank / level — the rank cell opens the board. */}
      <StatStrip
        style={styles.statStrip}
        stats={[
          { value: String(me.points?.total ?? 0), label: 'puan' },
          {
            // Rank alone; the total is on the leaderboard (the strip cell is narrow).
            value: me.rank ? `${me.rank.rank}.` : '—',
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
            <AnimalAvatar
              species={animal.species}
              breed={animal.breed}
              photoUrl={animal.cover_thumb_url}
              size={44}
            />
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

      {/* The history is a MAP, not a list (owner decision, 2026-08-31):
          every drop is a marker; tapping one opens the detail popup with
          the date (and delete, while the window allows). */}
      <SectionHeader title="Mama & su geçmişim" style={styles.sectionTop} />
      {careHistory.length === 0 ? (
        <Card variant="flat" style={styles.block}>
          <Text variant="caption">Henüz mama veya su bırakmadın.</Text>
        </Card>
      ) : (
        <View style={styles.careMapWrapper}>
          <MapView
            style={styles.careMapInner}
            mapStyle={mapStyles[themeName]}
            pitchEnabled={false}
            rotateEnabled={false}
            // The full map screen carries the required attribution.
            attributionEnabled={false}
          >
            {/* Controlled (not defaultSettings): a new drop outside the old
                bounds must re-fit the camera on refresh (review finding). */}
            <Camera {...careHistoryCamera} animationDuration={0} />
            {careGroups.map(({ actions, lng, lat }) => (
              <MarkerView
                key={`care-${actions[0].id}`}
                coordinate={[lng, lat]}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <Pressable
                  style={styles.careMarker}
                  onPress={() =>
                    actions.length === 1 ? setCareDetail(actions[0]) : setCareGroup(actions)
                  }
                >
                  <Icon
                    name={actions[0].action_type === 'food' ? 'food' : 'water'}
                    size={16}
                    color={colors.brand}
                  />
                  {actions.length > 1 && (
                    <View style={styles.careMarkerBadge}>
                      <Text variant="micro" style={styles.careMarkerBadgeText}>
                        {actions.length}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </MarkerView>
            ))}
          </MapView>
        </View>
      )}
      {/* The map draws at most 100 records (the API's page cap); a full
          page means older drops exist but aren't shown — say so. */}
      {careHistory.length === 100 && (
        <Text variant="caption" color="textSubtle" center style={styles.careCapNote}>
          Son 100 kayıt gösteriliyor.
        </Text>
      )}

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

      {/* The showcase (demo) world is each person's own choice (owner,
          2026-09-09): on by default so a new user finds a neighbourhood in
          use, off with one tap when the tour is over. */}
      <View style={styles.demoRow}>
        <View style={styles.demoText}>
          <Text variant="bodyStrong">Demo verileri</Text>
          <Text variant="caption">
            {me.show_demo === false
              ? 'Sadece gerçek kayıtlar görünüyor.'
              : 'Örnek mahalleler haritada ve listelerde görünüyor.'}
          </Text>
        </View>
        <Chip
          label={me.show_demo === false ? 'kapalı' : 'açık'}
          selected={me.show_demo !== false}
          onPress={toggleShowDemo}
        />
      </View>

      <Pressable onPress={logout} style={styles.logout} accessibilityRole="button">
        <Text variant="captionStrong" color="textSubtle" center>
          çıkış yap
        </Text>
      </Pressable>
      <Text variant="caption" color="textSubtle" center style={styles.legal}>
        <Text
          variant="caption"
          color="textSubtle"
          onPress={() => Linking.openURL(brand.privacyUrl).catch(() => {})}
        >
          gizlilik (kvkk)
        </Text>
        {'   ·   '}
        <Text
          variant="caption"
          color="textSubtle"
          onPress={() => Linking.openURL(brand.termsUrl).catch(() => {})}
        >
          kullanım koşulları
        </Text>
      </Text>
      <DeleteAccountLink
        initialOpen={!!route?.params?.deleteAccount}
        hasPassword={me?.hasPassword !== false}
        authProviders={me?.authProviders ?? []}
      />

      {/* Chooser for a marker holding several records: pick one, see its
          detail. */}
      <Modal
        visible={!!careGroup}
        transparent
        animationType="fade"
        onRequestClose={() => setCareGroup(null)}
        onDismiss={() => {
          if (pendingCareDetail.current) {
            setCareDetail(pendingCareDetail.current);
            pendingCareDetail.current = null;
          }
        }}
      >
        <Pressable style={styles.careModalBackdrop} onPress={() => setCareGroup(null)}>
          <Pressable style={styles.careModalCard} onPress={() => {}}>
            <Text variant="heading" center>
              Bu noktadaki kayıtlar
            </Text>
            {/* A busy spot can hold dozens of records; the list scrolls
                inside a capped card so "Kapat" stays reachable. */}
            <ScrollView style={styles.careGroupList}>
              {(careGroup ?? []).map((action) => (
                <Card
                  key={action.id}
                  variant="flat"
                  padding="md"
                  style={styles.careGroupRow}
                  onPress={() => openCareDetailFromGroup(action)}
                >
                  <Icon
                    name={action.action_type === 'food' ? 'food' : 'water'}
                    size={18}
                    color={colors.brand}
                  />
                  <Text variant="bodyStrong" style={styles.careGroupLabel}>
                    {action.action_type === 'food' ? 'Mama' : 'Su'}
                  </Text>
                  <Text variant="caption" color="textSubtle">
                    {formatCareDate(action.created_at)}
                  </Text>
                </Card>
              ))}
            </ScrollView>
            <Button title="Kapat" variant="ghost" onPress={() => setCareGroup(null)} fullWidth />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Drop-detail popup: where this record landed, as a static map. */}
      <Modal
        visible={!!careDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setCareDetail(null)}
      >
        <Pressable style={styles.careModalBackdrop} onPress={() => setCareDetail(null)}>
          <Pressable style={styles.careModalCard} onPress={() => {}}>
            {careDetail && (
              <>
                <Text variant="heading" center>
                  {careDetail.action_type === 'food' ? 'Mama kaydı' : 'Su kaydı'}
                </Text>
                <Text variant="caption" color="textSubtle" center style={styles.careModalDate}>
                  {formatCareDate(careDetail.created_at)}
                </Text>
                <View style={styles.careModalMap}>
                  <MapView
                    style={styles.careModalMapInner}
                    mapStyle={mapStyles[themeName]}
                    scrollEnabled={false}
                    zoomEnabled={false}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    // A static thumbnail; the full map screen carries the
                    // required OpenMapTiles/OSM attribution.
                    attributionEnabled={false}
                  >
                    <Camera
                      defaultSettings={{
                        centerCoordinate: [
                          careDetail.location.coordinates[0],
                          careDetail.location.coordinates[1],
                        ],
                        zoomLevel: 16,
                      }}
                    />
                    <MarkerView
                      coordinate={[
                        careDetail.location.coordinates[0],
                        careDetail.location.coordinates[1],
                      ]}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View style={styles.careModalMarker}>
                        <Icon
                          name={careDetail.action_type === 'food' ? 'food' : 'water'}
                          size={18}
                          color={colors.brand}
                        />
                      </View>
                    </MarkerView>
                  </MapView>
                </View>
                {/* Delete moved here with the list gone — still only inside
                    the server-computed 15-minute window. */}
                {careDetail.deletable && (
                  <Button
                    title="Sil"
                    variant="danger"
                    onPress={() => handleDeleteCare(careDetail)}
                    fullWidth
                  />
                )}
                <Button
                  title="Kapat"
                  variant="ghost"
                  onPress={() => setCareDetail(null)}
                  fullWidth
                  style={styles.careModalClose}
                />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors: c, shadow }) => ({
  bellRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  bellLabel: { flex: 1, marginLeft: spacing.md },
  bellCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    marginRight: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brand,
  },
  bellCountText: { color: c.textOnBrand },
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
  careMapWrapper: {
    height: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  careMapInner: { flex: 1 },
  careCapNote: { marginBottom: spacing.sm },
  careMarker: {
    padding: 5,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.float,
  },
  careMarkerBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  // micro's 2.5 letter-spacing adds trailing space after a lone digit and
  // shoves it off-center; zeroed so the count sits in the middle.
  careMarkerBadgeText: { color: c.textOnBrand, lineHeight: 12, letterSpacing: 0 },
  careGroupList: { marginVertical: spacing.md, maxHeight: 340 },
  careGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  careGroupLabel: { flex: 1 },
  careModalBackdrop: {
    flex: 1,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  careModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.xl,
  },
  careModalDate: { marginTop: 2 },
  careModalClose: { marginTop: spacing.xs },
  careModalMap: {
    height: 180,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginVertical: spacing.lg,
  },
  careModalMapInner: { flex: 1 },
  careModalMarker: {
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    ...shadow.float,
  },
  friendName: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  demoText: { flex: 1 },
  logout: { marginTop: spacing.xxl, alignSelf: 'center' },
  legal: { marginTop: spacing.md, marginBottom: spacing.lg, alignSelf: 'center' },
}));
