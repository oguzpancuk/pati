import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { launchImageLibrary } from 'react-native-image-picker';
import { LIBRARY_PICKER } from '../photoPicker';
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
import { fetchMyCareActions, MyCareAction } from '../api/care';
import { fetchUnreadCount } from '../api/notifications';
import { unreadCareAlertCount } from '../careAlertLog';
import { mergeById } from '../paging';
import BadgeCatalogModal from '../components/BadgeCatalogModal';
import { AvatarPickerModal } from '../components/avatars';
import LevelBar from '../components/LevelBar';
import DeleteAccountLink from '../components/DeleteAccountModal';
import RecentComments from '../components/RecentComments';
import { ChangePasswordForm } from '../components/password';
import {
  BadgeBlock,
  CareHistorySheet,
  CarerGallery,
  FriendsSheet,
  HeaderIconButton,
  NotificationsSheet,
  ProfileHeader,
  ProfileStats,
  RowButton,
  SettingsSheet,
} from '../components/profile';
import { Button, EmptyState, LoadingState, Screen } from '../components/ui';
import { Icon } from '../components/brand';
import { makeStyles, spacing, useTheme, useThemeMode } from '../theme';

// The profile is a summary screen: 3 rows per section (same as comments),
// the rest in pages of 20 via "show more".
const PROFILE_PREVIEW = 3;
const PROFILE_PAGE = 20;

// The bell polls the unread count the way the care alert is polled: on
// focus and every minute while the tab is open (no push yet).
const UNREAD_POLL_MS = 60 * 1000;

/**
 * Only one sheet is open at a time (owner, 2026-09-11: the header's controls
 * open sheets OVER the profile, never a second page). Kept as one value so
 * two of them can never be presented at once.
 */
type ProfileSheet = 'bell' | 'friends' | 'settings' | 'care';

export default function UserProfileScreen({ navigation, route }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
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
  // When the switch was last written, and to what. A profile reload issued
  // BEFORE that write resolves afterwards carrying the old value and puts
  // the chip back; the reload honours a newer choice instead of overwriting
  // it (review finding — the earlier re-assert only covered a narrower
  // window, and web already refetches after the write).
  const demoWrite = useRef<{ at: number; value: boolean } | null>(null);
  const [myAnimals, setMyAnimals] = useState<ProfileAnimal[]>([]);
  const [animalTotal, setAnimalTotal] = useState(0);
  const [loadingMoreAnimals, setLoadingMoreAnimals] = useState(false);
  const [careHistory, setCareHistory] = useState<MyCareAction[]>([]);
  // Total across every page, so the row-button can name the real count even
  // though the sheet's map draws at most 100 markers.
  const [careTotal, setCareTotal] = useState(0);
  // The friend list arrives in one request (it's short); the sheet reveals
  // it piecewise from there.
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogVisible, setCatalogVisible] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  // The dev/QA deep link `pati://profile?deleteAccount=1` now has to open
  // the settings sheet first: that is where account deletion lives.
  const [sheet, setSheet] = useState<ProfileSheet | null>(
    route?.params?.deleteAccount ? 'settings' : null
  );
  // The link is consumed ONCE. RN's Modal renders null while hidden, so the
  // sheet's children — DeleteAccountLink among them — remount on every gear
  // tap; reading the route param there (navigation never clears it) reopened
  // the destructive dialog each time for the rest of the session (review
  // finding).
  const [openDeleteAccount, setOpenDeleteAccount] = useState(!!route?.params?.deleteAccount);
  useEffect(() => {
    // Cleared only once `me` has arrived, because the screen renders a loading
    // state until then and the link does not exist to read this yet. By the
    // time this effect runs on that commit the link has mounted and captured
    // its own `open`, so clearing here does not close what just opened.
    if (openDeleteAccount && me) setOpenDeleteAccount(false);
  }, [openDeleteAccount, me]);

  /** A sheet is not a page: leaving it for a screen closes it first. */
  function leaveSheet(go: () => void) {
    setSheet(null);
    go();
  }

  const load = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const [meData, animalPage, friendshipsData, carePage] = await Promise.all([
        fetchMe(),
        fetchUserAnimals('me', PROFILE_PREVIEW, 0),
        fetchMyFriendships(),
        // The history map draws every marker at once; 100 covers weeks of
        // heavy use and stays a single request.
        fetchMyCareActions(100, 0),
      ]);
      // A demo-switch write that started after this request was issued is the
      // newer truth, whatever the server said when this one left.
      const pending = demoWrite.current;
      setMe(pending && pending.at > startedAt ? { ...meData, show_demo: pending.value } : meData);
      setMyAnimals(animalPage.animals);
      setAnimalTotal(animalPage.total);
      setFriendships(friendshipsData);
      setCareHistory(carePage.actions);
      setCareTotal(carePage.total);
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
    const result = await launchImageLibrary(LIBRARY_PICKER);
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
      // even with a missing field the screen stays renderable. The response
      // carries show_demo, so a newer toggle wins over it (review finding).
      setMe((prev) => (prev ? { ...prev, ...updated, ...pendingDemo() } : updated));
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
      setMe((prev) => (prev ? { ...prev, ...updated, ...pendingDemo() } : updated));
      setAvatarPickerVisible(false);
    } catch (err: any) {
      Alert.alert('Kaydedilemedi', err?.response?.data?.error ?? err?.message ?? 'Bir hata oluştu');
    } finally {
      setUploading(false);
    }
  }

  /** The demo choice this screen made, when it is newer than a response. */
  function pendingDemo() {
    return demoWrite.current ? { show_demo: demoWrite.current.value } : {};
  }

  async function toggleShowDemo() {
    if (!me || demoBusy) return;
    const next = me.show_demo === false;
    demoWrite.current = { at: Date.now(), value: next };
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
      // The write did not happen, so nothing may replay it: a reload still in
      // flight would otherwise apply the value the server refused (review
      // finding).
      demoWrite.current = null;
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
          that opens the avatar picker, with the sheet controls top-right
          (owner, 2026-09-11). No card — it sits on white. */}
      <ProfileHeader
        avatarUrl={me.avatar_url}
        name={me.name}
        secondary={me.email}
        demo={me.is_demo === true}
        hint={uploading ? 'kaydediliyor…' : 'dokun, avatarını seç'}
        onPressAvatar={uploading ? undefined : () => setAvatarPickerVisible(true)}
        actions={
          <>
            {/* The bell (P6 track C): the inbox of animal events and the
                device's care alerts, with the unread count. */}
            <HeaderIconButton label="Bildirimler" count={unread} onPress={() => setSheet('bell')}>
              <Icon name="bell" size={20} color={colors.brand} />
            </HeaderIconButton>
            <HeaderIconButton
              label="Arkadaşlarım"
              count={incoming.length}
              onPress={() => setSheet('friends')}
            >
              <Icon name="users" size={20} color={colors.brand} />
            </HeaderIconButton>
            <HeaderIconButton label="Ayarlar" onPress={() => setSheet('settings')}>
              <Icon name="settings" size={20} color={colors.brand} />
            </HeaderIconButton>
          </>
        }
      />

      <ProfileStats
        points={me.points?.total ?? 0}
        rank={me.rank}
        level={me.level?.level ?? 1}
        demo={me.is_demo === true}
        onOpenLeaderboard={() => navigation.navigate('Leaderboard')}
        counts={{
          food: me.stats?.foodCount ?? 0,
          water: me.stats?.waterCount ?? 0,
          animals: me.stats?.animalCount ?? 0,
          friends: friends.length,
        }}
      />

      <View style={styles.levelCard}>
        <LevelBar level={me.level} points={me.points?.total ?? 0} />
      </View>

      {/* Directly under the level bar (owner, 2026-09-11): the drop history
          is one row-button now, and the sheet behind it holds the map, the
          point chooser and the record detail. */}
      <RowButton
        icon="food"
        label="Mama & su geçmişim"
        value={`${careTotal} kayıt`}
        onPress={() => setSheet('care')}
      />

      <BadgeBlock
        title="Öne çıkan rozetlerim"
        actionLabel="seç / tümü"
        onAction={() => setCatalogVisible(true)}
        badges={featured}
        emptyText="Henüz rozet seçmedin. Profilinde gösterilecek 3 rozeti seçmek için dokun."
        emptyPressable
      />

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

      <CarerGallery
        style={styles.sectionTop}
        title="Bakım verdiğim hayvanlar"
        animals={myAnimals}
        total={animalTotal}
        loadingMore={loadingMoreAnimals}
        onLoadMore={handleLoadMoreAnimals}
        onOpenAnimal={(animalId) => navigation.navigate('AnimalProfile', { animalId })}
        emptyText="Henüz bir hayvana bakım vermiyorsun."
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

      {/* The header's sheets. The Notifications SCREEN stays — deep links and
          push open it — and renders the same list this sheet does. */}
      <NotificationsSheet
        visible={sheet === 'bell'}
        onClose={() => setSheet(null)}
        onOpenAnimal={(animalId) =>
          leaveSheet(() => navigation.navigate('AnimalProfile', { animalId }))
        }
        onRead={() => setUnread(0)}
      />
      <FriendsSheet
        visible={sheet === 'friends'}
        onClose={() => setSheet(null)}
        incoming={incoming}
        friends={friends}
        onAccept={handleAccept}
        onRemove={handleRemove}
        onOpenUser={(userId) => leaveSheet(() => navigation.navigate('PublicProfile', { userId }))}
        onFindFriends={() => leaveSheet(() => navigation.navigate('FindFriends'))}
      />
      <SettingsSheet
        visible={sheet === 'settings'}
        onClose={() => setSheet(null)}
        mode={mode}
        onSelectMode={setMode}
        showDemo={me.show_demo !== false}
        demoBusy={demoBusy}
        onToggleDemo={toggleShowDemo}
        onLogout={logout}
        changePassword={
          // `onChanged` is load-bearing: after a social-only account sets a
          // password, hasPassword flips and the form has to be told, or the
          // next change is refused for a missing current password.
          <ChangePasswordForm
            hasPassword={me?.hasPassword !== false}
            authProviders={me?.authProviders ?? []}
            onChanged={load}
          />
        }
        deleteAccount={
          <DeleteAccountLink
            initialOpen={openDeleteAccount}
            hasPassword={me?.hasPassword !== false}
            authProviders={me?.authProviders ?? []}
          />
        }
      />
      <CareHistorySheet
        visible={sheet === 'care'}
        onClose={() => setSheet(null)}
        actions={careHistory}
        onDeleted={(id) => {
          setCareHistory((prev) => prev.filter((item) => item.id !== id));
          setCareTotal((prev) => Math.max(0, prev - 1));
        }}
        onReload={load}
      />
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  // Small on purpose: the drop-history row sits directly under the bar,
  // and the next section's own hairline brings its spacing with it.
  levelCard: { marginBottom: spacing.md },
  sectionTop: { marginTop: spacing.xl },
}));
