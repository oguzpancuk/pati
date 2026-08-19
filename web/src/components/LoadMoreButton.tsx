/**
 * The shared "load more" button for paginated lists (same as mobile's
 * ui/LoadMoreButton): the user sees where it ended and how many remain.
 */
export function LoadMoreButton({
  remaining,
  loading,
  onClick,
  label = 'Daha fazla göster',
}: {
  remaining: number;
  loading?: boolean;
  onClick: () => void;
  label?: string;
}) {
  if (remaining <= 0) return null;
  return (
    <button className="btn ghost small full" onClick={onClick} disabled={loading}>
      {loading ? 'Yükleniyor…' : `${label} (${remaining})`}
    </button>
  );
}
