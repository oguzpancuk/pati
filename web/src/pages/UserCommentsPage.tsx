import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchUserComments, UserComment } from '../api';
import { AnimalAvatar } from '../avatars';
import { LoadMoreButton } from '../components/LoadMoreButton';
import { mergeById } from '@mobile/paging';

const PAGE = 30;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Bir kullanıcının tüm yorumları; :id yoksa kendi yorumlarımız. */
export default function UserCommentsPage() {
  const { id } = useParams();
  const userId: number | 'me' = id ? Number(id) : 'me';
  const navigate = useNavigate();
  const [comments, setComments] = useState<UserComment[]>([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const data = await fetchUserComments(userId, PAGE, offset);
        setTotal(data.total);
        setName(data.user.name);
        setComments((prev) => (offset === 0 ? data.comments : mergeById(prev, data.comments)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Yüklenemedi');
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  return (
    <div className="page">
      <button className="link" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
        ‹ Geri
      </button>
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{userId === 'me' ? 'Yorumlarım' : `${name ?? ''} · Yorumlar`}</h1>
      {total > 0 && <div className="label">TOPLAM {total} YORUM</div>}
      {error && <div className="error">{error}</div>}
      {!loading && comments.length === 0 && (
        <div className="card flat">
          <span className="muted">Henüz yorum yok.</span>
        </div>
      )}
      {comments.map((c) => (
        <Link key={c.id} to={`/hayvanlar/${c.animal_id}`} className="card flat row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
          <AnimalAvatar species={c.animal_species} breed={c.animal_breed} size={40} />
          <div className="grow">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{c.animal_name ?? (c.animal_species === 'cat' ? 'Kedi' : 'Köpek')}</strong>
              <span className="subtle">{formatDate(c.created_at)}</span>
            </div>
            {c.health_record_id && <span className="tag warning" style={{ marginBottom: 4 }}>Sağlık kaydına yorum</span>}
            <div style={{ fontSize: 14 }}>{c.body}</div>
          </div>
        </Link>
      ))}
      <LoadMoreButton remaining={total - comments.length} loading={loading} onClick={() => load(comments.length)} />
    </div>
  );
}
