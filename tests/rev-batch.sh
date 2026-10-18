#!/usr/bin/env bash
# Batch compare driver for the 0.35.8 full re-verification (v2: fixed process-tree kill).
# Usage: bash .tmp-frame/rev-0.35.8-batch.sh <label> <only-substring> [timeout-sec]
#
# v2 fix: under MSYS2/Git Bash, `$!` is NOT the Windows PID, so `taskkill //PID $!`
# hit the wrong process and left the real compare node tree (npx+tsx+loader)
# running as orphans (observed 2026-10-18: 3 orphaned processes from a timed-out
# probe, spinning for 5+ min). The kill now targets the real Windows PIDs
# discovered via Get-CimInstance, with a sweep fallback for any compare.ts node
# process still alive.

set -u
cd "D:/Faicad/faijs-cadquery"

LABEL="${1:?label}"
ONLY="${2:?only-substring}"
BUDGET="${3:-240}"

LOG="out/compare-0.35.8-${LABEL}.log"
ARCHIVE="out/report-0.35.8-${LABEL}.json"

kill_compare_procs() {
  # Kill every node process whose command line is our compare run. Safe: batches
  # run strictly sequentially, so any such process is ours (or a stale orphan —
  # which we WANT to reap anyway, per the 10-12 memory-pollution methodology).
  pwsh -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'tests/compare\.ts' } | ForEach-Object { taskkill //F //PID \$_.ProcessId 2>\$null }" 2>/dev/null
}

# Pre-batch hygiene: reap any orphaned compare process from earlier failures.
kill_compare_procs

npx tsx tests/compare.ts --only "$ONLY" > "$LOG" 2>&1 &
PID=$!

start=$(date +%s)
while kill -0 "$PID" 2>/dev/null; do
  now=$(date +%s)
  if [ $((now - start)) -ge "$BUDGET" ]; then
    kill_compare_procs
    kill -9 "$PID" 2>/dev/null
    wait "$PID" 2>/dev/null
    end=$(date +%s)
    sleep 1
    REMAIN=$(pwsh -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\").CommandLine -match 'tests/compare\.ts' | Measure-Object | Select-Object -Expand Count")
    if [ "${REMAIN:-0}" -gt 0 ]; then
      echo "BATCH ${LABEL} TIMEOUT after $((end - start))s (BUDGET ${BUDGET}s) — ${REMAIN} compare proc(s) SURVIVED the kill"
      exit 125
    fi
    echo "BATCH ${LABEL} TIMEOUT after $((end - start))s (budget ${BUDGET}s), process tree killed"
    exit 124
  fi
  sleep 1
done
wait "$PID" 2>/dev/null
RC=$?
end=$(date +%s)

if [ $RC -ne 0 ]; then
  echo "BATCH ${LABEL} FAILED rc=${RC} after $((end - start))s"
  tail -5 "$LOG"
  exit $RC
fi

cp out/report.json "$ARCHIVE"
SUMMARY=$(grep '^compare:' "$LOG" | tail -1)
echo "BATCH ${LABEL} done in $((end - start))s | ${SUMMARY} | archived -> ${ARCHIVE}"
