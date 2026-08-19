import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AVATAR_VARIANTS } from '@mobile/avatars';
import { badgeProgressText, badgeTitle } from '@mobile/badges';
import { patiAvatarSvg } from '@shared/avatarSvg';
import {
  acceptFriendRequest,
  fetchMyFriendships,
  fetchUserAnimals,
  FriendshipEntry,
  FriendshipsResponse,
  ProfileAnimal,
  removeFriendship,
  setAvatarKey,
  setFeaturedBadges,
  uploadAvatar,
} from '../api';
import { useAuth } from '../auth';
import { AnimalAvatar, UserAvatar } from '../avatars';
import { BadgeCatalogModal, BadgeSymbol, LevelBar } from '../badges';
import { useBadgeAwards } from '../badgeAwards';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { RecentComments } from '../components/RecentComments';
import { mergeById } from '@mobile/paging';
import { applyThemeMode, readThemeMode, type ThemeMode } from '../theme';
import { InstallBanner } from '../install';

// The profile is a summary screen: 3 rows per section, the rest behind "show more".
const PREVIEW = 3;
const PAGE = 20;

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
  const [friendships, setFriendships] = useState<FriendshipsResponse | null>(null);
  const [visibleFriends, setVisibleFriends] = useState(PREVIEW);
  const [theme, setTheme] = useState<ThemeMode>(readThemeMode());

  const load = useCallback(async () => {
    try {
      const [page, fr] = await Promise.all([
        fetchUserAnimals('me', PREVIEW, 0),
        fetchMyFriendships(),
      ]);
      setAnimals(page.animals);
      setAnimalTotal(page.total);
      setFriendships(fr);
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
