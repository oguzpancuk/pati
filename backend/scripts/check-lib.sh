#!/usr/bin/env bash
# Shared pieces of the curl check harnesses (social-auth-check,
# email-verification-check). Source it; do not run it.

# Readiness means OUR process is the one listening — not that something
# answers. A stale pair left by a killed run holds both ports; our processes
# die with EADDRINUSE, the stale ones answer the readiness probes, and every
# assertion becomes evidence about old code while the script prints green.
# A liveness check taken the instant the probe succeeds loses that race
# (review reproduced it 3/3), so this loops until our pid is either the
# listener or dead. lsof is the arbiter; without it we refuse to run.
command -v lsof >/dev/null 2>&1 || {
  echo "lsof is required to prove the listening process is ours" >&2
  exit 1
}
wait_for_ours() { # port pid name probe-url log
  local port="$1" pid="$2" name="$3" probe="$4" log="$5" listener
  for _ in $(seq 1 30); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "our $name is not running — port $port is probably held by something else" >&2
      echo "(log: $log)" >&2
      return 1
    fi
    listener="$(lsof -t -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | head -1)"
    if [ "$listener" = "$pid" ] && curl -sf "$probe" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "our $name never became the listener on port $port (held by pid ${listener:-?})" >&2
  return 1
}
