import { useEffect, useState } from 'react';
import { api, DashboardStats } from '../api';
import { speciesLabel } from '../format';

const SERIES = [
  { key: 'food' as const, label: 'Mama', color: 'var(--moss)' },
  { key: 'water' as const, label: 'Su', color: '#4a90c4' },
  { key: 'comments' as const, label: 'Yorum', color: 'var(--amber)' },
  { key: 'animals' as const, label: 'Yeni hayvan', color: 'var(--clay)' },
];

// Sağlık kaydı artık yalnızca iki tip; aşı ayrı tabloda sayılıyor.
const RECORD_TYPE_LABELS: Record<string, string> = {
  illness: 'Hastalık',
  injury: 'Yaralanma',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardStats>('/admin/stats')
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return <p className="muted">Yükleniyor…</p>;

  const t = stats.totals;
  // Tüm serileri aynı ölçekte göstermek için günlük toplamların en büyüğünü alıyoruz;
  // her seriyi kendi ölçeğinde çizmek günler arası karşılaştırmayı bozardı.
  const maxDay = Math.max(1, ...stats.daily.map((d) => d.food + d.water + d.comments + d.animals));

  return (
    <>
      <h1>Gösterge Paneli</h1>
      <p className="page-hint">Uygulamanın genel durumu ve son 30 günlük aktivite.</p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Kullanıcı</div>
          <div className="stat-value">{t.users}</div>
          <div className="stat-sub">son 7 günde +{t.new_users_7d}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Askıya alınan</div>
          <div className="stat-value">{t.suspended_users}</div>
          <div className="stat-sub">hesap</div>
        </div>
        <div className="stat">
          <div className="stat-label">Hayvan</div>
          <div className="stat-value">{t.animals}</div>
          <div className="stat-sub">
            {stats.species.map((s) => `${speciesLabel(s.species)} ${s.count}`).join(' · ') || '—'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Bakım kaydı</div>
          <div className="stat-value">{t.care_actions}</div>
          <div className="stat-sub">son 24 saatte {t.care_actions_24h}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Yorum</div>
          <div className="stat-value">{t.comments}</div>
          <div className="stat-sub">hayvan profillerinde</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sağlık kaydı</div>
          <div className="stat-value">{t.health_records}</div>
          <div className="stat-sub">{t.recovered_records} tanesi iyileşti</div>
        </div>
        <div className="stat">
          <div className="stat-label">Aşı kaydı</div>
          <div className="stat-value">{t.vaccinations}</div>
          <div className="stat-sub">{t.vet_verified_vaccinations} veteriner onaylı</div>
        </div>
      </div>

      <div className="card">
        <h2>Son 30 gün</h2>
        <div className="chart">
          {stats.daily.map((day) => (
            <div className="chart-col" key={day.day} title={dayTooltip(day)}>
              {SERIES.map((s) => {
                const value = day[s.key];
                if (!value) return null;
                return (
                  <div
                    key={s.key}
                    className="chart-bar"
                    style={{
                      height: `${(value / maxDay) * 120}px`,
                      background: s.color,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="chart-legend">
          {SERIES.map((s) => (
            <span key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="two-col">
        {stats.healthRecordTypes.length > 0 && (
          <div className="card">
            <h2>Sağlık kaydı türleri</h2>
            <div className="table-wrap">
              <table style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Tür</th>
                    <th>Adet</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.healthRecordTypes.map((r) => (
                    <tr key={r.record_type}>
                      <td>{RECORD_TYPE_LABELS[r.record_type] ?? r.record_type}</td>
                      <td className="num">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {stats.vaccineTypes.length > 0 && (
          <div className="card">
            <h2>Aşı türleri</h2>
            <div className="table-wrap">
              <table style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Aşı</th>
                    <th>Adet</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.vaccineTypes.map((r) => (
                    <tr key={r.vaccine_type}>
                      <td>{r.vaccine_type}</td>
                      <td className="num">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function dayTooltip(day: DashboardStats['daily'][number]) {
  const date = new Date(day.day).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  return `${date}\nMama ${day.food} · Su ${day.water} · Yorum ${day.comments} · Yeni hayvan ${day.animals}`;
}
