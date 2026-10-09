import { useCallback, useEffect, useRef, useState } from 'react';
import { AdSlot, AdTarget, Advertiser, api, uploadAdvertiserImage } from '../api';
import Modal from '../components/Modal';
import { formatDate } from '../format';

const SLOT_LABELS: Record<AdSlot, string> = {
  food_popup: 'Mama pop-up',
  water_popup: 'Su pop-up',
  // Not "veteriner": vets may not advertise (owner, 2026-10-09); the
  // health-record dialogs carry other brands' ads.
  vet_health_record: 'Sağlık kaydı',
};

const SLOT_HINTS: Record<AdSlot, string> = {
  food_popup: 'Kullanıcı haritada mama bırakmak için pin koyduğunda görünür.',
  water_popup: 'Kullanıcı haritada su bırakmak için pin koyduğunda görünür.',
  vet_health_record: 'Hayvan profilinde sağlık kaydı eklenirken görünür.',
};

const SLOTS: AdSlot[] = ['food_popup', 'water_popup', 'vet_health_record'];

type SlotFilter = '' | AdSlot;

export default function Advertisers() {
  const [items, setItems] = useState<Advertiser[]>([]);
  const [slot, setSlot] = useState<SlotFilter>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Advertiser | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Advertiser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ advertisers: Advertiser[] }>(
        `/admin/advertisers${slot ? `?slot=${slot}` : ''}`
      );
      setItems(data.advertisers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [slot]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(ad: Advertiser) {
    try {
      await api.patch(`/admin/advertisers/${ad.id}`, { active: !ad.active });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Güncellenemedi');
    }
  }

  return (
    <>
      <h1>Reklamlar</h1>
      <p className="page-hint">
        Markalar buradan girilir. Aynı yerleşimdeki markalar sırayla gösterilir — kullanıcı pop-up'ı
        her açtığında sıradaki markayı görür. Hedef bölgesi olan bir reklam yalnızca o çevrede
        bulunan kullanıcılara gösterilir; konumu bilinmeyen kullanıcı onu görmez.
      </p>

      <div className="toolbar">
        <select value={slot} onChange={(e) => setSlot(e.target.value as SlotFilter)}>
          <option value="">Tüm yerleşimler</option>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button className="primary" onClick={() => setEditing('new')}>
          + Reklam Ekle
        </button>
      </div>

      {slot && <p className="muted">{SLOT_HINTS[slot]}</p>}
      {error && <div className="error-banner">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Görsel</th>
              <th>Marka</th>
              <th>Yerleşim</th>
              <th>Sıra</th>
              <th>Gösterim</th>
              <th>Tık</th>
              <th>CTR</th>
              <th>Durum</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((ad) => (
              <tr key={ad.id}>
                <td>
                  {ad.image_url ? (
                    <img className="thumb" src={ad.image_url} alt="" />
                  ) : (
                    <div className="thumb" />
                  )}
                </td>
                <td>
                  <div>{ad.name}</div>
                  <div className="muted">{ad.headline}</div>
                  <a
                    className="mono"
                    href={ad.target_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11 }}
                  >
                    {ad.target_url}
                  </a>
                </td>
                <td>
                  <div>{ad.slots.map((s) => SLOT_LABELS[s]).join(', ')}</div>
                  <div className="muted">{targetLabel(ad)}</div>
                </td>
                <td className="num">{ad.sort_order}</td>
                <td className="num">{ad.impressions}</td>
                <td className="num">{ad.clicks}</td>
                <td className="num">{ctr(ad)}</td>
                <td>{statusTag(ad)}</td>
                <td className="actions">
                  <button className="small" onClick={() => setEditing(ad)}>
                    Düzenle
                  </button>
                  <button className="small" onClick={() => toggleActive(ad)}>
                    {ad.active ? 'Durdur' : 'Yayınla'}
                  </button>
                  <button className="small danger" onClick={() => setDeleting(ad)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && (
          <div className="empty">Henüz reklam yok. “Reklam Ekle” ile başlayın.</div>
        )}
        {loading && <div className="empty">Yükleniyor…</div>}
      </div>

      {editing && (
        <AdvertiserModal
          advertiser={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setError(null);
            load();
          }}
          onError={setError}
        />
      )}

      {deleting && (
        <Modal
          title="Reklamı sil"
          hint={deleting.name}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button onClick={() => setDeleting(null)}>Vazgeç</button>
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await api.del(`/admin/advertisers/${deleting.id}`);
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
            Geçmiş gösterim ve tık sayıları raporlardan düşer. Kampanyayı geçici olarak durdurmak
            istiyorsanız silmek yerine <strong>Durdur</strong>'u kullanın.
          </p>
        </Modal>
      )}
    </>
  );
}

function targetLabel(ad: Advertiser): string {
  if (ad.target_radius_m === null) return 'Tüm Türkiye';
  return `${formatKm(ad.target_radius_m)} km çevresi`;
}

/**
 * Metres as Turkish kilometres: 2500 -> "2,5", 1250 -> "1,25". Three
 * decimals because the radius is whole metres: the edit form is seeded from
 * this text and saves it back, so any rounding here would resize a shop's
 * circle on an edit that never touched it (QA finding).
 */
function formatKm(meters: number): string {
  return (meters / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

/**
 * "40.99030, 29.02900" — what Google Maps copies when you right-click a
 * place — into a point. Dots are the decimal mark here (a comma separates
 * the two numbers); anything else is null and the form says so.
 */
function parsePoint(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Kilometres as typed ("2,5" or "2.5") into whole metres, or null. */
function parseRadiusKm(text: string): number | null {
  const km = Number(text.trim().replace(',', '.'));
  if (!text.trim() || !Number.isFinite(km)) return null;
  const meters = Math.round(km * 1000);
  return meters >= 100 && meters <= 200000 ? meters : null;
}

function ctr(ad: Advertiser): string {
  if (!ad.impressions) return '—';
  return `%${((ad.clicks / ad.impressions) * 100).toFixed(1)}`;
}

function statusTag(ad: Advertiser) {
  if (!ad.active) return <span className="tag tag-user">Durduruldu</span>;
  const now = Date.now();
  if (ad.starts_at && new Date(ad.starts_at).getTime() > now) {
    return <span className="tag tag-vet">Başlamadı</span>;
  }
  if (ad.ends_at && new Date(ad.ends_at).getTime() < now) {
    return <span className="tag tag-suspended">Süresi doldu</span>;
  }
  return <span className="tag tag-admin">Yayında</span>;
}

function AdvertiserModal({
  advertiser,
  onClose,
  onSaved,
  onError,
}: {
  advertiser: Advertiser | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(advertiser?.name ?? '');
  const [slots, setSlots] = useState<AdSlot[]>(advertiser?.slots ?? ['food_popup']);
  const [headline, setHeadline] = useState(advertiser?.headline ?? '');
  const [body, setBody] = useState(advertiser?.body ?? '');
  const [targetUrl, setTargetUrl] = useState(advertiser?.target_url ?? 'https://');
  const [sortOrder, setSortOrder] = useState(String(advertiser?.sort_order ?? 0));
  const [startsAt, setStartsAt] = useState(toDateInput(advertiser?.starts_at));
  const [endsAt, setEndsAt] = useState(toDateInput(advertiser?.ends_at));
  const [targeted, setTargeted] = useState(advertiser?.target_radius_m != null);
  const [point, setPoint] = useState(
    advertiser?.target_lat != null && advertiser.target_lng != null
      ? `${advertiser.target_lat}, ${advertiser.target_lng}`
      : ''
  );
  const [radiusKm, setRadiusKm] = useState(
    advertiser?.target_radius_m != null ? formatKm(advertiser.target_radius_m) : '3'
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsedPoint = parsePoint(point);
  const fileRef = useRef<HTMLInputElement>(null);

  function toggleSlot(s: AdSlot, on: boolean) {
    // SLOTS' order, so the list reads the same however it was ticked.
    setSlots((current) => SLOTS.filter((x) => (x === s ? on : current.includes(x))));
  }

  async function save() {
    // The note under the checkboxes already says why.
    if (slots.length === 0) return;
    let target: AdTarget | null = null;
    if (targeted) {
      const radiusMeters = parseRadiusKm(radiusKm);
      if (!parsedPoint) {
        setFormError('Konumu "enlem, boylam" olarak girin, ör. 40.99030, 29.02900');
        return;
      }
      if (radiusMeters === null) {
        setFormError('Yarıçap 0,1 ile 200 km arasında olmalı');
        return;
      }
      target = { ...parsedPoint, radiusMeters };
    }
    setFormError(null);
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        slots,
        headline: headline.trim() || null,
        body: body.trim() || null,
        targetUrl: targetUrl.trim(),
        sortOrder: Number(sortOrder) || 0,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        target,
      };

      const saved = advertiser
        ? await api.patch<Advertiser>(`/admin/advertisers/${advertiser.id}`, payload)
        : await api.post<Advertiser>('/admin/advertisers', payload);

      const file = fileRef.current?.files?.[0];
      if (file) await uploadAdvertiserImage(saved.id, file);

      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kaydedilemedi');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={advertiser ? advertiser.name : 'Yeni reklam'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="primary" onClick={save} disabled={busy || slots.length === 0}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Marka adı</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pati Mama" />
      </label>

      <div className="field">
        <span>Yerleşim (birden fazla seçilebilir)</span>
        {SLOTS.map((s) => (
          <label key={s} className="check-row">
            <input
              type="checkbox"
              checked={slots.includes(s)}
              onChange={(e) => toggleSlot(s, e.target.checked)}
            />
            <div>
              <div>{SLOT_LABELS[s]}</div>
              <div className="muted check-hint">{SLOT_HINTS[s]}</div>
            </div>
          </label>
        ))}
        {slots.length === 0 && (
          <div className="error-banner field-error">En az bir yerleşim seçin</div>
        )}
      </div>

      <label className="field">
        <span>Başlık (bantta büyük yazı)</span>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Pati Mama"
          maxLength={120}
        />
      </label>

      <label className="field">
        <span>Açıklama (iki satıra kadar)</span>
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Sokak dostları için tam tahıllı mama"
          maxLength={200}
        />
      </label>

      <label className="field">
        <span>Hedef adres (tıklayınca açılır)</span>
        <input
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="https://..."
        />
      </label>

      <label className="field">
        <span>Görsel {advertiser?.image_url ? '(değiştirmek için seçin)' : ''}</span>
        <input type="file" accept="image/*" ref={fileRef} />
      </label>

      <label className="field">
        <span>Sıra (aynı yerleşimde küçük olan önce gösterilir)</span>
        <input
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          inputMode="numeric"
        />
      </label>

      <label className="field">
        <span>Hedef bölge</span>
        <select
          value={targeted ? 'point' : 'national'}
          onChange={(e) => {
            setTargeted(e.target.value === 'point');
            setFormError(null);
          }}
        >
          <option value="national">Tüm Türkiye</option>
          <option value="point">Bir noktanın çevresi (ör. dükkânın çevresi)</option>
        </select>
      </label>

      {targeted && (
        <>
          <label className="field">
            <span>Merkez (enlem, boylam — Google Haritalar'da yere sağ tıklayıp kopyalayın)</span>
            <input
              value={point}
              onChange={(e) => {
                setPoint(e.target.value);
                setFormError(null);
              }}
              placeholder="40.99030, 29.02900"
              inputMode="decimal"
            />
          </label>
          {parsedPoint && (
            <a
              className="field-link"
              href={`https://www.openstreetmap.org/?mlat=${parsedPoint.lat}&mlon=${parsedPoint.lng}#map=15/${parsedPoint.lat}/${parsedPoint.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Haritada kontrol et ↗
            </a>
          )}
          <label className="field">
            <span>Yarıçap (km)</span>
            <input
              value={radiusKm}
              onChange={(e) => {
                setRadiusKm(e.target.value);
                setFormError(null);
              }}
              inputMode="decimal"
            />
          </label>
          <p className="muted field-note">
            Yalnızca bu çevrede bulunan kullanıcılar görür: haritadaki konumu, hayvanın yeri ya da
            son 30 günde bıraktığı mama/su. Konumu bilinmeyen kullanıcıya gösterilmez.
          </p>
        </>
      )}

      {formError && <div className="error-banner field-error">{formError}</div>}

      <label className="field">
        <span>Başlangıç (boş = hemen)</span>
        <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>

      <label className="field">
        <span>Bitiş (boş = süresiz)</span>
        <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </label>

      {advertiser && (
        <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          {formatDate(advertiser.created_at)} tarihinde eklendi · {advertiser.impressions} gösterim
          · {advertiser.clicks} tık
        </p>
      )}
    </Modal>
  );
}

/** <input type="date"> expects yyyy-mm-dd; the server returns an ISO timestamp. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}
