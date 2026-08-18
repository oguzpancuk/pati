/**
 * Arama tarafının gerçek ölçekte ne kadar sürdüğünü ölçer.
 *
 * Senaryo: kullanıcı yeni hayvan kaydediyor. Sunucu önce PostGIS ile 1 km
 * içindeki hayvanları daraltıyor, sonra bu adaylar arasında kosinüs benzerliğine
 * göre en benzeyen 5 hayvanı buluyor.
 *
 * Vektörler rastgele — arama SÜRESİ vektörlerin anlamlı olup olmamasına bağlı
 * değil, sayısına ve boyutuna bağlı. İsabet bu ölçümle değerlendirilemez.
 */
const { Client } = require('/workspace/stray/backend/node_modules/pg');

const DIM = 768; // DINOv2 ViT-B
const ANIMALS = Number(process.env.ANIMALS || 25000);
const PHOTOS_PER_ANIMAL = 3;
const RUNS = 20;

// Kadıköy merkezli, gerçekçi bir yayılım (İstanbul ölçeğinde ~15 km).
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

  console.log(`Kurulum: ${ANIMALS} hayvan x ${PHOTOS_PER_ANIMAL} fotograf = ${ANIMALS * PHOTOS_PER_ANIMAL} vektor (${DIM} boyut)\n`);

  await client.query('DROP TABLE IF EXISTS bench_embeddings');
  await client.query(`
    CREATE TABLE bench_embeddings (
      id SERIAL PRIMARY KEY,
      animal_id INTEGER NOT NULL,
      location GEOGRAPHY(POINT, 4326) NOT NULL,
      embedding vector(${DIM}) NOT NULL
    )`);

  process.stdout.write('  veri yaziliyor');
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
  console.log(' tamam');

  await client.query('CREATE INDEX ON bench_embeddings USING GIST (location)');
  await client.query('ANALYZE bench_embeddings');

  const size = await client.query(
    "SELECT pg_size_pretty(pg_total_relation_size('bench_embeddings')) AS s"
  );
  console.log(`  tablo boyutu: ${size.rows[0].s}\n`);

  // --- Sorgu: 1 km icindeki adaylar arasinda en benzer 5 hayvan ---
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
      `  ${String(radius / 1000).padStart(2)} km yaricap  ->  ~${String(candidateCount).padStart(5)} aday vektor   medyan ${median(times).toFixed(1)} ms`
    );
  }

  // Karsilastirma: hic cografi daraltma yapmadan tum veri tabaninda arama
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
    `  cografi daraltma YOK -> ${ANIMALS * PHOTOS_PER_ANIMAL} vektor        medyan ${median(allTimes).toFixed(0)} ms  (indekssiz tam tarama)`
  );

  await client.query('DROP TABLE bench_embeddings');
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
