# Firecracker Sandbox Infrastructure

This directory contains the build scripts and configuration for the Firecracker microVM sandbox used to execute customer-authored plugin evaluators.

## Contents

- `build-rootfs.sh` — Builds the minimal Alpine + Bun rootfs ext4 image (~50MB)

## Prerequisites

To build the rootfs image:
- Linux host with root access
- `wget`, `unzip`, `mkfs.ext4` utilities
- Internet access to download Alpine minirootfs and Bun

To run Firecracker VMs:
- Linux host with KVM support (`/dev/kvm` must be accessible)
- Firecracker binary (download from [firecracker-microvm/firecracker](https://github.com/firecracker-microvm/firecracker/releases))
- A Linux kernel image (vmlinux) compatible with Firecracker

## Quick Start

```bash
# Build the rootfs image (requires root)
sudo ./build-rootfs.sh /opt/watchtower/rootfs.ext4

# Download Firecracker (example for v1.9.1, x86_64)
ARCH=$(uname -m)
curl -Lo /usr/local/bin/firecracker \
  https://github.com/firecracker-microvm/firecracker/releases/download/v1.9.1/firecracker-v1.9.1-${ARCH}
chmod +x /usr/local/bin/firecracker

# Download a compatible kernel
curl -Lo /opt/watchtower/vmlinux \
  https://github.com/firecracker-microvm/firecracker/releases/download/v1.9.1/vmlinux-6.1
```

## Architecture

See [ADR-004](../../docs/decisions/004-single-engine-firecracker-sandbox.md) for the full rationale.

Each customer plugin evaluation spawns a short-lived Firecracker microVM:

1. The VMM creates a guest with the read-only rootfs, no network, and limited resources
2. The plugin source is injected as a read-only overlay
3. Evidence JSON is passed via stdin
4. The guest executes the plugin and writes `EvaluatorResult` JSON to stdout
5. The VMM reads the result, validates it, and kills the VM

The guest has **no network**, **no host filesystem access**, and **no database connection**.

## macOS Contributors

Firecracker requires KVM, which is not available on macOS. For local development, plugins run in a dev-mode fallback (same-process, no sandbox isolation). Set `WATCHTOWER_SANDBOX_MODE=dev` in your `.env` file.

**Dev-mode is NOT a security boundary.** It exists solely to unblock local development.
