#!/usr/bin/env bash
# Install dsh-preset-editor into a DSH profile.
#
#   ./scripts/install.sh [profile]    # default: web
#
# The profile's plugin manager forwards `add link:<this directory>` to pnpm and
# appends the package to dsh.profile.bundles, so the bundle layer's
# cordis.patch.yml inserts the `preset-editor` Loader row. Restart the profile
# afterwards (or let dsh-hmr reload it) and open Settings -> 预设管理.
set -euo pipefail

profile="${1:-web}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v dsh >/dev/null 2>&1; then
  echo "dsh command not found. Install @deepseek-ai/dsh or run this through your packaged DSH launcher." >&2
  exit 1
fi

if [ ! -d "${here}/node_modules/js-yaml" ]; then
  echo "Installing runtime dependency js-yaml in ${here}..."
  (cd "${here}" && npm install --omit=dev)
fi

echo "Installing ${here} into profile '${profile}'..."
dsh plugin --profile "${profile}" add "link:${here}"
echo
echo "Installed. Restart the profile (for example: dsh --profile ${profile}) and open Settings -> 预设管理."
echo "State lives in \$DSH_HOME/preset-editor/native.json and is kept across reinstalls."
