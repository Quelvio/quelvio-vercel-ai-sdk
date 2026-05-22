# Changelog

All notable changes to `@quelvio/vercel-ai-sdk` are documented here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-23

Initial release. JavaScript/TypeScript sibling of
[`@quelvio/langchain`](https://www.npmjs.com/package/@quelvio/langchain)
adapted for the Vercel AI SDK's `tool()` interface.

### Added

- `QuelvioClient` — async HTTP client wrapping the Quelvio enterprise API
  (`POST /v1/enterprise/query`, `GET /v1/enterprise/domains`,
  `GET /v1/enterprise/sources/{query_id}`).
- `quelvioTool()` — factory returning an AI-SDK-compatible tool
  definition (`description`, `parameters`, `execute`). Drop directly
  into the `tools` map of `streamText` / `generateText`. Parameters
  schema accepts `question` (required) plus optional `mode`,
  `max_sources`, `domain`. Output is a synthesized answer + citation
  list.
- `QuelvioRetriever` — lightweight, framework-free retriever returning
  `{ documents, queryId }` with plain JavaScript document objects. No
  `@langchain/core` dependency.
- Typed exceptions: `QuelvioError`, `QuelvioAuthError`,
  `QuelvioBadRequestError`, `QuelvioNotFoundError`,
  `QuelvioRateLimitError`, `QuelvioServerError`, `QuelvioTimeoutError`,
  `QuelvioNetworkError`.
- API key resolution from the `apiKey` constructor argument or the
  `QUELVIO_API_KEY` environment variable. The token is held privately
  and never appears in `toString()`, `JSON.stringify()`, or any error
  message.
- Configurable base URL via `baseUrl` or `QUELVIO_API_BASE`. Trailing
  slashes are stripped.
- Exponential backoff with jitter for transient 5xx errors and network
  timeouts. Configurable `maxRetries` (default 3).
- Dual ESM + CommonJS distribution. Compatible with `ai` 4.x.

[0.1.0]: https://github.com/Quelvio/quelvio-vercel-ai-sdk/releases/tag/v0.1.0
