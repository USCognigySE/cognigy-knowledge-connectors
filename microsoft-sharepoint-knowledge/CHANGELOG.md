# Changelog

All notable changes to the Microsoft SharePoint Knowledge Connector.

Version numbers follow [Semantic Versioning](https://semver.org/):
MAJOR.MINOR.PATCH — MAJOR breaks existing configs, MINOR adds features
backward-compatibly, PATCH fixes bugs.

## [1.1.2] — 2026-07-23

### Fixed
- Pre-flight guard now throws a **clear** error when a Knowledge Source
  would exceed Cognigy's hard cap of 1,000 chunks per Source (rather
  than the platform's opaque runtime error). Message includes the
  Source name, actual chunk count, and remediation steps.

### Changed
- Default chunk size raised from **1,200 → 1,800 characters**. Still
  well under Cognigy's per-chunk text limit (2,000 chars). Reduces
  total chunk count for large Sources by ~30% and cuts embedding
  round-trips.

### Docs
- New **Diagnosing sync failures** section walks through the exact
  flow used to isolate a real customer issue (platform-level vector
  DB rejection vs. connector-side problem).
- Troubleshooting expanded with the specific "Error while creating
  chunk in source with id X" pattern and the manual file-upload
  diagnostic that isolates platform vs. connector.
- Documented common platform misconfigurations (vector DB dimension
  mismatch, Azure OpenAI deployment-name gotcha, silent LLM failures).

## [1.1.1] — 2026-07-23

### Docs
- **Stopping or aborting a running sync** section. Cognigy has no
  first-class cancel-sync UI and the SDK exposes no `AbortSignal`;
  documents the actual workarounds and their trade-offs.

## [1.1.0] — 2026-07-23

### Added
- **Source-per-subfolder mode.** A single connector instance can now
  materialise multiple Knowledge Sources — one per immediate subfolder
  under Folder path — instead of always producing one Source per site.
  Enables topic-organised SharePoint layouts (e.g. `KnowledgeBase/HR`,
  `KnowledgeBase/IT`) to become multiple retrieval-friendly Sources
  without needing multiple connector instances.
- Crawler primitives: `getDefaultDrive`, `listImmediateSubfolders`,
  `crawlFolderTree`.
- Set `externalIdentifier` explicitly on `upsertKnowledgeSource` so
  Cognigy's automatic name-suffixing on duplicates doesn't break
  orphan cleanup.

### Docs
- New **Source-per-subfolder mode** README section with when-to-use
  guidance and behaviour details.
- **Best practices — organising SharePoint for RAG quality**: 8-point
  guide covering topic-per-Source separation, document scoping,
  filename hygiene, archive pruning, native PDFs vs. scans, metadata
  columns, chunk sizing, and Source ceilings.
- **Sites.Selected** support documentation (Azure App Registration
  Option B) — least-privilege alternative to Sites.Read.All +
  Files.Read.All, with PnP PowerShell and Graph API grant examples.

## [1.0.x] — 2026-07-23

### Added
- Initial Microsoft SharePoint Knowledge Connector.
- Site resolution via Graph `/sites/{host}:{path}:` (trailing colon).
- Document library crawl (recursive, per-drive) with type + size
  filters.
- Site page ingestion via
  `/sites/{id}/pages/microsoft.graph.sitePage?$expand=canvasLayout`.
- Text extractors: mammoth (docx), pdf-parse (pdf), html-to-text
  (html/htm/aspx), passthrough (txt/md).
- Text sanitiser strips C0 control characters and NUL bytes so PDFs
  containing them don't get silently rejected by downstream stores.
- Idempotent sync via `upsertKnowledgeSource` + `contentHashOrTimestamp`.
- Orphan cleanup: Sources no longer produced by the current sync are
  removed.
- Retry with `Retry-After` honouring on 429/503/504 responses from
  Microsoft Graph.
- Sharepoint Connection (encrypted) for tenantId, clientId,
  clientSecret.
