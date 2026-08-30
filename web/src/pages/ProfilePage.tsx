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
  FriendshipEntry,
  FriendshipsResponse,
  MyCareAction,
  ProfileAnimal,
  removeFriendship,
  setAvatarKey,
  setFeaturedBadges,
  uploadAvatar,
} from '../api';
import { useAuth } from '../auth';
import { DeleteAccountLink } from '../components/DeleteAccountDialog';
import { AnimalAvatar, UserAvatar } from '../avatars';
import { BadgeCatalogModal, BadgeSymbol, LevelBar } from '../badges';
import { useBadgeAwards } from '../badgeAwards';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { RecentComments } from '../components/RecentComments';
import { MiniMap } from '../components/MiniMap';
import { mergeById } from '@mobile/paging';
import { applyThemeMode, readThemeMode, type ThemeMode } from '../theme';
import { InstallBanner } from '../install';

// The profile is a summary screen: 3 rows per section, the rest behind "show more".
const PREVIEW = 3;
const PAGE = 20;

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

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'sistem' },
  { key: 'light', label: 'açık' },
  { key: 'dark', label: 'koyu' },
];

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
  const [careTotal, setCareTotal] = useState(0);
  const [loadingMoreCare, setLoadingMoreCare] = useState(false);
  // The clicked history row's detail popup: where the drop landed, on a map.
  const [careDetail, setCareDetail] = useState<MyCareAction | null>(null);
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  const [visibleFriends, setVisibleFriends] = useState(PREVIEW);
  const [theme, setTheme] = useState<ThemeMode>(readThemeMode());

  const load = useCallback(async () => {
    try {
      const [page, fr, carePage] = await Promise.all([
        fetchUserAnimals('me', PREVIEW, 0),
        fetchMyFriendships(),
        fetchMyCareActions(PREVIEW, 0),
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

  async function loadMoreCare() {
    setLoadingMoreCare(true);
    try {
      const page = await fetchMyCareActions(PAGE, careHistory.length);
      setCareHistory((prev) => mergeById(prev, page.actions));
      setCareTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoadingMoreCare(false);
    }
  }

  async function handleDeleteCare(action: MyCareAction) {
    const label = action.action_type === 'food' ? 'mama' : 'su';
    if (!window.confirm(`Bu ${label} kaydı haritadan da kalkacak. Emin misin?`)) return;
    try {
      await deleteCareAction(action.id);
      setCareHistory((prev) => prev.filter((item) => item.id !== action.id));
      setCareTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
      // The window may have expired since the list was fetched; refresh so
      // stale "sil" buttons disappear.
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

      {/* Header (handoff 3d): avatar + name + email + orange micro label */}
      <div
        className="row"
        role="button"
        style={{ cursor: 'pointer', alignItems: 'flex-start' }}
        onClick={() => setPickerOpen(true)}
      >
        <UserAvatar avatarUrl={me.avatar_url} name={me.name} size={60} />
        <div className="grow">
          <h1 style={{ margin: '2px 0 0', fontSize: 24 }}>{me.name}</h1>
          <div className="muted">{me.email}</div>
          <div className="micro" style={{ color: 'var(--brand)', margin: '4px 0 0' }}>
            {busy ? 'kaydediliyor…' : 'dokun, avatarını seç'}
          </div>
        </div>
      </div>

      {/* Stat strip: points / rank / level — links to the leaderboard. */}
      <Link
        to="/siralama"
        className="statstrip"
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <div>
          <strong>{me.points?.total ?? 0}</strong>
          <div className="micro">puan</div>
        </div>
        <div>
          <strong>{me.rank ? `${me.rank.rank}.` : '—'}</strong>
          <div className="micro">
            {me.rank ? `sıra / ${me.rank.totalUsers.toLocaleString('tr-TR')}` : 'sıra'}
          </div>
        </div>
        <div>
          <strong>{me.level.level}</strong>
          <div className="micro">seviye</div>
        </div>
      </Link>

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
            <AnimalAvatar species={a.species} breed={a.breed} size={44} />
            <div className="grow">
              <strong>{a.name ?? (a.species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
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

      <h2 className="section">mama &amp; su geçmişim</h2>
      {careHistory.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz mama veya su bırakmadın.</span>
        </div>
      ) : (
        careHistory.map((action) => (
          <div
            key={action.id}
            className="card flat row"
            role="button"
            style={{ cursor: 'pointer' }}
            onClick={() => setCareDetail(action)}
          >
            <CareIcon type={action.action_type} />
            <div className="grow">
              <strong>{action.action_type === 'food' ? 'Mama' : 'Su'}</strong>
              <div className="muted">{formatCareDate(action.created_at)}</div>
            </div>
            {/* Deletable only inside the server-computed window (mistake
                correction, not history rewriting). */}
            {action.deletable && (
              <button
                className="btn ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteCare(action);
                }}
              >
                sil
              </button>
            )}
          </div>
        ))
      )}
      <LoadMoreButton
        remaining={careTotal - careHistory.length}
        loading={loadingMoreCare}
        onClick={loadMoreCare}
      />

      <RecentComments
        comments={me.recentComments ?? []}
        total={me.commentCount ?? 0}
        title="son yorumlarım"
        emptyText="Henüz yorum yapmadın."
        seeAllTo="/yorumlarim"
      />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section">arkadaşlarım</h2>
        <Link to="/arkadas-bul" className="link">
          arkadaş bul
        </Link>
      </div>
      {incoming.length > 0 && (
        <>
          <div className="label">gelen istekler</div>
          {incoming.map((entry: FriendshipEntry) => (
            <div key={entry.friendship_id} className="card flat">
              <Link
                to={`/kullanici/${entry.id}`}
                className="row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <UserAvatar avatarUrl={entry.avatar_url} name={entry.name} size={36} />
                <strong className="grow">{entry.name}</strong>
              </Link>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await acceptFriendRequest(entry.friendship_id);
                      await load();
                    }, 'Kabul edilemedi')
                  }
                >
                  Kabul et
                </button>
                <button
                  className="btn small ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removeFriendship(entry.friendship_id);
                      await load();
                    }, 'Reddedilemedi')
                  }
                >
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </>
      )}
      {friends.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz arkadaşın yok.</span>
        </div>
      ) : (
        friends.slice(0, visibleFriends).map((f) => (
          <Link
            key={f.friendship_id}
            to={`/kullanici/${f.id}`}
            className="card flat row"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <UserAvatar avatarUrl={f.avatar_url} name={f.name} size={36} />
            <strong className="grow">{f.name}</strong>
            <span className="subtle">›</span>
          </Link>
        ))
      )}
      <LoadMoreButton
        remaining={friends.length - visibleFriends}
        onClick={() => setVisibleFriends((n) => n + PAGE)}
      />

      <h2 className="section">görünüm</h2>
      <div className="segmented" style={{ marginBottom: 18 }}>
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.key}
            className={`chip ${theme === o.key ? 'selected' : ''}`}
            onClick={() => {
              setTheme(o.key);
              applyThemeMode(o.key);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <button className="textlink" onClick={logout}>
        çıkış yap
      </button>

      <div className="subtle" style={{ textAlign: 'center', marginTop: 10 }}>
        <Link to="/gizlilik" className="subtle">
          gizlilik (kvkk)
        </Link>
        {' · '}
        <Link to="/kosullar" className="subtle">
          kullanım koşulları
        </Link>
      </div>
      <DeleteAccountLink />

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
