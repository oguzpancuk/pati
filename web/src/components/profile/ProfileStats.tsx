import { Link } from 'react-router-dom';
import type { UserRank } from '../../api';

/**
 * The numbers under the header, identical on both profiles: one three-cell
 * strip, puan / sıra / seviye, which opens the leaderboard — unless this
 * account is not on it. The four small counts (mama · su · hayvan · arkadaş)
 * that used to sit under it are gone; no item asked for them and the owner
 * had them removed (2026-09-11).
 */
export function ProfileStats({
  points,
  rank,
  level,
  demo = false,
}: {
  points: number;
  rank: UserRank | null;
  level: number;
  /** Showcase account: it does not compete, so the rank cell names it. */
  demo?: boolean;
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
    </>
  );
}
