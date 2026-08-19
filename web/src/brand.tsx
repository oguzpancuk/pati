import { logoSvg } from '@shared/logoSvg';

/**
 * pati logosu (stüdyo estetiği). Dolgu degrade, kalp boşluğu zeminin rengi —
 * SVG doğrudan CSS değişkeni okuduğu için tema değişince kendiliğinden uyar.
 */
export function Logo({
  size = 64,
  color,
  accent,
}: {
  size?: number;
  color?: string;
  accent?: string;
}) {
  return (
    <span
      style={{ display: 'inline-block', width: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: logoSvg(size, color, accent) }}
    />
  );
}

const SIZES = {
  sm: { logo: 40, name: 18 },
  md: { logo: 72, name: 30 },
  lg: { logo: 118, name: 44 },
} as const;

/**
 * Logo + "pati" kelime işareti: logo üstte, yazı hemen altında hafif bindirme
 * ile (handoff: −8px). 600 ağırlık, .14em harf aralığı, kömür renk; slogan yok.
 */
export function Wordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = SIZES[size];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Logo size={s.logo} />
      <span
        style={{
          marginTop: -8,
          fontSize: s.name,
          lineHeight: 1.2,
          fontWeight: 600,
          color: 'var(--text)',
          letterSpacing: '0.14em',
        }}
      >
        pati
      </span>
    </div>
  );
}
