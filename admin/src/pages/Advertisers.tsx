import { useCallback, useEffect, useRef, useState } from 'react';
import { AdSlot, Advertiser, api, uploadAdvertiserImage } from '../api';
import Modal from '../components/Modal';
import { formatDate } from '../format';

const SLOT_LABELS: Record<AdSlot, string> = {
  food_popup: 'Mama pop-up',
  water_popup: 'Su pop-up',
  vet_health_record: 'Sağlık kaydı (veteriner)',
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
        her açtığında sıradaki markayı görür.
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
                <td>{SLOT_LABELS[ad.slot]}</td>
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
  const [slot, setSlot] = useState<AdSlot>(advertiser?.slot ?? 'food_popup');
  const [headline, setHeadline] = useState(advertiser?.headline ?? '');
  const [body, setBody] = useState(advertiser?.body ?? '');
  const [targetUrl, setTargetUrl] = useState(advertiser?.target_url ?? 'https://');
  const [sortOrder, setSortOrder] = useState(String(advertiser?.sort_order ?? 0));
  const [startsAt, setStartsAt] = useState(toDateInput(advertiser?.starts_at));
  const [endsAt, setEndsAt] = useState(toDateInput(advertiser?.ends_at));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        slot,
        headline: headline.trim() || null,
        body: body.trim() || null,
        targetUrl: targetUrl.trim(),
        sortOrder: Number(sortOrder) || 0,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
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
      hint={SLOT_HINTS[slot]}
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
      <label className="field">
        <span>Marka adı</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pati Mama" />
      </label>

      <label className="field">
        <span>Yerleşim</span>
        <select value={slot} onChange={(e) => setSlot(e.target.value as AdSlot)}>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

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

/** <input type="date"> yyyy-mm-dd bekliyor; sunucu ISO zaman damgası döndürüyor. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}
