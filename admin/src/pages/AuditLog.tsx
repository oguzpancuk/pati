import { AuditEntry } from '../api';
import Pager from '../components/Pager';
import { formatDateTime } from '../format';
import { useList } from '../useList';

const ACTION_LABELS: Record<string, string> = {
  'user.update': 'Kullanıcı güncellendi',
  'animal.update': 'Hayvan güncellendi',
  'animal.delete': 'Hayvan silindi',
  'animal.merge': 'Hayvan birleştirildi',
  'careAction.delete': 'Bakım kaydı silindi',
  'comment.delete': 'Yorum silindi',
};

const TARGET_LABELS: Record<string, string> = {
  user: 'kullanıcı',
  animal: 'hayvan',
  careAction: 'bakım kaydı',
  comment: 'yorum',
};

export default function AuditLog() {
  const list = useList<AuditEntry>('/admin/audit-log', (d: {
    entries: AuditEntry[];
    total: number;
  }) => ({ items: d.entries, total: d.total }));

  return (
    <>
      <h1>Denetim Kaydı</h1>
      <p className="page-hint">
        Panelden yapılan her değişiklik burada. Kayıtlar salt okunur — silinemez, düzenlenemez.
      </p>

      {list.error && <div className="error-banner">{list.error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zaman</th>
              <th>Yönetici</th>
              <th>İşlem</th>
              <th>Hedef</th>
              <th>Ayrıntı</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((entry) => (
              <tr key={entry.id}>
                <td className="num muted">{formatDateTime(entry.created_at)}</td>
                <td>{entry.actor_name ?? <span className="muted">silinmiş hesap</span>}</td>
                <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                <td className="mono">
                  {TARGET_LABELS[entry.target_type] ?? entry.target_type}
                  {entry.target_id !== null && ` #${entry.target_id}`}
                </td>
                <td className="mono muted" style={{ maxWidth: 380 }}>
                  {summarize(entry)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && (
          <div className="empty">Henüz bir işlem yapılmamış.</div>
        )}
        {list.loading && <div className="empty">Yükleniyor…</div>}
      </div>

      <Pager offset={list.offset} limit={list.limit} total={list.total} onChange={list.setOffset} />
    </>
  );
}

/**
 * Denetim ayrıntıları serbest JSON. Ham JSON tabloyu okunmaz hale getirdiği için
 * en çok işe yarayan alanları öne çıkarıp gerisini kısaltıyoruz.
 */
function summarize(entry: AuditEntry): string {
  const d = entry.details || {};
  const parts: string[] = [];

  if (typeof d.reason === 'string' && d.reason) parts.push(`sebep: ${d.reason}`);
  if (typeof d.suspendedReason === 'string' && d.suspendedReason) {
    parts.push(`sebep: ${d.suspendedReason}`);
  }
  if (d.suspended === true) parts.push('askıya alındı');
  if (d.suspended === false) parts.push('askı kaldırıldı');
  if (typeof d.role === 'string') parts.push(`rol: ${d.previousRole ?? '?'} → ${d.role}`);
  if (typeof d.sourceId === 'number') parts.push(`kaynak #${d.sourceId} silindi`);
  if (typeof d.name === 'string' && entry.action === 'animal.delete') parts.push(`ad: ${d.name}`);
  if (typeof d.body === 'string') parts.push(`"${d.body.slice(0, 60)}"`);
  if (typeof d.action_type === 'string') parts.push(d.action_type === 'food' ? 'mama' : 'su');

  if (parts.length === 0) {
    const json = JSON.stringify(d);
    return json === '{}' ? '—' : json.slice(0, 100);
  }
  return parts.join(' · ');
}
