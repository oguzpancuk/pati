import { Link } from 'react-router-dom';
import type { UserComment } from '../api';
import { AnimalAvatar } from '../avatars';
import '../styles/profile.css';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/**
 * The profile's "recent comments" block, as SPEECH BUBBLES: the animal's
 * small face on the left, the comment inside the bubble, the animal and the
 * date as its caption. Carers and comments used to be two identical stacks
 * of rows (owner, 2026-09-11); the shape is what tells them apart now — a
 * gallery there, bubbles here. 3 previews + "see all (N)".
 */
export function RecentComments({
  comments,
  total,
  title,
  emptyText,
  seeAllTo,
}: {
  comments: UserComment[];
  total: number;
  title: string;
  emptyText: string;
  seeAllTo: string;
}) {
  return (
    <>
      <div className="section-head">
        <h2 className="section">{title}</h2>
        {/* Whenever any comment exists — mobile parity: with ≤3 comments the
            full list was otherwise unreachable by clicking. */}
        {total > 0 && (
          <Link to={seeAllTo} className="link">
            Tümünü gör ({total})
          </Link>
        )}
      </div>
      {comments.length === 0 ? (
        <div className="card flat">
          <span className="muted">{emptyText}</span>
        </div>
      ) : (
        comments.map((c) => (
          <Link key={c.id} to={`/hayvanlar/${c.animal_id}`} className="comment-bubble-row">
            <AnimalAvatar
              species={c.animal_species}
              breed={c.animal_breed}
              photoUrl={c.animal_thumb_url}
              size={32}
            />
            <div className="comment-bubble-body">
              <div className="comment-bubble">{c.body}</div>
              <div className="comment-bubble-caption">
                {c.animal_name ?? (c.animal_species === 'cat' ? 'Kedi' : 'Köpek')} ·{' '}
                {formatDate(c.created_at)}
              </div>
            </div>
          </Link>
        ))
      )}
    </>
  );
}
