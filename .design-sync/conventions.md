# pati — component library conventions

pati is an app that coordinates street-animal care (a food/water map, animal profiles, badges). This library is the web client's real React components and its single stylesheet. **UI copy is Turkish.**

**Visual language — "studio aesthetic":** screens are pure white (`--background` #fff), **hairlines** instead of stacked cards (`.hairline`, `--border` very light); the orange **gradient** (`--grad`) appears ONLY on the logo + primary button (`.btn`) + progress bar + selected chip (`.chip.selected`) — never use the gradient anywhere else; **NO UPPERCASE** (emphasis = letter spacing + color, see `.micro`); a single type family, **Quicksand** (`fonts/`, 400/500/600/700).

## Setup / wrapping
- No theme provider: colors come from the CSS variables in `styles.css` → `_ds_bundle.css`; components are styled without wrapping anything.
- Dark theme: `data-theme="dark"` (or `"light"`) on the root `<html>` element; without the attribute the system preference (`prefers-color-scheme`) applies.
- `RecentComments` contains a `<Link>`: it must be used **inside a Router** (`window.PatiDS.PatiRouter` = a MemoryRouter re-export; the app uses BrowserRouter). Outside a Router it crashes with "useHref() may be used only in the context of a <Router>".
- Typeface is Quicksand (`fonts/`, loaded via `styles.css`); weights 400/500/600/700. Headings are emphasized with medium weight + letter spacing, not bold.

## Style vocabulary — classes (don't invent new classes, use these)
| Family | Classes | Purpose |
|---|---|---|
| Layout | `.app`, `.page`, `.page.fill`, `.row`, `.grow`, `.section` | vertical app skeleton; `.page` is scrolled content; `.row` a horizontally aligned row (gap 10); `.grow` a flexing column; `.section` a section heading (h2) |
| Card | `.card`, `.card.flat` | shadowed card (`--surface`, radius 14); `.flat` is borderless-shadow, bordered |
| Button | `.btn`, `.btn.secondary`, `.btn.ghost`, `.btn.small`, `.btn.full` | filled orange pill button; `secondary` bordered; `ghost` transparent; `small` 36px; `full` full width |
| Selection | `.chip`, `.chip.selected`, `.chiprow`, `.chiprow.scroll`, `.segmented` | pill filter; selected = brand fill; `.segmented` two-three equal segments |
| Form | `.field` (`<label class="field"><span>LABEL</span><input/></label>`), `.label` | label 12px, input 1.5px border, `--brand` on focus |
| Text | `.muted` (13px, `--text-muted`), `.subtle` (12px, `--text-subtle`), `.link` (orange link/button) | secondary text tiers |
| State | `.error`, `.banner`, `.tag.success` / `.tag.warning` / `.tag.danger` / `.tag.neutral` | error box; red warning band; small status tags |
| Overlay | `.backdrop`, `.backdrop.center`, `.sheet`, `.sheet.award` | scrim + bottom sheet (`.sheet` opens from the bottom, 480px max); `.center` centers; `.award` celebration card |
| Social | `.badge-grid`, `.badge-row(.selected/.locked)`, `.levelbar`, `.stats`, `.avatar-grid`, `.round` | badge 3-up grid; catalog row; level bar; stat strip; round crop |
| Tabs | `.tabbar` (`<a class="active">` inside `<nav>`) | bottom tab bar: Harita / Hayvanlar / Profilim |
| Top bar | `.topbar` (40px back button `.back` · title · 40px), `.micro` | page header; `.micro` = lowercase, widely spaced micro label (10.5px, letter-spacing .24em) — use this instead of UPPERCASE |
| Divider/strip | `.hairline`, `.statstrip` (`> div` cells, `strong` number), `.sheet-handle` | hairline top rule; side-by-side stat strip; the bottom sheet's handle |
| Floating | `.fab` (46px round, bottom right), `.nefes` (slow breathing animation) | floating action button on the map; logo/marker breathing effect |
| Link | `.textlink` | in-text orange link |

## Tokens (`var(--…)`, all defined at the end of `styles.css`)
- Gradient (only 4 places): `--grad` (135°), `--grad-h` (horizontal), `--grad-start`, `--grad-end`
- Brand accent: `--brand` (#E05E2B — links, active icons, micro labels), `--brand-dark`, `--brand-soft`, `--brand-tint`
- Ground: `--background` (white), `--surface`, `--surface-alt` (cream fill), `--cream`, `--map-ground`, `--overlay`
- Text: `--text`, `--text-body`, `--text-muted`, `--text-subtle`, `--text-on-brand`
- Line/shape: `--border`, `--border-strong`, `--border-dashed`, `--radius`, `--radius-input`, `--radius-pill`, `--shadow-btn`, `--shadow-float`
- State: `--success`/`--success-soft`/`--on-success`, `--danger`/`--danger-soft`/`--on-danger`, `--warning`/`--warning-soft`/`--on-warning`, `--disabled`, `--disabled-text`
- Never write raw hex; everything comes from these variables. Green = "care present/success", red = warning, orange gradient = primary action/progress, flat orange = accent.

## Where the truth lives
- Classes and tokens: `styles.css` → `_ds_bundle.css` (the web client's `theme.css`). Read it before styling anything.
- Component APIs: `components/general/<Name>/<Name>.d.ts` and `.prompt.md`.
- Components: Logo, Wordmark, AnimalAvatar, UserAvatar, BadgeSymbol, LevelMark, LevelBar, BadgeCatalogModal, BadgeAwardModal, LoadMoreButton, HeartBurst, RecentComments (+ PatiRouter).

## Example: profile card
```jsx
const { UserAvatar, LevelBar, LoadMoreButton } = window.PatiDS;
<div className="page">
  <div className="card">
    <div className="row">
      <UserAvatar avatarUrl="pati-avatar:f3" name="Ayşe Yılmaz" size={64} />
      <div className="grow">
        <h1 style={{ margin: 0, fontSize: 22 }}>Ayşe Yılmaz</h1>
        <div className="muted">ayse@ornek.com</div>
      </div>
    </div>
    <LevelBar level={{ level: 3, title: 'Düzenli Gönüllü', minPoints: 120, nextLevelPoints: 250, nextTitle: 'Mahalle Sorumlusu', progress: 0.34 }} points={154} />
  </div>
  <h2 className="section">Bakım verdiğim hayvanlar</h2>
  <LoadMoreButton remaining={8} onClick={() => {}} />
  <button className="btn full">Buraya mama bıraktım</button>
</div>
```
