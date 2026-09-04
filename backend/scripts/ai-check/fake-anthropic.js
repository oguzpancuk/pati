/**
 * A local stand-in for the Anthropic Messages API — DEVELOPMENT ONLY.
 *
 * The photo check and the photo comparison (src/utils/ai.js) can only be
 * exercised end to end against a server whose answers we choose: the real
 * model will not reliably reject a test image, and the paths that matter
 * most here are the refusals and the failures. This server answers
 * `POST /v1/messages` with whatever verdict `POST /control` last selected,
 * and refuses any request whose shape the real API would refuse (no key,
 * no image, no JSON schema), so a wrong request body fails the harness
 * instead of silently passing.
 *
 * The backend only talks to it because ANTHROPIC_BASE_URL points here.
 *
 *   node scripts/ai-check/fake-anthropic.js [port]
 *
 *   POST /control {"mode":"approve"|"reject"|"error"|"refusal"}
 *   POST /control {"mode":"match","verdicts":["same","different",...]}
 *   POST /control {"mode":"match","candidates":[{"index":0,"verdict":"same"}]}  (raw answer)
 *   GET  /last    → what the last /v1/messages request looked like
 */
const http = require('http');

const PORT = Number(process.argv[2] || 4600);

let control = { mode: 'approve' };
let last = null;

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
  send(res, 400, { type: 'error', error: { type: 'invalid_request_error', message } });
}

function answer(res, model, payload) {
  send(res, 200, {
    id: `msg_fake_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    model,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
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
      return send(res, 200, last ?? {});
    }
    if (req.method !== 'POST' || url.pathname !== '/v1/messages') {
      return send(res, 404, { type: 'error', error: { type: 'not_found_error', message: 'no' } });
    }

    if (!req.headers['x-api-key']) {
      return send(res, 401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'no key' },
      });
    }
    const body = await readJson(req);
    const content = body.messages?.[0]?.content;
    const blocks = Array.isArray(content) ? content : [];
    const images = blocks.filter((b) => b.type === 'image');
    const badImage = images.find(
      (b) =>
        b.source?.type !== 'base64' ||
        b.source?.media_type !== 'image/jpeg' ||
        typeof b.source?.data !== 'string' ||
        b.source.data.length < 100
    );
    last = {
      model: body.model,
      images: images.length,
      format: body.output_config?.format?.type ?? null,
      effort: body.output_config?.effort ?? null,
      kind:
        typeof body.system === 'string' && body.system.includes('SAME INDIVIDUAL')
          ? 'match'
          : 'care',
      maxTokens: body.max_tokens,
    };
    if (typeof body.model !== 'string' || !body.model) return invalid(res, 'model missing');
    if (images.length === 0) return invalid(res, 'no image block');
    if (badImage) return invalid(res, 'image block is not base64 jpeg');
    if (last.format !== 'json_schema')
      return invalid(res, 'output_config.format is not json_schema');
    if (!body.output_config?.format?.schema) return invalid(res, 'schema missing');
    if (!Number.isInteger(body.max_tokens)) return invalid(res, 'max_tokens missing');

    const { mode } = control;
    if (mode === 'error') {
      return send(res, 500, { type: 'error', error: { type: 'api_error', message: 'boom' } });
    }
    if (mode === 'refusal') {
      return send(res, 200, {
        id: 'msg_fake_refusal',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: null, explanation: 'test' },
        usage: { input_tokens: 10, output_tokens: 0 },
      });
    }
    if (last.kind === 'match') {
      // `candidates` is the raw answer, for the negative tests of the
      // index guard (0-based, duplicated, short answers).
      if (Array.isArray(control.candidates)) {
        return answer(res, body.model, { candidates: control.candidates });
      }
      const verdicts = Array.isArray(control.verdicts) ? control.verdicts : [];
      return answer(res, body.model, {
        candidates: verdicts
          .slice(0, images.length - 1)
          .map((verdict, i) => ({ index: i + 1, verdict })),
      });
    }
    if (mode === 'reject') {
      return answer(res, body.model, {
        subject: 'unrelated',
        matches: false,
        reason: 'Fotoğrafta mama ya da su görünmüyor gibi.',
      });
    }
    return answer(res, body.model, {
      subject: 'food',
      matches: true,
      reason: 'Kapta mama görünüyor.',
    });
  })
  .listen(PORT, () => console.log(`fake anthropic listening on ${PORT}`));
