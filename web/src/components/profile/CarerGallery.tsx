import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CARER_GALLERY, carerCardWidth } from '@mobile/carerGallery';
import type { ProfileAnimal } from '../../api';
import { AnimalAvatar } from '../../avatars';

/**
 * The animals someone cares for, as a horizontally scrolling gallery of
 * portrait cards. Carers and comments used to be two identical stacks of
 * rows (owner, 2026-09-11: "aynı görünüyorlar"); they are told apart by
 * SHAPE now — a gallery here, speech bubbles there.
 *
 * Every animal is reachable by scrolling alone (owner, 2026-09-15: no
 * "tümünü gör"): the next page is requested a strip-width before the end,
 * and a card at the tail says how many are still on their way.
 */
export function CarerGallery({
  title,
  animals,
  total,
  loadingMore = false,
  loadFailed = false,
  onEndReached,
  emptyText,
}: {
  title: string;
  animals: ProfileAnimal[];
  /** Every animal this person cares for, not just the loaded pages. */
  total: number;
  loadingMore?: boolean;
  loadFailed?: boolean;
  /** Asks for the next page; the gallery calls it as its end comes near. */
  onEndReached: () => void;
  emptyText: string;
}) {
  const remaining = total - animals.length;
  const stripRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  // The observer outlives renders; it must call the newest handler.
  const endReached = useRef(onEndReached);
  endReached.current = onEndReached;
  const hasTail = remaining > 0;
  const hasStrip = animals.length > 0;

  // Cards stretch or shrink a little so the strip's edge always cuts the
  // next one (see @mobile/carerGallery). Measured before paint, and again
  // whenever the strip changes width (rotation, a resized window).
  const [cardWidth, setCardWidth] = useState<number>(CARER_GALLERY.baseWidth);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const measure = () => setCardWidth(carerCardWidth(strip.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [hasStrip]);
  const cardSize = { width: cardWidth };

  // The tail card within one strip-width of the visible edge counts as the
  // end, so a short first page that does not fill the strip asks for more
  // straight away. A fresh observer per loaded page reports afresh: a page
  // too short to push the tail away still asks for the next one. A failed
  // page changes nothing here, so it is not retried in a loop — scrolling
  // the tail back into view, or its retry button, asks again.
  useEffect(() => {
    const root = stripRef.current;
    const tail = tailRef.current;
    if (!root || !tail || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) endReached.current();
      },
      { root, rootMargin: '0px 100% 0px 0px' }
    );
    io.observe(tail);
    return () => io.disconnect();
  }, [animals.length, hasTail]);

  return (
    <>
      <h2 className="section">{title}</h2>
      {animals.length === 0 ? (
        <div className="card flat">
          <span className="muted">{emptyText}</span>
        </div>
      ) : (
        <div className="carer-gallery" ref={stripRef}>
          {animals.map((a) => (
            <Link key={a.id} to={`/hayvanlar/${a.id}`} className="carer-card" style={cardSize}>
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
          {/* The animals not loaded yet, in a card's footprint. Not a "show
              more": scrolling brings them. Only a failed page puts a button
              in it, since a strip too short to scroll has no other way to
              try again. */}
          {hasTail && (
            <div
              ref={tailRef}
              className="carer-card carer-more"
              style={cardSize}
              aria-live="polite"
            >
              {loadFailed && !loadingMore ? (
                <>
                  <button className="link" onClick={onEndReached}>
                    tekrar dene
                  </button>
                  <span className="carer-breed">{`+${remaining}`}</span>
                </>
              ) : (
                <>
                  <strong className="carer-count">{`+${remaining}`}</strong>
                  {loadingMore && <span className="carer-breed">yükleniyor…</span>}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
