---
tags: [finding, high]
severity: High
status: closed
verified-on: 2026-10-24
---
# W2-R3 · GitHub access tokens were stored in plaintext

`GitHubIntegration.accessToken` held the raw OAuth token, although the server
already had an AES-256-GCM key (`TOKEN_ENCRYPTION_KEY`).

**Fixed 2026-10-24** with the move to server/: new tokens are written as
`enc:v1:iv:tag:ciphertext`; reads accept both forms; saving refuses
plaintext. **Existing plaintext tokens are not migrated** — they become
encrypted when the user reconnects GitHub. A one-off re-encryption migration
would close that window (needs a dry run against production first).

## Related
[[Server]] · [[Security Findings]]
