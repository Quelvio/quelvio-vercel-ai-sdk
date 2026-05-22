import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  QuelvioClient,
  QuelvioToolInputSchema,
  type QuelvioToolOptions,
  quelvioTool,
} from '../src/index.js';
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

const EXEC_OPTS = { toolCallId: 'test-call', messages: [] as never[] } as never;

function makeTool(extra: Partial<QuelvioToolOptions> = {}) {
  const { fetch: fetchImpl, calls } = captureRequests(() =>
    jsonResponse(200, queryResponsePayload()),
  );
  const client = new QuelvioClient({
    apiKey: TEST_API_KEY,
    baseUrl: TEST_BASE_URL,
    fetch: fetchImpl,
  });
  const t = quelvioTool({ client, ...extra });
  return { tool: t, calls };
}

describe('quelvioTool', () => {
  it('returns an AI-SDK-compatible object with description, parameters, and execute', () => {
    const t = quelvioTool({ apiKey: TEST_API_KEY, baseUrl: TEST_BASE_URL });
    expect(typeof t).toBe('object');
    expect(typeof t.description).toBe('string');
    expect((t.description ?? '').toLowerCase()).toContain('knowledge brain');
    expect(t.parameters).toBe(QuelvioToolInputSchema);
    expect(typeof t.execute).toBe('function');
  });

  it('description override is honoured', () => {
    const t = quelvioTool({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      description: 'custom',
    });
    expect(t.description).toBe('custom');
  });

  it('parameters schema accepts a bare {question} object with all other fields optional', () => {
    const parsed = QuelvioToolInputSchema.parse({ question: 'hi' });
    expect(parsed.question).toBe('hi');
    expect(parsed.mode).toBeUndefined();
    expect(parsed.max_sources).toBeUndefined();
    expect(parsed.domain).toBeUndefined();
  });

  it('parameters schema rejects max_sources outside the 1–50 bounds', () => {
    expect(() => QuelvioToolInputSchema.parse({ question: 'hi', max_sources: 0 })).toThrow();
    expect(() => QuelvioToolInputSchema.parse({ question: 'hi', max_sources: 51 })).toThrow();
  });

  it('parameters schema rejects empty questions', () => {
    expect(() => QuelvioToolInputSchema.parse({ question: '' })).toThrow();
  });

  it('execute() returns a formatted string with synthesis + Sources: section', async () => {
    const { tool: t, calls } = makeTool();
    const result = await t.execute!({ question: "what's our refund policy?" }, EXEC_OPTS);

    expect(typeof result).toBe('string');
    expect(result).toContain('Refunds are processed within 14 days');
    expect(result).toContain('Sources:');
    expect(result).toContain('[1] Refund Policy v3');
    expect(result).toContain('https://drive.example/refund-policy-v3');
    expect(result).toContain('[2] Customer Success Playbook');

    expect(calls[0]?.url).toBe(`${TEST_BASE_URL}/v1/enterprise/query`);
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.query).toBe("what's our refund policy?");
  });

  it('execute() passes mode / max_sources / domain through to the wire', async () => {
    const { tool: t, calls } = makeTool();
    await t.execute!(
      {
        question: 'who owns finance?',
        mode: 'fast',
        max_sources: 3,
        domain: 'finance',
      },
      EXEC_OPTS,
    );
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.mode).toBe('fast');
    expect(body.limit).toBe(3);
    expect(body.domain_filter).toBe('finance');
  });

  it('execute() applies defaultMode / defaultMaxSources / defaultDomain when omitted', async () => {
    const { tool: t, calls } = makeTool({
      defaultMode: 'deep',
      defaultMaxSources: 8,
      defaultDomain: 'engineering',
    });
    await t.execute!({ question: 'how do we deploy?' }, EXEC_OPTS);
    const body = calls[0]?.body as Record<string, unknown>;
    expect(body.mode).toBe('deep');
    expect(body.limit).toBe(8);
    expect(body.domain_filter).toBe('engineering');
  });

  it('execute() rejects empty / whitespace questions before any HTTP request', async () => {
    const { tool: t, calls } = makeTool();
    await expect(t.execute!({ question: '   ' as never }, EXEC_OPTS)).rejects.toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });

  it('execute() returns a friendly message when there are no results', async () => {
    const empty = {
      query: '?',
      query_id: 'q_empty',
      result_count: 0,
      risk_flag: {},
      results: [],
      synthesis: null,
    };
    const { fetch: fetchImpl } = captureRequests(() => jsonResponse(200, empty));
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
    });
    const t = quelvioTool({ client });
    const result = await t.execute!({ question: 'anything' }, EXEC_OPTS);
    expect(result).toContain('No matching content');
  });

  it('execute() never leaks the api key in error messages', async () => {
    const { fetch: fetchImpl } = captureRequests(() =>
      jsonResponse(401, { detail: `tried token ${TEST_API_KEY}` }),
    );
    const client = new QuelvioClient({
      apiKey: TEST_API_KEY,
      baseUrl: TEST_BASE_URL,
      fetch: fetchImpl,
      maxRetries: 0,
    });
    const t = quelvioTool({ client });
    try {
      await t.execute!({ question: 'hi' }, EXEC_OPTS);
      throw new Error('expected error');
    } catch (err) {
      expect((err as Error).message).not.toContain(TEST_API_KEY);
    }
  });

  it('uses X-Quelvio-Command: vercel-ai-sdk-js-tool when no client is injected', async () => {
    const { fetch: fetchImpl, calls } = captureRequests(() =>
      jsonResponse(200, queryResponsePayload()),
    );
    const t = quelvioTool({ apiKey: TEST_API_KEY, baseUrl: TEST_BASE_URL, fetch: fetchImpl });
    await t.execute!({ question: 'hi' }, EXEC_OPTS);
    expect(calls[0]?.headers['x-quelvio-command']).toBe('vercel-ai-sdk-js-tool');
  });
});
