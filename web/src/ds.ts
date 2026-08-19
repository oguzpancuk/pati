/**
 * The pati design system entry (for the Claude Design sync).
 *
 * The app itself doesn't import this; `/design-sync` compiles this file into
 * a single bundle with esbuild and uploads it to claude.ai/design, where the
 * design agent designs with these components. Everything exported here is
 * the web client's real component — no copies, no rewrites. When adding a
 * component, also add its path to `.design-sync/config.json` →
 * `componentSrcMap`.
 *
 * Deliberately left out: AdBanner (an ad strip that needs the network),
 * pages, and the admin/ components — the admin panel is a separate visual
 * language (its own :root/button rules, moss-green palette); it can sync as
 * its own project so it doesn't blend into the pati brand.
 */
export { Logo, Wordmark } from './brand';
export { AnimalAvatar, UserAvatar } from './avatars';
export { BadgeSymbol, LevelMark, LevelBar, BadgeCatalogModal, BadgeAwardModal } from './badges';
export { LoadMoreButton } from './components/LoadMoreButton';
export { HeartBurst } from './components/HeartBurst';
export { RecentComments } from './components/RecentComments';
// Router provider for the previews: RecentComments uses <Link>.
export { MemoryRouter as PatiRouter } from 'react-router-dom';
