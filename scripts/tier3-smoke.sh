#!/usr/bin/env bash
#
# Tier-3 smoke tests (`docs/06` §7 M11, §0 acceptance #3).
#
# Per framework, using the *packed* CLI:
#   hono     : generate `hono-standard` → install → build (PORT baked) → start →
#              curl `/healthz` == 200 → graceful SIGTERM (exit 0).
#   vue      : generate `vue-naive-tw` → install → build → `vite preview` on a
#              free port → curl == 200.
#   electron : generate `--features electron/builder` → install → build →
#              `electron-builder --dir` → launch the unpacked binary; uses
#              `xvfb-run -a` when `DISPLAY` is unset (`--no-sandbox`), asserts
#              the process stays alive N seconds and the log has no
#              "Failed to load URL" (xdotool is optional/opportunistic).
#
# Zero new dependencies (bash + Node built-ins). CI-safe: no sudo, no prompts,
# deterministic temp paths, non-zero exit if any framework fails. Logs go to
# /tmp/opencode/tier3-*.log; processes/dirs are cleaned up on exit via trap.
#
# Env: TIER3_DIR (scratch root, default /tmp/opencode/tier3), TIER3_STORE,
#      TIER3_KEEP=1 (keep scratch dirs for debugging),
#      TIER3_ELECTRON_ALIVE_SECS (default 10).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$REPO_ROOT/packages/create-code4x/dist/cli.mjs"
BASE_DIR="${TIER3_DIR:-/tmp/opencode/tier3}"
LOG_DIR="${TIER3_LOG_DIR:-/tmp/opencode}"
STORE="${TIER3_STORE:-$(pnpm store path 2>/dev/null || echo "$BASE_DIR/store")}"
ALIVE_SECS="${TIER3_ELECTRON_ALIVE_SECS:-10}"
KEEP="${TIER3_KEEP:-0}"

mkdir -p "$BASE_DIR" "$LOG_DIR"

PIDS=()
DIRS=()
FAILED=()
RESULTS=()

log() { printf '%s\n' "$*"; }
hr() { printf '%s\n' "------------------------------------------------------------"; }

# --- process / dir bookkeeping -------------------------------------------

stop_pid() {
  local pid="$1" sig="${2:-TERM}"
  kill -"$sig" "$pid" 2>/dev/null || true
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  for pid in "${PIDS[@]:-}"; do
    [ -n "${pid:-}" ] || continue
    if kill -0 "$pid" 2>/dev/null; then
      stop_pid "$pid" TERM
      for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.3; done
      kill -0 "$pid" 2>/dev/null && stop_pid "$pid" KILL
    fi
  done
  if [ "$KEEP" != "1" ]; then
    for dir in "${DIRS[@]:-}"; do [ -n "${dir:-}" ] && rm -rf "$dir"; done
  else
    log "TIER3_KEEP=1 — keeping scratch dirs under $BASE_DIR"
  fi
  exit "$code"
}
trap cleanup EXIT INT TERM

# --- helpers --------------------------------------------------------------

free_port() {
  node -e '
    const net = require("node:net")
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      process.stdout.write(String(server.address().port))
      server.close()
    })
  '
}

# Poll `url` until it answers 2xx (or timeout). Returns the HTTP status code.
wait_http() {
  local url="$1" timeout="${2:-40}"
  local deadline=$((SECONDS + timeout)) code
  while :; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" 2>/dev/null || true)"
    if [ -n "$code" ] && [ "$code" != "000" ]; then printf '%s' "$code"; return 0; fi
    [ "$SECONDS" -ge "$deadline" ] && return 1
    sleep 0.5
  done
}

generate() {
  # generate <dir> <cli-args...>
  local dir="$1"; shift
  rm -rf "$dir"
  DIRS+=("$dir")
  node "$CLI" "$dir" "$@" -y --no-install --no-git
}

install_deps() {
  ( cd "$1" && pnpm install --store-dir "$STORE" --prefer-offline )
}

# --- hono -----------------------------------------------------------------

smoke_hono() {
  local dir="$BASE_DIR/hono" log="$LOG_DIR/tier3-hono.log" port pid code rc
  hr; log "[tier3] hono (hono-standard): install → build → start → /healthz → SIGTERM"
  generate "$dir" -f hono -p hono-standard || { log "  ✘ generate failed"; return 1; }
  install_deps "$dir" >"$log" 2>&1 || { log "  ✘ pnpm install failed (see $log)"; return 1; }
  port="$(free_port)"
  log "  port: $port"
  ( cd "$dir" && PORT="$port" pnpm run build ) >>"$log" 2>&1 || { log "  ✘ build failed (see $log)"; return 1; }

  ( cd "$dir" && exec node dist/index.js ) >>"$log" 2>&1 &
  pid=$!; PIDS+=("$pid")

  code="$(wait_http "http://127.0.0.1:$port/healthz" 40)" || { log "  ✘ /healthz never answered"; return 1; }
  log "  GET /healthz -> $code"
  [ "$code" = "200" ] || { log "  ✘ expected 200"; return 1; }

  kill -TERM "$pid" 2>/dev/null || true
  rc=0; wait "$pid" || rc=$?
  if [ "$rc" -ne 0 ]; then log "  ✘ non-graceful SIGTERM (exit $rc)"; return 1; fi
  log "  SIGTERM -> graceful exit 0"
  return 0
}

# --- vue ------------------------------------------------------------------

smoke_vue() {
  local dir="$BASE_DIR/vue" log="$LOG_DIR/tier3-vue.log" port pid code
  hr; log "[tier3] vue (vue-naive-tw): install → build → preview → HTTP 200"
  generate "$dir" -f vue -p vue-naive-tw || { log "  ✘ generate failed"; return 1; }
  install_deps "$dir" >"$log" 2>&1 || { log "  ✘ pnpm install failed (see $log)"; return 1; }
  ( cd "$dir" && pnpm run build ) >>"$log" 2>&1 || { log "  ✘ build failed (see $log)"; return 1; }

  port="$(free_port)"
  log "  port: $port"
  # `--host 127.0.0.1` pins the IPv4 loopback: `vite preview` otherwise binds
  # `localhost` (often `::1` only), which a `127.0.0.1` health check misses.
  ( cd "$dir" && exec pnpm exec vite preview --host 127.0.0.1 --port "$port" --strictPort ) >>"$log" 2>&1 &
  pid=$!; PIDS+=("$pid")

  code="$(wait_http "http://127.0.0.1:$port/" 40)" || { log "  ✘ preview never answered"; return 1; }
  log "  GET / -> $code"
  [ "$code" = "200" ] || { log "  ✘ expected 200"; return 1; }

  stop_pid "$pid" TERM
  return 0
}

# --- electron -------------------------------------------------------------

smoke_electron() {
  local dir="$BASE_DIR/electron" log="$LOG_DIR/tier3-electron.log" name bin pid
  local launcher=() started elapsed
  hr; log "[tier3] electron (--features electron/builder): build → electron-builder --dir → launch"
  generate "$dir" -f electron --features electron/builder || { log "  ✘ generate failed"; return 1; }
  install_deps "$dir" >"$log" 2>&1 || { log "  ✘ pnpm install failed (see $log)"; return 1; }
  ( cd "$dir" && pnpm run dist:dir ) >>"$log" 2>&1 || { log "  ✘ dist:dir (build/pack) failed (see $log)"; return 1; }

  name="$(node -e "process.stdout.write(require('$dir/package.json').name)")"
  bin="$dir/release/linux-unpacked/$name"
  [ -x "$bin" ] || { log "  ✘ unpacked binary not found: $bin"; return 1; }
  log "  binary: $bin"

  if [ -z "${DISPLAY:-}" ]; then
    if command -v xvfb-run >/dev/null 2>&1; then
      launcher=(xvfb-run -a)
      log "  DISPLAY unset → xvfb-run -a"
    else
      log "  ✘ DISPLAY unset and xvfb-run not installed"; return 1
    fi
  else
    log "  DISPLAY=$DISPLAY → native display (no xvfb)"
  fi

  "${launcher[@]}" "$bin" --no-sandbox --disable-gpu >>"$log" 2>&1 &
  pid=$!; PIDS+=("$pid")

  started=$SECONDS
  while [ $((SECONDS - started)) -lt "$ALIVE_SECS" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then log "  ✘ electron exited early"; return 1; fi
    sleep 1
  done
  elapsed=$((SECONDS - started))
  log "  process alive ${elapsed}s (pid $pid)"

  if grep -q "Failed to load URL" "$log"; then log "  ✘ log contains 'Failed to load URL'"; return 1; fi
  log "  log clean of 'Failed to load URL'"

  if command -v xdotool >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then
    local windows
    windows="$(xdotool search --onlyvisible --name '.' 2>/dev/null | wc -l || true)"
    log "  xdotool (optional): ${windows} visible window(s)"
  fi

  stop_pid "$pid" TERM
  return 0
}

# --- driver ---------------------------------------------------------------

[ -f "$CLI" ] || { log "error: packed CLI not found at $CLI"; log "run: pnpm exec vp -C packages/create-code4x pack"; exit 1; }
command -v curl >/dev/null 2>&1 || { log "error: curl is required"; exit 1; }

log "Tier-3 smoke: scratch=$BASE_DIR store=$STORE"

for framework in hono vue electron; do
  if "smoke_$framework"; then
    RESULTS+=("$framework: PASS"); log "  ✔ $framework PASS"
  else
    RESULTS+=("$framework: FAIL"); FAILED+=("$framework"); log "  ✘ $framework FAIL"
  fi
done

hr
log "===== Tier-3 summary ====="
for entry in "${RESULTS[@]}"; do log "  $entry"; done
hr

if [ "${#FAILED[@]}" -gt 0 ]; then
  log "failed: ${FAILED[*]}"
  exit 1
fi
log "all frameworks passed"
