// Generates demo/test data: 100 users with 2 animals each, streaks of users
// leaving food/water for 7 or 30 consecutive days, and comments on the animals
// they care for. Also one "showcase" animal per pattern in the taxonomy
// (src/utils/taxonomy.js), complete with a health record, a vaccination and
// record-bound comments — so newly added screens are never tested against
// empty data.
//
// Usage:  npm run seed
// Every account's password: password123
//
// Photo URLs are built from PUBLIC_BASE_URL (default http://localhost:3000).
// When testing on the Android emulator:
//   PUBLIC_BASE_URL=http://10.0.2.2:3000 npm run seed
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const bcrypt = require('bcrypt');
const pool = require('../src/config/db');
const { UPLOADS_DIR } = require('../src/config/upload');
const { getBadgesForUsers } = require('../src/utils/badges');
const { AVATAR_KEYS, AVATAR_PREFIX } = require('../src/utils/avatars');
const {
  CAT_PATTERNS,
  DOG_PATTERNS,
  PATTERN_COLOR_CHOICES,
  PATTERN_FIXED_COLOR,
  ILLNESSES,
  INJURIES,
  VACCINE_TYPES,
} = require('../src/utils/taxonomy');

const USER_COUNT = 100;
const ANIMALS_PER_USER = 2;
const PASSWORD = 'password123';
const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Distribution centered on Kadıköy: same area as the test accounts with the
// location override, so seeded data shows up in the app immediately.
const CENTER = { lat: 40.9905, lng: 29.0277 };
const SPREAD_DEG = 0.012; // ~1.3 km

const FIRST_NAMES = [
  'Ayşe',
  'Mehmet',
  'Fatma',
  'Ahmet',
  'Emine',
  'Mustafa',
  'Hatice',
  'Ali',
  'Zeynep',
  'Hüseyin',
  'Elif',
  'Hasan',
  'Meryem',
  'İbrahim',
  'Şerife',
  'Murat',
  'Zehra',
  'Osman',
  'Sultan',
  'Yusuf',
  'Merve',
  'Kemal',
  'Esra',
  'Burak',
  'Selin',
  'Cem',
  'Deniz',
  'Ece',
  'Kaan',
  'Nur',
];
const LAST_NAMES = [
  'Yılmaz',
  'Kaya',
  'Demir',
  'Şahin',
  'Çelik',
  'Yıldız',
  'Yıldırım',
  'Öztürk',
  'Aydın',
  'Özdemir',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Aslan',
  'Çetin',
  'Kara',
  'Koç',
  'Kurt',
  'Özkan',
  'Şimşek',
];

const CAT_NAMES = [
  'Pamuk',
  'Duman',
  'Tekir',
  'Boncuk',
  'Zeytin',
  'Mırnav',
  'Karamel',
  'Şeker',
  'Minnoş',
  'Pofuduk',
];
const DOG_NAMES = [
  'Karabaş',
  'Çomar',
  'Paşa',
  'Bobi',
  'Kont',
  'Fındık',
  'Zorro',
  'Leo',
  'Rex',
  'Maya',
];
const MARKINGS = [
  'Sol kulakta çentik',
  'Kuyruğu kısa',
  'Gözlerinin etrafı koyu',
  'Boynunda beyaz leke',
  'Sağ ön ayağı beyaz',
  'Sırtında çizgiler',
  null,
  null,
];

const COMMENT_TEMPLATES = [
  'Bugün besledim, keyfi yerinde.',
  'Su kabını temizleyip doldurdum.',
  'Biraz ürkek ama yaklaşınca sakinleşiyor.',
  'Kilo almış gibi görünüyor, iyiye gidiyor.',
  'Akşam yine uğrayacağım.',
  'Bugün göremedim, yarın tekrar bakacağım.',
  'Mama bıraktım, hemen yedi.',
  'Sağlıklı görünüyor, tüyleri parlak.',
  'Komşular da düzenli besliyormuş.',
  'Soğuklar için kutudan barınak yaptım.',
  'Aşı için veterinere götürmeyi planlıyorum.',
  'Diğer kedilerle arası iyi.',
];

// One "showcase" animal per pattern in the taxonomy, so the new pattern/color
// lists, health-record and vaccination screens actually appear in demo data.
// The last one in each list shows what picking "Diğer" (other) does: text not
// on the list goes straight into the `breed` column, there is no extra column.
// Colors follow the picker rules: fixed-color patterns use their canonical
// color, the rest pick from the pattern's own choice list — so demo data
// always matches what the form can produce.
const colorFor = (pattern, index = 0) =>
  PATTERN_FIXED_COLOR[pattern] ?? PATTERN_COLOR_CHOICES[pattern]?.[index] ?? null;

const SHOWCASE_CATS = [
  {
    name: 'Boncuk',
    breed: CAT_PATTERNS[0],
    color: colorFor(CAT_PATTERNS[0], 0),
    markings: 'Sol kulakta çentik',
  },
  {
    name: 'Zeytin',
    breed: CAT_PATTERNS[1],
    color: colorFor(CAT_PATTERNS[1]),
    markings: 'Kuyruğu kalın',
  },
  {
    name: 'Duman',
    breed: CAT_PATTERNS[2],
    color: colorFor(CAT_PATTERNS[2]),
    markings: 'Göğsünde küçük beyaz leke',
  },
  {
    name: 'Şeker',
    breed: CAT_PATTERNS[3],
    color: colorFor(CAT_PATTERNS[3]),
    markings: 'Burnunun yarısı siyah',
  },
  {
    name: 'Bıyık',
    breed: CAT_PATTERNS[4],
    color: colorFor(CAT_PATTERNS[4]),
    markings: 'Dört ayağı beyaz',
  },
  {
    name: 'Pamuk',
    breed: 'Ankara kedisi kırması',
    color: 'Beyaz',
    markings: 'Gözleri iki renk',
  },
];
const SHOWCASE_DOGS = [
  {
    name: 'Karabaş',
    breed: DOG_PATTERNS[0],
    color: colorFor(DOG_PATTERNS[0], 0),
    markings: 'Boynu kalın, kulakları düşük',
  },
  {
    name: 'Paşa',
    breed: DOG_PATTERNS[1],
    color: colorFor(DOG_PATTERNS[1]),
    markings: 'Sırtında sarı leke',
  },
  {
    name: 'Çomar',
    breed: DOG_PATTERNS[2],
    color: colorFor(DOG_PATTERNS[2], 0),
    markings: 'Kuyruk ucu beyaz',
  },
  {
    name: 'Leo',
    breed: 'Golden kırması',
    color: 'Sarı',
    markings: 'Tüyleri uzun ve dalgalı',
  },
];

// Health and vaccination records for the showcase animals. Illness/injury
// alternate so both record types exist in demo data.
const SHOWCASE_HEALTH_NOTES = [
  'Bugün fark ettim, veterinere haber verdim.',
  'İlk gün kötüydü, şimdi biraz daha iyi.',
  'Komşularla nöbetleşe takip ediyoruz.',
];
const SHOWCASE_VACCINE_NOTES = [
  'Belediye ekibi mahallede yaparken kaydettim.',
  'Veteriner ücretsiz yaptı, kulak küpesi de takıldı.',
  'Kendi götürdüm, fişi bende duruyor.',
];

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function randomOffset() {
  return (Math.random() - 0.5) * 2 * SPREAD_DEG;
}

// Produces a simple solid-color PNG; seeded data gets real images in the app
// without depending on an external file or service.
function makeSolidPng(width, height, [r, g, b]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    raw[pos] = 0;
    pos += 1;
    for (let x = 0; x < width; x += 1) {
      raw[pos] = r;
      raw[pos + 1] = g;
      raw[pos + 2] = b;
      pos += 3;
    }
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData) >>> 0);
    return Buffer.concat([len, typeAndData, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

const SEED_PHOTO_COLORS = [
  [200, 160, 120],
  [120, 120, 120],
  [230, 230, 230],
  [90, 80, 70],
  [210, 180, 60],
  [160, 110, 90],
  [80, 100, 120],
  [190, 190, 170],
];

function writeSeedPhotos() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return SEED_PHOTO_COLORS.map((color, index) => {
    const filename = `seed-${index}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), makeSolidPng(240, 240, color));
    return `${BASE_URL}/uploads/${filename}`;
  });
}

// Produces one timestamp per day going back `days` days from today. Badge
// computation looks for consecutive-day runs over DATE(created_at), so one
// record per day is enough.
//
// Today's record lands within the last 5-60 minutes, not at a fixed hour.
// Food fades in 4 h and water in 6 h, so records generated "at 9 am today"
// were born faded on the map when the seed ran in the afternoon; without a
// fresh record the green areas never looked alive.
function streakTimestamps(days) {
  const stamps = [];
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (i === 0) {
      d.setTime(now.getTime() - (5 + Math.floor(Math.random() * 55)) * 60 * 1000);
    } else {
      d.setHours(9 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
    }
    stamps.push(d.toISOString());
  }
  return stamps;
}

async function seed() {
  // Every run regenerates fresh data from scratch. The old flow stopped when
  // it saw existing data, so "seeing the map with live data" meant resetting
  // the database each time. TRUNCATE wipes everything (admin accounts
  // included) — deliberately: this script is for the demo/development
  // database only and must never run in production.
  const existing = await pool.query('SELECT count(*)::int AS c FROM users');
  if (existing.rows[0].c > 0) {
    console.log(`Wiping ${existing.rows[0].c} existing users and all data...`);
    await pool.query(
      `TRUNCATE users, animals, animal_photos, health_records, vaccinations,
               animal_comments, user_animal_care, care_actions, friendships,
               user_badge_awards, audit_log, advertisers, ad_events
       RESTART IDENTITY CASCADE`
    );
    console.log('(The admin account was deleted too; if needed: npm run make-admin)');
  }

  const photoUrls = writeSeedPhotos();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log(`Creating ${USER_COUNT} users...`);
  const userValues = [];
  const userParams = [];
  for (let i = 0; i < USER_COUNT; i += 1) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    const base = userParams.length;
    userValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    // Every 10th user gets an uploaded photo, the rest a built-in avatar:
    // demo data should show how both cases look in the app.
    userParams.push(
      name,
      `test${i + 1}@stray.test`,
      passwordHash,
      i % 10 === 0
        ? photoUrls[i % photoUrls.length]
        : `${AVATAR_PREFIX}${AVATAR_KEYS[i % AVATAR_KEYS.length]}`
    );
  }
  const users = await pool.query(
    `INSERT INTO users (name, email, password_hash, avatar_url) VALUES ${userValues.join(
      ','
    )} RETURNING id`,
    userParams
  );
  const userIds = users.rows.map((r) => r.id);

  console.log(`Creating ${USER_COUNT * ANIMALS_PER_USER} animals...`);
  const animalValues = [];
  const animalParams = [];
  for (const userId of userIds) {
    for (let j = 0; j < ANIMALS_PER_USER; j += 1) {
      const species = Math.random() < 0.6 ? 'cat' : 'dog';
      const base = animalParams.length;
      animalValues.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5},
          ST_SetSRID(ST_MakePoint($${base + 6}, $${base + 7}), 4326)::geography, $${base + 8},
          now() - ($${base + 9} * interval '1 day'))`
      );
      // Pattern first, then a color that pattern can actually have — random
      // (pattern, color) pairs from the legacy palettes produced animals the
      // form could never create.
      const seedBreed = randomItem(species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS);
      const seedColor =
        PATTERN_FIXED_COLOR[seedBreed] ?? randomItem(PATTERN_COLOR_CHOICES[seedBreed] ?? ['Sarı']);
      animalParams.push(
        species,
        randomItem(species === 'cat' ? CAT_NAMES : DOG_NAMES),
        seedColor,
        seedBreed,
        randomItem(MARKINGS),
        CENTER.lng + randomOffset(),
        CENTER.lat + randomOffset(),
        userId,
        // Registration dates are spread over the last 30 days. Piled onto
        // today, the admin panel's daily-activity chart is crushed by one
        // giant column and the "registrar" streak badges never form.
        Math.floor(Math.random() * 30)
      );
    }
  }
  const animals = await pool.query(
    `INSERT INTO animals (species, name, color, breed, markings, location, created_by, created_at)
     VALUES ${animalValues.join(',')} RETURNING id, created_by`,
    animalParams
  );

  // Whoever registers an animal automatically becomes a carer.
  await pool.query(
    `INSERT INTO user_animal_care (user_id, animal_id)
     SELECT created_by, id FROM animals ON CONFLICT DO NOTHING`
  );

  console.log('Adding animal photos...');
  const photoValues = [];
  const photoParams = [];
  animals.rows.forEach((animal, index) => {
    for (let p = 0; p < 2; p += 1) {
      const base = photoParams.length;
      photoValues.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      photoParams.push(animal.id, photoUrls[(index + p) % photoUrls.length], animal.created_by);
    }
  });
  await pool.query(
    `INSERT INTO animal_photos (animal_id, url, uploaded_by) VALUES ${photoValues.join(',')}`,
    photoParams
  );

  // --- Showcase animals -------------------------------------------------
  // The 200 random animals pick random patterns from the list; there is no
  // guarantee every pattern appears. These 12 records guarantee each pattern
  // once, complete with a health record and a vaccination.
  console.log('Creating one showcase animal per pattern...');
  const showcaseSpecs = [
    ...SHOWCASE_CATS.map((s) => ({ ...s, species: 'cat' })),
    ...SHOWCASE_DOGS.map((s) => ({ ...s, species: 'dog' })),
  ];

  const showcaseValues = [];
  const showcaseParams = [];
  showcaseSpecs.forEach((spec, i) => {
    const b = showcaseParams.length;
    showcaseValues.push(
      `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5},
        ST_SetSRID(ST_MakePoint($${b + 6}, $${b + 7}), 4326)::geography, $${b + 8},
        now() - ($${b + 9} * interval '1 day'))`
    );
    showcaseParams.push(
      spec.species,
      spec.name,
      spec.color,
      spec.breed,
      spec.markings,
      CENTER.lng + randomOffset(),
      CENTER.lat + randomOffset(),
      userIds[i % userIds.length],
      3 + i
    );
  });
  const showcase = await pool.query(
    `INSERT INTO animals (species, name, color, breed, markings, location, created_by, created_at)
     VALUES ${showcaseValues.join(',')} RETURNING id, created_by`,
    showcaseParams
  );
  const showcaseRows = showcase.rows;

  await pool.query(
    `INSERT INTO animal_photos (animal_id, url, uploaded_by)
     SELECT a.id, $1, a.created_by FROM animals a WHERE a.id = ANY($2)`,
    [photoUrls[0], showcaseRows.map((r) => r.id)]
  );
  await pool.query(
    `INSERT INTO user_animal_care (user_id, animal_id)
     SELECT created_by, id FROM animals WHERE id = ANY($1) ON CONFLICT DO NOTHING`,
    [showcaseRows.map((r) => r.id)]
  );

  console.log('Adding health and vaccination records to showcase animals...');
  const healthIds = [];
  // Some vaccinations pile onto a single user so the silver tier of the
  // vaccination badge (5 records) shows up in demo data too.
  const vaccineChampion = userIds[0];

  for (let i = 0; i < showcaseRows.length; i += 1) {
    const animal = showcaseRows[i];
    const isIllness = i % 2 === 0;
    const health = await pool.query(
      `INSERT INTO health_records (animal_id, record_type, description, recorded_by, recorded_at,
                                   recovered_at, recovered_by)
       VALUES ($1, $2, $3, $4::int, now() - ($5::int * interval '1 day'),
               CASE WHEN $6::boolean THEN now() - interval '1 day' END,
               CASE WHEN $6::boolean THEN $4::int END)
       RETURNING id`,
      [
        animal.id,
        isIllness ? 'illness' : 'injury',
        isIllness ? ILLNESSES[i % ILLNESSES.length] : INJURIES[i % INJURIES.length],
        animal.created_by,
        2 + (i % 5),
        // Every third record is recovered; "active" vs "past" renders two
        // different views in the UI, and both must be testable.
        i % 3 === 0,
      ]
    );
    healthIds.push(health.rows[0].id);

    await pool.query(
      `INSERT INTO vaccinations (animal_id, vaccine_type, note, vet_verified,
                                 administered_at, next_due_at, recorded_by)
       VALUES ($1, $2, $3, $4, now() - ($5 * interval '1 day'),
               now() + interval '1 year', $6)`,
      [
        animal.id,
        VACCINE_TYPES[i % VACCINE_TYPES.length],
        randomItem(SHOWCASE_VACCINE_NOTES),
        i % 2 === 0,
        5 + i,
        i < 5 ? vaccineChampion : animal.created_by,
      ]
    );
  }

  // Comments bound to health records. Vaccinations have no chat (see
  // 001_init.sql); the vaccine note lives in the record's own `note` field.
  const recordCommentValues = [];
  const recordCommentParams = [];
  showcaseRows.forEach((animal, i) => {
    const b = recordCommentParams.length;
    recordCommentValues.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
    recordCommentParams.push(
      animal.id,
      animal.created_by,
      healthIds[i],
      SHOWCASE_HEALTH_NOTES[i % SHOWCASE_HEALTH_NOTES.length]
    );
  });
  await pool.query(
    `INSERT INTO animal_comments (animal_id, user_id, health_record_id, body)
     VALUES ${recordCommentValues.join(',')}`,
    recordCommentParams
  );

  console.log('Creating food/water streaks (7- and 30-day)...');
  const careValues = [];
  const careParams = [];
  const streakSummary = { 30: 0, 7: 0, short: 0 };

  userIds.forEach((userId, index) => {
    // The first 20 users get 30 consecutive days, the next 30 users 7; the
    // rest get scattered 1-3 day records to stay below the badge threshold.
    let days;
    if (index < 20) {
      days = 30;
      streakSummary[30] += 1;
    } else if (index < 50) {
      days = 7;
      streakSummary[7] += 1;
    } else {
      days = 1 + Math.floor(Math.random() * 3);
      streakSummary.short += 1;
    }

    for (const actionType of ['food', 'water']) {
      for (const createdAt of streakTimestamps(days)) {
        const base = careParams.length;
        careValues.push(
          `(ST_SetSRID(ST_MakePoint($${base + 1}, $${base + 2}), 4326)::geography,
            $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
        );
        careParams.push(
          CENTER.lng + randomOffset(),
          CENTER.lat + randomOffset(),
          userId,
          actionType,
          randomItem(photoUrls),
          createdAt
        );
      }
    }
  });

  // Inserted in chunks to stay under the parameter limit with thousands of rows.
  const CHUNK = 200;
  for (let i = 0; i < careValues.length; i += CHUNK) {
    const valuesChunk = careValues.slice(i, i + CHUNK);
    const paramsChunk = careParams.slice(i * 6, (i + CHUNK) * 6);
    // Renumber the placeholders per chunk.
    let n = 0;
    const renumbered = valuesChunk.map((v) => v.replace(/\$\d+/g, () => `$${++n}`));
    await pool.query(
      `INSERT INTO care_actions (location, user_id, action_type, photo_url, created_at)
       VALUES ${renumbered.join(',')}`,
      paramsChunk
    );
  }

  console.log('Adding comments...');
  const commentValues = [];
  const commentParams = [];
  // Track who commented on which animal: commenting adds the person to the
  // care list in the app, so the same relationship is built here too.
  const carerPairs = new Set();

  function pushComment(animalId, userId, usedTexts) {
    let text = randomItem(COMMENT_TEMPLATES);
    let attempts = 0;
    while (usedTexts.has(text) && attempts < 5) {
      text = randomItem(COMMENT_TEMPLATES);
      attempts += 1;
    }
    usedTexts.add(text);

    const when = new Date();
    when.setDate(when.getDate() - Math.floor(Math.random() * 10));
    when.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);

    const base = commentParams.length;
    commentValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    commentParams.push(animalId, userId, text, when.toISOString());
    carerPairs.add(`${userId}:${animalId}`);
  }

  for (const animal of animals.rows) {
    const usedTexts = new Set();

    // Comments from the person who registered the animal.
    const ownCount = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < ownCount; c += 1) {
      pushComment(animal.id, animal.created_by, usedTexts);
    }

    // On half of the animals other users join the chat too, so the
    // multi-carer chat screen is visible in demo data.
    if (Math.random() < 0.5) {
      const otherCount = 1 + Math.floor(Math.random() * 2);
      for (let c = 0; c < otherCount; c += 1) {
        const otherId = randomItem(userIds);
        if (otherId === animal.created_by) continue;
        pushComment(animal.id, otherId, usedTexts);
      }
    }
  }
  for (let i = 0; i < commentValues.length; i += CHUNK) {
    const valuesChunk = commentValues.slice(i, i + CHUNK);
    const paramsChunk = commentParams.slice(i * 4, (i + CHUNK) * 4);
    let n = 0;
    const renumbered = valuesChunk.map((v) => v.replace(/\$\d+/g, () => `$${++n}`));
    await pool.query(
      `INSERT INTO animal_comments (animal_id, user_id, body, created_at)
       VALUES ${renumbered.join(',')}`,
      paramsChunk
    );
  }

  // In the app, commenting adds you to the care list; seed data builds the
  // same relationship so the "animals I care for" lists stay consistent.
  const carerRows = [...carerPairs].map((pair) => pair.split(':').map(Number));
  for (let i = 0; i < carerRows.length; i += CHUNK) {
    const slice = carerRows.slice(i, i + CHUNK);
    let n = 0;
    const values = slice.map(() => `($${++n}, $${++n})`);
    await pool.query(
      `INSERT INTO user_animal_care (user_id, animal_id) VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      slice.flat()
    );
  }

  // Sample advertisers. Without these the ad banner never renders in the
  // food/water popups or the health-record screen and the feature looks
  // "broken". Two brands per placement so rotation can be tried too.
  console.log('Adding sample advertisers...');
  const DEMO_ADS = [
    [
      'Pati Mama',
      'food_popup',
      'Pati Mama',
      'Sokak dostları için tam tahıllı mama',
      'https://ornek.example.com/pati-mama',
      1,
    ],
    [
      'Minnoş Kuru Mama',
      'food_popup',
      'Minnoş Mama',
      'Kedilerin favorisi, 15 kg avantajlı paket',
      'https://ornek.example.com/minnos',
      2,
    ],
    [
      'Berrak Kaynak Suyu',
      'water_popup',
      'Berrak Kaynak',
      'Temiz su, mutlu pati',
      'https://ornek.example.com/berrak',
      1,
    ],
    [
      'Damla Su',
      'water_popup',
      'Damla Su',
      'Sokak kapları için 5 litrelik bidon',
      'https://ornek.example.com/damla',
      2,
    ],
    [
      'Kadıköy Veteriner Kliniği',
      'vet_health_record',
      'Kadıköy Veteriner',
      '7/24 acil hizmet, sokak hayvanlarına indirim',
      'https://ornek.example.com/vet-kadikoy',
      1,
    ],
    [
      'Pati Dostu Veteriner',
      'vet_health_record',
      'Pati Dostu Veteriner',
      'Ücretsiz ilk muayene',
      'https://ornek.example.com/pati-dostu',
      2,
    ],
  ];
  const adValues = DEMO_ADS.map((_, i) => {
    const b = i * 7;
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
  });
  await pool.query(
    `INSERT INTO advertisers (name, slot, headline, body, target_url, sort_order, image_url)
     VALUES ${adValues.join(',')}`,
    DEMO_ADS.flatMap((ad, i) => [...ad, photoUrls[i % photoUrls.length]])
  );

  // Demo users' badges are recorded as "earned and seen". Otherwise the first
  // action on a demo account detonates dozens of celebration popups at once —
  // everything a 30-day streak accumulated.
  console.log("Backfilling demo users' badge awards...");
  const badgeMap = await getBadgesForUsers(userIds);
  const awardRows = [];
  for (const [userId, data] of badgeMap.entries()) {
    for (const badge of data.badges.filter((b) => b.tier)) {
      awardRows.push([userId, badge.key, badge.tier, badge.label, badge.points]);
    }
    await pool.query('UPDATE users SET last_points = $1 WHERE id = $2', [
      data.points.total,
      userId,
    ]);
  }
  for (let i = 0; i < awardRows.length; i += 200) {
    const slice = awardRows.slice(i, i + 200);
    const values = slice.map(
      (_, idx) =>
        `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${
          idx * 5 + 5
        }, now())`
    );
    await pool.query(
      `INSERT INTO user_badge_awards (user_id, badge_key, tier, label, points_awarded, seen_at)
       VALUES ${values.join(',')}
       ON CONFLICT DO NOTHING`,
      slice.flat()
    );
  }

  const counts = await pool.query(
    `SELECT
       (SELECT count(*) FROM users WHERE email LIKE 'test%@stray.test')::int AS users,
       (SELECT count(*) FROM animals)::int AS animals,
       (SELECT count(*) FROM care_actions)::int AS care_actions,
       (SELECT count(*) FROM animal_comments)::int AS comments,
       (SELECT count(*) FROM health_records)::int AS health_records,
       (SELECT count(*) FROM vaccinations)::int AS vaccinations,
       (SELECT count(*) FROM user_animal_care)::int AS carers,
       (SELECT count(*) FROM user_badge_awards)::int AS badge_awards,
       (SELECT count(*) FROM advertisers)::int AS advertisers`
  );

  console.log('\nDone:');
  console.log(`  Users            : ${counts.rows[0].users}`);
  console.log(`  Animals          : ${counts.rows[0].animals}`);
  console.log(`  Care actions     : ${counts.rows[0].care_actions}`);
  console.log(`  Comments         : ${counts.rows[0].comments}`);
  console.log(`  Health records   : ${counts.rows[0].health_records}`);
  console.log(`  Vaccinations     : ${counts.rows[0].vaccinations}`);
  console.log(`  Care links       : ${counts.rows[0].carers}`);
  console.log(`  Badge awards     : ${counts.rows[0].badge_awards}`);
  console.log(`  Advertisers      : ${counts.rows[0].advertisers}`);
  console.log(`\n  30-day streak    : ${streakSummary[30]} users (gold badge)`);
  console.log(`  7-day streak     : ${streakSummary[7]} users (silver badge)`);
  console.log(`  1-3 days         : ${streakSummary.short} users (bronze badge)`);
  console.log(`\n  Login: test1@stray.test ... test${USER_COUNT}@stray.test / ${PASSWORD}`);

  await pool.end();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
