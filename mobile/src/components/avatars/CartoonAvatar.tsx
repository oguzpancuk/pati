import React from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { AvatarVariant, HairStyle } from '../../avatars';

/**
 * The built-in profile avatar. Drawn from a few parameters instead of 20
 * separate image files (see src/avatars.ts): background, skin, hair color,
 * hairstyle and details like glasses/beard.
 *
 * The drawing sits in a 64-unit square, face centered. Clipped by the
 * background circle so the shoulders don't spill outside.
 */
type Props = {
  variant: AvatarVariant;
  size?: number;
};

const CX = 32;
const FACE_CY = 29;
const FACE_RX = 14.5;
const FACE_RY = 16.5;

export default function CartoonAvatar({ variant, size = 44 }: Props) {
  const { bg, skin, hair, style, shirt } = variant;
  const clipId = `pati-avatar-clip-${variant.key}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={32} cy={32} r={32} />
        </ClipPath>
      </Defs>

      <G clipPath={`url(#${clipId})`}>
        <Rect x={0} y={0} width={64} height={64} fill={bg} />

        {/* The hair mass behind the head (long hair, ponytail, afro) draws before the face. */}
        {backHair(style, hair, shirt)}

        {/* Neck first, shoulders on top: the collar line cuts across the neck. */}
        <Rect x={27.5} y={38} width={9} height={12} rx={4.5} fill={skin} />
        <Path d="M10 64c0-9.4 9.8-15 22-15s22 5.6 22 15z" fill={shirt} />

        <Circle cx={CX - FACE_RX - 1.5} cy={FACE_CY + 3} r={3} fill={skin} />
        <Circle cx={CX + FACE_RX + 1.5} cy={FACE_CY + 3} r={3} fill={skin} />
        {variant.earrings && (
          <>
            <Circle cx={CX - FACE_RX - 1.5} cy={FACE_CY + 6.5} r={1.6} fill={shirt} />
            <Circle cx={CX + FACE_RX + 1.5} cy={FACE_CY + 6.5} r={1.6} fill={shirt} />
          </>
        )}

        <Ellipse cx={CX} cy={FACE_CY} rx={FACE_RX} ry={FACE_RY} fill={skin} />

        {variant.freckles && (
          <G fill="#00000022">
            <Circle cx={24.5} cy={33} r={0.9} />
            <Circle cx={27.5} cy={34.5} r={0.9} />
            <Circle cx={39.5} cy={33} r={0.9} />
            <Circle cx={36.5} cy={34.5} r={0.9} />
          </G>
        )}

        {/* Facial features: brows, eyes, nose, mouth. */}
        <G stroke="#3A2E27" strokeWidth={1.5} strokeLinecap="round" fill="none">
          <Path d="M22.5 24.5c1.6-1.2 3.8-1.2 5.4 0" />
          <Path d="M36.1 24.5c1.6-1.2 3.8-1.2 5.4 0" />
          <Path d="M31 31.5v3.2" />
          <Path d="M28 38.6c2.4 2 5.6 2 8 0" />
        </G>
        <Circle cx={25.6} cy={29} r={1.9} fill="#3A2E27" />
        <Circle cx={38.4} cy={29} r={1.9} fill="#3A2E27" />

        {variant.moustache && (
          <Path
            d="M27 36.4c2.4-1.6 7.6-1.6 10 0"
            stroke={hair}
            strokeWidth={2.6}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {variant.beard && (
          <Path
            d="M18.4 31c0 9.4 6 15.6 13.6 15.6S45.6 40.4 45.6 31c0 6-3 8.2-6 9.2-2.4.8-4.6.9-7.6.9s-5.2-.1-7.6-.9c-3-1-6-3.2-6-9.2Z"
            fill={hair}
          />
        )}

        {frontHair(style, hair, shirt)}

        {variant.glasses && (
          <G stroke="#3A2E27" strokeWidth={1.4} fill="none">
            <Circle cx={25.6} cy={29} r={4.6} />
            <Circle cx={38.4} cy={29} r={4.6} />
            <Path d="M30.2 29h3.6" />
            <Path d="M21 28.2 17.6 27M43 28.2l3.4-1.2" />
          </G>
        )}
      </G>
    </Svg>
  );
}

/**
 * The hair mass behind the face. The headscarf and beanie are fabric, not
 * hair, so they take `fabric` (a color matching the shirt) — drawn in hair
 * color they both looked like "a strange hairstyle".
 */
function backHair(style: HairStyle, hair: string, fabric: string): React.ReactNode {
  switch (style) {
    case 'long':
      return <Path d="M15 30c0-11 7.6-17 17-17s17 6 17 17v18H15z" fill={hair} />;
    case 'bob':
      return <Path d="M16 30c0-10 7-16 16-16s16 6 16 16v10H16z" fill={hair} />;
    case 'afro':
      return <Circle cx={32} cy={26} r={20} fill={hair} />;
    case 'ponytail':
      return (
        <>
          <Path d="M46 22c5 2 6.5 8 5 14s-5 8-7 7 1-4 1.6-8-1.6-8-2.6-10z" fill={hair} />
          <Circle cx={47} cy={22} r={4} fill={hair} />
        </>
      );
    case 'braids':
      return (
        <>
          <Rect x={13} y={26} width={6} height={20} rx={3} fill={hair} />
          <Rect x={45} y={26} width={6} height={20} rx={3} fill={hair} />
        </>
      );
    case 'bun':
      return <Circle cx={32} cy={9} r={6.5} fill={hair} />;
    case 'headscarf':
      // The scarf descends to the shoulders; the part framing the face draws in front.
      return <Path d="M13 32c0-12 8.6-19 19-19s19 7 19 19v20H13z" fill={fabric} />;
    default:
      return null;
  }
}

/** The hair visible at the forehead and crown (or headscarf/beanie). */
function frontHair(style: HairStyle, hair: string, fabric: string): React.ReactNode {
  switch (style) {
    case 'bald':
      return null;
    case 'buzz':
      return (
        <Path
          d="M18.6 27c0-8.4 6-13.4 13.4-13.4S45.4 18.6 45.4 27c-2-5.6-6.6-8.6-13.4-8.6S20.6 21.4 18.6 27Z"
          fill={hair}
        />
      );
    case 'short':
      return (
        <Path
          d="M17.6 28c0-9.6 6.4-15 14.4-15s14.4 5.4 14.4 15c-2.6-6.4-7.4-8.8-14.4-8.8S20.2 21.6 17.6 28Z"
          fill={hair}
        />
      );
    case 'quiff':
      // Side-swept fringe rising forward: it's the only detail separating
      // this silhouette from the others, so the peak is deliberately
      // exaggerated.
      return (
        <Path
          d="M17.6 29c0-10.4 6.6-16.4 14.4-16.4 4.6 0 8.4 2 10.8 5.6 1.6 2.4-.4 4-2.4 2.6-3.4-2.4-8.4-2.4-12.4.6-3.6 2.6-6.6 4.6-10.4 7.6Z"
          fill={hair}
        />
      );
    case 'sidePart':
      return (
        <Path
          d="M17.6 28c0-9.6 6.4-15 14.4-15s14.4 5.4 14.4 15c-1.4-5.4-4.6-8-9-9-4.4-1-9.6.6-12.8 3.6-2.8 2.6-5 4.6-7 5.4Z"
          fill={hair}
        />
      );
    case 'curly':
      return (
        <G fill={hair}>
          <Circle cx={21} cy={22} r={5.4} />
          <Circle cx={27} cy={17.4} r={6} />
          <Circle cx={34.5} cy={16.6} r={6.2} />
          <Circle cx={41.5} cy={20.4} r={5.6} />
          <Circle cx={44.5} cy={26} r={4.4} />
          <Circle cx={18.5} cy={27} r={4.4} />
        </G>
      );
    case 'afro':
      return null;
    case 'beanie':
      return (
        <>
          <Circle cx={32} cy={7.5} r={3.6} fill={fabric} />
          <Path d="M17.4 24c0-9 6.6-14.6 14.6-14.6S46.6 15 46.6 24z" fill={fabric} />
          {/* The folded brim: this band is what separates the beanie from bowl-cut hair. */}
          <Rect x={16} y={21.6} width={32} height={5} rx={2.5} fill={fabric} />
          <Rect x={16} y={21.6} width={32} height={5} rx={2.5} fill="#00000026" />
        </>
      );
    case 'headscarf':
      // The ring framing the face: the outer path descends from the head to
      // the chin, the inner path leaves the face open (a hole via evenodd).
      // What separates the scarf from a hairstyle is covering the forehead
      // entirely and passing under the chin.
      return (
        <>
          <Path
            d="M32 10c16 0 19 12 19 22s-5 18-19 18-19-8-19-18 3-22 19-22Z
               M32 20c10 0 13 6 13 13 0 8-6 13-13 13s-13-5-13-13c0-7 3-13 13-13Z"
            fill={fabric}
            fillRule="evenodd"
          />
          {/* The knot at the side. */}
          <Circle cx={15.5} cy={41} r={3.4} fill={fabric} />
        </>
      );
    case 'bun':
    case 'ponytail':
    case 'braids':
      return (
        <Path
          d="M17.6 27.5c0-9.6 6.4-15 14.4-15s14.4 5.4 14.4 15c-2.6-6.6-7.4-9.2-14.4-9.2s-11.8 2.6-14.4 9.2Z"
          fill={hair}
        />
      );
    case 'long':
    case 'bob':
      return (
        <Path
          d="M16.6 28.5c0-10.4 6.8-16 15.4-16s15.4 5.6 15.4 16c-2.8-7-8-9.8-15.4-9.8s-12.6 2.8-15.4 9.8Z"
          fill={hair}
        />
      );
    default:
      return null;
  }
}
