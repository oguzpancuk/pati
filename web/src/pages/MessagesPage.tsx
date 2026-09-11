import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConversationSummary,
  fetchConversations,
  formatWhen,
  POLL_INTERVAL_MS,
} from '../api/messages';
import { UserAvatar } from '../avatars';
import { NewConversationForm } from '../components/NewConversationForm';
// DESIGN §8 point 3: the dialog is not a page, so Escape and Back close it
// rather than leaving the inbox.
import { Sheet } from '../components/profile/Sheet';

function preview(c: ConversationSummary) {
  if (!c.lastMessage) return c.kind === 'group' ? `${c.memberCount} üye` : 'Henüz mesaj yok';
  if (c.lastMessage.deleted) return 'Mesaj silindi';
  const who = c.kind === 'group' && c.lastMessage.senderName ? `${c.lastMessage.senderName}: ` : '';
  return `${who}${c.lastMessage.body ?? ''}`;
}

/** The fourth tab (mobile parity: MessagesScreen): the inbox, polled while the tab is visible. */
export default function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConversations(await fetchConversations());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sohbetler yüklenemedi');
    }
  }, []);

  // Poll only while the page is visible: a background tab would otherwise
  // keep the server busy for nobody.
  useEffect(() => {
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(load, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        load();
        start();
      }
    };
    load();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  return (
    <div className="page">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="grow">
          <h1 style={{ margin: 0, fontSize: 22 }}>Mesajlar</h1>
          <div className="muted">Arkadaşlarınla ve gruplarınla</div>
        </div>
        {/* A dialog, not a route: starting a chat is a task you finish and
            come back from (owner, 2026-09-11). /mesajlar/yeni still exists
            for a link or a cold start. */}
        <button type="button" className="btn small" onClick={() => setNewOpen(true)}>
          + Yeni
        </button>
      </div>

      {conversations === null && !error && <p className="muted">Yükleniyor…</p>}
      {error && <div className="error">{error}</div>}
      {conversations && conversations.length === 0 && (
        <div className="card flat msg-empty">
          <strong>Henüz sohbet yok</strong>
          <div className="muted">
            Bir arkadaşına yaz ya da mahallenin gönüllüleriyle bir grup kur.
          </div>
          <button
            type="button"
            className="btn"
            style={{ marginTop: 12 }}
            onClick={() => setNewOpen(true)}
          >
            Yeni sohbet
          </button>
        </div>
      )}
      {conversations?.map((c) => {
        const unread = c.unreadCount > 0;
        return (
          <Link
            key={c.id}
            to={`/mesajlar/${c.id}`}
            className={`card flat row msg-row${unread ? ' unread' : ''}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            {c.kind === 'group' ? (
              <span className="msg-group-avatar" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 11.4a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M2.8 19.4a6.2 6.2 0 0 1 12.4 0 M15.6 5.2a3.2 3.2 0 0 1 0 6.2 M17.2 13.6a6.2 6.2 0 0 1 4 5.8" />
                </svg>
              </span>
            ) : (
              <UserAvatar avatarUrl={c.otherUser?.avatar_url} name={c.name} size={44} />
            )}
            <div className="grow">
              <div className="row">
                <strong className="grow msg-name">{c.name}</strong>
                {c.lastMessage && (
                  <span className={unread ? 'msg-when brand' : 'msg-when'}>
                    {formatWhen(c.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              <div className="row">
                <span className="grow msg-preview">{preview(c)}</span>
                {unread && (
                  <span className="msg-unread">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>
                )}
              </div>
            </div>
          </Link>
        );
      })}

      <Sheet open={newOpen} onClose={() => setNewOpen(false)} title="Yeni sohbet">
        <NewConversationForm />
      </Sheet>
    </div>
  );
}
