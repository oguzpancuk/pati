/**
 * pati tasarım sistemi girişi (Claude Design senkronu için).
 *
 * Uygulamanın kendisi bunu import etmiyor; `/design-sync` bu dosyayı esbuild
 * ile tek bir pakete derleyip claude.ai/design'a yüklüyor, oradaki tasarım
 * ajanı da bu bileşenlerle tasarlıyor. Buradan çıkarılan her şey web'in gerçek
 * bileşeni — kopya ya da yeniden yazım yok. Bileşen ekleyince
 * `.design-sync/config.json` → `componentSrcMap`'e de yol eklenmeli.
 *
 * Bilerek dışarıda: AdBanner (ağ isteyen reklam bandı), sayfalar ve admin/
 * bileşenleri — yönetim paneli ayrı bir görsel dil (kendi :root/button
 * kuralları, yosun yeşili palet); pati markasıyla karışmasın diye ayrı bir
 * proje olarak senkronlanabilir.
 */
export { AnimalAvatar, UserAvatar } from './avatars';
export { BadgeSymbol, LevelMark, LevelBar, BadgeCatalogModal, BadgeAwardModal } from './badges';
export { LoadMoreButton } from './components/LoadMoreButton';
export { HeartBurst } from './components/HeartBurst';
export { RecentComments } from './components/RecentComments';
// Önizlemeler için router sağlayıcısı: RecentComments <Link> kullanıyor.
export { MemoryRouter as PatiRouter } from 'react-router-dom';
