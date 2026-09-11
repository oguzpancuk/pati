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
      <UserAvatar avatarUrl={avatarUrl} name={name} size={60} />
      <div className="grow">
        <div className="name-with-chip">
          <h1 className="profile-name">{name}</h1>
          {demo && <span className="demo-chip">demo</span>}
        </div>
        <div className="muted">{secondary}</div>
        {hint && <div className="profile-hint">{hint}</div>}
      </div>
    </>
  );

  return (
    <div className="profile-head">
      {/* Right-aligned on its own line so the name keeps the full width on
          both profiles. */}
      {actions && <div className="profile-actions">{actions}</div>}
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
        </div>
      ) : (
        <div className="row profile-identity">{identity}</div>
      )}
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
