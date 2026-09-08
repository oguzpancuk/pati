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
    /** null when the message was deleted. */
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

export interface Message {
  id: number;
  conversationId: number;
  /** null once the sender's account is gone. */
  sender: UserSummary | null;
  /** null when deleted. */
  body: string | null;
  deleted: boolean;
  /** For a deleted message: true = the sender took it back, false = an admin removed it. */
  deletedBySender: boolean | null;
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

export async function sendMessage(id: number, body: string): Promise<Message> {
  const { data } = await apiClient.post<Message>(`/messages/conversations/${id}/messages`, {
    body,
  });
  return data;
}

export async function markConversationRead(id: number): Promise<void> {
  await apiClient.post(`/messages/conversations/${id}/read`);
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

/**
 * Folds a poll answer into the list the screen holds: blank the deleted,
 * append the new, and keep id order. The order matters because the client
 * never advances its cursor on send: the echo of an own message may come
 * back next to a reply that was sent just before it (review finding).
 */
export function applyPoll(current: Message[], page: MessagesPage): Message[] {
  const deleted = new Map(page.deleted.map((d) => [d.id, d.deletedBySender]));
  const known = new Set(current.map((m) => m.id));
  const kept = current.map((m) =>
    deleted.has(m.id) && !m.deleted
      ? { ...m, body: null, deleted: true, deletedBySender: deleted.get(m.id) ?? null }
      : m
  );
  return kept.concat(page.messages.filter((m) => !known.has(m.id))).sort((a, b) => a.id - b.id);
}
