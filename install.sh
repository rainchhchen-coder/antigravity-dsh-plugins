#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${HOME}/.gemini/config/plugins"
mkdir -p "${TARGET_ROOT}"

for dir in "${SCRIPT_DIR}/plugins/"*; do
  [ -d "${dir}" ] || continue
  name="$(basename "${dir}")"
  rm -rf "${TARGET_ROOT:?}/${name}"
  cp -R "${dir}" "${TARGET_ROOT}/${name}"
  echo "[OK] Installed ${name} -> ${TARGET_ROOT}/${name}"
done

echo ""
echo "All 3 plugins installed! Open Antigravity Customizations to view or toggle them."
