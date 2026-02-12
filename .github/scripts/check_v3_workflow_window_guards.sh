#!/usr/bin/env bash
set -euo pipefail

WORKFLOWS=(
  ".github/workflows/scrape-v3-detect.yml"
  ".github/workflows/scrape-v3-detail-worker.yml"
  ".github/workflows/scrape-v3-reconcile.yml"
)

failure=0

for workflow in "${WORKFLOWS[@]}"; do
  if ! grep -Fq 'id: run_window' "${workflow}"; then
    echo "Missing run_window step id in ${workflow}"
    failure=1
  fi

  if ! grep -Fq 'local_hour="$(TZ=Europe/Amsterdam date +%H)"' "${workflow}"; then
    echo "Missing Europe/Amsterdam hour check in ${workflow}"
    failure=1
  fi

  if ! grep -Fq 'if [ "${local_hour}" -ge 6 ] && [ "${local_hour}" -lt 22 ]; then' "${workflow}"; then
    echo "Missing 06:00-22:00 local window condition in ${workflow}"
    failure=1
  fi

  gated_steps="$(grep -Fc "if: steps.run_window.outputs.should_run == 'true'" "${workflow}" || true)"
  if [ "${gated_steps}" -lt 4 ]; then
    echo "Expected at least 4 guarded execution steps in ${workflow}, found ${gated_steps}"
    failure=1
  fi

  if grep -Fq "force_run" "${workflow}"; then
    echo "Found disallowed manual bypass input force_run in ${workflow}"
    failure=1
  fi
done

if [ "${failure}" -ne 0 ]; then
  echo "V3 workflow run-window guard checks failed."
  exit 1
fi

echo "V3 workflow run-window guard checks passed."
