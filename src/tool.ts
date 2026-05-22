/**
 * `quelvioTool()` — a factory that builds a Vercel AI SDK
 * [`tool()`](https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling)
 * definition for use with `streamText` / `generateText` / agents.
 *
 * Use this whenever you want a model to *decide* whether to query the
 * company's knowledge brain. The tool returns a synthesized natural-
 * language answer plus a list of cited sources (titles + URLs), which
 * the model can quote back to the user.
 */

import { tool } from 'ai';
import { z } from 'zod';

import { QuelvioClient, type QuelvioClientOptions } from './client.js';
import type { QueryResponse } from './types.js';

const DEFAULT_DESCRIPTION =
  "Search the organization's connected knowledge brain (Google Drive, " +
  'SharePoint, Confluence, Slack, Notion, and other internal sources) ' +
  'for an authoritative, cited answer. Use this whenever the user asks ' +
  'about internal company information — policies, processes, decisions, ' +
  'people, products, projects, or anything else that lives in the ' +
  "company's systems rather than on the public internet. The answer is " +
  "scoped to the running user's individual access permissions, so " +
  'results never include documents they cannot already see. Returns a ' +
  'synthesized answer plus a list of cited sources (titles + URLs).';

export const QuelvioToolInputSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe(
      "The natural-language question to ask the company's knowledge brain. " +
        'Phrase it as the user would ask it — do not pre-process or keyword-extract.',
    ),
  mode: z
    .enum(['fast', 'standard', 'deep'])
    .optional()
    .describe(
      "Synthesis depth: 'fast' for low-latency retrieval-only, 'standard' " +
        "(default) for retrieval + synthesis, 'deep' for multi-pass " +
        'reasoning over a wider window.',
    ),
  max_sources: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of source chunks to retrieve (1 to 50, default 5).'),
  domain: z
    .string()
    .optional()
    .describe(
      "Optional taxonomy domain to restrict retrieval to (e.g. 'engineering', 'legal', 'people-ops').",
    ),
});

export type QuelvioToolInput = z.infer<typeof QuelvioToolInputSchema>;

export interface QuelvioToolOptions extends QuelvioClientOptions {
  /** Override the LLM-facing description. */
  description?: string;
  /** Default synthesis mode used when the model omits `mode`. */
  defaultMode?: string;
  /** Default chunk limit used when the model omits `max_sources`. */
  defaultMaxSources?: number;
  /** Default taxonomy domain filter used when the model omits `domain`. */
  defaultDomain?: string | null;
  /** Inject a pre-built {@link QuelvioClient} for connection reuse. */
  client?: QuelvioClient;
}

function formatResponse(response: QueryResponse): string {
  const lines: string[] = [];
  if (response.synthesis) {
    lines.push(response.synthesis.trim());
    lines.push('');
  }
  if (response.results.length > 0) {
    lines.push('Sources:');
    response.results.forEach((chunk, idx) => {
      const label = chunk.title || chunk.chunk_id;
      if (chunk.source_url) {
        lines.push(`  [${idx + 1}] ${label} — ${chunk.source_url}`);
      } else {
        lines.push(`  [${idx + 1}] ${label}`);
      }
    });
  }
  if (lines.length === 0) {
    return "No matching content was found in the company's knowledge brain.";
  }
  return lines.join('\n').trimEnd();
}

function resolveClient(options: QuelvioToolOptions): QuelvioClient {
  if (options.client) return options.client;
  const clientOpts: QuelvioClientOptions = { source: 'vercel-ai-sdk-js-tool' };
  if (options.apiKey !== undefined) clientOpts.apiKey = options.apiKey;
  if (options.baseUrl !== undefined) clientOpts.baseUrl = options.baseUrl;
  if (options.timeoutMs !== undefined) clientOpts.timeoutMs = options.timeoutMs;
  if (options.maxRetries !== undefined) clientOpts.maxRetries = options.maxRetries;
  if (options.fetch !== undefined) clientOpts.fetch = options.fetch;
  return new QuelvioClient(clientOpts);
}

/**
 * Build a Vercel AI SDK tool wired to the Quelvio knowledge brain.
 *
 * The returned object can be dropped directly into the `tools` map of
 * `streamText`, `generateText`, or any AI SDK agent. The model decides
 * when to call it; the `execute` function performs the retrieval and
 * returns a formatted, cited string.
 *
 * @example
 * ```ts
 * import { streamText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 * import { quelvioTool } from '@quelvio/vercel-ai-sdk';
 *
 * const result = await streamText({
 *   model: openai('gpt-4o'),
 *   tools: { quelvio: quelvioTool({ apiKey: 'qlv_pat_...' }) },
 *   prompt: "what's our refund policy?",
 * });
 * ```
 */
export function quelvioTool(options: QuelvioToolOptions = {}) {
  const client = resolveClient(options);
  const defaultMode = options.defaultMode ?? 'standard';
  const defaultMaxSources = options.defaultMaxSources ?? 5;
  const defaultDomain = options.defaultDomain ?? null;
  const description = options.description ?? DEFAULT_DESCRIPTION;

  return tool({
    description,
    parameters: QuelvioToolInputSchema,
    execute: async (input: QuelvioToolInput): Promise<string> => {
      if (!input.question || !input.question.trim()) {
        throw new TypeError('question must be a non-empty string');
      }
      const response = await client.query({
        query: input.question,
        limit: input.max_sources ?? defaultMaxSources,
        mode: input.mode ?? defaultMode,
        domainFilter: input.domain ?? defaultDomain,
      });
      return formatResponse(response);
    },
  });
}
