# design-sync notes (pati)

- **Scope:** `web/` only (entry `web/src/ds.ts`, package `pati-web`, global `window.PatiDS`).
  `admin/` is left out on purpose: with its own `:root`/`button` globals and moss-green
  palette it is a separate visual language; merged with `theme.css` it breaks the pati
  components. If wanted, it should sync as a separate "pati-admin" project.
- **No build:** web is not a library; the converter compiles from source
  (`--entry ./web/src/ds.ts`). `.d.ts` inference couldn't resolve inline prop types →
  all components were written by hand via `cfg.dtsPropsFor`. When adding a component,
  add a line to `ds.ts`, to `componentSrcMap`, and to `dtsPropsFor`.
- **Provider:** `RecentComments` uses `<Link>` → `cfg.provider = PatiRouter`
  (a re-export of `react-router-dom`'s `MemoryRouter` from `ds.ts`).
- **Fonts:** with the studio theme (Aug 19, 2nd sync) a single family, **Quicksand**:
  `web/src/quicksand.css` + `web/src/fonts/*.ttf` (`extraFonts`). The old Nunito
  files (`fonts/Nunito-*.ttf`) now sit unreferenced in the project — not deleted
  because the diff doesn't cover fonts; harmless, can be cleaned up by hand.
- **Modals** (`BadgeCatalogModal`, `BadgeAwardModal`) are `position: fixed`; in the
  preview they render inside a transformed 420×720 "Phone" wrapper (a transformed
  ancestor becomes the containing block for fixed). `cardMode: single`.
- **Known render warns:** `[RENDER_THIN]` AnimalAvatar / BadgeSymbol — pure SVG, no
  text; they render correctly in the screenshot. The `HeartBurst` animation ends in
  1.5 s and the card empties naturally; the capture lands mid-animation.
- Playwright: `playwright@1` installed into `.ds-sync`; the chromium cache is at
  `~/Library/Caches/ms-playwright`.

- **The project contains files that are not ours** (`templates/pati-app/*`,
  `HANDOFF-tasarim-dili.md`, `github.md`, `uploads/*.png`, `_ds_manifest.json`,
  `_adherence.oxlintrc.json`): design and handbook material added by the user/app.
  The plan's `deletes` was left empty; never delete by glob.
- **2nd sync (studio aesthetic):** the theme was rewritten, but because grades are
  tied to the preview source, 10 components counted as "unchanged"; still,
  LevelBar/BadgeCatalogModal/LoadMoreButton/RecentComments were spot-checked by eye.
  Logo + Wordmark added (`web/src/brand.tsx`). `conventions.md` was updated for the
  new language (gradient rule, `.micro`, `.topbar`, `.statstrip`, `.hairline`,
  `.fab`, token names).

## Re-sync risks
- `dtsPropsFor` is hand-written: if source props change, this goes stale silently —
  update it when a component signature changes.
- The demo data in the previews (badge list, comments) is a copy of the
  mobile/backend contract; if a field name changes the preview won't compile
  (`preview build failed` in the build log).
- `nunito.css` paths point at `../../mobile/assets/fonts` — if the fonts move:
  `[FONT_DANGLING]`.

## Re-syncing
```bash
D=<design-sync skill dir>; cp -r $D/package-build.mjs $D/package-validate.mjs $D/package-capture.mjs $D/resync.mjs $D/lib $D/storybook .ds-sync/
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./web/node_modules \
  --entry ./web/src/ds.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
Project: https://claude.ai/design/p/585b7040-db11-4edd-b611-1d45107e41f8
