import { useEffect, useState } from 'react';
import { deleteCareAction, type MyCareAction } from '../../api';
import { CareHistoryMap } from '../CareHistoryMap';
import { MiniMap } from '../MiniMap';
import { CareIcon } from './icons';
import { Sheet, useSheetDismiss } from './Sheet';

// Drop-history rows show the time too: whether a record is still deletable
// depends on how fresh it is, and a date alone hides that.
function formatCareDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * "Mama & su geçmişim" behind one row-button (owner, 2026-09-11). The sheet
 * holds exactly what the profile used to show inline: the history map, the
 * chooser for a marker with several records, and a record's detail with the
 * delete action while the server's window allows it.
 */
export function CareHistorySheet({
  open,
  onClose,
  actions,
  onDeleted,
  onReload,
}: {
  open: boolean;
  onClose: () => void;
  actions: MyCareAction[];
  /** The deleted record leaves the caller's list. */
  onDeleted: (id: number) => void;
  /** The delete window may have expired since the list was fetched. */
  onReload: () => void;
}) {
  const [group, setGroup] = useState<MyCareAction[] | null>(null);
  const [detail, setDetail] = useState<MyCareAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The two popups join the dismiss stack without a history entry of their
  // own: Escape closes the topmost one, and a back press closes the popup
  // together with the history sheet it sits on. Giving each its own entry
  // would need the chooser to hand one back at the exact moment the detail
  // asks for one — a race the group → detail step would lose.
  const closeGroup = useSheetDismiss(!!group, () => setGroup(null), false);
  const closeDetail = useSheetDismiss(!!detail, () => setDetail(null), false);
  // A popup must never outlive the sheet it sits on.
  useEffect(() => {
    if (!open) {
      setGroup(null);
      setDetail(null);
    }
  }, [open]);

  async function handleDelete(action: MyCareAction) {
    const label = action.action_type === 'food' ? 'mama' : 'su';
    if (!window.confirm(`Bu ${label} kaydı haritadan da kalkacak. Emin misin?`)) return;
    try {
      await deleteCareAction(action.id);
      onDeleted(action.id);
      setDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
      // The window may have expired since the map was fetched; refresh so
      // stale delete buttons disappear.
      setDetail(null);
      onReload();
    }
  }

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Mama & su geçmişim">
        {error && <div className="error">{error}</div>}
        {actions.length === 0 ? (
          <div className="card flat">
            <span className="muted">Henüz mama veya su bırakmadın.</span>
          </div>
        ) : (
          <>
            {/* The history is a MAP, not a list (owner decision,
                2026-08-31): every drop is a marker; clicking one opens the
                date/delete popup. */}
            <CareHistoryMap
              actions={actions}
              height={300}
              onSelect={(picked) => (picked.length === 1 ? setDetail(picked[0]) : setGroup(picked))}
            />
            {/* The map draws at most 100 records (the API's page cap). */}
            {actions.length === 100 && (
              <p className="subtle" style={{ textAlign: 'center', margin: '6px 0 0' }}>
                Son 100 kayıt gösteriliyor.
              </p>
            )}
          </>
        )}
      </Sheet>

      {/* Chooser for a marker holding several records. Rendered after the
          sheet so it paints above it. */}
      {group && (
        <div className="backdrop" onClick={closeGroup} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center', marginBottom: 12 }}>Bu noktadaki kayıtlar</h2>
            {group.map((action) => (
              <button
                key={action.id}
                className="card flat care-group-row"
                onClick={() => {
                  setGroup(null);
                  setDetail(action);
                }}
              >
                <CareIcon type={action.action_type} size={18} />
                <strong style={{ flex: 1 }}>{action.action_type === 'food' ? 'Mama' : 'Su'}</strong>
                <span className="muted">{formatCareDate(action.created_at)}</span>
              </button>
            ))}
            <button className="btn ghost full" style={{ marginTop: 6 }} onClick={closeGroup}>
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Drop-detail popup: where this record landed, as a static map. */}
      {detail && (
        <div className="backdrop" onClick={closeDetail} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center', marginBottom: 2 }}>
              {detail.action_type === 'food' ? 'Mama kaydı' : 'Su kaydı'}
            </h2>
            <p className="muted" style={{ textAlign: 'center', margin: '0 0 12px' }}>
              {formatCareDate(detail.created_at)}
            </p>
            <MiniMap
              key={detail.id}
              lat={detail.location.coordinates[1]}
              lng={detail.location.coordinates[0]}
              height={180}
            >
              <span className="care-detail-marker">
                <CareIcon type={detail.action_type} size={18} />
              </span>
            </MiniMap>
            {/* Still only inside the server-computed 15-minute window. */}
            {detail.deletable && (
              <button className="btn full care-delete" onClick={() => handleDelete(detail)}>
                Sil
              </button>
            )}
            <button className="btn ghost full" style={{ marginTop: 10 }} onClick={closeDetail}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </>
  );
}
