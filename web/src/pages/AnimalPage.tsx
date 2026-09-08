import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { mergeById } from '@mobile/paging';
import { conditionsFor, OTHER, VACCINE_TYPES } from '@mobile/taxonomy';
import {
  addComment,
  addHealthRecord,
  addVaccination,
  AnimalComment,
  ApiError,
  fetchComments,
  HealthRecord,
  markHealthRecordRecovered,
  reopenHealthRecord,
} from '../api';
import {
  AnimalSocialDetail,
  fetchAnimalSocial,
  followAnimal,
  likePhoto,
  SocialPhoto,
  submitCarePhotos,
  unfollowAnimal,
  unlikePhoto,
} from '../api/animalSocial';
import { AnimalAvatar, UserAvatar } from '../avatars';
import { BadgeSymbol } from '../badges';
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
  // The server's decision for this candidate (matchHit, `eslesme`): with
  // it the confirm reports a sighting and makes the user a carer; without
  // it the bar only opens the profile. `kontrol=0`: no model looked.
  const matchHit = searchParams.get('eslesme') === '1';
  const photoChecked = searchParams.get('kontrol') !== '0';
  const animalId = Number(id);
  const [animal, setAnimal] = useState<AnimalSocialDetail | null>(null);
  // The full-screen viewer (P6 item 7): the index of the open photo, or null.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const likeBusy = useRef<Set<number>>(new Set());
  const [followBusy, setFollowBusy] = useState(false);
  // "Bakım ver" (P6 item 8): the two-photo sheet.
  const [careOpen, setCareOpen] = useState(false);
  const [carePhotos, setCarePhotos] = useState<(File | null)[]>([null, null]);
  const [careError, setCareError] = useState<string | null>(null);
  const [careDone, setCareDone] = useState<string | null>(null);
  const [careSending, setCareSending] = useState(false);
  const careInputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
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
        fetchAnimalSocial(animalId),
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

  // One like per user per photo, open to everyone signed in. Optimistic:
  // the heart flips at once, the server's count replaces the guess.
  async function toggleLike(photo: SocialPhoto) {
    if (likeBusy.current.has(photo.id)) return;
    likeBusy.current.add(photo.id);
    const liked = photo.liked_by_me;
    const apply = (state: { liked: boolean; likeCount: number }) =>
      setAnimal((prev) =>
        prev
          ? {
              ...prev,
              photos: prev.photos.map((p) =>
                p.id === photo.id
                  ? { ...p, liked_by_me: state.liked, like_count: state.likeCount }
                  : p
              ),
            }
          : prev
      );
    apply({ liked: !liked, likeCount: photo.like_count + (liked ? -1 : 1) });
    try {
      apply(liked ? await unlikePhoto(animalId, photo.id) : await likePhoto(animalId, photo.id));
    } catch (err) {
      apply({ liked, likeCount: photo.like_count });
      setError(err instanceof Error ? err.message : 'Beğeni kaydedilemedi');
    } finally {
      likeBusy.current.delete(photo.id);
    }
  }

  // "Takip et" toggles without a condition (same optimistic shape).
  async function toggleFollow() {
    if (!animal || followBusy) return;
    const was = animal.isFollowing;
    setFollowBusy(true);
    setAnimal({
      ...animal,
      isFollowing: !was,
      followerCount: animal.followerCount + (was ? -1 : 1),
    });
    try {
      const state = was ? await unfollowAnimal(animalId) : await followAnimal(animalId);
      setAnimal((prev) =>
        prev ? { ...prev, isFollowing: state.following, followerCount: state.followerCount } : prev
      );
    } catch (err) {
      setAnimal((prev) =>
        prev ? { ...prev, isFollowing: was, followerCount: animal.followerCount } : prev
      );
      setError(err instanceof Error ? err.message : 'Olmadı');
    } finally {
      setFollowBusy(false);
    }
  }

  function openCare() {
    setCarePhotos([null, null]);
    setCareError(null);
    setCareDone(null);
    setCareOpen(true);
  }

  async function sendCarePhotos() {
    const ready = carePhotos.filter((p): p is File => !!p);
    if (ready.length < 2 || !animal) return;
    setCareSending(true);
    setCareError(null);
    try {
      const result = await submitCarePhotos(animalId, ready);
      setCareDone(
        result.alreadyCarer
          ? 'Zaten bakım veriyorsun.'
          : result.photoChecked
            ? 'Fotoğraflar eşleşti — artık bakıcısın. Yorum yazabilir, sağlık ve aşı kaydı ekleyebilirsin.'
            : 'Artık bakıcısın. Yorum yazabilir, sağlık ve aşı kaydı ekleyebilirsin.'
      );
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'photoRejected') {
        // The refused slots empty so the retake is obvious; the reason is
        // the model's own Turkish sentence.
        const refused = new Set((err.data.photoIndexes as number[] | undefined) ?? [0, 1]);
        setCarePhotos((prev) => prev.map((p, i) => (refused.has(i) ? null : p)));
      }
      setCareError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setCareSending(false);
    }
  }

  // Keyboard and swipe for the viewer: arrows step, Escape closes; a
  // horizontal touch of 40 px or more steps too.
  const touchStart = useRef<number | null>(null);
  const photoCount = animal?.photos.length ?? 0;
  useEffect(() => {
    if (viewerIndex === null) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerIndex(null);
      if (e.key === 'ArrowRight')
        setViewerIndex((i) => (i === null ? i : Math.min(i + 1, photoCount - 1)));
      if (e.key === 'ArrowLeft') setViewerIndex((i) => (i === null ? i : Math.max(i - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerIndex, photoCount]);

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

  // The grid always fills to a multiple of 3: real tiles + dashed "photo"
  // placeholders — even an empty profile invites.
  const photoSlots = Math.max(3, Math.ceil(animal.photos.length / 3) * 3);
  const viewerPhoto = viewerIndex === null ? null : (animal.photos[viewerIndex] ?? null);

  return (
    <div className="page">
      <div className="topbar">
        <button className="back" aria-label="Geri" onClick={() => navigate(-1)}>
          ←
        </button>
        {/* "kedi profili" / "köpek profili" (P6 item 6, mobile parity). */}
        <div className="micro">{animal.species === 'cat' ? 'kedi profili' : 'köpek profili'}</div>
        <span />
      </div>

      {error && <div className="error">{error}</div>}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <AnimalAvatar
          species={animal.species}
          breed={animal.breed}
          photoUrl={animal.cover_thumb_url}
          size={64}
        />
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
          {/* The animal's own badges (P6 item 5): the owner's name, the tier
              as the medallion colour. */}
          {animal.badges.length > 0 && (
            <div className="animal-badges">
              {animal.badges.map((b) => (
                <span key={b.key} className="animal-badge" title={`${b.label} · ${b.tier}`}>
                  <BadgeSymbol symbol={b.symbol} tier={b.tier} size={18} />
                  {b.label}
                </span>
              ))}
            </div>
          )}
          <ReportLink targetType="animal" targetId={animal.id} style={{ marginTop: 4 }} />
        </div>
      </div>

      {/* Follow vs. care (P6 item 8): "takip et" has no condition and
          toggles; "bakım ver" is the two-photo step. Hidden in match review. */}
      {!matchReview && (
        <div className="row animal-actions">
          <button
            className={`btn small grow ${animal.isFollowing ? 'outline-success' : 'secondary'}`}
            disabled={followBusy}
            onClick={toggleFollow}
            aria-pressed={animal.isFollowing}
          >
            {animal.isFollowing ? '✓ takip ediliyor' : 'takip et'}
          </button>
          {animal.isCarer ? (
            <span className="tag success grow" style={{ justifyContent: 'center' }}>
              bakım veriyorsun
            </span>
          ) : (
            <button className="btn small grow" onClick={openCare}>
              📷 bakım ver
            </button>
          )}
        </div>
      )}
      <div className="subtle" style={{ margin: '6px 0 10px' }}>
        {animal.followerCount} takipçi · {animal.carerCount} bakıcı
      </div>

      {/* The photo grid (P6 item 7): square tiles, three a row, each with
          its like count; a tap opens the swipeable viewer. */}
      <div className="animal-photo-grid">
        {Array.from({ length: photoSlots }).map((_, i) => {
          const p = animal.photos[i];
          return p ? (
            <button
              key={p.id}
              type="button"
              className="animal-photo-tile"
              onClick={() => setViewerIndex(i)}
              aria-label={`Fotoğraf ${i + 1}, ${p.like_count} beğeni`}
            >
              <img src={p.url} alt="" />
              <span className={`photo-like ${p.liked_by_me ? 'mine' : ''}`}>♥ {p.like_count}</span>
            </button>
          ) : (
            <div key={`ph-${i}`} className="animal-photo-tile photo-ph">
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
        <p className="subtle">
          Sağlık kaydı ekleyebilmek için "bakım ver" ile bu hayvanın bakıcısı ol.
        </p>
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
            {!matchHit
              ? 'Eklemek istediğin hayvan bu mu? Bakıcısı olmak için profilden "bakım ver".'
              : photoChecked
                ? 'Eklemek istediğin hayvan bu mu?'
                : 'Eklemek istediğin hayvan bu mu? Fotoğraf kontrol edilemedi; konumu güncellersin.'}
          </p>
          <div className="row">
            <button className="btn secondary grow" onClick={() => navigate(-1)}>
              Geri dön
            </button>
            <button
              className="btn grow"
              onClick={() =>
                navigate('/hayvanlar/yeni', {
                  state: { confirmedAnimalId: animalId, confirmedMatchHit: matchHit },
                })
              }
            >
              {matchHit ? '✓ Bu o — eşleştir' : 'Bu o — profili aç'}
            </button>
          </div>
        </div>
      ) : !animal.isCarer ? (
        /* The chat is the carers' room (owner decision, 2026-09-08):
           followers read it; the composer gives way to the door in. */
        <div className="card" style={{ position: 'sticky', bottom: 0 }}>
          <p className="muted" style={{ margin: '0 0 8px', textAlign: 'center' }}>
            Yorum yazmak bakıcılara açık. İki yeni fotoğrafla sen de katıl.
          </p>
          <button className="btn small full" onClick={openCare}>
            📷 bakım ver
          </button>
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

      {viewerPhoto && viewerIndex !== null && (
        <div
          className="photo-viewer"
          role="dialog"
          aria-label={`Fotoğraf ${viewerIndex + 1} / ${animal.photos.length}`}
          onTouchStart={(e) => {
            touchStart.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            const end = e.changedTouches[0]?.clientX;
            if (start === null || end === undefined || Math.abs(end - start) < 40) return;
            setViewerIndex((i) =>
              i === null
                ? i
                : end < start
                  ? Math.min(i + 1, animal.photos.length - 1)
                  : Math.max(i - 1, 0)
            );
          }}
        >
          <div className="photo-viewer-top">
            <button
              className="photo-viewer-btn"
              aria-label="Kapat"
              onClick={() => setViewerIndex(null)}
            >
              ✕
            </button>
            <span>
              {viewerIndex + 1} / {animal.photos.length}
            </span>
            <span style={{ width: 40 }} />
          </div>
          <img src={viewerPhoto.url} alt="" onClick={() => setViewerIndex(null)} />
          {viewerIndex > 0 && (
            <button
              className="photo-viewer-btn photo-viewer-prev"
              aria-label="Önceki"
              onClick={() => setViewerIndex(viewerIndex - 1)}
            >
              ‹
            </button>
          )}
          {viewerIndex < animal.photos.length - 1 && (
            <button
              className="photo-viewer-btn photo-viewer-next"
              aria-label="Sonraki"
              onClick={() => setViewerIndex(viewerIndex + 1)}
            >
              ›
            </button>
          )}
          <div className="photo-viewer-bottom">
            <div className="grow">
              {viewerPhoto.uploaded_by_name && <div>{viewerPhoto.uploaded_by_name}</div>}
              {viewerPhoto.created_at && (
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  {formatDate(viewerPhoto.created_at)}
                </div>
              )}
            </div>
            <button
              className={`photo-viewer-like ${viewerPhoto.liked_by_me ? 'mine' : ''}`}
              aria-pressed={viewerPhoto.liked_by_me}
              aria-label={viewerPhoto.liked_by_me ? 'Beğeniyi geri al' : 'Beğen'}
              onClick={() => toggleLike(viewerPhoto)}
            >
              ♥ {viewerPhoto.like_count}
            </button>
          </div>
        </div>
      )}

      {careOpen && (
        <div className="backdrop" onClick={() => !careSending && setCareOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{displayName} için bakım ver</h2>
            {careDone ? (
              <>
                <p className="muted">{careDone}</p>
                <button className="btn full" onClick={() => setCareOpen(false)}>
                  Tamam
                </button>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  Şu an yanındaysan {animal.species === 'dog' ? 'köpeğin' : 'kedinin'} net göründüğü
                  iki yeni fotoğraf çek. Fotoğraflar bu hayvanın kayıtlı fotoğraflarıyla
                  karşılaştırılır; eşleşince bakıcısı olursun.
                </p>
                <div className="care-slots">
                  {carePhotos.map((file, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`care-slot ${file ? '' : 'empty'}`}
                      onClick={() => careInputs[i].current?.click()}
                      aria-label={
                        file ? `${i + 1}. fotoğrafı yeniden çek` : `${i + 1}. fotoğrafı çek`
                      }
                    >
                      {file ? (
                        <img src={URL.createObjectURL(file)} alt="" />
                      ) : (
                        <span>📷 {i + 1}. fotoğraf</span>
                      )}
                      {/* `capture`: the camera on a phone, the picker on a desktop. */}
                      <input
                        ref={careInputs[i]}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={(e) => {
                          const picked = e.target.files?.[0] ?? null;
                          if (picked)
                            setCarePhotos((prev) => prev.map((p, j) => (j === i ? picked : p)));
                          e.target.value = '';
                        }}
                      />
                    </button>
                  ))}
                </div>
                {careError && <div className="error">{careError}</div>}
                <p className="subtle">
                  Bakıcılar yorum yazabilir, görülme bildirebilir, sağlık ve aşı kaydı ekleyebilir.
                  Sadece haber almak istiyorsan "takip et" yeter.
                </p>
                <button
                  className="btn full"
                  disabled={careSending || carePhotos.some((p) => !p)}
                  onClick={sendCarePhotos}
                >
                  {careSending ? 'Gönderiliyor…' : 'Fotoğrafları gönder'}
                </button>
                <button
                  className="btn ghost full"
                  disabled={careSending}
                  onClick={() => setCareOpen(false)}
                >
                  Vazgeç
                </button>
              </>
            )}
          </div>
        </div>
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
