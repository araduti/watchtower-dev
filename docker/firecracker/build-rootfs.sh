#!/usr/bin/env bash
# =============================================================================
# build-rootfs.sh — Build the minimal rootfs image for Firecracker plugin VMs.
#
# Creates an Alpine-based ext4 filesystem image (~50MB) with:
#   - Alpine Linux minimal base
#   - Bun runtime (for executing TypeScript plugins)
#   - A minimal init script that reads plugin source, executes it,
#     and writes the EvaluatorResult to stdout
#
# Prerequisites:
#   - Linux host with root access (or fakeroot)
#   - debootstrap or apk-tools for Alpine base
#   - Bun binary for the target architecture
#
# Usage:
#   ./build-rootfs.sh [output-path]
#
# Output:
#   rootfs.ext4 — the ext4 filesystem image, ready for Firecracker
#
# This script is idempotent — running it again rebuilds from scratch.
# The resulting image is versioned by its SHA-256 hash.
#
# =============================================================================

set -euo pipefail

OUTPUT_PATH="${1:-./rootfs.ext4}"
ROOTFS_SIZE_MB=64
WORK_DIR=$(mktemp -d)
MOUNT_DIR="${WORK_DIR}/mnt"

echo "=== Building Firecracker rootfs image ==="
echo "Output: ${OUTPUT_PATH}"
echo "Working directory: ${WORK_DIR}"

# ── Step 1: Create empty ext4 image ──────────────────────────────────────────

echo "[1/5] Creating ${ROOTFS_SIZE_MB}MB ext4 image..."
dd if=/dev/zero of="${OUTPUT_PATH}" bs=1M count="${ROOTFS_SIZE_MB}" status=progress
mkfs.ext4 -F "${OUTPUT_PATH}"

# ── Step 2: Mount and populate with Alpine base ─────────────────────────────

echo "[2/5] Mounting image and installing Alpine base..."
mkdir -p "${MOUNT_DIR}"
mount -o loop "${OUTPUT_PATH}" "${MOUNT_DIR}"

# Install Alpine base using apk
# Note: This requires apk-tools on the host, or can be replaced with
# a pre-built Alpine minirootfs tarball download
ALPINE_VERSION="3.21"
ALPINE_ARCH="x86_64"
ALPINE_MIRROR="https://dl-cdn.alpinelinux.org/alpine"
ALPINE_MINIROOTFS_URL="${ALPINE_MIRROR}/v${ALPINE_VERSION}/releases/${ALPINE_ARCH}/alpine-minirootfs-${ALPINE_VERSION}.0-${ALPINE_ARCH}.tar.gz"

echo "  Downloading Alpine minirootfs..."
wget -q "${ALPINE_MINIROOTFS_URL}" -O "${WORK_DIR}/minirootfs.tar.gz" || {
  echo "  Failed to download minirootfs. Using local apk-tools fallback..."
  # Fallback: use local apk to create base
  apk --arch "${ALPINE_ARCH}" --root "${MOUNT_DIR}" --initdb add alpine-base
}

if [ -f "${WORK_DIR}/minirootfs.tar.gz" ]; then
  tar -xzf "${WORK_DIR}/minirootfs.tar.gz" -C "${MOUNT_DIR}"
fi

# ── Step 3: Install Bun runtime ─────────────────────────────────────────────

echo "[3/5] Installing Bun runtime..."
BUN_VERSION="1.2.4"
BUN_URL="https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip"

wget -q "${BUN_URL}" -O "${WORK_DIR}/bun.zip"
unzip -q "${WORK_DIR}/bun.zip" -d "${WORK_DIR}/bun-extracted"
cp "${WORK_DIR}/bun-extracted/bun-linux-x64/bun" "${MOUNT_DIR}/usr/local/bin/bun"
chmod +x "${MOUNT_DIR}/usr/local/bin/bun"

# ── Step 4: Install the plugin runner init script ────────────────────────────

echo "[4/5] Installing plugin runner..."
cat > "${MOUNT_DIR}/usr/local/bin/run-plugin.sh" << 'RUNNER_EOF'
#!/bin/sh
# Plugin runner — executed as the guest init process.
#
# Reads:
#   /plugin/plugin.ts   — the customer's evaluator source
#   stdin               — the EvidenceSnapshot JSON
#
# Writes:
#   stdout              — the EvaluatorResult JSON
#
# Exit codes:
#   0 = success (result on stdout)
#   1 = plugin error (stderr has details)

set -e

PLUGIN_PATH="/plugin/plugin.ts"

if [ ! -f "${PLUGIN_PATH}" ]; then
  echo '{"pass":false,"warnings":["Plugin file not found in sandbox"]}' >&1
  exit 0
fi

# Read evidence from stdin into a temp file
EVIDENCE_PATH="/tmp/evidence.json"
cat > "${EVIDENCE_PATH}"

# Execute the plugin with Bun
exec /usr/local/bin/bun run - << 'BUN_EOF'
import { readFileSync } from "node:fs";

const evidence = JSON.parse(readFileSync("/tmp/evidence.json", "utf-8"));
const mod = await import("/plugin/plugin.ts");
const evaluate = mod.default?.evaluate ?? mod.evaluate;

if (typeof evaluate !== "function") {
  console.log(JSON.stringify({
    pass: false,
    warnings: ["Plugin does not export an evaluate function"]
  }));
  process.exit(0);
}

try {
  const result = evaluate(evidence);
  const output = {
    pass: Boolean(result?.pass),
    warnings: Array.isArray(result?.warnings) ? result.warnings.map(String) : []
  };
  console.log(JSON.stringify(output));
} catch (error) {
  console.log(JSON.stringify({
    pass: false,
    warnings: [`Plugin threw an error: ${error?.message ?? "unknown"}`]
  }));
}
BUN_EOF
RUNNER_EOF

chmod +x "${MOUNT_DIR}/usr/local/bin/run-plugin.sh"

# Create the plugin mount point
mkdir -p "${MOUNT_DIR}/plugin"

# Create a minimal init that calls the runner
cat > "${MOUNT_DIR}/sbin/init" << 'INIT_EOF'
#!/bin/sh
exec /usr/local/bin/run-plugin.sh
INIT_EOF

chmod +x "${MOUNT_DIR}/sbin/init"

# ── Step 5: Cleanup and finalize ─────────────────────────────────────────────

echo "[5/5] Finalizing image..."
umount "${MOUNT_DIR}"
rm -rf "${WORK_DIR}"

# Calculate and display the image hash for versioning
HASH=$(sha256sum "${OUTPUT_PATH}" | cut -d' ' -f1)
SIZE=$(du -h "${OUTPUT_PATH}" | cut -f1)

echo ""
echo "=== Rootfs image built successfully ==="
echo "  Path:   ${OUTPUT_PATH}"
echo "  Size:   ${SIZE}"
echo "  SHA256: ${HASH}"
echo ""
echo "Copy this image to /opt/watchtower/rootfs.ext4 on the production host."
