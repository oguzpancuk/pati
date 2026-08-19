# Yayın (Fly.io)

Tek imaj: Node backend + derlenmiş web PWA (`/`), tanıtım sayfası `/tanitim/`,
API `/api`. Fotoğraflar kalıcı Fly volume'da (`/data/uploads`); veritabanı
PostGIS'li Fly Postgres. Yapılandırma: kökteki `Dockerfile`, `fly.toml`.

## İlk kurulum (bir kez)
```bash
brew install flyctl
fly auth login                                  # tarayıcı açılır
fly apps create pati-app                        # ad doluysa fly.toml'daki app'i değiştir
fly postgres create --name pati-db --region fra --vm-size shared-cpu-1x --initial-cluster-size 1 --volume-size 3
fly postgres attach pati-db --app pati-app      # DATABASE_URL secret'ını yazar
fly volumes create uploads --region fra --size 3 --app pati-app
fly secrets set JWT_SECRET="$(openssl rand -hex 32)" JWT_EXPIRES_IN=7d --app pati-app
fly deploy                                      # build + release_command (migrate) + start
fly open                                        # https://pati-app.fly.dev
```
PostGIS: `postgres-flex` imajında hazır; `001_init.sql` içindeki
`CREATE EXTENSION IF NOT EXISTS postgis` release adımında koşar.

İlk admin: uygulamadan kayıt ol, sonra
`fly ssh console --app pati-app -C "node scripts/make-admin.js eposta@adres"`.

## Rehber (demo) verisi

Uygulama boş haritayla açılmasın diye İstanbul merkez ilçeleri, İzmir merkez
ilçeleri ve Antalya/Kaş'a "rehber" kullanıcılar eklenebilir: her ilçede 10
hesap, bir aylık organik kullanım geçmişiyle (haftada ~3 hayvan, gün aşırı
mama/su, sohbet, aşı/sağlık kayıtları). Bot oldukları gizlenmez — adları
"… · pati rehberi", her hayvanın ilk yorumu kaydın örnek olduğunu söyler;
yorumlar aynı zamanda uygulamanın nasıl kullanıldığını anlatır.

```bash
fly ssh console --app pati-app -C "node scripts/seed-rehber.js"            # kur
fly ssh console --app pati-app -C "node scripts/seed-rehber.js --tazele"   # taze mama/su
fly ssh console --app pati-app -C "node scripts/seed-rehber.js --temizle"  # tamamen geri al
```

Script yalnızca EKLER (`seed-demo.js`'in aksine TRUNCATE yok); mevcut
kullanıcı/hayvan/admin verisine dokunmaz, bu yüzden üretimde güvenlidir.
Rehber hesapların şifresi her kurulumda rastgele üretilir ve yalnızca script
çıktısında görünür. Haritanın yeşili 4-6 saatte solduğundan `fly.toml`'daki
`DEMO_REHBER_TAZELE = "1"` sunucuya saatte bir taze mama/su ekletir (rehber
verisi silinince kendiliğinden işlevsizleşir).

## Alan adı bağlama
```bash
fly certs add app.ALANADIN.com --app pati-app   # çıktıdaki CNAME/A kayıtlarını DNS'e ekle
fly certs show app.ALANADIN.com --app pati-app  # "Ready" olunca https hazır
```

## Sonraki deploy'lar
`git push` sonrası `fly deploy`. Şema `IF NOT EXISTS`'li tek dosya olduğu için
migrate her deploy'da güvenle koşar; kolon eklemek artımlı migrasyon ister
(YOL_HARITASI).

## Bilinen sınırlar (pilot)
- Fotoğraflar tek makinenin diskinde: makine sayısı 1 kalmalı; nesne
  depolamaya (R2/S3) geçiş yol haritasında.
- `auto_stop_machines`: trafik yokken makine uyur, ilk istek ~1-2 sn gecikir.
- Yönetim paneli aynı uygulamadan servis ediliyor: `ADMIN_HOST`
  (admin.pati-app.com) adresinden gelen istekler `admin/dist`'i alır
  (`fly certs add admin.pati-app.com` ile sertifika eklenmeli).
- Rate limit yalnızca `/api/auth` (15 dk'da 30 deneme).
