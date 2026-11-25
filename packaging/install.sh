#!/usr/bin/env bash
# QyroBot VPS Installer (AMD64 x86_64 & Oracle Ampere ARM64 aarch64)
# PRD v1.7.0 §13.1 — Idempotent, zero hardcoded keys, systemd + cgroups v2 ready.
set -euo pipefail

ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  x86_64|amd64) TARGET_ARCH="linux/amd64" ;;
  aarch64|arm64) TARGET_ARCH="linux/arm64" ;;
  *)
    echo "[qyrobot] Unsupported architecture: $ARCH_RAW" >&2
    exit 1
    ;;
esac

INSTALL_DIR="${QYRO_INSTALL_DIR:-/opt/qyrobot}"
DATA_DIR="${QYRO_DATA_DIR:-/var/lib/qyrobot}"

echo "[qyrobot] Detected host architecture: $TARGET_ARCH"
echo "[qyrobot] Install dir: $INSTALL_DIR | Data dir: $DATA_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "[qyrobot] Node.js 22+ is required. Install Node.js 22 LTS first." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "[qyrobot] Found Node.js v$(node -v). QyroBot requires Node.js >= 22 for built-in node:sqlite." >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$DATA_DIR/data" "$DATA_DIR/configs"

if [ -f "./package.json" ]; then
  echo "[qyrobot] Syncing workspace into $INSTALL_DIR..."
  cp -R . "$INSTALL_DIR"
  (cd "$INSTALL_DIR" && if [ -f package-lock.json ]; then npm ci; else npm install; fi && npm run build)
fi

if [ -f "$INSTALL_DIR/packaging/qyrobot.service" ] && [ -d "/etc/systemd/system" ] && [ "$(id -u)" -eq 0 ]; then
  cp "$INSTALL_DIR/packaging/qyrobot.service" /etc/systemd/system/qyrobot.service
  systemctl daemon-reload
  echo "[qyrobot] Installed systemd unit /etc/systemd/system/qyrobot.service"
  echo "[qyrobot] Enable & start with: systemctl enable --now qyrobot.service"
else
  echo "[qyrobot] Non-root or systemd absent; start manually with: cd $INSTALL_DIR && NODE_ENV=production npm start"
fi
