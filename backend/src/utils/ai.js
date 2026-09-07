/**
 * The photo intelligence behind two product moments (ADR-0005):
 *
 *   - the "AI is checking the photo" step after a food/water photo
 *     (checkCarePhoto): does the picture plausibly show what the user says
 *     they left out?
 *   - the "is this animal already registered?" step of the add-animal flow
 *     (compareAnimalPhotos): which of the nearby same-species records, if
 *     any, is the animal in the new photo?
 *
 * Both are one Gemini `generateContent` request each, over Node's own
 * `fetch` (no SDK — the call is thirty lines, and swapping providers means
 * changing them; the first version ran on Claude, see the ADR), with a JSON
 * schema on the output so the answer is a verdict we can branch on and not
 * prose we have to parse. No model is trained or hosted here.
 *
 * Every function here FAILS OPEN: without GEMINI_API_KEY, on a network
 * error, a safety block, a malformed answer or an unreadable photo the
 * caller gets `unavailable` (or null) and the product behaves exactly as
 * it did before this existed. The boot log says whether the checks are on.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const API_KEY = process.env.GEMINI_API_KEY;
// The free tier serves the flash models; the id is configuration so a
// newer one is a secret change, not a deploy. 3.5 rather than the newest
// 3.8: on the first live day 3.8 answered 503 "high demand" to half the
// calls and timed out on every comparison, 3.5 answered all of them.
const MODEL = process.env.AI_MODEL || 'gemini-3.5-flash';
// Where requests go. Overridable outside production only — that is how
// the check harness points the backend at its fake (scripts/ai-check).
const BASE_URL = (
  process.env.NODE_ENV !== 'production' && process.env.AI_BASE_URL
    ? process.env.AI_BASE_URL
    : 'https://generativelanguage.googleapis.com'
).replace(/\/+$/, '');
// Images sent to the model are downscaled to this box: a phone photo is
// 4000 px wide and 3–8 MB, the model reads nothing extra from it above
// ~1500 px, and inline request bodies are capped at 20 MB. 1024 px keeps a
// cat's markings legible at a few hundred tokens per image.
const MAX_IMAGE_EDGE = 1024;
// One request holds the new photo plus this many candidates. Validated at
// the boundary: a bad value would silently turn matching field-only.
const MAX_MATCH_CANDIDATES = (() => {
  const raw = process.env.AI_MATCH_CANDIDATES;
  if (raw === undefined || raw === '') return 8;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 20) {
    console.warn(`[ai] AI_MATCH_CANDIDATES=${JSON.stringify(raw)} is not 1–20; using 8`);
    return 8;
  }
  return n;
})();
// A photo check has a person waiting behind an interstitial with no cancel;
// a stuck request must give up before the client's own 60 s timeout. One
// deadline per ask() — the retry below runs under the same signal, so the
// pair together never exceeds it.
const REQUEST_TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 1_500;

function isConfigured() {
  return Boolean(API_KEY);
}

/** One line for the boot log, next to the mail transport. */
function describeAi() {
  return isConfigured()
    ? `${MODEL} (photo checks and photo matching on)`
    : 'NOT CONFIGURED — photo checks and photo matching are off';
}

/**
 * Reads an upload from disk and returns an inline image part the API
 * accepts: EXIF-rotated (phones store portrait shots sideways with a
 * rotation tag), fitted into MAX_IMAGE_EDGE, re-encoded as JPEG. Anything
 * sharp cannot decode (HEIC on the prebuilt binaries, a corrupt file)
 * throws, and the caller treats that as "unavailable".
 */
async function imagePart(filePath) {
  const data = await sharp(filePath)
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { inline_data: { mime_type: 'image/jpeg', data: data.toString('base64') } };
}

/**
 * Turns a stored photo URL (`https://host/uploads/<file>`) back into the
 * path under UPLOADS_DIR, or null when it is not one of ours. Only the
 * basename is used, so a URL can never reach outside the uploads folder.
 */
function uploadPathFromUrl(url, uploadsDir) {
  if (typeof url !== 'string') return null;
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith('/uploads/')) return null;
  const file = path.basename(pathname);
  if (!file || file.startsWith('.')) return null;
  const full = path.join(uploadsDir, file);
  return fs.existsSync(full) ? full : null;
}

/**
 * Sends one structured-output request and returns the parsed JSON, or null
 * when anything about the exchange was not a usable answer. Errors are
 * logged with a tag so a dead key or a quota problem shows up in the Fly
 * log without ever reaching a user.
 */
async function ask({ system, parts, schema, tag, thinking = true }) {
  if (!isConfigured()) return null;
  const url = `${BASE_URL}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      // Thinking tokens count against this cap on the flash models; a cap
      // that fits the answer alone can be spent on thought and come back
      // as MAX_TOKENS with no text (review finding). The answers are tiny,
      // so the headroom costs nothing.
      maxOutputTokens: 8192,
      // The care check is a classification: thinking off halves its
      // latency and spends nothing on thought (probed: `thinkingBudget: 0`
      // is the knob these models accept; `thinkingLevel` is not). The
      // comparison keeps the model's default — markings deserve a look.
      ...(thinking ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    },
  };
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const payloadText = JSON.stringify(body);
  const send = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: payloadText,
      signal: deadline,
    });
  let response;
  try {
    response = await send();
    // The free tier answers 503 "high demand" in bursts that last a
    // second or two (seen on the first live run: two of three calls). One
    // retry after a short pause turns most of those into answers, under
    // the same deadline. Not on 429: that is the quota, and a second call
    // a moment later only spends another request against it.
    if (response.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      if (deadline.aborted) throw deadline.reason;
      response = await send();
    }
  } catch (err) {
    console.warn(`[ai:${tag}] ${err?.name === 'TimeoutError' ? 'timed out' : err?.message ?? err}`);
    return null;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    // 400/403 is a dead or wrong key, 429 the free tier's quota; both are
    // a logged line and a null — the product never blocks on the vendor.
    const message = payload?.error?.message ?? response.statusText;
    if (response.status === 429) console.warn(`[ai:${tag}] rate limited: ${message}`);
    else if (response.status === 400 || response.status === 403)
      console.error(`[ai:${tag}] API refused the request (${response.status}): ${message}`);
    else console.warn(`[ai:${tag}] API error ${response.status}: ${message}`);
    return null;
  }
  if (payload?.promptFeedback?.blockReason) {
    console.warn(`[ai:${tag}] blocked: ${payload.promptFeedback.blockReason}`);
    return null;
  }
  const candidate = payload?.candidates?.[0];
  const text = candidate?.content?.parts?.find((p) => typeof p.text === 'string')?.text;
  if (!text) {
    console.warn(`[ai:${tag}] no text in the answer (finishReason ${candidate?.finishReason})`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.warn(`[ai:${tag}] answer is not JSON (finishReason ${candidate?.finishReason})`);
    return null;
  }
}

// ------------------------------------------------------------ care photos

const CARE_CHECK_SYSTEM = `You screen photos for a Turkish app where people mark the food or water they just left out for street cats and dogs. The user says what they left; you decide whether the photo plausibly shows it.

Be lenient — these are quick phone snaps on the street. Count as showing FOOD: a bowl or container with kibble, wet food, bread, scraps, or an animal eating; a bag of food being poured. Count as showing WATER: a bowl, tray, bottle, bucket or puddle-like dish with water, or an animal drinking. Blur, darkness, odd angles and partial framing are fine. An animal with the bowl out of frame is fine.

Reject only when the photo clearly shows something else: a person or selfie as the subject, a screen or document, an indoor scene with no food or water, a blank or black frame, an unrelated object, or content unsuitable for a public map. Also reject when the user claims food and the photo shows only water, or the reverse — say which one you see.

Answer with: subject (what the photo actually shows), matches (does it plausibly show what the user claims), reason (one short, friendly Turkish sentence for the user, at most 90 characters, no blame — e.g. "Kapta mama görünüyor." or "Fotoğrafta mama değil su var gibi.").`;

// Schemas use only the subset Gemini's responseSchema documents (type,
// properties, required, enum, description, items, minimum/maximum …).
// No `additionalProperties`: it is outside the subset and a refused
// schema fails open on EVERY call — the feature would be off with one log
// line to show for it. The harness fake rejects keywords outside the
// allowlist for the same reason.
const CARE_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      enum: ['food', 'water', 'both', 'animal_only', 'unrelated', 'unclear'],
    },
    matches: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['subject', 'matches', 'reason'],
};

/**
 * The one sentence a user sees. A flash model once answered with HTML
 * entities and a run of apostrophes ("… i''''cin g&#246;r&#252;n&#252;yor");
 * a garbled reason is worse than the fixed fallback the controller has.
 * This catches exactly those three shapes — entities, apostrophe runs,
 * control bytes — not mojibake in general ("Fotođrafta" passes); the
 * whole string is tested before it is cut to length, so an entity at the
 * end cannot hide behind the cut.
 */
function cleanReason(reason) {
  if (typeof reason !== 'string') return undefined;
  const text = reason.trim();
  if (!text || /&#\d+;|&[a-z]+;|'{2,}|[\u0000-\u0008\u000b-\u001f]/.test(text)) return undefined;
  return text.slice(0, 120);
}

/**
 * @returns {Promise<{verdict: 'approved'|'rejected'|'unavailable', subject?: string, reason?: string, model?: string, ms: number}>}
 */
async function checkCarePhoto(filePath, actionType) {
  const startedAt = Date.now();
  const done = (result) => ({ ...result, ms: Date.now() - startedAt });
  if (!isConfigured()) return done({ verdict: 'unavailable' });

  let image;
  try {
    image = await imagePart(filePath);
  } catch (err) {
    console.warn(`[ai:care] cannot read photo: ${err?.message ?? err}`);
    return done({ verdict: 'unavailable' });
  }
  const claim = actionType === 'food' ? 'food' : 'water';
  const answer = await ask({
    system: CARE_CHECK_SYSTEM,
    parts: [image, { text: `The user says this photo shows the ${claim} they left out.` }],
    schema: CARE_CHECK_SCHEMA,
    tag: 'care',
    thinking: false,
  });
  if (!answer || typeof answer.matches !== 'boolean') return done({ verdict: 'unavailable' });
  return done({
    verdict: answer.matches ? 'approved' : 'rejected',
    subject: answer.subject,
    reason: cleanReason(answer.reason),
    model: MODEL,
  });
}

// ------------------------------------------------------------ animal matching

const MATCH_SYSTEM = `You compare photos of street animals for a Turkish street-animal care app, to stop the same animal being registered twice. The first image is a newly photographed animal. The images after it are animals already registered within a kilometre, numbered in order. For each candidate decide whether it is the SAME INDIVIDUAL as the new animal.

Judge by the individual's own markings — coat pattern and where the patches sit, colour of paws, chest and face, ear notches or tips, tail shape, eye colour, scars, collars — not by breed or general type: two tabby cats or two yellow dogs are different animals unless their marks line up. Photos are taken on the street by different people, so allow for lighting, angle, distance, and the animal having grown or been shaved.

Verdicts: "same" only when the marks match well enough that you would bet on it; "similar" when it could be the same animal but the photos do not show enough to decide; "different" when it is clearly another animal; "unsure" when a photo is too poor to judge at all. Return exactly one entry per candidate, in the order given.`;

// Built per request so the description names the exact range; the range
// itself is enforced below, at runtime — a misattributed "same" is worse
// than no answer, and we do not rely on the provider's schema support for
// that (the fake API in the check harness does not validate schemas).
function matchSchema(count) {
  return {
    type: 'object',
    properties: {
      candidates: {
        type: 'array',
        description: `Exactly ${count} entries, one per candidate, in the order given`,
        items: {
          type: 'object',
          properties: {
            index: {
              type: 'integer',
              description: `1-based candidate number as labelled ("Candidate 1" … "Candidate ${count}")`,
            },
            verdict: { type: 'string', enum: ['same', 'similar', 'different', 'unsure'] },
          },
          required: ['index', 'verdict'],
        },
      },
    },
    required: ['candidates'],
  };
}

/**
 * @param {string} newPhotoPath  the just-taken photo on disk
 * @param {{id: number, filePath: string}[]} candidates  registered animals with a readable cover photo
 * @param {'cat'|'dog'} species
 * @returns {Promise<Map<number, 'same'|'similar'|'different'|'unsure'>|null>} null when the model did not answer
 */
async function compareAnimalPhotos(newPhotoPath, candidates, species) {
  if (!isConfigured() || candidates.length === 0) return null;
  const chosen = candidates.slice(0, MAX_MATCH_CANDIDATES);

  let newImage;
  try {
    newImage = await imagePart(newPhotoPath);
  } catch (err) {
    console.warn(`[ai:match] cannot read the new photo: ${err?.message ?? err}`);
    return null;
  }
  // A candidate whose photo cannot be read is left out of the request and
  // simply keeps its field-based score; the others still get compared.
  const parts = [{ text: `New ${species} to compare:` }, newImage];
  const sent = [];
  for (const candidate of chosen) {
    try {
      const image = await imagePart(candidate.filePath);
      sent.push(candidate);
      parts.push({ text: `Candidate ${sent.length}:` }, image);
    } catch (err) {
      console.warn(`[ai:match] skipping animal ${candidate.id}: ${err?.message ?? err}`);
    }
  }
  if (sent.length === 0) return null;
  parts.push({ text: `Give a verdict for each of the ${sent.length} candidates.` });

  const answer = await ask({
    system: MATCH_SYSTEM,
    parts,
    schema: matchSchema(sent.length),
    tag: 'match',
  });
  if (!answer || !Array.isArray(answer.candidates)) return null;

  // One verdict per candidate, each index exactly once — anything else is
  // an answer we cannot attribute, and a misattributed "same" is worse
  // than no answer. Fail open.
  const verdicts = new Map();
  for (const entry of answer.candidates) {
    const index = Number(entry?.index);
    const candidate = Number.isInteger(index) ? sent[index - 1] : undefined;
    if (!candidate || verdicts.has(candidate.id)) {
      console.warn(
        `[ai:match] unusable candidate index ${JSON.stringify(entry?.index)}; ignoring the answer`
      );
      return null;
    }
    if (!['same', 'similar', 'different', 'unsure'].includes(entry.verdict)) return null;
    verdicts.set(candidate.id, entry.verdict);
  }
  if (verdicts.size !== sent.length) {
    console.warn(
      `[ai:match] ${verdicts.size} verdicts for ${sent.length} candidates; ignoring the answer`
    );
    return null;
  }
  return verdicts;
}

module.exports = {
  MODEL,
  isConfigured,
  describeAi,
  uploadPathFromUrl,
  checkCarePhoto,
  compareAnimalPhotos,
};
