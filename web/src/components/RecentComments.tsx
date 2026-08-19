import { Link } from 'react-router-dom';
import type { UserComment } from '../api';
import { AnimalAvatar } from '../avatars';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/** The profile's "recent comments" block: 3 previews + "see all (N)". */
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
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <h2 className="section">{title}</h2>
        {total > comments.length && (
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
          <Link
            key={c.id}
            to={`/hayvanlar/${c.animal_id}`}
            className="card flat row"
            style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}
          >
            <AnimalAvatar species={c.animal_species} breed={c.animal_breed} size={36} />
            <div className="grow">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{c.animal_name ?? (c.animal_species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
                <span className="subtle">{formatDate(c.created_at)}</span>
              </div>
              <div style={{ fontSize: 14 }}>{c.body}</div>
            </div>
          </Link>
        ))
      )}
    </>
  );
}
