#!/usr/bin/env bash
#
# vp-harness run: exercise `vp create code4x` end-to-end in a scratch monorepo.
#
# Lane A: hono + zod,swagger-openapi
# Lane B: vue + vue-full preset
# Plus one observation lane without `--approve-builds`.
#
# Usage: bash fixtures/vp-harness/run.sh [TARGET_DIR]
set -euo pipefail

TARGET="${1:-/tmp/opencode/vp-harness}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/tmp/opencode"
VP_TIMEOUT="${VP_TIMEOUT:-600}"

# vp-level flags (before `--`); everything after `--` is forwarded to our CLI.
VP_FLAGS=(--no-interactive --no-hooks --approve-builds)

fail() {
  echo "ASSERT FAIL: $*" >&2
  exit 1
}

assert_lane() {
  local name="$1" pos="$2"
  local dir="$TARGET/apps/$pos"
  [ -d "$dir" ] || fail "lane $name: expected generated dir $dir"
  [ -f "$dir/.code4xrc.json" ] || fail "lane $name: missing .code4xrc.json in $dir"
  [ ! -f "$dir/pnpm-workspace.yaml" ] || fail "lane $name: nested pnpm-workspace.yaml should be absent"
  local nested
  nested="$(node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).context.nestedWorkspace))" "$dir/.code4xrc.json")"
  [ "$nested" = "true" ] || fail "lane $name: context.nestedWorkspace expected true, got $nested"
  echo "lane $name OK: dir=$dir nestedWorkspace=$nested"
}

run_lane() {
  local name="$1" pos="$2"
  shift 2
  echo
  echo "===== lane $name: vp create code4x ${VP_FLAGS[*]} -- $pos $* ====="
  set +e
  ( cd "$TARGET" && timeout "$VP_TIMEOUT" vp create code4x "${VP_FLAGS[@]}" -- "$pos" "$@" ) \
    2>&1 | tee "$LOG_DIR/vp-harness-$name.log"
  local rc=${PIPESTATUS[0]}
  set -e
  echo "lane $name: vp exit=$rc"
  [ "$rc" -eq 0 ] || fail "lane $name: vp create exited $rc"
  assert_lane "$name" "$pos"
}

# Lane A is vp-native (hono): build with `vp build` and run the built server.
assert_build_lane() {
  local name="$1" pos="$2" port="$3" path="$4"
  local dir="$TARGET/apps/$pos"
  echo
  echo "===== lane $name build smoke: vp build + node dist/index.js (port $port) ====="
  set +e
  ( cd "$dir" && PORT="$port" timeout "$VP_TIMEOUT" pnpm exec vp build ) \
    2>&1 | tee "$LOG_DIR/vp-harness-$name-build.log"
  local rc=${PIPESTATUS[0]}
  set -e
  echo "lane $name: vp build exit=$rc"
  [ "$rc" -eq 0 ] || fail "lane $name: vp build exited $rc"
  [ -f "$dir/dist/index.js" ] || fail "lane $name: missing dist/index.js"

  ( cd "$dir" && setsid node dist/index.js > "$LOG_DIR/vp-harness-$name-serve.log" 2>&1 & echo $! > "$LOG_DIR/vp-harness-$name.pid" )
  local srv
  srv="$(cat "$LOG_DIR/vp-harness-$name.pid")"
  sleep 3
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$port$path" || echo 000)"
  kill -- -"$srv" 2>/dev/null || true
  sleep 1
  echo "lane $name: built server $path -> $code"
  [ "$code" = "200" ] || fail "lane $name: built server $path expected 200, got $code"
  echo "lane $name build smoke OK"
}

# 1. Setup the scratch monorepo (also builds the repo CLI).
bash "$SCRIPT_DIR/setup.sh" "$TARGET"

# 2. Lanes with --approve-builds.
run_lane A api -f hono --features zod,swagger-openapi -y --no-git
assert_build_lane A api 3996 /openapi.json
run_lane B web -f vue -p vue-full -y --no-git

# 3. Observation lane WITHOUT --approve-builds (expected to hit ignored-builds).
echo
echo "===== observation: vp create without --approve-builds ====="
set +e
( cd "$TARGET" && timeout "$VP_TIMEOUT" vp create code4x --no-interactive --no-hooks -- noapprove -f vue -p vue-full -y --no-git ) \
  2>&1 | tee "$LOG_DIR/vp-harness-noapprove.log"
NOAPPROVE_RC=${PIPESTATUS[0]}
set -e
echo "observation: vp exit=$NOAPPROVE_RC (non-zero is acceptable; recorded in the log)"

echo
echo "===== generated tree ====="
find "$TARGET/apps" -maxdepth 2 -type d | sort
echo
echo "== harness done =="
