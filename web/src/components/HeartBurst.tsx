/**
 * Hearts drifting up from a point and fading out (the CSS-animated
 * counterpart of mobile's HeartBurst). The "thank you" of the animals within
 * range when food/water is left. Position and duration live in CSS
 * (`.hearts`, `.heart`); MapPage places the box at the marker's screen point
 * and removes it after HEART_BURST_MS.
 */
export const HEART_BURST_MS = 1500;

const SPREAD = [-14, 8, -4, 14, 2];
const SCALES = [1, 0.8, 1.15, 0.85, 0.95];

export function HeartBurst({ x, y }: { x: number; y: number }) {
  return (
    <div className="hearts" style={{ left: x, top: y }}>
      {SPREAD.map((dx, i) => (
        <svg
          key={i}
          className="heart"
          viewBox="0 0 24 24"
          style={
            {
              '--dx': `${dx}px`,
              '--s': SCALES[i],
              animationDelay: `${i * 110}ms`,
            } as React.CSSProperties
          }
        >
          <path
            d="M12 20.2S4.4 15.3 4.4 10.5A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.6 2.8c0 4.8-7.6 9.7-7.6 9.7Z"
            fill="var(--brand)"
          />
        </svg>
      ))}
    </div>
  );
}
