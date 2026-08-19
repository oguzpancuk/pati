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

// Mobil MapScreen ile aynı kurallar: Türkiye sınır kutusu, 100 m daireler,
// ağırlığa göre solan yeşil, sokak ölçeğinde görünen hayvanlar. Kırmızı taban
// katmanı mobille birlikte kaldırıldı ("her yer alarm" hissi veriyordu);
// eksiklik mesajını üstteki banner taşıyor, yeşil buna karşılık daha tok.
const TURKEY_BOUNDS = { minLat: 35.8, maxLat: 42.1, minLng: 25.6, maxLng: 44.8 };
const ACTION_CIRCLE_RADIUS_METERS = 100;
// Hayvanlar yalnızca kullanıcının yakın çevresinde (200 m) ve harita iyice
// yaklaştırılınca (sokak/bina ölçeği) çiziliyor: uzaktan onlarca avatar
// haritayı kapatıyordu, kullanıcının işi zaten bulunduğu sokaktaki hayvanlarla.
const ANIMAL_RADIUS_METERS = 200;
const ANIMAL_VISIBLE_MIN_ZOOM = 17;
const MAX_GREEN_ALPHA = 0.5;
// Mama/su bırakılınca haritanın odaklandığı ölçek: 100 m'lik daire ve içindeki
// hayvanlar görünsün.
const CELEBRATE_ZOOM = 18;

type ViewType = 'food' | 'water';

export default function MapPage() {
  const navigate = useNavigate();
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const circlesRef = useRef<L.LayerGroup | null>(null);
  const animalsRef = useRef<L.LayerGroup | null>(null);
  // Son çekilen hayvan listesi: kalp animasyonu için hangileri etki alanında
  // diye bakılıyor (katmandaki marker'lardan geri okumak yerine).
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

  // Harita bir kez kuruluyor; veri katmanları ayrı efektlerde tazeleniyor.
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
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    circlesRef.current = L.layerGroup().addTo(map);
    animalsRef.current = L.layerGroup().addTo(map);
    map.on('zoomend', () => setZoomedIn(map.getZoom() >= ANIMAL_VISIBLE_MIN_ZOOM));
    setZoomedIn(map.getZoom() >= ANIMAL_VISIBLE_MIN_ZOOM);
    mapRef.current = map;

    getCurrentLocation()
      .then((loc) => {
        // Konum, sayfadan çıkıldıktan sonra da gelebilir; kaldırılmış haritada
        // setView çağırmak Leaflet'i patlatıyor (_leaflet_pos hatası).
        if (mapRef.current !== map) return;
        setMyLocation(loc);
        map.setView([loc.lat, loc.lng], 16);
        L.circleMarker([loc.lat, loc.lng], {
          radius: 8,
          color: '#fff',
          weight: 2,
          fillColor: '#4A8FF4',
          fillOpacity: 1,
        }).addTo(map);
      })
      .catch(() => {
        /* Konum yoksa Kadıköy'de kalınır; kayıt eklerken tekrar istenir. */
      });

    return () => {
      // Süren pan/zoom animasyonu varken remove() Leaflet'i patlatıyor
      // (_leaflet_pos): önce animasyonu durdur.
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
    for (const action of actions) {
      const [lng, lat] = action.location.coordinates;
      const alpha = Math.min(Math.max(Number(action.weight), 0), 1) * MAX_GREEN_ALPHA;
      L.circle([lat, lng], {
        radius: ACTION_CIRCLE_RADIUS_METERS,
        color: 'transparent',
        fillColor: '#34A853',
        fillOpacity: alpha,
        interactive: false,
      }).addTo(layer);
    }
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
          // divIcon ile hayvanın desen avatarı doğrudan marker oluyor —
          // paylaşılan SVG üreticisinin haritadaki karşılığı.
          html: `<div class="animal-marker">${animalAvatarSvg(animal.species, animal.breed, 32)}</div>`,
          className: '',
          iconSize: [36, 36],
          iconAnchor: [18, 18],
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

  // Hayvanlar yalnızca sokak ölçeğinde: şehir ölçeğinde marker'lar üst üste
  // binip haritayı kapatıyordu (mobil ile aynı gerekçe).
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
   * Bırakılan mama/suyun etki alanındaki (100 m) hayvanların avatarından
   * kalpler çıkar. Harita önce o alana yaklaşır (avatarlar ancak yakında
   * çiziliyor); ekran noktaları hareket bitince (moveend) hesaplanır.
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

  /** Fotoğraf seçildi → konumu al → kaydı bulunulan noktaya bırak. */
  async function handlePhotoPicked(file: File) {
    setBusy(true);
    setError(null);
    try {
      // Konum alınamazsa (http adresi, izin yok) kullanıcıyı engellemek yerine
      // haritanın ortası kullanılıyor ve nedeni söyleniyor: kişi zaten baktığı
      // yere bırakıyor. Mobil uygulama gerçek konumu şart koşuyor; web daha
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
              {t === 'food' ? 'Mama' : 'Su'}
            </button>
          ))}
        </div>
        {status?.needsAttention && (
          <div className="banner">
            Buralarda {typeLabel} yok — {status.radiusMeters} m çevrede kayıt bulunmuyor.
          </div>
        )}
        {error && <div className="banner">{error}</div>}
      </div>

      <div className="map-bottom">
        <button className="btn full" onClick={() => setConfirmOpen(true)}>
          Buraya {typeLabel} bıraktım
        </button>
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
            {/* Mama haritasında mama markası, su haritasında su markası. */}
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
