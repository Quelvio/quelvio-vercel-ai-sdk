# Strict-Mode Sentinel Handoff (FE-13)

> **Docs PR.** The full reference implementation lives in
> [`Quelvio/quelvio-mcp-server`](https://github.com/Quelvio/quelvio-mcp-server/blob/main/STRICT_MODE_HANDOFF.md).
> This file copies the contract so an engineer touching
> `quelvio-vercel-ai-sdk` can mirror the pattern locally without
> context-switching across repos.

## What backend PR #643 ships

Backend PR #643 emits two response headers globally on the search /
retrieval endpoints:

| Header | Value | Meaning |
| --- | --- | --- |
| `X-Quelvio-API-Version` | `2.0` | API contract version. Informational. |
| `X-Quelvio-Sentinel-Set` | `closed-v1` | Tenant is on the strict (closed) permission model. Some results may be filtered. |

When the sentinel header is present, SDK consumers may see fewer search
results than expected — the strict model only returns chunks for which
the calling employee has explicit access.

## Contract

When this provider observes `X-Quelvio-Sentinel-Set` on any response:

1. Log a warning **once per process** (idempotent). Warning text:
   ```
   Quelvio v2 strict permission mode is active for your tenant.
   Some search results may be filtered to enforce explicit permissions.
   Learn more: https://docs.quelvio.com/permission-model
   ```
2. Surface via `console.warn` (or the AI SDK's preferred logger, if any).
   Never throw — the warning is best-effort.
3. Prefix with the structured event token
   `quelvio_sentinel_set_detected sentinel=<value>`.

## Where to wire it in `quelvio-vercel-ai-sdk`

The HTTP call site is `src/client.ts:306`, inside the `#request` method.
After `response = await this.#fetch(url, {...})` succeeds, call
`noteSentinelHeader(response)`.

Suggested layout:

- `src/sentinel.ts` — module-scoped `Set<string>` of observed values +
  `noteSentinelHeader(res: Response)` helper.
- Single call site inside `#request` (so all four endpoints inherit
  the check via the shared request path).
- Vitest spec under `tests/` covering: absent, present once, repeated
  same value, two distinct values.

## Implementation crib

See [`Quelvio/quelvio-mcp-server` `src/sentinel.ts`](https://github.com/Quelvio/quelvio-mcp-server/blob/main/src/sentinel.ts)
and [`src/sentinel.test.ts`](https://github.com/Quelvio/quelvio-mcp-server/blob/main/src/sentinel.test.ts).

## Owner

FE-13 / antonis@rolle.io. Backend counterpart: PR #643 on
`Quelvio/quelvio-platform`.
