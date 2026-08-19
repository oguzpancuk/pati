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
- **Fontlar:** Nunito `mobile/assets/fonts` altındaki TTF'lerden, `web/src/nunito.css`
  `@font-face` ile (`extraFonts`). Web uygulamasının kendisi bu CSS'i henüz yüklemiyor.
- **Modallar** (`BadgeCatalogModal`, `BadgeAwardModal`) `position: fixed`; önizlemede
  transformlu 420×720 "Phone" sarmalayıcı içinde çiziliyor (transformlu ata fixed için
  containing block olur). `cardMode: single`.
- **Known render warns:** `[RENDER_THIN]` AnimalAvatar / BadgeSymbol — saf SVG, metin yok;
  ekran görüntüsünde doğru çiziliyor. `HeartBurst` animasyonu 1,5 sn'de biter, kart
  doğal olarak boşalır; capture animasyon ortasında.
- Playwright: `.ds-sync` içine `playwright@1` kuruldu; chromium önbelleği
  `~/Library/Caches/ms-playwright`.

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
