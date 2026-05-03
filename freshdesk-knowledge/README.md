# Freshdesk — Cognigy Knowledge Connector

A Cognigy.AI Knowledge Connector that synchronizes **Freshdesk Solutions articles** into a Cognigy Knowledge Store. Runs on Cognigy's built-in Knowledge Connector sync schedule (daily by default in 2026.5+; time selectable in 2026.7+; manual "Sync now" available at any time).

> **Setting this up against a real tenant?** See [`CONFIGURATION.md`](CONFIGURATION.md) for a step-by-step deployment guide covering both "I have full Freshdesk access" and "I only have credentials" scenarios, plus a discovery-flow recipe for finding category/folder IDs.

## What it ingests

- Every published article (`status === 2`) in Freshdesk's Solutions API on the connected tenant. Drafts are excluded by default; flip the **Include drafts** toggle to ingest them too.
- One **Knowledge Source per Solutions folder**, named `<Category> / <Folder>`, keyed by `externalIdentifier = folder:<folder_id>`. Articles inside a folder become chunks within that source. Folders with zero ingestable articles are skipped (no empty sources).
- Article HTML body (`description`) is stripped to plain text and split into ~1,200-character chunks with overlap. If the HTML strip yields nothing, the connector falls back to `description_text`. Each chunk is prefixed with a small `Article: <title>\nUpdated: <timestamp>\n` header so article boundaries survive retrieval inside a folder-grouped source.
- Per-chunk metadata: `source`, `categoryId`, `categoryName`, `folderId`, `folderName`, `articleId`, `articleTitle`, `articleStatus`, `articleTags`, `lastModified`, `chunkIndexInArticle`, `chunkCountInArticle`, `chunkIndex`, `chunkCount`.

Not in v1: attachments, embedded images, per-article ACLs, multi-language Solutions (Freshdesk's translated articles are nested per-article and would need an extra fetch per language).

## Freshdesk setup (one-time)

1. Sign in to your Freshdesk tenant as any agent with read access to Solutions.
2. Click your profile (top-right) → **Profile Settings**. The **Your API Key** value is on the right-hand panel.
3. Note the Freshdesk **domain** — either the subdomain (`acme`) or the full URL (`https://acme.freshdesk.com`). Both are accepted.

The connector authenticates with HTTP Basic using the API key as the username and `X` as the password (`Authorization: Basic base64(apikey:X)`), which is the standard Freshdesk pattern.

## Build

```bash
npm install
npm run build
```

Produces `freshdesk-knowledge.tar.gz`. (You also need `icon.png` — 64×64 — in the project root for the build to succeed; drop one in before running `npm run build`.)

## Install into Cognigy.AI

1. **Manage → Extensions → Upload Extension**, upload the `.tar.gz`.
2. **Build → Knowledge** → open or create a Knowledge Store.
3. **+ Add Knowledge** → pick **Freshdesk** from the Type list.
4. Fill in the fields (below) and save. Cognigy will trigger an initial ingest and from then on run on the store's schedule.

## Configuration

Credentials live on a Cognigy **Connection** (encrypted, reusable). Create it once via **Manage → Connections** or inline from the Knowledge Source form.

### Freshdesk Connection fields

| Field | Notes |
|---|---|
| `domain` | Either `acme` or `https://acme.freshdesk.com`. The connector normalises both. |
| `apiKey` | API key from **Profile Settings → Your API Key**. Mark this field as **secret** so it's stored encrypted. |

### Knowledge Source fields (per instance of the connector)

| Field | Required | Default | Notes |
|---|---|---|---|
| Freshdesk connection | ✅ | — | Pick the connection above |
| Category IDs | — | (all) | Comma-separated Solutions category IDs. Blank = pull every category. |
| Folder IDs | — | (all) | Comma-separated folder IDs. ANDed with the category filter. |
| Include drafts | — | off | When off (default), only `status=2` (published) articles are ingested. |
| Page size | — | `100` | Items fetched per Solutions API request. Max 100 (Freshdesk-imposed). |

## Sync semantics

- The connector calls `api.upsertKnowledgeSource` once per non-empty folder with `externalIdentifier = "folder:<folder_id>"` and `contentHashOrTimestamp = max(updated_at)` across the folder's articles. Cognigy uses these to skip folders whose newest-article timestamp hasn't moved — only modified folders are re-chunked.
- After the loop, any Knowledge Source previously created by this connector (`externalIdentifier` starting with `folder:`) whose folder is no longer present in the Freshdesk result set is deleted via `api.deleteKnowledgeSource`. This handles folder deletes, moves, and entire-category removals.
- Empty folders (no articles, or every article had no extractable body) are skipped quietly without disturbing previously-ingested copies.
- The `folder:` prefix on `externalIdentifier` makes reconciliation safe to share a Knowledge Store with other connectors — sources written by other connectors are ignored.

## API endpoints used

- `GET /api/v2/solutions/categories?page=N&per_page=100` — paginated category listing.
- `GET /api/v2/solutions/categories/{id}/folders?page=N&per_page=100` — folders within a category.
- `GET /api/v2/solutions/folders/{id}/articles?page=N&per_page=100` — articles within a folder. The list response includes `description` (HTML) and `description_text` (plain), so no per-article fetch is needed.

Pagination uses page bumping; the loop stops when a page returns fewer than `per_page` items. The HTTP client retries on 429/503/504 with `Retry-After` honoured up to 5 attempts, with exponential backoff otherwise.

## Troubleshooting

- **401 Unauthorized** — wrong/expired API key, or the credentials weren't base64-encoded correctly. Re-copy the key from **Profile Settings**.
- **403 Forbidden** — the agent the API key belongs to doesn't have read access to Solutions. Grant a role that includes Solutions read.
- **404 on a folder** — folder was deleted between listing and fetching. Safe to ignore; next sync will reconcile.
- **No articles ingested** — confirm the tenant has published articles (drafts are filtered by default), and that `Category IDs` / `Folder IDs` filters (if set) match real IDs.
- **Rate limiting** — Freshdesk plans cap at 3,000–5,000 API calls/hour. The HTTP client retries 429s with `Retry-After`. For very large knowledge bases, consider scoping with `Category IDs` to keep call volume per sync down.
- **HTML noise in chunks** — content is run through `html-to-text` (`a` ignored, `img/script/style` skipped). For exotic embedded structures consider extending `extractors.ts`.

## Repo layout

```
freshdesk-knowledge/
├── README.md
├── icon.png                          (drop in before build)
├── package.json
├── tsconfig.json
└── src/
    ├── module.ts
    ├── connections/
    │   └── freshdeskConnection.ts
    ├── knowledgeConnectors/
    │   └── freshdeskConnector.ts
    └── lib/
        ├── freshdeskAuth.ts          domain normalise + Basic auth header
        ├── freshdeskClient.ts        axios wrapper + retry
        ├── articleFetch.ts           categories → folders → articles iterators
        ├── extractors.ts             HTML → text + sanitize
        └── chunker.ts                paragraph-aware chunker
```
