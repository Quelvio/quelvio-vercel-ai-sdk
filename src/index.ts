/**
 * `@quelvio/vercel-ai-sdk` — Quelvio for the Vercel AI SDK.
 *
 * Public API barrel. Mirrors the LangChain.js sibling
 * (`@quelvio/langchain`) and the Python sibling
 * (`quelvio-langchain`) in surface area, adapted to the AI SDK's
 * `tool()` interface.
 */

export {
  buildQueryBody,
  boundLimit,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  normalizeMode,
  QuelvioClient,
  type QuelvioClientOptions,
  type QuelvioSource,
  type QueryOptions,
} from './client.js';
export {
  QuelvioAuthError,
  QuelvioBadRequestError,
  QuelvioError,
  QuelvioNetworkError,
  QuelvioNotFoundError,
  QuelvioRateLimitError,
  QuelvioServerError,
  QuelvioTimeoutError,
} from './exceptions.js';
export {
  type QuelvioDocument,
  type QuelvioRetrievalResult,
  QuelvioRetriever,
  type QuelvioRetrieverOptions,
} from './retriever.js';
export {
  quelvioTool,
  type QuelvioToolInput,
  QuelvioToolInputSchema,
  type QuelvioToolOptions,
} from './tool.js';
export {
  type ChunkResult,
  ChunkResultSchema,
  type DomainCoverage,
  DomainCoverageSchema,
  type DomainsListResponse,
  DomainsListResponseSchema,
  type QueryMode,
  QueryModeSchema,
  type QueryRequest,
  QueryRequestSchema,
  type QueryResponse,
  QueryResponseSchema,
  type SourceChunk,
  SourceChunkSchema,
  type SourceDetailResponse,
  SourceDetailResponseSchema,
} from './types.js';
export { VERSION } from './version.js';
