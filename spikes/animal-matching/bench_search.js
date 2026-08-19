/**
 * Measures how long the search side takes at realistic scale.
 *
 * Scenario: a user registers a new animal. The server first narrows to the
 * animals within 1 km via PostGIS, then finds the 5 most similar among
 * those candidates by cosine similarity.
 *
 * The vectors are random — search TIME depends on their count and
 * dimension, not on whether they are meaningful. Accuracy cannot be
 * evaluated with this measurement.
 */
const { Client } = require('/workspace/stray/backend/node_modules/pg');

const DIM = 768; // DINOv2 ViT-B
const ANIMALS = Number(process.env.ANIMALS || 25000);
const PHOTOS_PER_ANIMAL = 3;
const RUNS = 20;

// A realistic spread centered on Kadıköy (~15 km, Istanbul scale).
const CENTER = { lat: 40.9905, lng: 29.0277 };
const SPREAD = 0.14;

function randomVector() {
  const v = new Array(DIM);
  let norm = 0;
  for (let i = 0; i < DIM; i += 1) {
    v[i] = Math.random() * 2 - 1;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < DIM; i += 1) v[i] /= norm;
  return v;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function main() {
  const client = new Client({ connectionString: 'postgresql://stray:stray@localhost:5432/stray' });
  await client.connect();

  console.log(`Setup: ${ANIMALS} animals x ${PHOTOS_PER_ANIMAL} photos = ${ANIMALS * PHOTOS_PER_ANIMAL} vectors (${DIM} dims)\n`);

  await client.query('DROP TABLE IF EXISTS bench_embeddings');
  await client.query(`
    CREATE TABLE bench_embeddings (
      id SERIAL PRIMARY KEY,
      animal_id INTEGER NOT NULL,
      location GEOGRAPHY(POINT, 4326) NOT NULL,
      embedding vector(${DIM}) NOT NULL
    )`);

  process.stdout.write('  writing data');
  const BATCH = 500;
  for (let a = 0; a < ANIMALS; a += BATCH) {
    const values = [];
    const params = [];
    let p = 0;
    for (let i = a; i < Math.min(a + BATCH, ANIMALS); i += 1) {
      const lat = CENTER.lat + (Math.random() * 2 - 1) * SPREAD;
      const lng = CENTER.lng + (Math.random() * 2 - 1) * SPREAD;
      for (let ph = 0; ph < PHOTOS_PER_ANIMAL; ph += 1) {
        values.push(
          `($${p + 1}, ST_SetSRID(ST_MakePoint($${p + 2}, $${p + 3}), 4326)::geography, $${p + 4}::vector)`
        );
        params.push(i, lng, lat, JSON.stringify(randomVector()));
        p += 4;
      }
    }
    await client.query(
      `INSERT INTO bench_embeddings (animal_id, location, embedding) VALUES ${values.join(',')}`,
      params
    );
    if ((a / BATCH) % 10 === 0) process.stdout.write('.');
  }
  console.log(' done');

  await client.query('CREATE INDEX ON bench_embeddings USING GIST (location)');
  await client.query('ANALYZE bench_embeddings');

  const size = await client.query(
    "SELECT pg_size_pretty(pg_total_relation_size('bench_embeddings')) AS s"
  );
  console.log(`  table size: ${size.rows[0].s}\n`);

  // --- Query: the 5 most similar animals among the candidates within 1 km ---
  const SQL = `
    WITH candidates AS (
      SELECT animal_id, embedding
      FROM bench_embeddings
      WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
    )
    SELECT animal_id, MIN(embedding <=> $1::vector) AS distance
    FROM candidates
    GROUP BY animal_id
    ORDER BY distance
    LIMIT 5`;

  for (const radius of [1000, 3000, 10000]) {
    const times = [];
    let candidateCount = 0;
    for (let r = 0; r < RUNS; r += 1) {
      const lat = CENTER.lat + (Math.random() * 2 - 1) * SPREAD * 0.5;
      const lng = CENTER.lng + (Math.random() * 2 - 1) * SPREAD * 0.5;
      const q = JSON.stringify(randomVector());

      const t0 = process.hrtime.bigint();
      await client.query(SQL, [q, lng, lat, radius]);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);

      if (r === 0) {
        const c = await client.query(
          `SELECT count(*)::int AS n FROM bench_embeddings
           WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
          [lng, lat, radius]
        );
        candidateCount = c.rows[0].n;
      }
    }
    console.log(
      `  ${String(radius / 1000).padStart(2)} km radius  ->  ~${String(candidateCount).padStart(5)} candidate vectors   median ${median(times).toFixed(1)} ms`
    );
  }

  // Comparison: searching the whole database with no geographic narrowing
  const allTimes = [];
  for (let r = 0; r < 5; r += 1) {
    const q = JSON.stringify(randomVector());
    const t0 = process.hrtime.bigint();
    await client.query(
      `SELECT animal_id, MIN(embedding <=> $1::vector) AS d FROM bench_embeddings
       GROUP BY animal_id ORDER BY d LIMIT 5`,
      [q]
    );
    allTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  console.log(
    `  NO geographic narrowing -> ${ANIMALS * PHOTOS_PER_ANIMAL} vectors        median ${median(allTimes).toFixed(0)} ms  (unindexed full scan)`
  );

  await client.query('DROP TABLE bench_embeddings');
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
