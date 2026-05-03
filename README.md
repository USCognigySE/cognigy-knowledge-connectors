# Cognigy.AI Knowledge Connectors

A collection of [Cognigy.AI Knowledge Connectors](https://docs.cognigy.com/ai/for-developers/extensions#knowledge-connectors) — JavaScript modules that synchronize external knowledge bases into Cognigy [Knowledge Stores](https://docs.cognigy.com/ai/empower/knowledge-ai/knowledge-store/?h=knowled) on Cognigy's built-in sync schedule (daily by default in 2026.5+; time-of-day selectable in 2026.7+; manual "Sync now" available at any time).

This repository is **not an official Cognigy product** — it is a personal collection built for customer POCs by an NA Professional Services SE. Use the official [Cognigy/Extensions](https://github.com/Cognigy/Extensions) repo as your default; reach for these when you need a connector Cognigy hasn't published.

## Contents

| Connector | What it ingests |
|---|---|
| [freshdesk-knowledge](./freshdesk-knowledge/) | Freshdesk Solutions articles. One Knowledge Source per **folder** (`<Category> / <Folder>`), with delete/move/category-removal reconciliation. Uses HTTP Basic auth (API key). |
| [microsoft-sharepoint-knowledge](./microsoft-sharepoint-knowledge/) | SharePoint document libraries (docx, pdf, txt, md, html, etc.) and modern Site Pages, via Microsoft Graph. Azure App Registration with `Sites.Read.All` + `Files.Read.All`. |
| [service-now-knowledge](./service-now-knowledge/) | ServiceNow `kb_knowledge` articles (filterable by Knowledge Base, language, workflow state). Uses ServiceNow's scoped KM API over OAuth 2.0 Password Grant. |
| [minimal-test-connector](./minimal-test-connector/) | A diagnostic / hello-world connector that creates one chunk. Useful for isolating Knowledge Store environment issues (auth, schedule, ingestion path) before debugging a real connector. |

Each connector folder has its own README with the third-party setup steps, connection fields, source-instance fields, sync semantics, and a packaged `.tar.gz` ready to upload.

## Installing a Knowledge Connector into Cognigy.AI

1. From the relevant connector folder, run `npm install && npm run build` to produce a `.tar.gz` (or use the pre-built one if shipped).
2. In Cognigy.AI, go to **Manage → Extensions → Upload Extension** and pick the `.tar.gz`. *(Knowledge Connectors are uploaded the same way as Node Extensions — both are packaged as Cognigy Extensions.)*
3. Go to **Build → Knowledge** → open or create a Knowledge Store.
4. Click **+ Add Knowledge** → pick the connector type from the list → fill in the fields → save.
5. Cognigy triggers an initial ingest, then runs the connector on the store's schedule. Use **Sync now** to force a run at any time.

## Common patterns across these connectors

- **Connections store credentials.** All connectors keep secrets (API keys, OAuth client secrets, passwords) on a Cognigy **Connection** object — encrypted, reusable across multiple instances of the same connector. Mark secret fields as **secret** when creating the Connection.
- **Idempotent upserts.** Each connector calls `api.upsertKnowledgeSource` with a stable `externalIdentifier` (article `sys_id`, folder ID, etc.) and a `contentHashOrTimestamp`. Cognigy uses these to skip un-modified items so re-syncs only re-chunk what's changed.
- **Reconciliation on delete.** After ingesting, each connector deletes any previously-created Knowledge Source whose `externalIdentifier` is no longer present at the source — so retired articles, deleted folders, etc. are cleaned up on the next sync.
- **HTML → text → ~1,200-char chunks** with overlap, paragraph-aware. Chunks carry source-specific metadata (`articleId`, `folderId`, `sysId`, `lastModified`, `chunkIndex`, etc.) so retrieval surfaces useful context.
- **Retry on 429/503/504** with `Retry-After` honoured up to 5 attempts; exponential backoff otherwise.

## Building from source

All connectors follow the standard Cognigy Extension build:

```bash
cd <connector-folder>
npm install
npm run build      # transpile + tar
```

Output is a `.tar.gz` in the folder. Drop a 64×64 `icon.png` in the project root before building if it's missing — `npm run build` requires one.

## Contributing back upstream

If a connector here would benefit the wider community, the official path is to PR it against [Cognigy/Extensions](https://github.com/Cognigy/Extensions) — Knowledge Connectors live alongside Node Extensions in that repo. See the [approval process](https://github.com/Cognigy/Extensions#approval-process) in their README.

## License

[MIT](./LICENSE). You are subject to the terms of the third-party providers (Freshdesk, SharePoint/Microsoft Graph, ServiceNow) that you connect to. Cognigy and the author take no responsibility for your use of those services.
