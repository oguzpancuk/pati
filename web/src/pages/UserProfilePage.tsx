import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sortBadges } from '@mobile/badges';
import {
  acceptFriendRequest,
  blockUser,
  fetchUserProfile,
  PublicProfile,
  removeFriendship,
  sendFriendRequest,
  unblockUser,
} from '../api';
import { useAuth } from '../auth';
import { BadgeCatalogModal, LevelBar } from '../badges';
import { PageHeader } from '../components/PageHeader';
import { RecentComments } from '../components/RecentComments';
import { ReportDialog } from '../components/ReportDialog';
import {
  BadgeBlock,
  CarerGallery,
  FriendshipButton,
  HeaderIconButton,
  MoreIcon,
  ProfileHeader,
  ProfileStats,
  useCaredAnimals,
} from '../components/profile';

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
 * where the friendship button and a "⋯" disc (report, block — App Store
 * guideline 1.2) stand in for bell / arkadaşlar / ayarlar. Once blocked, the
 * friendship button gives way to "engellendi", which is also where the block
 * is undone.
 */
export default function UserProfilePage() {
  const { id } = useParams();
  const userId = Number(id);
  const navigate = useNavigate();
  const { me } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  // The profile brings the first few cared-for animals; the gallery pages
  // through the rest as it is scrolled.
  const cared = useCaredAnimals(userId);
  const resetAnimals = cared.reset;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchUserProfile(userId);
      setProfile(data);
      resetAnimals({ animals: data.animals, total: data.animalCount ?? data.animals.length });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi');
    }
  }, [userId, resetAnimals]);

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

  if (!profile) {
    return (
      <div className="page">
        {/* See AnimalPage: a failed load is when the way back matters most. */}
        <PageHeader title="profil" fallback="/profil" />
        {error ? <div className="error">{error}</div> : <p className="muted">Profil yükleniyor…</p>}
      </div>
    );
  }

  // Both confirmations say what actually changes, and the unblock says what
  // does NOT come back: the friendship is asked for again, never restored.
  function confirmBlock() {
    if (
      window.confirm(
        `${profile!.name} sana mesaj gönderemez ve arkadaşlık isteği yollayamaz; yorumlarını görmezsin. Arkadaşsanız arkadaşlık biter. Engellemek istiyor musun?`
      )
    )
      run(() => blockUser(userId), 'Engellenemedi');
  }
  function confirmUnblock() {
    if (
      window.confirm(
        `${profile!.name} yeniden arkadaşlık isteği gönderebilir ve yorumları görünür. Arkadaşlık kendiliğinden geri gelmez. Engeli kaldırmak istiyor musun?`
      )
    )
      run(() => unblockUser(userId), 'Kaldırılamadı');
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
          <>
            {profile.blocked ? (
              <button
                className="btn secondary profile-friend-btn"
                disabled={busy}
                onClick={confirmUnblock}
              >
                Engellendi
              </button>
            ) : (
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
            )}
            <MoreMenu
              blocked={profile.blocked}
              onReport={() => setReportOpen(true)}
              onBlock={confirmBlock}
              onUnblock={confirmUnblock}
            />
          </>
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
        animals={cared.animals}
        total={cared.total}
        loadingMore={cared.loadingMore}
        loadFailed={cared.loadFailed}
        onEndReached={cared.loadMore}
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
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={userId}
      />
    </div>
  );
}

/**
 * The "⋯" disc and its two-line menu. Mobile shows the same two lines in a
 * system alert; here they drop under the disc and close on an outside click
 * or Escape. Only the labels differ by state: "engelle" or "engeli kaldır".
 */
function MoreMenu({
  blocked,
  onReport,
  onBlock,
  onUnblock,
}: {
  blocked: boolean;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="profile-menu-wrap" ref={wrapRef}>
      <HeaderIconButton label="Diğer işlemler" onClick={() => setOpen((v) => !v)}>
        <MoreIcon />
      </HeaderIconButton>
      {open && (
        <div className="profile-menu" role="menu">
          <button role="menuitem" onClick={() => pick(onReport)}>
            şikayet et
          </button>
          {blocked ? (
            <button role="menuitem" onClick={() => pick(onUnblock)}>
              engeli kaldır
            </button>
          ) : (
            <button role="menuitem" className="danger" onClick={() => pick(onBlock)}>
              engelle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
