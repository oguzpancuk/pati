/**
 * A local stand-in for the Gemini `generateContent` endpoint — DEVELOPMENT
 * ONLY.
 *
 * The photo check and the photo comparison (src/utils/ai.js) can only be
 * exercised end to end against a server whose answers we choose: the real
 * model will not reliably reject a test image, and the paths that matter
 * most here are the refusals and the failures. This server answers
 * `POST /v1beta/models/<model>:generateContent` with whatever verdict
 * `POST /control` last selected, and refuses any request whose shape the
 * real API would refuse (no key, no image, no JSON schema), so a wrong
 * request body fails the harness instead of silently passing.
 *
 * The backend only talks to it because AI_BASE_URL points here, and that
 * override is ignored when NODE_ENV=production.
 *
 *   node scripts/ai-check/fake-gemini.js [port]
 *
 *   POST /control {"mode":"approve"|"reject"|"error"|"blocked"}
 *   POST /control {"mode":"busy","times":1}   (503 that many times, then approve)
 *   POST /control {"mode":"match","verdicts":["same","different",...]}
 *   POST /control {"mode":"match","candidates":[{"index":0,"verdict":"same"}]}  (raw answer)
 *   GET  /last    → what the last generateContent request looked like
 */
const http = require('http');

const PORT = Number(process.argv[2] || 4600);

let control = { mode: 'approve' };
let last = null;
let requests = 0;

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function invalid(res, message) {
  send(res, 400, { error: { code: 400, message, status: 'INVALID_ARGUMENT' } });
}

// The keywords Gemini's OpenAPI-style responseSchema documents, kept
// deliberately narrow: a keyword missing here fails the harness loudly,
// one wrongly present would pass it and 400 live. Anything else (say
// `additionalProperties`, which the first version carried over from the
// Claude schema) is a 400 on the real API and, through fail-open, a
// silently disabled feature — so the fake refuses it too.
const SCHEMA_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'enum',
  'description',
  'title',
  'items',
  'format',
  'nullable',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'propertyOrdering',
  'anyOf',
]);
function unsupportedKeyword(schema) {
  if (Array.isArray(schema)) {
    for (const s of schema) {
      const bad = unsupportedKeyword(s);
      if (bad) return bad;
    }
    return null;
  }
  if (!schema || typeof schema !== 'object') return null;
  for (const [key, value] of Object.entries(schema)) {
    if (!SCHEMA_KEYWORDS.has(key)) return key;
    if (key === 'properties') {
      for (const sub of Object.values(value)) {
        const bad = unsupportedKeyword(sub);
        if (bad) return bad;
      }
    } else if (key === 'items' || key === 'anyOf') {
      const bad = unsupportedKeyword(value);
      if (bad) return bad;
    }
  }
  return null;
}

function answer(res, payload) {
  send(res, 200, {
    candidates: [
      {
        content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/control') {
      control = await readJson(req);
      return send(res, 200, { ok: true, control });
    }
    if (req.method === 'GET' && url.pathname === '/last') {
      return send(res, 200, { ...(last ?? {}), requests });
    }
    const match = /^\/v1beta\/models\/([^/:]+):generateContent$/.exec(url.pathname);
    if (req.method !== 'POST' || !match) {
      return send(res, 404, { error: { code: 404, message: 'no', status: 'NOT_FOUND' } });
    }

    if (!req.headers['x-goog-api-key']) {
      return send(res, 403, {
        error: { code: 403, message: 'API key missing', status: 'PERMISSION_DENIED' },
      });
    }
    requests += 1;
    const body = await readJson(req);
    const parts = body.contents?.[0]?.parts;
    const blocks = Array.isArray(parts) ? parts : [];
    const images = blocks.filter((p) => p.inline_data);
    const badImage = images.find(
      (p) =>
        p.inline_data?.mime_type !== 'image/jpeg' ||
        typeof p.inline_data?.data !== 'string' ||
        p.inline_data.data.length < 100
    );
    const system = body.systemInstruction?.parts?.[0]?.text;
    last = {
      model: decodeURIComponent(match[1]),
      images: images.length,
      format: body.generationConfig?.responseMimeType ?? null,
      schema: Boolean(body.generationConfig?.responseSchema),
      kind: typeof system === 'string' && system.includes('SAME INDIVIDUAL') ? 'match' : 'care',
      maxTokens: body.generationConfig?.maxOutputTokens,
    };
    if (images.length === 0) return invalid(res, 'no image part');
    if (badImage) return invalid(res, 'image part is not base64 jpeg');
    if (last.format !== 'application/json') return invalid(res, 'responseMimeType is not JSON');
    if (!last.schema) return invalid(res, 'responseSchema missing');
    const badKeyword = unsupportedKeyword(body.generationConfig.responseSchema);
    if (badKeyword) return invalid(res, `unsupported schema keyword: ${badKeyword}`);
    if (typeof system !== 'string') return invalid(res, 'systemInstruction missing');

    const { mode } = control;
    if (mode === 'busy' && control.times > 0) {
      // The free tier's "high demand" answer, for the retry path.
      control.times -= 1;
      return send(res, 503, {
        error: {
          code: 503,
          message: 'This model is currently experiencing high demand.',
          status: 'UNAVAILABLE',
        },
      });
    }
    if (mode === 'error') {
      return send(res, 500, { error: { code: 500, message: 'boom', status: 'INTERNAL' } });
    }
    if (mode === 'blocked') {
      return send(res, 200, {
        promptFeedback: { blockReason: 'SAFETY' },
        usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
      });
    }
    if (last.kind === 'match') {
      // `candidates` is the raw answer, for the negative tests of the
      // index guard (0-based, duplicated, short answers).
      if (Array.isArray(control.candidates)) {
        return answer(res, { candidates: control.candidates });
      }
      const verdicts = Array.isArray(control.verdicts) ? control.verdicts : [];
      return answer(res, {
        candidates: verdicts
          .slice(0, images.length - 1)
          .map((verdict, i) => ({ index: i + 1, verdict })),
      });
    }
    if (mode === 'reject') {
      return answer(res, {
        subject: 'unrelated',
        matches: false,
        reason: 'Fotoğrafta mama ya da su görünmüyor gibi.',
      });
    }
    return answer(res, { subject: 'food', matches: true, reason: 'Kapta mama görünüyor.' });
  })
  .listen(PORT, () => console.log(`fake gemini listening on ${PORT}`));
