import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AVATAR_VARIANTS } from '@mobile/avatars';
import { badgeProgressText, badgeTitle } from '@mobile/badges';
import { patiAvatarSvg } from '@shared/avatarSvg';
import {
  acceptFriendRequest,
  fetchMyCareActions,
  fetchMyFriendships,
  fetchUserAnimals,
  FriendshipsResponse,
  MyCareAction,
  ProfileAnimal,
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
import { BadgeCatalogModal, BadgeSymbol, LevelBar } from '../badges';
import { useBadgeAwards } from '../badgeAwards';
import { RecentComments } from '../components/RecentComments';
import {
  BellIcon,
  CareHistorySheet,
  CareIcon,
  CarerGallery,
  FriendsSheet,
  GearIcon,
  HeaderIconButton,
  NotificationsSheet,
  ProfileHeader,
  RowButton,
  SettingsSheet,
  UsersIcon,
} from '../components/profile';
import { mergeById } from '@mobile/paging';
import { applyThemeMode, readThemeMode, type ThemeMode } from '../theme';
import { InstallBanner } from '../install';

// The profile is a summary screen: 3 rows per section, the rest behind "show more".
const PREVIEW = 3;
const PAGE = 20;
// The bell polls the unread count the way the care alert is polled: on
// open, every minute while the tab is visible, and when it becomes visible.
const UNREAD_POLL_MS = 60 * 1000;

/** The strip opens the leaderboard — unless this account is not on it. */
function StatStrip({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  if (demo) return <div className="statstrip">{children}</div>;
  return (
    <Link to="/siralama" className="statstrip" style={{ textDecoration: 'none', color: 'inherit' }}>
      {children}
    </Link>
  );
}

export default function ProfilePage() {
  const { me, logout, applyMe, refresh } = useAuth();
  const { checkPending } = useBadgeAwards();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [group, setGroup] = useState<'female' | 'male'>('female');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animals, setAnimals] = useState<ProfileAnimal[]>([]);
  const [animalTotal, setAnimalTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
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
        fetchUserAnimals('me', PREVIEW, 0),
        fetchMyFriendships(),
        // The history map draws every marker at once; 100 covers weeks of
        // heavy use and stays a single request.
        fetchMyCareActions(100, 0),
      ]);
      setAnimals(page.animals);
      setAnimalTotal(page.total);
      setFriendships(fr);
      setCareHistory(carePage.actions);
      setCareTotal(carePage.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi');
    }
  }, []);

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

  async function loadMoreAnimals() {
    setLoadingMore(true);
    try {
      const page = await fetchUserAnimals('me', PAGE, animals.length);
      setAnimals((prev) => mergeById(prev, page.animals));
      setAnimalTotal(page.total);
    } finally {
      setLoadingMore(false);
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

      {/* Stat strip: points / rank / level — links to the leaderboard, except
          for a showcase account, which is not on it (mobile parity). */}
      <StatStrip demo={me.is_demo === true}>
        <div>
          <strong>{me.points?.total ?? 0}</strong>
          <div className="micro">puan</div>
        </div>
        <div>
          {/* A showcase account does not compete (owner, 2026-09-09). */}
          <strong>{me.is_demo ? 'demo' : me.rank ? `${me.rank.rank}.` : '—'}</strong>
          <div className="micro">
            {me.is_demo
              ? 'demo hesabı'
              : me.rank
              ? `sıra / ${me.rank.totalUsers.toLocaleString('tr-TR')}`
              : 'sıra'}
          </div>
        </div>
        <div>
          <strong>{me.level.level}</strong>
          <div className="micro">seviye</div>
        </div>
      </StatStrip>

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

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section">öne çıkan rozetlerim</h2>
        <button className="link" onClick={() => setCatalogOpen(true)}>
          seç / tümü
        </button>
      </div>
      {featured.length === 0 ? (
        <div
          className="card flat"
          role="button"
          style={{ cursor: 'pointer' }}
          onClick={() => setCatalogOpen(true)}
        >
          <span className="muted">
            Henüz rozet seçmedin. Profilinde gösterilecek 3 rozeti seçmek için dokun.
          </span>
        </div>
      ) : (
        <div className="badge-grid">
          {featured.map((b) => (
            <div
              key={b.key}
              className="card flat"
              role="button"
              onClick={() => setCatalogOpen(true)}
            >
              <BadgeSymbol symbol={b.symbol} tier={b.tier} size={40} />
              <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{badgeTitle(b)}</div>
              <div className="subtle">{badgeProgressText(b)}</div>
            </div>
          ))}
        </div>
      )}

      <CarerGallery
        title="bakım verdiğim hayvanlar"
        animals={animals}
        total={animalTotal}
        loadingMore={loadingMore}
        onLoadMore={loadMoreAnimals}
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
