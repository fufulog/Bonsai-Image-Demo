#!/bin/sh
# Thin wrapper around scripts/color_to_alpha.py.
#
# Usage:
#   ./scripts/color_to_alpha.sh -i input.png -c "#ffffff" -t 30 -f 10
#
set -e

DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DEMO_DIR/scripts/common.sh"
ensure_venv "$DEMO_DIR"

exec "$DEMO_DIR/.venv/bin/python" "$DEMO_DIR/scripts/color_to_alpha.py" "$@"
