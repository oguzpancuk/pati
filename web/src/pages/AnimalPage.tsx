import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { mergeById } from '@mobile/paging';
import { conditionsFor, OTHER, VACCINE_TYPES } from '@mobile/taxonomy';
import {
  addComment,
  addHealthRecord,
  addVaccination,
  AnimalComment,
  ApiError,
  Carer,
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
import { useAuth } from '../auth';
import { bumpLadderValue, headerBadges, setLadderValue } from '@mobile/animalBadges';
import { animalPhotoSlots } from '@mobile/animalPhotoSlots';
import { BadgeSymbol } from '../badges';
import { AnimalBadgeLadder } from '../components/AnimalBadgeLadder';
import { AnimalLocationDialog } from '../components/AnimalLocationDialog';
import { MiniMap } from '../components/MiniMap';
import { ReportDialog, ReportLink } from '../components/ReportDialog';
import { useBadgeAwards } from '../badgeAwards';
import { AdBanner } from '../components/AdBanner';
import { ChipRow } from '../components/ChipRow';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { PageHeader, useGoBack } from '../components/PageHeader';
// DESIGN §8 point 3: a dialog is not a page. The mechanism lives with the
// profile sheets because they needed it first; it is not profile-specific.
import { useSheetDismiss } from '../components/profile/Sheet';
import '../styles/animal.css';

const RECORD_TYPE_LABELS = { illness: 'Hastalık', injury: 'Yaralanma' } as const;
const STATUS_META = {
  not_started: { label: 'tedaviye başlanmadı', cls: 'danger' },
  in_treatment: { label: 'tedavi sürüyor', cls: 'warning' },
  recovered: { label: 'iyileşti', cls: 'success' },
} as const;

// Same numbers as mobile's AnimalProfileScreen: chat opens with the last 3
// comments, "load earlier" pages by 20; record cards fold at 2, carer rows
// at 5.
const COMMENT_PREVIEW = 3;
const COMMENT_PAGE = 20;
const RECORD_PREVIEW = 2;
const CARER_PREVIEW = 5;

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

/**
 * Every person named on an animal profile is a door to their profile (demo
 * item 7) — except you. Your own name is plain text with no link and no
 * press handler (owner decision, 2026-09-11, both clients): tapping through
 * to a stranger's-eye view of yourself is the odd outcome, your own profile
 * is one tab tap away, and it takes a navigation special case out of both
 * clients. `null` is "this name is not a door".
 */
function profilePath(userId: number, selfId?: number): string | null {
  return selfId === userId ? null : `/kullanici/${userId}`;
}

/** The same door inside running text ("kaydeden", "… iyileşti olarak işaretledi"). */
function PersonLink({
  userId,
  name,
  selfId,
}: {
  userId?: number | null;
  name: string;
  selfId?: number;
}) {
  const to = typeof userId === 'number' ? profilePath(userId, selfId) : null;
  if (!to) return <>{name}</>;
  return (
    <Link
      className="person-link"
      to={to}
      // A record card is itself clickable (it opens the record log); the
      // name inside it must go to the person, not to both.
      onClick={(e) => e.stopPropagation()}
    >
      {name}
    </Link>
  );
}

/** A comment author's avatar: the same door as their name, or plain for you. */
function PersonAvatar({
  userId,
  name,
  avatarUrl,
  size,
  selfId,
}: {
  userId: number;
  name: string;
  avatarUrl: string | null;
  size: number;
  selfId?: number;
}) {
  const avatar = <UserAvatar avatarUrl={avatarUrl} name={name} size={size} />;
  const to = profilePath(userId, selfId);
  if (!to) return avatar;
  return (
    <Link to={to} aria-label={`${name} profilini aç`}>
      {avatar}
    </Link>
  );
}

/** A carer row: a door to that person, or — for you — a row that just names you. */
function CarerRow({ carer, selfId }: { carer: Carer; selfId?: number }) {
  const body = (
    <>
      <UserAvatar avatarUrl={carer.avatar_url} name={carer.name} size={34} />
      <strong className="grow">{carer.name}</strong>
      {/* Same chip the comment authors below wear: the showcase world
          writes carer rows too, so a bot can be met here. */}
      {carer.is_demo && <span className="demo-chip">demo</span>}
    </>
  );
  const to = profilePath(carer.id, selfId);
  if (!to) {
    // No chevron either: it promises somewhere to go.
    return <div className="animal-carer-row self">{body}</div>;
  }
  return (
    <Link className="animal-carer-row" to={to}>
      {body}
      <span className="subtle chevron">›</span>
    </Link>
  );
}

export default function AnimalPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const backToMatches = useGoBack('/hayvanlar/yeni');
  const [searchParams] = useSearchParams();
  // Did we arrive via "review candidate" from the add-animal flow? Carried
  // in the URL instead of state so it survives a page refresh.
  const matchReview = searchParams.get('inceleme') === '1';
  // The server's decision for this candidate (matchHit, `eslesme`): with
  // it the confirm reports a sighting and makes the user a carer; without
  // it the bar only opens the profile, unless the viewer already is a carer
  // (see confirmReports). `kontrol=0`: no model looked.
  const matchHit = searchParams.get('eslesme') === '1';
  const photoChecked = searchParams.get('kontrol') !== '0';
  const animalId = Number(id);
  const { me } = useAuth();
  const [animal, setAnimal] = useState<AnimalSocialDetail | null>(null);
  // The full-screen viewer (P6 item 7): the index of the open photo, or null.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const likeBusy = useRef<Set<number>>(new Set());
  const [followBusy, setFollowBusy] = useState(false);
  // The badge ladder (P7 item 3) opens from a header chip; the tapped key
  // is the highlighted row.
  const [ladderKey, setLadderKey] = useState<string | null>(null);
  // "Bakım ver" (P6 item 8): the camera-photo sheet — one slot since
  // 2026-09-14 (C1), as on mobile; the server still takes two for older apps.
  const [careOpen, setCareOpen] = useState(false);
  const [carePhoto, setCarePhoto] = useState<File | null>(null);
  const [careError, setCareError] = useState<string | null>(null);
  const [careDone, setCareDone] = useState<string | null>(null);
  const [careSending, setCareSending] = useState(false);
  // Opened as a carer's "fotoğraf ekle" (owner batch 2026-09-14, B1): fixed
  // when the sheet opens, so the reload after a new carer's success does
  // not flip the heading under the "Artık bakıcısın" answer.
  const [careAsCarer, setCareAsCarer] = useState(false);
  const careInput = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState<AnimalComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [visibleVaccinations, setVisibleVaccinations] = useState(RECORD_PREVIEW);
  const [visibleRecords, setVisibleRecords] = useState(RECORD_PREVIEW);
  const [visibleCarers, setVisibleCarers] = useState(CARER_PREVIEW);
  // The last-seen thumbnail opens a real, pannable map (demo item 8).
  const [locationOpen, setLocationOpen] = useState(false);
  // The animal's report sheet, opened from the header flag.
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [linkedRecord, setLinkedRecord] = useState<HealthRecord | null>(null);
  const [sending, setSending] = useState(false);
  // The composer scrolls with the chat (owner, 2026-09-15), so a sent
  // comment's new row pushes it down, and the reload can shorten the list
  // above it. Bumped after a send; the effect runs once that render is
  // committed and brings the composer back into view.
  const composerRef = useRef<HTMLFormElement>(null);
  const [composerReveal, setComposerReveal] = useState(0);
  useEffect(() => {
    if (composerReveal > 0) composerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [composerReveal]);

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
  // Bumped whenever a record/vaccine dialog session starts or ends, so a
  // save that resolves late can tell whether it is still looking at its own
  // dialog. A ref, not state: the answer reads it, nothing renders from it.
  const dialogSession = useRef(0);

  // Escape and the browser's / Android's Back close these instead of leaving
  // the animal profile — which on the PWA used to throw away a half-typed
  // health record. Mobile's four modals gained the same through
  // onRequestClose; this is the web half of that rule.
  // Back and Escape never refuse, even mid-save: they are the OS's and the
  // browser's own way out, the same rule the mobile modals follow. A refusal
  // here would ALSO orphan the dialog — the popstate has already spent the
  // history entry and unregistered the sheet by the time the callback runs,
  // so a `close()` that declines leaves a dialog no backdrop and no Escape
  // can reach (review, 2026-09-11). The backdrop keeps its own `busy` guard:
  // a stray tap is not a deliberate gesture.
  const closeCare = useSheetDismiss(careOpen, () => setCareOpen(false));
  const closeRecord = useSheetDismiss(recordOpen, () => {
    dialogSession.current += 1;
    setRecordOpen(false);
  });
  const closeVaccine = useSheetDismiss(vaccineOpen, () => {
    dialogSession.current += 1;
    setVaccineOpen(false);
  });
  const closeLog = useSheetDismiss(!!logRecord, () => setLogRecord(null));
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
      setComposerReveal((n) => n + 1);
      celebrate(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  async function saveRecord() {
    if (!recordDesc?.trim()) return;
    // Back and Escape no longer refuse mid-save, so the dialog can be closed
    // and reopened while this request is still out. Without the token the
    // answer would close the NEW dialog and wipe what was typed into it —
    // the same lost record the old refusal was there to prevent, in a
    // narrower window (review, 2026-09-11).
    const session = ++dialogSession.current;
    setSaving(true);
    try {
      const created = await addHealthRecord(animalId, recordType, recordDesc.trim());
      if (session === dialogSession.current) {
        setRecordOpen(false);
        setRecordDesc(null);
      }
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
    // See saveRecord: the answer may arrive after this dialog was closed and
    // another opened.
    const session = ++dialogSession.current;
    setSaving(true);
    try {
      const created = await addVaccination(
        animalId,
        vaccineType.trim(),
        vaccineNote.trim() || undefined
      );
      if (session === dialogSession.current) {
        setVaccineOpen(false);
        setVaccineType(null);
        setVaccineNote('');
      }
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
      badgeLadder: bumpLadderValue(animal.badgeLadder, 'followed', was ? -1 : 1),
    });
    try {
      const state = was ? await unfollowAnimal(animalId) : await followAnimal(animalId);
      setAnimal((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: state.following,
              followerCount: state.followerCount,
              badgeLadder: setLadderValue(prev.badgeLadder, 'followed', state.followerCount),
            }
          : prev
      );
    } catch (err) {
      setAnimal((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: was,
              followerCount: animal.followerCount,
              badgeLadder: animal.badgeLadder,
            }
          : prev
      );
      setError(err instanceof Error ? err.message : 'Olmadı');
    } finally {
      setFollowBusy(false);
    }
  }

  function openCare() {
    setCarePhoto(null);
    setCareError(null);
    setCareDone(null);
    setCareAsCarer(animal?.isCarer === true);
    setCareOpen(true);
  }

  async function sendCarePhotos() {
    if (!carePhoto || !animal) return;
    setCareSending(true);
    setCareError(null);
    try {
      const result = await submitCarePhotos(animalId, [carePhoto]);
      // The server's answer decides the text: a carer's photo is stored
      // without a comparison, whichever way the sheet was opened.
      setCareDone(
        result.alreadyCarer
          ? 'Fotoğraf eklendi.'
          : `${
              result.photoChecked ? 'Fotoğraf eşleşti — artık' : 'Artık'
            } bakıcısın. Yorum yazabilir, sağlık ve aşı kaydı ekleyebilirsin. Takip de ediyorsun: haberleri sana gelir.`
      );
      await load();
    } catch (err) {
      // Two codes, one remedy: `photoRejected` is the model saying it sees
      // no animal, `photoUnreadable` is the server saying it cannot decode
      // the file at all. Either way the slot empties so the retake is
      // obvious — without this the slot stayed filled and the next send
      // reproduced the same error (review finding). With one photo sent,
      // any refusal is about that photo: no index to map.
      if (
        err instanceof ApiError &&
        (err.code === 'photoRejected' || err.code === 'photoUnreadable')
      ) {
        setCarePhoto(null);
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
        {/* The header belongs here too: these are the two pages a shared link
            lands on, and a load that fails is exactly when the reader most
            needs the way back (DESIGN §8). */}
        <PageHeader title="hayvan profili" fallback="/hayvanlar" />
        {error ? <div className="error">{error}</div> : <p className="muted">Yükleniyor…</p>}
      </div>
    );
  }

  const displayName = animal.name ?? (animal.species === 'cat' ? 'Kedi' : 'Köpek');
  const openRecords = animal.healthRecords.filter((r) => r.status !== 'recovered');
  const carers = animal.carers;
  const selfId = me?.id;
  // A carer's confirm reports too, hit or not: the server lets a carer
  // report a sighting and add photos without one, so "Bu o" must not drop
  // the photos a carer took in the flow (B1 follow-up).
  const confirmReports = matchHit || animal.isCarer === true;

  // The grid's cells come from animalPhotoSlots (shared with mobile): at
  // most two rows of photos, a carer's add tile after them, dashed
  // placeholders filling the row. Match review offers one decision, so its
  // grid adds nothing.
  const photoSlots = animalPhotoSlots(
    animal.photos.length,
    animal.isCarer === true && !matchReview
  );
  const viewerPhoto = viewerIndex === null ? null : animal.photos[viewerIndex] ?? null;

  return (
    <div className="page">
      {/* "kedi profili" / "köpek profili" (P6 item 6, mobile parity). */}
      <PageHeader
        title={animal.species === 'cat' ? 'kedi profili' : 'köpek profili'}
        fallback="/hayvanlar"
        /* Reporting the animal is the header's right-hand control (owner,
           2026-09-15): at the page's end it sat under the comment composer,
           which is where the page should end. A flag in the conversation
           header's round disc, muted rather than brand-coloured. Match
           review hides it with the other secondary actions (mobile parity). */
        action={
          matchReview ? undefined : (
            <button
              type="button"
              className="animal-report-btn"
              aria-label="Şikayet et"
              title="Şikayet et"
              onClick={() => setReportOpen(true)}
            >
              {/* The brand icon set's `flag` (mobile components/brand/Icon). */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 20.4V4.2" />
                <path d="M6 4.8c2.2-1.2 4.4-1.2 6.6 0s4.2 1.2 6.4 0v8.4c-2.2 1.2-4.2 1.2-6.4 0s-4.4-1.2-6.6 0" />
              </svg>
            </button>
          )
        }
      />

      {error && <div className="error">{error}</div>}

      {/* The photos open the page (owner, 2026-09-09 — the avatar is gone
          with them): square tiles, three a row, each with its like count; a
          click opens the swipeable viewer. A carer's next cell is the
          "fotoğraf ekle" tile (owner, 2026-09-15: the slot, not a button);
          the last row fills with dashed "fotoğraf" placeholders. */}
      <div className="animal-photo-grid">
        {animal.photos.slice(0, photoSlots.shown).map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="animal-photo-tile"
            onClick={() => setViewerIndex(i)}
            aria-label={`Fotoğraf ${i + 1}, ${p.like_count} beğeni`}
          >
            <img src={p.url} alt="" />
            {i === photoSlots.shown - 1 && photoSlots.more > 0 && (
              <span className="photo-more">+{photoSlots.more}</span>
            )}
            <span className={`photo-like ${p.liked_by_me ? 'mine' : ''}`}>♥ {p.like_count}</span>
          </button>
        ))}
        {photoSlots.add && (
          /* The placeholder's frame, made a door: it opens the care sheet
             in carer mode, as "bakım ver" does for everyone else. */
          <button
            type="button"
            className="animal-photo-tile photo-ph photo-add"
            onClick={openCare}
            aria-label="Fotoğraf ekle"
          >
            <span className="photo-add-icon" aria-hidden="true">
              📷
            </span>
            fotoğraf ekle
          </button>
        )}
        {Array.from({ length: photoSlots.placeholders }).map((_, i) => (
          <div key={`ph-${i}`} className="animal-photo-tile photo-ph">
            fotoğraf
          </div>
        ))}
      </div>

      {/* Identity under the photos (owner, 2026-09-09): no avatar — the
          gallery above is the animal's face — a name row with the
          follower/carer pair, one descriptive line and the badge chips. */}
      <div className="animal-identity">
        <div className="grow">
          <div className="animal-name-row">
            <div className="name-with-chip">
              <h1>{displayName}</h1>
              {animal.is_demo && <span className="demo-chip">demo</span>}
            </div>
            {/* The audience (P7 item 5, placed by the P8 review): the
                follower/carer pair right-aligned on the name's line. */}
            <span className="animal-counts">
              {animal.followerCount} takipçi · {animal.carerCount} bakıcı
            </span>
          </div>
          <div className="muted">
            {[
              animal.color ?? 'Rengi belirtilmemiş',
              animal.breed ?? 'Türü belirtilmemiş',
              animal.markings,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {/* The animal's two highest badges (P6 item 5, P7 item 3): the
              owner's name, the tier as the medallion colour; a click opens
              the whole ladder. */}
          {animal.badges.length > 0 && (
            <div className="animal-badges">
              {headerBadges(animal.badges).map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className="animal-badge tappable"
                  title={`${b.label} · ${b.tier}`}
                  aria-label={`${b.label} rozeti, kademeleri gör`}
                  onClick={() => setLadderKey(b.key)}
                >
                  <BadgeSymbol symbol={b.symbol} tier={b.tier} size={18} />
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Follow vs. care (P6 item 8): "takip et" has no condition and
          toggles; "bakım ver" is the camera-photo step. Hidden in match review.
          A carer adds photos from the grid's add tile above, not from a
          button here (mobile parity). */}
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
            /* The state keeps the button's outline (P7 item 4): the same
               green ring as the followed state, not clickable. */
            <span className="btn small grow outline-success carer-state" role="status">
              ✓ bakım veriyorsun
            </span>
          ) : (
            <button className="btn small grow" onClick={openCare}>
              📷 bakım ver
            </button>
          )}
        </div>
      )}

      {/* Who cares for this animal (demo item 7): the rows are doors to the
          people, which is what the "N bakıcı" count above promises. */}
      <h2 className="section">bakıcılar</h2>
      {carers.length === 0 ? (
        <div className="card flat muted">Henüz bakıcı yok. İlk bakıcı sen ol.</div>
      ) : (
        carers
          .slice(0, visibleCarers)
          .map((carer) => <CarerRow key={carer.id} carer={carer} selfId={selfId} />)
      )}
      <LoadMoreButton
        remaining={carers.length - visibleCarers}
        onClick={() => setVisibleCarers(carers.length)}
      />

      {/* Last-seen mini map (mobile parity + PROJECT.md requirement): where
          and when the animal was last recorded. The thumbnail is the
          affordance (demo item 8) — a click opens the same spot as a
          pannable map in a sheet. */}
      <h2 className="section">en son görüldüğü yer</h2>
      <MiniMap
        /* The map builds once and never recenters; the key remounts it when
           the route shows a different animal. */
        key={animal.id}
        lat={animal.location.coordinates[1]}
        lng={animal.location.coordinates[0]}
        height={160}
        onOpen={() => setLocationOpen(true)}
        openLabel="En son görüldüğü yeri haritada aç"
        openHint="haritada aç"
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
      <div className="muted animal-seen-at">{formatDate(animal.location_updated_at)}</div>

      {/* Vaccinations above health records: on the street the first question is "vaccinated?". */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section">aşı kayıtları</h2>
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
              {formatDate(v.administered_at)}
              {v.recorded_by_name && (
                <>
                  {' · '}
                  <PersonLink userId={v.recorded_by} name={v.recorded_by_name} selfId={selfId} />
                </>
              )}
              {v.next_due_at ? ` · Sonraki doz: ${formatDate(v.next_due_at)}` : ''}
            </div>
          </div>
        ))
      )}
      <LoadMoreButton
        remaining={animal.vaccinations.length - visibleVaccinations}
        onClick={() => setVisibleVaccinations(animal.vaccinations.length)}
      />

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section">sağlık kayıtları</h2>
        {animal.isCarer && (
          <button className="link" onClick={() => setRecordOpen(true)}>
            + kayıt ekle
          </button>
        )}
      </div>
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
                {r.vet_verified ? ' · veteriner onaylı' : ''}
                {r.recorded_by_name && (
                  <>
                    {' · '}
                    <PersonLink userId={r.recorded_by} name={r.recorded_by_name} selfId={selfId} />
                  </>
                )}
                {' · '}
                {r.comment_count} yorum · dokunarak kayıtları gör
                {r.status === 'recovered' && r.recovered_by_name && (
                  <>
                    {' · '}
                    <PersonLink userId={r.recovered_by} name={r.recovered_by_name} selfId={selfId} /> iyileşti
                    olarak işaretledi
                  </>
                )}
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
      <LoadMoreButton
        remaining={animal.healthRecords.length - visibleRecords}
        onClick={() => setVisibleRecords(animal.healthRecords.length)}
      />

      <h2 className="section">sohbet</h2>
      {/* The chat is the carers' room (owner decision, 2026-09-08):
          followers read it; the door in sits at the top of the section
          instead of a sticky bar (P8 review). */}
      {!matchReview && !animal.isCarer && (
        <div className="card flat carer-door">
          <p className="muted">Yorum yazmak bakıcılara açık. Yeni bir fotoğrafla sen de katıl.</p>
          <button className="btn small full" onClick={openCare}>
            📷 bakım ver
          </button>
        </div>
      )}
      <LoadMoreButton
        remaining={commentTotal - comments.length}
        loading={loadingOlder}
        onClick={loadOlderComments}
        label="Önceki yorumları yükle"
      />
      {comments.length === 0 && (
        <div className="card flat muted">Henüz yorum yok. İlk yorumu sen yap.</div>
      )}
      {comments.map((c) => (
        <div key={c.id} className="row" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
          <PersonAvatar
            userId={c.user_id}
            name={c.user_name}
            avatarUrl={c.avatar_url}
            size={34}
            selfId={selfId}
          />
          <div className="grow">
            <div className="row" style={{ gap: 6 }}>
              <strong style={{ fontSize: 14 }}>
                <PersonLink userId={c.user_id} name={c.user_name} selfId={selfId} />
              </strong>
              {c.user_is_demo && <span className="demo-chip">demo</span>}
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
            {!confirmReports
              ? 'Eklemek istediğin hayvan bu mu? Bakıcısı olmak için profilden "bakım ver".'
              : photoChecked
                ? 'Eklemek istediğin hayvan bu mu?'
                : 'Eklemek istediğin hayvan bu mu? Fotoğraf kontrol edilemedi; konumu güncellersin.'}
          </p>
          <div className="row">
            {/* The same rule as the header's back (DESIGN §8): history, or
                the flow's own page when a shared link opened this review
                with nothing behind it. */}
            <button className="btn secondary grow" onClick={backToMatches}>
              Geri dön
            </button>
            {/* The confirm takes this review's place in history (mobile
                parity: the confirm pops the review there). A pushed confirm
                left the review one browser back away while "Kaydediliyor…"
                was still reporting, and "Bu o" again there reported a second
                sighting (a second notification to the followers). */}
            <button
              className="btn grow"
              onClick={() =>
                navigate('/hayvanlar/yeni', {
                  replace: true,
                  state: { confirmedAnimalId: animalId, confirmedSighting: confirmReports },
                })
              }
            >
              {confirmReports ? '✓ Bu o — eşleştir' : 'Bu o — profili aç'}
            </button>
          </div>
        </div>
      ) : animal.isCarer ? (
        /* The comment row (handoff): cream input + gradient send button. It
           belongs to the chat and scrolls away with it (owner, 2026-09-15):
           pinned to the bottom, it covered every section above the chat. */
        <form ref={composerRef} onSubmit={sendComment}>
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
              className="grow animal-composer-input"
              placeholder="Yorum yaz…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="btn small" disabled={sending || !draft.trim()}>
              Gönder
            </button>
          </div>
        </form>
      ) : null}

      <ReportDialog
        open={reportOpen && !matchReview}
        onClose={() => setReportOpen(false)}
        targetType="animal"
        targetId={animal.id}
      />

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

      <AnimalBadgeLadder
        open={ladderKey !== null}
        onClose={() => setLadderKey(null)}
        steps={animal.badgeLadder}
        focusKey={ladderKey}
        animalName={displayName}
      />

      {careOpen && (
        <div className="backdrop" onClick={() => !careSending && closeCare()}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>
              {displayName} için {careAsCarer ? 'fotoğraf ekle' : 'bakım ver'}
            </h2>
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
                  yeni bir fotoğraf çek
                  {careAsCarer
                    ? '; galerisine eklenir.'
                    : '. Fotoğraf bu hayvanın kayıtlı fotoğraflarıyla karşılaştırılır; eşleşince bakıcısı olursun.'}
                </p>
                <div className="care-slots">
                  <button
                    type="button"
                    className={`care-slot ${carePhoto ? '' : 'empty'}`}
                    onClick={() => careInput.current?.click()}
                    aria-label={carePhoto ? 'Fotoğrafı yeniden çek' : 'Fotoğraf çek'}
                  >
                    {carePhoto ? (
                      <img src={URL.createObjectURL(carePhoto)} alt="" />
                    ) : (
                      <span>📷 Fotoğraf çek</span>
                    )}
                    {/* `capture`: the camera on a phone, the picker on a desktop. */}
                    <input
                      ref={careInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        const picked = e.target.files?.[0] ?? null;
                        if (picked) setCarePhoto(picked);
                        e.target.value = '';
                      }}
                    />
                  </button>
                </div>
                {careError && <div className="error">{careError}</div>}
                {/* What carer rights buy — news to someone who already holds them. */}
                {!careAsCarer && (
                  <p className="subtle">
                    Bakıcılar yorum yazabilir, görülme bildirebilir, sağlık ve aşı kaydı
                    ekleyebilir. Sadece haber almak istiyorsan "takip et" yeter.
                  </p>
                )}
                <button
                  className="btn full"
                  disabled={careSending || !carePhoto}
                  onClick={sendCarePhotos}
                >
                  {careSending ? 'Gönderiliyor…' : 'Fotoğrafı gönder'}
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
        <div className="backdrop" onClick={() => !saving && closeRecord()}>
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
              onClick={closeRecord}
            >
              Vazgeç
            </button>
            {/* Vet/clinic ad while opening a health record. */}
            <AdBanner slot="vet_health_record" visible={recordOpen} />
          </div>
        </div>
      )}

      {vaccineOpen && (
        <div className="backdrop" onClick={() => !saving && closeVaccine()}>
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
              onClick={closeVaccine}
            >
              Vazgeç
            </button>
            <AdBanner slot="vet_health_record" visible={vaccineOpen} />
          </div>
        </div>
      )}

      {logRecord && (
        <div className="backdrop" onClick={() => closeLog()}>
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
                  <PersonAvatar
                    userId={c.user_id}
                    name={c.user_name}
                    avatarUrl={c.avatar_url}
                    size={30}
                    selfId={selfId}
                  />
                  <div className="grow">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="name-with-chip">
                        <strong style={{ fontSize: 14 }}>
                          <PersonLink userId={c.user_id} name={c.user_name} selfId={selfId} />
                        </strong>
                        {c.user_is_demo && <span className="demo-chip">demo</span>}
                      </div>
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

      {/* Always mounted so its history effect only ever fires on the open
          transition — see the component. */}
      <AnimalLocationDialog
        open={locationOpen}
        onOpen={() => setLocationOpen(true)}
        onClose={() => setLocationOpen(false)}
        species={animal.species}
        breed={animal.breed}
        photoUrl={animal.cover_thumb_url}
        lat={animal.location.coordinates[1]}
        lng={animal.location.coordinates[0]}
        updatedAtLabel={formatDate(animal.location_updated_at)}
      />
    </div>
  );
}
