/**
 * Being added to a group is a message, not a new notification kind (owner
 * decision, 2026-09-11, demo note 12): a `kind = 'system'` row lands in the
 * group itself, so the unread count, the tab badge and the inbox ordering
 * all follow from the messages table.
 *
 * What is easy to break by accident is the wire shape. A system row stores
 * the actor as its sender — that is what keeps the event out of the unread
 * count of the person who caused it — and every shape must strip that
 * actor again on the way out, or a client will draw an avatar, offer a
 * "report", or prefix the inbox preview with a name for a line nobody
 * wrote. These tests pin exactly that, plus the Turkish sentences.
 *
 * No database: the shapers are pure functions over a joined row.
 */
const test = require('node:test');
const assert = require('node:assert');

const {
  isSystemRow,
  shapeMessage,
  shapeLastMessage,
  systemBody,
} = require('../src/controllers/message.controller');

const JOINED_AT = new Date('2026-09-01T00:00:00Z');

/** A joined `messages` row as MESSAGE_SELECT returns it. */
function row(overrides = {}) {
  return {
    id: 5,
    conversation_id: 2,
    sender_id: 9,
    sender_name: 'Ayşe',
    sender_avatar_url: 'pati-avatar:f3',
    body: 'merhaba',
    kind: 'user',
    created_at: new Date('2026-09-02T10:00:00Z'),
    deleted_at: null,
    deleted_by: null,
    quote_id: null,
    quote_body: null,
    quote_deleted_at: null,
    quote_created_at: null,
    quote_sender_id: null,
    quote_sender_name: null,
    ...overrides,
  };
}

test('only a kind of "system" is a system row', () => {
  assert.strictEqual(isSystemRow(row()), false);
  assert.strictEqual(isSystemRow(row({ kind: 'system' })), true);
  // A row from before the column existed reads as a person's message.
  assert.strictEqual(isSystemRow(row({ kind: undefined })), false);
  assert.strictEqual(isSystemRow(null), false);
});

test('a system message reaches the client with no sender at all', () => {
  const shaped = shapeMessage(
    row({ kind: 'system', body: 'Ayşe gruba yeni üye ekledi: Mehmet' }),
    JOINED_AT
  );
  assert.strictEqual(shaped.kind, 'system');
  // The actor is in the database (sender_id 9) and must not be on the wire:
  // the clients key "who wrote this" off `sender`.
  assert.strictEqual(shaped.sender, null);
  assert.strictEqual(shaped.body, 'Ayşe gruba yeni üye ekledi: Mehmet');
  assert.strictEqual(shaped.deleted, false);
});

test('a system message never carries a quote', () => {
  // Replying to one is refused at send time; a row that somehow had a
  // reply_to_id must still not show a quoted sender.
  const shaped = shapeMessage(
    row({
      kind: 'system',
      quote_id: 4,
      quote_body: 'selam',
      quote_created_at: new Date('2026-09-02T09:00:00Z'),
      quote_sender_id: 9,
      quote_sender_name: 'Ayşe',
    }),
    JOINED_AT
  );
  assert.strictEqual(shaped.replyTo, null);
});

test('a normal message is unchanged by the kind column', () => {
  const shaped = shapeMessage(row(), JOINED_AT);
  assert.strictEqual(shaped.kind, 'user');
  assert.deepStrictEqual(shaped.sender, {
    id: 9,
    name: 'Ayşe',
    avatar_url: 'pati-avatar:f3',
  });
  assert.strictEqual(shaped.body, 'merhaba');
});

test('a normal message still quotes its source', () => {
  const shaped = shapeMessage(
    row({
      quote_id: 4,
      quote_body: 'selam',
      quote_created_at: new Date('2026-09-02T09:00:00Z'),
      quote_sender_id: 3,
      quote_sender_name: 'Mehmet',
    }),
    JOINED_AT
  );
  assert.strictEqual(shaped.replyTo.id, 4);
  assert.deepStrictEqual(shaped.replyTo.sender, { id: 3, name: 'Mehmet' });
  assert.strictEqual(shaped.replyTo.excerpt, 'selam');
});

/** An inbox row as listConversations selects it. */
function inboxRow(overrides = {}) {
  return {
    last_id: 5,
    last_kind: 'user',
    last_body: 'merhaba',
    last_deleted_at: null,
    last_sender_id: 9,
    last_sender_name: 'Ayşe',
    last_created_at: new Date('2026-09-02T10:00:00Z'),
    ...overrides,
  };
}

test('the inbox preview of a system line names nobody', () => {
  const last = shapeLastMessage(
    inboxRow({ last_kind: 'system', last_body: 'Ayşe grubu oluşturdu.' })
  );
  assert.strictEqual(last.kind, 'system');
  // Both clients build the group preview as "<senderName>: <body>"; a null
  // name is what keeps it from reading "Ayşe: Ayşe grubu oluşturdu.".
  assert.strictEqual(last.senderId, null);
  assert.strictEqual(last.senderName, null);
  assert.strictEqual(last.body, 'Ayşe grubu oluşturdu.');
});

test('the inbox preview of a normal message still names its sender', () => {
  const last = shapeLastMessage(inboxRow());
  assert.strictEqual(last.kind, 'user');
  assert.strictEqual(last.senderId, 9);
  assert.strictEqual(last.senderName, 'Ayşe');
});

test('a conversation with nothing visible has no last message', () => {
  assert.strictEqual(shapeLastMessage(inboxRow({ last_id: null })), null);
});

test('a deleted last message keeps its placeholder', () => {
  const last = shapeLastMessage(inboxRow({ last_deleted_at: new Date() }));
  assert.strictEqual(last.deleted, true);
  assert.strictEqual(last.body, null);
});

test('the system sentences name both people without case suffixes', () => {
  // Turkish accusative endings depend on the last vowel and last letter of
  // the name; the sentences are written to avoid them entirely.
  assert.strictEqual(systemBody.groupCreated('Ayşe'), 'Ayşe grubu oluşturdu.');
  assert.strictEqual(
    systemBody.memberAdded('Ayşe', 'Mehmet'),
    'Ayşe gruba yeni üye ekledi: Mehmet'
  );
});

test('a missing name falls back instead of printing "undefined"', () => {
  // users.name cannot be null today, but a deleted account's row can drop
  // out of the member list the names are read from.
  assert.strictEqual(systemBody.groupCreated(undefined), 'Bir üye grubu oluşturdu.');
  assert.strictEqual(
    systemBody.memberAdded(undefined, undefined),
    'Bir yönetici gruba yeni üye ekledi: yeni üye'
  );
});
