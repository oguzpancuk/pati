import { useEffect, useRef, useState } from 'react';
import { Ad, AdSlot, fetchAd, recordAdClick, recordAdImpression } from '../api';

/**
 * One ad banner per placement (same rules as mobile's AdBanner): never
 * renders when no ad is live; the impression is reported only when it
 * actually reaches the screen.
 */
export function AdBanner({
  slot,
  visible = true,
  near = null,
}: {
  slot: AdSlot;
  visible?: boolean;
  /** Where the viewer is, for area-targeted ads (see fetchAd). */
  near?: { lat: number; lng: number } | null;
}) {
  const [ad, setAd] = useState<Ad | null>(null);
  const reported = useRef<number | null>(null);
  // Read when the banner opens, not watched: a location fix landing while
  // the sheet is up must not swap the brand under the user's eyes.
  const nearRef = useRef(near);
  nearRef.current = near;

  useEffect(() => {
    if (!visible) {
      setAd(null);
      reported.current = null;
      return;
    }
    let cancelled = false;
    fetchAd(slot, nearRef.current)
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
      {/* The "REKLAM" (ad) label is mandatory: content and ads must be distinguishable. */}
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
