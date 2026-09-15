# pati — design system

Brand identity: "pati" / **birlikte bakıyoruz** ("we care together"). This
document explains how the UI is built and what to follow when adding screens.

Short rule: **no hard-coded colors, fonts, or arbitrary spacing values in
screen files.** Everything comes from `mobile/src/theme/`.

> All three clients (mobile, web PWA, admin excepted) follow the **studio
> aesthetic**: pure-white surfaces, hairline borders, Quicksand, and the
> gradient reserved for four uses (logo, primary button, progress bar,
> selected chip). The source of truth is
> `docs/design/studio-aesthetic-handoff.md`; this document describes how the
> mobile theme system implements it.

---

## 1. Colors — `mobile/src/theme/colors.ts`

The palette matches the web client's tokens (`web/src/theme.css`) one to one.
**There are two palettes** (`lightPalette` / `darkPalette`) with identical
token names.

| Token                                            | Light                                         | Dark                                          | Where                                                                 |
| ------------------------------------------------ | --------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| `gradStart` → `gradEnd`                          | `#F4581C` → `#F9A052`                         | same                                          | The gradient — ONLY logo, primary button, progress bar, selected chip |
| `brand`                                          | `#E05E2B`                                     | `#F9824E`                                     | Flat accent: links, active icons, micro labels                        |
| `brandDark`                                      | `#C94F20`                                     | `#E0693A`                                     | Pressed states                                                        |
| `brandSoft` / `brandTint`                        | `#FFE9DA` / `#FFF3EA`                         | `#47301F` / `#33241A`                         | Accent as light/dark surface                                          |
| `background` / `surface`                         | `#FFFFFF`                                     | `#161412`                                     | Screens are pure white / warm charcoal                                |
| `surfaceAlt` / `cream`                           | `#FFF6EC` / `#FFF3E7`                         | `#241F19` / `#2A231B`                         | Comment input / photo placeholder fills                               |
| `text` / `textBody` / `textMuted` / `textSubtle` | `#21201E` / `#4A4744` / `#8A8580` / `#B5AFA8` | `#F3EEE8` / `#CFC8C0` / `#9B948C` / `#6E675F` | Charcoal text tiers                                                   |
| `border` / `borderStrong` / `borderDashed`       | `#F6E8DA` / `#F3E4D4` / `#EFD9C4`             | `#2B2620` / `#363028` / `#453B30`             | Hairlines: card / input / dashed photo frame                          |
| `success`                                        | `#34A853`                                     | `#4CC46B`                                     | "cared" on the map, recovered                                         |
| `danger`                                         | `#E24C4C`                                     | `#FF7B6B`                                     | "needs care", errors                                                  |
| `warning`                                        | `#F5B841`                                     | `#F5B841`                                     | In treatment                                                          |

The dark theme is not in the handoff; it is derived as a **warm charcoal**
variant of the same discipline (a cold gray dark theme doesn't read as the
same app). Status colors are lifted a notch — the same green/red goes dull on
dark ground. Status is displayed as **dot tags** (`ui/Tag`: colored dot +
lowercase colored text), not filled pills.

Every status color has three variants: the main tone (`danger`), a soft
surface (`dangerSoft`), and text readable on that surface (`onDanger`). Never
use the main tone as text on the soft surface — the contrast isn't enough.

The map has its own vocabulary under `mapColors` (`cared`, `needsCare`,
`userRadius`). Care circles fade with freshness, so alpha is computed at
runtime via `caredFill(alpha)`. Map layers are identical in both themes:
they're semi-transparent and the map's own ground (Apple/Google) already
follows the system theme.

**The one exception to "no colors outside the theme"**: the Apple and Google
sign-in buttons (`components/SocialSignIn.tsx` on mobile, `.social-btn` on
web). Both vendors' brand guidelines fix those colors — Apple's mark on black
in light themes and on white in dark ones, Google's four-colour G unaltered —
so they are written as literals with a why-comment. Nothing else in a screen
or component file may carry a hex value.

### How dark mode works

```
App.tsx
└── ThemeProvider              useColorScheme() + the choice stored in AsyncStorage
    └── useTheme()  →  { name, colors, shadow, map }
```

- **The choice is tri-state:** `system` (default) / `light` / `dark`. Changed
  from the **Appearance** section at the bottom of the profile screen; stored
  on device (`AsyncStorage`, key `pati.themeMode`).
- **Stylesheets are written with `makeStyles`:**

  ```ts
  const useStyles = makeStyles(({ colors: c, shadow }) => ({
    card: { backgroundColor: c.surface, ...shadow.card },
  }));

  function Component() {
    const styles = useStyles();
  }
  ```

  `StyleSheet.create` is not used directly: it runs at module load, so colors
  froze when the theme changed. `makeStyles` builds the sheet once per theme
  and caches it — no recomputation per render.

- **Occasional colors in JSX** (`<Icon color={...}>`) come from
  `const { colors } = useTheme()`.

## 2. Typography — `mobile/src/theme/typography.ts`

**Quicksand** (SIL OFL), the studio aesthetic's single family. Covers the full
Turkish alphabet (verified against the font's cmap). Files in
`mobile/assets/fonts/`, license in `mobile/assets/OFL-Quicksand.txt`. The old
Nunito files remain linked but unreferenced.

Four embedded weights: Regular 400, Medium 500, SemiBold 600, Bold 700.

The discipline: **headings are medium weight with air, never bold**, and there
is **no uppercase** — emphasis comes from letter spacing + color (the `micro`
variant is the replacement for uppercase section headings).

**Never use `fontWeight`.** Weight comes from file selection
(`fontFamily: 'Quicksand-Medium'`); combining both makes Android synthesize a
faux bold and the text breaks. Use `<Text variant="...">` instead:

| Variant                     | Size/line                                  | Where                                    |
| --------------------------- | ------------------------------------------ | ---------------------------------------- |
| `display`                   | 28/35 Medium                               | Celebration popup, single-line hero      |
| `title`                     | 25/32 Medium                               | Screen title, names                      |
| `heading`                   | 21/27 Medium                               | Bottom-sheet / card heading              |
| `subheading`                | 16/21 SemiBold                             | List-row title                           |
| `body` / `bodyStrong`       | 14/20 Medium/SemiBold                      | Body copy                                |
| `caption` / `captionStrong` | 12.5/17                                    | Secondary line                           |
| `label` / `micro`           | 10.5/14 SemiBold, .24em spacing, lowercase | In-box input label / section micro label |
| `stat`                      | 26/32 Regular                              | Large numerals in the stat strip         |
| `tab`                       | 10/13 SemiBold, spaced                     | Bottom tab labels                        |

### Why are the font files in the repo?

React Native wants `.ttf`; `@fontsource` packages ship only `.woff2`, split by
alphabet (Turkish characters live in `latin-ext`, so single files were
incomplete). The Quicksand `.ttf`s are the same complete files the web client
embeds (`web/src/fonts/`), renamed to their PostScript names.

Fonts are linked via `react-native.config.js` + `npx react-native-asset`:
Android `assets/fonts/`, iOS `UIAppFonts` in `Info.plist` + the Xcode project.
Filenames match PostScript names exactly (`Quicksand-Bold.ttf` → `Quicksand-Bold`)
because Android reads the family from the filename and iOS from the PostScript
name; when they match, a single `fontFamily` value works on both platforms.

**Adding fonts requires a native build** (`npm run ios` / `npm run android`).
Restarting Metro alone is not enough.

`react-native-asset` **copies** files to the Android side
(`android/app/src/main/assets/fonts/`), so the `.ttf`s exist twice in the repo
(~520 KB extra). Pointing Gradle at the source folder would remove the copy,
but that departs from the tool's documented flow; the copy is a deliberate
tradeoff for now. If font files change, re-run `npx react-native-asset` or the
two copies will drift.

## 3. Spacing, radius, shadow — `mobile/src/theme/layout.ts`

- `spacing`: 4 / 8 / 12 / 16 / 24 / 32 / 48 (`xs`…`xxxl`). No in-between values.
- `radius`: 8 / 12 / 16 (`input`) / 18 (`lg`) / 22 / 999 (`pill`) — the
  handoff's numbers: cards 18, inputs 16, pills round.
- `shadow`: `card` (deliberately **empty** — structure comes from hairlines) /
  `button` (only under the gradient primary button, tinted by it) / `float`
  (elements floating over the map) / `modal`. iOS `shadow*` and Android
  `elevation` are set together; with only one, the element goes flat on the
  other platform.
- `minTouch`: 44 — the floor for touch targets.

## 4. Core components — `mobile/src/components/ui/`

Screens import these via `import { ... } from '../components/ui'`.

| Component                     | Purpose                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `Text`                        | All text goes through here; takes `variant` + `color`                                                                            |
| `Button`                      | `primary` (the app's only gradient fill) / `secondary` / `ghost` / `danger` / `success` (outline), `sm/md/lg`, `loading`, `icon` |
| `Card`                        | `flat` (default: white + hairline) / `tinted` (cream); `raised` is an alias of flat — nothing casts a card shadow                |
| `Screen`                      | Theme background + safe area + optional scroll/refresh                                                                           |
| `Input`                       | The label lives **inside** the box (10.5pt lowercase micro label over the value); border turns accent on focus                   |
| `Chip`                        | Filter pill; the selected state carries the gradient                                                                             |
| `Tag`                         | Status as a colored dot + lowercase text — no filled pills                                                                       |
| `Banner`                      | In-screen status box (colored strip on the left edge)                                                                            |
| `Avatar`                      | Round profile image; initials when there is no photo                                                                             |
| `SectionHeader`               | Section title + "see all" link on the right                                                                                      |
| `EmptyState` / `LoadingState` | Shared empty-list and loading states                                                                                             |
| `Divider`                     | In-card divider                                                                                                                  |

## 5. Brand components — `mobile/src/components/brand/`

- **`Logo`** — four toe pads + a map pin with a heart cutout, in the
  handoff's exact geometry (viewBox 0 0 120 130 — identical to
  `shared/logoSvg.ts`; if one changes, so does the other). Fill defaults to
  the vertical brand gradient; pass `color` for a flat mark. The heart cutout
  always takes the background color.
- **`Wordmark`** — gradient logo stacked over the "pati" text (charcoal,
  .14em spacing, slight overlap). Tops the auth screens; no tagline.
- **`Gradient`** — the brand gradient as an absolutely positioned SVG layer
  (no extra native dependency). Use it only in the four allowed places.
- **`Icon`** — a 22-icon set with thin strokes and round caps (`pin`, `paw`,
  `user`, `users`, `plus`, `trophy`, `food`, `water`, `heart`, `chat`,
  `camera`, `health`, `bell`, `chevronRight`, `close`, `check`, `crosshair`,
  `star`, `logout`, `refresh`, `settings`, `flag`). **Use this instead of emoji:**
  emoji render differently per device and can't take the brand color.
  A glyph whose strokes reach the edge of the 24×24 box is clipped at small
  sizes; `VIEW_BOXES` gives such an icon its own viewBox, inset by the stroke
  width, rather than redrawing it smaller (`settings` is the first). Exceptions are badge
  tiers (🥇🥈🥉💎) and level marks — deliberately emoji at the time; both have
  since moved to custom SVG (`components/badges/`).

## 6. Navigation theme — `mobile/src/theme/navigation.ts`

`navigationTheme(theme)` is passed to react-navigation; without it screen
transitions flash a white background that clashes with ours. All three
(`navigationTheme`, `screenOptions`, `tabBarOptions`) are functions taking the
theme — as static objects, header and tab colors would freeze on theme change.
The tab bar's height is computed from the bottom safe-area inset
(`tabBarGeometry`, owner 2026-09-15): the icon and label sit centred between
the hairline and the screen edge, with the inset capped at the 18 pt that
clear the home indicator and never less than 8 pt under the labels. On an
iPhone 17 Pro that is 76 pt (bottom-tabs' own was 79, with a 30 pt empty band
under the labels); with no inset, 56. Never a constant height — one that
ignores the inset clips the labels on notched phones. Landscape phones keep
the library's compact side-by-side bar. Web's `.tabbar` applies the same rule
with `env(safe-area-inset-bottom)`.

## 7. App icon and launch screen

Icons are generated from the **same SVG paths** as `Logo.tsx`:

```bash
cd mobile && npm run icons     # requires Chromium (Playwright)
```

`scripts/generate-icons.mjs` writes:

| Output                                            | What                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `ios/.../AppIcon.appiconset/icon-*.png`           | 40–1024 px, gradient logo on white, **no alpha** (the App Store rejects transparency) |
| `ios/.../LaunchLogo.imageset/*`                   | Launch-screen logo, transparent ground                                                |
| `android/.../mipmap-*/ic_launcher.png`            | Classic icon (Android ≤ 7)                                                            |
| `android/.../mipmap-*/ic_launcher_round.png`      | Round variant, transparent corners                                                    |
| `android/.../mipmap-*/ic_launcher_foreground.png` | Adaptive-icon foreground                                                              |

Android 8+ uses **adaptive icons**: background from
`values/colors.xml → ic_launcher_background`, foreground from the PNG above.
Launchers crop the foreground with their own mask, so the logo is drawn small
enough to fit the 66 dp safe zone of the 108 dp canvas.

Launch screens:

- **iOS:** `LaunchScreen.storyboard` — white ground, centered gradient logo,
  no text (launch storyboards render before custom fonts register, so any
  text would fall back to the system font). Drawn natively, so colors can't
  read tokens and are hard-coded.
- **Android:** no separate splash; `android:windowBackground` in `styles.xml`
  is white, same as the screens.

---

## 8. Back navigation — the return rule

Owner rule, 2026-09-11: **the tab bar switches roots; everything else pushes.**
Whenever the screen changes from anywhere other than the tab bar — a comment
author, a carer row, a leaderboard name, a card, a deep link — the user must be
able to return to exactly where they came from.

Three things follow from "exactly where they came from":

1. **Back means history, not a parent.** A user profile reached from an animal
   profile returns to that animal, not to a friends list. Mobile gets this from
   the native stack; web must use `navigate(-1)`, never a hardcoded `<Link>`.
2. **A page reached with no history still needs a way out.** `navigate(-1)` in
   a fresh tab (a shared link, a PWA cold start) goes nowhere. Every web page
   header falls back to a sensible root when `history.length` offers nothing.
3. **A sheet is not a page.** Popups, sheets and dialogs stay on the page that
   opened them: their close button is the way out, and Android's hardware back
   and the browser's back button must close the sheet rather than leave the
   page.

Both clients render this through one header component per client, so the back
affordance sits in the same place on every screen: top-left, before the title.
Tab roots (map, animals, messages, profile) carry no back — there is nothing
behind them.

### The tab bar, and its light

Owner rules, 2026-09-11 and 12, in two parts.

**The bar never disappears.** Every destination is registered inside each
tab's own stack, so a screen opened from a tab keeps the bar and back pops
within that tab. Only a modal may cover it — and only the three flows that
are a task rather than a place: yeni hayvan, bakım ver, yeni sohbet. On web
this comes free, since every route renders inside the shell that draws the
bar.

**The light marks where you are, not how you got there.** A tab is lit only
while it is showing its own screen; the moment you open anything on top of
it, every tab goes dark and the bar is just the way out. Lit tabs over an
animal profile claimed the reader was on the list they came through. Mobile
tests whether the tab's stack has moved off its home route; web gives every
tab link an exact match.

## Adding a new screen

1. `<Screen>` at the root; for lists pass `padded={false}` and put the spacing
   into the `FlatList`'s `contentContainerStyle` yourself.
2. Text through `<Text variant="...">`, buttons through `<Button>`, groups in
   `<Card>`.
3. Stylesheet via `makeStyles(({ colors: c }) => ({ ... }))`, spacing via
   `spacing.<name>`. **Never `StyleSheet.create`** — colors freeze in dark mode.
4. Give empty and loading states via `EmptyState` / `LoadingState` — a screen
   must never render blank.
5. Need a new icon? Add it to `Icon.tsx`; don't put emoji on screens.
6. Open every new screen **in both themes**; format with `npm run format`.

Follow these and new screens don't strain the theme system: if the brand color
or the typeface changes, one file changes.

## Known gaps

- **White on the gradient hovers around WCAG AA.** White on `#F4581C` passes
  for large text (4.0:1) but the light end `#F9A052` drops to ~2.1:1. Kept
  because the handoff specifies this combination and button text is short and
  semibold; a darker gradient end would fix it. The brand owner decides.
- **The accessibility audit is incomplete.** Touch targets were raised to
  44 pt and buttons have `accessibilityRole`, but screen-reader labels are not
  tested end to end.
- **The admin panel is not aligned with the mobile palette.**
  `admin/src/styles.css` still uses its own color variables (`--moss`, `--clay`).
