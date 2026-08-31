import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * One-line horizontally scrollable chip row with a "there's more" hint: a
 * chevron bubble hugs the right edge while options overflow and hides once
 * the user scrolls to the end (owner feedback, 2026-08-31 — the bare
 * scroll gave no clue that options continue off-screen). Web counterpart
 * of mobile's ChipScroller.
 */
export function ChipRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const el = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  // why [children]: a species swap changes scrollWidth without resizing the
  // container, so the ResizeObserver alone would go stale — the effect must
  // re-run per content change even though it re-registers the listeners.
  useEffect(() => {
    const row = el.current;
    if (!row) return;
    // The 8px slack keeps the hint from flickering at the very end.
    const update = () =>
      setMore(
        row.scrollWidth > row.clientWidth + 1 &&
          row.scrollLeft + row.clientWidth < row.scrollWidth - 8
      );
    update();
    row.addEventListener('scroll', update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      resize.disconnect();
    };
  }, [children]);

  return (
    <div className="chiprow-wrap" style={style}>
      <div ref={el} className="chiprow scroll">
        {children}
      </div>
      {more && (
        <span className="chiprow-more" aria-hidden="true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9.8 6 6 6-6 6" stroke="var(--text-muted)" />
          </svg>
        </span>
      )}
    </div>
  );
}
