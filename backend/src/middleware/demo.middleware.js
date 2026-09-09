const pool = require('../config/db');
const { hidesDemo } = require('../utils/settings');

/**
 * Someone who switched the showcase world off must not reach it by id
 * either. The list endpoints filter; these guards make the single-row and
 * sub-resource routes agree with them, so a reader never sees half a demo
 * world — a bot profile they cannot open holding animals they can, or an
 * animal they can follow but not read (review findings).
 *
 * Both cost nothing for the default reader: the preference is cached, and
 * the lookup only happens once someone has actually switched the showcase
 * off. They answer the route's own not-found message, so nothing about the
 * row's existence leaks.
 *
 * MUST be mounted after `requireAuth` — they read `req.user`.
 */
function guard(table, message) {
  return async function guardDemo(req, res, next) {
    try {
      if (!(await hidesDemo(req))) return next();
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return next();
      const result = await pool.query(`SELECT is_demo FROM ${table} WHERE id = $1`, [id]);
      if (result.rows[0]?.is_demo) return res.status(404).json({ error: message });
      next();
    } catch (err) {
      next(err);
    }
  };
}

const guardDemoUser = guard('users', 'Kullanıcı bulunamadı');
const guardDemoAnimal = guard('animals', 'Hayvan bulunamadı');

module.exports = { guardDemoUser, guardDemoAnimal };
