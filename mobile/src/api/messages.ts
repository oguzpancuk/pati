import { apiClient } from './client';
import type { UserSummary } from './users';
import type { ReportReason } from '../reportReasons';

/**
 * Messaging (ROADMAP P6 item 4). Delivery is polling: a conversation screen
 * asks for `after=<last id>` every few seconds while it is in front, and
 * echoes the server's `now` back as `since` so admin deletions of messages
 * it already shows come back in `deleted`.
 */

export const POLL_INTERVAL_MS = 5000;

/**
 * The tab badge's own cadence (demo note 10): the count is a glance, not a
 * conversation, so it polls once a minute while the tabs are in front — the
 * same rhythm the profile bell uses.
 */
export const UNREAD_POLL_INTERVAL_MS = 60 * 1000;

export type ConversationKind = 'direct' | 'group';
export type MemberRole = 'admin' | 'member';

/**
 * 'system' is the conversation speaking — "X gruba yeni üye ekledi: Y"
 * (demo note 12). It has no sender and is neither reportable nor
 * deletable; the server refuses all three, and the clients render it as a
 * centred line instead of a bubble.
 */
export type MessageKind = 'user' | 'system';

export interface ConversationSummary {
  id: number;
  kind: ConversationKind;
  /** The group's name, or the other person's for a DM. */
  name: string;
  otherUser: UserSummary | null;
  memberCount: number;
  role: MemberRole;
  unreadCount: number;
  lastMessage: {
    id: number;
    kind: MessageKind;
    /** null when the message was deleted. */
    body: string | null;
    deleted: boolean;
    /** Always null for a system line — nobody wrote it. */
    senderId: number | null;
    senderName: string | null;
    createdAt: string;
  } | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface Member extends UserSummary {
  role: MemberRole;
  joined_at: string;
}

export interface ConversationDetail {
  id: number;
  kind: ConversationKind;
  name: string;
  role: MemberRole;
  createdBy: number | null;
  createdAt: string;
  otherUser: UserSummary | null;
  /** False in a DM whose friendship ended: history stays, the composer greys. */
  canSend: boolean;
  members: Member[];
}

/** The quoted source of a reply, resolved server-side on every row (P7 item 7). */
export interface Quote {
  id: number;
  /** Name only; null once the account is gone. */
  sender: { id: number; name: string } | null;
  /** The first ~120 characters, whitespace folded; null when the source is deleted. */
  excerpt: string | null;
  deleted: boolean;
}

export interface Message {
  id: number;
  conversationId: number;
  kind: MessageKind;
  /** null once the sender's account is gone — and always, for a system line. */
  sender: UserSummary | null;
  /** null when deleted. */
  body: string | null;
  deleted: boolean;
  /** For a deleted message: true = the sender took it back, false = an admin removed it. */
  deletedBySender: boolean | null;
  /** The message this one replies to, or null. */
  replyTo: Quote | null;
  createdAt: string;
}

/** A soft delete the poll reports for a message the client already holds. */
export interface DeletedRef {
  id: number;
  deletedBySender: boolean | null;
}

export interface MessagesPage {
  messages: Message[];
  deleted: DeletedRef[];
  hasMore: boolean;
  /** Server time; hand it back as `since` on the next poll. */
  now: string;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const { data } = await apiClient.get<{ conversations: ConversationSummary[] }>(
    '/messages/conversations'
  );
  return data.conversations;
}

/**
 * The tab badge's subscription. A conversation is marked read while the tabs
 * are blurred, so the badge used to re-read the count on its own clock when
 * they came back and race the read it was waiting for. It now FOLLOWS the
 * read: `markConversationRead` publishes the total the server computed in
 * the same request that did the stamping, so there is no second number to
 * disagree with. The minute poll stays for messages that arrive from
 * elsewhere.
 */
type UnreadListener = (count: number) => void;
const unreadListeners = new Set<UnreadListener>();

export function subscribeUnreadMessageCount(listener: UnreadListener): () => void {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

/** Every conversation's unread counts added up server-side, for the tab badge. */
export async function fetchUnreadMessageCount(): Promise<number> {
  const { data } = await apiClient.get<{ unreadCount: number }>('/messages/unread-count');
  return data.unreadCount;
}

export async function openDirectConversation(
  userId: number
): Promise<{ id: number; created: boolean }> {
  const { data } = await apiClient.post<{ id: number; created: boolean }>('/messages/direct', {
    userId,
  });
  return data;
}

export async function createGroup(name: string, memberIds: number[]): Promise<{ id: number }> {
  const { data } = await apiClient.post<{ id: number }>('/messages/groups', { name, memberIds });
  return data;
}

export async function fetchConversation(id: number): Promise<ConversationDetail> {
  const { data } = await apiClient.get<ConversationDetail>(`/messages/conversations/${id}`);
  return data;
}

export async function renameGroup(id: number, name: string): Promise<void> {
  await apiClient.put(`/messages/conversations/${id}`, { name });
}

export async function addMember(id: number, userId: number): Promise<Member[]> {
  const { data } = await apiClient.post<{ members: Member[] }>(
    `/messages/conversations/${id}/members`,
    { userId }
  );
  return data.members;
}

export async function removeMember(id: number, userId: number): Promise<Member[]> {
  const { data } = await apiClient.delete<{ members: Member[] }>(
    `/messages/conversations/${id}/members/${userId}`
  );
  return data.members;
}

export async function promoteMember(id: number, userId: number): Promise<Member[]> {
  const { data } = await apiClient.post<{ members: Member[] }>(
    `/messages/conversations/${id}/members/${userId}/promote`
  );
  return data.members;
}

export async function leaveGroup(id: number): Promise<void> {
  await apiClient.post(`/messages/conversations/${id}/leave`);
}

export async function fetchMessages(
  id: number,
  params: { after?: number; before?: number; since?: string; limit?: number } = {}
): Promise<MessagesPage> {
  const { data } = await apiClient.get<MessagesPage>(`/messages/conversations/${id}/messages`, {
    params,
  });
  return data;
}

export async function sendMessage(id: number, body: string, replyToId?: number): Promise<Message> {
  const { data } = await apiClient.post<Message>(`/messages/conversations/${id}/messages`, {
    body,
    replyToId,
  });
  return data;
}

/**
 * Announce a conversation read. The server answers with the caller's new
 * unread TOTAL, which every subscriber gets — that is how the tab badge
 * follows the read instead of polling against it.
 */
export async function markConversationRead(id: number): Promise<number | null> {
  const { data } = await apiClient.post<{ read: boolean; unreadCount?: number }>(
    `/messages/conversations/${id}/read`
  );
  const count = typeof data?.unreadCount === 'number' ? data.unreadCount : null;
  if (count !== null) {
    for (const listener of unreadListeners) listener(count);
  }
  return count;
}

export async function deleteMessage(messageId: number): Promise<void> {
  await apiClient.delete(`/messages/${messageId}`);
}

export async function reportMessage(
  messageId: number,
  reason: ReportReason,
  details?: string
): Promise<void> {
  await apiClient.post(`/messages/${messageId}/report`, { reason, details });
}

const QUOTE_EXCERPT = 120;

/** The composer's preview of a pending quote; the server cuts the real one the same way. */
export function quoteOf(m: Message): Quote {
  const flat = (m.body ?? '').replace(/\s+/g, ' ').trim();
  return {
    id: m.id,
    sender: m.sender ? { id: m.sender.id, name: m.sender.name } : null,
    excerpt: m.deleted
      ? null
      : flat.length > QUOTE_EXCERPT
      ? `${flat.slice(0, QUOTE_EXCERPT).trimEnd()}…`
      : flat,
    deleted: m.deleted,
  };
}

/**
 * Blanks the given deletions in a list the screen holds: the message
 * itself, and every quote that points at it — the source's placeholder
 * must match wherever it is shown. Used by the poll and by a local delete.
 */
export function withDeleted(current: Message[], refs: DeletedRef[]): Message[] {
  if (refs.length === 0) return current;
  const deleted = new Map(refs.map((d) => [d.id, d.deletedBySender]));
  return current.map((m) => {
    let next = m;
    if (deleted.has(m.id) && !m.deleted) {
      next = { ...next, body: null, deleted: true, deletedBySender: deleted.get(m.id) ?? null };
    }
    if (next.replyTo && !next.replyTo.deleted && deleted.has(next.replyTo.id)) {
      next = { ...next, replyTo: { ...next.replyTo, excerpt: null, deleted: true } };
    }
    return next;
  });
}

/**
 * Folds a poll answer into the list the screen holds: blank the deleted,
 * append the new, and keep id order. The order matters because the client
 * never advances its cursor on send: the echo of an own message may come
 * back next to a reply that was sent just before it (review finding).
 */
export function applyPoll(current: Message[], page: MessagesPage): Message[] {
  const known = new Set(current.map((m) => m.id));
  return withDeleted(current, page.deleted)
    .concat(page.messages.filter((m) => !known.has(m.id)))
    .sort((a, b) => a.id - b.id);
}
