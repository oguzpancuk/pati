import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sortBadges } from '@mobile/badges';
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
import { BadgeCatalogModal, LevelBar } from '../badges';
import { PageHeader } from '../components/PageHeader';
import { RecentComments } from '../components/RecentComments';
import {
  BadgeBlock,
  CarerGallery,
  FriendshipButton,
  ProfileHeader,
  ProfileStats,
} from '../components/profile';
import { mergeById } from '@mobile/paging';

const ANIMAL_PAGE = 20;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Someone else's profile (mobile's PublicProfileScreen). Same skeleton as
 * your own (owner, 2026-09-11): header, stats, level bar, badges, the carer
 * gallery, the comment bubbles — all from components/profile, so the two
 * cannot drift apart again. The only difference is the header's top-right,
 * where one friendship button stands in for bell / arkadaşlar / ayarlar.
 */
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
        {/* See AnimalPage: a failed load is when the way back matters most. */}
        <PageHeader title="profil" fallback="/profil" />
        {error ? <div className="error">{error}</div> : <p className="muted">Profil yükleniyor…</p>}
      </div>
    );
  }

  // "Öne çıkan" is a claim about a CHOICE this person made. Without one we
  // still show their strongest three, but under a heading that does not put
  // words in their mouth (review finding).
  const hasFeatured = (profile.featuredBadges?.length ?? 0) > 0;
  const displayBadges = hasFeatured
    ? profile.featuredBadges
    : sortBadges(profile.badges.filter((b) => b.tier)).slice(0, 3);

  return (
    <div className="page">
      <PageHeader title="profil" fallback="/profil" />
      {error && <div className="error">{error}</div>}

      <ProfileHeader
        avatarUrl={profile.avatar_url}
        name={profile.name}
        secondary={`${formatDate(profile.created_at)} tarihinde katıldı`}
        demo={profile.is_demo === true}
        actions={
          <FriendshipButton
            status={profile.friendshipStatus}
            busy={busy}
            onAdd={() => run(() => sendFriendRequest(userId), 'Gönderilemedi')}
            onAccept={() =>
              profile.friendshipId != null &&
              run(() => acceptFriendRequest(profile.friendshipId!), 'Kabul edilemedi')
            }
            onRemove={() =>
              profile.friendshipId != null &&
              run(() => removeFriendship(profile.friendshipId!), 'İşlem başarısız')
            }
          />
        }
      />

      <ProfileStats
        points={profile.points?.total ?? 0}
        rank={profile.rank}
        level={profile.level?.level ?? 1}
        demo={profile.is_demo === true}
      />

      <LevelBar level={profile.level} points={profile.points?.total ?? 0} />

      <BadgeBlock
        title={hasFeatured ? 'öne çıkan rozetleri' : 'rozetleri'}
        actionLabel="tümü"
        onAction={() => setCatalogOpen(true)}
        badges={displayBadges}
        emptyText="Henüz rozet kazanmamış."
      />

      <CarerGallery
        title="bakım verdiği hayvanlar"
        animals={animals}
        total={profile.animalCount ?? animals.length}
        loadingMore={loadingMore}
        onLoadMore={loadMoreAnimals}
        emptyText="Henüz bir hayvana bakım vermiyor."
      />

      <RecentComments
        comments={profile.recentComments ?? []}
        total={profile.commentCount ?? 0}
        title="son yorumları"
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
