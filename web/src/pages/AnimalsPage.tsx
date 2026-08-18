import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { mergeById } from '@mobile/paging';
import { Animal, fetchAnimals } from '../api';
import { AnimalAvatar } from '../avatars';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { Coordinates, FALLBACK_CENTER, getCurrentLocation } from '../location';

// 1 km (mobille aynı): yürüyerek gidilip bakılabilecek mesafe; 20'şer sayfa.
const NEARBY_RADIUS_METERS = 1000;
const PAGE_SIZE = 20;

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
  // Sonraki sayfalar aynı merkezden istenmeli; konum ilk sayfada saklanıyor.
  const locationRef = useRef<Coordinates>(FALLBACK_CENTER);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const loc = locationRef.current;
      const data = await fetchAnimals(loc.lat, loc.lng, NEARBY_RADIUS_METERS, filter || undefined, PAGE_SIZE, animals.length);
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
      .catch(() => FALLBACK_CENTER)
      .then((loc) => {
        locationRef.current = loc;
        return fetchAnimals(loc.lat, loc.lng, NEARBY_RADIUS_METERS, filter || undefined, PAGE_SIZE, 0);
      })
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

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Hayvanlar</h1>
        <Link to="/hayvanlar/yeni" className="btn small" style={{ textDecoration: 'none' }}>
          + Yeni
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        1 km içindeki kayıtlı sokak dostları.
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
            Yakınında kayıt yok. İlk hayvanı sen ekle.
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
          <AnimalAvatar species={animal.species} breed={animal.breed} size={48} />
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
      {hasMore && (
        <LoadMoreButton remaining={PAGE_SIZE} loading={loadingMore} onClick={loadMore} label="Daha fazla yükle" />
      )}
    </div>
  );
}
