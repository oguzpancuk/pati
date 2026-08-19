import { Wordmark } from 'pati-web';

/** Logo + "pati" yazısı; giriş/kayıt ekranlarının tepesi. Üç boyut. */
export const Boyutlar = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'flex-start' }}>
    <Wordmark size="sm" />
    <Wordmark size="md" />
    <Wordmark size="lg" />
  </div>
);

/** Sloganlı hâli ("birlikte bakıyoruz"). */
export const Sloganli = () => <Wordmark size="lg" tagline />;
