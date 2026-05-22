/**
 * Async HTTP client for the Quelvio enterprise REST API.
 *
 * Wraps three endpoints used by the Vercel AI SDK integration:
 *
 * - `POST /v1/enterprise/query`            — retrieval + optional synthesis
 * - `GET  /v1/enterprise/domains`          — taxonomy discovery
 * - `GET  /v1/enterprise/sources/{id}`     — provenance for a previous query
 *
 * The bearer token is stored privately (closed over, not exposed as a
 * field) and is never written to `toString()`, `JSON.stringify()`, or
 * any error message emitted by this library. Pass it via the `apiKey`
 * constructor argument or set the `QUELVIO_API_KEY` environment variable.
 */

import {
  QuelvioAuthError,
  QuelvioBadRequestError,
  QuelvioError,
  QuelvioNetworkError,
  QuelvioNotFoundError,
  QuelvioRateLimitError,
  QuelvioServerError,
  QuelvioTimeoutError,
} from './exceptions.js';
import {
  type DomainsListResponse,
  DomainsListResponseSchema,
  type QueryMode,
  type QueryResponse,
  QueryResponseSchema,
  type SourceDetailResponse,
  SourceDetailResponseSchema,
} from './types.js';
import { VERSION } from './version.js';

export const DEFAULT_BASE_URL = 'https://api.quelvio.com';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 3;

const BASE_BACKOFF_MS = 1_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const VALID_MODES = new Set<QueryMode>(['fast', 'standard', 'deep']);

export type QuelvioSource =
  | 'vercel-ai-sdk-js-client'
  | 'vercel-ai-sdk-js-retriever'
  | 'vercel-ai-sdk-js-tool';

export interface QuelvioClientOptions {
  /** Bearer token (PAT, OAuth access token, or Service Account key). Falls back to `QUELVIO_API_KEY`. */
  apiKey?: string;
  /** Override the API base URL. Defaults to `QUELVIO_API_BASE` or `https://api.quelvio.com`. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30,000. */
  timeoutMs?: number;
  /** Number of retries for transient errors. Defaults to 3. */
  maxRetries?: number;
  /** Tag used for the `X-Quelvio-Command` header. Lets the audit-log writer distinguish callers. */
  source?: QuelvioSource;
  /**
   * Inject a custom `fetch`. Defaults to `globalThis.fetch`. Useful for
   * tests (pass a `vi.fn()`) or for environments where you need a
   * proxy-aware fetch.
   */
  fetch?: typeof globalThis.fetch;
}

export interface QueryOptions {
  query: string;
  limit?: number;
  mode?: string;
  domainFilter?: string | null;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  params?: Record<string, string | undefined>;
}

function resolveApiKey(explicit: string | undefined): string {
  if (explicit) return explicit;
  const fromEnv = process.env.QUELVIO_API_KEY;
  if (fromEnv) return fromEnv;
  throw new QuelvioAuthError(
    'No Quelvio API key was provided. Pass `apiKey` to the constructor or set the ' +
      'QUELVIO_API_KEY environment variable. Generate a Personal Access Token at ' +
      'https://enterprise.quelvio.com/account.',
  );
}

function resolveBaseUrl(explicit: string | undefined): string {
  const candidate = explicit ?? process.env.QUELVIO_API_BASE ?? DEFAULT_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

function buildUserAgent(): string {
  return `@quelvio/vercel-ai-sdk/${VERSION} node/${process.version} ${process.platform}-${process.arch}`;
}

/** Lower-case the mode and validate it. Exported for unit tests. */
export function normalizeMode(mode: string | undefined | null): QueryMode {
  if (mode === undefined || mode === null) return 'standard';
  const lowered = String(mode).trim().toLowerCase();
  if (!VALID_MODES.has(lowered as QueryMode)) {
    throw new QuelvioBadRequestError(
      `Invalid mode ${JSON.stringify(mode)}. Expected one of: fast, standard, deep.`,
    );
  }
  return lowered as QueryMode;
}

/** Clamp the chunk limit into [1, 50]. Exported for unit tests. */
export function boundLimit(value: number | undefined | null): number {
  if (value === undefined || value === null) return 5;
  if (value < 1) return 1;
  if (value > 50) return 50;
  return Math.floor(value);
}

/** Build the JSON body for `POST /v1/enterprise/query`. Exported for unit tests. */
export function buildQueryBody(opts: QueryOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: opts.query,
    limit: boundLimit(opts.limit),
    mode: normalizeMode(opts.mode),
  };
  if (opts.domainFilter !== undefined && opts.domainFilter !== null) {
    body.domain_filter = opts.domainFilter;
  }
  return body;
}

function backoffMs(attempt: number, rand: number): number {
  const base = BASE_BACKOFF_MS * 2 ** attempt;
  const jitter = 1 + (rand * 0.4 - 0.2);
  return Math.round(base * jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

async function extractDetail(response: Response): Promise<string | null> {
  try {
    const clone = response.clone();
    const payload = (await clone.json()) as unknown;
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      const detail = obj.detail ?? obj.message;
      if (typeof detail === 'string') return detail;
    }
  } catch {
    try {
      const text = (await response.clone().text()).trim();
      return text ? text.slice(0, 500) : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function mapError(response: Response): Promise<QuelvioError> {
  const detail = await extractDetail(response);
  const status = response.status;
  const reason = response.statusText || '';

  if (status === 400) {
    return new QuelvioBadRequestError(detail ?? `Bad request: ${reason}`);
  }
  if (status === 401 || status === 403) {
    return new QuelvioAuthError(
      'Quelvio authentication failed. Your token may be invalid, expired, or revoked. ' +
        'Generate a new Personal Access Token at https://enterprise.quelvio.com/account.',
    );
  }
  if (status === 404) {
    return new QuelvioNotFoundError(detail ?? `Not found: ${reason}`);
  }
  if (status === 429) {
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
    const suffix = retryAfter !== null ? ` (retry after ${retryAfter}s)` : '';
    return new QuelvioRateLimitError(`Quelvio rate limit exceeded.${suffix}`, retryAfter);
  }
  if (status >= 500 && status < 600) {
    return new QuelvioServerError(`Quelvio server error: ${status} ${reason}`, status);
  }
  return new QuelvioError(`Unexpected response: ${status} ${reason}`);
}

/**
 * Async HTTP client for the Quelvio enterprise API.
 *
 * @example
 * ```ts
 * const client = new QuelvioClient({ apiKey: 'qlv_pat_...' });
 * const response = await client.query({ query: "what's our refund policy?" });
 * ```
 */
export class QuelvioClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;

  // Held in a closure so it is invisible to `toString`, `JSON.stringify`,
  // and any introspection. There is no field on the instance.
  readonly #buildHeaders: () => Headers;
  readonly #fetch: typeof globalThis.fetch;
  readonly #source: QuelvioSource;
  readonly #apiKey: string;

  constructor(options: QuelvioClientOptions = {}) {
    this.#apiKey = resolveApiKey(options.apiKey);
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.#source = options.source ?? 'vercel-ai-sdk-js-client';
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);

    const apiKey = this.#apiKey;
    const source = this.#source;
    this.#buildHeaders = () => {
      const h = new Headers();
      h.set('Authorization', `Bearer ${apiKey}`);
      h.set('Accept', 'application/json');
      h.set('Content-Type', 'application/json');
      h.set('User-Agent', buildUserAgent());
      h.set('X-Quelvio-Source', 'vercel-ai-sdk-js');
      h.set('X-Quelvio-Command', source);
      return h;
    };
  }

  /**
   * Don't surface the bearer token from string coercion or JSON
   * serialization. We deliberately list non-sensitive fields only.
   */
  toString(): string {
    return `QuelvioClient(baseUrl=${this.baseUrl}, timeoutMs=${this.timeoutMs}, maxRetries=${this.maxRetries})`;
  }

  toJSON(): Record<string, unknown> {
    return {
      baseUrl: this.baseUrl,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
    };
  }

  /** Internal accessor used by sibling classes that share the same client. */
  _exposeApiKeyForSibling(): string {
    return this.#apiKey;
  }

  /** Internal accessor — returns the configured `fetch` for sibling reuse. */
  _exposeFetchForSibling(): typeof globalThis.fetch {
    return this.#fetch;
  }

  /** Send a one-shot query and return the parsed response. */
  async query(opts: QueryOptions): Promise<QueryResponse> {
    if (!opts.query || !opts.query.trim()) {
      throw new TypeError('query must be a non-empty string');
    }
    const body = buildQueryBody(opts);
    const raw = await this.#request({ method: 'POST', path: '/v1/enterprise/query', body });
    return QueryResponseSchema.parse(raw);
  }

  async listDomains(opts: { coverage?: string } = {}): Promise<DomainsListResponse> {
    const params = opts.coverage ? { coverage: opts.coverage } : undefined;
    const raw = await this.#request({ method: 'GET', path: '/v1/enterprise/domains', params });
    return DomainsListResponseSchema.parse(raw);
  }

  async getSourceDetail(queryId: string): Promise<SourceDetailResponse> {
    if (!queryId) {
      throw new TypeError('queryId must be a non-empty string');
    }
    const raw = await this.#request({
      method: 'GET',
      path: `/v1/enterprise/sources/${encodeURIComponent(queryId)}`,
    });
    return SourceDetailResponseSchema.parse(raw);
  }

  async #request(opts: RequestOptions): Promise<unknown> {
    const url = this.#buildUrl(opts.path, opts.params);

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await this.#fetch(url, {
          method: opts.method,
          headers: this.#buildHeaders(),
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal,
        });
      } catch (err) {
        lastError = err;
        clearTimeout(timer);

        const isAbort =
          (err instanceof Error && err.name === 'AbortError') ||
          (typeof err === 'object' &&
            err !== null &&
            (err as { name?: string }).name === 'AbortError');
        if (isAbort) {
          if (attempt < this.maxRetries) {
            await sleep(backoffMs(attempt, Math.random()));
            continue;
          }
          throw new QuelvioTimeoutError(
            `Request to ${opts.path} timed out after ${this.timeoutMs}ms`,
          );
        }
        if (attempt < this.maxRetries) {
          await sleep(backoffMs(attempt, Math.random()));
          continue;
        }
        const name = err instanceof Error ? err.constructor.name : typeof err;
        throw new QuelvioNetworkError(`Network error contacting Quelvio: ${name}`);
      } finally {
        clearTimeout(timer);
      }

      if (response.ok) {
        if (response.status === 204) return null;
        const text = await response.text();
        if (!text) return null;
        return JSON.parse(text);
      }

      if (RETRYABLE_STATUSES.has(response.status) && attempt < this.maxRetries) {
        await sleep(backoffMs(attempt, Math.random()));
        continue;
      }

      throw await mapError(response);
    }

    throw new QuelvioError(
      `Request failed after ${this.maxRetries + 1} attempts${
        lastError instanceof Error ? `: ${lastError.message}` : ''
      }`,
    );
  }

  #buildUrl(path: string, params: Record<string, string | undefined> | undefined): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (!params) return `${this.baseUrl}${normalized}`;
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) search.set(k, v);
    }
    const qs = search.toString();
    return qs ? `${this.baseUrl}${normalized}?${qs}` : `${this.baseUrl}${normalized}`;
  }
}
