# @quelvio/vercel-ai-sdk

> Quelvio for the Vercel AI SDK — your company's brain as a `tool()` for `streamText` and `generateText`.

`@quelvio/vercel-ai-sdk` is the official TypeScript / JavaScript
integration that plugs Quelvio's enterprise knowledge API into the
[Vercel AI SDK](https://sdk.vercel.ai/). It ships a `quelvioTool()`
factory that returns an AI-SDK-compatible tool definition, plus a
lightweight `QuelvioRetriever` for hand-rolled RAG flows — both wired
to your organization's connected sources (Google Drive, SharePoint,
Confluence, Slack, Notion, and the rest of your content fabric) and
scoped to the running user's individual permissions.

[![npm version](https://img.shields.io/npm/v/@quelvio/vercel-ai-sdk.svg)](https://www.npmjs.com/package/@quelvio/vercel-ai-sdk)
[![Node.js](https://img.shields.io/node/v/@quelvio/vercel-ai-sdk.svg)](https://www.npmjs.com/package/@quelvio/vercel-ai-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Why Quelvio (and not vanilla RAG)?

A naive RAG pipeline embeds every chunk it can find and ranks by cosine
similarity. That's why most internal copilots confidently quote a
three-year-old draft. Quelvio is a managed company-brain that does the
work a generic vector store can't:

- **Authority scoring.** Every chunk is ranked by *who authored it*, *how
  fresh it is*, and *how many downstream documents reference it* — not
  just semantic similarity to the question.
- **Lifecycle awareness.** Drafts, deprecated docs, and superseded
  decisions are demoted automatically; chunks return a `lifecycle_state`
  the LLM can quote when hedging.
- **Per-employee permissioning.** Every query is scoped to the running
  user's identity. Results never include documents the user can't
  already read in the source system (Drive ACLs, Confluence space
  restrictions, SharePoint groups).
- **Synthesized answers with citations.** The API returns a final answer
  *plus* the chunks that informed it, so your agent can hand the user a
  link to the source of truth, not a hallucination.

## Install

```bash
npm install @quelvio/vercel-ai-sdk ai zod
# or
pnpm add @quelvio/vercel-ai-sdk ai zod
# or
yarn add @quelvio/vercel-ai-sdk ai zod
```

Requires Node.js 20+. `ai` (>= 4.0.0) and `zod` (>= 3.22.0) are peer
dependencies.

## Quickstart

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { quelvioTool } from '@quelvio/vercel-ai-sdk';

const result = await streamText({
  model: openai('gpt-4o'),
  tools: { quelvio: quelvioTool({ apiKey: 'qlv_pat_...' }) }, // or set QUELVIO_API_KEY
  prompt: "what's our refund policy?",
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

The model decides whether to call the tool. When it does, `execute()`
queries Quelvio, formats the response as a synthesized answer plus a
numbered `Sources:` list (titles + URLs), and returns it as the tool
output for the model to quote back.

The tool's parameter schema accepts `question` (required) plus optional
`mode` (`fast` | `standard` | `deep`), `max_sources` (1–50), and
`domain` (taxonomy domain filter).

## Authentication

`@quelvio/vercel-ai-sdk` resolves a bearer token from the first
non-empty source, in order:

| Precedence | Source                          | Notes                                                |
| ---------- | ------------------------------- | ---------------------------------------------------- |
| 1          | `apiKey: '…'` constructor arg   | Highest priority; never persisted, never logged.     |
| 2          | `QUELVIO_API_KEY` env var       | Best for CI, notebooks, and one-off scripts.         |

Three token types are accepted — the wire format is identical, so the
library does not need to know which kind you provided:

- **Personal Access Token (PAT).** Long-lived bearer tied to a human
  user. Generate at <https://enterprise.quelvio.com/account> → *Personal
  API Keys* → *Create token*. Best for ad-hoc use and CI.
- **OAuth access token.** Short-lived token from the device-code flow
  (`quelvio login` in the [CLI](https://github.com/Quelvio/quelvio-cli)).
- **Service Account key.** Long-lived, machine-scoped. Generate at
  *Settings* → *Service Accounts*. Best for production agents.

The token is held privately on the client (via a `#private` field and a
closure); it never appears in `toString()`, `JSON.stringify()`, or any
error message emitted by this library.

## Configuration

| Constructor arg / env var       | Default                       | Purpose                                                 |
| ------------------------------- | ----------------------------- | ------------------------------------------------------- |
| `apiKey` / `QUELVIO_API_KEY`    | *(required)*                  | Bearer token (PAT, OAuth, or Service Account).          |
| `baseUrl` / `QUELVIO_API_BASE`  | `https://api.quelvio.com`     | API base — point at `api-dev` for staging.              |
| `timeoutMs`                     | `30000`                       | Per-request HTTP timeout in milliseconds.               |
| `maxRetries`                    | `3`                           | Retries for transient 5xx / network errors.             |
| `limit` (retriever) / `defaultMaxSources` (tool) | `5`        | Max chunks returned per query (1–50).                   |
| `mode` (retriever) / `defaultMode` (tool) | `'standard'`        | `fast` / `standard` / `deep`.                           |
| `domainFilter` (retriever) / `defaultDomain` (tool) | `null`    | Restrict to one taxonomy domain.                        |

## Examples

### 1. Single-shot Q&A with `streamText`

```ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { quelvioTool } from '@quelvio/vercel-ai-sdk';

const result = await streamText({
  model: openai('gpt-4o'),
  tools: { quelvio: quelvioTool() }, // reads QUELVIO_API_KEY
  prompt: 'How do we handle on-call escalations?',
  maxSteps: 3, // let the model call the tool, then write a final answer
});

const final = await result.text;
console.log(final);
```

### 2. Multi-turn agent with multiple tools

```ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { quelvioTool } from '@quelvio/vercel-ai-sdk';

const calculator = tool({
  description: 'Evaluate a simple arithmetic expression. Supports + - * / ( ).',
  parameters: z.object({ expression: z.string() }),
  execute: async ({ expression }) => {
    if (!/^[\d+\-*/().\s]+$/.test(expression)) throw new Error('unsupported chars');
    // eslint-disable-next-line no-new-func
    return String(Function(`"use strict"; return (${expression});`)());
  },
});

const { text } = await generateText({
  model: anthropic('claude-sonnet-4-6'),
  tools: {
    quelvio: quelvioTool({ defaultMode: 'deep' }),
    calculator,
  },
  system:
    'Use quelvio for anything about THIS company. Use the calculator for math. ' +
    'Always cite Quelvio sources by URL.',
  prompt:
    'How does our refund window compare to the industry standard, and how many ' +
    'refunds did we process last quarter?',
  maxSteps: 5,
});

console.log(text);
```

### 3. Direct retriever usage (manual orchestration)

When you want to retrieve context yourself and inject it into the prompt
instead of letting the model decide via tool calling:

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { QuelvioRetriever } from '@quelvio/vercel-ai-sdk';

const retriever = new QuelvioRetriever({ mode: 'deep', limit: 8 });
const { documents, queryId } = await retriever.retrieve('Summarize Q4 OKR review decisions.');

const context = documents
  .map((d, i) => `[${i + 1}] ${d.metadata.title} — ${d.metadata.source_url ?? '(no url)'}\n${d.content}`)
  .join('\n\n');

const { text } = await generateText({
  model: openai('gpt-4o'),
  system:
    "Answer the user's question using ONLY the context below. " +
    'After your answer, list the source URLs you used.',
  prompt: `Context:\n${context}\n\nQuestion: Summarize Q4 OKR review decisions.`,
});

console.log(text);
console.log(`(quelvio query_id=${queryId})`);
```

Each `QuelvioDocument` carries `chunk_id`, `title`, `source_url`,
`authority_score`, `taxonomy_domain`, and (when present) the author's
name, email, and department on `metadata` — same surface as the
LangChain.js sibling, but as plain objects so there is no
`@langchain/core` dependency.

## Authority & lifecycle

Quelvio is opinionated about which documents are *worth* citing. Two
signals flow through to the tool / retriever output:

- **`metadata.authority_score`** (0.0–1.0). Composite score from author
  seniority, document type, citation count, and freshness. Useful as a
  prompt-time hint ("prefer chunks with `authority_score > 0.7`") or as
  a hard filter in a re-ranker.
- **`risk_flag`** on the underlying query response. Boolean flags like
  `single_source` (only one chunk supported the answer) or
  `low_authority` (best chunk scored < 0.5) let you down-rank a
  synthesis or fall back to a "I'm not sure — check with X" response.

For a deeper write-up, see the [authority scoring
docs](https://docs.quelvio.com/concepts/authority).

## Related packages

- **[`@quelvio/langchain`](https://www.npmjs.com/package/@quelvio/langchain)** —
  same surface area, exposed as a LangChain.js `Retriever` and
  `StructuredTool`.
- **[`@quelvio/cli`](https://github.com/Quelvio/quelvio-cli)** — query
  the brain from your terminal, scriptable in CI, JSON output.
- **[`quelvio-langchain` (Python)](https://pypi.org/project/quelvio-langchain/)** —
  the Python sibling. Identical API surface.
- **[`@quelvio/mcp-server`](https://github.com/Quelvio/quelvio-mcp-server)** —
  use Quelvio from any Model Context Protocol client (Claude Desktop,
  Cursor, VS Code, etc.).
- **[Quelvio docs](https://docs.quelvio.com)** — concepts, API
  reference, source connectors.

## Development

```bash
git clone https://github.com/Quelvio/quelvio-vercel-ai-sdk
cd quelvio-vercel-ai-sdk
pnpm install
pnpm test
```

Build, type-check, lint:

```bash
pnpm build
pnpm typecheck
pnpm lint
```

## Contributing

Issues and pull requests welcome at
<https://github.com/Quelvio/quelvio-vercel-ai-sdk>. Please run `pnpm
lint`, `pnpm typecheck`, and `pnpm test` before opening a PR.

## License

MIT — see [LICENSE](./LICENSE).
