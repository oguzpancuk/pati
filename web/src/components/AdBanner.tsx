import { useEffect, useRef, useState } from 'react';
import { Ad, AdSlot, fetchAd, recordAdClick, recordAdImpression } from '../api';

/**
 * Yerleşime göre tek reklam bandı (mobil AdBanner ile aynı kurallar): yayında
 * reklam yoksa hiç çizilmez; gösterim gerçekten ekrana gelince bildirilir.
 */
export function AdBanner({ slot, visible = true }: { slot: AdSlot; visible?: boolean }) {
  const [ad, setAd] = useState<Ad | null>(null);
  const reported = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      setAd(null);
      reported.current = null;
      return;
    }
    let cancelled = false;
    fetchAd(slot)
      .then((next) => {
        if (cancelled || !next) return;
        setAd(next);
        if (reported.current !== next.id) {
          reported.current = next.id;
          recordAdImpression(next.id).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slot, visible]);

  if (!ad) return null;
  return (
    <a
      className="ad"
      href={ad.target_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordAdClick(ad.id).catch(() => {})}
    >
      {/* "REKLAM" etiketi zorunlu: içerik ile reklam ayırt edilebilmeli. */}
      <span className="subtle" style={{ letterSpacing: '0.08em' }}>
        reklam
      </span>
      <span className="row">
        {ad.image_url ? (
          <img src={ad.image_url} alt="" />
        ) : (
          <span className="ad-placeholder">{ad.name.charAt(0).toLocaleUpperCase('tr-TR')}</span>
        )}
        <span className="grow">
          <strong style={{ display: 'block' }}>{ad.headline ?? ad.name}</strong>
          {ad.body && <span className="muted">{ad.body}</span>}
        </span>
        <span className="subtle">›</span>
      </span>
    </a>
  );
}
