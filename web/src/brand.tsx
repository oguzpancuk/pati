import { useEffect, useState } from 'react';
import { logoSvg } from '@shared/logoSvg';

/** pati logosu (mobil Logo.tsx ile aynı çizim). Renkler CSS değişkenlerinden. */
export function Logo({ size = 64, color, accent }: { size?: number; color?: string; accent?: string }) {
  const [c, setC] = useState({ brand: '#F47A4A', bg: '#FFF3E7' });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setC({
      brand: cs.getPropertyValue('--brand').trim() || '#F47A4A',
      bg: cs.getPropertyValue('--background').trim() || '#FFF3E7',
    });
  }, []);
  return (
    <span
      style={{ display: 'inline-block', width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: logoSvg(size, color ?? c.brand, accent ?? c.bg) }}
    />
  );
}

const SIZES = { sm: { logo: 28, name: 22 }, md: { logo: 44, name: 32 }, lg: { logo: 72, name: 46 } } as const;

/** Logo + "pati" yazısı (mobil Wordmark ile aynı oranlar); giriş/kayıt tepesinde. */
export function Wordmark({ size = 'md', tagline = false }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean }) {
  const s = SIZES[size];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Logo size={s.logo} />
        <span style={{ fontSize: s.name, lineHeight: 1.2, fontWeight: 800, color: 'var(--brand)', letterSpacing: -0.5 }}>
          pati
        </span>
      </div>
      {tagline && (
        <div className="muted" style={{ marginTop: 4 }}>
          birlikte bakıyoruz
        </div>
      )}
    </div>
  );
}
