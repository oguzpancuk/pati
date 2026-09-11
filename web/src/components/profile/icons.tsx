/**
 * The thin-stroke marks the profile header and its sheets use — web's copy of
 * the set mobile keeps in `brand/Icon`: 24-unit box, 1.8 stroke, round caps,
 * currentColor replaced by the brand token so they tint with the theme. Every
 * mark goes through this wrapper; a second hand-rolled <svg> beside it is how
 * the two drift.
 */
function Stroke({
  size,
  viewBox = '0 0 24 24',
  children,
}: {
  size: number;
  /** Only for a mark whose artwork touches the edges — see `GearIcon`. */
  viewBox?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="var(--brand)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function BellIcon({ size = 20 }: { size?: number }) {
  return (
    <Stroke size={size}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z M10 20.5a2 2 0 0 0 4 0" />
    </Stroke>
  );
}

export function UsersIcon({ size = 20 }: { size?: number }) {
  return (
    <Stroke size={size}>
      <path d="M2.8 20v-1.4a4 4 0 0 1 4-4h3.4a4 4 0 0 1 4 4V20" />
      <circle cx="8.5" cy="7.6" r="3.4" />
      <path d="M16.4 14.8a4 4 0 0 1 4.8 3.9V20M15.4 4.6a3.4 3.4 0 0 1 0 6.5" />
    </Stroke>
  );
}

/**
 * The settings gear — mobile's `Icon name="settings"`. Its outer teeth sit on
 * the edges of the 24-unit box, so the viewBox is inset by the stroke width or
 * the ring is shaved off at the top and bottom.
 */
export function GearIcon({ size = 20 }: { size?: number }) {
  return (
    <Stroke size={size} viewBox="-1.4 -1.4 26.8 26.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Stroke>
  );
}

export function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4" />
    </svg>
  );
}

/** The food bowl / water drop, shared by the care-history sheet's markers. */
export function CareIcon({ type, size = 20 }: { type: 'food' | 'water'; size?: number }) {
  return (
    <Stroke size={size}>
      {type === 'food' ? (
        <>
          <path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" />
          <path d="M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9" />
        </>
      ) : (
        <path d="M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z" />
      )}
    </Stroke>
  );
}
