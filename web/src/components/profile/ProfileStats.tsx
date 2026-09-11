import { Link } from 'react-router-dom';
import type { UserRank } from '../../api';

export type ProfileCounts = {
  food: number;
  water: number;
  animals: number;
  friends: number;
};

/**
 * The numbers under the header, identical on both profiles: the three-cell
 * strip (puan / sıra / seviye) over the four small counts. The strip opens
 * the leaderboard — unless this account is not on it.
 */
export function ProfileStats({
  points,
  rank,
  level,
  demo = false,
  counts,
}: {
  points: number;
  rank: UserRank | null;
  level: number;
  /** Showcase account: it does not compete, so the rank cell names it. */
  demo?: boolean;
  counts: ProfileCounts;
}) {
  const cells = (
    <>
      <div>
        <strong>{points}</strong>
        <div className="micro">puan</div>
      </div>
      <div>
        {/* A showcase account does not compete (owner, 2026-09-09). */}
        <strong>{demo ? 'demo' : rank ? `${rank.rank}.` : '—'}</strong>
        <div className="micro">{demo ? 'hesabı' : 'sıra'}</div>
      </div>
      <div>
        <strong>{level}</strong>
        <div className="micro">seviye</div>
      </div>
    </>
  );

  return (
    <>
      {demo ? (
        <div className="statstrip">{cells}</div>
      ) : (
        <Link
          to="/siralama"
          className="statstrip"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          {cells}
        </Link>
      )}
      <div className="profile-counts">
        {(
          [
            [counts.food, 'mama'],
            [counts.water, 'su'],
            [counts.animals, 'kayıt'],
            [counts.friends, 'arkadaş'],
          ] as [number, string][]
        ).map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <div className="micro">{label}</div>
          </div>
        ))}
      </div>
    </>
  );
}
