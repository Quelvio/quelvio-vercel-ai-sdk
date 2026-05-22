export const TEST_API_KEY = 'qlv_pat_test_ABCDEFGHIJKLMNOP_NEVER_LOG_THIS';
export const TEST_BASE_URL = 'https://api-test.quelvio.example';

export function queryResponsePayload(): Record<string, unknown> {
  return {
    query: "what's our refund policy?",
    query_id: 'q_01HW9X3J7K8N0V4P2QXYZA',
    result_count: 2,
    coverage: 'complete',
    risk_flag: { single_source: false, low_authority: false },
    retrieval_mode: 'standard',
    synthesis: 'Refunds are processed within 14 days of request, per policy v3.',
    synthesis_model: 'claude-sonnet-4-6',
    latency_ms: 432,
    tokens_consumed: 12500,
    results: [
      {
        chunk_id: 'chunk_001',
        content_piece_id: 'cp_001',
        title: 'Refund Policy v3',
        excerpt: 'All paid customers may request a refund within 30 days.',
        score: 0.92,
        rank: 1,
        authority_score: 0.87,
        taxonomy_domain: 'finance',
        source_url: 'https://drive.example/refund-policy-v3',
        author_name: 'Alex CFO',
        author_email: 'alex@example.com',
        department: 'Finance',
      },
      {
        chunk_id: 'chunk_002',
        content_piece_id: 'cp_002',
        title: 'Customer Success Playbook',
        excerpt: 'Refund requests should be acknowledged within 24h.',
        score: 0.81,
        rank: 2,
        authority_score: 0.74,
        taxonomy_domain: 'customer-success',
        source_url: 'https://confluence.example/cs-playbook',
      },
    ],
  };
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function textResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain', ...headers },
  });
}

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export function captureRequests(
  responder: (req: CapturedRequest, callIndex: number) => Response | Promise<Response>,
): { fetch: typeof globalThis.fetch; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];

  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    const headersInit = init?.headers;
    if (headersInit instanceof Headers) {
      headersInit.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(headersInit)) {
      for (const entry of headersInit) {
        const k = entry[0];
        const v = entry[1];
        if (typeof k === 'string' && typeof v === 'string') {
          headers[k.toLowerCase()] = v;
        }
      }
    } else if (headersInit) {
      for (const [k, v] of Object.entries(headersInit)) headers[k.toLowerCase()] = String(v);
    }
    let body: unknown = null;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const captured: CapturedRequest = { url, method, headers, body };
    calls.push(captured);
    return responder(captured, calls.length - 1);
  };

  return { fetch: fetchImpl, calls };
}
