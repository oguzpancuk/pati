import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { REPORT_REASONS, ReportReason } from '@mobile/reportReasons';
import { useAuth } from '../auth';
import {
  applyPoll,
  ConversationDetail,
  deleteMessage,
  fetchConversation,
  fetchMessages,
  markConversationRead,
  Message,
  POLL_INTERVAL_MS,
  reportMessage,
  sendMessage,
} from '../api/messages';
import { UserAvatar } from '../avatars';

const PAGE = 50;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * One conversation (mobile parity: ConversationScreen): the newest page,
 * older pages on demand, a 5-second poll while the tab is visible. Each
 * bubble has a "⋯" for delete (own, or any as a group admin) and report —
 * the web stand-in for mobile's long press.
 */
export default function ConversationPage() {
  const { id } = useParams();
  const conversationId = Number(id);
  const navigate = useNavigate();
  const { me } = useAuth();
  const myId = me?.id;
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const lastId = useRef<number | null>(null);
  const since = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    fetchConversation(conversationId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Sohbet bulunamadı'));
  }, [conversationId]);

  useEffect(() => {
    fetchMessages(conversationId, { limit: PAGE })
      .then((page) => {
        setMessages(page.messages);
        setHasMore(page.hasMore);
        lastId.current = page.messages.length ? page.messages[page.messages.length - 1].id : null;
        since.current = page.now;
        markConversationRead(conversationId).catch(() => {});
        requestAnimationFrame(scrollToBottom);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Mesajlar alınamadı'));
  }, [conversationId, scrollToBottom]);

  const poll = useCallback(async () => {
    try {
      const page = await fetchMessages(conversationId, {
        after: lastId.current ?? undefined,
        since: since.current ?? undefined,
        limit: PAGE,
      });
      since.current = page.now;
      if (page.messages.length || page.deletedIds.length) {
        setMessages((prev) => applyPoll(prev ?? [], page));
      }
      if (page.messages.length) {
        lastId.current = page.messages[page.messages.length - 1].id;
        markConversationRead(conversationId).catch(() => {});
        if (stickToBottom.current) requestAnimationFrame(scrollToBottom);
      }
    } catch {
      // The next tick retries.
    }
  }, [conversationId, scrollToBottom]);

  useEffect(() => {
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(poll, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        poll();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [poll]);

  async function loadOlder() {
    if (!hasMore || loadingOlder || !messages?.length) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await fetchMessages(conversationId, { before: messages[0].id, limit: PAGE });
      setMessages((prev) => page.messages.concat(prev ?? []));
      setHasMore(page.hasMore);
      // Keep the viewport on the same message after the older page lands above.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch {
      // The button stays; pressing again retries.
    } finally {
      setLoadingOlder(false);
    }
  }

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await sendMessage(conversationId, body);
      setDraft('');
      setMessages((prev) =>
        (prev ?? []).some((m) => m.id === sent.id) ? prev : [...(prev ?? []), sent]
      );
      lastId.current = Math.max(lastId.current ?? 0, sent.id);
      stickToBottom.current = true;
      requestAnimationFrame(scrollToBottom);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  async function remove(m: Message) {
    setMenuFor(null);
    const mine = !!myId && m.sender?.id === myId;
    try {
      await deleteMessage(m.id);
      setMessages((prev) =>
        (prev ?? []).map((x) =>
          x.id === m.id ? { ...x, body: null, deleted: true, deletedBySender: mine } : x
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
    }
  }

  const isGroup = detail?.kind === 'group';
  const isAdmin = isGroup && detail?.role === 'admin';

  return (
    <div className="page fill msg-page">
      <div className="topbar msg-topbar">
        <button className="back" onClick={() => navigate(-1)} aria-label="Geri">
          ‹
        </button>
        <div className="msg-title">
          <strong>{detail?.name ?? '…'}</strong>
          {isGroup && <span className="subtle">{detail?.members.length} üye</span>}
        </div>
        {isGroup ? (
          <Link
            to={`/mesajlar/${conversationId}/ayarlar`}
            className="link"
            aria-label="Grup ayarları"
          >
            ayarlar
          </Link>
        ) : detail?.otherUser ? (
          <Link to={`/kullanici/${detail.otherUser.id}`} aria-label={detail.otherUser.name}>
            <UserAvatar
              avatarUrl={detail.otherUser.avatar_url}
              name={detail.otherUser.name}
              size={30}
            />
          </Link>
        ) : (
          <span />
        )}
      </div>

      <div
        ref={listRef}
        className="msg-list"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        onClick={() => setMenuFor(null)}
      >
        {error && <div className="error">{error}</div>}
        {messages === null && !error && <p className="muted">Yükleniyor…</p>}
        {hasMore && (
          <button className="btn ghost small full" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Yükleniyor…' : 'Daha eski mesajlar'}
          </button>
        )}
        {messages && messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
            {isGroup ? 'Gruba ilk mesajı sen yaz.' : 'İlk mesajı sen yaz.'}
          </p>
        )}
        {messages?.map((m, i) => {
          const mine = !!myId && m.sender?.id === myId;
          const showName = isGroup && !mine && messages[i - 1]?.sender?.id !== m.sender?.id;
          const canDelete = !m.deleted && (mine || isAdmin);
          const canReport = !m.deleted && !mine;
          return (
            <div key={m.id} className={`msg-line${mine ? ' mine' : ''}`}>
              {showName && (
                <div className="micro msg-sender">{m.sender?.name ?? 'silinmiş kullanıcı'}</div>
              )}
              <div className={`msg-bubble${mine ? ' mine' : ''}${m.deleted ? ' deleted' : ''}`}>
                {m.deleted ? (
                  <span className="subtle">
                    {m.deletedBySender === false ? 'Yönetici bu mesajı sildi' : 'Bu mesaj silindi'}
                  </span>
                ) : (
                  <span className="msg-body">{m.body}</span>
                )}
                <span className="msg-time">{formatTime(m.createdAt)}</span>
                {(canDelete || canReport) && (
                  <button
                    type="button"
                    className="msg-more"
                    aria-label="Mesaj seçenekleri"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor(menuFor === m.id ? null : m.id);
                    }}
                  >
                    ⋯
                  </button>
                )}
              </div>
              {menuFor === m.id && (
                <div className="msg-menu" onClick={(e) => e.stopPropagation()}>
                  {canDelete && (
                    <button type="button" className="link danger" onClick={() => remove(m)}>
                      sil
                    </button>
                  )}
                  {canReport && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setMenuFor(null);
                        setReporting(m);
                      }}
                    >
                      şikayet et
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="msg-composer">
        {detail && !detail.canSend ? (
          <p className="muted" style={{ textAlign: 'center', margin: '6px 0' }}>
            Artık arkadaş değilsiniz; yeni mesaj gönderilemez.
          </p>
        ) : (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              className="msg-input"
              placeholder="Mesaj yaz…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={2000}
              disabled={!detail}
            />
            <button
              type="submit"
              className="msg-send"
              disabled={!draft.trim() || sending}
              aria-label="Gönder"
            >
              ›
            </button>
          </form>
        )}
      </div>

      {reporting && <ReportMessageSheet message={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}

/** The report sheet for a message; components/ReportDialog only knows the /reports targets. */
function ReportMessageSheet({ message, onClose }: { message: Message; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await reportMessage(message.id, reason, details.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="backdrop" onClick={() => !busy && onClose()}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {done ? (
          <>
            <p style={{ textAlign: 'center', margin: '12px 0 16px' }}>
              Şikayetin alındı; en kısa sürede incelenecek. Teşekkürler.
            </p>
            <button className="btn full" onClick={onClose}>
              Tamam
            </button>
          </>
        ) : (
          <>
            <div className="micro" style={{ textAlign: 'center' }}>
              şikayet
            </div>
            <h2 style={{ textAlign: 'center', margin: '2px 0 4px' }}>Sorun ne?</h2>
            <p className="muted" style={{ textAlign: 'center', margin: '0 0 14px' }}>
              Şikayetin yalnızca moderasyon ekibine gider.
            </p>
            <div className="chiprow" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`chip${reason === r.key ? ' selected' : ''}`}
                  onClick={() => setReason(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>açıklama (isteğe bağlı)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn full" disabled={!reason || busy} onClick={submit}>
              {busy ? 'Gönderiliyor…' : 'Şikayeti gönder'}
            </button>
            <button
              type="button"
              className="link"
              style={{ display: 'block', margin: '10px auto 0' }}
              onClick={onClose}
              disabled={busy}
            >
              Vazgeç
            </button>
          </>
        )}
      </div>
    </div>
  );
}
