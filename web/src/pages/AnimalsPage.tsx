import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mergeById } from '@mobile/paging';
import { Animal, fetchAnimals } from '../api';
import { AnimalAvatar } from '../avatars';
import { Coordinates, getCurrentLocation } from '../location';

// No radius (owner decision, 2026-09-07, same as mobile): every animal,
// nearest first; a page is about a screenful and the next one loads when
// the end scrolls into view.
const PAGE_SIZE = 10;

type Filter = '' | 'cat' | 'dog';

function formatDistance(m?: number) {
  if (m === undefined) return '';
  return m < 1000 ? ` · ${Math.round(m)} m` : ` · ${(m / 1000).toFixed(1)} km`;
}

export default function AnimalsPage() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [filter, setFilter] = useState<Filter>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  // Later pages must use the same center; the location is kept from page
  // one. Without a location (http origin, permission denied) the list is
  // newest first and the caption says so — not "nearest to Kadıköy".
  const locationRef = useRef<Coordinates | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<() => void>(() => {});

  async function loadMore() {
    setLoadingMore(true);
    try {
      const loc = locationRef.current;
      const data = await fetchAnimals(
        loc?.lat,
        loc?.lng,
        undefined,
        filter || undefined,
        PAGE_SIZE,
        animals.length
      );
      setAnimals((prev) => mergeById(prev, data));
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCurrentLocation()
      .then((loc) => {
        locationRef.current = loc;
        setNoLocation(false);
        return loc;
      })
      .catch(() => {
        locationRef.current = null;
        setNoLocation(true);
        return null;
      })
      .then((loc) => fetchAnimals(loc?.lat, loc?.lng, undefined, filter || undefined, PAGE_SIZE, 0))
      .then((data) => {
        if (!alive) return;
        setAnimals(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filter]);

  // Auto-load when the sentinel under the list scrolls into view; the ref
  // always points at the latest loadMore so the observer sees fresh state.
  loadMoreRef.current = () => {
    if (hasMore && !loading && !loadingMore) loadMore();
  };
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, animals.length]);

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Hayvanlar</h1>
        <Link to="/hayvanlar/yeni" className="btn small" style={{ textDecoration: 'none' }}>
          + Yeni
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        {noLocation ? 'Konum izni yok — en yeni kayıtlar.' : 'Sana en yakından uzağa.'}
      </p>

      <div className="chiprow">
        {(
          [
            ['', 'Hepsi'],
            ['cat', 'Kediler'],
            ['dog', 'Köpekler'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${filter === value ? 'selected' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Yükleniyor…</p>}
      {!loading && animals.length === 0 && (
        <div className="card flat">
          <p className="muted" style={{ margin: 0 }}>
            Henüz kayıt yok. İlk hayvanı sen ekle.
          </p>
        </div>
      )}

      {animals.map((animal) => (
        <Link
          key={animal.id}
          to={`/hayvanlar/${animal.id}`}
          className="card row"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <AnimalAvatar species={animal.species} breed={animal.breed} photoUrl={animal.cover_thumb_url} size={48} />
          <div className="grow">
            <strong>{animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
            <div className="muted">
              {animal.breed ?? 'Türü belirtilmemiş'}
              {formatDistance(animal.distance_meters)}
            </div>
          </div>
          <span className="subtle">›</span>
        </Link>
      ))}
      {/* The sentinel: scrolling it into view loads the next page. */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && <p className="muted">Yükleniyor…</p>}
    </div>
  );
}
