import { useEffect, useMemo, useState } from 'react';
import type { Badge, BadgeAward, UserLevel } from './api';
import {
  badgeGroup,
  badgeProgressText,
  badgeTitle,
  GROUP_DESCRIPTIONS,
  GROUP_LABELS,
  sortBadges,
  symbolForKey,
  TIER_LABELS,
  TIER_ORDER,
  TIER_POINTS,
  tierLadderText,
  withCatalogPlaceholders,
  type BadgeGroup,
  type BadgeSymbolName,
  type BadgeTier,
} from '@mobile/badges';
import { badgeSymbolSvg, levelMarkSvg } from '@shared/badgeSvg';

/**
 * Badge/level visuals and modals. The vocabulary and helpers come straight
 * from mobile (`@mobile/badges`, pure TS); the drawings from
 * `shared/badgeSvg.ts`. The SVG strings are static markup we generate —
 * dangerouslySetInnerHTML is safe (no user input mixed in).
 */

export function BadgeSymbol({
  symbol,
  tier,
  size = 44,
}: {
  symbol: BadgeSymbolName;
  tier: BadgeTier | null;
  size?: number;
}) {
  return (
    <span
      className="round"
      style={{ width: size, height: size, display: 'inline-block' }}
      dangerouslySetInnerHTML={{ __html: badgeSymbolSvg(symbol, tier, size) }}
    />
  );
}

export function LevelMark({ level, size = 44 }: { level: number; size?: number }) {
  // Colors are read from CSS variables so they fit the dark theme too.
  const [colors, setColors] = useState({
    brand: '#F47A4A',
    brandTint: '#FFF0E7',
    textOnBrand: '#FFFFFF',
  });
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    setColors({
      brand: read('--brand', '#F47A4A'),
      brandTint: read('--brand-tint', '#FFF0E7'),
      textOnBrand: read('--text-on-brand', '#FFFFFF'),
    });
  }, []);
  return (
    <span
      style={{ width: size, height: size, display: 'inline-block', lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: levelMarkSvg(level, size, colors) }}
    />
  );
}

/** Level bar: emblem + title + progress + "N more points for X". */
export function LevelBar({ level, points }: { level: UserLevel; points: number }) {
  const remaining =
    level.nextLevelPoints !== null ? Math.max(0, level.nextLevelPoints - points) : 0;
  // Handoff 3d: level card = title + "in N points: next title" + a 4px
  // gradient progress bar. The medallion and points live in the stat strip.
  return (
    <div className="levelbar">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 15 }}>{level.title}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {level.nextTitle ? `${remaining} puan sonra: ${level.nextTitle}` : 'En üst seviyedesin'}
        </span>
      </div>
      <div className="track" style={{ marginBottom: 2 }}>
        <div className="fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
      </div>
    </div>
  );
}

const GROUP_ORDER: BadgeGroup[] = ['streak', 'breed', 'count'];

/**
 * The badge catalog. Selection mode only on your own profile (the 3 badges
 * to feature); read-only on other people's profiles.
 */
export function BadgeCatalogModal({
  open,
  onClose,
  badges,
  selectable = false,
  featuredKeys = [],
  maxFeatured = 3,
  onSaveFeatured,
}: {
  open: boolean;
  onClose: () => void;
  badges: Badge[];
  selectable?: boolean;
  featuredKeys?: string[];
  maxFeatured?: number;
  onSaveFeatured?: (keys: string[]) => Promise<void> | void;
}) {
  const [selection, setSelection] = useState<string[]>(featuredKeys);
  const [saving, setSaving] = useState(false);
  const signature = featuredKeys.join('|');
  useEffect(() => {
    // Start from the current selection every time the modal opens.
    setSelection(signature ? signature.split('|') : []);
  }, [signature, open]);

  const grouped = useMemo(() => {
    const map: Record<BadgeGroup, Badge[]> = { streak: [], breed: [], count: [] };
    // The catalog shows every obtainable badge, so breed badges the server
    // didn't send (no progress yet) appear as locked placeholders.
    for (const b of withCatalogPlaceholders(badges)) map[badgeGroup(b)].push(b);
    for (const g of GROUP_ORDER) map[g] = sortBadges(map[g]);
    return map;
  }, [badges]);
  const earnedCount = badges.filter((b) => b.tier).length;

  if (!open) return null;

  function toggle(badge: Badge) {
    if (!selectable || !badge.tier) return;
    setSelection((prev) => {
      if (prev.includes(badge.key)) return prev.filter((k) => k !== badge.key);
      if (prev.length >= maxFeatured) return prev;
      return [...prev, badge.key];
    });
  }

  async function save() {
    if (!onSaveFeatured) return;
    setSaving(true);
    try {
      await onSaveFeatured(selection);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="backdrop" onClick={() => !saving && onClose()}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ textAlign: 'center' }}>Rozetler</h2>
        <p className="muted" style={{ textAlign: 'center' }}>
          {selectable
            ? `Profilinde gösterilecek en fazla ${maxFeatured} rozet seç (${selection.length}/${maxFeatured}).`
            : `${earnedCount} rozet kazanıldı. Kademeler: ${TIER_ORDER.map(
                (t) => `${TIER_LABELS[t]} ${TIER_POINTS[t]}p`
              ).join(' · ')}`}
        </p>
        {GROUP_ORDER.map((group) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <strong>{GROUP_LABELS[group]}</strong>
            <div className="muted" style={{ marginBottom: 6 }}>
              {GROUP_DESCRIPTIONS[group]}
            </div>
            {grouped[group].length === 0 ? (
              <div className="muted">Bu kategoride henüz bir rozet yolunda değilsin.</div>
            ) : (
              grouped[group].map((badge) => {
                const selected = selection.includes(badge.key);
                const disabled =
                  selectable && (!badge.tier || (!selected && selection.length >= maxFeatured));
                return (
                  <button
                    key={badge.key}
                    type="button"
                    className={`badge-row ${badge.tier ? '' : 'locked'} ${
                      selected ? 'selected' : ''
                    }`}
                    onClick={() => toggle(badge)}
                    disabled={!selectable || disabled}
                  >
                    <BadgeSymbol symbol={badge.symbol} tier={badge.tier} size={36} />
                    <span className="grow" style={{ textAlign: 'left' }}>
                      <strong style={{ display: 'block' }}>{badgeTitle(badge)}</strong>
                      <span className="muted">{badgeProgressText(badge)}</span>
                      {/* Every tier's threshold, so the whole ladder is
                          browsable before any of it is earned. */}
                      <span className="subtle" style={{ display: 'block', marginTop: 2 }}>
                        {tierLadderText(badge)}
                      </span>
                    </span>
                    {selected ? (
                      <span style={{ color: 'var(--brand)', fontWeight: 800 }}>✓</span>
                    ) : (
                      <span className="subtle">{badge.points}P</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ))}
        {selectable && onSaveFeatured ? (
          <>
            <button className="btn full" onClick={save} disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            <button className="btn ghost full" onClick={onClose} disabled={saving}>
              Vazgeç
            </button>
          </>
        ) : (
          <button className="btn full" onClick={onClose}>
            Kapat
          </button>
        )}
      </div>
    </div>
  );
}

function rankLine(award: BadgeAward): string {
  if (award.rankAfter === null) return 'Sıralama hesaplanıyor';
  if (award.rankBefore === null) return `${award.rankAfter}. sıradasın`;
  if (award.rankBefore === award.rankAfter) return `${award.rankAfter}. sırada kaldın`;
  const climbed = award.rankBefore - award.rankAfter;
  return climbed > 0
    ? `${award.rankBefore}. → ${award.rankAfter}. · ${climbed} sıra yükseldin`
    : `${award.rankBefore}. → ${award.rankAfter}.`;
}

/** The new-badge celebration. The queue lives in BadgeAwardProvider. */
export function BadgeAwardModal({
  award,
  remaining,
  onDismiss,
}: {
  award: BadgeAward | null;
  remaining: number;
  onDismiss: () => void;
}) {
  if (!award) return null;
  const leveledUp =
    award.levelBefore !== null && award.levelAfter !== null && award.levelAfter > award.levelBefore;
  const climbed =
    award.rankBefore !== null && award.rankAfter !== null && award.rankAfter < award.rankBefore;
  return (
    <div className="backdrop center" onClick={onDismiss}>
      <div className="sheet award" onClick={(e) => e.stopPropagation()}>
        <div className="subtle" style={{ color: 'var(--brand)', fontWeight: 800 }}>
          YENİ ROZET KAZANDIN!
        </div>
        <div style={{ margin: '12px 0' }}>
          <BadgeSymbol symbol={symbolForKey(award.badgeKey)} tier={award.tier} size={92} />
        </div>
        <h2 style={{ margin: 0 }}>
          {TIER_LABELS[award.tier]} {award.label}
        </h2>
        <strong style={{ color: 'var(--brand)' }}>+{award.pointsAwarded} puan</strong>
        {leveledUp && (
          <div className="tag warning" style={{ marginTop: 8 }}>
            Seviye atladın: {award.levelBefore} → {award.levelAfter}
          </div>
        )}
        <div className="row" style={{ marginTop: 14, width: '100%' }}>
          <div className="grow">
            <div className="micro" style={{ margin: 0 }}>
              sıralama
            </div>
            <strong style={{ color: climbed ? 'var(--success)' : 'inherit', fontSize: 13 }}>
              {rankLine(award)}
            </strong>
          </div>
          <div className="grow">
            <div className="micro" style={{ margin: 0 }}>
              toplam puan
            </div>
            <strong style={{ fontSize: 13 }}>
              {award.pointsBefore !== null && award.pointsBefore !== award.pointsAfter
                ? `${award.pointsBefore} → ${award.pointsAfter}`
                : `${award.pointsAfter ?? 0}`}
            </strong>
          </div>
        </div>
        <button className="btn full" style={{ marginTop: 16 }} onClick={onDismiss}>
          {remaining > 0 ? `Sıradaki rozet (${remaining})` : 'Harika!'}
        </button>
      </div>
    </div>
  );
}
