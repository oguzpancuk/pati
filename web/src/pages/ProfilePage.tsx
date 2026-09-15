import { useCallback, useEffect, useRef, useState } from 'react';
import { AVATAR_VARIANTS } from '@mobile/avatars';
import { patiAvatarSvg } from '@shared/avatarSvg';
import {
  acceptFriendRequest,
  fetchMyCareActions,
  fetchMyFriendships,
  fetchUserAnimals,
  FriendshipsResponse,
  MyCareAction,
  removeFriendship,
  setAvatarKey,
  setFeaturedBadges,
  setShowDemo,
  uploadAvatar,
} from '../api';
import { fetchUnreadCount } from '../api/animalSocial';
import { unreadCareAlertCount } from '../careAlertLog';
import { useAuth } from '../auth';
import { DeleteAccountLink } from '../components/DeleteAccountDialog';
import { BadgeCatalogModal, LevelBar } from '../badges';
import { useBadgeAwards } from '../badgeAwards';
import { ChangePasswordForm } from '../components/password';
import { RecentComments } from '../components/RecentComments';
import {
  BadgeBlock,
  BellIcon,
  CARED_ANIMAL_PAGE,
  CareHistorySheet,
  CareIcon,
  CarerGallery,
  FriendsSheet,
  GearIcon,
  HeaderIconButton,
  NotificationsSheet,
  ProfileHeader,
  ProfileStats,
  RowButton,
  SettingsSheet,
  useCaredAnimals,
  UsersIcon,
} from '../components/profile';
import { applyThemeMode, readThemeMode, type ThemeMode } from '../theme';
import { InstallBanner } from '../install';

// The bell polls the unread count the way the care alert is polled: on
// open, every minute while the tab is visible, and when it becomes visible.
const UNREAD_POLL_MS = 60 * 1000;

export default function ProfilePage() {
  const { me, logout, applyMe, refresh } = useAuth();
  const { checkPending } = useBadgeAwards();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [group, setGroup] = useState<'female' | 'male'>('female');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The gallery pages through the rest of the animals as it is scrolled.
  const cared = useCaredAnimals('me');
  const resetAnimals = cared.reset;
  const [careHistory, setCareHistory] = useState<MyCareAction[]>([]);
  // Total across every page, so the row-button can name the real count even
  // though the sheet's map draws at most 100 markers.
  const [careTotal, setCareTotal] = useState(0);
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  // Only one sheet is open at a time (owner, 2026-09-11: the header's
  // controls open sheets OVER the profile, never a second page).
  const [sheet, setSheet] = useState<'bell' | 'friends' | 'settings' | 'care' | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(readThemeMode());
  // The showcase (demo) world is each person's own switch (owner,
  // 2026-09-09); a missing field means on, matching the column default.
  const [demoBusy, setDemoBusy] = useState(false);
  // Server inbox rows plus the browser's own food/water alerts (careAlertLog).
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    async function poll() {
      if (document.visibilityState !== 'visible') return;
      try {
        const server = await fetchUnreadCount();
        if (alive) setUnread(server + unreadCareAlertCount());
      } catch {
        // A background count; the bell just keeps its last number.
      }
    }
    poll();
    const timer = window.setInterval(poll, UNREAD_POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const [page, fr, carePage] = await Promise.all([
        // A whole page up front: the gallery scrolls, so there is no
        // summary-sized preview to keep short.
        fetchUserAnimals('me', CARED_ANIMAL_PAGE, 0),
        fetchMyFriendships(),
        // The history map draws every marker at once; 100 covers weeks of
        // heavy use and stays a single request.
        fetchMyCareActions(100, 0),
      ]);
      resetAnimals(page);
      setFriendships(fr);
      setCareHistory(carePage.actions);
      setCareTotal(carePage.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi');
    }
  }, [resetAnimals]);

  useEffect(() => {
    load();
    // Badges earned while the tab was closed are caught here.
    checkPending();
  }, [load, checkPending]);

  if (!me) return null;

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function toggleShowDemo() {
    if (!me || demoBusy) return;
    const next = me.show_demo === false;
    setDemoBusy(true);
    // Flipped locally first so the chip answers the click; rolled back if
    // the server refuses.
    applyMe({ ...me, show_demo: next });
    try {
      await setShowDemo(next);
      await refresh();
    } catch (err) {
      applyMe({ ...me, show_demo: !next });
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setDemoBusy(false);
    }
  }

  const featured = me.featuredBadges ?? [];
  const incoming = friendships?.incomingRequests ?? [];
  const friends = friendships?.friends ?? [];

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}
      <InstallBanner />

      {/* Header (handoff 3d): avatar + name + email + orange micro label,
          with the sheet controls top-right (owner, 2026-09-11). */}
      <ProfileHeader
        avatarUrl={me.avatar_url}
        name={me.name}
        secondary={me.email}
        demo={me.is_demo === true}
        hint={busy ? 'kaydediliyor…' : 'dokun, avatarını seç'}
        onPressAvatar={() => setPickerOpen(true)}
        actions={
          <>
            {/* The bell (P6 track C): the inbox of animal events and the
                browser's care alerts, with the unread count. */}
            <HeaderIconButton label="Bildirimler" count={unread} onClick={() => setSheet('bell')}>
              <BellIcon />
            </HeaderIconButton>
            <HeaderIconButton
              label="Arkadaşlarım"
              count={incoming.length}
              onClick={() => setSheet('friends')}
            >
              <UsersIcon />
            </HeaderIconButton>
            <HeaderIconButton label="Ayarlar" onClick={() => setSheet('settings')}>
              <GearIcon />
            </HeaderIconButton>
          </>
        }
      />

      <ProfileStats
        points={me.points?.total ?? 0}
        rank={me.rank}
        level={me.level?.level ?? 1}
        demo={me.is_demo === true}
      />

      <LevelBar level={me.level} points={me.points?.total ?? 0} />

      {/* Directly under the level bar (owner, 2026-09-11): the drop history
          is one row-button now, and the sheet behind it holds the map, the
          point chooser and the record detail. */}
      <RowButton
        icon={<CareIcon type="food" />}
        label="Mama & su geçmişim"
        value={`${careTotal} kayıt`}
        onClick={() => setSheet('care')}
      />

      <BadgeBlock
        title="öne çıkan rozetlerim"
        actionLabel="seç / tümü"
        onAction={() => setCatalogOpen(true)}
        badges={featured}
        emptyText="Henüz rozet seçmedin. Profilinde gösterilecek 3 rozeti seçmek için dokun."
        emptyPressable
      />

      <CarerGallery
        title="bakım verdiğim hayvanlar"
        animals={cared.animals}
        total={cared.total}
        loadingMore={cared.loadingMore}
        loadFailed={cared.loadFailed}
        onEndReached={cared.loadMore}
        emptyText="Henüz bir hayvana bakım vermiyorsun."
      />

      <RecentComments
        comments={me.recentComments ?? []}
        total={me.commentCount ?? 0}
        title="son yorumlarım"
        emptyText="Henüz yorum yapmadın."
        seeAllTo="/yorumlarim"
      />

      {/* The header's sheets. The Notifications PAGE stays — deep links and
          push open it — and renders the same list this sheet does. */}
      <NotificationsSheet
        open={sheet === 'bell'}
        onClose={() => setSheet(null)}
        onRead={() => setUnread(0)}
      />
      <FriendsSheet
        open={sheet === 'friends'}
        onClose={() => setSheet(null)}
        incoming={incoming}
        friends={friends}
        busy={busy}
        onAccept={(entry) =>
          run(async () => {
            await acceptFriendRequest(entry.friendship_id);
            await load();
          }, 'Kabul edilemedi')
        }
        onRemove={(entry) =>
          run(async () => {
            await removeFriendship(entry.friendship_id);
            await load();
          }, 'Reddedilemedi')
        }
      />
      <SettingsSheet
        open={sheet === 'settings'}
        onClose={() => setSheet(null)}
        theme={theme}
        onSelectTheme={(mode) => {
          setTheme(mode);
          applyThemeMode(mode);
        }}
        showDemo={me.show_demo !== false}
        demoBusy={demoBusy}
        onToggleDemo={toggleShowDemo}
        onLogout={logout}
        changePassword={
          // `onChanged` is load-bearing: after a social-only account sets a
          // password, hasPassword flips and the form has to be told, or the
          // next change is refused for a missing current password.
          <ChangePasswordForm
            hasPassword={me.hasPassword !== false}
            authProviders={me.authProviders ?? []}
            onChanged={refresh}
          />
        }
        deleteAccount={<DeleteAccountLink />}
      />
      <CareHistorySheet
        open={sheet === 'care'}
        onClose={() => setSheet(null)}
        actions={careHistory}
        onDeleted={(id) => {
          setCareHistory((prev) => prev.filter((item) => item.id !== id));
          setCareTotal((prev) => Math.max(0, prev - 1));
        }}
        onReload={load}
      />

      <BadgeCatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        badges={me.badges}
        selectable
        featuredKeys={featured.map((b) => b.key)}
        onSaveFeatured={async (keys) => {
          const next = await setFeaturedBadges(keys);
          applyMe({ ...me, featuredBadges: next });
        }}
      />

      {pickerOpen && (
        <div className="backdrop" onClick={() => !busy && setPickerOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Avatarını seç</h2>
            <p className="muted">İstersen kendi fotoğrafını da yükleyebilirsin.</p>
            <div className="chiprow" style={{ justifyContent: 'center' }}>
              {(
                [
                  ['female', 'Kadın'],
                  ['male', 'Erkek'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={`chip ${group === value ? 'selected' : ''}`}
                  onClick={() => setGroup(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="avatar-grid">
              {AVATAR_VARIANTS.filter((v) => v.group === group).map((v) => {
                const selected = me.avatar_url === `pati-avatar:${v.key}`;
                return (
                  <button
                    key={v.key}
                    className={selected ? 'selected' : ''}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        applyMe(await setAvatarKey(v.key));
                        setPickerOpen(false);
                      }, 'Kaydedilemedi')
                    }
                    dangerouslySetInnerHTML={{
                      __html: patiAvatarSvg(`pati-avatar:${v.key}`, 58) ?? '',
                    }}
                  />
                );
              })}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  run(async () => {
                    applyMe(await uploadAvatar(file));
                    setPickerOpen(false);
                    await refresh();
                  }, 'Yüklenemedi');
                e.target.value = '';
              }}
            />
            <button
              className="btn secondary full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Kendi fotoğrafımı yükle
            </button>
            <button className="btn ghost full" disabled={busy} onClick={() => setPickerOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
