# pati — bileşen kütüphanesi kuralları

pati, sokak hayvanlarının bakımını koordine eden bir uygulamadır (mama/su haritası, hayvan profilleri, rozetler). Bu kütüphane web istemcisinin gerçek React bileşenleri ve tek stil sayfasıdır. **Arayüz metinleri Türkçe.**

**Görsel dil — "stüdyo estetiği":** ekranlar saf beyaz (`--background` #fff), kart yığını değil **kılcal çizgiler** (`.hairline`, `--border` çok açık); turuncu **degrade** (`--grad`) YALNIZCA logo + birincil düğme (`.btn`) + ilerleme çubuğu + seçili pil (`.chip.selected`) üzerinde — başka yerde degrade kullanma; **BÜYÜK HARF kullanılmaz** (vurgu = harf aralığı + renk, bkz. `.micro`); tek yazı ailesi **Quicksand** (`fonts/`, 400/500/600/700).

## Kurulum / sarmalama
- Tema sağlayıcı yok: renkler `styles.css` → `_ds_bundle.css` içindeki CSS değişkenlerinden gelir; hiçbir şeyi sarmalamadan bileşenler stillenir.
- Koyu tema: kök `<html>` öğesine `data-theme="dark"` (ya da `"light"`); öznitelik yoksa sistem tercihi (`prefers-color-scheme`) geçerli.
- `RecentComments` içinde `<Link>` var: **bir Router içinde** kullanılmalı (`window.PatiDS.PatiRouter` = MemoryRouter dışa aktarımı; uygulamada BrowserRouter). Router dışında "useHref() may be used only in the context of a <Router>" hatasıyla patlar.
- Yazı tipi Quicksand (`fonts/`, `styles.css` içinden gelir); ağırlıklar 400/500/600/700. Başlıklar kalın değil orta ağırlık + harf aralığıyla vurgulanır.

## Stil sözlüğü — sınıflar (yeni sınıf uydurma, bunları kullan)
| Aile | Sınıflar | Ne için |
|---|---|---|
| Düzen | `.app`, `.page`, `.page.fill`, `.row`, `.grow`, `.section` | dikey uygulama iskeleti; `.page` kaydırılan içerik; `.row` yatay hizalı satır (gap 10); `.grow` esneyen kolon; `.section` bölüm başlığı (h2) |
| Kart | `.card`, `.card.flat` | gölgeli kart (`--surface`, radius 14); `.flat` gölgesiz, kenarlıklı |
| Düğme | `.btn`, `.btn.secondary`, `.btn.ghost`, `.btn.small`, `.btn.full` | dolu turuncu hap düğme; `secondary` kenarlıklı; `ghost` şeffaf; `small` 36px; `full` tam genişlik |
| Seçim | `.chip`, `.chip.selected`, `.chiprow`, `.chiprow.scroll`, `.segmented` | hap filtre; seçili = marka dolgu; `.segmented` eşit bölmeli iki-üç seçenek |
| Form | `.field` (`<label class="field"><span>ETİKET</span><input/></label>`), `.label` | etiket büyük harf 12px, giriş 1.5px kenarlık, odakta `--brand` |
| Metin | `.muted` (13px, `--text-muted`), `.subtle` (12px, `--text-subtle`), `.link` (turuncu bağlantı/düğme) | ikincil metin kademeleri |
| Durum | `.error`, `.banner`, `.tag.success` / `.tag.warning` / `.tag.danger` / `.tag.neutral` | hata kutusu; kırmızı uyarı bandı; küçük durum rozetleri |
| Katman | `.backdrop`, `.backdrop.center`, `.sheet`, `.sheet.award` | perde + alt sayfa (`.sheet` alttan açılır, 480px maks); `.center` ortalar; `.award` kutlama kartı |
| Sosyal | `.badge-grid`, `.badge-row(.selected/.locked)`, `.levelbar`, `.stats`, `.avatar-grid`, `.round` | rozet 3'lü ızgara; katalog satırı; seviye çubuğu; istatistik şeridi; yuvarlak kırpma |
| Sekme | `.tabbar` (`<nav>` içinde `<a class="active">`) | alt sekme çubuğu: Harita / Hayvanlar / Profilim |
| Üst bar | `.topbar` (40px geri düğmesi `.back` · başlık · 40px), `.micro` | sayfa başı; `.micro` = küçük harf, geniş aralıklı mikro etiket (10.5px, letter-spacing .24em) — BÜYÜK HARF yerine bu |
| Ayraç/şerit | `.hairline`, `.statstrip` (`> div` hücreleri, `strong` sayı), `.sheet-handle` | kılcal üst çizgi; yan yana istatistik şeridi; alt sayfanın tutamacı |
| Yüzen | `.fab` (46px yuvarlak, sağ alt), `.nefes` (yavaş nefes animasyonu) | haritada yüzen eylem düğmesi; logo/işaretçi nefes efekti |
| Bağlantı | `.textlink` | metin içi turuncu bağlantı |

## Token'lar (`var(--…)`, hepsi `styles.css` kapanışında tanımlı)
- Degrade (yalnız 4 yerde): `--grad` (135°), `--grad-h` (yatay), `--grad-start`, `--grad-end`
- Marka vurgu: `--brand` (#E05E2B — link, aktif ikon, mikro etiket), `--brand-dark`, `--brand-soft`, `--brand-tint`
- Zemin: `--background` (beyaz), `--surface`, `--surface-alt` (krem dolgu), `--cream`, `--map-ground`, `--overlay`
- Metin: `--text`, `--text-body`, `--text-muted`, `--text-subtle`, `--text-on-brand`
- Çizgi/şekil: `--border`, `--border-strong`, `--border-dashed`, `--radius`, `--radius-input`, `--radius-pill`, `--shadow-btn`, `--shadow-float`
- Durum: `--success`/`--success-soft`/`--on-success`, `--danger`/`--danger-soft`/`--on-danger`, `--warning`/`--warning-soft`/`--on-warning`, `--disabled`, `--disabled-text`
- Ham hex yazma; hepsi bu değişkenlerden. Yeşil = "bakım var/başarı", kırmızı = uyarı, turuncu degrade = birincil eylem/ilerleme, düz turuncu = vurgu.

## Doğruluk nerede
- Sınıflar ve token'lar: `styles.css` → `_ds_bundle.css` (web'in `theme.css`'i). Stil vermeden önce onu oku.
- Bileşen API'leri: `components/general/<Name>/<Name>.d.ts` ve `.prompt.md`.
- Bileşenler: Logo, Wordmark, AnimalAvatar, UserAvatar, BadgeSymbol, LevelMark, LevelBar, BadgeCatalogModal, BadgeAwardModal, LoadMoreButton, HeartBurst, RecentComments (+ PatiRouter).

## Örnek: profil kartı
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
