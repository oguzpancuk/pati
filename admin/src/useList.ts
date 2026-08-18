import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/**
 * Sayfalanmış admin listeleri için ortak yükleme kancası. Beş liste ekranı da
 * aynı deseni kullanıyor (yükleniyor / hata / sayfalama / yeniden yükle), bu
 * yüzden tek yerde duruyor.
 */
export function useList<T>(
  path: string,
  extract: (data: never) => { items: T[]; total: number },
  deps: unknown[] = [],
  limit = 25
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sep = path.includes('?') ? '&' : '?';
      const data = await api.get<never>(`${path}${sep}limit=${limit}&offset=${offset}`);
      const result = extract(data);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
    // extract her render'da yeniden oluşuyor; bağımlılığa koyarsak sonsuz döngü olur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, offset, limit]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtre değişince ilk sayfaya dön; aksi halde 3. sayfada boş liste görünüyor.
  useEffect(() => {
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { items, total, offset, setOffset, limit, loading, error, reload: load };
}
