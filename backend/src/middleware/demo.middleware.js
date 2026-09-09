const pool = require('../config/db');
const { hidesDemo } = require('../utils/settings');

/**
 * Someone who switched the showcase world off must not reach it by id
 * either. The list endpoints filter; these guards make the single-row and
 * sub-resource routes agree with them, so a reader never sees half a demo
 * world — a bot profile they cannot open holding animals they can, or an
 * animal they can follow but not read (review findings).
 *
 * What the switch hides is DISCOVERY: the map, the lists, the board, search,
 * the inbox. It does not take away what the reader themselves did. Their care
 * records and comments feed the badges and points on their own profile, so
 * hiding them there would put "0 yorum" next to a gold comment badge (review
 * finding) — an animal the reader has their own history with therefore stays
 * open to them, showcase or not.
 *
 * Both guards cost nothing for the default reader: the preference is cached,
 * and nothing is queried until someone has actually switched the showcase
 * off. They answer a not-found in the shape the route family uses, so
 * nothing about the row's existence leaks.
 *
 * MUST be mounted after `requireAuth` — they read `req.user`.
 */
function guard(table, message, ownHistorySql) {
  return async function guardDemo(req, res, next) {
    try {
      if (!(await hidesDemo(req))) return next();
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return next();
      const result = await pool.query(`SELECT is_demo FROM ${table} WHERE id = $1`, [id]);
      if (!result.rows[0]?.is_demo) return next();
      if (ownHistorySql) {
        const own = await pool.query(ownHistorySql, [id, req.user.userId]);
        if (own.rows.length > 0) return next();
      }
      res.status(404).json({ error: message });
    } catch (err) {
      next(err);
    }
  };
}

// Care given, a comment written, a follow: any of them makes this animal part
// of the reader's own history rather than part of the showcase they hid.
const OWN_ANIMAL_HISTORY_SQL = `
  SELECT 1 FROM user_animal_care WHERE animal_id = $1 AND user_id = $2
  UNION ALL
  SELECT 1 FROM animal_comments WHERE animal_id = $1 AND user_id = $2
  UNION ALL
  SELECT 1 FROM animal_followers WHERE animal_id = $1 AND user_id = $2
  LIMIT 1`;

const guardDemoUser = guard('users', 'Kullanıcı bulunamadı');
const guardDemoAnimal = guard('animals', 'Hayvan bulunamadı', OWN_ANIMAL_HISTORY_SQL);

/**
 * The write-side counterpart, for a showcase account named in a BODY rather
 * than in the path: a friend request or a group invitation. Without it a
 * reader with the showcase off could send a request that then vanishes from
 * their own list and answers 409 on every retry (review finding).
 */
async function isHiddenDemoUser(req, userId) {
  if (!Number.isInteger(Number(userId))) return false;
  if (!(await hidesDemo(req))) return false;
  const result = await pool.query('SELECT is_demo FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.is_demo === true;
}

module.exports = { guardDemoUser, guardDemoAnimal, isHiddenDemoUser };
