import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminPetshop, api } from '../api';
import Modal from '../components/Modal';
import { formatDate, formatPoint } from '../format';

// The free first month the petshop offer includes (owner, 2026-10-07): a new
// listing's window defaults to it, and the admin extends it when the shop
// pays on.
const DEFAULT_WINDOW_DAYS = 30;

export default function Petshops() {
  const [items, setItems] = useState<AdminPetshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminPetshop | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminPetshop | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ petshops: AdminPetshop[] }>('/admin/petshops');
      setItems(data.petshops);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleHidden(shop: AdminPetshop) {
    try {
      await api.patch(`/admin/petshops/${shop.id}`, { hidden: !shop.hidden });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi');
    }
  }

  return (
    <>
      <h1>Petshoplar</h1>
      <p className="page-hint">
        Haritada görünen dükkânlar. Bir dükkân yalnızca başlangıç ve bitiş tarihleri arasında ve
        gizli değilken haritadadır; süresi dolan kayıt silinmez, bitişi uzatılınca geri gelir.
      </p>

      <div className="toolbar">
        <div className="spacer" />
        <button className="primary" onClick={() => setEditing('new')}>
          + Petshop Ekle
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dükkân</th>
              <th>İletişim</th>
              <th>Konum</th>
              <th>Yayın tarihleri</th>
              <th>Durum</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((shop) => (
              <tr key={shop.id}>
                <td>
                  <div>{shop.name}</div>
                  <div className="muted">{shop.address}</div>
                </td>
                <td>
                  <div>{shop.phone ?? '—'}</div>
                  <div className="muted" style={{ whiteSpace: 'pre-line' }}>
                    {shop.opening_hours}
                  </div>
                  {shop.website_url && (
                    <a
                      className="mono"
                      href={shop.website_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 11 }}
                    >
                      {shop.website_url}
                    </a>
                  )}
                </td>
                <td>
                  <a
                    className="mono"
                    href={osmLink(shop.location.coordinates[1], shop.location.coordinates[0])}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12 }}
                  >
                    {formatPoint(shop.location)}
                  </a>
                </td>
                <td>
                  {shop.starts_at ? formatDate(shop.starts_at) : 'Hemen'} –{' '}
                  {shop.ends_at ? formatDate(lastDay(shop.ends_at)) : 'süresiz'}
                </td>
                <td>{statusTag(shop)}</td>
                <td className="actions">
                  <button className="small" onClick={() => setEditing(shop)}>
                    Düzenle
                  </button>
                  <button className="small" onClick={() => toggleHidden(shop)}>
                    {shop.hidden ? 'Göster' : 'Gizle'}
                  </button>
                  <button className="small danger" onClick={() => setDeleting(shop)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && (
          <div className="empty">Henüz petshop yok. “Petshop Ekle” ile başlayın.</div>
        )}
        {loading && <div className="empty">Yükleniyor…</div>}
      </div>

      {editing && (
        <PetshopModal
          shop={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setError(null);
            load();
          }}
        />
      )}

      {deleting && (
        <Modal
          title="Petshopu sil"
          hint={deleting.name}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button onClick={() => setDeleting(null)}>Vazgeç</button>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await api.del(`/admin/petshops/${deleting.id}`);
                    setDeleting(null);
                    load();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Silinemedi');
                    setDeleting(null);
                  }
                }}
              >
                Sil
              </button>
            </>
          }
        >
          <p style={{ marginBottom: 0 }}>
            Kayıt kalıcı olarak silinir. Dükkânı haritadan geçici olarak kaldırmak için silmek
            yerine <strong>Gizle</strong>'yi kullanın.
          </p>
        </Modal>
      )}
    </>
  );
}

// Whether the pin is on the map is the server's answer (`listed`, the same
// SQL the map reads), not this browser's clock, which may be off by minutes
// (review finding). The dates only name why an unlisted shop is off it.
function statusTag(shop: AdminPetshop) {
  if (shop.hidden) return <span className="tag tag-user">Gizli</span>;
  if (shop.listed) return <span className="tag tag-admin">Haritada</span>;
  if (shop.starts_at && new Date(shop.starts_at).getTime() > Date.now()) {
    return <span className="tag tag-vet">Başlamadı</span>;
  }
  return <span className="tag tag-suspended">Süresi doldu</span>;
}

function PetshopModal({
  shop,
  onClose,
  onSaved,
}: {
  shop: AdminPetshop | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(shop?.name ?? '');
  const [address, setAddress] = useState(shop?.address ?? '');
  const [phone, setPhone] = useState(shop?.phone ?? '');
  const [openingHours, setOpeningHours] = useState(shop?.opening_hours ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(shop?.website_url ?? '');
  const [location, setLocation] = useState(
    shop ? `${shop.location.coordinates[1]}, ${shop.location.coordinates[0]}` : ''
  );
  const [startsAt, setStartsAt] = useState(
    shop ? toDateInput(shop.starts_at) : toDateInput(new Date().toISOString())
  );
  const [endsAt, setEndsAt] = useState(
    shop
      ? shop.ends_at
        ? toDateInput(lastDay(shop.ends_at))
        : ''
      : toDateInput(new Date(Date.now() + (DEFAULT_WINDOW_DAYS - 1) * 86400000).toISOString())
  );
  const [busy, setBusy] = useState(false);
  // Shown inside the form: a mistyped coordinate is the usual refusal, and
  // closing the form over it would throw away everything else typed.
  const [formError, setFormError] = useState<string | null>(null);
  // The form is taller than the modal on a laptop screen, so Kaydet sits
  // below the fold and the banner above it: bring the banner into view, or
  // a refused save looks like a click that did nothing (QA finding).
  // Keyed on every refusal, not on the text: a second refusal with the same
  // message must scroll too (QA finding).
  const errorRef = useRef<HTMLDivElement>(null);
  const [refusals, setRefusals] = useState(0);
  useEffect(() => {
    if (refusals) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [refusals]);
  function refuse(message: string) {
    setFormError(message);
    setRefusals((n) => n + 1);
  }
  const point = parseLocation(location);

  async function save() {
    if (!point) {
      refuse('Konumu "enlem, boylam" olarak girin (ör. 40.98750, 29.02700).');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload: Record<string, string | number | null> = {
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        openingHours: openingHours.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        lat: point.lat,
        lng: point.lng,
        startsAt: startsAt ? dayStartIso(startsAt) : null,
        endsAt: endsAt ? dayAfterIso(endsAt) : null,
      };
      if (!shop) await api.post('/admin/petshops', payload);
      else {
        const changed = changedFields(shop, payload, startsAt, endsAt);
        // Nothing edited: no request, so the audit log only records real edits.
        if (Object.keys(changed).length) await api.patch(`/admin/petshops/${shop.id}`, changed);
      }
      onSaved();
    } catch (err) {
      refuse(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={shop ? shop.name : 'Yeni petshop'}
      hint="Haritada dükkânın işaretine dokunan herkes bu bilgileri görür."
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      {formError && (
        <div className="error-banner" ref={errorRef} role="alert">
          {formError}
        </div>
      )}

      <label className="field">
        <span>Dükkân adı</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Moda Pet Shop"
          maxLength={120}
        />
      </label>

      <label className="field">
        <span>Adres</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Moda Cd. 12, Kadıköy / İstanbul"
          maxLength={300}
        />
      </label>

      <label className="field">
        <span>Konum (enlem, boylam)</span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="40.98750, 29.02700"
        />
      </label>
      <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
        Google Haritalar'da dükkânın üstüne sağ tıklayıp ilk satırdaki koordinatları kopyalayın ya
        da adres çubuğundaki bağlantıyı yapıştırın.{' '}
        {point && (
          <a href={osmLink(point.lat, point.lng)} target="_blank" rel="noreferrer">
            Haritada kontrol et
          </a>
        )}
      </p>

      <label className="field">
        <span>Telefon</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0216 555 12 34"
          inputMode="tel"
          maxLength={40}
        />
      </label>

      <label className="field">
        <span>Çalışma saatleri</span>
        <textarea
          value={openingHours}
          onChange={(e) => setOpeningHours(e.target.value)}
          placeholder={'Hafta içi 09:00–20:00\nCumartesi 10:00–18:00, Pazar kapalı'}
          rows={2}
          maxLength={300}
        />
      </label>

      <label className="field">
        <span>Bağlantı (site ya da Instagram)</span>
        <input
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://..."
          maxLength={500}
        />
      </label>

      <label className="field">
        <span>Haritada görünmeye başlar (boş = hemen)</span>
        <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>

      <label className="field">
        <span>Son gün (bu gün dahil; boş = süresiz)</span>
        <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </label>

      {shop && (
        <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          {formatDate(shop.created_at)} tarihinde eklendi
        </p>
      )}
    </Modal>
  );
}

/**
 * "40.9875, 29.027", "40.9875 29.027" or a Google Maps address. A place
 * link carries the place itself as "!3d40.9875!4d29.027"; its
 * "@40.98,29.02," is only the camera, shifted to make room for the side
 * panel, so it is the fallback (review finding). Null when nothing like a
 * coordinate pair is there; the server checks the ranges.
 */
function parseLocation(text: string): { lat: number; lng: number } | null {
  const place = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const camera = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair =
    place ?? camera ?? text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!pair) return null;
  return { lat: Number(pair[1]), lng: Number(pair[2]) };
}

/**
 * An edit sends only what the admin changed. The window above all: it is
 * rebuilt from date-only inputs in this browser's time zone, so resending
 * it on a phone-number fix would move a window another admin set from
 * another zone, or cut an exact start the API stored to midnight (review
 * finding). The dates compare as the inputs show them; the rest as values.
 */
function changedFields(
  shop: AdminPetshop,
  payload: Record<string, string | number | null>,
  startsInput: string,
  endsInput: string
): Record<string, string | number | null> {
  const stored: Record<string, string | number | null> = {
    name: shop.name,
    address: shop.address,
    phone: shop.phone,
    openingHours: shop.opening_hours,
    websiteUrl: shop.website_url,
  };
  const changed: Record<string, string | number | null> = {};
  for (const key of Object.keys(stored)) {
    if (payload[key] !== stored[key]) changed[key] = payload[key];
  }
  const [lng, lat] = shop.location.coordinates;
  if (payload.lat !== lat || payload.lng !== lng) {
    changed.lat = payload.lat;
    changed.lng = payload.lng;
  }
  if (startsInput !== toDateInput(shop.starts_at)) changed.startsAt = payload.startsAt;
  if (endsInput !== (shop.ends_at ? toDateInput(lastDay(shop.ends_at)) : '')) {
    changed.endsAt = payload.endsAt;
  }
  return changed;
}

function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

// The window's dates are whole days in the admin's own time zone: the
// listing appears at the start of the first day and leaves at the end of
// the last one. The server stores the moments: the end is the next day's
// midnight, so "last day 6 Kasım" really includes 6 Kasım.
function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}

function dayAfterIso(day: string): string {
  const next = new Date(`${day}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

/** The last day a stored end moment still covers. */
function lastDay(endIso: string): string {
  return new Date(new Date(endIso).getTime() - 1).toISOString();
}

/** <input type="date"> wants the local yyyy-mm-dd. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
