// pati REHBER verisi — canlıda (üretimde) çalıştırılmak için tasarlandı.
//
// Ne yapar: İstanbul merkez ilçeleri, İzmir merkez ilçeleri, Antalya/Kaş ve
// Milas/Güllük'te "rehber" kullanıcılar oluşturur. Her bölgede 10 rehber ve
// bölge, mahalle çapalarıyla tanımlı olduğu için kayıtlar ilçenin tamamına
// yayılır. Her rehber, uygulamayı ~1 aydır
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
// Bir çapanın (mahalle/semt merkezi) etrafındaki saçılım: ~±650 m. Kıyı
// çapalarında noktalar denize düşmesin diye çapa bazında daraltılabilir
// (üçüncü eleman, derece cinsinden).
const ANCHOR_SPREAD_DEG = 0.006;

// ---------------------------------------------------------------- ilçeler
// Her ilçe tek merkez noktası değil, ilçeye yayılmış mahalle/semt ÇAPALARIYLA
// tanımlı: rehberler ilçe merkezine yığılmasın, ilçenin tamamında otursun.
// Her rehberin bir "ev mahallesi" (çapası) var; kayıtlarının çoğu orada,
// arada başka mahallelere de uğruyor — gerçek gönüllü davranışı.
// Koordinatlar yaklaşık semt merkezleri; ekleme/çıkarma serbest.
const DISTRICTS = [
  // İstanbul — merkez (Avrupa)
  {
    city: 'İstanbul',
    name: 'Fatih',
    anchors: [
      [41.0106, 28.949],
      [41.0294, 28.9486],
      [41.0128, 28.9382],
      [41.0035, 28.9285],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Beyoğlu',
    anchors: [
      [41.0329, 28.9832],
      [41.0256, 28.9744, 0.004],
      [41.0374, 28.97],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Beşiktaş',
    anchors: [
      [41.043, 29.0061, 0.004],
      [41.08, 29.014],
      [41.0819, 29.03],
      [41.0559, 29.004],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Şişli',
    anchors: [
      [41.0672, 28.995],
      [41.048, 28.988],
      [41.048, 28.972],
      [41.06, 28.978],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Kağıthane',
    anchors: [
      [41.085, 28.97],
      [41.0765, 28.984],
      [41.093, 28.966],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Sarıyer',
    anchors: [
      [41.1669, 29.057, 0.004],
      [41.112, 29.055, 0.004],
      [41.111, 29.021],
      [41.133, 29.06, 0.004],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Eyüpsultan',
    anchors: [
      [41.048, 28.934],
      [41.069, 28.937],
      [41.174, 28.889],
      [41.035, 28.917],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Gaziosmanpaşa',
    anchors: [
      [41.0577, 28.9123],
      [41.0679, 28.897],
      [41.049, 28.905],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Bayrampaşa',
    anchors: [
      [41.0446, 28.9022],
      [41.053, 28.907],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Esenler',
    anchors: [
      [41.0435, 28.876],
      [41.056, 28.87],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Güngören',
    anchors: [
      [41.0225, 28.8874],
      [41.015, 28.894],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Bağcılar',
    anchors: [
      [41.039, 28.8567],
      [41.025, 28.828],
      [41.057, 28.828],
      [41.047, 28.845],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Bahçelievler',
    anchors: [
      [41.0022, 28.8598],
      [40.993, 28.842],
      [41.0, 28.825],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Bakırköy',
    anchors: [
      [40.9819, 28.8772, 0.004],
      [40.98, 28.856, 0.004],
      [40.964, 28.825, 0.004],
      [40.968, 28.789, 0.004],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Zeytinburnu',
    anchors: [
      [40.9948, 28.9047],
      [40.989, 28.911, 0.004],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Küçükçekmece',
    anchors: [
      [41.0015, 28.79, 0.004],
      [41.034, 28.79],
      [41.048, 28.793],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Avcılar',
    anchors: [
      [40.9793, 28.7216, 0.004],
      [41.0, 28.71],
      [40.97, 28.697, 0.004],
    ],
  },
  // İstanbul — merkez (Anadolu)
  {
    city: 'İstanbul',
    name: 'Kadıköy',
    anchors: [
      [40.983, 29.027, 0.004],
      [40.975, 29.06],
      [40.97, 29.093],
      [40.997, 29.046],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Üsküdar',
    anchors: [
      [41.0226, 29.0154, 0.004],
      [41.049, 29.051, 0.004],
      [41.003, 29.035],
      [41.021, 29.044],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Ümraniye',
    anchors: [
      [41.0165, 29.1248],
      [41.03, 29.135],
      [41.011, 29.158],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Ataşehir',
    anchors: [
      [40.995, 29.115],
      [40.973, 29.105],
      [40.988, 29.09],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Maltepe',
    anchors: [
      [40.9357, 29.131, 0.004],
      [40.923, 29.125, 0.004],
      [40.952, 29.147],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Kartal',
    anchors: [
      [40.8898, 29.1858, 0.004],
      [40.911, 29.165],
      [40.9, 29.2, 0.004],
    ],
  },
  {
    city: 'İstanbul',
    name: 'Pendik',
    anchors: [
      [40.8775, 29.2333, 0.004],
      [40.873, 29.202, 0.004],
      [40.908, 29.312],
      [40.89, 29.26],
    ],
  },
  // İzmir — merkez
  {
    city: 'İzmir',
    name: 'Konak',
    anchors: [
      [38.439, 27.142, 0.004],
      [38.4189, 27.1287, 0.004],
      [38.407, 27.129],
      [38.402, 27.112],
    ],
  },
  {
    city: 'İzmir',
    name: 'Karşıyaka',
    anchors: [
      [38.4557, 27.1113, 0.004],
      [38.464, 27.093, 0.004],
      [38.475, 27.085],
    ],
  },
  {
    city: 'İzmir',
    name: 'Bornova',
    anchors: [
      [38.4696, 27.2166],
      [38.452, 27.2],
      [38.462, 27.24],
    ],
  },
  {
    city: 'İzmir',
    name: 'Buca',
    anchors: [
      [38.3854, 27.1571],
      [38.398, 27.144],
      [38.372, 27.17],
    ],
  },
  {
    city: 'İzmir',
    name: 'Bayraklı',
    anchors: [
      [38.4622, 27.1699],
      [38.456, 27.156, 0.004],
      [38.452, 27.183],
    ],
  },
  {
    city: 'İzmir',
    name: 'Karabağlar',
    anchors: [
      [38.3733, 27.112],
      [38.39, 27.123],
      [38.362, 27.1],
    ],
  },
  {
    city: 'İzmir',
    name: 'Gaziemir',
    anchors: [
      [38.3245, 27.1188],
      [38.306, 27.117],
    ],
  },
  {
    city: 'İzmir',
    name: 'Balçova',
    anchors: [
      [38.39, 27.0455, 0.004],
      [38.383, 27.06],
    ],
  },
  {
    city: 'İzmir',
    name: 'Narlıdere',
    anchors: [
      [38.3966, 27.0011, 0.004],
      [38.4, 27.02, 0.004],
    ],
  },
  {
    city: 'İzmir',
    name: 'Çiğli',
    anchors: [
      [38.4951, 27.0785, 0.004],
      [38.517, 27.07],
    ],
  },
  {
    city: 'İzmir',
    name: 'Güzelbahçe',
    anchors: [
      [38.3714, 26.8925, 0.004],
      [38.354, 26.901],
    ],
  },
  // Antalya — yalnızca Kaş (ilçenin tamamı: merkez, Kalkan, Gömbe yaylası)
  {
    city: 'Antalya',
    name: 'Kaş',
    anchors: [
      [36.202, 29.6414, 0.004],
      [36.2622, 29.4148, 0.004],
      [36.452, 29.648],
    ],
  },
  // Muğla — Milas'ın Güllük mahallesi
  { city: 'Muğla', name: 'Güllük', anchors: [[37.2397, 27.6036, 0.004]] },
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
// OSM'den bir kez çekilmiş mahalle merkezleri (data/mahalleler.json,
// fetch-mahalleler.mjs). Varsa ilçenin elle yazılmış çapalarına ek olarak
// kullanılıyor: Kadıköy'de 4 çapa yerine 34 mahalle — rehberler ilçenin her
// köşesine dağılıyor. Mahalle noktaları gerçek yerleşim olduğu için saçılımı
// dar (±250 m); kıyıya taşma riski çapalardan da düşük.
let MAHALLELER = {};
try {
  MAHALLELER = require('./data/mahalleler.json');
} catch {
  /* dosya yoksa yalnızca elle çapalar */
}
const MAHALLE_SPREAD_DEG = 0.0023;
for (const d of DISTRICTS) {
  const extra = MAHALLELER[`${d.city}/${d.name}`] || [];
  for (const m of extra) d.anchors.push([m.lat, m.lng, MAHALLE_SPREAD_DEG]);
}

function offset(spread = ANCHOR_SPREAD_DEG) {
  return (Math.random() - 0.5) * 2 * spread;
}
/** Çapanın ([lat, lng, spread?]) saçılımı içinde rastgele bir nokta. */
function pointNear(anchor) {
  const spread = anchor[2] ?? ANCHOR_SPREAD_DEG;
  return { lat: anchor[0] + offset(spread), lng: anchor[1] + offset(spread) };
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
      r.lng + offset(0.001), // hayvanın hemen çevresi (~±100 m)
      r.lat + offset(0.001),
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

    // Her rehberin ev mahallesi: çapalar sırayla paylaştırılır, böylece
    // ilçenin her çapasında en az bir rehber oturur.
    const homeAnchor = new Map();
    inserted.forEach((userId, i) => {
      // Çapa sayısı rehber sayısını aşınca (OSM mahalleleri) evler listeye
      // eşit aralıkla dağıtılıyor; art arda ilk N çapa değil.
      homeAnchor.set(
        userId,
        district.anchors[Math.floor((i * district.anchors.length) / inserted.length) % district.anchors.length]
      );
    });

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
          // Kayıtların çoğu ev mahallesinde; ~%20'si ilçenin başka bir
          // köşesinde ("işe giderken gördüm" davranışı).
          const anchor =
            Math.random() < 0.8 ? homeAnchor.get(userId) : randomItem(district.anchors);
          const p = pointNear(anchor);
          animalRows.push([
            p.lng,
            p.lat,
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
        // Mama/su hep ev mahallesinde: gönüllü kendi sokağına bakar.
        const p = pointNear(homeAnchor.get(userId));
        careRows.push([
          p.lng,
          p.lat,
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
