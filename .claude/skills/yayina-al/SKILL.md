---
name: yayina-al
description: main'in son halini Fly.io'ya deploy et (pati-app.com + admin.pati-app.com), sonra canlıyı doğrula. "canlıya al", "deploy et", "yayına al" denince kullan. Yalnızca Operasyon oturumu (fly girişi olan Mac) çalıştırabilir.
---

# Yayına al

Kaynak: `docs/YAYIN.md`. Uygulama `pati-app` (Fly.io, fra), veritabanı `pati-db`
(PostGIS, 1 GB RAM). Tek imaj: backend + web/dist + admin/dist.

1. `git fetch origin && git status -sb` — geride kalmışsan `git pull --rebase --autostash origin main`.
   Çakışma çıkarsa durup bildir; çözmeden deploy etme.
2. `fly auth whoami` boşsa dur: kullanıcıya "kendi terminalinde `fly auth login`" de.
3. `fly deploy --app pati-app --ha=false` — çıktıda `release_command … completed` ve
   `Machine … is now in a good state` gör. `release_command failed` ise
   `fly status -a pati-db` (makine durmuşsa `fly machine start <id> -a pati-db`)
   ve `fly logs -a pati-app --no-tail | tail -40`.
4. Doğrula: `curl -s https://pati-app.com/health` → `{"status":"ok"}`;
   `curl -s -o /dev/null -w "%{http_code}" https://pati-app.com/` ve
   `https://admin.pati-app.com/` → 200. Görsel değişiklik varsa
   `web-ekran` skill'i ile canlıdan bir ekran görüntüsü al.
5. Şema değiştiyse migrate zaten release adımında koştu; veri scripti gerekiyorsa
   (`seed-rehber.js --tazele/--temizle`) `fly ssh console --app pati-app -C "node scripts/…"`.
6. Kullanıcıya raporla: commit kısa hash'i, deploy sonucu, doğrulama satırları,
   varsa uyarı. Sırları (DB şifresi, JWT) asla yazma.
