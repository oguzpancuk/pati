/**
 * Turkish text and name pools for seed-showcase.js.
 *
 * Product-facing text stays Turkish (CLAUDE.md), and the showcase world is
 * product-facing: a demo where five thousand comments read "Test comment 12"
 * is worse than no demo. So nothing here is a single template — every
 * builder combines independent slot pools, which puts the number of distinct
 * sentences in the tens of thousands while each one still reads like
 * something a volunteer would type.
 *
 * The name pools start from seed-demo.js's (which exports nothing) and are
 * widened, so 2200 demo people are not thirty names repeated.
 */

const FIRST_NAMES = [
  // From seed-demo.js.
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
  // Widened for the showcase world.
  'Aslı',
  'Barış',
  'Beren',
  'Berk',
  'Bilge',
  'Bora',
  'Buse',
  'Can',
  'Ceren',
  'Çağla',
  'Damla',
  'Defne',
  'Dilara',
  'Doruk',
  'Ebru',
  'Efe',
  'Emre',
  'Eren',
  'Ferhat',
  'Figen',
  'Furkan',
  'Gamze',
  'Gizem',
  'Gökhan',
  'Gül',
  'Halil',
  'Hande',
  'İlker',
  'İpek',
  'Kerem',
  'Kübra',
  'Levent',
  'Mert',
  'Melis',
  'Nazlı',
  'Necati',
  'Onur',
  'Ozan',
  'Pelin',
  'Pınar',
  'Rabia',
  'Sedef',
  'Selim',
  'Sena',
  'Serkan',
  'Sevgi',
  'Sinem',
  'Tolga',
  'Tuğba',
  'Ufuk',
  'Umut',
  'Yasemin',
  'Yiğit',
  'Zeki',
];

const LAST_NAMES = [
  // From seed-demo.js.
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
  // Widened.
  'Acar',
  'Akgün',
  'Aktaş',
  'Altın',
  'Ateş',
  'Avcı',
  'Bal',
  'Barut',
  'Bulut',
  'Can',
  'Coşkun',
  'Çakır',
  'Çiftçi',
  'Duman',
  'Ekinci',
  'Erdem',
  'Ergün',
  'Genç',
  'Güler',
  'Güneş',
  'Gürsoy',
  'Işık',
  'Kaplan',
  'Karaca',
  'Keskin',
  'Korkmaz',
  'Köse',
  'Mutlu',
  'Nalbant',
  'Sarı',
  'Söylemez',
  'Tekin',
  'Toprak',
  'Turan',
  'Uçar',
  'Ünal',
  'Yalçın',
  'Yavuz',
  'Yüce',
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
  'Badem',
  'Bulut',
  'Cimbom',
  'Çakıl',
  'Fıstık',
  'Gofret',
  'Kömür',
  'Küpe',
  'Limon',
  'Maviş',
  'Mısır',
  'Nohut',
  'Paşa',
  'Peynir',
  'Pisi',
  'Sütlaç',
  'Tarçın',
  'Tombiş',
  'Yumak',
  'Zencefil',
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
  'Alaca',
  'Baron',
  'Bal',
  'Cesur',
  'Dost',
  'Efe',
  'Kaşar',
  'Kayra',
  'Kuzey',
  'Lokum',
  'Nazlı',
  'Pati',
  'Poyraz',
  'Sarı',
  'Tarçın',
  'Tosun',
  'Yağız',
  'Zeus',
];

/** Free-text markings; only some animals carry one, as in the real data. */
const MARKINGS = [
  'Sol kulağı kesik (kısırlaştırılmış)',
  'Sağ kulağında küçük çentik',
  'Boynunda mavi tasma var',
  'Göğsünde beyaz bir leke',
  'Kuyruğunun ucu beyaz',
  'Sol ön patisi beyaz',
  'Bir gözü diğerinden açık renk',
  'Sırtında koyu bir şerit',
  'Burnunun üstünde küçük bir iz',
  'Çok iri, uzaktan tanınıyor',
];

// ------------------------------------------------------------------ helpers

/** Picks one element with the caller's rng (a () => [0,1) function). */
function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

/** Picks `count` distinct elements, or all of them when the list is shorter. */
function pickMany(rng, list, count) {
  const copy = [...list];
  const out = [];
  while (out.length < count && copy.length > 0) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

function fullName(rng) {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

function animalName(rng, species) {
  return pick(rng, species === 'cat' ? CAT_NAMES : DOG_NAMES);
}

// ----------------------------------------------------------- animal comments

const WHEN = [
  'Bugün',
  'Dün akşam',
  'Bu sabah',
  'Sabah erkenden',
  'Öğlen',
  'Az önce',
  'Akşamüstü',
  'Dün öğlen',
  'Hafta sonu',
  'Geçen akşam',
  'Gece yarısı',
];
const PLACE = [
  'parkta',
  'sokağın başında',
  'apartmanın önünde',
  'bakkalın önünde',
  'otoparkta',
  'caminin bahçesinde',
  'okulun yanında',
  'durakta',
  'kuaförün önünde',
  'çöp konteynerinin yanında',
  'sitenin bahçesinde',
  'fırının önünde',
  'köşedeki ağacın altında',
];
const STATE = [
  'keyfi yerindeydi',
  'çok iyi görünüyordu',
  'biraz ürkekti ama sağlıklı',
  'karnı toktu',
  'beni hemen tanıdı',
  'mışıl mışıl uyuyordu',
  'güneşleniyordu',
  'peşimden geldi',
  'oldukça neşeliydi',
  'kilo almış gibi duruyor',
  'tüyleri güzelce parlıyordu',
];
const OFFERING = [
  'mama',
  'su',
  'kuru mama',
  'biraz haşlanmış tavuk',
  'taze su',
  'yaş mama',
  'bir kase su',
  'sabah maması',
];
const REACTION = [
  'hemen yedi',
  'afiyetle içti',
  'önce kokladı sonra yedi',
  'kabı tertemiz bırakmış',
  'iştahı gayet yerinde',
  'yanımdan ayrılmadı',
  'yerken bir yandan mırlıyordu',
  'doyunca uyudu',
];
const CONCERN = [
  'Sol arka patisini biraz koruyor, birkaç gün takip edelim',
  'Gözünde hafif bir akıntı var, göz damlası aldım',
  'Tüyleri biraz dökülmüş, uyuz olmasın diye veterinere soracağım',
  'Bugün pek iştahlı değildi, yarın tekrar bakacağım',
  'Hafif topallıyor ama ayağa basabiliyor',
  'Kulağını çok kaşıyor, damla damlattım',
  'Biraz hapşırıyor, üşütmüş olabilir',
];
const RELIEF = [
  'İyileşmiş, artık koşturuyor',
  'Tedavi işe yaramış, çok daha iyi',
  'Yara tamamen kapanmış',
  'Bu hafta gözle görülür şekilde toparladı',
  'Artık normale döndü, teşekkürler herkese',
];
/**
 * Seeded content carries real timestamps, so a line about the cold under an
 * August date reads as filler and gives the showcase away for the wrong
 * reason (QA finding, 2026-09-09).
 *
 * The season is asked of the MESSAGE, not of the machine: history reaches a
 * month back, so a run on 5 November would otherwise stamp cold-weather chat
 * onto rows dated 6 October, and a plan would stop being a pure function of
 * (seed, now) — which is what the determinism test rests on (review
 * finding).
 */
const COLD_MONTHS = new Set([10, 11, 0, 1, 2]);
const isColdAt = (at) => COLD_MONTHS.has(at.getMonth());

/** The cold-weather lines, kept apart so a caller can add them by date. */
const COLD_COORDINATION = [
  'Kışlık kulübeyi bu hafta sonu yerleştirelim diyorum',
  'Kulübeye battaniye koydum, hava soğudu',
];

const COORDINATION = [
  'Yarın sabah ben mama bırakacağım, akşamı biri alabilir mi',
  'Su kabını devirmiş, daha ağır bir kap koydum',
  'Mahalledeki esnaf da düzenli mama veriyor, iyi durumda',
  'Bu köşeye kalıcı bir su kabı koysak çok iyi olur',
  'Kısırlaştırma için belediyeye başvurdum, sıraya aldılar',
  'Akşamları burada oluyor, arayanlara duyurulur',
];
const THANKS = [
  'Emeğinize sağlık',
  'İlgilenen herkese teşekkürler',
  'Sizin gibi komşularımız olduğu için şanslıyız',
  'Ellerinize sağlık',
  'Takipte olan herkese selam',
];

/** One animal-profile comment. Six families, each with its own slots. */
function animalComment(rng, { animal, at }) {
  // The coordination pool grows in the cold half of the year — asked of the
  // comment's own date, so a run in November cannot stamp "kulübeye battaniye
  // koydum" onto a row dated October (review finding).
  const coordination = at && isColdAt(at) ? [...COORDINATION, ...COLD_COORDINATION] : COORDINATION;
  const roll = rng();
  if (roll < 0.3) return `${pick(rng, WHEN)} ${pick(rng, PLACE)} gördüm, ${pick(rng, STATE)}.`;
  if (roll < 0.55)
    return `${pick(rng, WHEN)} ${pick(rng, OFFERING)} bıraktım, ${pick(rng, REACTION)}.`;
  if (roll < 0.68) return `${pick(rng, CONCERN)}.`;
  if (roll < 0.76) return `${pick(rng, RELIEF)}.`;
  if (roll < 0.92) return `${pick(rng, coordination)}.`;
  return `${animal} için ${pick(rng, THANKS).toLocaleLowerCase('tr')}.`;
}

/** A comment attached to a health record: it is about the treatment. */
function healthComment(rng) {
  return `${pick(rng, [
    'Veterinere götürdüm, ilaçları başladık',
    'Pansumanı bugün yeniledim',
    'İlacını mamasına karıştırarak veriyorum',
    'Kontrole bir hafta sonra gideceğiz',
    'Belediye veterineri baktı, ciddi bir şey yokmuş',
    'Krem sürüyorum, kızarıklık azaldı',
    'Bu sabah iğnesini yaptırdık',
  ])}.`;
}

// ------------------------------------------------------------- direct messages

/**
 * DM topics. Lines are used in order and alternate senders, so a
 * conversation reads like an exchange instead of a bag of sentences.
 */
const DM_TOPICS = [
  [
    'Selam, şu köşedeki tekiri sen mi besliyorsun',
    'Evet ben bırakıyorum sabahları, akşamları başkası geliyor sanırım',
    'Süper, ben de akşamları uğrayabilirim',
    'Harika olur, kap boş kalmasın yeter',
    'Anlaştık, bu akşam mama alıp geçerim',
    'Eline sağlık, haber ederiz birbirimize',
  ],
  [
    'Mama kabı kırılmış, yenisini alacağım',
    'Ben de bir tane fazladan almıştım, sana bırakabilirim',
    'Çok iyi olur, ne zaman uygunsun',
    'Yarın akşam altıdan sonra evdeyim',
    'Tamam o zaman yarın uğrarım',
  ],
  [
    'Kısırlaştırma için nereye başvurdun',
    'Belediyenin veteriner işlerine, form doldurdum sadece',
    'Ne kadar sürdü sıra',
    'İki hafta kadar, ücretsizdi',
    'Süper bilgi, ben de başvuracağım',
    'Yardım gerekirse yaz, birlikte götürürüz',
  ],
  [
    'Bugün siyah kediyi göremedim, sen gördün mü',
    'Sabah gördüm, otoparktaydı, bir şeyi yok',
    'Çok rahatladım, akşam yoktu da',
    'Otoparkın arkası onun sabah köşesi, merak etme',
  ],
  [
    'Yavruları gördün mü, üç tane olmuşlar',
    'Gördüm, anneleri çok iyi bakıyor',
    'Mamayı biraz artıralım o zaman',
    'Bu hafta ben alırım, sen sonraki hafta',
    'Oldu, elimizde kalanı da bırakalım oraya',
  ],
  [
    'Merhaba, profildeki rozetleri nasıl topladın',
    'Düzenli mama ve su bırakınca kendiliğinden geliyor',
    'Ben de yeni başladım, iyi gidiyor galiba',
    'Kesinlikle, seri bozulmasın yeter',
    'Tavsiye için sağ ol',
  ],
  [
    'Bizim sokakta biri zehir bıraktığını söyledi, doğru mu',
    'Duydum ama teyit edemedim, dikkatli olalım',
    'Mamaları göz önünde bırakmayalım o zaman',
    'Aynen, ben bahçenin içine aldım kapları',
    'İyi düşünmüşsün',
  ],
];

// -------------------------------------------------------------- group messages

// The line a group opens with, spoken by whoever created it. The greeting it
// replaced ("gruba yeni katıldım") was in the shuffled pool, so it could land
// last — four of 44 inboxes previewed a month-old group with it as the newest
// message (QA finding) — and putting THAT in the creator's mouth would have
// been worse (review finding): the founder announcing they just joined.
const GROUP_OPENING = 'Grubu açtım, mahallede kim varsa beklerim';

/** Group lines that need cold weather; added by date, like COLD_COORDINATION. */
const COLD_GROUP_LINES = ['Hava çok soğuk, kulübelere battaniye koyalım'];

const GROUP_LINES = [
  'Bu akşam park tarafına mama bırakacağım',
  'Su kapları boşalmış, dolduran olursa sevinirim',
  'Yeni bir kedi gördüm, kaydını açtım profilden bakabilirsiniz',
  'Kısırlaştırma listesine iki hayvan daha ekledik',
  'Bugün mama bağışı geldi, paylaşalım',
  'Yarın sabah gönüllü lazım, müsait olan yazsın',
  'Veteriner önerisi olan var mı',
  'Sokağın başındaki köpek çok iyileşti, teşekkürler',
  'Kaybolan kedi bulundu, herkese haber olsun',
  'Mahalle esnafıyla konuştum, su kabı koymayı kabul ettiler',
  'Bu hafta sonu temizlik yapalım mı kulübelerde',
  'Fotoğrafları profillere ekliyorum, takipte kalın',
  'Yeni gelen yavrular için mamaya ihtiyaç var',
  'Belediye ekibi geldi, iki hayvanı aşıladı',
  'Akşam nöbetini ben alıyorum bugün',
  'Herkese kolay gelsin, emeğinize sağlık',
  'Kapları biraz daha içeri çektim, yağmurdan korunsun',
  'Grup çok kalabalık oldu, ne güzel',
];

/** Group names read like a real neighbourhood group: "<İlçe> Patileri". */
/**
 * Whole conversations that need cold weather. Added by the caller for a
 * conversation whose own date is cold — never pushed into DM_TOPICS at load,
 * which made an exported array's length depend on the wall clock (review
 * finding).
 */
const COLD_DM_TOPICS = [
  [
    'Kışlık kulübe yapmayı düşünüyorum, malzeme önerin var mı',
    'Strafor kutu ve kalın naylon yeterli, çok işe yarıyor',
    'Su geçirmiyor değil mi',
    'Üstünü eğimli kapatırsan hiç sorun olmuyor',
    'Deneyeceğim, teşekkürler',
  ],
];

const GROUP_SUFFIXES = [
  'Patileri',
  'Sokak Dostları',
  'Mama Gönüllüleri',
  'Pati Ekibi',
  'Hayvan Dostları',
  'Can Dostlar',
];

// --------------------------------------------------------- health / vaccination

const VACCINE_NOTES = [
  'Belediye ekibi uyguladı',
  'Veteriner kliniğinde yapıldı',
  'Yıllık tekrarı planlandı',
  'Kulak küpesi de takıldı',
  'Kayıt için fotoğraf alındı',
  null,
  null,
];

module.exports = {
  FIRST_NAMES,
  LAST_NAMES,
  CAT_NAMES,
  DOG_NAMES,
  MARKINGS,
  DM_TOPICS,
  GROUP_LINES,
  GROUP_OPENING,
  COLD_GROUP_LINES,
  COLD_DM_TOPICS,
  COLD_COORDINATION,
  isColdAt,
  GROUP_SUFFIXES,
  VACCINE_NOTES,
  pick,
  pickMany,
  fullName,
  animalName,
  animalComment,
  healthComment,
};
