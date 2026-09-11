import { useState } from 'react';
import { Link } from 'react-router-dom';
import { searchUsers, UserSummary } from '../api';
import { UserAvatar } from '../avatars';
import { PageHeader } from '../components/PageHeader';

export default function FindFriendsPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(text: string) {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      setResults(await searchUsers(text.trim()));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <PageHeader title="arkadaş bul" fallback="/profil" />
      <label className="field">
        <input
          placeholder="İsimle ara…"
          value={query}
          onChange={(e) => search(e.target.value)}
          autoFocus
          autoCorrect="off"
        />
      </label>
      {loading && <p className="muted">Aranıyor…</p>}
      {!loading && query.trim() && results.length === 0 && (
        <div className="card flat">
          <strong>Kimseyi bulamadık</strong>
          <div className="muted">Farklı bir isim dene.</div>
        </div>
      )}
      {results.map((u) => (
        <Link
          key={u.id}
          to={`/kullanici/${u.id}`}
          className="card flat row"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <UserAvatar avatarUrl={u.avatar_url} name={u.name} size={40} />
          <div className="name-with-chip grow">
            <strong>{u.name}</strong>
            {u.is_demo && <span className="demo-chip">demo</span>}
          </div>
          <span className="subtle">›</span>
        </Link>
      ))}
    </div>
  );
}
