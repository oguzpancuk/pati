import type { Badge } from '../../api';
import { badgeProgressText, badgeTitle } from '@mobile/badges';
import { BadgeSymbol } from '../../badges';

/** The featured-badge row, identical on both profiles. */
export function BadgeBlock({
  title,
  actionLabel,
  onAction,
  badges,
  emptyText,
  emptyPressable = false,
}: {
  title: string;
  actionLabel: string;
  /** Opens the badge catalog (selectable on your own profile). */
  onAction: () => void;
  badges: Badge[];
  emptyText: string;
  /** Only your own profile invites a click on the empty card (to pick badges). */
  emptyPressable?: boolean;
}) {
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 className="section">{title}</h2>
        <button className="link" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      {badges.length === 0 ? (
        <div
          className="card flat"
          role={emptyPressable ? 'button' : undefined}
          style={emptyPressable ? { cursor: 'pointer' } : undefined}
          onClick={emptyPressable ? onAction : undefined}
        >
          <span className="muted">{emptyText}</span>
        </div>
      ) : (
        <div className="badge-grid">
          {badges.map((b) => (
            <div key={b.key} className="card flat" role="button" onClick={onAction}>
              <BadgeSymbol symbol={b.symbol} tier={b.tier} size={40} />
              <div className="badge-card-title">{badgeTitle(b)}</div>
              <div className="subtle">{badgeProgressText(b)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
