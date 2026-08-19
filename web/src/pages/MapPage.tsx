import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animalAvatarSvg } from '@shared/animalAvatarSvg';
import {
  addCareAction,
  Animal,
  CareStatus,
  fetchAnimals,
  fetchCareActionsInBounds,
  fetchCareStatus,
} from '../api';
import {
  FALLBACK_CENTER,
  getCurrentLocation,
  describeLocationError,
  Coordinates,
} from '../location';
import { useBadgeAwards } from '../badgeAwards';
import { AdBanner } from '../components/AdBanner';
import { HeartBurst, HEART_BURST_MS } from '../components/HeartBurst';
import { InstallBanner } from '../install';

// Same rules as mobile's MapScreen: Turkey bounding box, 100 m circles,
// green fading with weight, animals visible at street scale. The red base
// layer was removed together with mobile (it felt like "everywhere is an
// alarm"); the shortage message moved to the top banner, and the green is
// bolder in exchange.
const TURKEY_BOUNDS = { minLat: 35.8, maxLat: 42.1, minLng: 25.6, maxLng: 44.8 };
const ACTION_CIRCLE_RADIUS_METERS = 100;
// Animals are drawn only near the user (200 m) and once the map is zoomed
// well in (street/building scale): from afar, dozens of avatars covered the
// map, and the user's business is with the animals on their own street
// anyway.
const ANIMAL_RADIUS_METERS = 200;
const ANIMAL_VISIBLE_MIN_ZOOM = 17;
// The scale the map focuses to after leaving food/water: the 100 m circle
// and the animals inside it should be visible.
const CELEBRATE_ZOOM = 18;

type ViewType = 'food' | 'water';

export default function MapPage() {
  const navigate = useNavigate();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<L.LayerGroup | null>(null);
  const animalsRef = useRef<L.LayerGroup | null>(null);
  // The last fetched animal list: consulted for which ones are in range for
  // the heart animation (instead of reading back from the layer's markers).
  const animalsDataRef = useRef<Animal[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { celebrate } = useBadgeAwards();
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  const [viewType, setViewType] = useState<ViewType>('food');
  const [status, setStatus] = useState<CareStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myLocation, setMyLocation] = useState<Coordinates | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);

  const typeLabel = viewType === 'food' ? 'mama' : 'su';

  // The map is built once; data layers refresh in separate effects.
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: false }).setView(
      [FALLBACK_CENTER.lat, FALLBACK_CENTER.lng],
      15
    );
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    // No zoom control (handoff): pinch and double-tap are enough.

    circlesRef.current = L.layerGroup().addTo(map);
    animalsRef.current = L.layerGroup().addTo(map);
    map.on('zoomend', () => setZoomedIn(map.getZoom() >= ANIMAL_VISIBLE_MIN_ZOOM));
    setZoomedIn(map.getZoom() >= ANIMAL_VISIBLE_MIN_ZOOM);
    mapRef.current = map;

    getCurrentLocation()
      .then((loc) => {
        // The location can arrive after leaving the page; calling setView on
        // a removed map blows Leaflet up (the _leaflet_pos error).
        if (mapRef.current !== map) return;
        setMyLocation(loc);
        map.setView([loc.lat, loc.lng], 16);
        // The user's location: charcoal dot + white ring + a dashed 200 m
        // circle (the near range where animals draw — the handoff's
        // depiction).
        L.circleMarker([loc.lat, loc.lng], {
          radius: 7,
          color: '#fff',
          weight: 3,
          fillColor: '#21201E',
          fillOpacity: 1,
        }).addTo(map);
        L.circle([loc.lat, loc.lng], {
          radius: ANIMAL_RADIUS_METERS,
          color: '#21201E',
          weight: 1.2,
          opacity: 0.35,
          dashArray: '3 7',
          fill: false,
          interactive: false,
        }).addTo(map);
      })
      .catch(() => {
        /* Without a location we stay on Kadıköy; asked again when adding a record. */
      });

    return () => {
      // remove() blows Leaflet up while a pan/zoom animation is running
      // (_leaflet_pos): stop the animation first.
      map.stop();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const loadCircles = useCallback(async () => {
    const layer = circlesRef.current;
    if (!layer) return;
    const actions = await fetchCareActionsInBounds(TURKEY_BOUNDS, viewType);
    layer.clearLayers();
    actions.forEach((action, i) => {
      const [lng, lat] = action.location.coordinates;
      // Studio language: soft fill + a 1.5px outline in the same tone + a
      // center dot. Freshness still lives in the fill: newer records are
      // bolder (0.09-0.22 range).
      const weight = Math.min(Math.max(Number(action.weight), 0), 1);
      const circle = L.circle([lat, lng], {
        radius: ACTION_CIRCLE_RADIUS_METERS,
        color: '#34A853',
        weight: 1.5,
        opacity: 0.45,
        fillColor: '#34A853',
        fillOpacity: 0.09 + weight * 0.13,
        interactive: false,
        className: 'nefes',
      }).addTo(layer);
      // Don't let everything "breathe" in unison: staggered delay in three groups (handoff).
      const el = circle.getElement() as HTMLElement | null;
      if (el) el.style.animationDelay = `${(i % 3) * 1.5}s`;
      L.circleMarker([lat, lng], {
        radius: 3,
        color: 'transparent',
        fillColor: '#34A853',
        fillOpacity: 0.9,
        interactive: false,
      }).addTo(layer);
    });
  }, [viewType]);

  const loadAnimals = useCallback(
    async (around?: Coordinates) => {
      const layer = animalsRef.current;
      if (!layer) return;
      const center = around ?? myLocation ?? FALLBACK_CENTER;
      const animals: Animal[] = await fetchAnimals(center.lat, center.lng, ANIMAL_RADIUS_METERS);
      animalsDataRef.current = animals;
      layer.clearLayers();
      for (const animal of animals) {
        const [lng, lat] = animal.location.coordinates;
        const icon = L.divIcon({
          // With divIcon the animal's pattern avatar becomes the marker
          // itself — the avatar in a 42px white circle (handoff size).
          html: `<div class="animal-marker">${animalAvatarSvg(animal.species, animal.breed, 30)}</div>`,
          className: '',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        L.marker([lat, lng], { icon })
          .on('click', () => navigate(`/hayvanlar/${animal.id}`))
          .addTo(layer);
      }
    },
    [myLocation, navigate]
  );

  useEffect(() => {
    loadCircles().catch((err) => setError(err.message));
  }, [loadCircles]);

  useEffect(() => {
    loadAnimals().catch(() => {});
  }, [loadAnimals]);

  // Animals only at street scale: at city scale the markers piled up and
  // covered the map (same rationale as mobile).
  useEffect(() => {
    const layer = animalsRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    if (zoomedIn) map.addLayer(layer);
    else map.removeLayer(layer);
  }, [zoomedIn]);

  useEffect(() => {
    const center = myLocation ?? FALLBACK_CENTER;
    fetchCareStatus(center.lat, center.lng, viewType)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [myLocation, viewType]);

  /**
   * Hearts rise from the avatars of the animals within range (100 m) of the
   * dropped food/water. The map zooms to that area first (avatars only draw
   * up close); screen points are computed once movement ends (moveend).
   */
  function celebrateNearbyAnimals(origin: Coordinates) {
    const map = mapRef.current;
    if (!map) return;
    const here = L.latLng(origin.lat, origin.lng);
    const affected = animalsDataRef.current.filter((a) => {
      const [lng, lat] = a.location.coordinates;
      return here.distanceTo(L.latLng(lat, lng)) <= ACTION_CIRCLE_RADIUS_METERS;
    });
    const fire = () => {
      if (affected.length === 0) return;
      setHearts(
        affected.map((a) => {
          const [lng, lat] = a.location.coordinates;
          const pt = map.latLngToContainerPoint([lat, lng]);
          return { id: a.id, x: pt.x, y: pt.y };
        })
      );
      window.setTimeout(() => setHearts([]), HEART_BURST_MS + 200);
    };
    map.once('moveend', fire);
    map.flyTo(here, CELEBRATE_ZOOM, { duration: 0.4 });
  }

  /** Photo picked → get the location → drop the record at the current spot. */
  async function handlePhotoPicked(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Without a location (http origin, no permission), instead of blocking
      // the user we use the map center and state the reason: people drop at
      // the spot they're looking at anyway. The mobile app requires the real
      // location; web is more
      // esnek (bkz. docs/NOTLAR.md).
      let usedFallback: string | null = null;
      const loc = await getCurrentLocation().catch((err) => {
        usedFallback = describeLocationError(err);
        const center = mapRef.current?.getCenter();
        return center ? { lat: center.lat, lng: center.lng } : FALLBACK_CENTER;
      });
      setMyLocation(loc);
      const created = await addCareAction(loc.lat, loc.lng, viewType, file);
      if (usedFallback) setError(`${usedFallback} Kayıt haritanın ortasına düştü.`);
      setConfirmOpen(false);
      await Promise.all([loadCircles(), loadAnimals(loc)]);
      const s = await fetchCareStatus(loc.lat, loc.lng, viewType).catch(() => null);
      if (s) setStatus(s);
      celebrateNearbyAnimals(loc);
      celebrate(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page fill">
      <div ref={mapEl} className="map-root" />

      <div className="map-top">
        <div className="segment">
          {(['food', 'water'] as const).map((t) => (
            <button
              key={t}
              className={viewType === t ? 'selected' : ''}
              onClick={() => setViewType(t)}
            >
              {t === 'food' ? 'mama' : 'su'}
            </button>
          ))}
        </div>
        {error && <div className="banner">{error}</div>}
        {/* The add-to-home-screen invite: hidden when opened from the home
            screen or after "later" (install.tsx). */}
        <InstallBanner compact />
      </div>

      {/* Bottom-right FAB for registering a new animal (sits above the bottom sheet). */}
      <button
        className="fab"
        aria-label="Yeni hayvan ekle"
        style={{ bottom: 'calc(196px + env(safe-area-inset-bottom))' }}
        onClick={() => navigate('/hayvanlar/yeni')}
      >
        +
      </button>

      {/* Bottom sheet: area status + call to action (handoff 3b). The button
          stays even without a status — dropping a record is always possible. */}
      <div className="map-bottom">
        <div className="map-sheet">
          <div className="sheet-handle" />
          <div className="micro">
            {status
              ? status.needsAttention
                ? `${status.radiusMeters} m çevrede kayıt yok`
                : `${status.radiusMeters} m çevrede ${status.actionCount} kayıt`
              : ' '}
          </div>
          <h2>
            {status && !status.needsAttention
              ? `Bu bölgede ${typeLabel} var`
              : `Buralarda ${typeLabel} yok`}
          </h2>
          <p className="muted" style={{ margin: '2px 0 12px' }}>
            {status && !status.needsAttention
              ? 'Taze kayıt bölgeyi canlı tutar; sen de ekleyebilirsin.'
              : 'İlk kaydı sen bırak, bölge yeşile dönsün.'}
          </p>
          <button className="btn full" onClick={() => setConfirmOpen(true)}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M4 12h16a8 8 0 0 1-16 0Z" />
              <path d="M9 9v3M15 8v4" />
            </svg>
            Buraya {typeLabel} bıraktım
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div className="backdrop" onClick={() => !busy && setConfirmOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Bulunduğun yere {typeLabel} bıraktın mı?</h2>
            <p className="muted">
              Fotoğrafını çek, haritada herkes görsün. Kayıt şu anki konumuna düşecek.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePhotoPicked(file);
                e.target.value = '';
              }}
            />
            <button className="btn full" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Gönderiliyor…' : `📷 Fotoğraf çek, ${typeLabel} bıraktım`}
            </button>
            <button
              className="btn ghost full"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              Vazgeç
            </button>
            {/* A food brand on the food map, a water brand on the water map. */}
            <AdBanner
              slot={viewType === 'food' ? 'food_popup' : 'water_popup'}
              visible={confirmOpen}
            />
          </div>
        </div>
      )}

      {hearts.map((h) => (
        <HeartBurst key={`${h.id}-${h.x}-${h.y}`} x={h.x} y={h.y} />
      ))}
    </div>
  );
}
