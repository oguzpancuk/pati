import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TIER_LABELS } from '@mobile/badges';
import { fetchLeaderboard, LeaderboardEntry, LeaderboardResponse } from '../api';
import { UserAvatar } from '../avatars';
import { PageHeader } from '../components/PageHeader';
import { LevelMark } from '../badges';

function medalFor(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard(100)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'));
  }, []);

  function row(entry: LeaderboardEntry, highlight: boolean) {
    const medal = medalFor(entry.rank);
    return (
      <Link
        key={entry.id}
        to={`/kullanici/${entry.id}`}
        className="card flat row"
        style={{
          textDecoration: 'none',
          color: 'inherit',
          ...(highlight ? { borderColor: 'var(--brand)', background: 'var(--brand-tint)' } : {}),
        }}
      >
        <span
          style={{
            width: 34,
            textAlign: 'center',
            fontWeight: 800,
            color: highlight ? 'var(--brand)' : 'var(--text-muted)',
            fontSize: medal ? 20 : 15,
          }}
        >
          {medal ?? entry.rank}
        </span>
        <UserAvatar avatarUrl={entry.avatar_url} name={entry.name} size={40} />
        <div className="grow">
          <strong style={{ display: 'block' }}>{entry.name}</strong>
          <span className="muted">
            {entry.level ? `Sv.${entry.level.level} ${entry.level.title} · ` : ''}
            {entry.badgeCount} rozet
            {entry.topTier ? ` · en yüksek ${TIER_LABELS[entry.topTier]}` : ''}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong style={{ color: 'var(--brand)', fontSize: 17 }}>{entry.points}</strong>
          <div className="micro" style={{ margin: 0 }}>
            puan
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="page">
      <PageHeader title="sıralama" fallback="/profil" />
      {error && <div className="error">{error}</div>}
      {data?.me && (
        <div className="card">
          <div className="micro" style={{ margin: 0 }}>
            sıralaman
          </div>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>
            {data.me.rank}
            <span className="muted" style={{ fontSize: 18 }}>
              {' '}
              / {data.totalUsers}
            </span>
          </div>
          <div className="muted">
            {data.me.points} puan · rozetlerden {data.me.badgePoints}, yorumlardan{' '}
            {data.me.commentPoints}
          </div>
          {data.me.level && (
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <LevelMark level={data.me.level.level} size={22} />
              <span style={{ color: 'var(--brand-dark)', fontWeight: 800, fontSize: 13 }}>
                Seviye {data.me.level.level} · {data.me.level.title}
              </span>
            </div>
          )}
        </div>
      )}
      {!data && !error && <p className="muted">Yükleniyor…</p>}
      {data && data.entries.length === 0 && (
        <div className="card flat">
          <strong>🏆 Sıralama henüz boş</strong>
          <div className="muted">İlk puanı sen kazan.</div>
        </div>
      )}
      {data?.entries.map((e) => row(e, e.id === data.me?.id))}
    </div>
  );
}
