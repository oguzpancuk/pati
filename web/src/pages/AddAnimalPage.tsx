import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  colorsFor,
  fixedColorFor,
  isPresetChoice,
  MULTI_CHOICE_SEPARATOR,
  OTHER,
  patternsFor,
  type Species,
} from '@mobile/taxonomy';
import {
  ApiError,
  addAnimalPhoto,
  AnimalMatch,
  createAnimal,
  matchAnimals,
  reportSighting,
  SimilarityLevel,
  SimilarityReason,
} from '../api';
import { AnimalAvatar } from '../avatars';
import { isPermissionFailure } from '../addAnimalGate';
import { useBadgeAwards } from '../badgeAwards';
import { ChipRow } from '../components/ChipRow';
import { Coordinates, getCurrentLocation, describeLocationError } from '../location';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

/**
 * The token from the match step first — the file is already up and
 * screened; a missing or expired one falls back to the file itself, which
 * the server screens inline.
 */
async function uploadAnimalPhoto(animalId: number, photo: File, token?: string) {
  if (token) {
    try {
      return await addAnimalPhoto(animalId, { photoToken: token });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'photoTokenInvalid')) throw err;
    }
  }
  return addAnimalPhoto(animalId, photo);
}

// The server usually responds instantly; show the "AI matching" screen for
// at least this long so the user perceives that a scan happened (same as
// mobile).
// The matching screen stays up for the real comparison (ADR-0005), which
// takes seconds; this floor only keeps the field-only answer — instant when
// the model is off — from flashing past as a glitch.
const MIN_MATCHING_MS = 800;

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
  photo_same: 'Fotoğrafta aynı hayvan',
  photo_similar: 'Fotoğraf benziyor',
  breed: 'Aynı desen',
  color: 'Aynı renk',
  distance: 'Aynı sokakta',
};

// Leaving the page via "view profile" kills the form state; text fields and
// the location are written here and read back on return. Photos (File) can't
// be serialized so they don't survive — they must be re-added on return.
const DRAFT_KEY = 'pati.yeniHayvanTaslak';

interface Draft {
  species: Species | null;
  breed: string | null;
  /** Selected colors; a non-listed element is the free "Diğer" text. */
  colors: string[];
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
      <ChipRow>
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
      </ChipRow>
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

/**
 * Multi-select sibling of Chips (same as mobile's MultiChoiceField): pick any
 * number of listed options plus an optional "Diğer" free text. The parent
 * flattens the array with MULTI_CHOICE_SEPARATOR into the single `color`
 * column — no schema change.
 */
function MultiChips({
  options,
  value,
  onChange,
  maxTotalLength = 120,
}: {
  options: string[];
  /** Listed options as-is; a non-listed element is the free "Diğer" text. */
  value: string[];
  onChange: (v: string[]) => void;
  maxTotalLength?: number;
}) {
  // Selection state lives HERE (same as mobile's MultiChoiceField): `value`
  // only seeds the initial state, so free text that happens to spell an
  // option name is never re-absorbed into the preset chips on re-render.
  // Reset by remounting with a new key.
  const [presets, setPresets] = useState(() => value.filter((v) => options.includes(v)));
  const [otherText, setOtherText] = useState(() => value.find((v) => !options.includes(v)) ?? '');
  const [otherMode, setOtherMode] = useState(otherText.length > 0);

  /** Characters the free text may use next to these presets (join cap). */
  function budgetFor(nextPresets: string[]): number {
    const joined = nextPresets.join(MULTI_CHOICE_SEPARATOR).length;
    return Math.max(
      0,
      maxTotalLength - joined - (nextPresets.length > 0 ? MULTI_CHOICE_SEPARATOR.length : 0)
    );
  }
  const otherBudget = budgetFor(presets);

  function emit(nextPresets: string[], nextOther: string) {
    // Clamp here too: the input's maxLength only blocks NEW keystrokes, it
    // does not shrink text typed before a preset ate part of the budget.
    const trimmed = nextOther.trim().slice(0, budgetFor(nextPresets));
    // A free text identical to a selected preset would double up in the
    // flattened string; drop it.
    onChange(trimmed && !nextPresets.includes(trimmed) ? [...nextPresets, trimmed] : nextPresets);
  }

  function togglePreset(option: string) {
    const next = presets.includes(option)
      ? presets.filter((p) => p !== option)
      : // Options' own order, so the flattened string is stable regardless
        // of click order.
        options.filter((o) => presets.includes(o) || o === option);
    setPresets(next);
    // Shrink visible free text along with its budget so the field always
    // shows exactly what will be stored.
    const clamped = otherMode ? otherText.slice(0, budgetFor(next)) : '';
    if (otherMode && clamped !== otherText) setOtherText(clamped);
    emit(next, clamped);
  }

  return (
    <>
      <ChipRow>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`chip ${presets.includes(opt) ? 'selected' : ''}`}
            onClick={() => togglePreset(opt)}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${otherMode ? 'selected' : ''}`}
          onClick={() => {
            const next = !otherMode;
            setOtherMode(next);
            emit(presets, next ? otherText : '');
          }}
        >
          {OTHER} (belirtiniz)
        </button>
      </ChipRow>
      {otherMode && (
        <label className="field">
          <input
            value={otherText}
            maxLength={otherBudget}
            placeholder="Kendin yaz"
            onChange={(e) => {
              setOtherText(e.target.value);
              emit(presets, e.target.value);
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
  // No species preselected: the pattern and color pickers are species-bound
  // and stay hidden until this choice is made (sprint item 3 decision).
  const [species, setSpecies] = useState<Species | null>(draft?.species ?? null);
  const [breed, setBreed] = useState<string | null>(draft?.breed ?? null);
  const [colorChoices, setColorChoices] = useState<string[]>(
    // Older drafts stored a single `color` string; ignore those.
    Array.isArray(draft?.colors) ? draft.colors : []
  );
  const [name, setName] = useState(draft?.name ?? '');
  const [markings, setMarkings] = useState(draft?.markings ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  // The match step screens every photo and hands back one token per photo
  // (same order); the create step redeems them so the photos travel once.
  // Any change to the list invalidates them — the order is the pairing.
  const [photoTokens, setPhotoTokens] = useState<string[]>([]);
  // Whether the model compared the photo — the results banner says which
  // comparison the tiers came from.
  const [photoChecked, setPhotoChecked] = useState(false);
  // Blob URLs are minted once per photo list and revoked when replaced or on
  // unmount: minting in render re-decoded every full-size photo on each
  // keystroke and grew the URL registry until page unload (review finding).
  const photoUrls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(
    () => () => {
      photoUrls.forEach((url) => URL.revokeObjectURL(url));
    },
    [photoUrls]
  );
  const [error, setError] = useState<string | null>(null);
  // The form needs a location before it opens (owner decision, 2026-09-07):
  // the entry buttons already asked, but a typed URL or a reload lands
  // here directly — so the page asks again and shows a refusal instead of
  // the form when there is none.
  const [locationBlocked, setLocationBlocked] = useState<string | null>(null);
  const [locationAttempt, setLocationAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    getCurrentLocation()
      .then(() => alive && setLocationBlocked(null))
      .catch((err) => {
        // Only a missing permission blocks (mobile parity); a fix that is
        // slow today is the save step's problem.
        if (alive && isPermissionFailure(err)) setLocationBlocked(describeLocationError(err));
      });
    return () => {
      alive = false;
    };
  }, [locationAttempt]);
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

  // The DB column value: preset picks and/or the "Diğer" text, joined.
  // A fixed-color pattern auto-stores its canonical color (no picker shown).
  const fixedColor = species ? fixedColorFor(species, breed) : null;
  const color =
    fixedColor ?? (colorChoices.length > 0 ? colorChoices.join(MULTI_CHOICE_SEPARATOR) : null);

  function changeSpecies(next: Species) {
    setSpecies(next);
    // Pattern and color lists change per species; the old pick becomes meaningless.
    setBreed(null);
    setColorChoices([]);
  }

  /**
   * A pattern switch changes which three colors are on offer, so the picks
   * reset with it — otherwise colors chosen under the previous pattern
   * survive invisibly and get submitted (review finding on 205b9b0). The
   * reset keys on the preset-pattern identity, not the raw text: free
   * "Diğer" typing changes the value per keystroke and must not wipe picks.
   */
  function changeBreed(next: string | null) {
    if (species) {
      const prevKey = breed && isPresetChoice(breed, patternsFor(species)) ? breed : OTHER;
      const nextKey = next && isPresetChoice(next, patternsFor(species)) ? next : OTHER;
      if (prevKey !== nextKey) setColorChoices([]);
    }
    setBreed(next);
  }

  /** Form submitted: match first, decide after. */
  async function submit() {
    if (!species) {
      setError('Önce kedi mi köpek mi olduğunu seçmelisin.');
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setError(`En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
      return;
    }
    setError(null);
    setStep('matching');
    const startedAt = Date.now();
    try {
      // No fallback centre any more: a record without the real location is
      // not a record (owner decision). A failure here sends the user back
      // to the form with the reason.
      const loc = await getCurrentLocation();
      setLocation(loc);
      const result = await matchAnimals({
        lat: loc.lat,
        lng: loc.lng,
        species,
        breed,
        color,
        photos,
      });

      // Show the waiting screen for at least MIN_MATCHING_MS.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MATCHING_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_MATCHING_MS - elapsed));
      }

      const tokens = result.photoTokens ?? [];
      setPhotoTokens(tokens);
      setCandidates(result.candidates);
      setMatchRadius(result.radiusMeters);
      setPhotoChecked(result.photoChecked);
      if (result.candidates.length === 0) {
        // No same-species records nearby: nothing to ask, save directly.
        await createNewAnimal(loc, tokens);
      } else {
        setStep('results');
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'photoRejected') {
        // The model saw no cat/dog (or the other species) in one photo:
        // that photo leaves the strip, the reason stays above the form,
        // and the user picks another — no "add anyway" (ADR-0005).
        const listed = err.data.photoIndexes;
        const refused = new Set<number>(
          Array.isArray(listed) && listed.length > 0
            ? (listed as number[])
            : [Number.isInteger(err.data.photoIndex) ? (err.data.photoIndex as number) : 0]
        );
        setPhotos((prev) => prev.filter((_, i) => !refused.has(i)));
        setPhotoTokens([]);
        setError(
          `${err.message} ${refused.size > 1 ? 'Bu fotoğrafları' : 'Bu fotoğrafı'} listeden kaldırdık; ${
            species === 'dog' ? 'köpeğin' : 'kedinin'
          } göründüğü ${refused.size > 1 ? 'yeni fotoğraflar' : 'bir fotoğraf'} ekle.`
        );
      } else {
        setError(err instanceof Error ? err.message : 'Eşleştirme yapılamadı');
      }
      setStep('form');
    }
  }

  /**
   * `tokens` pairs with `photos` by index; submit passes the fresh ones
   * because the state has not settled yet, the results step uses the state.
   */
  async function createNewAnimal(loc: Coordinates, tokens: string[] = photoTokens) {
    if (!species) return; // unreachable: submit gates on species
    setBusy(true);
    let animal: Awaited<ReturnType<typeof createAnimal>>;
    try {
      animal = await createAnimal({
        species,
        name: name.trim() || undefined,
        color: color ?? undefined,
        breed: breed ?? undefined,
        markings: markings.trim() || undefined,
        lat: loc.lat,
        lng: loc.lng,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
      setStep(candidates.length > 0 ? 'results' : 'form');
      setBusy(false);
      return;
    }
    // The record exists from here on: a photo that fails still lands the
    // user on the profile (with the reason), never back on a form whose
    // save would register the animal twice.
    const failures: string[] = [];
    await Promise.all(
      photos.map((photo, i) =>
        uploadAnimalPhoto(animal.id, photo, tokens[i]).catch((err) => {
          failures.push(err instanceof Error ? err.message : 'Bir hata oluştu');
        })
      )
    );
    setBusy(false);
    sessionStorage.removeItem(DRAFT_KEY);
    if (failures.length > 0) {
      window.alert(
        `${failures.length === photos.length ? 'Fotoğraflar' : 'Bazı fotoğraflar'} eklenemedi: ${
          failures[0]
        } Fotoğrafı daha sonra profilden ekleyebilirsin.`
      );
    }
    navigate(`/hayvanlar/${animal.id}`, { replace: true });
    celebrate(animal);
  }

  /** Tapping a candidate opens its profile in review mode; stash the draft and go. */
  function reviewCandidate(animal: AnimalMatch) {
    const toSave: Draft = { species, breed, colors: colorChoices, name, markings, location };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
    navigate(`/hayvanlar/${animal.id}?inceleme=1`);
  }

  /** No direct sighting report from the candidate list without a "that's the
      one" decision; the review happens on the profile, same flow as mobile. */

  if (locationBlocked) {
    return (
      <div className="page">
        <h1 style={{ marginTop: 0 }}>Yeni hayvan</h1>
        <div className="card flat">
          <p className="muted" style={{ margin: 0 }}>
            {locationBlocked} Konum olmadan hayvan eklenemez: kayıt, bulunduğun yere düşer.
          </p>
        </div>
        {/* A typed URL has no history to go back to: real links, and a
            retry for the case where the permission was just granted. */}
        <button
          className="btn full"
          style={{ marginTop: 12 }}
          onClick={() => setLocationAttempt((n) => n + 1)}
        >
          Tekrar dene
        </button>
        <Link to="/hayvanlar" replace className="btn ghost full" style={{ marginTop: 8 }}>
          Hayvanlara dön
        </Link>
      </div>
    );
  }

  if (step === 'matching' && species) {
    return (
      <div className="page center-page">
        <div className="matching-stage">
          <span className="matching-ring" />
          <AnimalAvatar species={species} breed={breed} size={96} />
        </div>
        <h2 style={{ marginBottom: 4 }}>Yapay zekâ eşleştiriyor…</h2>
        <p className="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
          Fotoğrafın ve girdiğin bilgiler yakındaki kayıtlarla karşılaştırılıyor. Aynı hayvanın iki
          kez kaydedilmesini önlemek için birkaç saniye sürebilir.
        </p>
      </div>
    );
  }

  if (step === 'results' && species) {
    return (
      <div className="page">
        <h1 style={{ marginTop: 0 }}>Benzer kayıtlar bulundu</h1>
        {error && <div className="error">{error}</div>}
        <div className="card flat">
          <p className="muted" style={{ margin: 0 }}>
            🔎 {photoChecked ? 'Fotoğrafın ve girdiğin bilgiler' : 'Girdiğin bilgiler'}{' '}
            {matchRadius >= 1000 ? `${matchRadius / 1000} km` : `${matchRadius} m`} içindeki{' '}
            {species === 'cat' ? 'kedilerle' : 'köpeklerle'} karşılaştırıldı; yalnızca yüksek ve
            orta benzerlikteki kayıtlar listelendi. Birine dokunup profiline bak; oysa &quot;bu
            o&quot; de — konumu güncellenir ve bakım listene eklenir.
          </p>
        </div>

        {candidates.map((animal) => (
          <button
            key={animal.id}
            className="card row"
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => reviewCandidate(animal)}
          >
            <AnimalAvatar
              species={animal.species}
              breed={animal.breed}
              photoUrl={animal.cover_thumb_url}
              size={52}
            />
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

      {/* Live avatar preview (mobile parity): the profile picture is
          generated from species+pattern, so show it while the form fills. */}
      <div style={{ textAlign: 'center', margin: '4px 0 14px' }}>
        {species ? (
          <AnimalAvatar species={species} breed={breed} size={96} />
        ) : (
          <div
            aria-hidden
            style={{
              width: 96,
              height: 96,
              margin: '0 auto',
              borderRadius: '50%',
              border: '2px dashed var(--border-strong)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              color: 'var(--text-muted)',
            }}
          >
            🐾
          </div>
        )}
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {species
            ? 'Profil resmi tür ve desene göre otomatik oluşur'
            : 'Önce tür seç; profil resmi tür ve desene göre oluşur'}
        </div>
      </div>

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

      {/* The pickers cascade (owner decision, sprint item 3 revision):
          species opens the pattern list, and the COLOR list opens only once
          a pattern is chosen — ordered by that pattern's most common street
          colors. Keys remount so internal "Diğer" state resets; the color
          field keys on the preset pattern only, because free "Diğer" text
          changes per keystroke and would wipe the color picks mid-typing. */}
      {species && (
        <>
          <div className="label">tür / desen</div>
          <Chips
            key={`b-${species}`}
            options={patternsFor(species)}
            value={breed}
            onChange={changeBreed}
          />

          {/* Fixed-color patterns show no picker; the canonical color is
              stored silently (owner decision). */}
          {breed && !fixedColor && (
            <>
              <div className="label">renk (birden fazla seçebilirsin)</div>
              <MultiChips
                key={`c-${species}-${isPresetChoice(breed, patternsFor(species)) ? breed : OTHER}`}
                options={colorsFor(species, breed)}
                value={colorChoices}
                onChange={setColorChoices}
              />
            </>
          )}
        </>
      )}

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
        {photos.map((_p, i) => (
          <span key={i} className="round" style={{ width: 64, height: 64, position: 'relative' }}>
            <img
              src={photoUrls[i]}
              alt=""
              width={64}
              height={64}
              style={{ objectFit: 'cover', borderRadius: 10 }}
            />
            {/* Mobile parity: a mis-picked photo must be removable without
                abandoning the form. */}
            <button
              aria-label="Fotoğrafı kaldır"
              onClick={() => {
                setPhotos((prev) => prev.filter((_, idx) => idx !== i));
                setPhotoTokens([]);
              }}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: 'none',
                background: 'var(--danger, #ff5c5c)',
                color: '#fff',
                fontSize: 12,
                lineHeight: '20px',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </span>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button className="btn secondary small" onClick={() => fileRef.current?.click()}>
            📷 Ekle
          </button>
        )}
      </div>
      {/* `multiple`, no `capture`: several gallery photos in one pass, like
          the mobile picker — capture forced the camera and single-shot. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) {
            // Overflow must not vanish silently (review finding). Checked
            // outside the updater — StrictMode double-invokes updaters.
            if (photos.length + picked.length > MAX_PHOTOS) {
              setError(`En fazla ${MAX_PHOTOS} fotoğraf eklenebilir.`);
            }
            setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
            setPhotoTokens([]);
          }
          e.target.value = '';
        }}
      />

      <p className="subtle">Konumun otomatik olarak kaydedilecek.</p>
      <button className="btn full" disabled={busy} onClick={submit}>
        {busy ? 'Kaydediliyor…' : 'Hayvanı kaydet'}
      </button>
    </div>
  );
}
