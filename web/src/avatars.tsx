import { animalAvatarSvg } from '@shared/animalAvatarSvg';
import { patiAvatarSvg } from '@shared/avatarSvg';

/**
 * SVG string üreticilerinin React sarmalayıcıları. İçerik tamamen kendi
 * ürettiğimiz statik işaretleme olduğu için dangerouslySetInnerHTML güvenli:
 * kullanıcı girdisi HTML'e karışmıyor (tanınmayan avatar anahtarı null döner,
 * baş harfe düşülür).
 */
export function AnimalAvatar({
  species,
  breed,
  size = 40,
}: {
  species: 'cat' | 'dog';
  breed?: string | null;
  size?: number;
}) {
  return (
    <span
      className="round"
      dangerouslySetInnerHTML={{ __html: animalAvatarSvg(species, breed, size) }}
    />
  );
}

export function UserAvatar({
  avatarUrl,
  name,
  size = 40,
}: {
  avatarUrl: string | null | undefined;
  name?: string | null;
  size?: number;
}) {
  const svg = patiAvatarSvg(avatarUrl ?? null, size);
  if (svg) {
    return <span className="round" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  if (avatarUrl && !avatarUrl.startsWith('pati-avatar:')) {
    return (
      <span className="round" style={{ width: size, height: size, display: 'inline-block' }}>
        <img src={avatarUrl} alt="" width={size} height={size} style={{ objectFit: 'cover' }} />
      </span>
    );
  }
  const initial = (name || '?').trim().charAt(0).toLocaleUpperCase('tr-TR');
  return (
    <span
      className="round"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--brand-soft)',
        color: 'var(--brand-dark)',
        fontWeight: 800,
        fontSize: size * 0.42,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
