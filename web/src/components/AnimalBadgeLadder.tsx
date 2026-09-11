import {
  stepLadderText,
  stepNextText,
  stepProgressText,
  stepTierText,
  type AnimalBadgeStep,
} from '@mobile/animalBadges';
import { TIER_LABELS, TIER_ORDER } from '@mobile/badges';
import { BadgeSymbol } from '../badges';
// DESIGN §8 point 3: Escape and Back close the sheet, not the page.
import { useSheetDismiss } from './profile/Sheet';

/**
 * The animal's badge ladder (P7 item 3; mobile parity:
 * AnimalBadgeLadderModal). The human catalog's bronze→diamond ladder,
 * read-only — an animal earns its badges from what the neighbourhood
 * does. Every key is listed so the whole ladder is browsable before any
 * of it is earned, with the count, the distance to the next tier and the
 * thresholds.
 */
export function AnimalBadgeLadder({
  open,
  onClose,
  steps,
  focusKey,
  animalName,
}: {
  open: boolean;
  onClose: () => void;
  steps: AnimalBadgeStep[];
  /** The chip that opened the sheet; its row is highlighted. */
  focusKey?: string | null;
  animalName: string;
}) {
  // Above the early return: a hook cannot be called conditionally.
  const dismiss = useSheetDismiss(open, onClose);
  if (!open) return null;
  const earned = steps.filter((s) => s.tier).length;
  return (
    <div className="backdrop" onClick={dismiss}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rozetler">
        <h2 style={{ textAlign: 'center' }}>Rozetler</h2>
        <p className="muted" style={{ textAlign: 'center' }}>
          {`${animalName} ${earned} rozet kazandı. Kademeler: ${TIER_ORDER.map(
            (t) => TIER_LABELS[t]
          ).join(' · ')} — her biri sayıyla yükselir.`}
        </p>
        {steps.map((step) => {
          const next = stepNextText(step);
          return (
            <div
              key={step.key}
              className={`badge-row static ${step.tier ? '' : 'locked'} ${
                step.key === focusKey ? 'selected' : ''
              }`}
            >
              <BadgeSymbol symbol={step.symbol} tier={step.tier} size={36} />
              <span className="grow" style={{ textAlign: 'left' }}>
                <strong style={{ display: 'block' }}>{step.label}</strong>
                <span className="muted">
                  {stepTierText(step)} · {stepProgressText(step)}
                </span>
                {next && (
                  <span className="ladder-next" style={{ display: 'block' }}>
                    {next}
                  </span>
                )}
                {/* Every tier's threshold, so the whole ladder is browsable
                    before any of it is earned. */}
                <span className="subtle" style={{ display: 'block', marginTop: 2 }}>
                  {stepLadderText(step)}
                </span>
              </span>
            </div>
          );
        })}
        <button className="btn full" onClick={onClose}>
          Kapat
        </button>
      </div>
    </div>
  );
}
