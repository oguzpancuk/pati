// Demo/test verisi üretir: 100 kullanıcı, her birinin 2 hayvanı, bir kısmı 7 bir
// kısmı 30 gündür üst üste mama/su bırakan seriler ve bakım verdikleri hayvanlara
// yapılmış yorumlar. Ayrıca sözlükteki (src/utils/taxonomy.js) her desen için
// birer "vitrin" hayvanı: sağlık kaydı, aşı kaydı ve kayda bağlı yorumlarıyla
// birlikte — böylece yeni eklenen ekranlar boş veriyle test edilmiyor.
//
// Kullanım:  npm run seed
// Tüm hesapların şifresi: password123
//
// Fotoğraf URL'leri PUBLIC_BASE_URL üzerinden kurulur (varsayılan
// http://localhost:3000). Android emülatöründe test edecekseniz:
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
  CAT_COLORS,
  DOG_COLORS,
  ILLNESSES,
  INJURIES,
  VACCINE_TYPES,
} = require('../src/utils/taxonomy');

const USER_COUNT = 100;
const ANIMALS_PER_USER = 2;
const PASSWORD = 'password123';
const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

// Kadıköy merkezli dağılım: konum override'ı olan test hesaplarıyla aynı bölgede
// olsun ki seed edilen veri uygulamada hemen görünsün.
const CENTER = { lat: 40.9905, lng: 29.0277 };
const SPREAD_DEG = 0.012; // ~1.3 km

const FIRST_NAMES = [
  'Ayşe', 'Mehmet', 'Fatma', 'Ahmet', 'Emine', 'Mustafa', 'Hatice', 'Ali', 'Zeynep', 'Hüseyin',
  'Elif', 'Hasan', 'Meryem', 'İbrahim', 'Şerife', 'Murat', 'Zehra', 'Osman', 'Sultan', 'Yusuf',
  'Merve', 'Kemal', 'Esra', 'Burak', 'Selin', 'Cem', 'Deniz', 'Ece', 'Kaan', 'Nur',
];
const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir',
  'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek',
];

const CAT_NAMES = ['Pamuk', 'Duman', 'Tekir', 'Boncuk', 'Zeytin', 'Mırnav', 'Karamel', 'Şeker', 'Minnoş', 'Pofuduk'];
const DOG_NAMES = ['Karabaş', 'Çomar', 'Paşa', 'Bobi', 'Kont', 'Fındık', 'Zorro', 'Leo', 'Rex', 'Maya'];
const MARKINGS = [
  'Sol kulakta çentik', 'Kuyruğu kısa', 'Gözlerinin etrafı koyu', 'Boynunda beyaz leke',
  'Sağ ön ayağı beyaz', 'Sırtında çizgiler', null, null,
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

// Sözlükteki her desenden birer "vitrin" hayvanı. Amaç: yeni desen/renk
// listeleri, sağlık kaydı ve aşı ekranları demo veride gerçekten görünsün.
// Son sıradaki ikisi "Diğer" seçilince ne olduğunu gösteriyor: listede olmayan
// bir metin doğrudan `breed` kolonuna yazılıyor, ayrı bir kolon yok.
const SHOWCASE_CATS = [
  { name: 'Boncuk', breed: CAT_PATTERNS[0], color: CAT_COLORS[0], markings: 'Sol kulakta çentik' },
  { name: 'Zeytin', breed: CAT_PATTERNS[1], color: CAT_COLORS[1], markings: 'Kuyruğu kalın' },
  { name: 'Duman', breed: CAT_PATTERNS[2], color: CAT_COLORS[2], markings: 'Göğsünde küçük beyaz leke' },
  { name: 'Şeker', breed: CAT_PATTERNS[3], color: CAT_COLORS[4], markings: 'Burnunun yarısı siyah' },
  { name: 'Bıyık', breed: CAT_PATTERNS[4], color: CAT_COLORS[4], markings: 'Dört ayağı beyaz' },
  { name: 'Pamuk', breed: 'Ankara kedisi kırması', color: CAT_COLORS[3], markings: 'Gözleri iki renk' },
];
const SHOWCASE_DOGS = [
  { name: 'Karabaş', breed: DOG_PATTERNS[0], color: DOG_COLORS[0], markings: 'Boynu kalın, kulakları düşük' },
  { name: 'Paşa', breed: DOG_PATTERNS[1], color: DOG_COLORS[2], markings: 'Sırtında sarı leke' },
  { name: 'Çomar', breed: DOG_PATTERNS[2], color: DOG_COLORS[4], markings: 'Kuyruk ucu beyaz' },
  { name: 'Fındık', breed: DOG_PATTERNS[3], color: DOG_COLORS[1], markings: 'Bacakları kısa, gövdesi uzun' },
  { name: 'Zorro', breed: DOG_PATTERNS[4], color: DOG_COLORS[3], markings: 'Yüzünde koyu maske' },
  { name: 'Leo', breed: 'Golden kırması', color: DOG_COLORS[0], markings: 'Tüyleri uzun ve dalgalı' },
];

// Vitrin hayvanlarının sağlık ve aşı kayıtları. Hastalık/yaralanma sırayla
// dönüyor ki her iki kayıt tipi de demo veride bulunsun.
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

// Basit tek renkli PNG üretir; seed verisinin uygulamada gerçek görsellerle
// görünmesi için harici bir dosyaya/servise bağımlı kalmıyoruz.
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
  [200, 160, 120], [120, 120, 120], [230, 230, 230], [90, 80, 70],
  [210, 180, 60], [160, 110, 90], [80, 100, 120], [190, 190, 170],
];

function writeSeedPhotos() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return SEED_PHOTO_COLORS.map((color, index) => {
    const filename = `seed-${index}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), makeSolidPng(240, 240, color));
    return `${BASE_URL}/uploads/${filename}`;
  });
}

// Bugünden geriye doğru `days` gün, her gün için bir zaman damgası üretir.
// Rozet hesabı DATE(created_at) üzerinden ardışık gün serisi aradığı için
// gün başına en az bir kayıt yeterli.
function streakTimestamps(days) {
  const stamps = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(9 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
    stamps.push(d.toISOString());
  }
  return stamps;
}

async function seed() {
  const existing = await pool.query("SELECT count(*)::int AS c FROM users WHERE email LIKE 'test%@stray.test'");
  if (existing.rows[0].c > 0) {
    console.log(`Zaten ${existing.rows[0].c} demo kullanıcı var. Önce temizlemek için:`);
    console.log("  DELETE FROM users WHERE email LIKE 'test%@stray.test';");
    console.log('(İlişkili hayvan/yorum/aksiyonlar ON DELETE CASCADE ile silinmez —');
    console.log(' temiz bir başlangıç için veritabanını sıfırlayıp migrate etmek daha kolay.)');
    await pool.end();
    return;
  }

  const photoUrls = writeSeedPhotos();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  console.log(`${USER_COUNT} kullanıcı oluşturuluyor...`);
  const userValues = [];
  const userParams = [];
  for (let i = 0; i < USER_COUNT; i += 1) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    const base = userParams.length;
    userValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    // Her 10. kullanıcıya yüklenmiş fotoğraf, kalanlara hazır avatar: iki
    // durumun da uygulamada nasıl göründüğü demo veride görülebilsin.
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
    `INSERT INTO users (name, email, password_hash, avatar_url) VALUES ${userValues.join(',')} RETURNING id`,
    userParams
  );
  const userIds = users.rows.map((r) => r.id);

  console.log(`${USER_COUNT * ANIMALS_PER_USER} hayvan oluşturuluyor...`);
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
      animalParams.push(
        species,
        randomItem(species === 'cat' ? CAT_NAMES : DOG_NAMES),
        randomItem(species === 'cat' ? CAT_COLORS : DOG_COLORS),
        randomItem(species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS),
        randomItem(MARKINGS),
        CENTER.lng + randomOffset(),
        CENTER.lat + randomOffset(),
        userId,
        // Kayıt tarihlerini son 30 güne yayıyoruz. Hepsi bugüne yığılırsa admin
        // panelindeki günlük aktivite grafiği tek bir devasa sütunla eziliyor ve
        // "kaydedici" seri rozetleri de hiç oluşmuyor.
        Math.floor(Math.random() * 30)
      );
    }
  }
  const animals = await pool.query(
    `INSERT INTO animals (species, name, color, breed, markings, location, created_by, created_at)
     VALUES ${animalValues.join(',')} RETURNING id, created_by`,
    animalParams
  );

  // Kaydeden kişi otomatik olarak bakım verendir.
  await pool.query(
    `INSERT INTO user_animal_care (user_id, animal_id)
     SELECT created_by, id FROM animals ON CONFLICT DO NOTHING`
  );

  console.log('Hayvan fotoğrafları ekleniyor...');
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

  // --- Vitrin hayvanları -----------------------------------------------
  // Rastgele üretilen 200 hayvan listeden rastgele desen seçiyor; hangi
  // desenin hiç düşmediği garanti edilemiyor. Buradaki 12 kayıt her deseni
  // birer kez, sağlık ve aşı kaydıyla birlikte garanti ediyor.
  console.log('Her desenden birer vitrin hayvanı oluşturuluyor...');
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

  console.log('Vitrin hayvanlarına sağlık ve aşı kaydı ekleniyor...');
  const healthIds = [];
  const vaccinationIds = [];
  // Aşıların bir kısmını tek bir kullanıcıya yığıyoruz: "Aşı Gönüllüsü"
  // rozetinin gümüş kademesi (5 kayıt) demo veride de görünsün.
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
        // Her üçüncü kayıt iyileşmiş olsun; "aktif" ve "geçmiş" ayrımı
        // arayüzde iki farklı görünüm üretiyor, ikisi de test edilebilmeli.
        i % 3 === 0,
      ]
    );
    healthIds.push(health.rows[0].id);

    const vaccine = await pool.query(
      `INSERT INTO vaccinations (animal_id, vaccine_type, note, vet_verified,
                                 administered_at, next_due_at, recorded_by)
       VALUES ($1, $2, $3, $4, now() - ($5 * interval '1 day'),
               now() + interval '1 year', $6)
       RETURNING id`,
      [
        animal.id,
        VACCINE_TYPES[i % VACCINE_TYPES.length],
        randomItem(SHOWCASE_VACCINE_NOTES),
        i % 2 === 0,
        5 + i,
        i < 5 ? vaccineChampion : animal.created_by,
      ]
    );
    vaccinationIds.push(vaccine.rows[0].id);
  }

  // Kayda bağlı yorumlar: sağlık kaydının ve aşının kendi sohbeti var.
  const recordCommentValues = [];
  const recordCommentParams = [];
  showcaseRows.forEach((animal, i) => {
    for (const [healthRecordId, vaccinationId, body] of [
      [healthIds[i], null, SHOWCASE_HEALTH_NOTES[i % SHOWCASE_HEALTH_NOTES.length]],
      [null, vaccinationIds[i], SHOWCASE_VACCINE_NOTES[i % SHOWCASE_VACCINE_NOTES.length]],
    ]) {
      const b = recordCommentParams.length;
      recordCommentValues.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`);
      recordCommentParams.push(animal.id, animal.created_by, healthRecordId, vaccinationId, body);
    }
  });
  await pool.query(
    `INSERT INTO animal_comments (animal_id, user_id, health_record_id, vaccination_id, body)
     VALUES ${recordCommentValues.join(',')}`,
    recordCommentParams
  );

  console.log('Mama/su serileri oluşturuluyor (7 ve 30 günlük)...');
  const careValues = [];
  const careParams = [];
  const streakSummary = { 30: 0, 7: 0, short: 0 };

  userIds.forEach((userId, index) => {
    // İlk 20 kullanıcı 30 gün, sonraki 30 kullanıcı 7 gün üst üste; kalanlar
    // rozet eşiğinin altında kalsın diye 1-3 günlük dağınık kayıtlar.
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

  // Tek seferde 1000'lerce satır için parametre limitine takılmamak adına parçalı ekliyoruz.
  const CHUNK = 200;
  for (let i = 0; i < careValues.length; i += CHUNK) {
    const valuesChunk = careValues.slice(i, i + CHUNK);
    const paramsChunk = careParams.slice(i * 6, (i + CHUNK) * 6);
    // Parametre numaralarını parça başına yeniden numaralandır.
    let n = 0;
    const renumbered = valuesChunk.map((v) => v.replace(/\$\d+/g, () => `$${++n}`));
    await pool.query(
      `INSERT INTO care_actions (location, user_id, action_type, photo_url, created_at)
       VALUES ${renumbered.join(',')}`,
      paramsChunk
    );
  }

  console.log('Yorumlar ekleniyor...');
  const commentValues = [];
  const commentParams = [];
  // Hangi kullanıcının hangi hayvana yorum yaptığını takip ediyoruz: yorum yapmak
  // uygulamada kişiyi bakım listesine eklediği için aynı ilişkiyi burada da kuruyoruz.
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

    // Hayvanı kaydeden kişinin yorumları.
    const ownCount = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < ownCount; c += 1) {
      pushComment(animal.id, animal.created_by, usedTexts);
    }

    // Hayvanların yarısında başka kullanıcılar da sohbete katılsın; böylece
    // çok bakım verenli sohbet ekranı demo veride görülebiliyor.
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

  // Uygulamada yorum yapmak kişiyi bakım listesine ekliyor; seed verisinde de
  // aynı ilişkiyi kuruyoruz ki "bakım verdiğim hayvanlar" listeleri tutarlı olsun.
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

  // Örnek reklamverenler. Bunlar olmadan mama/su pop-up'ında ve sağlık kaydı
  // ekranında reklam bandı hiç çizilmiyor ve özellik "çalışmıyor" gibi görünüyor.
  // Her yerleşimde iki marka var ki rotasyon da denenebilsin.
  console.log('Örnek reklamverenler ekleniyor...');
  const DEMO_ADS = [
    ['Pati Mama', 'food_popup', 'Pati Mama', 'Sokak dostları için tam tahıllı mama', 'https://ornek.example.com/pati-mama', 1],
    ['Minnoş Kuru Mama', 'food_popup', 'Minnoş Mama', 'Kedilerin favorisi, 15 kg avantajlı paket', 'https://ornek.example.com/minnos', 2],
    ['Berrak Kaynak Suyu', 'water_popup', 'Berrak Kaynak', 'Temiz su, mutlu pati', 'https://ornek.example.com/berrak', 1],
    ['Damla Su', 'water_popup', 'Damla Su', 'Sokak kapları için 5 litrelik bidon', 'https://ornek.example.com/damla', 2],
    ['Kadıköy Veteriner Kliniği', 'vet_health_record', 'Kadıköy Veteriner', '7/24 acil hizmet, sokak hayvanlarına indirim', 'https://ornek.example.com/vet-kadikoy', 1],
    ['Pati Dostu Veteriner', 'vet_health_record', 'Pati Dostu Veteriner', 'Ücretsiz ilk muayene', 'https://ornek.example.com/pati-dostu', 2],
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

  // Demo kullanıcıların rozetlerini "kazanılmış ve görülmüş" olarak işliyoruz.
  // Aksi halde bir demo hesapla ilk aksiyon yapıldığında 30 günlük serinin
  // biriktirdiği onlarca rozet aynı anda kutlama popup'ı olarak patlıyor.
  console.log('Demo kullanıcıların rozetleri geçmişe işleniyor...');
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
        `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5}, now())`
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

  console.log('\nTamamlandı:');
  console.log(`  Kullanıcı      : ${counts.rows[0].users}`);
  console.log(`  Hayvan         : ${counts.rows[0].animals}`);
  console.log(`  Mama/su kaydı  : ${counts.rows[0].care_actions}`);
  console.log(`  Yorum          : ${counts.rows[0].comments}`);
  console.log(`  Sağlık kaydı   : ${counts.rows[0].health_records}`);
  console.log(`  Aşı kaydı      : ${counts.rows[0].vaccinations}`);
  console.log(`  Bakım ilişkisi : ${counts.rows[0].carers}`);
  console.log(`  Kazanılmış rozet: ${counts.rows[0].badge_awards}`);
  console.log(`  Reklamveren     : ${counts.rows[0].advertisers}`);
  console.log(`\n  30 günlük seri : ${streakSummary[30]} kullanıcı (Altın rozet)`);
  console.log(`  7 günlük seri  : ${streakSummary[7]} kullanıcı (Gümüş rozet)`);
  console.log(`  1-3 günlük     : ${streakSummary.short} kullanıcı (Bronz rozet)`);
  console.log(`\n  Giriş: test1@stray.test ... test${USER_COUNT}@stray.test / ${PASSWORD}`);

  await pool.end();
}

seed().catch(async (err) => {
  console.error('Seed başarısız:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
