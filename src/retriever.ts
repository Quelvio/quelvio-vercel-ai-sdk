/**
 * `QuelvioRetriever` — a framework-free wrapper around the Quelvio
 * enterprise query API.
 *
 * Use this when you want to retrieve documents *outside* the AI SDK
 * `tool()` loop — e.g. for a manual RAG pipeline, a custom evaluator,
 * or for piping context into a `streamText` prompt yourself instead of
 * letting the model decide via tool calling.
 *
 * Each call to `retrieve()` makes exactly one HTTP request to
 * `POST /v1/enterprise/query` and returns plain JavaScript objects —
 * not LangChain `Document`s — so there is no dependency on
 * `@langchain/core` or any other agent framework.
 */

import { QuelvioClient, type QuelvioClientOptions } from './client.js';
import type { ChunkResult, QueryResponse } from './types.js';

export interface QuelvioDocument {
  /** Free-form text excerpt for this chunk. Suitable for prompt context. */
  content: string;
  /**
   * Per-chunk provenance: `chunk_id`, `title`, `source_url`,
   * `authority_score`, `taxonomy_domain`, author fields, plus any
   * forward-compatible fields returned by the API.
   */
  metadata: Record<string, unknown>;
}

export interface QuelvioRetrievalResult {
  /** Retrieved documents in rank order. */
  documents: QuelvioDocument[];
  /** Server-side query identifier — pass to `QuelvioClient.getSourceDetail`. */
  queryId: string;
}

export interface QuelvioRetrieverOptions extends QuelvioClientOptions {
  /** Maximum number of chunks to retrieve (1 to 50). Defaults to 5. */
  limit?: number;
  /** `fast` | `standard` (default) | `deep`. */
  mode?: string;
  /** Restrict retrieval to a single taxonomy domain. */
  domainFilter?: string | null;
  /** Inject a pre-built {@link QuelvioClient} for connection reuse. */
  client?: QuelvioClient;
}

function chunkToDocument(chunk: ChunkResult): QuelvioDocument {
  const metadata: Record<string, unknown> = {
    chunk_id: chunk.chunk_id,
    content_piece_id: chunk.content_piece_id,
    title: chunk.title,
    score: chunk.score,
    rank: chunk.rank,
  };
  if (chunk.authority_score !== undefined && chunk.authority_score !== null) {
    metadata.authority_score = chunk.authority_score;
  }
  if (chunk.taxonomy_domain) metadata.taxonomy_domain = chunk.taxonomy_domain;
  if (chunk.source_url) {
    metadata.source_url = chunk.source_url;
    metadata.source = chunk.source_url;
  }
  if (chunk.author_name) metadata.author_name = chunk.author_name;
  if (chunk.author_email) metadata.author_email = chunk.author_email;
  if (chunk.department) metadata.department = chunk.department;
  return { content: chunk.excerpt, metadata };
}

function responseToResult(response: QueryResponse): QuelvioRetrievalResult {
  return {
    documents: response.results.map(chunkToDocument),
    queryId: response.query_id,
  };
}

export class QuelvioRetriever {
  readonly limit: number;
  readonly mode: string;
  readonly domainFilter: string | null;

  readonly #client: QuelvioClient;

  constructor(options: QuelvioRetrieverOptions = {}) {
    this.limit = options.limit ?? 5;
    this.mode = options.mode ?? 'standard';
    this.domainFilter = options.domainFilter ?? null;

    if (options.client) {
      this.#client = options.client;
    } else {
      const clientOpts: QuelvioClientOptions = { source: 'vercel-ai-sdk-js-retriever' };
      if (options.apiKey !== undefined) clientOpts.apiKey = options.apiKey;
      if (options.baseUrl !== undefined) clientOpts.baseUrl = options.baseUrl;
      if (options.timeoutMs !== undefined) clientOpts.timeoutMs = options.timeoutMs;
      if (options.maxRetries !== undefined) clientOpts.maxRetries = options.maxRetries;
      if (options.fetch !== undefined) clientOpts.fetch = options.fetch;
      this.#client = new QuelvioClient(clientOpts);
    }
  }

  toString(): string {
    return `QuelvioRetriever(limit=${this.limit}, mode=${this.mode}, domainFilter=${
      this.domainFilter ?? 'null'
    })`;
  }

  toJSON(): Record<string, unknown> {
    return {
      limit: this.limit,
      mode: this.mode,
      domainFilter: this.domainFilter,
    };
  }

  /**
   * Run a single retrieval and return `{ documents, queryId }`.
   *
   * @param query — natural-language question.
   * @throws TypeError when the query is empty or whitespace.
   */
  async retrieve(query: string): Promise<QuelvioRetrievalResult> {
    if (!query || !query.trim()) {
      throw new TypeError('query must be a non-empty string');
    }
    const response = await this.#client.query({
      query,
      limit: this.limit,
      mode: this.mode,
      domainFilter: this.domainFilter,
    });
    return responseToResult(response);
  }
}
