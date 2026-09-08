const pool = require('../config/db');

/**
 * The in-app inbox (ROADMAP P6, track C). Rows are written by the animal
 * events below and read by the bell on the profile tab of both clients,
 * polled the way the care alert is. No push sender yet: device_tokens
 * collects where a push WOULD go so the APNs/FCM batch can start from
 * real rows.
 */

// Who hears about an animal: its followers and its carers, never the
// person who caused the event. One set-based INSERT — a popular animal
// has hundreds of followers and this runs inside a comment request.
const RECIPIENTS_SQL = `
  SELECT user_id FROM animal_followers WHERE animal_id = $1
  UNION
  SELECT user_id FROM user_animal_care WHERE animal_id = $1
`;

// `care` (P7 item 12): someone became a carer through either door; the
// inbox line is "<name>, <animal> için bakım vermeye başladı".
const KINDS = new Set(['comment', 'sighting', 'health_record', 'vaccination', 'care']);

/**
 * Writes one inbox row per follower/carer of the animal. The payload
 * carries what the row needs to render on its own (the animal's name and
 * species, the actor's name, the event's text), so a later anonymisation
 * or deletion cannot blank the history.
 */
async function notifyAnimalEvent({ animalId, kind, actorId, text }) {
  if (!KINDS.has(kind)) throw new Error(`unknown notification kind ${kind}`);
  const context = await pool.query(
    `SELECT a.name, a.species, u.name AS actor_name
     FROM animals a, users u
     WHERE a.id = $1 AND u.id = $2`,
    [animalId, actorId]
  );
  if (context.rows.length === 0) return 0;
  const { name, species, actor_name: actorName } = context.rows[0];
  const payload = { animalName: name, species, actorName, text: text ?? null };
  const result = await pool.query(
    `INSERT INTO notifications (user_id, kind, animal_id, actor_id, payload)
     SELECT r.user_id, $2, $1, $3, $4::jsonb
     FROM (${RECIPIENTS_SQL}) r
     WHERE r.user_id <> $3`,
    [animalId, kind, actorId, JSON.stringify(payload)]
  );
  return result.rowCount;
}

// A notification must never fail the event it announces: the comment is
// already written; a missed inbox row is the lesser evil.
async function notifyAnimalEventSafe(event) {
  try {
    return await notifyAnimalEvent(event);
  } catch (err) {
    console.warn(
      `[notifications] ${event.kind} on animal ${event.animalId}: ${err?.message ?? err}`
    );
    return 0;
  }
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

async function unreadCountFor(userId) {
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return result.rows[0].count;
}

// Newest first; the actor's avatar joined live (the payload keeps the name
// as it was, the picture may change). `total` lets the page show "load
// earlier", `unreadCount` is the bell's number.
async function listNotifications(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [page, total, unread] = await Promise.all([
      pool.query(
        `SELECT n.id, n.kind, n.animal_id, n.actor_id, n.payload, n.read_at, n.created_at,
                u.avatar_url AS actor_avatar_url
         FROM notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         WHERE n.user_id = $1
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT $2::int OFFSET $3::int`,
        [req.user.userId, limit, offset]
      ),
      pool.query('SELECT count(*)::int AS count FROM notifications WHERE user_id = $1', [
        req.user.userId,
      ]),
      unreadCountFor(req.user.userId),
    ]);
    res.json({ notifications: page.rows, total: total.rows[0].count, unreadCount: unread });
  } catch (err) {
    next(err);
  }
}

// The poll: one integer, cheap enough for a minute's interval.
async function getUnreadCount(req, res, next) {
  try {
    res.json({ unreadCount: await unreadCountFor(req.user.userId) });
  } catch (err) {
    next(err);
  }
}

// Marks the given ids read — or everything, when the body names none
// (opening the inbox reads it all, the way a chat does).
async function markRead(req, res, next) {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null;
    if (ids && ids.length === 0) {
      return res.json({ unreadCount: await unreadCountFor(req.user.userId) });
    }
    await pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE user_id = $1 AND read_at IS NULL ${ids ? 'AND id = ANY($2)' : ''}`,
      ids ? [req.user.userId, ids] : [req.user.userId]
    );
    res.json({ unreadCount: await unreadCountFor(req.user.userId) });
  } catch (err) {
    next(err);
  }
}

const PLATFORMS = new Set(['ios', 'android', 'web']);

// Upsert by token: the same device signing in as someone else moves the
// token to the new user rather than leaving a stale row that would push
// their notifications to the wrong person.
async function registerDeviceToken(req, res, next) {
  try {
    const { platform, token } = req.body ?? {};
    if (!PLATFORMS.has(platform)) {
      return res.status(400).json({ error: 'platform ios, android veya web olmalıdır' });
    }
    if (typeof token !== 'string' || !token.trim() || token.length > 4096) {
      return res.status(400).json({ error: 'token zorunludur' });
    }
    await pool.query(
      `INSERT INTO device_tokens (user_id, platform, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id,
                                        platform = EXCLUDED.platform,
                                        updated_at = now()`,
      [req.user.userId, platform, token.trim()]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Sign-out: only the caller's own row goes, a token someone else now
// holds is theirs.
async function removeDeviceToken(req, res, next) {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) return res.status(400).json({ error: 'token zorunludur' });
    await pool.query('DELETE FROM device_tokens WHERE user_id = $1 AND token = $2', [
      req.user.userId,
      token,
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  notifyAnimalEvent,
  notifyAnimalEventSafe,
  listNotifications,
  getUnreadCount,
  markRead,
  registerDeviceToken,
  removeDeviceToken,
};
