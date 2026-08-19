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
- Yönetim paneli (`admin/`) henüz yayında değil; ayrı bir statik site olarak
  eklenecek.
- Rate limit yalnızca `/api/auth` (15 dk'da 30 deneme).
