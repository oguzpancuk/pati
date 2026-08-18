/**
 * Sayfalı listelerin ortak "devamını getir" düğmesi (mobildeki ui/LoadMoreButton
 * ile aynı): kullanıcı nerede bittiğini ve kaç tane daha olduğunu görsün.
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
