#!/usr/bin/env bash
# One-time bootstrap for an inspected, empty AlmaLinux 9 VPS. No app secrets.
set -euo pipefail
test "$(id -u)" = 0
test "$(uname -m)" = x86_64
node_version=24.19.0
base=/opt/trama-demo
cache=/var/cache/trama-demo
install -d -m 0755 "$base/toolchain" "$base/releases" "$cache"
if ! id trama-demo >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/trama-demo --create-home --shell /sbin/nologin trama-demo
fi
# Nginx must be able to traverse to the public ACME challenge directory.
chmod 0711 /var/lib/trama-demo
if ! test -e /var/lib/trama-demo/swapfile; then
  fallocate -l 2G /var/lib/trama-demo/swapfile
  chmod 0600 /var/lib/trama-demo/swapfile
  mkswap /var/lib/trama-demo/swapfile
  swapon /var/lib/trama-demo/swapfile
  printf '%s\n' '/var/lib/trama-demo/swapfile none swap defaults 0 0' >> /etc/fstab
fi
dnf install -y nginx epel-release
dnf install -y certbot python3-certbot-nginx
if ! test -x "$base/toolchain/node-v${node_version}-linux-x64/bin/node"; then
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz" -o "$cache/node.tar.xz"
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$cache/SHASUMS256.txt"
  expected=$(awk -v target="node-v${node_version}-linux-x64.tar.xz" '$2 == target {print $1}' "$cache/SHASUMS256.txt")
  test "${#expected}" = 64
  printf '%s  %s\n' "$expected" "$cache/node.tar.xz" | sha256sum --check -
  tar -xJf "$cache/node.tar.xz" -C "$base/toolchain"
fi
export PATH="$base/toolchain/node-v${node_version}-linux-x64/bin:$PATH"
if ! test -x "$base/toolchain/node-v${node_version}-linux-x64/bin/pnpm"; then
  npm install --global --ignore-scripts pnpm@11.7.0
fi
node --version
pnpm --version
free -m
printf '%s\n' 'Bootstrap complete. App and public routes are not started by this script.'
