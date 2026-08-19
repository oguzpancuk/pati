import { UserAvatar } from 'pati-web';

/** Hazır karikatür avatarlar: kadın (f1–f10) ve erkek (m1–m10) anahtarları. */
export const HazirAvatarlar = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    {['f1', 'f2', 'f3', 'm1', 'm2', 'm3'].map((k) => (
      <UserAvatar key={k} avatarUrl={`pati-avatar:${k}`} name="Ayşe Yılmaz" size={48} />
    ))}
  </div>
);

/** Avatar yoksa baş harf. */
export const BasHarf = () => (
  <div style={{ display: 'flex', gap: 10 }}>
    <UserAvatar avatarUrl={null} name="Mehmet Kaya" size={48} />
    <UserAvatar avatarUrl={null} name="Zeynep" size={36} />
  </div>
);
