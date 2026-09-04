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
 * Both are one Claude vision request each, through the official SDK, with a
 * JSON schema on the output so the answer is a verdict we can branch on and
 * not prose we have to parse. No model is trained or hosted here — see the
 * ADR for why the embedding-service plan was dropped.
 *
 * Every function here FAILS OPEN: without ANTHROPIC_API_KEY, on a network
 * error, a refusal, a malformed answer or an unreadable photo the caller
 * gets `unavailable` (or an empty map) and the product behaves exactly as
 * it did before this existed. The boot log says whether the checks are on.
 */
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const sharp = require('sharp');

const MODEL = process.env.AI_MODEL || 'claude-opus-5';
// Images sent to the model are downscaled to this box: a phone photo is
// 4000 px wide and 3–8 MB, the model reads nothing extra from it above
// ~1500 px, and the API refuses images over 5 MB. 1024 px keeps a cat's
// markings legible at roughly a thousand tokens per image.
const MAX_IMAGE_EDGE = 1024;
// One request holds the new photo plus this many candidates.
const MAX_MATCH_CANDIDATES = Number(process.env.AI_MATCH_CANDIDATES || 8);
// A photo check has a person waiting behind an interstitial with no cancel;
// a stuck request must give up before the client's own 60 s timeout.
const REQUEST_TIMEOUT_MS = 45_000;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }
  return client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** One line for the boot log, next to the mail transport. */
function describeAi() {
  return isConfigured()
    ? `${MODEL} (photo checks and photo matching on)`
    : 'NOT CONFIGURED — photo checks and photo matching are off';
}

/**
 * Reads an upload from disk and returns a base64 image block the API
 * accepts: EXIF-rotated (phones store portrait shots sideways with a
 * rotation tag), fitted into MAX_IMAGE_EDGE, re-encoded as JPEG. Anything
 * sharp cannot decode (HEIC on the prebuilt binaries, a corrupt file)
 * throws, and the caller treats that as "unavailable".
 */
async function imageBlock(filePath) {
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
  return {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: data.toString('base64') },
  };
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
async function ask({ system, content, schema, effort, tag }) {
  const api = getClient();
  if (!api) return null;
  try {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort, format: { type: 'json_schema', schema } },
    });
    if (response.stop_reason === 'refusal') {
      console.warn(`[ai:${tag}] refused: ${response.stop_details?.category ?? 'unknown'}`);
      return null;
    }
    const text = response.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      console.warn(`[ai:${tag}] no text block (stop_reason ${response.stop_reason})`);
      return null;
    }
    return JSON.parse(text);
  } catch (err) {
    // Most specific first, as the SDK documents; everything ends up as a
    // logged line and a null — the product never blocks on the vendor.
    if (err instanceof Anthropic.AuthenticationError) {
      console.error(`[ai:${tag}] API key rejected — checks are effectively off`);
    } else if (err instanceof Anthropic.RateLimitError) {
      console.warn(`[ai:${tag}] rate limited`);
    } else if (err instanceof Anthropic.APIError) {
      console.warn(`[ai:${tag}] API error ${err.status}: ${err.message}`);
    } else {
      console.warn(`[ai:${tag}] ${err?.message ?? err}`);
    }
    return null;
  }
}

// ------------------------------------------------------------ care photos

const CARE_CHECK_SYSTEM = `You screen photos for a Turkish app where people mark the food or water they just left out for street cats and dogs. The user says what they left; you decide whether the photo plausibly shows it.

Be lenient — these are quick phone snaps on the street. Count as showing FOOD: a bowl or container with kibble, wet food, bread, scraps, or an animal eating; a bag of food being poured. Count as showing WATER: a bowl, tray, bottle, bucket or puddle-like dish with water, or an animal drinking. Blur, darkness, odd angles and partial framing are fine. An animal with the bowl out of frame is fine.

Reject only when the photo clearly shows something else: a person or selfie as the subject, a screen or document, an indoor scene with no food or water, a blank or black frame, an unrelated object, or content unsuitable for a public map. Also reject when the user claims food and the photo shows only water, or the reverse — say which one you see.

Answer with: subject (what the photo actually shows), matches (does it plausibly show what the user claims), reason (one short, friendly Turkish sentence for the user, at most 90 characters, no blame — e.g. "Kapta mama görünüyor." or "Fotoğrafta mama değil su var gibi.").`;

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
  additionalProperties: false,
};

/**
 * @returns {Promise<{verdict: 'approved'|'rejected'|'unavailable', subject?: string, reason?: string, model?: string, ms: number}>}
 */
async function checkCarePhoto(filePath, actionType) {
  const startedAt = Date.now();
  const done = (result) => ({ ...result, ms: Date.now() - startedAt });
  if (!isConfigured()) return done({ verdict: 'unavailable' });

  let image;
  try {
    image = await imageBlock(filePath);
  } catch (err) {
    console.warn(`[ai:care] cannot read photo: ${err?.message ?? err}`);
    return done({ verdict: 'unavailable' });
  }
  const claim = actionType === 'food' ? 'food' : 'water';
  const answer = await ask({
    system: CARE_CHECK_SYSTEM,
    content: [
      image,
      { type: 'text', text: `The user says this photo shows the ${claim} they left out.` },
    ],
    schema: CARE_CHECK_SCHEMA,
    effort: 'low',
    tag: 'care',
  });
  if (!answer || typeof answer.matches !== 'boolean') return done({ verdict: 'unavailable' });
  return done({
    verdict: answer.matches ? 'approved' : 'rejected',
    subject: answer.subject,
    reason: typeof answer.reason === 'string' ? answer.reason.slice(0, 120) : undefined,
    model: MODEL,
  });
}

// ------------------------------------------------------------ animal matching

const MATCH_SYSTEM = `You compare photos of street animals for a Turkish street-animal care app, to stop the same animal being registered twice. The first image is a newly photographed animal. The images after it are animals already registered within a kilometre, numbered in order. For each candidate decide whether it is the SAME INDIVIDUAL as the new animal.

Judge by the individual's own markings — coat pattern and where the patches sit, colour of paws, chest and face, ear notches or tips, tail shape, eye colour, scars, collars — not by breed or general type: two tabby cats or two yellow dogs are different animals unless their marks line up. Photos are taken on the street by different people, so allow for lighting, angle, distance, and the animal having grown or been shaved.

Verdicts: "same" only when the marks match well enough that you would bet on it; "similar" when it could be the same animal but the photos do not show enough to decide; "different" when it is clearly another animal; "unsure" when a photo is too poor to judge at all. Return exactly one entry per candidate, in the order given.`;

const MATCH_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          verdict: { type: 'string', enum: ['same', 'similar', 'different', 'unsure'] },
        },
        required: ['index', 'verdict'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
};

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
    newImage = await imageBlock(newPhotoPath);
  } catch (err) {
    console.warn(`[ai:match] cannot read the new photo: ${err?.message ?? err}`);
    return null;
  }
  // A candidate whose photo cannot be read is left out of the request and
  // simply keeps its field-based score; the others still get compared.
  const content = [{ type: 'text', text: `New ${species} to compare:` }, newImage];
  const sent = [];
  for (const candidate of chosen) {
    try {
      const image = await imageBlock(candidate.filePath);
      sent.push(candidate);
      content.push({ type: 'text', text: `Candidate ${sent.length}:` }, image);
    } catch (err) {
      console.warn(`[ai:match] skipping animal ${candidate.id}: ${err?.message ?? err}`);
    }
  }
  if (sent.length === 0) return null;
  content.push({ type: 'text', text: `Give a verdict for each of the ${sent.length} candidates.` });

  const answer = await ask({
    system: MATCH_SYSTEM,
    content,
    schema: MATCH_SCHEMA,
    effort: 'medium',
    tag: 'match',
  });
  if (!answer || !Array.isArray(answer.candidates)) return null;

  const verdicts = new Map();
  for (const entry of answer.candidates) {
    const candidate = sent[Number(entry?.index) - 1];
    if (candidate && ['same', 'similar', 'different', 'unsure'].includes(entry.verdict)) {
      verdicts.set(candidate.id, entry.verdict);
    }
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
