const pool = require('../config/db');
const { REASONS } = require('./report.controller');

/**
 * Messaging (ROADMAP P6 item 4). Owner decisions, 2026-09-08: friends
 * message one-to-one; a user creates a named group from their own friends;
 * admins — the creator and whoever an admin promotes — rename, add and
 * remove members and delete any message; a member leaves; a message is
 * reportable through content_reports. Delivery is foreground polling
 * (GET …/messages?after=), no push.
 *
 * Every handler first resolves the caller's membership; a conversation the
 * caller is not in answers 404 rather than 403 so ids cannot be probed.
 */

const MAX_BODY = 2000;
const MAX_NAME = 80;
const MAX_GROUP_MEMBERS = 50;
const PAGE_DEFAULT = 50;
const PAGE_MAX = 100;
const MAX_REPORT_DETAILS = 1000;

const USER_COLUMNS = 'u.id, u.name, u.avatar_url';

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function areFriends(db, a, b) {
  const r = await db.query(
    `SELECT 1 FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
    [a, b]
  );
  return r.rows.length > 0;
}

/** Which of `ids` are accepted friends of `userId` (a set, for bulk checks). */
async function friendIdsAmong(db, userId, ids) {
  if (ids.length === 0) return new Set();
  const r = await db.query(
    `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
     FROM friendships
     WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)
       AND (CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END) = ANY($2::int[])`,
    [userId, ids]
  );
  return new Set(r.rows.map((row) => row.id));
}

/** The conversation plus the caller's role, or null when not a member. */
async function loadMembership(db, conversationId, userId) {
  const r = await db.query(
    `SELECT c.id, c.kind, c.name, c.created_by, c.created_at, c.last_message_at, m.role, m.last_read_at, m.joined_at
     FROM conversation_members m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.conversation_id = $1 AND m.user_id = $2`,
    [conversationId, userId]
  );
  return r.rows[0] || null;
}

async function listMembers(db, conversationId) {
  const r = await db.query(
    `SELECT ${USER_COLUMNS}, m.role, m.joined_at
     FROM conversation_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.conversation_id = $1
     ORDER BY (m.role = 'admin') DESC, m.joined_at, u.name`,
    [conversationId]
  );
  return r.rows;
}

/** Turns a joined message row into the wire shape; a deleted body never leaves the server. */
function shapeMessage(row) {
  const deleted = !!row.deleted_at;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sender: row.sender_id
      ? { id: row.sender_id, name: row.sender_name, avatar_url: row.sender_avatar_url }
      : null,
    body: deleted ? null : row.body,
    deleted,
    // Whether the sender took it back (true) or an admin removed it (false).
    deletedBySender: deleted ? row.deleted_by !== null && row.deleted_by === row.sender_id : null,
    createdAt: row.created_at,
  };
}

const MESSAGE_SELECT = `
  SELECT x.id, x.conversation_id, x.sender_id, x.body, x.created_at, x.deleted_at, x.deleted_by,
         u.name AS sender_name, u.avatar_url AS sender_avatar_url
  FROM messages x
  LEFT JOIN users u ON u.id = x.sender_id`;

// ---------------------------------------------------------------- inbox

async function listConversations(req, res, next) {
  try {
    const userId = req.user.userId;
    const r = await pool.query(
      `SELECT c.id, c.kind, c.name, c.created_at, c.last_message_at, m.role,
              (SELECT count(*)::int FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count,
              (SELECT count(*)::int FROM messages x
                WHERE x.conversation_id = c.id AND x.deleted_at IS NULL
                  AND x.created_at >= m.joined_at
                  AND x.sender_id IS DISTINCT FROM $1
                  AND (m.last_read_at IS NULL OR x.created_at > m.last_read_at)) AS unread_count,
              lm.id AS last_id, lm.body AS last_body, lm.deleted_at AS last_deleted_at,
              lm.sender_id AS last_sender_id, lm.created_at AS last_created_at,
              ls.name AS last_sender_name,
              other.id AS other_id, other.name AS other_name, other.avatar_url AS other_avatar_url
       FROM conversation_members m
       JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN LATERAL (
         SELECT id, body, deleted_at, sender_id, created_at FROM messages
         WHERE conversation_id = c.id AND created_at >= m.joined_at ORDER BY id DESC LIMIT 1
       ) lm ON true
       LEFT JOIN users ls ON ls.id = lm.sender_id
       LEFT JOIN LATERAL (
         SELECT ${USER_COLUMNS} FROM conversation_members om JOIN users u ON u.id = om.user_id
         WHERE c.kind = 'direct' AND om.conversation_id = c.id AND om.user_id <> $1 LIMIT 1
       ) other ON true
       WHERE m.user_id = $1
       -- Ordered by the last message THIS member can see (the lateral is
       -- cut at joined_at), not the conversation's own last_message_at: a
       -- freshly added member would otherwise see the group sorted by a
       -- message they cannot read. With nothing visible yet, the moment
       -- they joined is the freshest thing about it.
       ORDER BY COALESCE(lm.created_at, m.joined_at) DESC, c.id DESC`,
      [userId]
    );
    res.json({
      conversations: r.rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        // A direct conversation is titled by the other side; the account
        // may be gone (members cascade on user deletion).
        name: row.kind === 'group' ? row.name : row.other_name || 'Silinmiş kullanıcı',
        otherUser:
          row.kind === 'direct' && row.other_id
            ? { id: row.other_id, name: row.other_name, avatar_url: row.other_avatar_url }
            : null,
        memberCount: row.member_count,
        role: row.role,
        unreadCount: row.unread_count,
        lastMessage: row.last_id
          ? {
              id: row.last_id,
              body: row.last_deleted_at ? null : row.last_body,
              deleted: !!row.last_deleted_at,
              senderId: row.last_sender_id,
              senderName: row.last_sender_name,
              createdAt: row.last_created_at,
            }
          : null,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------- direct

// Find-or-create: both sides land on the same row through direct_key, so
// pressing "mesaj gönder" twice, or from both profiles, never forks a pair.
async function openDirect(req, res, next) {
  const userId = req.user.userId;
  const otherId = parseId(req.body.userId);
  if (!otherId || otherId === userId) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı' });
  }
  const client = await pool.connect();
  try {
    if (!(await areFriends(client, userId, otherId))) {
      return res.status(403).json({ error: 'Yalnızca arkadaşlarına mesaj gönderebilirsin' });
    }
    const key = `${Math.min(userId, otherId)}:${Math.max(userId, otherId)}`;
    await client.query('BEGIN');
    let conv = (
      await client.query(
        `INSERT INTO conversations (kind, created_by, direct_key) VALUES ('direct', $1, $2)
         ON CONFLICT (direct_key) WHERE direct_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [userId, key]
      )
    ).rows[0];
    const created = !!conv;
    if (!conv) {
      conv = (await client.query('SELECT id FROM conversations WHERE direct_key = $1', [key]))
        .rows[0];
    }
    // Both memberships, idempotently: a DM cannot be left, but an earlier
    // request may have died between the two inserts.
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)
       ON CONFLICT DO NOTHING`,
      [conv.id, userId, otherId]
    );
    await client.query('COMMIT');
    res.status(created ? 201 : 200).json({ id: conv.id, kind: 'direct', created });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- groups

function cleanName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { error: 'Gruba bir ad ver' };
  if (name.length > MAX_NAME) return { error: `Grup adı en fazla ${MAX_NAME} karakter olabilir` };
  return { name };
}

/** Distinct positive ints, the caller removed; null when the input is not a list of ids. */
function cleanMemberIds(value, selfId) {
  if (!Array.isArray(value)) return null;
  const ids = [];
  for (const v of value) {
    const id = parseId(v);
    if (!id) return null;
    if (id !== selfId && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function createGroup(req, res, next) {
  const userId = req.user.userId;
  const { name, error } = cleanName(req.body.name);
  if (error) return res.status(400).json({ error });
  const memberIds = cleanMemberIds(req.body.memberIds, userId);
  if (!memberIds) return res.status(400).json({ error: 'Geçersiz üye listesi' });
  if (memberIds.length === 0) return res.status(400).json({ error: 'En az bir arkadaşını ekle' });
  if (memberIds.length >= MAX_GROUP_MEMBERS) {
    return res.status(400).json({ error: `Bir grupta en fazla ${MAX_GROUP_MEMBERS} üye olabilir` });
  }

  const client = await pool.connect();
  try {
    const friends = await friendIdsAmong(client, userId, memberIds);
    if (memberIds.some((id) => !friends.has(id))) {
      return res.status(403).json({ error: 'Gruba yalnızca arkadaşlarını ekleyebilirsin' });
    }
    await client.query('BEGIN');
    const conv = (
      await client.query(
        `INSERT INTO conversations (kind, name, created_by) VALUES ('group', $1, $2) RETURNING id`,
        [name, userId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [conv.id, userId]
    );
    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id)
       SELECT $1, unnest($2::int[])`,
      [conv.id, memberIds]
    );
    await client.query('COMMIT');
    res.status(201).json({ id: conv.id, kind: 'group', name, created: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function getConversation(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const conv = id && (await loadMembership(pool, id, req.user.userId));
    if (!conv) return res.status(404).json({ error: 'Sohbet bulunamadı' });
    const members = await listMembers(pool, id);
    const other =
      conv.kind === 'direct' ? members.find((m) => m.id !== req.user.userId) || null : null;
    res.json({
      id: conv.id,
      kind: conv.kind,
      name: conv.kind === 'group' ? conv.name : other ? other.name : 'Silinmiş kullanıcı',
      role: conv.role,
      createdBy: conv.created_by,
      createdAt: conv.created_at,
      otherUser: other ? { id: other.id, name: other.name, avatar_url: other.avatar_url } : null,
      // In a DM the friendship gates sending; the client greys the composer.
      canSend:
        conv.kind === 'group' || (!!other && (await areFriends(pool, req.user.userId, other.id))),
      members,
    });
  } catch (err) {
    next(err);
  }
}

/** Shared gate for the admin-only group actions; answers on failure, returns the row otherwise. */
async function requireGroupAdmin(req, res) {
  const id = parseId(req.params.id);
  const conv = id && (await loadMembership(pool, id, req.user.userId));
  if (!conv) {
    res.status(404).json({ error: 'Sohbet bulunamadı' });
    return null;
  }
  if (conv.kind !== 'group') {
    res.status(400).json({ error: 'Bu işlem yalnızca gruplar için' });
    return null;
  }
  if (conv.role !== 'admin') {
    res.status(403).json({ error: 'Bu işlem için grup yöneticisi olmalısın' });
    return null;
  }
  return conv;
}

async function renameGroup(req, res, next) {
  try {
    const conv = await requireGroupAdmin(req, res);
    if (!conv) return;
    const { name, error } = cleanName(req.body.name);
    if (error) return res.status(400).json({ error });
    await pool.query('UPDATE conversations SET name = $1 WHERE id = $2', [name, conv.id]);
    res.json({ id: conv.id, name });
  } catch (err) {
    next(err);
  }
}

async function addMember(req, res, next) {
  try {
    const conv = await requireGroupAdmin(req, res);
    if (!conv) return;
    const targetId = parseId(req.body.userId);
    if (!targetId || targetId === req.user.userId) {
      return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    }
    // Owner rule: a group grows only through someone's own friends — the
    // admin adding, not the creator, is the one whose list counts.
    if (!(await areFriends(pool, req.user.userId, targetId))) {
      return res.status(403).json({ error: 'Gruba yalnızca arkadaşlarını ekleyebilirsin' });
    }
    const count = await pool.query(
      'SELECT count(*)::int AS n FROM conversation_members WHERE conversation_id = $1',
      [conv.id]
    );
    if (count.rows[0].n >= MAX_GROUP_MEMBERS) {
      return res
        .status(400)
        .json({ error: `Bir grupta en fazla ${MAX_GROUP_MEMBERS} üye olabilir` });
    }
    const inserted = await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [conv.id, targetId]
    );
    if (inserted.rows.length === 0) {
      return res.status(409).json({ error: 'Bu kişi zaten grupta' });
    }
    res.status(201).json({ members: await listMembers(pool, conv.id) });
  } catch (err) {
    next(err);
  }
}

async function removeMember(req, res, next) {
  try {
    const conv = await requireGroupAdmin(req, res);
    if (!conv) return;
    const targetId = parseId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    if (targetId === req.user.userId) {
      return res.status(400).json({ error: 'Kendini çıkaramazsın; gruptan ayrılabilirsin' });
    }
    const target = await pool.query(
      'SELECT role FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conv.id, targetId]
    );
    if (target.rows.length === 0) return res.status(404).json({ error: 'Üye bulunamadı' });
    // Admins are peers: one cannot throw another out. An admin who should go
    // leaves on their own; a demotion path is a later decision.
    if (target.rows[0].role === 'admin') {
      return res.status(403).json({ error: 'Bir yönetici başka bir yöneticiyi çıkaramaz' });
    }
    await pool.query(
      'DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conv.id, targetId]
    );
    res.json({ members: await listMembers(pool, conv.id) });
  } catch (err) {
    next(err);
  }
}

async function promoteMember(req, res, next) {
  try {
    const conv = await requireGroupAdmin(req, res);
    if (!conv) return;
    const targetId = parseId(req.params.userId);
    if (!targetId) return res.status(400).json({ error: 'Geçersiz kullanıcı' });
    const updated = await pool.query(
      `UPDATE conversation_members SET role = 'admin'
       WHERE conversation_id = $1 AND user_id = $2 RETURNING user_id`,
      [conv.id, targetId]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Üye bulunamadı' });
    res.json({ members: await listMembers(pool, conv.id) });
  } catch (err) {
    next(err);
  }
}

async function leaveGroup(req, res, next) {
  const id = parseId(req.params.id);
  const client = await pool.connect();
  try {
    const conv = id && (await loadMembership(client, id, req.user.userId));
    if (!conv) return res.status(404).json({ error: 'Sohbet bulunamadı' });
    if (conv.kind !== 'group') {
      return res.status(400).json({ error: 'Birebir sohbetten ayrılınmaz' });
    }
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conv.id, req.user.userId]
    );
    // A group must not be left headless: when the last admin walks out, the
    // longest-standing member takes over. An empty group keeps its row —
    // its messages may be report targets and nobody can reach it anyway.
    if (conv.role === 'admin') {
      await client.query(
        `UPDATE conversation_members SET role = 'admin'
         WHERE conversation_id = $1
           AND NOT EXISTS (SELECT 1 FROM conversation_members a WHERE a.conversation_id = $1 AND a.role = 'admin')
           AND user_id = (SELECT user_id FROM conversation_members b WHERE b.conversation_id = $1
                          ORDER BY b.joined_at, b.user_id LIMIT 1)`,
        [conv.id]
      );
    }
    await client.query('COMMIT');
    res.json({ left: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- messages

async function listMessages(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const conv = id && (await loadMembership(pool, id, req.user.userId));
    if (!conv) return res.status(404).json({ error: 'Sohbet bulunamadı' });

    const limit = Math.min(
      PAGE_MAX,
      Math.max(1, Math.floor(Number(req.query.limit) || PAGE_DEFAULT))
    );
    const after = parseId(req.query.after);
    const before = parseId(req.query.before);
    // `since` is the `now` of the previous answer, echoed back: soft
    // deletes of messages the client already holds are reported by id so
    // a poll with `after` still learns about them. Server clock only —
    // the client never compares it with its own.
    const since = req.query.since ? new Date(String(req.query.since)) : null;
    const sinceValid = since && !Number.isNaN(since.getTime()) ? since : null;

    // Decision (review, 2026-09-08): a member sees the conversation from
    // their own joined_at on — someone added to a group later does not
    // inherit what was said before they were in the room. joined_at is the
    // membership row's, so leaving and being re-added starts over.
    const scope = 'x.conversation_id = $1 AND x.created_at >= $2';
    const joinedAt = conv.joined_at;

    // The clock and the deleted list come from ONE statement, read before
    // the page itself: a deletion landing between two separate queries
    // would fall in the gap and never be reported (review finding). Read
    // first, a deletion during the page fetch is simply reported again on
    // the next poll — the client tolerates a repeat, which is also why the
    // watermark carries two seconds of slack: a delete whose transaction
    // began just before the clock was read commits with an older
    // deleted_at and would otherwise slip past `> since` for good.
    const clock = sinceValid
      ? await pool.query(
          `SELECT now() AS now,
                  COALESCE((SELECT json_agg(json_build_object(
                              'id', d.id,
                              'deletedBySender', d.deleted_by IS NOT NULL AND d.sender_id IS NOT NULL AND d.deleted_by = d.sender_id
                            ) ORDER BY d.id)
                            FROM messages d
                            WHERE d.conversation_id = $1 AND d.created_at >= $2
                              AND d.deleted_at > $3::timestamptz - interval '2 seconds'),
                           '[]'::json) AS deleted`,
          [id, joinedAt, sinceValid]
        )
      : await pool.query(`SELECT now() AS now, '[]'::json AS deleted`);

    let rows;
    if (after) {
      rows = (
        await pool.query(
          `${MESSAGE_SELECT} WHERE ${scope} AND x.id > $3 ORDER BY x.id ASC LIMIT $4`,
          [id, joinedAt, after, limit]
        )
      ).rows;
    } else {
      // The newest page, oldest first for rendering.
      rows = (
        await pool.query(
          `${MESSAGE_SELECT} WHERE ${scope} ${before ? 'AND x.id < $4' : ''}
           ORDER BY x.id DESC LIMIT $3`,
          before ? [id, joinedAt, limit, before] : [id, joinedAt, limit]
        )
      ).rows.reverse();
    }
    res.json({
      messages: rows.map(shapeMessage),
      deleted: clock.rows[0].deleted,
      hasMore: !after && rows.length === limit,
      now: clock.rows[0].now,
    });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  const id = parseId(req.params.id);
  const userId = req.user.userId;
  const client = await pool.connect();
  try {
    const conv = id && (await loadMembership(client, id, userId));
    if (!conv) return res.status(404).json({ error: 'Sohbet bulunamadı' });
    const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ error: 'Mesaj boş olamaz' });
    if (body.length > MAX_BODY) {
      return res.status(400).json({ error: `Mesaj en fazla ${MAX_BODY} karakter olabilir` });
    }
    if (conv.kind === 'direct') {
      // The friendship is the permission, not the conversation: after an
      // unfriend the history stays readable but nothing new goes through.
      const other = await client.query(
        'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2',
        [id, userId]
      );
      const otherId = other.rows[0]?.user_id;
      if (!otherId || !(await areFriends(client, userId, otherId))) {
        return res.status(403).json({ error: 'Artık arkadaş değilsiniz; mesaj gönderilemez' });
      }
    }
    // The row and the inbox ordering land together or not at all.
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id, created_at`,
      [id, userId, body]
    );
    const { id: messageId, created_at: createdAt } = inserted.rows[0];
    await client.query('UPDATE conversations SET last_message_at = $2 WHERE id = $1', [
      id,
      createdAt,
    ]);
    // The echo is read inside the transaction: a failure here rolls the
    // insert back too, so a retried send cannot duplicate the message.
    const row = (await client.query(`${MESSAGE_SELECT} WHERE x.id = $1`, [messageId])).rows[0];
    await client.query('COMMIT');
    // Nothing is marked read here: own messages never count as unread
    // (sender_id IS DISTINCT FROM), and stamping last_read_at with this
    // message's time would hide a reply that landed between the sender's
    // last poll and the send (review finding). The next poll marks it.
    res.status(201).json(shapeMessage(row));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
}

async function markRead(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const updated = await pool.query(
      `UPDATE conversation_members SET last_read_at = now()
       WHERE conversation_id = $1 AND user_id = $2 RETURNING conversation_id`,
      [id, req.user.userId]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Sohbet bulunamadı' });
    res.json({ read: true });
  } catch (err) {
    next(err);
  }
}

/** A message the caller may see, with the caller's role in its conversation; null otherwise. */
async function loadVisibleMessage(messageId, userId) {
  const r = await pool.query(
    `SELECT x.id, x.conversation_id, x.sender_id, x.deleted_at, c.kind, m.role
     FROM messages x
     JOIN conversations c ON c.id = x.conversation_id
     JOIN conversation_members m ON m.conversation_id = x.conversation_id AND m.user_id = $2
     WHERE x.id = $1`,
    [messageId, userId]
  );
  return r.rows[0] || null;
}

async function deleteMessage(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const userId = req.user.userId;
    const msg = id && (await loadVisibleMessage(id, userId));
    if (!msg) return res.status(404).json({ error: 'Mesaj bulunamadı' });
    const isSender = msg.sender_id === userId;
    const isGroupAdmin = msg.kind === 'group' && msg.role === 'admin';
    if (!isSender && !isGroupAdmin) {
      return res
        .status(403)
        .json({ error: 'Bu mesajı yalnızca gönderen ya da grup yöneticisi silebilir' });
    }
    if (msg.deleted_at) return res.json({ deleted: true, already: true });
    await pool.query(
      'UPDATE messages SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL',
      [id, userId]
    );
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// The report itself lives in content_reports like every other target; it is
// filed here rather than through POST /reports because only a member may see
// the message, and this controller is where that check lives.
async function reportMessage(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const userId = req.user.userId;
    const { reason, details } = req.body;
    if (!REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Geçersiz şikayet nedeni' });
    }
    if (details && String(details).length > MAX_REPORT_DETAILS) {
      return res
        .status(400)
        .json({ error: `Açıklama en fazla ${MAX_REPORT_DETAILS} karakter olabilir` });
    }
    const msg = id && (await loadVisibleMessage(id, userId));
    if (!msg) return res.status(404).json({ error: 'Şikayet edilecek içerik bulunamadı' });
    if (msg.sender_id === userId) {
      return res.status(400).json({ error: 'Kendi mesajını şikayet edemezsin' });
    }
    const inserted = await pool.query(
      `INSERT INTO content_reports (reporter_id, target_type, target_id, reason, details)
       VALUES ($1, 'message', $2, $3, $4)
       ON CONFLICT (reporter_id, target_type, target_id) WHERE status = 'open'
       DO NOTHING
       RETURNING id, target_type, target_id, reason, status, created_at`,
      [userId, id, reason, details ? String(details).trim() : null]
    );
    if (inserted.rows.length === 0) {
      return res.status(409).json({ error: 'Bu mesajı zaten şikayet ettin; inceleme bekliyor.' });
    }
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listConversations,
  openDirect,
  createGroup,
  getConversation,
  renameGroup,
  addMember,
  removeMember,
  promoteMember,
  leaveGroup,
  listMessages,
  sendMessage,
  markRead,
  deleteMessage,
  reportMessage,
};
