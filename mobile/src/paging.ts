/**
 * Sayfalı listeleri birleştirirken aynı kaydın iki kez girmesini engeller.
 * Neden gerekli: offset tabanlı sayfalama arada yeni kayıt girince kayıyor
 * (bir yorum eklenir, sonraki sayfa bir öncekinin son kaydını da getirir);
 * ayrıca FlatList `onEndReached` aynı karede birden çok tetiklenebiliyor.
 * React "aynı key'e sahip iki çocuk" uyarısı buradan geliyordu.
 */
export function mergeById<T extends { id: number }>(
  prev: T[],
  incoming: T[],
  position: 'end' | 'start' = 'end'
): T[] {
  const seen = new Set(prev.map((item) => item.id));
  const fresh = incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return position === 'end' ? [...prev, ...fresh] : [...fresh, ...prev];
}
