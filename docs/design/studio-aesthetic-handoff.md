# Handoff: pati — mobile app UI (4 screens)

## Overview
pati is a mobile app coordinating street-animal care (a food/water map, animal profiles, badges, a volunteer profile). This package contains the approved design of the app's 4 main screens: Login, Map, Animal Detail, My Profile. The UI language is Turkish, and all UI copy leans lowercase.

## About the design files
`PatiApp.dc.html` is **a design reference built with HTML** — a prototype showing the intended look and behavior, not production code to copy directly. The task: **reproduce** this design in the target codebase's existing environment (React etc.) with its existing patterns. If no environment exists, pick whichever of React Native / Flutter / React (PWA) fits the project best and implement there. The four screens in the file are presented inside phone frames (bezel, notch, status bar) — those are presentational only, not part of the app.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing and corner radii are final and must be reproduced at pixel precision. Measurements are relative to a 390×812 canvas (iPhone logical pt).

## Design tokens
- **Orange gradient (only: logo, primary button, progress bar, selected chip):** `linear-gradient(135deg, #F4581C, #F9A052)` (90deg on the progress bar)
- **Accent orange (links/active icons/micro labels):** `#E05E2B`
- **Text (charcoal):** `#21201E`; secondary `#8A8580`; faint `#B5AFA8`; body mid-tone `#4A4744`
- **Ground:** screens are pure white `#FFFFFF`; map ground `#F7F0E7`
- **Hairlines:** card border `#F6E8DA` (1px), outer/input border `#F3E4D4`, dashed photo frame `#EFD9C4`
- **Cream fills:** photo placeholder `#FFF3E7`, comment input `#FFF6EC`
- **Status colors:** green `#34A853` (confirmation/coverage; dark text `#2A8A45`), yellow `#F5B841` (ongoing; text `#B27D0A`)
- **Map:** streets white (14px and 6px @.7 lines), buildings `#EFE5D8`, coverage rings `rgba(52,168,83,.2/.13/.09)` + a 1.5px outline in the same tone, location dot charcoal + white ring, the 200 m radius as 1.2px dashed charcoal `.35`
- **Corner radius:** cards 18px, inputs/buttons 16-18px, pills 999px, phone screen 40px
- **Shadow:** only on the primary button `0 14px 28px -14px rgba(224,94,43,.6)`; on floating map elements `0 8px 20px -12px rgba(20,20,20,.25)`
- **Animation:** "breathing" on the coverage rings — `@keyframes patiNefes {0%,100%{opacity:.42} 50%{opacity:.72}}`, 4.5s ease-in-out infinite, staggered 1.5s delays

## Typography
A single family: **Quicksand** (Google Fonts; 400/500/600/700).
- Screen title / name: 500, 24-25px
- The "pati" wordmark: 600, 44px, letter-spacing .14em
- Large numerals (stats): 400, 26px
- Section micro labels: 600, 10.5px, letter-spacing .24em, **lowercase** (`aşı kayıtları`, `bakım verdiğim hayvanlar`…)
- Tab labels: 600, 10px, letter-spacing .18em, lowercase
- Body: 600, 13-14px; secondary 600 11.5-13px
- Rule: NO UPPERCASE; emphasis comes from letter spacing + color.

## Logo
A paw print merged with a map pin, with a heart cutout. SVG geometry (viewBox 0 0 120 130):
- 4 toe ellipses: (18,47 r12.5×16.5 rot-24), (44,25 r12.5×17.5 rot-9), (76,25 r12.5×17.5 rot9), (102,47 r12.5×16.5 rot24)
- Pin body: `M60 48C76.6 48 90 61.4 90 78c0 18-22 38-30 44-8-6-30-26-30-44 0-16.6 13.4-30 30-30z`
- Heart cutout (filled with the background color): `M60 90c-13-9-17-15.5-17-21 0-5.2 3.8-9 8.6-9 3.4 0 6.6 2 8.4 5 1.8-3 5-5 8.4-5 4.8 0 8.6 3.8 8.6 9 0 5.5-4 12-17 21z`
- Fill: the orange gradient (vertical). The heart cutout ALWAYS fills with the background color, never a separate color.

## Screens

### 1. Login (3a)
- Vertically centered: logo (118×128px) + the "pati" wordmark right below (−8px overlap). NO tagline/rule — plain.
- Form (horizontal padding 34px): email and password fields — 1px `#F3E4D4` border, radius 18, a 10px lowercase label inside (`e-posta`) + a 15.5px value.
- Primary button "Giriş yap": gradient, radius 18, 16px padding, shadowed.
- Text button: "Hesabın yok mu? **Kayıt ol**" ("Kayıt ol" in `#E05E2B`).
- Faint note at the bottom: "Kayıt olursan sana rastgele bir avatar atanır, profilden değiştirebilirsin."

### 2. Map (3b)
- Fullscreen map; a floating food/water segment on top (white pill shell, the selected half gradient-filled, lowercase `mama`/`su`).
- On the map: green coverage rings (with the breathing animation) + center dots, animal avatar markers (inside a 42px white circle), the user's location (charcoal dot + dashed 200 m ring), a gradient logo pin for the missing spot.
- A white `+` FAB at the bottom right (46px, orange +, 1px border).
- Bottom sheet (empty state → a call to action): handle bar; micro label `300 m çevrede kayıt yok`; title "Buralarda mama yok" (21px/500); subtext "İlk kaydı sen bırak, bölge yeşile dönsün."; a full-width gradient button "Buraya mama bıraktım" (with the food-bowl icon).
- Bottom tab bar: harita (active, orange) / hayvanlar / profilim — 1.6px stroke icons, lowercase labels.

### 3. Animal Detail (3c)
- Top bar: ← back + the `hayvan detay` micro label centered.
- Header: 64px animal avatar + "Karamel" (25px/500) + "Kahverengi · Sokak melezi · göğsünde beyaz leke".
- 3 photo placeholders (56px, dashed `#EFD9C4` frame, `#FFF3E7` fill, a `fotoğraf` label) — replaced by real photos.
- `aşı kayıtları` section (+ aşı ekle link): card — "Kuduz" + green-dotted `veteriner onaylı` + "14 Tem 10:20 · Mehmet Kaya · Sonraki doz: 14 Tem 2027".
- `sağlık kayıtları` (+ kayıt ekle): card — "Ön ayakta topallama" + yellow-dotted `tedavi sürüyor` + "Ayşe Yılmaz · 4 yorum · dokunarak kayıtları gör" + a green-outlined pill button "✓ iyileşti".
- `sohbet`: user avatar + name + time + message. A fixed comment row at the bottom: cream input "Yorum yaz…" + a gradient "Gönder".
- Sections are separated by a 1px top hairline (not stacked cards).

### 4. My Profile (3d)
- Header: 60px user avatar + "Ayşe Yılmaz" + email + the orange micro label `dokun, avatarını seç` (opens the avatar picker).
- Stat strip (one card, 3 cells with vertical 1px dividers): 154 `puan` / 38. `sıra / 1.204` / 3 `seviye`.
- Level card: "Düzenli Gönüllü" + "96 puan sonra: Mahalle Sorumlusu" + a 4px gradient progress bar (34%).
- `öne çıkan rozetlerim` (seç / tümü): 3 badge cards (badge symbol + name + progress like "120/250").
- `bakım verdiğim hayvanlar` (+8 daha): animal rows (avatar + name + type + ›).
- `görünüm`: pill segment `sistem` (selected, gradient) / `açık` / `koyu`.
- A faint centered `çıkış yap` text link; profilim active in the bottom tabs.

## Interactions and behavior
- Tabs: harita ↔ hayvanlar ↔ profilim navigation.
- Map: the food/water segment filters the marker set; tapping an avatar marker → animal detail; the `+` FAB → new record; the bottom sheet's button adds a food record at the current location (the area turns green — the 200 m rule: records can be made within 200 m of the user).
- Empty state: with no records within 300 m, the bottom sheet enters suggestion mode ("Buralarda mama yok").
- Animal detail: "✓ iyileşti" closes the health record; comments can attach to a record; + aşı ekle / + kayıt ekle open forms.
- Profile: tapping the avatar opens the avatar picker; the appearance segment switches the theme (system/light/dark); badge progress fills with points.
- Coverage rings breathe continuously (the keyframes above).

## State
- auth (login/register), the active tab, the map filter (mama|su), the user's location + nearby records/animals, the selected animal + vaccination/health records + comments, the user profile (points, level, rank, badges, care list), the theme preference.

## Ready components (already in the codebase)
The design uses the real React components in the pati-web library — don't rewrite them, use the existing ones: `AnimalAvatar` (an animal avatar from species+breed), `UserAvatar` (ids like `pati-avatar:f3`), `BadgeSymbol` (symbol: food/water/comment, tier: gold/silver/bronze). The map, status pills, cards and navigation are to be reproduced from this handoff.

## Assets
- Logo: the SVG geometry above (no separate file needed).
- Quicksand: Google Fonts.
- Photos: placeholders — real content comes from users.
- Map: a stylized SVG in the prototype; in production apply a custom style to the map SDK (e.g. MapLibre/Mapbox): ground `#F7F0E7`, roads white, buildings `#EFE5D8`, POI/label noise off.

## Files
- `PatiApp.dc.html` — the hifi design of the 4 screens (a single file, inside phone frames; references the `_ds/` design-system bundle and the `PatiDS.*` components).
