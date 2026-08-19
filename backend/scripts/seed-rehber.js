// pati REHBER verisi — canlıda (üretimde) çalıştırılmak için tasarlandı.
//
// Ne yapar: İstanbul merkez ilçeleri, İzmir merkez ilçeleri ve Antalya/Kaş'ta
// "rehber" kullanıcılar oluşturur. Her ilçede 10 rehber, uygulamayı ~1 aydır
// organik ritimde kullanıyormuş gibi görünür: haftada ~3 hayvan kaydı, gün
// aşırı mama/su, sohbet yorumları, aşı ve sağlık kayıtları, ilçe içi
// arkadaşlıklar. Amaç çifte: (1) uygulama ilk açılışta boş görünmesin,
// (2) kayıtlar "uygulama böyle kullanılır" diyen bir rehber/tutorial olsun.
//
// Bot olduğu GİZLENMEZ: kullanıcı adları "... · pati rehberi", e-postalar
// @pati.demo, her hayvanın ilk yorumu kaydın bir örnek olduğunu söyler.
//
// seed-demo.js'ten FARKI: burada TRUNCATE YOKTUR. Script yalnızca ekler;
// mevcut kullanıcılara, hayvanlara, admin hesaplarına dokunmaz. Bu yüzden
// üretimde güvenle çalıştırılabilir.
//
// Kullanım:
//   node scripts/seed-rehber.js             # rehber verisini oluştur
//   node scripts/seed-rehber.js --tazele    # yalnızca taze mama/su ekle (harita yeşil kalsın)
//   node scripts/seed-rehber.js --temizle   # tüm rehber verisini geri al
//
// Canlıda (Fly): fly ssh console --app pati-app -C "node scripts/seed-rehber.js"
//
// Rehber hesapların şifresi her çalıştırmada rastgele üretilir ve yalnızca
// bu scriptin çıktısında gösterilir: bilinen ortak bir şifre, herkesin bot
// hesaplarına girebilmesi demek olurdu.
require('dotenv').config();
const crypto = require('crypto');
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

const BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
// Rehber hesapları bu alan adından tanınır; --temizle ve --tazele de buna bakar.
const DEMO_EMAIL_DOMAIN = 'pati.demo';
const USERS_PER_DISTRICT = 10;
const WEEKS = 4;
const ANIMALS_PER_WEEK = 3;
const SPREAD_DEG = 0.008; // ilçe merkezi etrafında ~±900 m

// ---------------------------------------------------------------- ilçeler
// Koordinatlar ilçe merkezlerinin yaklaşık değerleri; listeye ekleme/çıkarma
// serbest — script her şeyi buradan türetiyor.
const DISTRICTS = [
  // İstanbul — merkez (Avrupa)
  { city: 'İstanbul', name: 'Fatih', lat: 41.0186, lng: 28.9497 },
  { city: 'İstanbul', name: 'Beyoğlu', lat: 41.0286, lng: 28.9744 },
  { city: 'İstanbul', name: 'Beşiktaş', lat: 41.043, lng: 29.0061 },
  { city: 'İstanbul', name: 'Şişli', lat: 41.0602, lng: 28.9877 },
  { city: 'İstanbul', name: 'Kağıthane', lat: 41.085, lng: 28.97 },
  { city: 'İstanbul', name: 'Sarıyer', lat: 41.1669, lng: 29.057 },
  { city: 'İstanbul', name: 'Eyüpsultan', lat: 41.048, lng: 28.934 },
  { city: 'İstanbul', name: 'Gaziosmanpaşa', lat: 41.0577, lng: 28.9123 },
  { city: 'İstanbul', name: 'Bayrampaşa', lat: 41.0446, lng: 28.9022 },
  { city: 'İstanbul', name: 'Esenler', lat: 41.0435, lng: 28.876 },
  { city: 'İstanbul', name: 'Güngören', lat: 41.0225, lng: 28.8874 },
  { city: 'İstanbul', name: 'Bağcılar', lat: 41.039, lng: 28.8567 },
  { city: 'İstanbul', name: 'Bahçelievler', lat: 41.0022, lng: 28.8598 },
  { city: 'İstanbul', name: 'Bakırköy', lat: 40.9819, lng: 28.8772 },
  { city: 'İstanbul', name: 'Zeytinburnu', lat: 40.9948, lng: 28.9047 },
  { city: 'İstanbul', name: 'Küçükçekmece', lat: 41.0015, lng: 28.7754 },
  { city: 'İstanbul', name: 'Avcılar', lat: 40.9793, lng: 28.7216 },
  // İstanbul — merkez (Anadolu)
  { city: 'İstanbul', name: 'Kadıköy', lat: 40.9905, lng: 29.0277 },
  { city: 'İstanbul', name: 'Üsküdar', lat: 41.0226, lng: 29.0154 },
  { city: 'İstanbul', name: 'Ümraniye', lat: 41.0165, lng: 29.1248 },
  { city: 'İstanbul', name: 'Ataşehir', lat: 40.9923, lng: 29.1274 },
  { city: 'İstanbul', name: 'Maltepe', lat: 40.9357, lng: 29.131 },
  { city: 'İstanbul', name: 'Kartal', lat: 40.8898, lng: 29.1858 },
  { city: 'İstanbul', name: 'Pendik', lat: 40.8775, lng: 29.2333 },
  // İzmir — merkez
  { city: 'İzmir', name: 'Konak', lat: 38.4189, lng: 27.1287 },
  { city: 'İzmir', name: 'Karşıyaka', lat: 38.4557, lng: 27.1113 },
  { city: 'İzmir', name: 'Bornova', lat: 38.4696, lng: 27.2166 },
  { city: 'İzmir', name: 'Buca', lat: 38.3854, lng: 27.1571 },
  { city: 'İzmir', name: 'Bayraklı', lat: 38.4622, lng: 27.1699 },
  { city: 'İzmir', name: 'Karabağlar', lat: 38.3733, lng: 27.112 },
  { city: 'İzmir', name: 'Gaziemir', lat: 38.3245, lng: 27.1188 },
  { city: 'İzmir', name: 'Balçova', lat: 38.39, lng: 27.0455 },
  { city: 'İzmir', name: 'Narlıdere', lat: 38.3966, lng: 27.0011 },
  { city: 'İzmir', name: 'Çiğli', lat: 38.4951, lng: 27.0785 },
  { city: 'İzmir', name: 'Güzelbahçe', lat: 38.3714, lng: 26.8925 },
  // Antalya — yalnızca Kaş
  { city: 'Antalya', name: 'Kaş', lat: 36.202, lng: 29.6414 },
];

const FIRST_NAMES = [
  'Elif',
  'Mert',
  'Zeynep',
  'Can',
  'Selin',
  'Emre',
  'Defne',
  'Arda',
  'İpek',
  'Kerem',
  'Nazlı',
  'Ozan',
  'Ceren',
  'Barış',
  'Duygu',
  'Tolga',
  'Melis',
  'Onur',
  'Gizem',
  'Serkan',
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
  'Sakız',
  'Limon',
  'Fıstık',
  'Badem',
  'Gofret',
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
  'Cesur',
  'Tarçın',
  'Poyraz',
  'Bulut',
  'Efe',
];
const MARKINGS = [
  'Sol kulakta çentik',
  'Kuyruğu kısa',
  'Gözlerinin etrafı koyu',
  'Boynunda beyaz leke',
  'Sağ ön ayağı beyaz',
  'Sırtında çizgiler',
  'Kulağında küpe (kısırlaştırılmış)',
  null,
  null,
];

// ------------------------------------------------------------ rehber sesi
// Yorumlar hem sohbeti canlı gösterir hem de özellik anlatır: her hayvanın
// ilk yorumu kaydın örnek olduğunu açıkça söyler, sonrakiler uygulamanın
// nasıl kullanıldığını gösterir.
const INTRO_COMMENTS = [
  '🤖 Bu kayıt bir örnek: pati rehber ekibi, uygulamanın nasıl kullanıldığını göstermek için ekledi. Sen de sokağındaki dostları fotoğraflayıp kaydedebilirsin.',
  '🤖 Merhaba! Ben bir rehber hesabıyım. Bu hayvan kaydı gerçek değil; mahallende gördüğün dostları böyle kaydedebileceğini göstermek için burada.',
  '🤖 Örnek kayıt: pati ekibi ekledi. Hayvanı kaydederken 2 fotoğraf ve tür/desen seçmek yeterli — konum otomatik alınıyor.',
];
const FOLLOWUP_COMMENTS = [
  'Bugün mama bıraktım; haritadaki turuncu butonla sen de işaretleyebilirsin, bölge yeşile döner. 🤖',
  'Su kabını doldurdum. Su kayıtları haritada 6 saat taze görünüyor. 🤖',
  'Düzenli yorum yazınca hayvanın bakım listesine giriyorsun; sağlık kaydını ancak bakım verenler açabiliyor. 🤖',
  'Bugün göremedim; "görüldü" bildirimi konumu güncelliyor, aynı hayvanı ikinci kez kaydetmeye gerek yok. 🤖',
  'Kilo almış, iyiye gidiyor. Fotoğraf ekleyerek profili güncel tutabilirsin. 🤖',
  'Komşular da besliyormuş; birlikte bakım verince seri rozetleri kazanılıyor. 🤖',
  'Veteriner kontrolünden geçti; aşı kaydını profilden "+ Aşı ekle" ile girdim. 🤖',
  'Soğuklar için kutudan barınak yaptık; sen de yaptıklarını buraya not düşebilirsin. 🤖',
];
const HEALTH_COMMENTS = [
  'Sağlık kaydını açtım; iyileşince "İyileşti" ile kapatacağım. Kayda bağlı yorumlar burada toplanıyor. 🤖',
  'Tedaviye başlandı; gelişmeleri bu kaydın altına yazıyorum ki takip edenler görsün. 🤖',
];
const VACCINE_NOTES = [
  'Belediye ekibi mahallede yaparken kaydettim. (Örnek kayıt 🤖)',
  'Veteriner ücretsiz yaptı, kulak küpesi takıldı. (Örnek kayıt 🤖)',
  'Kendi götürdüm; sonraki doz tarihini de girdim. (Örnek kayıt 🤖)',
];

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}
function offset() {
  return (Math.random() - 0.5) * 2 * SPREAD_DEG;
}
// Türkçe karakterli ilçe adından e-posta güvenli kısa ad üretir.
function slugify(name) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  return name
    .toLowerCase()
    .replace(/[çğıöşüİ]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]/g, '');
}
// Son `daysAgoMax` gün içinde, gündüz saatlerinde rastgele bir an.
function daytimeStamp(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
  return d;
}

// ---------------------------------------------------------------- görseller
// seed-demo ile aynı yöntem: harici servise bağımlı olmadan tek renkli PNG.
// Dosyalar `rehber-*.png` adıyla yazılır ve BINLERCE kayıt aynı küçük havuzu
// paylaşır — diske hayvan başına fotoğraf yazılmaz.
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
  ihdr[8] = 8;
  ihdr[9] = 2;
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
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}
const PHOTO_COLORS = [
  [201, 168, 130],
  [130, 130, 130],
  [232, 228, 220],
  [95, 84, 72],
  [214, 186, 84],
  [168, 118, 96],
  [96, 112, 130],
  [188, 192, 170],
];
function writePhotos() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return PHOTO_COLORS.map((color, index) => {
    const filename = `rehber-${index}.png`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), makeSolidPng(240, 240, color));
    return `${BASE_URL}/uploads/${filename}`;
  });
}

// Toplu INSERT'leri parametre limitine takılmadan parça parça yürütür.
async function bulkInsert(sql, rows, cols) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    let n = 0;
    const values = slice.map((row) => `(${row.map(() => `$${++n}`).join(',')})`).join(',');
    await pool.query(sql.replace('__VALUES__', values), slice.flat());
  }
  return rows.length;
}
// Konumlu satırlar için: her satırın İLK İKİ elemanı lng,lat kabul edilir ve
// ST_MakePoint'e sarılır; kalanlar düz parametre olur.
async function bulkInsertGeo(sql, rows) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    let n = 0;
    const values = slice
      .map((row) => {
        const geo = `ST_SetSRID(ST_MakePoint($${++n}, $${++n}), 4326)::geography`;
        const rest = row.slice(2).map(() => `$${++n}`);
        return `(${geo},${rest.join(',')})`;
      })
      .join(',');
    await pool.query(sql.replace('__VALUES__', values), slice.flat());
  }
  return rows.length;
}

async function demoUserIds() {
  const res = await pool.query('SELECT id FROM users WHERE email LIKE $1', [
    `%@${DEMO_EMAIL_DOMAIN}`,
  ]);
  return res.rows.map((r) => r.id);
}

// ---------------------------------------------------------------- --tazele
// Haritadaki yeşil, mama 4 / su 6 saat içinde solduğu için bir aylık geçmiş
// haritayı YEŞİL TUTMAZ. Bu mod, her rehberin kendi hayvanlarından birinin
// yakınına son 1 saat içinde tarihlenmiş taze mama/su bırakır. Saatte bir
// çalıştırılırsa (bkz. src/utils/demoTazele.js) demo bölgeleri canlı kalır.
async function tazele({ sessiz = false } = {}) {
  const res = await pool.query(
    `SELECT DISTINCT ON (u.id) u.id AS user_id,
            ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng
     FROM users u
     JOIN animals a ON a.created_by = u.id
     WHERE u.email LIKE $1
     ORDER BY u.id, random()`,
    [`%@${DEMO_EMAIL_DOMAIN}`]
  );
  if (res.rows.length === 0) {
    if (!sessiz) console.log('Rehber kullanıcı yok; önce script parametresiz çalıştırılmalı.');
    return 0;
  }
  const photoUrls = PHOTO_COLORS.map((_, i) => `${BASE_URL}/uploads/rehber-${i}.png`);
  const rows = [];
  for (const r of res.rows) {
    // Her rehber her turda değil, ~yarısı bırakıyor: hepsi aynı anda
    // işaretlerse organik değil senkronize görünür.
    if (Math.random() < 0.5) continue;
    const minutesAgo = 5 + Math.floor(Math.random() * 50);
    const when = new Date(Date.now() - minutesAgo * 60 * 1000);
    rows.push([
      r.lng + offset() / 8, // hayvanın hemen çevresi (~±100 m)
      r.lat + offset() / 8,
      r.user_id,
      Math.random() < 0.6 ? 'food' : 'water',
      randomItem(photoUrls),
      when.toISOString(),
    ]);
  }
  await bulkInsertGeo(
    `INSERT INTO care_actions (location, user_id, action_type, photo_url, created_at)
     VALUES __VALUES__`,
    rows
  );
  if (!sessiz) console.log(`${rows.length} taze mama/su kaydı eklendi.`);
  return rows.length;
}

// ---------------------------------------------------------------- --temizle
// Rehber verisini geri alır. Sıra önemli: önce rehberlerin başka (gerçek)
// hayvanlara bıraktığı izler, sonra rehber hayvanları (CASCADE kendi yorum/
// kayıt/fotoğraflarını götürür), en son kullanıcılar. Gerçek bir kullanıcı
// rehber hayvanına yorum yazdıysa o yorum da hayvanla birlikte silinir —
// örnek kayıt kalkınca altındaki sohbetin de anlamı kalmıyor.
async function temizle() {
  const ids = await demoUserIds();
  if (ids.length === 0) {
    console.log('Silinecek rehber verisi yok.');
    return;
  }
  console.log(`${ids.length} rehber kullanıcı ve tüm izleri siliniyor...`);
  await pool.query('DELETE FROM care_actions WHERE user_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM animal_comments WHERE user_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM vaccinations WHERE recorded_by = ANY($1)', [ids]);
  await pool.query(
    'UPDATE health_records SET recovered_at = NULL, recovered_by = NULL WHERE recovered_by = ANY($1)',
    [ids]
  );
  await pool.query('DELETE FROM health_records WHERE recorded_by = ANY($1)', [ids]);
  await pool.query('DELETE FROM animal_photos WHERE uploaded_by = ANY($1)', [ids]);
  await pool.query('DELETE FROM user_animal_care WHERE user_id = ANY($1)', [ids]);
  await pool.query(
    'DELETE FROM friendships WHERE requester_id = ANY($1) OR addressee_id = ANY($1)',
    [ids]
  );
  await pool.query('DELETE FROM user_badge_awards WHERE user_id = ANY($1)', [ids]);
  const animals = await pool.query('DELETE FROM animals WHERE created_by = ANY($1) RETURNING id', [
    ids,
  ]);
  await pool.query('DELETE FROM audit_log WHERE actor_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM ad_events WHERE user_id = ANY($1)', [ids]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  console.log(
    `Tamam: ${ids.length} kullanıcı, ${animals.rows.length} hayvan ve bağlı kayıtlar silindi.`
  );
}

// ---------------------------------------------------------------- oluştur
async function olustur() {
  const existing = await demoUserIds();
  if (existing.length > 0) {
    console.log(
      `Zaten ${existing.length} rehber kullanıcı var. Yeniden kurmak için önce --temizle,\n` +
        'haritayı tazelemek için --tazele çalıştırın.'
    );
    return;
  }

  const photoUrls = writePhotos();
  const password = crypto.randomBytes(9).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);

  const totals = {
    users: 0,
    animals: 0,
    care: 0,
    comments: 0,
    vaccinations: 0,
    health: 0,
    friendships: 0,
  };
  const allUserIds = [];

  for (const district of DISTRICTS) {
    const slug = slugify(district.name);

    // --- kullanıcılar --------------------------------------------------
    const userRows = [];
    for (let i = 0; i < USERS_PER_DISTRICT; i += 1) {
      // "· pati rehberi" eki her listede görünür; bot olduğu isimden belli.
      const name = `${FIRST_NAMES[(i * 7 + district.name.length) % FIRST_NAMES.length]} · pati rehberi`;
      const joinedDaysAgo = 29 + Math.floor(Math.random() * 6);
      userRows.push([
        name,
        `${slug}.rehber${i + 1}@${DEMO_EMAIL_DOMAIN}`,
        passwordHash,
        `${AVATAR_PREFIX}${AVATAR_KEYS[(i * 3 + district.name.length) % AVATAR_KEYS.length]}`,
        daytimeStamp(joinedDaysAgo).toISOString(),
      ]);
    }
    const inserted = [];
    for (const row of userRows) {
      const res = await pool.query(
        `INSERT INTO users (name, email, password_hash, avatar_url, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        row
      );
      inserted.push(res.rows[0].id);
    }
    allUserIds.push(...inserted);
    totals.users += inserted.length;

    // --- hayvanlar: kullanıcı başına haftada ~3, son 4 hafta ------------
    const animalRows = [];
    const animalMeta = []; // eklenme sırasına göre {userId, createdAt}
    for (const userId of inserted) {
      for (let w = 0; w < WEEKS; w += 1) {
        const count = ANIMALS_PER_WEEK - (Math.random() < 0.3 ? 1 : 0); // 2-3
        for (let k = 0; k < count; k += 1) {
          const daysAgo = w * 7 + Math.floor(Math.random() * 7);
          const createdAt = daytimeStamp(daysAgo);
          const species = Math.random() < 0.6 ? 'cat' : 'dog';
          animalRows.push([
            district.lng + offset(),
            district.lat + offset(),
            species,
            randomItem(species === 'cat' ? CAT_NAMES : DOG_NAMES),
            randomItem(species === 'cat' ? CAT_COLORS : DOG_COLORS),
            randomItem(species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS),
            randomItem(MARKINGS),
            userId,
            createdAt.toISOString(),
          ]);
          animalMeta.push({ userId, createdAt });
        }
      }
    }
    const animalIds = [];
    {
      // RETURNING sırası VALUES sırasıyla aynı; meta ile eşleşiyor.
      const CHUNK = 100;
      for (let i = 0; i < animalRows.length; i += CHUNK) {
        const slice = animalRows.slice(i, i + CHUNK);
        let n = 0;
        const values = slice
          .map((row) => {
            const geo = `ST_SetSRID(ST_MakePoint($${++n}, $${++n}), 4326)::geography`;
            const rest = row.slice(2).map(() => `$${++n}`);
            return `(${geo},${rest.join(',')})`;
          })
          .join(',');
        const res = await pool.query(
          `INSERT INTO animals (location, species, name, color, breed, markings, created_by, created_at)
           VALUES ${values} RETURNING id`,
          slice.flat()
        );
        animalIds.push(...res.rows.map((r) => r.id));
      }
    }
    totals.animals += animalIds.length;

    // --- fotoğraflar, bakım ilişkisi, yorumlar --------------------------
    const photoRows = [];
    const commentRows = [];
    const careRelRows = [];
    animalIds.forEach((animalId, idx) => {
      const meta = animalMeta[idx];
      for (let p = 0; p < 2; p += 1) {
        photoRows.push([
          animalId,
          photoUrls[(idx + p) % photoUrls.length],
          meta.userId,
          meta.createdAt.toISOString(),
        ]);
      }
      careRelRows.push([meta.userId, animalId]);

      // İlk yorum: kaydın örnek olduğunu söyleyen rehber mesajı, kayıt anında.
      commentRows.push([
        animalId,
        meta.userId,
        randomItem(INTRO_COMMENTS),
        meta.createdAt.toISOString(),
      ]);
      // Sonraki günlerde aynı ilçedeki rehberlerden 1-3 takip yorumu.
      const followups = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < followups; c += 1) {
        const commenter = randomItem(inserted);
        const when = new Date(meta.createdAt);
        when.setDate(when.getDate() + 1 + Math.floor(Math.random() * 6));
        if (when > new Date()) continue;
        commentRows.push([animalId, commenter, randomItem(FOLLOWUP_COMMENTS), when.toISOString()]);
        careRelRows.push([commenter, animalId]);
      }
    });
    totals.comments += await bulkInsert(
      `INSERT INTO animal_comments (animal_id, user_id, body, created_at) VALUES __VALUES__`,
      commentRows
    );
    await bulkInsert(
      `INSERT INTO animal_photos (animal_id, url, uploaded_by, created_at) VALUES __VALUES__`,
      photoRows
    );
    await bulkInsert(
      `INSERT INTO user_animal_care (user_id, animal_id) VALUES __VALUES__ ON CONFLICT DO NOTHING`,
      careRelRows
    );

    // --- aşı (%30) ve sağlık kaydı (%20, yarısı iyileşmiş) ---------------
    for (let idx = 0; idx < animalIds.length; idx += 1) {
      const meta = animalMeta[idx];
      const after = (days) => {
        const d = new Date(meta.createdAt);
        d.setDate(d.getDate() + days);
        return d > new Date() ? new Date() : d;
      };
      if (idx % 10 < 3) {
        await pool.query(
          `INSERT INTO vaccinations (animal_id, vaccine_type, note, vet_verified, administered_at, next_due_at, recorded_by, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $5::timestamptz + interval '1 year', $6, $5)`,
          [
            animalIds[idx],
            VACCINE_TYPES[idx % VACCINE_TYPES.length],
            randomItem(VACCINE_NOTES),
            idx % 2 === 0,
            after(2).toISOString(),
            meta.userId,
          ]
        );
        totals.vaccinations += 1;
      }
      if (idx % 10 >= 8) {
        const isIllness = idx % 2 === 0;
        const recovered = idx % 4 === 0;
        const rec = await pool.query(
          `INSERT INTO health_records (animal_id, record_type, description, recorded_by, recorded_at, recovered_at, recovered_by)
           VALUES ($1, $2, $3, $4, $5,
                   CASE WHEN $6::boolean THEN $5::timestamptz + interval '4 day' END,
                   CASE WHEN $6::boolean THEN $4::int END)
           RETURNING id`,
          [
            animalIds[idx],
            isIllness ? 'illness' : 'injury',
            isIllness ? ILLNESSES[idx % ILLNESSES.length] : INJURIES[idx % INJURIES.length],
            meta.userId,
            after(1).toISOString(),
            recovered,
          ]
        );
        await pool.query(
          `INSERT INTO animal_comments (animal_id, user_id, health_record_id, body, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            animalIds[idx],
            meta.userId,
            rec.rows[0].id,
            randomItem(HEALTH_COMMENTS),
            after(1).toISOString(),
          ]
        );
        totals.health += 1;
      }
    }

    // --- mama/su: her rehber gün aşırı, kendi hayvanlarının çevresinde ---
    const careRows = [];
    inserted.forEach((userId, ui) => {
      for (let daysAgo = 30; daysAgo >= 0; daysAgo -= 1) {
        // Gün aşırı ritim + kişiye göre kayma; her gün herkes değil.
        if ((daysAgo + ui) % 2 !== 0 && Math.random() < 0.7) continue;
        careRows.push([
          district.lng + offset(),
          district.lat + offset(),
          userId,
          Math.random() < 0.6 ? 'food' : 'water',
          randomItem(photoUrls),
          daytimeStamp(daysAgo).toISOString(),
        ]);
      }
    });
    totals.care += await bulkInsertGeo(
      `INSERT INTO care_actions (location, user_id, action_type, photo_url, created_at)
       VALUES __VALUES__`,
      careRows
    );

    // --- ilçe içi arkadaşlıklar -----------------------------------------
    const friendRows = [];
    for (let i = 0; i < inserted.length; i += 1) {
      for (let j = i + 1; j < inserted.length; j += 1) {
        if (Math.random() < 0.3) {
          friendRows.push([
            inserted[i],
            inserted[j],
            'accepted',
            daytimeStamp(20).toISOString(),
            daytimeStamp(19).toISOString(),
          ]);
        }
      }
    }
    totals.friendships += await bulkInsert(
      `INSERT INTO friendships (requester_id, addressee_id, status, created_at, responded_at)
       VALUES __VALUES__ ON CONFLICT DO NOTHING`,
      friendRows
    );

    console.log(
      `  ${district.city} / ${district.name}: ${inserted.length} rehber, ${animalIds.length} hayvan`
    );
  }

  // Rozetleri "kazanılmış ve görülmüş" işle: rehber hesabına girildiğinde
  // bir aylık birikim tek seferde kutlama patlaması yapmasın.
  console.log('Rozetler geçmişe işleniyor...');
  const badgeMap = await getBadgesForUsers(allUserIds);
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
  const CHUNK = 200;
  for (let i = 0; i < awardRows.length; i += CHUNK) {
    const slice = awardRows.slice(i, i + CHUNK);
    let n = 0;
    const values = slice.map((row) => `(${row.map(() => `$${++n}`).join(',')}, now())`);
    await pool.query(
      `INSERT INTO user_badge_awards (user_id, badge_key, tier, label, points_awarded, seen_at)
       VALUES ${values.join(',')} ON CONFLICT DO NOTHING`,
      slice.flat()
    );
  }

  // Harita açılışta yeşil görünsün diye bir tur taze mama/su.
  await tazele({ sessiz: true });

  console.log('\nTamamlandı (yalnızca EKLENDİ, mevcut veriye dokunulmadı):');
  console.log(`  İlçe           : ${DISTRICTS.length}`);
  console.log(`  Rehber         : ${totals.users}`);
  console.log(`  Hayvan         : ${totals.animals}`);
  console.log(`  Mama/su        : ${totals.care}`);
  console.log(`  Yorum          : ${totals.comments}`);
  console.log(`  Aşı            : ${totals.vaccinations}`);
  console.log(`  Sağlık kaydı   : ${totals.health}`);
  console.log(`  Arkadaşlık     : ${totals.friendships}`);
  console.log(`\n  Rehber hesap şifresi (yalnızca burada gösterilir): ${password}`);
  console.log(`  Örnek giriş: kadikoy.rehber1@${DEMO_EMAIL_DOMAIN}`);
  console.log('\n  Haritanın yeşili 4-6 saatte solar; canlı tutmak için ya');
  console.log('  DEMO_REHBER_TAZELE=1 ortam değişkenini verin (sunucu saatte bir tazeler)');
  console.log('  ya da bu scripti --tazele ile zamanlanmış çalıştırın.');
}

async function main() {
  const arg = process.argv[2];
  if (arg === '--temizle') await temizle();
  else if (arg === '--tazele') await tazele();
  else await olustur();
  await pool.end();
}

// Sunucu, saatlik tazeleme için `tazele`yi modül olarak da kullanıyor
// (src/utils/demoTazele.js); o durumda main çalışmamalı ve havuz açık kalmalı.
if (require.main === module) {
  main().catch(async (err) => {
    console.error('seed-rehber başarısız:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
}

module.exports = { tazele };
