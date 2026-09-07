import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { mergeById } from '@mobile/paging';
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
  markHealthRecordRecovered,
  reopenHealthRecord,
} from '../api';
import { AnimalAvatar, UserAvatar } from '../avatars';
import { MiniMap } from '../components/MiniMap';
import { ReportLink } from '../components/ReportDialog';
import { useBadgeAwards } from '../badgeAwards';
import { AdBanner } from '../components/AdBanner';
import { ChipRow } from '../components/ChipRow';

const RECORD_TYPE_LABELS = { illness: 'Hastalık', injury: 'Yaralanma' } as const;
const STATUS_META = {
  not_started: { label: 'tedaviye başlanmadı', cls: 'danger' },
  in_treatment: { label: 'tedavi sürüyor', cls: 'warning' },
  recovered: { label: 'iyileşti', cls: 'success' },
} as const;

// Same numbers as mobile's AnimalProfileScreen: chat opens with the last 3
// comments, "load earlier" pages by 20; record cards fold at 2.
const COMMENT_PREVIEW = 3;
const COMMENT_PAGE = 20;
const RECORD_PREVIEW = 2;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Pick from the list or type via "Diğer (belirtiniz)" (other, specify) —
 * the web counterpart of mobile's ChoiceField. Options come straight from
 * @mobile/taxonomy, no copies.
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
      {/* Scrolls on one line like mobile's ChoiceField — the clients must
          not diverge on wrap behavior. */}
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

export default function AnimalPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Did we arrive via "review candidate" from the add-animal flow? Carried
  // in the URL instead of state so it survives a page refresh.
  const matchReview = searchParams.get('inceleme') === '1';
  const animalId = Number(id);
  const [animal, setAnimal] = useState<AnimalDetail | null>(null);
  const [comments, setComments] = useState<AnimalComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [visibleVaccinations, setVisibleVaccinations] = useState(RECORD_PREVIEW);
  const [visibleRecords, setVisibleRecords] = useState(RECORD_PREVIEW);
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
  const { celebrate } = useBadgeAwards();
  // Tapping a health record lists only the comments bound to that record.
  const [logRecord, setLogRecord] = useState<HealthRecord | null>(null);
  const [logComments, setLogComments] = useState<AnimalComment[]>([]);

  const load = useCallback(async () => {
    try {
      const [detail, commentPage] = await Promise.all([
        fetchAnimal(animalId),
        // Only the last few comments at open: first paint must not grow with the chat.
        fetchComments(animalId, { limit: COMMENT_PREVIEW }),
      ]);
      setAnimal(detail);
      setComments(commentPage.comments);
      setCommentTotal(commentPage.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    }
  }, [animalId]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadOlderComments() {
    setLoadingOlder(true);
    try {
      const page = await fetchComments(animalId, {
        limit: COMMENT_PAGE,
        offset: comments.length,
      });
      // mergeById: if a new comment landed while "load" was pressed, the
      // same id must not list twice. The older page is prepended
      // (chronological flow).
      setComments((prev) => mergeById(prev, page.comments, 'start'));
      setCommentTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yorumlar yüklenemedi');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      const created = await addComment(animalId, draft.trim(), linkedRecord?.id);
      setDraft('');
      setLinkedRecord(null);
      await load();
      celebrate(created);
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
      const created = await addHealthRecord(animalId, recordType, recordDesc.trim());
      setRecordOpen(false);
      setRecordDesc(null);
      await load();
      celebrate(created);
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
      const created = await addVaccination(
        animalId,
        vaccineType.trim(),
        vaccineNote.trim() || undefined
      );
      setVaccineOpen(false);
      setVaccineType(null);
      setVaccineNote('');
      await load();
      celebrate(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eklenemedi');
    } finally {
      setSaving(false);
    }
  }

  async function openLog(record: HealthRecord) {
    try {
      // Record chat is short (single topic); one full page is enough.
      const page = await fetchComments(animalId, { healthRecordId: record.id, limit: 100 });
      setLogComments(page.comments);
      setLogRecord(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    }
  }

  async function markRecovered(record: HealthRecord) {
    if (
      !window.confirm(
        `"${record.description}" kaydı kapanacak ve bu kayda artık yorum eklenemeyecek. Emin misin?`
      )
    )
      return;
    try {
      const updated = await markHealthRecordRecovered(animalId, record.id);
      // If selected as the comment target, deselect: a closed record takes no comments.
      setLinkedRecord((prev) => (prev?.id === record.id ? null : prev));
      await load();
      celebrate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşaretlenemedi');
    }
  }

  // Mis-taps happen and premature calls surface late; any carer can reopen
  // (state is derived, nothing else desyncs). Same rules as mobile.
  async function reopenRecord(record: HealthRecord) {
    if (
      !window.confirm(
        `"${record.description}" kaydı yeniden açılacak ve yorumlara izin verilecek. Emin misin?`
      )
    )
      return;
    try {
      await reopenHealthRecord(animalId, record.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Geri alınamadı');
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

  // The photo row always fills to a multiple of 3: real frames + dashed
  // "photo" placeholders (handoff 3c) — even an empty profile invites.
  const photoSlots = Math.max(3, Math.ceil(animal.photos.length / 3) * 3);

  return (
    <div className="page">
      <div className="topbar">
        <button className="back" aria-label="Geri" onClick={() => navigate(-1)}>
          ←
        </button>
        <div className="micro">hayvan detay</div>
        <span />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <AnimalAvatar species={animal.species} breed={animal.breed} photoUrl={animal.cover_thumb_url} size={64} />
        <div className="grow">
          <h1 style={{ margin: '4px 0 2px', fontSize: 25 }}>{displayName}</h1>
          <div className="muted" style={{ fontSize: 13.5 }}>
            {[
              animal.color ?? 'Rengi belirtilmemiş',
              animal.breed ?? 'Türü belirtilmemiş',
              animal.markings,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <ReportLink targetType="animal" targetId={animal.id} style={{ marginTop: 4 }} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: photoSlots }).map((_, i) => {
          const p = animal.photos[i];
          return p ? (
            <img
              key={p.id}
              src={p.url}
              alt=""
              style={{
                flex: 1,
                minWidth: 0,
                height: 58,
                borderRadius: 14,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div key={`ph-${i}`} className="photo-ph">
              fotoğraf
            </div>
          );
        })}
      </div>

      {/* Last-seen mini map (mobile parity + PROJECT.md requirement): where
          and when the animal was last recorded, as a static thumbnail. */}
      <div className="label">en son görüldüğü yer</div>
      <div className="muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
        {formatDate(animal.location_updated_at)}
      </div>
      <MiniMap
        /* The map builds once and never recenters; the key remounts it when
           the route shows a different animal. */
        key={animal.id}
        lat={animal.location.coordinates[1]}
        lng={animal.location.coordinates[0]}
        height={160}
      >
        <span
          style={{
            display: 'inline-flex',
            padding: 4,
            borderRadius: '50%',
            background: 'var(--surface)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
          }}
        >
          <AnimalAvatar
            species={animal.species}
            breed={animal.breed}
            photoUrl={animal.cover_thumb_url}
            size={34}
          />
        </span>
      </MiniMap>

      {/* Vaccinations above health records: on the street the first question is "vaccinated?". */}
      <div className="hairline row" style={{ justifyContent: 'space-between' }}>
        <div className="label" style={{ margin: 0 }}>
          aşı kayıtları
        </div>
        {animal.isCarer && !matchReview && (
          <button className="link" onClick={() => setVaccineOpen(true)}>
            + aşı ekle
          </button>
        )}
      </div>
      {animal.vaccinations.length === 0 ? (
        <div className="card flat muted">Henüz aşı kaydı yok.</div>
      ) : (
        animal.vaccinations.slice(0, visibleVaccinations).map((v) => (
          <div key={v.id} className="card flat">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{v.vaccine_type}</strong>
              {v.vet_verified && <span className="tag success">veteriner onaylı</span>}
            </div>
            {v.note && (
              <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--text-body)' }}>
                {v.note}
              </div>
            )}
            <div className="subtle" style={{ marginTop: 4 }}>
              {formatDate(v.administered_at)} · {v.recorded_by_name ?? ''}
              {v.next_due_at ? ` · Sonraki doz: ${formatDate(v.next_due_at)}` : ''}
            </div>
          </div>
        ))
      )}
      {animal.vaccinations.length > visibleVaccinations && (
        <button
          className="btn ghost small full"
          onClick={() => setVisibleVaccinations(animal.vaccinations.length)}
        >
          Devamını göster ({animal.vaccinations.length - visibleVaccinations})
        </button>
      )}

      <div className="hairline row" style={{ justifyContent: 'space-between' }}>
        <div className="label" style={{ margin: 0 }}>
          sağlık kayıtları
        </div>
        {animal.isCarer && (
          <button className="link" onClick={() => setRecordOpen(true)}>
            + kayıt ekle
          </button>
        )}
      </div>
      {!animal.isCarer && (
        <p className="subtle">Sağlık kaydı ekleyebilmek için önce bu hayvana yorum yap.</p>
      )}
      {animal.healthRecords.length === 0 ? (
        <div className="card flat muted">Henüz kayıt yok.</div>
      ) : (
        animal.healthRecords.slice(0, visibleRecords).map((r) => {
          const st = STATUS_META[r.status];
          return (
            <div
              key={r.id}
              className="card flat"
              role="button"
              style={{ cursor: 'pointer' }}
              onClick={() => openLog(r)}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{r.description}</strong>
                <span className={`tag ${st.cls}`}>{st.label}</span>
              </div>
              <div className="subtle" style={{ marginTop: 4 }}>
                {RECORD_TYPE_LABELS[r.record_type]}
                {r.vet_verified ? ' · veteriner onaylı' : ''} · {r.recorded_by_name ?? ''} ·{' '}
                {r.comment_count} yorum · dokunarak kayıtları gör
                {r.status === 'recovered' && r.recovered_by_name
                  ? ` · ${r.recovered_by_name} iyileşti olarak işaretledi`
                  : ''}
              </div>
              {/* Action phrasing on a quiet outline: the old solid-check
                  "✓ iyileşti" read as a status tag (mobile parity). */}
              {animal.isCarer && r.status !== 'recovered' && (
                <button
                  className="btn outline"
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    markRecovered(r);
                  }}
                >
                  iyileşti olarak işaretle
                </button>
              )}
              {animal.isCarer && r.status === 'recovered' && (
                <button
                  className="btn ghost"
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    reopenRecord(r);
                  }}
                >
                  geri al
                </button>
              )}
            </div>
          );
        })
      )}
      {animal.healthRecords.length > visibleRecords && (
        <button
          className="btn ghost small full"
          onClick={() => setVisibleRecords(animal.healthRecords.length)}
        >
          Devamını göster ({animal.healthRecords.length - visibleRecords})
        </button>
      )}

      <div className="hairline">
        <div className="label" style={{ margin: 0 }}>
          sohbet
        </div>
      </div>
      {commentTotal > comments.length && (
        <button
          className="btn ghost small full"
          disabled={loadingOlder}
          onClick={loadOlderComments}
        >
          {loadingOlder
            ? 'Yükleniyor…'
            : `Önceki yorumları yükle (${commentTotal - comments.length})`}
        </button>
      )}
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
              <span className="grow" />
              <ReportLink targetType="comment" targetId={c.id} />
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

      {matchReview ? (
        /* Viewed from the add-animal flow: let the user study the photos
           and records and decide. The decision returns to AddAnimalPage via
           state. */
        <div className="card" style={{ position: 'sticky', bottom: 0 }}>
          <p className="muted" style={{ margin: '0 0 8px', textAlign: 'center' }}>
            Eklemek istediğin hayvan bu mu?
          </p>
          <div className="row">
            <button className="btn secondary grow" onClick={() => navigate(-1)}>
              Geri dön
            </button>
            <button
              className="btn grow"
              onClick={() =>
                navigate('/hayvanlar/yeni', { state: { confirmedAnimalId: animalId } })
              }
            >
              ✓ Bu o — eşleştir
            </button>
          </div>
        </div>
      ) : (
        /* Fixed comment row (handoff): cream input + gradient send button. */
        <form
          onSubmit={sendComment}
          style={{
            position: 'sticky',
            bottom: 0,
            background: 'var(--background)',
            padding: '10px 0 4px',
            borderTop: '1px solid var(--border)',
          }}
        >
          {openRecords.length > 0 && (
            <ChipRow style={{ margin: '0 0 8px' }}>
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
            </ChipRow>
          )}
          <div className="row">
            <input
              className="grow"
              style={{
                border: 'none',
                borderRadius: 16,
                padding: '13px 14px',
                background: 'var(--surface-alt)',
                fontSize: 14,
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
      )}

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
            <div className="label">{recordType === 'illness' ? 'hastalık' : 'yaralanma'}</div>
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
            {/* Vet/clinic ad while opening a health record. */}
            <AdBanner slot="vet_health_record" visible={recordOpen} />
          </div>
        </div>
      )}

      {vaccineOpen && (
        <div className="backdrop" onClick={() => !saving && setVaccineOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Aşı kaydı ekle</h2>
            <div className="label">aşı türü</div>
            <ChoiceChips options={VACCINE_TYPES} value={vaccineType} onChange={setVaccineType} />
            <label className="field">
              <span>not (isteğe bağlı)</span>
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
            <AdBanner slot="vet_health_record" visible={vaccineOpen} />
          </div>
        </div>
      )}

      {logRecord && (
        <div className="backdrop" onClick={() => setLogRecord(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>
              {RECORD_TYPE_LABELS[logRecord.record_type]}: {logRecord.description}
            </h2>
            <p className="muted">Bu kayda bağlı yorumlar</p>
            {logComments.length === 0 ? (
              <div className="card flat muted">Henüz yorum yok.</div>
            ) : (
              logComments.map((c) => (
                <div
                  key={c.id}
                  className="row"
                  style={{ alignItems: 'flex-start', marginBottom: 10 }}
                >
                  <UserAvatar avatarUrl={c.avatar_url} name={c.user_name} size={30} />
                  <div className="grow">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 14 }}>{c.user_name}</strong>
                      <span className="subtle">{formatDate(c.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 14 }}>{c.body}</div>
                  </div>
                </div>
              ))
            )}
            <button className="btn full" onClick={() => setLogRecord(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
