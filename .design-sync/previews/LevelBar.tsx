import { LevelBar } from 'pati-web';

const level3 = { level: 3, title: 'Düzenli Gönüllü', minPoints: 120, nextLevelPoints: 250, nextTitle: 'Mahalle Sorumlusu', progress: 0.34 };
const levelMax = { level: 10, title: 'Pati Efsanesi', minPoints: 5000, nextLevelPoints: null, nextTitle: null, progress: 1 };

/** Profil başlığındaki seviye çubuğu. */
export const IlerlemeVar = () => <div style={{ width: 340 }}><LevelBar level={level3} points={154} /></div>;

/** En üst seviye: hedef metni yerine "En üst seviyedesin". */
export const EnUstSeviye = () => <div style={{ width: 340 }}><LevelBar level={levelMax} points={5320} /></div>;
