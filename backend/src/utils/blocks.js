/**
 * User blocks (ROADMAP "App Store readiness", R3). The table is one row per
 * (blocker, blocked); these helpers are the two questions the readers ask.
 *
 * The rule, in one sentence: blocking removes the friendship and closes every
 * door that friendship opens, refuses new requests in both directions, hides
 * the two people from each other's search, and hides the blocked person's
 * comments from the blocker — while their profile still opens so the block
 * can be undone. Anything not on that list (group messages through a mutual
 * friend, notifications) is deliberately untouched.
 */

/** A block in EITHER direction between the two — what requests and search consult. */
async function blockExists(db, a, b) {
  const r = await db.query(
    `SELECT 1 FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [a, b]
  );
  return r.rows.length > 0;
}

/**
 * SQL fragment: no block in either direction between the viewer (a
 * placeholder such as `$1`) and the row's user column. Starts with AND so it
 * drops straight into an existing WHERE.
 */
function noBlockEitherWaySql(viewerParam, userColumn) {
  return `AND NOT EXISTS (
    SELECT 1 FROM user_blocks b
    WHERE (b.blocker_id = ${viewerParam} AND b.blocked_id = ${userColumn})
       OR (b.blocker_id = ${userColumn} AND b.blocked_id = ${viewerParam}))`;
}

/**
 * SQL fragment: the viewer has not blocked the row's user. One direction on
 * purpose — a comment list hides the people I blocked, not the people who
 * blocked me (they chose not to see me; I never asked to stop seeing them).
 */
function notBlockedByViewerSql(viewerParam, userColumn) {
  return `AND NOT EXISTS (
    SELECT 1 FROM user_blocks b
    WHERE b.blocker_id = ${viewerParam} AND b.blocked_id = ${userColumn})`;
}

module.exports = { blockExists, noBlockEitherWaySql, notBlockedByViewerSql };
