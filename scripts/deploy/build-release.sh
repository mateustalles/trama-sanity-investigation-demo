#!/usr/bin/env bash
# Execute as root only to load the protected environment, then build as app user.
set -euo pipefail
release=${1:?Pass an absolute inspected release directory}
case "$release" in /opt/trama-demo/releases/*) ;; *) exit 2 ;; esac
test -f "$release/package.json"
test -f "$release/pnpm-lock.yaml"
set -a
source /etc/trama-demo.env
set +a
export PATH="/opt/trama-demo/toolchain/node-v24.19.0-linux-x64/bin:$PATH"
export NODE_OPTIONS='--max-old-space-size=1024'
export TRAMA_LOW_MEMORY_BUILD=true
chown -R trama-demo:trama-demo "$release"
cd "$release"
runuser -u trama-demo -- pnpm install --frozen-lockfile --ignore-scripts
runuser -u trama-demo -- pnpm build
printf '%s\n' 'Release built. This script does not switch the running release.'
