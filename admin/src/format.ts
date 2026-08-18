export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function speciesLabel(species: 'cat' | 'dog'): string {
  return species === 'cat' ? 'Kedi' : 'Köpek';
}

export function animalTitle(animal: { name: string | null; species: 'cat' | 'dog' }): string {
  return animal.name ?? `İsimsiz ${speciesLabel(animal.species).toLowerCase()}`;
}

/** GeoJSON [lng, lat] sırasında gelir; insan okuması için lat, lng yazıyoruz. */
export function formatPoint(point: { coordinates: [number, number] } | null): string {
  if (!point) return '—';
  const [lng, lat] = point.coordinates;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
