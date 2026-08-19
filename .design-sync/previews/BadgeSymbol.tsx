import { BadgeSymbol } from 'pati-web';

const symbols = ['food', 'water', 'register', 'comment', 'health', 'vaccine', 'paw'] as const;

/** Yedi sembol, altın kademede. */
export const Semboller = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    {symbols.map((s) => <BadgeSymbol key={s} symbol={s} tier="gold" size={44} />)}
  </div>
);

/** Kademeler: kilitli → bronz → gümüş → altın → elmas. */
export const Kademeler = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <BadgeSymbol symbol="food" tier={null} />
    <BadgeSymbol symbol="food" tier="bronze" />
    <BadgeSymbol symbol="food" tier="silver" />
    <BadgeSymbol symbol="food" tier="gold" />
    <BadgeSymbol symbol="food" tier="diamond" />
  </div>
);

/** Kutlama popup'ındaki büyük madalyon. */
export const Buyuk = () => <BadgeSymbol symbol="paw" tier="diamond" size={92} />;
