/**
 * Hazır karikatür avatarları.
 *
 * ## Neden `avatar_url` kolonunda duruyor
 * Kullanıcının profil görseli iki şeyden **biri** olabiliyor: yüklediği bir
 * fotoğraf ya da seçtiği hazır avatar. İkisi aynı soruya cevap veriyor ("bu
 * kişi için ne çizilecek") ve ikisi aynı anda geçerli olamıyor — yani ayrı iki
 * kolon değil, etiketli bir birleşim (tagged union).
 *
 * Bu yüzden hazır avatar da aynı kolona, `pati-avatar:` önekiyle yazılıyor:
 *
 *     avatar_url = 'https://.../uploads/123.jpg'   → yüklenmiş fotoğraf
 *     avatar_url = 'pati-avatar:f3'                → hazır avatar
 *     avatar_url = NULL                            → baş harf
 *
 * Böylece kullanıcının görselini döndüren onlarca sorgunun (yorumlar, arkadaş
 * listesi, sıralama, bakım verenler…) hiçbiri değişmek zorunda kalmıyor.
 * Karşılığında tek bir kural var: **`avatar_url`'i doğrudan `<img src>` içine
 * koymayın**, önce `isAvatarKey()` ile bakın (mobilde `ui/Avatar` bunu zaten
 * yapıyor).
 *
 * Görsellerin kendisi burada değil: sunucu yalnızca geçerli anahtarları bilir,
 * çizim mobil tarafta SVG olarak yapılıyor (mobile/src/avatars.ts).
 */

const AVATAR_PREFIX = 'pati-avatar:';

/** 10 kadın + 10 erkek. Anahtarlar kalıcı: sıra değişse de f3 hep aynı yüz. */
const AVATAR_KEYS = [
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10',
  'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10',
];

const AVATAR_KEY_SET = new Set(AVATAR_KEYS);

function isAvatarKey(value) {
  return typeof value === 'string' && value.startsWith(AVATAR_PREFIX);
}

/** Geçerliyse `pati-avatar:f3` biçimini döner, değilse null. */
function avatarValueFor(key) {
  if (typeof key !== 'string') return null;
  const clean = key.trim();
  if (!AVATAR_KEY_SET.has(clean)) return null;
  return `${AVATAR_PREFIX}${clean}`;
}

module.exports = { AVATAR_PREFIX, AVATAR_KEYS, isAvatarKey, avatarValueFor };
