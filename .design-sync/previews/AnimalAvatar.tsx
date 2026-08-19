import { AnimalAvatar } from 'pati-web';

/** Sokak kedisi desenleri (taxonomy.ts ile birebir). */
export const Kediler = () => (
  <div style={{ display: 'flex', gap: 10 }}>
    {['Tekir', 'Sarman', 'Siyah', 'Üç renk (calico)', 'Smokin', 'Diğer'].map((b) => (
      <AnimalAvatar key={b} species="cat" breed={b} size={48} />
    ))}
  </div>
);

/** Sokak köpeği tipleri. */
export const Kopekler = () => (
  <div style={{ display: 'flex', gap: 10 }}>
    {['Kangal melezi', 'Akbaş melezi', 'Sokak melezi (orta boy)', 'Kısa bacaklı melez', 'Av/Terrier melezi', 'Diğer'].map((b) => (
      <AnimalAvatar key={b} species="dog" breed={b} size={48} />
    ))}
  </div>
);

/** Boyutlar: liste (36), kart (48), profil (96). */
export const Boyutlar = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <AnimalAvatar species="cat" breed="Tekir" size={36} />
    <AnimalAvatar species="cat" breed="Tekir" size={48} />
    <AnimalAvatar species="cat" breed="Tekir" size={96} />
  </div>
);
