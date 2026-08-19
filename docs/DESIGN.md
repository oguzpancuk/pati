# pati — design system

Brand identity: "pati" / **birlikte bakıyoruz** ("we care together"). This
document explains how the UI is built and what to follow when adding screens.

Short rule: **no hard-coded colors, fonts, or arbitrary spacing values in
screen files.** Everything comes from `mobile/src/theme/`.

> The web PWA follows the newer **studio aesthetic** (white surfaces, hairline
> borders, Quicksand, gradient discipline) — see
> `docs/design/studio-aesthetic-handoff.md`. This document describes the
> mobile theme system, which still uses the original pati palette until the
> studio aesthetic is ported to mobile.

---

## 1. Colors — `mobile/src/theme/colors.ts`

Five colors come fixed from the brand identity; the rest are derived. **There
are two palettes** (`lightPalette` / `darkPalette`) with identical token names.

| Token | Light | Dark | Where |
| --- | --- | --- | --- |
| `brand` | `#F47A4A` | `#FF8F5E` | Primary button, selected tab, links |
| `brandDark` | `#D9633A` | `#E0714A` | Pressed button |
| `brandSoft` / `brandTint` | `#FDE7DB` / `#FFF0E7` | `#4A2E22` / `#37241C` | Brand color as light/dark surface |
| `background` | `#FFF3E7` | `#1C1714` | Screen background |
| `surface` / `surfaceAlt` | `#FFFFFF` / `#FFF9F2` | `#262019` / `#2F2721` | Card / secondary block inside a card |
| `text` / `textMuted` / `textSubtle` | `#2B2B2B` / `#7A6E66` / `#A2948A` | `#F5EDE4` / `#B8A99C` / `#8C7D71` | Primary / secondary / timestamp |
| `border` | `#F0DCC8` | `#3A3029` | Warm divider |
| `success` | `#34A853` | `#4CC46B` | "cared" on the map, recovered |
| `danger` | `#FF5C5C` | `#FF7B7B` | "needs care", errors |
| `warning` | `#F2A83B` | `#F5B855` | In treatment, duplicate warnings |

The dark theme uses **warm coffee** tones, not neutral gray: the brand cream
is warm, so a cold gray dark theme doesn't read as the same app. Status colors
are lifted a notch — the same green/red goes dull on dark ground.

Every status color has three variants: the main tone (`danger`), a soft
surface (`dangerSoft`), and text readable on that surface (`onDanger`). Never
use the main tone as text on the soft surface — the contrast isn't enough.

The map has its own vocabulary under `mapColors` (`cared`, `needsCare`,
`userRadius`). Care circles fade with freshness, so alpha is computed at
runtime via `caredFill(alpha)`. Map layers are identical in both themes:
they're semi-transparent and the map's own ground (Apple/Google) already
follows the system theme.

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

**Nunito** (SIL OFL). Matches the brand's "round, warm, trustworthy" brief and
covers the full Turkish alphabet (ı İ ğ Ğ ş Ş ç Ç ö Ö ü Ü — 938 glyphs).
Files in `mobile/assets/fonts/`, license in `mobile/assets/OFL-Nunito.txt`.

Four embedded weights: Regular 400, SemiBold 600, Bold 700, ExtraBold 800
(~520 KB total).

**Never use `fontWeight`.** Weight comes from file selection
(`fontFamily: 'Nunito-Bold'`); combining both makes Android synthesize a faux
bold and the text breaks. Use `<Text variant="...">` instead:

| Variant | Size/line | Where |
| --- | --- | --- |
| `display` | 30/37 ExtraBold | Celebration popup, single-line hero |
| `title` | 24/31 Bold | Screen title |
| `heading` | 19/25 Bold | Card / section heading |
| `subheading` | 16/22 SemiBold | List-row title |
| `body` / `bodyStrong` | 15/22 | Body copy |
| `caption` / `captionStrong` | 13/18 | Secondary line |
| `label` | 12/16 SemiBold | Form label |
| `micro` | 11/14 Bold, letter-spaced | Under badges, the "REKLAM" tag |

### Why are the font files in the repo?

React Native wants `.ttf`; `@fontsource` packages ship only `.woff2`, split by
alphabet (Turkish characters live in `latin-ext`, so single files were
incomplete). `@expo-google-fonts/nunito` contains complete `.ttf` files, so
they were taken from there; the package itself is not a dependency.

Fonts are linked via `react-native.config.js` + `npx react-native-asset`:
Android `assets/fonts/`, iOS `UIAppFonts` in `Info.plist` + the Xcode project.
Filenames match PostScript names exactly (`Nunito-Bold.ttf` → `Nunito-Bold`)
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
- `radius`: 8 / 12 / 16 / 22 / 999 (`pill`). The brand is round; corners are generous.
- `shadow`: `card` / `raised` / `modal` — arrives as the second field inside
  `makeStyles`. iOS `shadow*` and Android `elevation` are set together; with
  only one, cards go flat on the other platform. Shadow color is warm coffee
  in light (gray shadows look dirty on cream) and black, more opaque, in dark.
- `minTouch`: 44 — the floor for touch targets.

## 4. Core components — `mobile/src/components/ui/`

Screens import these via `import { ... } from '../components/ui'`.

| Component | Purpose |
| --- | --- |
| `Text` | All text goes through here; takes `variant` + `color` |
| `Button` | `primary` / `secondary` / `ghost` / `danger` / `success`, `sm/md/lg`, `loading`, `icon` |
| `Card` | `raised` (shadow) / `flat` (border) / `tinted`; pressable when `onPress` given |
| `Screen` | Theme background + safe area + optional scroll/refresh |
| `Input` | Labeled text field; border turns brand on focus, takes `error`/`hint` |
| `Chip` | Filter button and read-only tag; status colors via `tone` |
| `Banner` | In-screen status box (colored strip on the left edge) |
| `Avatar` | Round profile image; initials when there is no photo |
| `SectionHeader` | Section title + "see all" link on the right |
| `EmptyState` / `LoadingState` | Shared empty-list and loading states |
| `Divider` | In-card divider |

## 5. Brand components — `mobile/src/components/brand/`

- **`Logo`** — four toe pads + a map pin with a heart cutout. Drawn as SVG so
  it stays crisp from a 24 px tab icon to a 160 px launch screen, and color
  changes with a single prop. Without a color it follows the theme (in dark
  mode the heart sits on the dark background); on orange ground use
  `<Logo color="#fff" accent={colors.brand} />`.
- **`Wordmark`** — logo + "pati" text, optional tagline. Tops the auth screens.
- **`Icon`** — a 20-icon set with thin strokes and round caps (`pin`, `paw`,
  `user`, `users`, `plus`, `trophy`, `food`, `water`, `heart`, `chat`,
  `camera`, `health`, `bell`, `chevronRight`, `close`, `check`, `crosshair`,
  `star`, `logout`, `refresh`). **Use this instead of emoji:** emoji render
  differently per device and can't take the brand color. Exceptions are badge
  tiers (🥇🥈🥉💎) and level marks — deliberately emoji at the time; both have
  since moved to custom SVG (`components/badges/`).

## 6. Navigation theme — `mobile/src/theme/navigation.ts`

`navigationTheme(theme)` is passed to react-navigation; without it screen
transitions flash a white background that clashes with ours. All three
(`navigationTheme`, `screenOptions`, `tabBarOptions`) are functions taking the
theme — as static objects, header and tab colors would freeze on theme change.
The tab bar gets no fixed height: `bottom-tabs` adds the bottom safe area
itself, and a fixed height clips labels on notched phones.

## 7. App icon and launch screen

Icons are generated from the **same SVG paths** as `Logo.tsx`:

```bash
cd mobile && npm run icons     # requires Chromium (Playwright)
```

`scripts/generate-icons.mjs` writes:

| Output | What |
| --- | --- |
| `ios/.../AppIcon.appiconset/icon-*.png` | 40–1024 px, orange ground, **no alpha** (the App Store rejects transparency) |
| `ios/.../LaunchLogo.imageset/*` | Launch-screen logo, transparent ground |
| `android/.../mipmap-*/ic_launcher.png` | Classic icon (Android ≤ 7) |
| `android/.../mipmap-*/ic_launcher_round.png` | Round variant, transparent corners |
| `android/.../mipmap-*/ic_launcher_foreground.png` | Adaptive-icon foreground |

Android 8+ uses **adaptive icons**: background from
`values/colors.xml → ic_launcher_background`, foreground from the PNG above.
Launchers crop the foreground with their own mask, so the logo is drawn small
enough to fit the 66 dp safe zone of the 108 dp canvas.

Launch screens:
- **iOS:** `LaunchScreen.storyboard` — cream ground, logo, "pati" + tagline.
  Drawn natively, so colors can't read tokens and are hard-coded; if the
  palette changes, update the storyboard too.
- **Android:** no separate splash; `android:windowBackground` in `styles.xml`
  is cream so cold start doesn't flash white.

---

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

- **White on orange fails WCAG AA.** White on `#F47A4A` has a contrast ratio
  of **2.7:1** (4.5:1 required for body text). Kept because the brand identity
  shows this combination. Two fixes exist: darken the button fill
  (~`#C2551F` gives 4.6:1) or use dark text on orange (`#2B2B2B` gives 5.3:1).
  The brand owner decides.
- **The accessibility audit is incomplete.** Touch targets were raised to
  44 pt and buttons have `accessibilityRole`, but screen-reader labels are not
  tested end to end.
- **The admin panel is not aligned with the mobile palette.**
  `admin/src/styles.css` still uses its own color variables (`--moss`, `--clay`).
