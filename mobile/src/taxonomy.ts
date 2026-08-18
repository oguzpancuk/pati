/**
 * Uygulamanın ortak sözlüğü — `backend/src/utils/taxonomy.js` ile **birebir
 * aynı** tutulmalı. İki kopya olmasının sebebi: sunucu doğrulamayı istemciye
 * bırakamaz (API'ye doğrudan istek atan biri listede olmayan değer yazabilir),
 * istemci de her seçici için ağdan liste çekmek zorunda kalmamalı.
 *
 * Listelerden biri değişirse **iki dosyayı birlikte** güncelleyin.
 *
 * ## Neden "cins" değil "desen"
 * Türkiye sokak kedileri bir ırka ait değil; halk arasındaki adları (tekir,
 * sarman, smokin) ırk değil post deseni belirtiyor. Köpekler de büyük ölçüde
 * melez. Veritabanı kolonu `breed` kaldı, arayüz etiketi "Tür / Desen".
 */

export const OTHER = 'Diğer';

export type Species = 'cat' | 'dog';

/** Sokakta en sık görülen kedi desenleri (yaygınlık sırasıyla). */
export const CAT_PATTERNS = ['Tekir', 'Sarman', 'Siyah', 'Üç renk (calico)', 'Smokin'];

/** Sokak köpeği tipleri. Hepsi melez; saf ırk sokakta neredeyse görülmüyor. */
export const DOG_PATTERNS = [
  'Kangal melezi',
  'Akbaş melezi',
  'Sokak melezi (orta boy)',
  'Kısa bacaklı melez',
  'Av/Terrier melezi',
];

/** Ana gövde rengi. Desenle kısmen çakışıyor (sarman zaten turuncu). */
export const CAT_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah', 'Beyaz', 'Siyah-beyaz'];
export const DOG_COLORS = [
  'Sarı / kahverengi',
  'Siyah',
  'Beyaz',
  'Siyah-sarı (maskeli)',
  'Alacalı / benekli',
];

export const ILLNESSES = [
  'Üst solunum yolu enfeksiyonu',
  'Parazit (iç/dış)',
  'Uyuz',
  'Deri hastalığı / mantar',
  'Göz enfeksiyonu',
];

export const INJURIES = [
  'Trafik kazası',
  'Kavga yarası',
  'Kırık',
  'Kesik / delici yara',
  'Yanık / zehirlenme',
];

/**
 * Aşı türleri. Kuduz başta: 5199 sayılı kanun gereği zorunlu ve belediyeler
 * sokak hayvanlarına öncelikle onu yapıyor.
 */
export const VACCINE_TYPES = ['Kuduz', 'Karma', 'İç parazit', 'Dış parazit'];

/** Seçenek listesine "Diğer" ekler; arayüzde son sırada görünür. */
export function withOther(options: string[]): string[] {
  return [...options, OTHER];
}

export function patternsFor(species: Species): string[] {
  return species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS;
}

export function colorsFor(species: Species): string[] {
  return species === 'cat' ? CAT_COLORS : DOG_COLORS;
}

export function conditionsFor(recordType: 'illness' | 'injury'): string[] {
  return recordType === 'illness' ? ILLNESSES : INJURIES;
}

/**
 * Kayıtlı bir değerin listedeki seçeneklerden biri mi yoksa serbest metin mi
 * olduğunu söyler. Arayüz, kayıtlı hayvanı düzenlerken hangi çipin seçili
 * geleceğine buna bakarak karar veriyor.
 */
export function isPresetChoice(value: string | null | undefined, options: string[]): boolean {
  return !!value && options.includes(value);
}
