/**
 * Messaging endpoints (ROADMAP P6 item 4). Same contract as
 * mobile/src/api/messages.ts; the types are repeated here like the rest of
 * web's client, because the mobile module imports the axios client.
 */
import { api, UserSummary } from '../api';
import type { ReportReason } from '@mobile/reportReasons';

export const POLL_INTERVAL_MS = 5000;

export type ConversationKind = 'direct' | 'group';
export type MemberRole = 'admin' | 'member';

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
    body: string | null;
    deleted: boolean;
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

export const fetchConversations = () =>
  api
    .get<{ conversations: ConversationSummary[] }>('/messages/conversations')
    .then((r) => r.conversations);

export const openDirectConversation = (userId: number) =>
  api.post<{ id: number; created: boolean }>('/messages/direct', { userId });

export const createGroup = (name: string, memberIds: number[]) =>
  api.post<{ id: number }>('/messages/groups', { name, memberIds });

export const fetchConversation = (id: number) =>
  api.get<ConversationDetail>(`/messages/conversations/${id}`);

export const renameGroup = (id: number, name: string) =>
  api.put<{ id: number; name: string }>(`/messages/conversations/${id}`, { name });

export const addMember = (id: number, userId: number) =>
  api
    .post<{ members: Member[] }>(`/messages/conversations/${id}/members`, { userId })
    .then((r) => r.members);

export const removeMember = (id: number, userId: number) =>
  api
    .del<{ members: Member[] }>(`/messages/conversations/${id}/members/${userId}`)
    .then((r) => r.members);

export const promoteMember = (id: number, userId: number) =>
  api
    .post<{ members: Member[] }>(`/messages/conversations/${id}/members/${userId}/promote`)
    .then((r) => r.members);

export const leaveGroup = (id: number) => api.post<void>(`/messages/conversations/${id}/leave`);

export function fetchMessages(
  id: number,
  params: { after?: number; before?: number; since?: string; limit?: number } = {}
) {
  const q = new URLSearchParams();
  if (params.after) q.set('after', String(params.after));
  if (params.before) q.set('before', String(params.before));
  if (params.since) q.set('since', params.since);
  if (params.limit) q.set('limit', String(params.limit));
  const qs = q.toString();
  return api.get<MessagesPage>(`/messages/conversations/${id}/messages${qs ? `?${qs}` : ''}`);
}

export const sendMessage = (id: number, body: string, replyToId?: number) =>
  api.post<Message>(`/messages/conversations/${id}/messages`, { body, replyToId });

export const markConversationRead = (id: number) =>
  api.post<void>(`/messages/conversations/${id}/read`);

export const deleteMessage = (messageId: number) => api.del<void>(`/messages/${messageId}`);

export const reportMessage = (messageId: number, reason: ReportReason, details?: string) =>
  api.post<void>(`/messages/${messageId}/report`, { reason, details });

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
 * Blanks the given deletions in a list the page holds: the message itself,
 * and every quote that points at it. Used by the poll and by a local
 * delete (same contract as mobile's withDeleted, which carries the jest test).
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
 * Folds a poll answer into the list the page holds: blank the deleted,
 * append the new, keep id order (same contract as mobile's applyPoll, which
 * carries the jest test).
 */
export function applyPoll(current: Message[], page: MessagesPage): Message[] {
  const known = new Set(current.map((m) => m.id));
  return withDeleted(current, page.deleted)
    .concat(page.messages.filter((m) => !known.has(m.id)))
    .sort((a, b) => a.id - b.id);
}

/** "14:05" today, "3 Eyl" otherwise. */
export function formatWhen(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) {
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
