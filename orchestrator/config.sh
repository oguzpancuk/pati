#!/usr/bin/env bash
# Orkestratör yapılandırması. run.sh bunu kaynak olarak alır.
#
# Burayı düzenleyin; run.sh'a dokunmanız gerekmiyor.

# ---------------------------------------------------------------------------
# Proje ve stack
# ---------------------------------------------------------------------------
PROJECT_NAME="pati"
PROJECT_SUMMARY="Sokak hayvanları bakım koordinasyon uygulaması: harita üzerinde
mama/su bırakılan noktalar, hayvan profilleri, sağlık kaydı, rozet ve sıralama."

# DİKKAT — stack bilerek projenin gerçek hâline ayarlı.
#
# İstek "React + Express + MongoDB" diye geldi ama depodaki gerçek durum:
#   * Mobil taraf React NATIVE (web React değil). Web React yalnızca admin/ .
#   * Veritabanı PostgreSQL + PostGIS. Uygulamanın çekirdek özelliği coğrafi
#     sorgu (ST_DWithin ile "100 m içinde bakım var mı", ST_MakeEnvelope ile
#     harita penceresi, GIST indeksleri). MongoDB'nin 2dsphere'i bunların bir
#     kısmını karşılar ama çalışan ve test edilmiş her sorgunun yeniden
#     yazılması gerekir.
#
# Gerçekten MongoDB'ye geçilecekse aşağıdaki DB_STACK satırını değiştirin;
# agent'lar yeni stack'e göre çalışır. Geçiş kararının gerekçesi önce
# docs/NOTLAR.md'ye yazılmalı.
FRONTEND_STACK="React Native 0.74 (mobile/) + React 18 & Vite (admin/), TypeScript"
BACKEND_STACK="Node.js + Express (backend/), JWT + bcrypt"
DB_STACK="PostgreSQL 16 + PostGIS"
# DB_STACK="MongoDB (2dsphere geo index)"   # <- MongoDB'ye geçmek isterseniz

# ---------------------------------------------------------------------------
# Çalıştırma
# ---------------------------------------------------------------------------
# Agent'ları koşturan komut. Headless Claude Code.
AGENT_CMD="${AGENT_CMD:-claude}"
AGENT_MODEL="${AGENT_MODEL:-}"           # boş bırakılırsa CLI varsayılanı
AGENT_TIMEOUT_SECONDS="${AGENT_TIMEOUT_SECONDS:-1800}"
AGENT_MAX_TURNS="${AGENT_MAX_TURNS:-60}"

# Agent'lara verilen izin modu. `acceptEdits` dosya düzenlemeye izin verir ama
# kabuk komutları yine sorar. Tam otomatik koşu için `bypassPermissions`
# gerekir — bunu bilerek varsayılan YAPMADIK: gözetimsiz bir agent'ın kabuğa
# sınırsız erişmesi, kendi çalışma ağacının dışına çıkabilmesi demek.
AGENT_PERMISSION_MODE="${AGENT_PERMISSION_MODE:-acceptEdits}"

# Aynı anda en fazla kaç agent koşsun.
MAX_PARALLEL="${MAX_PARALLEL:-3}"

# Dalga (wave) düzeni.
#   1 → bağımlılık sırasına uy: önce kod, sonra test, sonra denetim.
#   0 → altısını da aynı anda koştur (istekte "6 paralel" denmişti).
#
# 0 seçilirse test/güvenlik/review agent'ları HENÜZ YAZILMAMIŞ kodu inceler;
# çıktıları o koşuda anlamsız olur. Bunu bilerek seçin.
USE_WAVES="${USE_WAVES:-1}"

# ---------------------------------------------------------------------------
# Agent tanımları:  id | dalga | başlık
# ---------------------------------------------------------------------------
# Dalga 1: kodu üreten/değiştiren agent'lar, birbirinden bağımsız.
# Dalga 2: kodun üstüne test yazar.
# Dalga 3: kodu ve testleri denetler; çıktı üretir, kod değiştirmez.
AGENTS=(
  "backend|1|Backend (Express + veri katmanı)"
  "frontend|1|Arayüz (React Native + admin)"
  "tests|2|Otomatik testler"
  "security|3|Güvenlik denetimi"
  "review|3|Kod incelemesi"
  "docs|3|Dokümantasyon"
)

# ---------------------------------------------------------------------------
# Git
# ---------------------------------------------------------------------------
# Agent'lar bu daldan türeyen izole dallarda çalışır; ana dal hiç dokunulmaz.
BASE_BRANCH="${BASE_BRANCH:-main}"
# Sonuçların birleştirildiği dal. Her koşuda tarih damgalı yeni bir dal açılır.
INTEGRATION_PREFIX="${INTEGRATION_PREFIX:-orch}"
# Push BİLEREK yok. Otomatik koşunun sonucunu insan görmeden uzağa göndermeyin.
AUTO_PUSH=0
