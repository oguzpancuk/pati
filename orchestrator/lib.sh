#!/usr/bin/env bash
# run.sh'ın yardımcıları. Tek başına çalıştırılmaz.

# --- günlükleme -------------------------------------------------------------
if [ -t 1 ]; then
  C_DIM=$'\033[2m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_OFF=$'\033[0m'
else
  C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_OFF=''
fi

log()  { printf '%s[%s]%s %s\n' "$C_DIM" "$(date +%H:%M:%S)" "$C_OFF" "$*"; }
info() { printf '%s▸%s %s\n' "$C_BLUE" "$C_OFF" "$*"; }
ok()   { printf '%s✓%s %s\n' "$C_GREEN" "$C_OFF" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YELLOW" "$C_OFF" "$*" >&2; }
die()  { printf '%s✗%s %s\n' "$C_RED" "$C_OFF" "$*" >&2; exit 1; }

# --- zaman aşımı ------------------------------------------------------------
# macOS'ta `timeout` yok (coreutils ile `gtimeout` geliyor). Üçüncü seçenek
# olarak saf bash bir bekçi süreç kullanıyoruz ki hiçbir makinede takılıp
# kalmasın.
run_with_timeout() {
  local seconds="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground "$seconds" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout --foreground "$seconds" "$@"
  else
    "$@" &
    local pid=$!
    (
      sleep "$seconds"
      # Hâlâ yaşıyorsa önce nazikçe, sonra sertçe.
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null
        sleep 5
        kill -KILL "$pid" 2>/dev/null
      fi
    ) &
    local watchdog=$!
    local status=0
    wait "$pid" || status=$?
    kill "$watchdog" 2>/dev/null || true
    return "$status"
  fi
}

# --- ön koşullar ------------------------------------------------------------
require_clean_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    die "Çalışma ağacı temiz değil. Agent'lar mevcut değişikliklerin üstüne
   yazabilir. Önce commit'leyin ya da 'git stash' yapın."
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' bulunamadı. $2"
}

# --- git worktree -----------------------------------------------------------
# Her agent kendi çalışma ağacında koşar. Sebep: altı agent aynı klasörde
# çalışırsa birbirinin dosyalarını ezer ve hangi değişikliğin kimden geldiği
# kaybolur. Ayrı worktree = ayrı dal = izlenebilir, geri alınabilir.
create_worktree() {
  local id="$1" base="$2" branch="$3" path="$4"
  git worktree add --quiet -b "$branch" "$path" "$base" \
    || die "worktree oluşturulamadı: $id"
}

remove_worktree() {
  local path="$1"
  [ -d "$path" ] || return 0
  git worktree remove --force "$path" >/dev/null 2>&1 || true
}

# Agent'ın bıraktığı değişiklikleri kendi dalına commit'ler.
# Agent commit'lemeyi unutsa bile sonuç kaybolmasın diye orkestratör yapıyor.
commit_worktree() {
  local path="$1" id="$2" run_id="$3"
  ( cd "$path" || return 1
    if [ -z "$(git status --porcelain)" ]; then
      return 2   # değişiklik yok
    fi
    git add -A
    git commit --quiet -m "orchestrator/$id: otomatik koşu $run_id

Bu commit orkestratör tarafından oluşturuldu; içeriği '$id' agent'ı üretti.
İncelenmeden ana dala alınmamalı." >/dev/null
  )
}
