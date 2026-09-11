import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AVATAR_VARIANTS } from '@mobile/avatars';
import { badgeProgressText, badgeTitle } from '@mobile/badges';
import { patiAvatarSvg } from '@shared/avatarSvg';
import {
  acceptFriendRequest,
  deleteCareAction,
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
import { AnimalAvatar } from '../avatars';
import { BadgeCatalogModal, BadgeSymbol, LevelBar } from '../badges';
import { useBadgeAwards } from '../badgeAwards';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { RecentComments } from '../components/RecentComments';
import {
  BellIcon,
  FriendsSheet,
  GearIcon,
  HeaderIconButton,
  NotificationsSheet,
  ProfileHeader,
  SettingsSheet,
  UsersIcon,
} from '../components/profile';
import { MiniMap } from '../components/MiniMap';
import { CareHistoryMap } from '../components/CareHistoryMap';
import { mergeById } from '@mobile/paging';
import { applyThemeMode, readThemeMode, type ThemeMode } from '../theme';
import { InstallBanner } from '../install';

// The profile is a summary screen: 3 rows per section, the rest behind "show more".
const PREVIEW = 3;
const PAGE = 20;
// The bell polls the unread count the way the care alert is polled: on
// open, every minute while the tab is visible, and when it becomes visible.
const UNREAD_POLL_MS = 60 * 1000;

/** The brand food-bowl / water-drop stroke icon, shared by the history row
 * and the detail popup's map marker. */
function CareIcon({ type, size = 20 }: { type: 'food' | 'water'; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--brand)"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      {type === 'food' ? (
        <>
          <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
          <path d="M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9" />
        </>
      ) : (
        <path d="M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z" />
      )}
    </svg>
  );
}

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
  // The clicked marker's detail popup: what and when (and delete, while the
  // window allows).
  const [careDetail, setCareDetail] = useState<MyCareAction | null>(null);
  // A marker holding several records opens this chooser first.
  const [careGroup, setCareGroup] = useState<MyCareAction[] | null>(null);
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  // Only one sheet is open at a time (owner, 2026-09-11: the header's
  // controls open sheets OVER the profile, never a second page).
  const [sheet, setSheet] = useState<'bell' | 'friends' | 'settings' | null>(null);
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

  async function handleDeleteCare(action: MyCareAction) {
    const label = action.action_type === 'food' ? 'mama' : 'su';
    if (!window.confirm(`Bu ${label} kaydı haritadan da kalkacak. Emin misin?`)) return;
    try {
      await deleteCareAction(action.id);
      setCareHistory((prev) => prev.filter((item) => item.id !== action.id));
      setCareDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
      // The window may have expired since the map was fetched; refresh so
      // stale delete buttons disappear.
      setCareDetail(null);
      await load();
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

      <h2 className="section">bakım verdiğim hayvanlar</h2>
      {animals.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz bir hayvana bakım vermiyorsun.</span>
        </div>
      ) : (
        animals.map((a) => (
          <Link
            key={a.id}
            to={`/hayvanlar/${a.id}`}
            className="card flat row"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <AnimalAvatar
              species={a.species}
              breed={a.breed}
              photoUrl={a.cover_thumb_url}
              size={44}
            />
            <div className="grow">
              <div className="name-with-chip">
                <strong>{a.name ?? (a.species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
                {a.is_demo && <span className="demo-chip">demo</span>}
              </div>
              <div className="muted">{a.breed ?? 'Türü belirtilmemiş'}</div>
            </div>
            <span className="subtle">›</span>
          </Link>
        ))
      )}
      <LoadMoreButton
        remaining={animalTotal - animals.length}
        loading={loadingMore}
        onClick={loadMoreAnimals}
      />

      {/* The history is a MAP, not a list (owner decision, 2026-08-31):
          every drop is a marker; tapping one opens the date/delete popup. */}
      <h2 className="section">mama &amp; su geçmişim</h2>
      {careHistory.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz mama veya su bırakmadın.</span>
        </div>
      ) : (
        <>
          <CareHistoryMap
            actions={careHistory}
            onSelect={(group) =>
              group.length === 1 ? setCareDetail(group[0]) : setCareGroup(group)
            }
          />
          {/* The map draws at most 100 records (the API's page cap). */}
          {careHistory.length === 100 && (
            <p className="subtle" style={{ textAlign: 'center', margin: '6px 0 0' }}>
              Son 100 kayıt gösteriliyor.
            </p>
          )}
        </>
      )}

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

      {/* Chooser for a marker holding several records. */}
      {careGroup && (
        <div className="backdrop" onClick={() => setCareGroup(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center', marginBottom: 12 }}>Bu noktadaki kayıtlar</h2>
            {careGroup.map((action) => (
              <button
                key={action.id}
                className="card flat"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  marginBottom: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onClick={() => {
                  setCareGroup(null);
                  setCareDetail(action);
                }}
              >
                <CareIcon type={action.action_type} size={18} />
                <strong style={{ flex: 1 }}>{action.action_type === 'food' ? 'Mama' : 'Su'}</strong>
                <span className="muted">{formatCareDate(action.created_at)}</span>
              </button>
            ))}
            <button
              className="btn ghost full"
              style={{ marginTop: 6 }}
              onClick={() => setCareGroup(null)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Drop-detail popup: where this record landed, as a static map. */}
      {careDetail && (
        <div className="backdrop" onClick={() => setCareDetail(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center', marginBottom: 2 }}>
              {careDetail.action_type === 'food' ? 'Mama kaydı' : 'Su kaydı'}
            </h2>
            <p className="muted" style={{ textAlign: 'center', margin: '0 0 12px' }}>
              {formatCareDate(careDetail.created_at)}
            </p>
            <MiniMap
              key={careDetail.id}
              lat={careDetail.location.coordinates[1]}
              lng={careDetail.location.coordinates[0]}
              height={180}
            >
              <span
                style={{
                  display: 'inline-flex',
                  padding: 6,
                  borderRadius: '50%',
                  background: 'var(--surface)',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
                }}
              >
                <CareIcon type={careDetail.action_type} size={18} />
              </span>
            </MiniMap>
            {/* Delete moved here with the list gone — still only inside the
                server-computed 15-minute window. */}
            {careDetail.deletable && (
              <button
                className="btn full"
                style={{ marginTop: 10, background: 'var(--danger)' }}
                onClick={() => handleDeleteCare(careDetail)}
              >
                Sil
              </button>
            )}
            <button
              className="btn ghost full"
              style={{ marginTop: 10 }}
              onClick={() => setCareDetail(null)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
