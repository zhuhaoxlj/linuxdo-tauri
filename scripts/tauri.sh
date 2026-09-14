#!/usr/bin/env bash
set -euo pipefail

# Keep every Tauri command except the plain release build unchanged.
if [[ $# -ne 1 || $1 != "build" ]]; then
    exec tauri "$@"
fi

command -v pkexec >/dev/null 2>&1 || {
    echo "Error: pkexec is required to show the graphical authentication dialog." >&2
    exit 1
}

marker=$(mktemp)
trap 'rm -f "$marker"' EXIT

tauri build --bundles deb

mapfile -d '' packages < <(
    find src-tauri/target -type f -path '*/release/bundle/deb/*.deb' -newer "$marker" -print0
)

if [[ ${#packages[@]} -ne 1 ]]; then
    echo "Error: expected one newly built deb package, found ${#packages[@]}." >&2
    exit 1
fi

deb=$(realpath "${packages[0]}")
echo "Installing $deb"
/usr/bin/pkexec /usr/bin/dpkg -i "$deb"
