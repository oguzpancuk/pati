/**
 * A fake S3-compatible bucket for scripts/storage-check/run.sh: the same
 * idea as scripts/ai-check/fake-gemini.js. It speaks just enough of the
 * protocol for the AWS SDK's PUT/GET/DELETE against a path-style endpoint,
 * ignores the signature (the point is our wiring, not theirs), and exposes
 * what it holds so the checks can assert on it.
 *
 *   node scripts/storage-check/fake-bucket.js <port> <bucket>
 *
 * Control surface, outside the bucket path:
 *   GET  /__keys      → the keys it holds, one per line
 *   POST /__refuse    → every PUT answers 500 until…
 *   POST /__accept    → …this
 */
const http = require('http');

const port = Number(process.argv[2] || 4610);
const bucket = process.argv[3] || 'pati-test';

const objects = new Map();
let refusing = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/__keys') {
    return res.writeHead(200, { 'Content-Type': 'text/plain' }).end([...objects.keys()].join('\n'));
  }
  if (pathname === '/__refuse') {
    refusing = true;
    return res.writeHead(200).end('refusing');
  }
  if (pathname === '/__accept') {
    refusing = false;
    return res.writeHead(200).end('accepting');
  }

  const prefix = `/${bucket}/`;
  if (!pathname.startsWith(prefix)) return res.writeHead(404).end();
  const key = pathname.slice(prefix.length);

  if (req.method === 'PUT') {
    if (refusing) return res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      objects.set(key, Buffer.concat(chunks));
      res.writeHead(200, { ETag: '"fake"' }).end();
    });
    return;
  }
  if (req.method === 'GET') {
    const body = objects.get(key);
    if (!body) {
      return res
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code></Error>');
    }
    return res.writeHead(200, { 'Content-Length': body.length }).end(body);
  }
  if (req.method === 'DELETE') {
    objects.delete(key);
    return res.writeHead(204).end();
  }
  res.writeHead(405).end();
});

server.listen(port, () => console.log(`fake bucket "${bucket}" on ${port}`));
