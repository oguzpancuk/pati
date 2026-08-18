import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { colorsFor, OTHER, patternsFor, type Species } from '@mobile/taxonomy';
import {
  addAnimalPhoto,
  AnimalMatch,
  createAnimal,
  matchAnimals,
  reportSighting,
  SimilarityLevel,
  SimilarityReason,
} from '../api';
import { AnimalAvatar } from '../avatars';
import {
  Coordinates,
  FALLBACK_CENTER,
  getCurrentLocation,
  describeLocationError,
} from '../location';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

// Sunucu genelde anında dönüyor; "yapay zekâ eşleştiriyor" ekranı en az bu
// kadar görünsün ki kullanıcı taramanın yapıldığını algılasın (mobil ile aynı).
const MIN_MATCHING_MS = 2000;

const SIMILARITY_LABEL: Record<SimilarityLevel, string> = {
  high: 'Yüksek benzerlik',
  medium: 'Orta benzerlik',
  low: 'Düşük benzerlik',
};
const SIMILARITY_TONE: Record<SimilarityLevel, string> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};
const REASON_LABEL: Record<SimilarityReason, string> = {
  breed: 'Aynı desen',
  color: 'Aynı renk',
  distance: 'Aynı sokakta',
};

// "Profiline bak" sayfadan ayrılınca form state'i ölür; metin alanları ve konum
// buraya yazılıp dönüşte geri okunuyor. Fotoğraflar (File) serileştirilemediği
// için taşınamıyor — dönüşte yeniden eklenmeleri gerekiyor.
const DRAFT_KEY = 'pati.yeniHayvanTaslak';

interface Draft {
  species: Species;
  breed: string | null;
  color: string | null;
  name: string;
  markings: string;
  location: Coordinates | null;
}

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function formatDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m uzakta`;
  return `${(meters / 1000).toFixed(1)} km uzakta`;
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [otherMode, setOtherMode] = useState(!!value && !options.includes(value));
  const [otherText, setOtherText] = useState(otherMode && value ? value : '');
  return (
    <>
      <div className="chiprow">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`chip ${!otherMode && value === opt ? 'selected' : ''}`}
            onClick={() => {
              setOtherMode(false);
              onChange(opt);
            }}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${otherMode ? 'selected' : ''}`}
          onClick={() => {
            setOtherMode(true);
            onChange(otherText.trim() || null);
          }}
        >
          {OTHER} (belirtiniz)
        </button>
      </div>
      {otherMode && (
        <label className="field">
          <input
            value={otherText}
            maxLength={120}
            placeholder="Kendin yaz"
            onChange={(e) => {
              setOtherText(e.target.value);
              onChange(e.target.value.trim() || null);
            }}
          />
        </label>
      )}
    </>
  );
}

type Step = 'form' | 'matching' | 'results';

export default function AddAnimalPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profil incelemesinden dönüşte taslak varsa form ondan açılır.
  const [draft] = useState(readDraft);
  const [species, setSpecies] = useState<Species>(draft?.species ?? 'cat');
  const [breed, setBreed] = useState<string | null>(draft?.breed ?? null);
  const [color, setColor] = useState<string | null>(draft?.color ?? null);
  const [name, setName] = useState(draft?.name ?? '');
  const [markings, setMarkings] = useState(draft?.markings ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Form açılır açılmaz konum deneniyor: alınamıyorsa (http adresi, izin yok)
  // kullanıcı kaydetmeden önce görsün, tarayıcı izin soracaksa şimdi sorsun.
  const [locationNote, setLocationNote] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getCurrentLocation()
      .then(() => alive && setLocationNote(null))
      .catch((err) => alive && setLocationNote(describeLocationError(err)));
    return () => {
      alive = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);

  // Akış: form → (kaydet) → eşleştirme beklemesi → adaylar → yeni kayıt ya da
  // mevcut profil. Mobil AddAnimalScreen ile aynı; mükerrer kayıt önleme
  // form doldurulduktan sonra yapılıyor ki karşılaştıracak bilgi olsun.
  const [step, setStep] = useState<Step>('form');
  const [candidates, setCandidates] = useState<AnimalMatch[]>([]);
  const [matchRadius, setMatchRadius] = useState(1000);
  const [location, setLocation] = useState<Coordinates | null>(draft?.location ?? null);

  // Profildeki "Bu o — eşleştir" butonu bizi router state ile buraya düşürür:
  // görülme bildir, profile dön. Konum taslakta saklanmıştı.
  const confirmedAnimalId: number | undefined = routerLocation.state?.confirmedAnimalId;
  useEffect(() => {
    if (!confirmedAnimalId) return;
    // State'i temizle ki yenilemede ikinci kez tetiklenmesin.
    navigate('.', { replace: true, state: null });
    const loc = readDraft()?.location;
    sessionStorage.removeItem(DRAFT_KEY);
    (async () => {
      try {
        if (loc) await reportSighting(confirmedAnimalId, loc.lat, loc.lng);
      } catch {
        // Görülme kaydı düşmese de kullanıcıyı profile götürmek daha doğru;
        // eşleştirme kararı verildi, akışı hatayla kesmeye değmez.
      }
      navigate(`/hayvanlar/${confirmedAnimalId}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedAnimalId]);

  function changeSpecies(next: Species) {
    setSpecies(next);
    // Desen ve renk listeleri türe göre değişiyor; eski seçim anlamsız kalır.
    setBreed(null);
    setColor(null);
  }

  /** Form gönderildi: önce eşleştir, sonra karar ver. */
  async function submit() {
    if (photos.length < MIN_PHOTOS) {
      setError(`En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
      return;
    }
    setError(null);
    setStep('matching');
    const startedAt = Date.now();
    try {
      // Konum alınamazsa (http adresi, izin yok) kayıt varsayılan merkeze
      // düşüyor; nedeni formda zaten yazıyor (locationNote), akış kesilmiyor.
      const loc = await getCurrentLocation().catch(() => FALLBACK_CENTER);
      setLocation(loc);
      const result = await matchAnimals({ lat: loc.lat, lng: loc.lng, species, breed, color });

      // Bekleme ekranı en az MIN_MATCHING_MS görünsün.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MATCHING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MATCHING_MS - elapsed));
      }

      setCandidates(result.candidates);
      setMatchRadius(result.radiusMeters);
      if (result.candidates.length === 0) {
        // Yakında aynı türden kayıt yok: soracak bir şey yok, doğrudan kaydet.
        await createNewAnimal(loc);
      } else {
        setStep('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eşleştirme yapılamadı');
      setStep('form');
    }
  }

  async function createNewAnimal(loc: Coordinates) {
    setBusy(true);
    try {
      const animal = await createAnimal({
        species,
        name: name.trim() || undefined,
        color: color ?? undefined,
        breed: breed ?? undefined,
        markings: markings.trim() || undefined,
        lat: loc.lat,
        lng: loc.lng,
      });
      await Promise.all(photos.map((p) => addAnimalPhoto(animal.id, p)));
      sessionStorage.removeItem(DRAFT_KEY);
      navigate(`/hayvanlar/${animal.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
      setStep(candidates.length > 0 ? 'results' : 'form');
    } finally {
      setBusy(false);
    }
  }

  /** Adaya dokununca profili inceleme modunda aç; taslağı saklayıp git. */
  function reviewCandidate(animal: AnimalMatch) {
    const toSave: Draft = { species, breed, color, name, markings, location };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
    navigate(`/hayvanlar/${animal.id}?inceleme=1`);
  }

  /** Adaylar listesinden "bu o" kararı olmadan doğrudan görülme bildirimi yok;
      inceleme profil üzerinden yapılıyor, mobil ile aynı akış. */

  if (step === 'matching') {
    return (
      <div className="page center-page">
        <div className="matching-stage">
          <span className="matching-ring" />
          <AnimalAvatar species={species} breed={breed} size={96} />
        </div>
        <h2 style={{ marginBottom: 4 }}>Yapay zekâ eşleştiriyor…</h2>
        <p className="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
          Girdiğin bilgiler sistemdeki hayvanlarla karşılaştırılıyor. Aynı hayvanın iki kez
          kaydedilmesini önlemek için yakındaki kayıtlar taranıyor.
        </p>
      </div>
    );
  }

  if (step === 'results') {
    return (
      <div className="page">
        <h1 style={{ marginTop: 0 }}>Benzer kayıtlar bulundu</h1>
        {error && <div className="error">{error}</div>}
        <div className="card flat">
          <p className="muted" style={{ margin: 0 }}>
            🔎 Girdiğin bilgiler{' '}
            {matchRadius >= 1000 ? `${matchRadius / 1000} km` : `${matchRadius} m`} içindeki{' '}
            {species === 'cat' ? 'kedilerle' : 'köpeklerle'} karşılaştırıldı. Birine dokunup
            profiline bak; oysa &quot;bu o&quot; de — konumu güncellenir ve bakım listene eklenir.
          </p>
        </div>

        {candidates.map((animal) => (
          <button
            key={animal.id}
            className="card row"
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => reviewCandidate(animal)}
          >
            <AnimalAvatar species={animal.species} breed={animal.breed} size={52} />
            <div className="grow">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
                <span className={`tag ${SIMILARITY_TONE[animal.similarity]}`}>
                  {SIMILARITY_LABEL[animal.similarity]}
                </span>
              </div>
              <div className="muted">
                {[animal.breed, animal.color].filter(Boolean).join(' · ') || 'Desen belirtilmemiş'}
              </div>
              <div className="subtle" style={{ marginTop: 2 }}>
                {[
                  ...animal.similarity_reasons.map((r) => REASON_LABEL[r]),
                  formatDistance(animal.distance_meters),
                ].join(' · ')}
              </div>
            </div>
            <span className="subtle">›</span>
          </button>
        ))}

        <button
          className="btn full"
          disabled={busy}
          onClick={() => location && createNewAnimal(location)}
          style={{ marginTop: 16 }}
        >
          {busy ? 'Kaydediliyor…' : 'Hiçbiri — yeni hayvan kaydet'}
        </button>
        <button
          className="btn ghost full"
          disabled={busy}
          onClick={() => setStep('form')}
          style={{ marginTop: 8 }}
        >
          Forma dön
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 style={{ marginTop: 0 }}>Yeni Hayvan</h1>
      {error && <div className="error">{error}</div>}
      {draft && photos.length === 0 && (
        <div className="card flat">
          <p className="muted" style={{ margin: 0 }}>
            Bilgilerin geri yüklendi; fotoğraflar tarayıcıda saklanamadığı için yeniden eklemen
            gerekiyor.
          </p>
        </div>
      )}

      <div className="label">TÜR</div>
      <div className="chiprow">
        {(
          [
            ['cat', 'Kedi'],
            ['dog', 'Köpek'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`chip ${species === value ? 'selected' : ''}`}
            onClick={() => changeSpecies(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="label">TÜR / DESEN</div>
      <Chips
        key={`b-${species}`}
        options={patternsFor(species)}
        value={breed}
        onChange={setBreed}
      />

      <div className="label">RENK</div>
      <Chips key={`c-${species}`} options={colorsFor(species)} value={color} onChange={setColor} />

      <label className="field">
        <span>İSİM (İSTEĞE BAĞLI)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Pamuk" />
      </label>
      <label className="field">
        <span>İŞARETLER / NOTLAR</span>
        <input
          value={markings}
          onChange={(e) => setMarkings(e.target.value)}
          placeholder="Örn. Sol kulakta çentik"
        />
      </label>

      <div className="label">FOTOĞRAFLAR (EN AZ {MIN_PHOTOS})</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {photos.map((p, i) => (
          <span key={i} className="round" style={{ width: 64, height: 64, position: 'relative' }}>
            <img
              src={URL.createObjectURL(p)}
              alt=""
              width={64}
              height={64}
              style={{ objectFit: 'cover', borderRadius: 10 }}
            />
          </span>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button className="btn secondary small" onClick={() => fileRef.current?.click()}>
            📷 Ekle
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPhotos((prev) => [...prev, file].slice(0, MAX_PHOTOS));
          e.target.value = '';
        }}
      />

      <p className="subtle">
        {locationNote
          ? `${locationNote} Kayıt varsayılan merkeze (Kadıköy) düşecek.`
          : 'Konumun otomatik olarak kaydedilecek.'}
      </p>
      <button className="btn full" disabled={busy} onClick={submit}>
        {busy ? 'Kaydediliyor…' : 'Hayvanı kaydet'}
      </button>
    </div>
  );
}
