#!/usr/bin/env node
/**
 * Re-awards the three care badges under the count ladders (owner, 2026-09-11:
 * "sıfırdan hesapla").
 *
 *   node backend/scripts/recompute-badges.js [--dry-run]
 *
 * Points and the leaderboard are DERIVED from the current badge rule, so they
 * followed the moment the rule changed and need nothing here. What does not
 * follow is `user_badge_awards`: it is the permanent record of what was
 * earned, and a row claiming "Altın Mama Gönüllüsü" would outlive a profile
 * that now reads silver. So every `care:` award is dropped and re-written from
 * what the new ladders justify.
 *
 * Two deliberate choices:
 *   - the rewritten rows are marked seen. A rule change is not news to the
 *     reader, and without this every account opens to a stack of celebrations
 *     for badges it already had.
 *   - rank_before/rank_after are left NULL on rewritten rows. They record
 *     where someone stood at a moment that cannot be reconstructed; inventing
 *     today's rank for a badge earned in August would be worse than an
 *     honest blank.
 *
 * Re-runnable: a second run rewrites the same rows to the same values.
 * Run it AFTER 015_badge_counts.sql, which renames the keys.
 */
require('dotenv').config();
const pool = require('../src/config/db');
const {
  getBadgesForUsers,
  levelFor,
  tiersUpTo,
  TIER_ORDER,
  TIER_POINTS,
} = require('../src/utils/badges');

const CARE_KEYS = ['care:feeder', 'care:water', 'care:registrar'];
const BATCH = 200;
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { rows: users } = await pool.query('SELECT id FROM users ORDER BY id');
  const before = await pool.query(
    'SELECT badge_key, tier, count(*)::int AS n FROM user_badge_awards WHERE badge_key = ANY($1) GROUP BY badge_key, tier ORDER BY badge_key, tier',
    [CARE_KEYS]
  );

  console.log(`users: ${users.length}`);
  console.log('care awards before:');
  for (const r of before.rows) console.log(`  ${r.badge_key} ${r.tier}: ${r.n}`);

  const planned = [];
  for (let i = 0; i < users.length; i += BATCH) {
    const ids = users.slice(i, i + BATCH).map((u) => u.id);
    const badges = await getBadgesForUsers(ids);
    for (const id of ids) {
      const data = badges.get(id);
      if (!data) continue;
      for (const badge of data.badges) {
        if (!badge.tier || !CARE_KEYS.includes(badge.key)) continue;
        // Every tier up to the current one, the way animal badges are
        // written. On a count ladder this is not a guess: reaching silver at
        // ten records means the first record happened, so bronze was earned.
        // Writing only the top tier would delete the bronze row of everyone
        // the new rule promotes — history lost to a rule change.
        for (const tier of tiersUpTo(badge.tier)) {
          planned.push({ userId: id, badge, tier, points: data.points.total });
        }
      }
    }
  }

  const byTier = new Map();
  for (const p of planned) {
    const k = `${p.badge.key} ${p.tier}`;
    byTier.set(k, (byTier.get(k) || 0) + 1);
  }
  console.log('care awards after:');
  for (const k of [...byTier.keys()].sort()) console.log(`  ${k}: ${byTier.get(k)}`);

  const beforeTotal = before.rows.reduce((sum, r) => sum + r.n, 0);
  console.log(`total ${beforeTotal} -> ${planned.length}`);

  // The number that actually matters. A streak of N days implies at least N
  // records, so a tier survives whenever the new threshold is no higher than
  // the old streak length. Registrar is safe everywhere (7 days -> 5 animals,
  // 30 -> 20, 365 -> 100) and so is diamond (365 -> 250). Feeder and water are
  // not: old silver wanted 7 consecutive days, which can be as few as 7
  // records, while new silver wants 10 — so 7-9 records drops to bronze, and
  // 30-49 drops from gold to silver. Anyone in those bands loses a tier, so
  // name them rather than letting the totals hide it.
  const oldTop = new Map();
  const { rows: existing } = await pool.query(
    'SELECT user_id, badge_key, tier FROM user_badge_awards WHERE badge_key = ANY($1)',
    [CARE_KEYS]
  );
  for (const row of existing) {
    const k = `${row.user_id}|${row.badge_key}`;
    const rank = TIER_ORDER.indexOf(row.tier);
    if (rank > (oldTop.has(k) ? TIER_ORDER.indexOf(oldTop.get(k)) : -1)) oldTop.set(k, row.tier);
  }
  const newTop = new Map();
  for (const p of planned) {
    const k = `${p.userId}|${p.badge.key}`;
    const rank = TIER_ORDER.indexOf(p.tier);
    if (rank > (newTop.has(k) ? TIER_ORDER.indexOf(newTop.get(k)) : -1)) newTop.set(k, p.tier);
  }
  const demoted = [];
  for (const [k, tier] of oldTop) {
    const now = newTop.get(k) ?? null;
    if (now === null || TIER_ORDER.indexOf(now) < TIER_ORDER.indexOf(tier)) {
      demoted.push({ k, from: tier, to: now ?? 'none' });
    }
  }
  console.log(`demotions: ${demoted.length}`);
  for (const d of demoted.slice(0, 40)) {
    const [userId, badgeKey] = d.k.split('|');
    console.log(`  user ${userId} ${badgeKey}: ${d.from} -> ${d.to}`);
  }
  if (demoted.length > 40) console.log(`  … and ${demoted.length - 40} more`);

  if (dryRun) {
    console.log('--dry-run: nothing written');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_badge_awards WHERE badge_key = ANY($1)', [CARE_KEYS]);
    for (const { userId, badge, tier, points } of planned) {
      await client.query(
        `INSERT INTO user_badge_awards
           (user_id, badge_key, tier, label, points_awarded,
            points_before, points_after, rank_before, rank_after,
            level_before, level_after, seen_at)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, NULL, NULL, NULL, $7, now())
         ON CONFLICT (user_id, badge_key, tier) DO NOTHING`,
        [userId, badge.key, tier, badge.label, TIER_POINTS[tier], points, levelFor(points).level]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`written: ${planned.length} care awards`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    pool.end();
    process.exit(1);
  });
