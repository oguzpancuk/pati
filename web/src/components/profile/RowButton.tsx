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
  return (
    <button className="card flat row-button" onClick={onClick}>
      {icon}
      <strong className="grow">{label}</strong>
      {value && <span className="subtle">{value}</span>}
      <span className="subtle">›</span>
    </button>
  );
}
