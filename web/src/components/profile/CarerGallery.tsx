import { Link } from 'react-router-dom';
import type { ProfileAnimal } from '../../api';
import { AnimalAvatar } from '../../avatars';

/**
 * The animals someone cares for, as a horizontally scrolling gallery of
 * portrait cards. Carers and comments used to be two identical stacks of
 * rows (owner, 2026-09-11: "aynı görünüyorlar"); they are told apart by
 * SHAPE now — a gallery here, speech bubbles there.
 */
export function CarerGallery({
  title,
  animals,
  total,
  loadingMore = false,
  onLoadMore,
  emptyText,
}: {
  title: string;
  animals: ProfileAnimal[];
  /** Every animal this person cares for, not just the loaded page. */
  total: number;
  loadingMore?: boolean;
  onLoadMore: () => void;
  emptyText: string;
}) {
  const remaining = total - animals.length;

  return (
    <>
      <h2 className="section">{title}</h2>
      {animals.length === 0 ? (
        <div className="card flat">
          <span className="muted">{emptyText}</span>
        </div>
      ) : (
        <div className="carer-gallery">
          {animals.map((a) => (
            <Link key={a.id} to={`/hayvanlar/${a.id}`} className="carer-card">
              <AnimalAvatar
                species={a.species}
                breed={a.breed}
                photoUrl={a.cover_thumb_url}
                size={84}
              />
              <strong className="carer-name">
                {a.name ?? (a.species === 'cat' ? 'Kedi' : 'Köpek')}
              </strong>
              <span className="carer-breed">{a.breed ?? 'türü belirtilmemiş'}</span>
              {a.is_demo && <span className="demo-chip">demo</span>}
            </Link>
          ))}
          {/* The gallery's own "see all": one more card that loads the next
              page, so the affordance stays inside the strip. */}
          {remaining > 0 && (
            <button className="carer-card carer-more" disabled={loadingMore} onClick={onLoadMore}>
              <span className="link">{loadingMore ? 'yükleniyor…' : 'tümünü gör'}</span>
              <span className="carer-breed">{`+${remaining}`}</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
