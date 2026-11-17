#!/usr/bin/env bash
# Remove dsh-preset-editor from a DSH profile. The preset state is kept so a
# reinstall restores the user's data; delete it manually to start clean:
#
#   rm -rf "$DSH_HOME/preset-editor"
set -euo pipefail

profile="${1:-web}"
if ! command -v dsh >/dev/null 2>&1; then
  echo "dsh command not found." >&2
  exit 1
fi

dsh plugin --profile "${profile}" remove dsh-preset-editor
echo "Removed from profile '${profile}'. State under \$DSH_HOME/preset-editor was kept."
