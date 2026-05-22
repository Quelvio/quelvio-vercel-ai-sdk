import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  QuelvioAuthError,
  QuelvioBadRequestError,
  QuelvioClient,
  QuelvioNotFoundError,
  QuelvioRateLimitError,
  QuelvioServerError,
  QuelvioTimeoutError,
  VERSION,
  boundLimit,
  buildQueryBody,
  normalizeMode,
} from '../src/index.js';
import {
  TEST_API_KEY,
  TEST_BASE_URL,
  captureRequests,
  jsonResponse,
  queryResponsePayload,
  textResponse,
} from './fixtures.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.QUELVIO_API_KEY;
  delete process.env.QUELVIO_API_BASE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ── Configuration & header behavior ────────────────────────────────────────

describe('QuelvioClient construction', () => {
  it('throws QuelvioAuthError when no key is given and env is empty', () => {
    expect(() => new QuelvioClient()).toThrow(QuelvioAuthError);
  });

  it('resolves the api key from QUELVIO_API_KEY env var', () => {
    process.env.QUELVIO_API_KEY = 'qlv_pat_from_env_XYZ';
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const client = new QuelvioClient({ baseUrl: TEST_BASE_URL, fetch: fetchImpl });
    return client.query({ query: 'hi' }).then(() => {
      expect(calls[0]?.headers.authorization).toBe('Bearer qlv_pat_from_env_XYZ');
    });
  });

  it('honours constructor api key over env var', async () => {
    process.env.QUELVIO_API_KEY = 'wrong';
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const client = new QuelvioClient({
      apiKey: 'right',
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    await client.query({ query: 'hi' });
    expect(calls[0]?.headers.authorization).toBe('Bearer right');
  });

  it('resolves base URL from QUELVIO_API_BASE env var and strips trailing slash', async () => {
    process.env.QUELVIO_API_BASE = 'https://api-dev.quelvio.com/';
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const client = new QuelvioClient({ apiKey: TEST_API_KEY, fetch: fetchImpl });
    await client.query({ query: 'hi' });
    expect(client.baseUrl).toBe('https://api-dev.quelvio.com');
    expect(calls[0]?.url).toBe('https://api-dev.quelvio.com/v1/enterprise/query');
  });

  it('builds a well-shaped User-Agent', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    await client.query({ query: 'hi' });
    const ua = calls[0]?.headers['user-agent'];
    expect(ua).toMatch(new RegExp(`^@quelvio/vercel-ai-sdk/${VERSION} node/`));
    expect(ua).toContain(process.platform);
  });

  it('sets X-Quelvio-Source: vercel-ai-sdk-js and X-Quelvio-Command tags', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    await client.query({ query: 'hi' });
    expect(calls[0]?.headers['x-quelvio-source']).toBe('vercel-ai-sdk-js');
    expect(calls[0]?.headers['x-quelvio-command']).toBe('vercel-ai-sdk-js-client');
  });
});

// ── Token-never-logged guarantee ───────────────────────────────────────────

describe('QuelvioClient token-never-logged guarantee', () => {
  it('toString() does not contain the api key', () => {
    const client = new QuelvioClient({ apiKey: TEST_API_KEY, baseUrl: TEST_BASE_URL });
    const rendered = client.toString();
    expect(rendered).not.toContain(TEST_API_KEY);
    expect(rendered).not.toContain('Bearer');
    expect(rendered).toContain('QuelvioClient');
  });

  it('JSON.stringify() does not contain the api key', () => {
    const client = new QuelvioClient({ apiKey: TEST_API_KEY, baseUrl: TEST_BASE_URL });
    const serialized = JSON.stringify(client);
    expect(serialized).not.toContain(TEST_API_KEY);
  });

  it('error messages never include the api key', async () => {
    const { fetch: fetchImpl } = captureRequests(() =>
      jsonResponse(401, { detail: `tried token ${TEST_API_KEY}` }),
    );
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
    });
    try {
      await client.query({ query: 'hi' });
      throw new Error('expected QuelvioAuthError');
    } catch (err) {
      expect(err).toBeInstanceOf(QuelvioAuthError);
      expect((err as Error).message).not.toContain(TEST_API_KEY);
    }
  });
});

// ── Request shaping ────────────────────────────────────────────────────────

describe('Request body normalization', () => {
  it('lower-cases mode and clamps limit', () => {
    const body = buildQueryBody({
      query: 'hi',
      limit: 999,
      mode: 'DEEP',
      domainFilter: 'legal',
    });
    expect(body).toEqual({
      query: 'hi',
      limit: 50,
      mode: 'deep',
      domain_filter: 'legal',
    });
  });

  it('omits domain_filter when null/undefined and applies defaults', () => {
    const body = buildQueryBody({ query: 'hi' });
    expect(body).not.toHaveProperty('domain_filter');
    expect(body.limit).toBe(5);
    expect(body.mode).toBe('standard');
  });

  it('rejects an invalid mode with QuelvioBadRequestError', () => {
    expect(() => normalizeMode('turbo')).toThrow(QuelvioBadRequestError);
  });

  it('clamps the limit floor and ceiling', () => {
    expect(boundLimit(0)).toBe(1);
    expect(boundLimit(-100)).toBe(1);
    expect(boundLimit(51)).toBe(50);
    expect(boundLimit(undefined)).toBe(5);
  });

  it('rejects empty query before issuing an HTTP request', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() => jsonResponse(200, {}));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    await expect(client.query({ query: '' })).rejects.toThrow(TypeError);
    await expect(client.query({ query: '   ' })).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it('passes domain_filter, mode, query, and auth header through to the wire', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    await client.query({ query: 'who owns finance?', mode: 'fast', domainFilter: 'finance' });
    expect(calls[0]?.url).toBe(`${TEST_BASE_URL}/v1/enterprise/query`);
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.domain_filter).toBe('finance');
    expect(body.mode).toBe('fast');
    expect(body.query).toBe('who owns finance?');
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TEST_API_KEY}`);
  });
});

// ── Error mapping ──────────────────────────────────────────────────────────

describe('Error mapping', () => {
  it('401 → QuelvioAuthError', async () => {
    const { fetch: fetchImpl } = captureRequests(() => jsonResponse(401, { detail: 'bad token' }));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
    });
    await expect(client.query({ query: 'x' })).rejects.toBeInstanceOf(QuelvioAuthError);
  });

  it('404 → QuelvioNotFoundError', async () => {
    const { fetch: fetchImpl } = captureRequests(() => jsonResponse(404, { detail: 'missing' }));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
    });
    await expect(client.getSourceDetail('q_does_not_exist')).rejects.toBeInstanceOf(
      QuelvioNotFoundError,
    );
  });

  it('429 → QuelvioRateLimitError with parsed Retry-After', async () => {
    const { fetch: fetchImpl } = captureRequests(() =>
      jsonResponse(429, { detail: 'slow down' }, { 'retry-after': '17' }),
    );
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
    });
    try {
      await client.query({ query: 'x' });
      throw new Error('expected QuelvioRateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(QuelvioRateLimitError);
      expect((err as QuelvioRateLimitError).retryAfterSeconds).toBe(17);
    }
  });

  it('503 retries until exhausted then throws QuelvioServerError', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() => textResponse(503, 'upstream down'));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 2,
      timeoutMs: 1_000,
    });
    try {
      await client.query({ query: 'x' });
      throw new Error('expected QuelvioServerError');
    } catch (err) {
      expect(err).toBeInstanceOf(QuelvioServerError);
      expect((err as QuelvioServerError).statusCode).toBe(503);
    }
    expect(calls).toHaveLength(3);
  }, 30_000);

  it('AbortError → QuelvioTimeoutError', async () => {
    const fetchImpl: typeof globalThis.fetch = async (_input, init) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
      throw new Error('unreachable');
    };
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
      timeoutMs: 25,
    });
    await expect(client.query({ query: 'x' })).rejects.toBeInstanceOf(QuelvioTimeoutError);
  });
});

// ── Response parsing ───────────────────────────────────────────────────────

describe('Response parsing', () => {
  it('parses GET /v1/enterprise/domains into a typed response', async () => {
    const payload = {
      total: 1,
      domains: [
        {
          taxonomy_domain: 'engineering',
          document_count: 42,
          chunk_count: 412,
          expert_count: 5,
          coverage_level: 'complete',
        },
      ],
    };
    const { fetch: fetchImpl, calls } = captureRequests(() => jsonResponse(200, payload));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    const result = await client.listDomains();
    expect(result.total).toBe(1);
    expect(result.domains[0]?.taxonomy_domain).toBe('engineering');
    expect(result.domains[0]?.document_count).toBe(42);
    expect(calls[0]?.url).toBe(`${TEST_BASE_URL}/v1/enterprise/domains`);
  });

  it('parses POST /v1/enterprise/query into a typed response', async () => {
    const { fetch: fetchImpl } = captureRequests(() => jsonResponse(200, queryResponsePayload()));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    const response = await client.query({ query: 'hi' });
    expect(response.query_id).toBe('q_01HW9X3J7K8N0V4P2QXYZA');
    expect(response.synthesis).not.toBeNull();
    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.title).toBe('Refund Policy v3');
    expect(response.results[0]?.authority_score).toBe(0.87);
  });

  it('ignores unknown forward-compat fields in the response', async () => {
    const payload = queryResponsePayload();
    const augmented = {
      ...payload,
      future_field: 'ignored',
      results: [{ ...((payload.results as unknown[])[0] as object), new_chunk_field: 99 }],
      result_count: 1,
    };
    const { fetch: fetchImpl } = captureRequests(() => jsonResponse(200, augmented));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    const response = await client.query({ query: 'x' });
    expect(response.results[0]?.chunk_id).toBe('chunk_001');
  });
});
