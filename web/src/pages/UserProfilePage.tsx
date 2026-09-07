import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { badgeProgressText, badgeTitle, sortBadges } from '@mobile/badges';
import {
  acceptFriendRequest,
  fetchUserAnimals,
  fetchUserProfile,
  ProfileAnimal,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
} from '../api';
import { useAuth } from '../auth';
import { AnimalAvatar, UserAvatar } from '../avatars';
import { BadgeCatalogModal, BadgeSymbol, LevelBar } from '../badges';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { RecentComments } from '../components/RecentComments';
import { mergeById } from '@mobile/paging';

const ANIMAL_PAGE = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Someone else's profile (mobile's PublicProfileScreen). */
export default function UserProfilePage() {
  const { id } = useParams();
  const userId = Number(id);
  const navigate = useNavigate();
  const { me } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [animals, setAnimals] = useState<ProfileAnimal[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchUserProfile(userId);
      setProfile(data);
      setAnimals(data.animals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi');
    }
  }, [userId]);

  useEffect(() => {
    // Your own profile is a separate page; arriving here with your own id redirects there.
    if (me && me.id === userId) navigate('/profil', { replace: true });
    else load();
  }, [load, me, userId, navigate]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreAnimals() {
    setLoadingMore(true);
    try {
      const page = await fetchUserAnimals(userId, ANIMAL_PAGE, animals.length);
      setAnimals((prev) => mergeById(prev, page.animals));
      setProfile((prev) => (prev ? { ...prev, animalCount: page.total } : prev));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!profile) {
    return (
      <div className="page">
        {error ? <div className="error">{error}</div> : <p className="muted">Profil yükleniyor…</p>}
      </div>
    );
  }

  const displayBadges =
    profile.featuredBadges?.length > 0
      ? profile.featuredBadges
      : sortBadges(profile.badges.filter((b) => b.tier)).slice(0, 3);
  const stats: [number, string][] = [
    [profile.stats.foodCount, 'MAMA'],
    [profile.stats.waterCount, 'SU'],
    [profile.stats.animalCount, 'KAYIT'],
    [profile.friendCount, 'ARKADAŞ'],
  ];

  return (
    <div className="page">
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ‹ Geri
      </button>
      {error && <div className="error">{error}</div>}

      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }}>
          <UserAvatar avatarUrl={profile.avatar_url} name={profile.name} size={88} />
        </div>
        <h1 style={{ margin: '8px 0 0', fontSize: 22 }}>{profile.name}</h1>
        <div className="muted">{formatDate(profile.created_at)} tarihinde katıldı</div>
        {profile.rank && (
          <div style={{ color: 'var(--brand)', fontWeight: 800, fontSize: 13, marginTop: 4 }}>
            {profile.rank.rank}. / {profile.rank.totalUsers} · {profile.points.total} puan
          </div>
        )}
        <div style={{ textAlign: 'left' }}>
          <LevelBar level={profile.level} points={profile.points?.total ?? 0} />
        </div>
        <div className="stats">
          {stats.map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span className="subtle">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {profile.friendshipStatus === 'none' && (
        <button
          className="btn full"
          disabled={busy}
          onClick={() => run(() => sendFriendRequest(userId), 'Gönderilemedi')}
        >
          👥 Arkadaş ekle
        </button>
      )}
      {profile.friendshipStatus === 'pending_sent' && (
        <div className="card flat" style={{ textAlign: 'center', background: 'var(--brand-tint)' }}>
          <span className="muted">İstek gönderildi, yanıt bekleniyor.</span>
        </div>
      )}
      {profile.friendshipStatus === 'pending_received' && profile.friendshipId && (
        <button
          className="btn full"
          disabled={busy}
          onClick={() => run(() => acceptFriendRequest(profile.friendshipId!), 'Kabul edilemedi')}
        >
          Arkadaşlık isteğini kabul et
        </button>
      )}
      {profile.friendshipStatus === 'friends' && profile.friendshipId && (
        <button
          className="btn secondary full"
          disabled={busy}
          onClick={() => run(() => removeFriendship(profile.friendshipId!), 'İşlem başarısız')}
        >
          Arkadaşlıktan çık
        </button>
      )}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section">Rozetler</h2>
        <button className="link" onClick={() => setCatalogOpen(true)}>
          Tüm rozetler
        </button>
      </div>
      {displayBadges.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz rozet kazanmamış.</span>
        </div>
      ) : (
        <div className="badge-grid">
          {displayBadges.map((b) => (
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

      <h2 className="section">Bakım verdiği hayvanlar</h2>
      {animals.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz bir hayvana bakım vermiyor.</span>
        </div>
      ) : (
        animals.map((a) => (
          <Link
            key={a.id}
            to={`/hayvanlar/${a.id}`}
            className="card flat row"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <AnimalAvatar species={a.species} breed={a.breed} photoUrl={a.cover_thumb_url} size={44} />
            <div className="grow">
              <strong>{a.name ?? (a.species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
              <div className="muted">{a.breed ?? 'Türü belirtilmemiş'}</div>
            </div>
            <span className="subtle">›</span>
          </Link>
        ))
      )}
      <LoadMoreButton
        remaining={(profile.animalCount ?? animals.length) - animals.length}
        loading={loadingMore}
        onClick={loadMoreAnimals}
      />

      <RecentComments
        comments={profile.recentComments ?? []}
        total={profile.commentCount ?? 0}
        title="Son yorumları"
        emptyText="Henüz yorum yapmamış."
        seeAllTo={`/kullanici/${profile.id}/yorumlar`}
      />

      <BadgeCatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        badges={profile.badges}
      />
    </div>
  );
}
