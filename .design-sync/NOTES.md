# design-sync notları (pati)

- **Kapsam:** yalnızca `web/` (giriş `web/src/ds.ts`, paket `pati-web`, global `window.PatiDS`).
  `admin/` bilerek dışarıda: kendi `:root`/`button` globalleri ve yosun yeşili paletiyle
  ayrı bir görsel dil; `theme.css` ile birleştirilince pati bileşenlerini bozuyor. İstenirse
  ayrı bir "pati-admin" projesi olarak senkronlanmalı.
- **Build yok:** web bir kütüphane değil; converter kaynaktan (`--entry ./web/src/ds.ts`)
  derliyor. `.d.ts` çıkarımı satır içi prop tiplerini çözemedi → tüm bileşenler
  `cfg.dtsPropsFor` ile elle yazıldı. Bileşen eklerken hem `ds.ts`'e hem
  `componentSrcMap`'e hem `dtsPropsFor`'a satır ekle.
- **Sağlayıcı:** `RecentComments` `<Link>` kullanıyor → `cfg.provider = PatiRouter`
  (`react-router-dom` `MemoryRouter`'ın `ds.ts`'ten yeniden dışa aktarımı).
- **Fontlar:** stüdyo temasıyla (19 Ağu, 2. senkron) tek aile **Quicksand**:
  `web/src/quicksand.css` + `web/src/fonts/*.ttf` (`extraFonts`). Eski Nunito
  dosyaları projede (`fonts/Nunito-*.ttf`) artık referanssız duruyor — diff
  fontları kapsamadığı için silinmedi, zararsız; el ile temizlenebilir.
- **Modallar** (`BadgeCatalogModal`, `BadgeAwardModal`) `position: fixed`; önizlemede
  transformlu 420×720 "Phone" sarmalayıcı içinde çiziliyor (transformlu ata fixed için
  containing block olur). `cardMode: single`.
- **Known render warns:** `[RENDER_THIN]` AnimalAvatar / BadgeSymbol — saf SVG, metin yok;
  ekran görüntüsünde doğru çiziliyor. `HeartBurst` animasyonu 1,5 sn'de biter, kart
  doğal olarak boşalır; capture animasyon ortasında.
- Playwright: `.ds-sync` içine `playwright@1` kuruldu; chromium önbelleği
  `~/Library/Caches/ms-playwright`.

- **Projede bize ait olmayan dosyalar var** (`templates/pati-app/*`,
  `HANDOFF-tasarim-dili.md`, `github.md`, `uploads/*.png`, `_ds_manifest.json`,
  `_adherence.oxlintrc.json`): kullanıcının/uygulamanın eklediği tasarım ve
  el kitabı. Plan `deletes` boş bırakıldı; asla glob'la silme.
- **2. senkron (stüdyo estetiği):** tema baştan yazıldı ama dereceler
  önizleme kaynağına bağlı olduğu için 10 bileşen "değişmedi" sayıldı; yine de
  LevelBar/BadgeCatalogModal/LoadMoreButton/RecentComments spot-check ile
  gözle doğrulandı. Logo + Wordmark eklendi (`web/src/brand.tsx`).
  `conventions.md` yeni dile göre güncellendi (degrade kuralı, `.micro`,
  `.topbar`, `.statstrip`, `.hairline`, `.fab`, token adları).

## Re-sync riskleri
- `dtsPropsFor` elle: kaynak prop'ları değişirse burası sessizce eskir — bileşen imzası
  değişince güncelle.
- Önizlemelerdeki demo verisi (rozet listesi, yorumlar) mobil/backend sözleşmesinin
  kopyası; alan adı değişirse önizleme derlenmez (build logunda `preview build failed`).
- `nunito.css` yolları `../../mobile/assets/fonts` — fontlar taşınırsa `[FONT_DANGLING]`.

## Yeniden senkron
```bash
D=<design-sync skill dizini>; cp -r $D/package-build.mjs $D/package-validate.mjs $D/package-capture.mjs $D/resync.mjs $D/lib $D/storybook .ds-sync/
node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./web/node_modules \
  --entry ./web/src/ds.ts --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
Proje: https://claude.ai/design/p/585b7040-db11-4edd-b611-1d45107e41f8
