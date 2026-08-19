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
import { useBadgeAwards } from '../badgeAwards';
import {
  Coordinates,
  FALLBACK_CENTER,
  getCurrentLocation,
  describeLocationError,
} from '../location';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

// The server usually responds instantly; show the "AI matching" screen for
// at least this long so the user perceives that a scan happened (same as
// mobile).
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

// Leaving the page via "view profile" kills the form state; text fields and
// the location are written here and read back on return. Photos (File) can't
// be serialized so they don't survive — they must be re-added on return.
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
  const { celebrate } = useBadgeAwards();
  const routerLocation = useLocation();
  const fileRef = useRef<HTMLInputElement>(null);

  // If a draft exists on return from the profile review, the form opens from it.
  const [draft] = useState(readDraft);
  const [species, setSpecies] = useState<Species>(draft?.species ?? 'cat');
  const [breed, setBreed] = useState<string | null>(draft?.breed ?? null);
  const [color, setColor] = useState<string | null>(draft?.color ?? null);
  const [name, setName] = useState(draft?.name ?? '');
  const [markings, setMarkings] = useState(draft?.markings ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The location is tried as soon as the form opens: if unavailable (http
  // origin, no permission) the user sees it before saving, and if the browser
  // will ask for permission, it asks now.
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

  // Flow: form → (save) → matching wait → candidates → new record or an
  // existing profile. Same as mobile's AddAnimalScreen; duplicate prevention
  // runs after the form is filled so there is something to compare.
  const [step, setStep] = useState<Step>('form');
  const [candidates, setCandidates] = useState<AnimalMatch[]>([]);
  const [matchRadius, setMatchRadius] = useState(1000);
  const [location, setLocation] = useState<Coordinates | null>(draft?.location ?? null);

  // The profile's "that's the one — match" button drops us here via router
  // state: report the sighting, return to the profile. The location was kept
  // in the draft.
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
        // Even if the sighting fails to record, taking the user to the
        // profile is right; the match decision is made, not worth breaking
        // the flow with an error.
      }
      navigate(`/hayvanlar/${confirmedAnimalId}`, { replace: true });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmedAnimalId]);

  function changeSpecies(next: Species) {
    setSpecies(next);
    // Pattern and color lists change per species; the old pick becomes meaningless.
    setBreed(null);
    setColor(null);
  }

  /** Form submitted: match first, decide after. */
  async function submit() {
    if (photos.length < MIN_PHOTOS) {
      setError(`En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
      return;
    }
    setError(null);
    setStep('matching');
    const startedAt = Date.now();
    try {
      // Without a location (http origin, no permission) the record falls to
      // the default center; the reason already shows on the form
      // (locationNote), the flow isn't interrupted.
      const loc = await getCurrentLocation().catch(() => FALLBACK_CENTER);
      setLocation(loc);
      const result = await matchAnimals({ lat: loc.lat, lng: loc.lng, species, breed, color });

      // Show the waiting screen for at least MIN_MATCHING_MS.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MATCHING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MATCHING_MS - elapsed));
      }

      setCandidates(result.candidates);
      setMatchRadius(result.radiusMeters);
      if (result.candidates.length === 0) {
        // No same-species records nearby: nothing to ask, save directly.
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
      celebrate(animal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
      setStep(candidates.length > 0 ? 'results' : 'form');
    } finally {
      setBusy(false);
    }
  }

  /** Tapping a candidate opens its profile in review mode; stash the draft and go. */
  function reviewCandidate(animal: AnimalMatch) {
    const toSave: Draft = { species, breed, color, name, markings, location };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
    navigate(`/hayvanlar/${animal.id}?inceleme=1`);
  }

  /** No direct sighting report from the candidate list without a "that's the
      one" decision; the review happens on the profile, same flow as mobile. */

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

      <div className="label">tür</div>
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

      <div className="label">tür / desen</div>
      <Chips
        key={`b-${species}`}
        options={patternsFor(species)}
        value={breed}
        onChange={setBreed}
      />

      <div className="label">renk</div>
      <Chips key={`c-${species}`} options={colorsFor(species)} value={color} onChange={setColor} />

      <label className="field">
        <span>isim (isteğe bağlı)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Pamuk" />
      </label>
      <label className="field">
        <span>işaretler / notlar</span>
        <input
          value={markings}
          onChange={(e) => setMarkings(e.target.value)}
          placeholder="Örn. Sol kulakta çentik"
        />
      </label>

      <div className="label">fotoğraflar (en az {MIN_PHOTOS})</div>
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
