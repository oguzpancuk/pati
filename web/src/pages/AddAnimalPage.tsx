import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { colorsFor, OTHER, patternsFor, type Species } from '@mobile/taxonomy';
import { addAnimalPhoto, createAnimal } from '../api';
import { getCurrentLocation } from '../location';

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 6;

function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');
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

export default function AddAnimalPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [species, setSpecies] = useState<Species>('cat');
  const [breed, setBreed] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [markings, setMarkings] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function changeSpecies(next: Species) {
    setSpecies(next);
    // Desen ve renk listeleri türe göre değişiyor; eski seçim anlamsız kalır.
    setBreed(null);
    setColor(null);
  }

  async function submit() {
    if (photos.length < MIN_PHOTOS) {
      setError(`En az ${MIN_PHOTOS} fotoğraf eklemelisin.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const loc = await getCurrentLocation().catch(() => {
        throw new Error('Konum alınamadı — tarayıcıya konum izni verin');
      });
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
      navigate(`/hayvanlar/${animal.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1 style={{ marginTop: 0 }}>Yeni Hayvan</h1>
      {error && <div className="error">{error}</div>}

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

      <p className="subtle">Konumun otomatik olarak kaydedilecek.</p>
      <button className="btn full" disabled={busy} onClick={submit}>
        {busy ? 'Kaydediliyor…' : 'Hayvanı kaydet'}
      </button>
    </div>
  );
}
