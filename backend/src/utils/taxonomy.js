/**
 * Uygulamanın ortak sözlüğü: desen, renk, hastalık, yaralanma, aşı listeleri.
 *
 * Tek kaynak burası. Mobil taraftaki `mobile/src/taxonomy.ts` bunun birebir
 * kopyası — iki dosyanın senkron kalması gerekiyor (bkz. docs/NOTLAR.md).
 * Sunucu tarafında da tutuluyor çünkü doğrulama istemciye bırakılamaz:
 * uygulamayı atlayıp API'ye doğrudan istek atan biri listede olmayan bir değer
 * yazabilmemeli.
 *
 * ## Neden "cins" değil "desen"
 * Türkiye sokak kedileri bir ırka ait değil; "domestic shorthair" kategorisinde
 * ve halk arasındaki adları (tekir, sarman, smokin) ırk değil **post deseni**
 * belirtiyor. Köpekler de büyük ölçüde melez — "Kangal" değil "Kangal melezi".
 * Alan adı veritabanında `breed` kaldı (şema değişmesin diye) ama arayüzde
 * "Tür / Desen" olarak gösteriliyor.
 *
 * ## "Diğer (belirtiniz)" nasıl çalışıyor
 * Kullanıcı OTHER'ı seçerse serbest metin alanı açılıyor ve veritabanına o
 * metin yazılıyor. Yani `breed` kolonunda ya listedeki bir değer ya da
 * kullanıcının yazdığı metin duruyor; ayrı bir "diğer" kolonu yok.
 */

const OTHER = 'Diğer';

/** Sokakta en sık görülen kedi desenleri (yaygınlık sırasıyla). */
const CAT_PATTERNS = ['Tekir', 'Sarman', 'Siyah', 'Üç renk (calico)', 'Smokin'];

/** Sokak köpeği tipleri. Hepsi melez; saf ırk sokakta neredeyse görülmüyor. */
const DOG_PATTERNS = [
  'Kangal melezi',
  'Akbaş melezi',
  'Sokak melezi (orta boy)',
  'Kısa bacaklı melez',
  'Av/Terrier melezi',
];

/** Ana gövde rengi. Desenle kısmen çakışıyor (sarman zaten turuncu). */
const CAT_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah', 'Beyaz', 'Siyah-beyaz'];
const DOG_COLORS = [
  'Sarı / kahverengi',
  'Siyah',
  'Beyaz',
  'Siyah-sarı (maskeli)',
  'Alacalı / benekli',
];

/** Sağlık kaydı yalnızca iki tip: hastalık ve yaralanma. Aşı ayrı tabloda. */
const HEALTH_RECORD_TYPES = ['illness', 'injury'];

const ILLNESSES = [
  'Üst solunum yolu enfeksiyonu',
  'Parazit (iç/dış)',
  'Uyuz',
  'Deri hastalığı / mantar',
  'Göz enfeksiyonu',
];

/**
 * Yaralanma başlıkları **nedeni değil yarayı** tarif ediyor: "trafik kazası"
 * gibi bir neden kaydı gören gönüllüye ne yapacağını söylemiyor ve çoğu zaman
 * tahminden ibaret (kimse kazayı görmedi). Yaranın nerede ve ne tür olduğu ise
 * hem gözle doğrulanabiliyor hem de "yaklaşılır mı, veteriner şart mı"
 * sorusunu cevaplıyor.
 */
const INJURIES = [
  'Bacak/pati yarası',
  'Baş/göz yarası',
  'Gövde/sırt yarası',
  'Kuyruk/kulak yarası',
  'Kırık / topallama',
];

/**
 * Aşı türleri. Kuduz başta: 5199 sayılı kanun gereği zorunlu ve belediyeler
 * sokak hayvanlarına öncelikle onu yapıyor.
 */
const VACCINE_TYPES = ['Kuduz', 'Karma', 'İç parazit', 'Dış parazit'];

/** Seçenek listesine "Diğer" ekler; arayüzde son sırada görünür. */
function withOther(options) {
  return [...options, OTHER];
}

/**
 * Değer geçerli mi? Listede yoksa "Diğer" olarak serbest metin kabul ediliyor,
 * ama boş/aşırı uzun metin reddediliyor.
 */
function isValidChoice(value, options, { maxLength = 120 } = {}) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > maxLength) return false;
  return true;
}

/** Türe göre desen listesi. */
function patternsFor(species) {
  return species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS;
}

/** Türe göre renk listesi. */
function colorsFor(species) {
  return species === 'cat' ? CAT_COLORS : DOG_COLORS;
}

/** Sağlık kaydı tipine göre başlık listesi. */
function conditionsFor(recordType) {
  return recordType === 'illness' ? ILLNESSES : INJURIES;
}

module.exports = {
  OTHER,
  CAT_PATTERNS,
  DOG_PATTERNS,
  CAT_COLORS,
  DOG_COLORS,
  HEALTH_RECORD_TYPES,
  ILLNESSES,
  INJURIES,
  VACCINE_TYPES,
  withOther,
  isValidChoice,
  patternsFor,
  colorsFor,
  conditionsFor,
};
