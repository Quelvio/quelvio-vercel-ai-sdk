/**
 * Zod schemas + TypeScript types for Quelvio API request and response
 * payloads. These mirror the wire format documented at
 * `https://api.quelvio.com/openapi.json`. Every response schema uses
 * `.passthrough()` so additions to the API (new fields on a chunk, a new
 * top-level response key) do not break older client versions.
 */

import { z } from 'zod';

export const QueryModeSchema = z.enum(['fast', 'standard', 'deep']);
export type QueryMode = z.infer<typeof QueryModeSchema>;

export const QueryRequestSchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).default(5),
  mode: QueryModeSchema.default('standard'),
  domain_filter: z.string().nullable().optional(),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const ChunkResultSchema = z
  .object({
    chunk_id: z.string(),
    content_piece_id: z.string(),
    title: z.string(),
    excerpt: z.string(),
    score: z.number(),
    rank: z.number().int(),
    authority_score: z.number().nullable().optional(),
    taxonomy_domain: z.string().nullable().optional(),
    source_url: z.string().nullable().optional(),
    creator_id: z.string().nullable().optional(),
    author_name: z.string().nullable().optional(),
    author_email: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
  })
  .passthrough();
export type ChunkResult = z.infer<typeof ChunkResultSchema>;

export const QueryResponseSchema = z
  .object({
    query: z.string(),
    query_id: z.string(),
    results: z.array(ChunkResultSchema).default([]),
    result_count: z.number().int().default(0),
    coverage: z.string().nullable().optional(),
    risk_flag: z.record(z.boolean()).default({}),
    retrieval_mode: z.string().nullable().optional(),
    synthesis: z.string().nullable().optional(),
    synthesis_model: z.string().nullable().optional(),
    latency_ms: z.number().int().nullable().optional(),
    tokens_consumed: z.number().int().nullable().optional(),
  })
  .passthrough();
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export const DomainCoverageSchema = z
  .object({
    taxonomy_domain: z.string(),
    document_count: z.number().int().default(0),
    chunk_count: z.number().int().default(0),
    expert_count: z.number().int().default(0),
    coverage_level: z.string().nullable().optional(),
  })
  .passthrough();
export type DomainCoverage = z.infer<typeof DomainCoverageSchema>;

export const DomainsListResponseSchema = z
  .object({
    domains: z.array(DomainCoverageSchema).default([]),
    total: z.number().int().default(0),
  })
  .passthrough();
export type DomainsListResponse = z.infer<typeof DomainsListResponseSchema>;

export const SourceChunkSchema = z
  .object({
    chunk_id: z.string(),
    content_piece_id: z.string(),
    title: z.string(),
    excerpt: z.string(),
    source_url: z.string().nullable().optional(),
    source_type: z.string().nullable().optional(),
    lifecycle_state: z.string().nullable().optional(),
    embedded_at: z.string().nullable().optional(),
    last_source_updated_at: z.string().nullable().optional(),
    authority_score: z.number().nullable().optional(),
    taxonomy_domain: z.string().nullable().optional(),
    author_name: z.string().nullable().optional(),
    author_email: z.string().nullable().optional(),
  })
  .passthrough();
export type SourceChunk = z.infer<typeof SourceChunkSchema>;

export const SourceDetailResponseSchema = z
  .object({
    query_id: z.string(),
    tenant_id: z.string().nullable().optional(),
    chunks: z.array(SourceChunkSchema).default([]),
    chunk_count: z.number().int().default(0),
  })
  .passthrough();
export type SourceDetailResponse = z.infer<typeof SourceDetailResponseSchema>;
