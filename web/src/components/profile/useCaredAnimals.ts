import { useCallback, useRef, useState } from 'react';
import { mergeById } from '@mobile/paging';
import { fetchUserAnimals, type AnimalPage, type ProfileAnimal } from '../../api';

/** Pages after the first arrive this many at a time, as the gallery nears its end. */
export const CARED_ANIMAL_PAGE = 20;

export type CaredAnimals = {
  animals: ProfileAnimal[];
  /** Every animal this person cares for, not just the loaded pages. */
  total: number;
  loadingMore: boolean;
  /** The last page request failed; the gallery offers a retry. */
  loadFailed: boolean;
  /** A profile (re)load: the list starts over from this first page. */
  reset: (page: AnimalPage) => void;
  /** The next page, when one remains and none is on its way. */
  loadMore: () => Promise<void>;
};

/**
 * The paging behind the carer gallery (owner, 2026-09-15: scroll through
 * them all, no "show more"); mobile's components/profile/useCaredAnimals,
 * which carries the tests. The gallery asks for the next page by itself as
 * its end comes near, so the request can arrive at any moment — twice in a
 * row, or while the profile is reloading underneath it.
 */
export function useCaredAnimals(userId: number | 'me'): CaredAnimals {
  const [list, setList] = useState<{ animals: ProfileAnimal[]; total: number }>({
    animals: [],
    total: 0,
  });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Refs, not state: a second request before the re-render would still read
  // the stale state and ask for the same page twice.
  const current = useRef(list);
  const inFlight = useRef(false);
  // Bumped by every reset. A page that was requested against the old list
  // would otherwise land on the fresh first page at the old offset and
  // leave a hole nobody ever fills.
  const generation = useRef(0);
  // The gallery asked for more and has not been served yet: the page is on
  // its way, or failed. A reset in that state asks again by itself — the
  // strip's end is no farther than before, and when the list comes back the
  // same length nothing tells the gallery that its request was dropped.
  const wanted = useRef(false);

  const loadMore = useCallback(async () => {
    const { animals, total } = current.current;
    if (animals.length >= total) return;
    wanted.current = true;
    if (inFlight.current) return;
    const gen = generation.current;
    inFlight.current = true;
    setLoadingMore(true);
    setLoadFailed(false);
    try {
      const page = await fetchUserAnimals(userId, CARED_ANIMAL_PAGE, animals.length);
      if (gen !== generation.current) return;
      wanted.current = false;
      const merged = mergeById(current.current.animals, page.animals);
      // A page with nothing new means the list shrank since the count was
      // taken; believing the old total would ask for the same empty page
      // every time the end comes into view.
      const grew = merged.length > current.current.animals.length;
      current.current = {
        animals: merged,
        total: grew ? Math.max(page.total, merged.length) : merged.length,
      };
      setList(current.current);
    } catch {
      if (gen === generation.current) setLoadFailed(true);
    } finally {
      // A reset since then owns the flags now, and may have a request of
      // its own on the way.
      if (gen === generation.current) {
        inFlight.current = false;
        setLoadingMore(false);
      }
    }
  }, [userId]);

  const reset = useCallback(
    (page: AnimalPage) => {
      const askAgain = wanted.current;
      wanted.current = false;
      generation.current += 1;
      inFlight.current = false;
      current.current = { animals: page.animals, total: page.total };
      setList(current.current);
      setLoadingMore(false);
      setLoadFailed(false);
      // loadMore settles every failure itself; nothing to await here.
      if (askAgain) loadMore();
    },
    [loadMore]
  );

  return { ...list, loadingMore, loadFailed, reset, loadMore };
}
