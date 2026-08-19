import { Logo } from 'pati-web';

/** pati logosu: dört parmak yastığı + kalpli harita-pini. Zeminde turuncu. */
export const Boyutlar = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <Logo size={24} />
    <Logo size={44} />
    <Logo size={72} />
  </div>
);

/** Turuncu zeminde beyaz (uygulama ikonu / dolu düğmeler). */
export const TuruncuZeminde = () => (
  <div style={{ background: 'var(--brand)', padding: 16, borderRadius: 16, display: 'inline-block' }}>
    <Logo size={64} color="#fff" accent="var(--brand)" />
  </div>
);
