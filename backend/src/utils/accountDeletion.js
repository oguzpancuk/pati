/**
 * Turning an account into a tombstone.
 *
 * Deleting a user outright is not an option: their care records, comments
 * and animals are the community's history, and a foreign key would either
 * refuse the delete or take the history with it. So the row stays and
 * everything personal leaves it — the App Store's 5.1.1(v) requirement and
 * the KVKK promise on /gizlilik are both about the personal data, not the
 * row id.
 *
 * Two callers share this: the user's own "hesabı sil" (which re-authenticates
 * first) and the admin panel's deletion, which exists so support can free an
 * address somebody registered and abandoned. They differ in who is allowed
 * to ask and in what the audit log says — not in what happens to the data,
 * which is why it lives here rather than being written twice.
 */
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * Anonymizes `userId` inside a transaction the caller owns, and returns the
 * name of the uploaded avatar file to delete afterwards (or null). The file
 * is NOT removed here: it must go after the COMMIT, since a rolled-back
 * transaction leaving a photo deleted would be worse than a stranded file.
 */
async function anonymizeAccount(client, userId, { reason }) {
  const before = await client.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
  const avatarUrl = before.rows[0]?.avatar_url || '';
  const uploadsMatch = avatarUrl.match(/\/uploads\/([\w.-]+)$/);

  const anonymizedHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

  await client.query(
    `UPDATE users SET
       name = 'Silinmiş Üye',
       email = 'silinmis-' || id || '@deleted.pati-app.com',
       password_hash = $2,
       avatar_url = NULL,
       -- The anonymized address is a placeholder nobody proved; leaving
       -- this true would let a tombstone look like a linkable account.
       email_verified = false,
       -- A tombstone is not waiting for a code either; the code row itself
       -- is dropped below.
       email_verification_pending = false,
       featured_badges = '[]'::jsonb,
       last_rank = NULL,
       last_points = 0,
       suspended_at = now(),
       suspended_reason = $3
     WHERE id = $1`,
    [userId, anonymizedHash, reason]
  );
  await client.query('DELETE FROM friendships WHERE requester_id = $1 OR addressee_id = $1', [
    userId,
  ]);
  await client.query('DELETE FROM user_animal_care WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM user_badge_awards WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);
  await client.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
  // A push token is a device identifier. Nothing sends push yet, so these
  // rows do nothing today — but a deletion that leaves them behind would
  // start meaning something the day APNs/FCM ships, and by then nobody
  // would think to look here (third review round).
  await client.query('DELETE FROM device_tokens WHERE user_id = $1', [userId]);
  // Without this the deleted account keeps its Apple/Google links, and the
  // next "Apple ile giriş" would walk straight back into the anonymized,
  // suspended row instead of creating a fresh account.
  await client.query('DELETE FROM user_identities WHERE user_id = $1', [userId]);

  return uploadsMatch ? uploadsMatch[1] : null;
}

module.exports = { anonymizeAccount };
