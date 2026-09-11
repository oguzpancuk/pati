/** A full-width row that opens a sheet: icon, label, value, chevron. */
export function RowButton({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  /** The value on the right, before the chevron (e.g. "12 kayıt"). */
  value?: string;
  onClick: () => void;
}) {
  // A band of its own, ruled above and below (owner, 2026-09-12). It used to
  // sit flush under the level bar with a wide gap beneath it, so it read as
  // the tail of the level block rather than as its own thing.
  return (
    <div className="row-button-band">
      <button className="card flat row-button" onClick={onClick}>
        {icon}
        <strong className="grow">{label}</strong>
        {value && <span className="subtle">{value}</span>}
        <span className="subtle">›</span>
      </button>
    </div>
  );
}
