import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { conditionsFor, OTHER, VACCINE_TYPES } from '@mobile/taxonomy';
import {
  addComment,
  addHealthRecord,
  addVaccination,
  AnimalComment,
  AnimalDetail,
  fetchAnimal,
  fetchComments,
  HealthRecord,
} from '../api';
import { AnimalAvatar, UserAvatar } from '../avatars';

const RECORD_TYPE_LABELS = { illness: 'Hastalık', injury: 'Yaralanma' } as const;
const STATUS_META = {
  not_started: { label: 'Tedaviye başlanmadı', cls: 'danger' },
  in_treatment: { label: 'Tedavi sürüyor', cls: 'warning' },
  recovered: { label: 'İyileşti', cls: 'success' },
} as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Listeden seç ya da "Diğer (belirtiniz)" ile yaz — mobil ChoiceField'in web
 * karşılığı. Seçenekler @mobile/taxonomy'den doğrudan geliyor, kopya yok.
 */
function ChoiceChips({
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

export default function AnimalPage() {
  const { id } = useParams();
  const animalId = Number(id);
  const [animal, setAnimal] = useState<AnimalDetail | null>(null);
  const [comments, setComments] = useState<AnimalComment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [linkedRecord, setLinkedRecord] = useState<HealthRecord | null>(null);
  const [sending, setSending] = useState(false);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordType, setRecordType] = useState<'illness' | 'injury'>('illness');
  const [recordDesc, setRecordDesc] = useState<string | null>(null);

  const [vaccineOpen, setVaccineOpen] = useState(false);
  const [vaccineType, setVaccineType] = useState<string | null>(null);
  const [vaccineNote, setVaccineNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [detail, commentData] = await Promise.all([
        fetchAnimal(animalId),
        fetchComments(animalId),
      ]);
      setAnimal(detail);
      setComments(commentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    }
  }, [animalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await addComment(animalId, draft.trim(), linkedRecord?.id);
      setDraft('');
      setLinkedRecord(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  async function saveRecord() {
    if (!recordDesc?.trim()) return;
    setSaving(true);
    try {
      await addHealthRecord(animalId, recordType, recordDesc.trim());
      setRecordOpen(false);
      setRecordDesc(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setSaving(false);
    }
  }

  async function saveVaccine() {
    if (!vaccineType?.trim()) return;
    setSaving(true);
    try {
      await addVaccination(animalId, vaccineType.trim(), vaccineNote.trim() || undefined);
      setVaccineOpen(false);
      setVaccineType(null);
      setVaccineNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setSaving(false);
    }
  }

  if (!animal) {
    return (
      <div className="page">
        {error ? <div className="error">{error}</div> : <p className="muted">Yükleniyor…</p>}
      </div>
    );
  }

  const displayName = animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek');
  const openRecords = animal.healthRecords.filter((r) => r.status !== 'recovered');

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      <div className="card row">
        <AnimalAvatar species={animal.species} breed={animal.breed} size={56} />
        <div className="grow">
          <h1 style={{ margin: 0, fontSize: 22 }}>{displayName}</h1>
          <div className="muted">
            {animal.color ?? 'Rengi belirtilmemiş'} · {animal.breed ?? 'Türü belirtilmemiş'}
          </div>
          {animal.markings && <div className="subtle">İşaretler: {animal.markings}</div>}
        </div>
      </div>

      {animal.photos.length > 0 && (
        <div className="photo-strip">
          {animal.photos.map((p) => (
            <img key={p.id} src={p.url} alt="" />
          ))}
        </div>
      )}

      {/* Aşı sağlık kaydının üstünde: sokakta ilk soru "aşılı mı". */}
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <div className="label" style={{ margin: 0 }}>
          AŞI KAYITLARI
        </div>
        {animal.isCarer && (
          <button className="btn ghost small" onClick={() => setVaccineOpen(true)}>
            + Aşı ekle
          </button>
        )}
      </div>
      {animal.vaccinations.length === 0 ? (
        <div className="card flat muted">Henüz aşı kaydı yok.</div>
      ) : (
        animal.vaccinations.map((v) => (
          <div key={v.id} className="card flat">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{v.vaccine_type}</strong>
              {v.vet_verified && <span className="tag success">Veteriner onaylı</span>}
            </div>
            {v.note && <div style={{ marginTop: 4 }}>{v.note}</div>}
            <div className="subtle" style={{ marginTop: 4 }}>
              {formatDate(v.administered_at)} · {v.recorded_by_name ?? ''}
              {v.next_due_at ? ` · Sonraki doz: ${formatDate(v.next_due_at)}` : ''}
            </div>
          </div>
        ))
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <div className="label" style={{ margin: 0 }}>
          SAĞLIK KAYITLARI
        </div>
        {animal.isCarer && (
          <button className="btn ghost small" onClick={() => setRecordOpen(true)}>
            + Kayıt ekle
          </button>
        )}
      </div>
      {!animal.isCarer && (
        <p className="subtle">Sağlık kaydı ekleyebilmek için önce bu hayvana yorum yap.</p>
      )}
      {animal.healthRecords.length === 0 ? (
        <div className="card flat muted">Henüz kayıt yok.</div>
      ) : (
        animal.healthRecords.map((r) => {
          const st = STATUS_META[r.status];
          return (
            <div key={r.id} className="card flat">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  {RECORD_TYPE_LABELS[r.record_type]}
                  {r.vet_verified ? ' · Veteriner onaylı' : ''}
                </strong>
                <span className={`tag ${st.cls}`}>{st.label}</span>
              </div>
              <div style={{ marginTop: 4 }}>{r.description}</div>
              <div className="subtle" style={{ marginTop: 4 }}>
                {r.recorded_by_name ?? ''} · {r.comment_count} yorum
                {r.status === 'recovered' && r.recovered_by_name
                  ? ` · ${r.recovered_by_name} iyileşti olarak işaretledi`
                  : ''}
              </div>
            </div>
          );
        })
      )}

      <div className="label">SOHBET</div>
      {comments.length === 0 && (
        <div className="card flat muted">Henüz yorum yok. İlk yorumu sen yap.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="row" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
          <UserAvatar avatarUrl={c.avatar_url} name={c.user_name} size={34} />
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 14 }}>{c.user_name}</strong>
              <span className="subtle">{formatDate(c.created_at)}</span>
            </div>
            {c.health_record_type && (
              <div className="subtle" style={{ color: 'var(--brand)', fontWeight: 700 }}>
                {RECORD_TYPE_LABELS[c.health_record_type]}: {c.health_record_description}
              </div>
            )}
            <div>{c.body}</div>
          </div>
        </div>
      ))}

      <form onSubmit={sendComment} className="card" style={{ position: 'sticky', bottom: 0 }}>
        {openRecords.length > 0 && (
          <div className="chiprow scroll">
            <button
              type="button"
              className={`chip ${!linkedRecord ? 'selected' : ''}`}
              onClick={() => setLinkedRecord(null)}
            >
              Genel
            </button>
            {openRecords.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`chip ${linkedRecord?.id === r.id ? 'selected' : ''}`}
                onClick={() => setLinkedRecord(r)}
              >
                {RECORD_TYPE_LABELS[r.record_type]}: {r.description}
              </button>
            ))}
          </div>
        )}
        <div className="row">
          <input
            className="grow"
            style={{
              border: '1.5px solid var(--border)',
              borderRadius: 10,
              padding: 10,
              background: 'var(--surface)',
            }}
            placeholder="Yorum yaz…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button className="btn small" disabled={sending || !draft.trim()}>
            Gönder
          </button>
        </div>
      </form>

      {recordOpen && (
        <div className="backdrop" onClick={() => !saving && setRecordOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Sağlık kaydı ekle</h2>
            <div className="chiprow">
              {(['illness', 'injury'] as const).map((t) => (
                <button
                  key={t}
                  className={`chip ${recordType === t ? 'selected' : ''}`}
                  onClick={() => {
                    setRecordType(t);
                    setRecordDesc(null);
                  }}
                >
                  {RECORD_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <div className="label">{recordType === 'illness' ? 'HASTALIK' : 'YARALANMA'}</div>
            <ChoiceChips
              options={conditionsFor(recordType)}
              value={recordDesc}
              onChange={setRecordDesc}
            />
            <button className="btn full" disabled={saving || !recordDesc} onClick={saveRecord}>
              Kaydet
            </button>
            <button
              className="btn ghost full"
              disabled={saving}
              onClick={() => setRecordOpen(false)}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {vaccineOpen && (
        <div className="backdrop" onClick={() => !saving && setVaccineOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Aşı kaydı ekle</h2>
            <div className="label">AŞI TÜRÜ</div>
            <ChoiceChips options={VACCINE_TYPES} value={vaccineType} onChange={setVaccineType} />
            <label className="field">
              <span>NOT (İSTEĞE BAĞLI)</span>
              <input
                value={vaccineNote}
                onChange={(e) => setVaccineNote(e.target.value)}
                placeholder="Örn. Belediye ekibi yaptı"
              />
            </label>
            <button className="btn full" disabled={saving || !vaccineType} onClick={saveVaccine}>
              Kaydet
            </button>
            <button
              className="btn ghost full"
              disabled={saving}
              onClick={() => setVaccineOpen(false)}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
