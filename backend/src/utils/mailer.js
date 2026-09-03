const fs = require('fs');

/**
 * Outbound e-mail. One function, three transports, chosen from the
 * environment at call time:
 *
 *   RESEND_API_KEY set   → Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email),
 *                          called with Node's own fetch — no SDK, nothing to
 *                          install. Needs the sending domain verified in the
 *                          Resend dashboard (docs/DEPLOYMENT.md).
 *   otherwise, not prod  → "dev": the message is printed to stdout and, when
 *                          MAIL_OUTBOX_FILE is set, appended there as one JSON
 *                          line — that is how the local check harness reads
 *                          the code back out.
 *   otherwise            → not configured. isConfigured() is false and the
 *                          features that need mail switch themselves off
 *                          (registration falls back to the old, unverified
 *                          behaviour) rather than creating accounts nobody can
 *                          ever reach.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

function transport() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.NODE_ENV !== 'production') return 'dev';
  return null;
}

function isConfigured() {
  return transport() !== null;
}

/** For the boot log: what a deploy actually ended up with. */
function describeTransport() {
  const mode = transport();
  if (mode === 'resend') return `Resend (from: ${fromAddress()})`;
  if (mode === 'dev')
    return 'dev (stdout' + (process.env.MAIL_OUTBOX_FILE ? ' + outbox file)' : ')');
  return 'NOT CONFIGURED — e-mail verification is off';
}

function fromAddress() {
  return process.env.MAIL_FROM || 'Pati <noreply@pati-app.com>';
}

async function sendMail({ to, subject, text, html }) {
  const mode = transport();

  if (mode === 'resend') {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: fromAddress(), to: [to], subject, text, html }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // The body names the reason (unverified domain, bad key); the first
      // line is enough for the log and never reaches a client.
      const detail = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`Resend answered ${res.status}: ${detail}`);
    }
    return;
  }

  if (mode === 'dev') {
    console.log(`[mail:dev] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    if (process.env.MAIL_OUTBOX_FILE) {
      fs.appendFileSync(
        process.env.MAIL_OUTBOX_FILE,
        `${JSON.stringify({ to, subject, text, sentAt: new Date().toISOString() })}\n`
      );
    }
    return;
  }

  throw new Error('mail transport is not configured');
}

module.exports = { sendMail, isConfigured, describeTransport };
