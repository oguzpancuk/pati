import { UserAvatar } from '../../avatars';

/**
 * The profile header, identical on your own profile and on someone else's
 * (owner, 2026-09-11) — only the top-right controls differ: the bell /
 * friends / gear row there, a single friendship button here.
 */
export function ProfileHeader({
  avatarUrl,
  name,
  secondary,
  demo = false,
  hint,
  onPressAvatar,
  actions,
}: {
  avatarUrl: string | null;
  name: string;
  /** Under the name: your e-mail, or the join date on someone else's. */
  secondary: string;
  demo?: boolean;
  /** The orange micro line (your own profile only). */
  hint?: string;
  onPressAvatar?: () => void;
  actions?: React.ReactNode;
}) {
  const identity = (
    <>
      <UserAvatar avatarUrl={avatarUrl} name={name} size={52} />
      <div className="grow profile-identity-text">
        {/* The name has the row to itself: sharing it with the demo chip
            truncated even a short name once the controls joined the row. */}
        <h1 className="profile-name">{name}</h1>
        <div className="name-with-chip">
          <span className="muted profile-secondary">{secondary}</span>
          {demo && <span className="demo-chip">demo</span>}
        </div>
      </div>
    </>
  );

  // On the identity row, not above it: on their own line the controls
  // floated toward the top of the page with a band of nothing under them
  // (owner, 2026-09-11). Centred against the avatar, they read as part of
  // the same block as the name and the photo.
  const controls = actions && <div className="profile-actions">{actions}</div>;

  return (
    <div className="profile-head">
      {onPressAvatar ? (
        <div
          className="row profile-identity"
          role="button"
          tabIndex={0}
          onClick={onPressAvatar}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPressAvatar();
            }
          }}
        >
          {identity}
          {controls}
        </div>
      ) : (
        <div className="row profile-identity">
          {identity}
          {controls}
        </div>
      )}
      {/* Full width under the row, not inside the name column: beside the
          controls it wrapped onto a second line. */}
      {hint && <div className="profile-hint">{hint}</div>}
    </div>
  );
}

/** One of the round controls in the header's top-right row. */
export function HeaderIconButton({
  label,
  onClick,
  count = 0,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Drawn as a count badge when greater than zero. */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      className="profile-icon-btn"
      onClick={onClick}
      aria-label={count > 0 ? `${label} (${count})` : label}
    >
      {children}
      {count > 0 && <span className="profile-icon-count">{count > 99 ? '99+' : count}</span>}
    </button>
  );
}
