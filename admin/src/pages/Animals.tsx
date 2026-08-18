import { useState } from 'react';
import { AdminAnimal, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { animalTitle, formatDate, formatPoint, speciesLabel } from '../format';
import { useList } from '../useList';

type SpeciesFilter = '' | 'cat' | 'dog';

export default function Animals() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [species, setSpecies] = useState<SpeciesFilter>('');
  const [editing, setEditing] = useState<AdminAnimal | null>(null);
  const [merging, setMerging] = useState<AdminAnimal | null>(null);
  const [deleting, setDeleting] = useState<AdminAnimal | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (species) params.set('species', species);
  const qs = params.toString();

  const list = useList<AdminAnimal>(
    `/admin/animals${qs ? `?${qs}` : ''}`,
    (d: { animals: AdminAnimal[]; total: number }) => ({ items: d.animals, total: d.total }),
    [search, species]
  );

  function afterAction() {
    setEditing(null);
    setMerging(null);
    setDeleting(null);
    setActionError(null);
    list.reload();
  }

  return (
    <>
      <h1>Hayvanlar</h1>
      <p className="page-hint">
        Kayıtları düzenleyin, silin veya mükerrer kayıtları birleştirin. Birleştirme, kaynak
        kaydın fotoğraflarını, yorumlarını, sağlık kayıtlarını ve bakım verenlerini hedefe taşır.
      </p>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
        }}
      >
        <input
          placeholder="İsim veya cins ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={species} onChange={(e) => setSpecies(e.target.value as SpeciesFilter)}>
          <option value="">Tüm türler</option>
          <option value="cat">Kedi</option>
          <option value="dog">Köpek</option>
        </select>
        <button type="submit">Ara</button>
        {(search || species) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSearch('');
              setSpecies('');
            }}
          >
            Temizle
          </button>
        )}
      </form>

      {(list.error || actionError) && (
        <div className="error-banner">{list.error ?? actionError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Hayvan</th>
              <th>Tür / cins</th>
              <th>Foto</th>
              <th>Yorum</th>
              <th>Bakıcı</th>
              <th>Konum</th>
              <th>Ekleyen</th>
              <th>Eklendi</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((animal) => (
              <tr key={animal.id}>
                <td>
                  {animal.cover_photo_url ? (
                    <img className="thumb" src={animal.cover_photo_url} alt="" />
                  ) : (
                    <div className="thumb" />
                  )}
                </td>
                <td>
                  <div>{animalTitle(animal)}</div>
                  <div className="muted mono">#{animal.id}</div>
                </td>
                <td>
                  {speciesLabel(animal.species)}
                  {animal.breed && <div className="muted">{animal.breed}</div>}
                </td>
                <td className="num">{animal.photo_count}</td>
                <td className="num">{animal.comment_count}</td>
                <td className="num">{animal.carer_count}</td>
                <td className="num muted mono">{formatPoint(animal.location)}</td>
                <td>{animal.created_by_name}</td>
                <td className="num muted">{formatDate(animal.created_at)}</td>
                <td className="actions">
                  <button className="small" onClick={() => setEditing(animal)}>
                    Düzenle
                  </button>
                  <button className="small" onClick={() => setMerging(animal)}>
                    Birleştir
                  </button>
                  <button className="small danger" onClick={() => setDeleting(animal)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && <div className="empty">Hayvan yok.</div>}
        {list.loading && <div className="empty">Yükleniyor…</div>}
      </div>

      <Pager offset={list.offset} limit={list.limit} total={list.total} onChange={list.setOffset} />

      {editing && (
        <EditAnimalModal
          animal={editing}
          onClose={() => setEditing(null)}
          onSaved={afterAction}
          onError={setActionError}
        />
      )}
      {merging && (
        <MergeModal
          animal={merging}
          onClose={() => setMerging(null)}
          onMerged={afterAction}
          onError={setActionError}
        />
      )}
      {deleting && (
        <DeleteModal
          animal={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={afterAction}
          onError={setActionError}
        />
      )}
    </>
  );
}

function EditAnimalModal({
  animal,
  onClose,
  onSaved,
  onError,
}: {
  animal: AdminAnimal;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(animal.name ?? '');
  const [breed, setBreed] = useState(animal.breed ?? '');
  const [color, setColor] = useState(animal.color ?? '');
  const [markings, setMarkings] = useState(animal.markings ?? '');
  const [species, setSpecies] = useState(animal.species);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/admin/animals/${animal.id}`, {
        name: name.trim() || null,
        breed: breed.trim() || null,
        color: color.trim() || null,
        markings: markings.trim() || null,
        species,
      });
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
      title={animalTitle(animal)}
      hint={`#${animal.id}`}
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
        <span>İsim</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>Tür</span>
        <select value={species} onChange={(e) => setSpecies(e.target.value as 'cat' | 'dog')}>
          <option value="cat">Kedi</option>
          <option value="dog">Köpek</option>
        </select>
      </label>
      <label className="field">
        <span>Tür / Desen</span>
        <input value={breed} onChange={(e) => setBreed(e.target.value)} />
      </label>
      <label className="field">
        <span>Renk</span>
        <input value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label className="field">
        <span>Ayırt edici işaretler</span>
        <textarea rows={3} value={markings} onChange={(e) => setMarkings(e.target.value)} />
      </label>
    </Modal>
  );
}

function MergeModal({
  animal,
  onClose,
  onMerged,
  onError,
}: {
  animal: AdminAnimal;
  onClose: () => void;
  onMerged: () => void;
  onError: (m: string) => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);

  async function merge() {
    const id = Number(sourceId);
    if (!Number.isInteger(id) || id <= 0) {
      onError('Geçerli bir hayvan numarası girin');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/admin/animals/${animal.id}/merge`, { sourceId: id });
      onMerged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Birleştirilemedi');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Mükerrer kaydı birleştir"
      hint={`Hedef: ${animalTitle(animal)} (#${animal.id})`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="primary" onClick={merge} disabled={busy}>
            {busy ? 'Birleştiriliyor…' : 'Birleştir'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Silinecek (kaynak) hayvanın numarası</span>
        <input
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          placeholder="örn. 42"
          inputMode="numeric"
        />
      </label>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 14 }}>
        Kaynak kaydın fotoğrafları, yorumları, sağlık kayıtları ve bakım verenleri
        <strong> #{animal.id}</strong> numaralı kayda taşınır, ardından kaynak kayıt silinir.
        Bu işlem geri alınamaz.
      </p>
    </Modal>
  );
}

function DeleteModal({
  animal,
  onClose,
  onDeleted,
  onError,
}: {
  animal: AdminAnimal;
  onClose: () => void;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/animals/${animal.id}`);
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Silinemedi');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Hayvan kaydını sil"
      hint={`${animalTitle(animal)} (#${animal.id})`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="danger" onClick={remove} disabled={busy}>
            {busy ? 'Siliniyor…' : 'Kalıcı olarak sil'}
          </button>
        </>
      }
    >
      <p style={{ marginBottom: 0 }}>
        Bu kaydın {animal.photo_count} fotoğrafı, {animal.comment_count} yorumu ve tüm sağlık
        kayıtları da silinecek. Mükerrer bir kayıtsa silmek yerine <strong>birleştirmeyi</strong>{' '}
        tercih edin — birleştirme veriyi korur.
      </p>
    </Modal>
  );
}
