# secrets/

> **This directory is gitignored. It must never contain checked-in secrets.**
>
> If you see any file in this directory tracked by git (other than this
> README), treat it as a **critical security incident** — rotate the
> compromised key immediately.

## Required keys

### 1. Ed25519 audit-signing key

Watchtower's tamper-evident audit log uses an Ed25519 private key to sign
every audit entry. The key is loaded at runtime from the path specified by
the `AUDIT_SIGNING_KEY_PATH` environment variable (defaults to
`secrets/audit-signing-key.pem`).

Generate the key:

```bash
openssl genpkey -algorithm Ed25519 -out secrets/audit-signing-key.pem
```

Lock down permissions so only the application user can read it:

```bash
chmod 600 secrets/audit-signing-key.pem
```

### 2. GitHub App private key

If you are using the GitHub integration, place the GitHub App private key
in this directory and point the `GITHUB_APP_PRIVATE_KEY_PATH` environment
variable (set in `.env`) to its path — for example:

```
GITHUB_APP_PRIVATE_KEY_PATH=secrets/github-app.pem
```

## Production environments

In production, **do not store key files in this directory**. Keys should be
injected at runtime from a secrets vault (e.g. HashiCorp Vault, AWS Secrets
Manager, or a Kubernetes secret mounted as a volume). The `*_PATH`
environment variables should point to the vault-provided mount paths.
