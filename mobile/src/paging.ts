/**
 * Prevents the same record entering twice when merging paginated lists. Why:
 * offset-based pagination drifts when a new record lands in between (a
 * comment is added and the next page re-fetches the previous page's last
 * record); FlatList's `onEndReached` can also fire multiple times in one
 * frame. React's "two children with the same key" warning came from here.
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
