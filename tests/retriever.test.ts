import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { QuelvioAuthError, QuelvioClient, QuelvioRetriever } from '../src/index.js';
import {
  TEST_API_KEY,
  TEST_BASE_URL,
  captureRequests,
  jsonResponse,
  queryResponsePayload,
} from './fixtures.js';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.QUELVIO_API_KEY;
  delete process.env.QUELVIO_API_BASE;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function makeRetriever(extra: Partial<ConstructorParameters<typeof QuelvioRetriever>[0]> = {}) {
  const { fetch: fetchImpl, calls } = captureRequests(() =>
    jsonResponse(200, queryResponsePayload()),
  );
  const client = new QuelvioClient({
    apiKey: TEST_API_KEY,
    baseUrl: TEST_BASE_URL,
    fetch: fetchImpl,
  });
  const retriever = new QuelvioRetriever({ client, ...extra });
  return { retriever, calls };
}

describe('QuelvioRetriever', () => {
  it('returns { documents, queryId } with plain-object documents (no LangChain dep)', async () => {
    const { retriever } = makeRetriever();
    const { documents, queryId } = await retriever.retrieve("what's our refund policy?");

    expect(queryId).toBe('q_01HW9X3J7K8N0V4P2QXYZA');
    expect(documents).toHaveLength(2);

    const first = documents[0]!;
    // Documents are plain objects — not LangChain `Document` instances.
    expect(first.constructor).toBe(Object);
    expect(typeof first.content).toBe('string');
    expect(first.content.startsWith('All paid customers')).toBe(true);

    expect(first.metadata.chunk_id).toBe('chunk_001');
    expect(first.metadata.title).toBe('Refund Policy v3');
    expect(first.metadata.authority_score).toBe(0.87);
    expect(first.metadata.taxonomy_domain).toBe('finance');
    expect(first.metadata.source_url).toBe('https://drive.example/refund-policy-v3');
    expect(first.metadata.source).toBe('https://drive.example/refund-policy-v3');
    expect(first.metadata.author_name).toBe('Alex CFO');
    expect(first.metadata.author_email).toBe('alex@example.com');
    expect(first.metadata.department).toBe('Finance');
  });

  it('passes mode, domainFilter, and limit through to the request', async () => {
    const { retriever, calls } = makeRetriever({
      mode: 'deep',
      domainFilter: 'engineering',
      limit: 10,
    });
    await retriever.retrieve("what's our deploy process?");
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.mode).toBe('deep');
    expect(body.domain_filter).toBe('engineering');
    expect(body.limit).toBe(10);
  });

  it('rejects empty / whitespace queries before any HTTP request', async () => {
    const { retriever, calls } = makeRetriever();
    await expect(retriever.retrieve('')).rejects.toThrow(TypeError);
    await expect(retriever.retrieve('   ')).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it('toString() / JSON.stringify do not leak the api key', () => {
    const retriever = new QuelvioRetriever({ apiKey: TEST_API_KEY, baseUrl: TEST_BASE_URL });
    expect(retriever.toString()).not.toContain(TEST_API_KEY);
    expect(JSON.stringify(retriever)).not.toContain(TEST_API_KEY);
  });

  it('propagates QuelvioAuthError from the underlying client', async () => {
    const { fetch: fetchImpl } = captureRequests(() => jsonResponse(401, { detail: 'no' }));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
    });
    const retriever = new QuelvioRetriever({ client });
    await expect(retriever.retrieve('hi')).rejects.toBeInstanceOf(QuelvioAuthError);
  });

  it('uses X-Quelvio-Command: vercel-ai-sdk-js-retriever when no client is injected', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const retriever = new QuelvioRetriever({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    await retriever.retrieve('hi');
    expect(calls[0]?.headers['x-quelvio-command']).toBe('vercel-ai-sdk-js-retriever');
  });
});
