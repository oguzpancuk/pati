import React from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

/**
 * Hayvanın tür/desenine göre çizilen karikatür avatar. Sözlükteki 5+1 kedi ve
 * 5+1 köpek çeşidinin her birinin kendi yüzü var; "Diğer" (listede olmayan
 * serbest metin) türe göre nötr bir yüze düşüyor.
 *
 * Fotoğraf yerine bunun kullanılmasının nedeni tutarlılık: sokak fotoğrafları
 * karanlık, bulanık ve kadraj dışı olabiliyor; küçük yuvarlak içinde çoğu
 * zaman ne olduğu seçilemiyordu. Fotoğraflar profildeki galeride duruyor,
 * hayvanın "yüzü" ise haritada ve listelerde her zaman aynı çizim.
 *
 * Desen adları `taxonomy.ts` içindeki listelerle birebir aynı olmalı —
 * listeye çeşit eklenirse buraya da yüzü eklenmeli.
 */
type Props = {
  species: 'cat' | 'dog';
  breed?: string | null;
  size?: number;
};

const INK = '#3A2E27';
const BG = {
  peach: '#FCE3D6',
  mint: '#D7EEE2',
  sky: '#D9E8F5',
  lilac: '#E5DDF2',
  sand: '#F3E7C9',
};

type CatVariant = {
  bg: string;
  fur: string;
  mark?: string;
  mark2?: string;
  muzzle: string;
  eye: string;
  kind: 'tabby' | 'solid' | 'calico' | 'tuxedo';
};

type DogVariant = {
  bg: string;
  fur: string;
  ears: string;
  muzzle: string;
  kind: 'mask' | 'plain' | 'floppy' | 'long' | 'beard';
};

const CAT_VARIANTS: Record<string, CatVariant> = {
  Tekir: {
    bg: BG.mint,
    fur: '#B9AC9B',
    mark: '#7E7263',
    muzzle: '#E8DFD2',
    eye: '#4C7A43',
    kind: 'tabby',
  },
  Sarman: {
    bg: BG.sky,
    fur: '#E8A75E',
    mark: '#C77F35',
    muzzle: '#F7E1C4',
    eye: '#7A5A1E',
    kind: 'tabby',
  },
  Siyah: { bg: BG.peach, fur: '#3B3733', muzzle: '#4E4944', eye: '#C9A227', kind: 'solid' },
  'Üç renk (calico)': {
    bg: BG.lilac,
    fur: '#F3EDE4',
    mark: '#E8A75E',
    mark2: '#3B3733',
    muzzle: '#F3EDE4',
    eye: '#4C7A43',
    kind: 'calico',
  },
  Smokin: { bg: BG.sand, fur: '#3B3733', muzzle: '#F3EDE4', eye: '#4C7A43', kind: 'tuxedo' },
};
const CAT_OTHER: CatVariant = {
  bg: BG.mint,
  fur: '#CFC4B4',
  muzzle: '#EFE8DC',
  eye: '#5A7A8C',
  kind: 'solid',
};

const DOG_VARIANTS: Record<string, DogVariant> = {
  'Kangal melezi': {
    bg: BG.sand,
    fur: '#D9B98C',
    ears: '#8C6A44',
    muzzle: '#6B5138',
    kind: 'mask',
  },
  'Akbaş melezi': { bg: BG.sky, fur: '#F0EAE0', ears: '#D8CDBB', muzzle: '#E3D9C9', kind: 'plain' },
  'Sokak melezi (orta boy)': {
    bg: BG.peach,
    fur: '#A9793F',
    ears: '#7E5A2E',
    muzzle: '#E3C79B',
    kind: 'floppy',
  },
  'Kısa bacaklı melez': {
    bg: BG.mint,
    fur: '#8C5A3C',
    ears: '#5E3A24',
    muzzle: '#E3C79B',
    kind: 'long',
  },
  'Av/Terrier melezi': {
    bg: BG.lilac,
    fur: '#B79B6B',
    ears: '#8C6F44',
    muzzle: '#D9C39A',
    kind: 'beard',
  },
};
const DOG_OTHER: DogVariant = {
  bg: BG.sand,
  fur: '#9A9A8E',
  ears: '#6E6E64',
  muzzle: '#C9C9BC',
  kind: 'plain',
};

let clipCounter = 0;

export default function AnimalPatternAvatar({ species, breed, size = 36 }: Props) {
  // Aynı ekranda onlarca marker olabildiği için clip id'leri çakışmamalı.
  const clipId = React.useRef(`pati-animal-clip-${(clipCounter += 1)}`).current;
  const variant =
    species === 'cat'
      ? (CAT_VARIANTS[breed ?? ''] ?? CAT_OTHER)
      : (DOG_VARIANTS[breed ?? ''] ?? DOG_OTHER);

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={32} cy={32} r={32} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect width={64} height={64} fill={variant.bg} />
        {species === 'cat' ? (
          <CatFace v={variant as CatVariant} />
        ) : (
          <DogFace v={variant as DogVariant} />
        )}
      </G>
    </Svg>
  );
}

function CatFace({ v }: { v: CatVariant }) {
  const mark2 = v.mark2 ?? v.mark;
  return (
    <>
      {/* Kulaklar başın arkasında; iç kulak pembesi kediyi köpekten ayıran
          en okunur işaret. */}
      <Path d="M15 24 L18 8 L30 17 Z" fill={v.fur} />
      <Path d="M49 24 L46 8 L34 17 Z" fill={v.fur} />
      <Path d="M18.6 20.2 L20 11.8 L26.6 16.8 Z" fill="#E8A0A0" />
      <Path d="M45.4 20.2 L44 11.8 L37.4 16.8 Z" fill="#E8A0A0" />
      <Path
        d="M32 12.5c12.5 0 19.5 8.5 19.5 18.5 0 11.5-8.5 19-19.5 19s-19.5-7.5-19.5-19c0-10 7-18.5 19.5-18.5Z"
        fill={v.fur}
      />

      {v.kind === 'tabby' && (
        <G stroke={v.mark} strokeWidth={2.4} strokeLinecap="round" fill="none">
          <Path d="M32 13.4v6.2" />
          <Path d="M26.6 14.6l1.6 5.4" />
          <Path d="M37.4 14.6l-1.6 5.4" />
          <Path d="M13.6 29.5l5.6 1.6" />
          <Path d="M50.4 29.5l-5.6 1.6" />
        </G>
      )}
      {v.kind === 'calico' && (
        <>
          <Path d="M16 22c2-6 6.5-9.5 12-10.5 1 4-1 9-5 11.5-3 1.8-5.6 1.4-7-1Z" fill={v.mark} />
          <Path
            d="M39 13.2c5.5 1.6 9.5 5.6 11.4 10.6-2.4 2.6-6.6 2.8-9.6.6-3-2.4-3.6-7.4-1.8-11.2Z"
            fill={mark2}
          />
        </>
      )}
      {v.kind === 'tuxedo' ? (
        <Path
          d="M32 30c5.5 0 9.5 4.2 9.5 9.5 0 6.5-4.5 10-9.5 10s-9.5-3.5-9.5-10c0-5.3 4-9.5 9.5-9.5Z"
          fill={v.muzzle}
        />
      ) : (
        <Ellipse cx={32} cy={38.5} rx={8.6} ry={6.6} fill={v.muzzle} />
      )}

      <Ellipse cx={24.6} cy={30.2} rx={2.5} ry={3.1} fill={v.eye} />
      <Ellipse cx={39.4} cy={30.2} rx={2.5} ry={3.1} fill={v.eye} />
      <Circle cx={25.3} cy={29.2} r={0.8} fill="#fff" />
      <Circle cx={40.1} cy={29.2} r={0.8} fill="#fff" />

      <Path d="M30.2 36.2h3.6L32 38.8Z" fill="#D97878" />
      <Path
        d="M32 38.8v1.8M32 40.6c-.6 1.4-2.2 2-3.6 1.4M32 40.6c.6 1.4 2.2 2 3.6 1.4"
        stroke={INK}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <G stroke={INK} strokeWidth={1.1} strokeLinecap="round" opacity={0.75}>
        <Path d="M22.5 37.5 15 36.2" />
        <Path d="M22.8 39.8 15.6 40.4" />
        <Path d="M41.5 37.5 49 36.2" />
        <Path d="M41.2 39.8 48.4 40.4" />
      </G>
    </>
  );
}

function DogFace({ v }: { v: DogVariant }) {
  return (
    <>
      {v.kind === 'beard' ? (
        <>
          {/* Dik terrier kulakları */}
          <Path d="M17 25 L19 9 L29 16 Z" fill={v.ears} />
          <Path d="M47 25 L45 9 L35 16 Z" fill={v.ears} />
        </>
      ) : (
        <>
          {/* Düşük kulaklar başın yanında */}
          <Path
            d="M14.5 22c-2.6 4-3.4 10.5-1.6 16.5 1.4 4.6 5.4 6.6 8.6 4.6 2.6-1.6 3.4-5.6 2.4-10.5-1-5-4.6-9.4-9.4-10.6Z"
            fill={v.ears}
          />
          <Path
            d="M49.5 22c2.6 4 3.4 10.5 1.6 16.5-1.4 4.6-5.4 6.6-8.6 4.6-2.6-1.6-3.4-5.6-2.4-10.5 1-5 4.6-9.4 9.4-10.6Z"
            fill={v.ears}
          />
        </>
      )}
      {/* Kısa bacaklı melezde baş hafif uzun: gövde görünmediği için tipin
          tek okunur izi bu. */}
      <Ellipse cx={32} cy={31.5} rx={17.5} ry={v.kind === 'long' ? 20.5 : 19} fill={v.fur} />

      <Ellipse
        cx={32}
        cy={40}
        rx={v.kind === 'mask' ? 10.6 : 10}
        ry={v.kind === 'mask' ? 8.8 : 8.2}
        fill={v.muzzle}
      />
      {v.kind === 'beard' && (
        <Path
          d="M26 44c0 4 2.4 6.8 6 6.8s6-2.8 6-6.8c-2 1.6-4 2.2-6 2.2s-4-.6-6-2.2Z"
          fill={v.muzzle}
        />
      )}

      <Circle cx={25} cy={28.5} r={2.4} fill={INK} />
      <Circle cx={39} cy={28.5} r={2.4} fill={INK} />
      <Circle cx={25.7} cy={27.7} r={0.8} fill="#fff" />
      <Circle cx={39.7} cy={27.7} r={0.8} fill="#fff" />
      <G stroke={INK} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} fill="none">
        <Path d="M22.4 24.2c1.6-1 3.6-1 5.2 0" />
        <Path d="M36.4 24.2c1.6-1 3.6-1 5.2 0" />
      </G>

      <Ellipse cx={32} cy={37.6} rx={3.2} ry={2.4} fill={INK} />
      <Path
        d="M32 39.6v2M32 41.6c-.8 1.6-2.6 2.2-4.2 1.6M32 41.6c.8 1.6 2.6 2.2 4.2 1.6"
        stroke={INK}
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M29.8 44.6c0 2 .9 3.2 2.2 3.2s2.2-1.2 2.2-3.2c-.7.4-1.4.6-2.2.6s-1.5-.2-2.2-.6Z"
        fill="#E8837E"
      />
    </>
  );
}
