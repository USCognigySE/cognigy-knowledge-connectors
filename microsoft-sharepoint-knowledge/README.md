# Microsoft SharePoint — Cognigy Knowledge Connector

A Cognigy.AI Knowledge Connector that synchronizes a SharePoint site's **document libraries** and **site pages** into a Cognigy Knowledge Store. Runs on Cognigy's built-in Knowledge Connector sync schedule (daily by default; time-of-day selectable from Cognigy.AI 2026.7+).

## What it ingests

The connector treats a SharePoint site as **two distinct content sources** controlled by independent toggles on the Knowledge Source form:

### `Include document libraries`

When enabled, the connector enumerates **every Document Library on the site** (Graph calls these "drives") and recursively walks the folder tree of each one. That includes the default "Shared Documents" library plus any custom libraries the site owner has added. For each file it finds:

- Skips files whose extension isn't in the **File type allowlist** (defaults `docx,pdf,txt,md,html,htm,aspx`).
- Skips files larger than the **Max file size (MB)** cap.
- If a **Folder path filter** is set, only files under that subpath are considered.
- Downloads the file content via `/drives/{id}/items/{id}/content`, extracts text (mammoth for docx, pdf-parse for PDFs, html-to-text for HTML/aspx), sanitises control characters, chunks the text, and pushes chunks to Cognigy.

### `Include site pages`

When enabled, the connector fetches the site's **modern SharePoint Pages** — the authored pages you'd see under the site's left-nav *Pages* section (news posts, wiki-style pages, landing pages). These are **not files**; they're stored as structured `sitePage` records. The connector:

- Calls `/sites/{id}/pages/microsoft.graph.sitePage?$expand=canvasLayout`.
- For each page, walks the `canvasLayout` (horizontal sections + columns + web parts, plus any vertical section).
- Extracts and concatenates the text content of every web part on the page, plus the page title and description.
- Chunks and pushes the result.

Classic SharePoint publishing pages (pre-modern) are **not exposed by Graph** and cannot be ingested this way.

### They're independent

The two toggles are entirely separate — turn either off and that content type is skipped completely. Turn both off and the sync ingests nothing. Typical settings:

- **Documents-only sites** (a Shared Documents dump): Include libraries = Yes, Include pages = No.
- **Wiki / news / hub sites** (mostly authored pages): Include libraries = No (or Yes if you also want attachments), Include pages = Yes.

### Not in v1

SharePoint Lists (custom columns/rows), subsite recursion, delta/incremental sync, OCR on image-only PDFs, per-file ACL propagation.

## Azure App Registration (one-time setup)

1. In the Azure portal go to **Entra ID** → **App registrations** → **New registration**.
2. Give it a name (e.g. `Cognigy SharePoint Connector`), choose **Single tenant**, click **Register**.
3. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
4. Go to **Certificates & secrets** → **New client secret**. Copy the **Value** immediately (you can't see it again) — this is your **Client Secret**.
5. Grant **Microsoft Graph application permissions** — pick **one** of the two options below.

### Option A — Tenant-wide access (simplest)

Under **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**, add:

- `Sites.Read.All`
- `Files.Read.All`

Then click **Grant admin consent for <tenant>**.

The app can now read **every** SharePoint site in the tenant. Easiest to set up; broadest blast radius.

### Option B — `Sites.Selected` (least-privilege, recommended for production)

The connector fully supports `Sites.Selected`, which grants the app access to **only the specific sites you explicitly allow** — no tenant-wide read. No connector code changes needed.

**Step 1 — Assign the permission** (in place of the two from Option A):

Under **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**, add:

- `Sites.Selected`

Click **Grant admin consent for <tenant>**. With `Sites.Selected` alone, the app still has **no** site access until step 2 — drive/file/page reads inherit from the per-site grant.

**Step 2 — Grant the app to each site you want it to read.** Two equivalent options:

PnP PowerShell (interactive, easiest):
```powershell
Connect-PnPOnline -Url https://<tenant>.sharepoint.com/sites/<site> -Interactive
Grant-PnPAzureADAppSitePermission `
  -AppId "<client-id>" `
  -DisplayName "Cognigy SharePoint Connector" `
  -Site "https://<tenant>.sharepoint.com/sites/<site>" `
  -Permissions Read
```

Microsoft Graph API (script-friendly):
```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["read"],
  "grantedToIdentities": [
    { "application": { "id": "<client-id>", "displayName": "Cognigy SharePoint Connector" } }
  ]
}
```

Repeat for every site you intend to add a connector instance for. Propagation usually takes <1 minute.

> **Note on site pages:** `Sites.Selected` historically had gaps on the `/sites/{id}/pages` endpoint. It's been fixed in current Graph, but if your tenant still returns 403 on pages while libraries work fine, set **Include site pages** to `No` in the connector instance and rely on document libraries.

## Build

```bash
npm install
npm run build
```

Produces `microsoft-sharepoint-knowledge.tar.gz`.

## Install into Cognigy.AI

1. In Cognigy.AI go to **Manage** → **Extensions** → **Upload Extension**.
2. Upload the `.tar.gz` produced above.
3. Go to **Build** → **Knowledge** → open (or create) a Knowledge Store.
4. Click **+ Add Knowledge** on the Knowledge Sources page.
5. Select **Microsoft SharePoint** from the Type list.
6. Fill in the fields (below) and save.

## Configuration

The connector uses Cognigy's **Connection** object for credentials (so the secret is stored encrypted and reusable across connector instances). You create the connection once in **Manage → Connections** (or inline from the Knowledge Source form), then pick it from the dropdown.

### SharePoint Connection fields

| Field | Notes |
|---|---|
| `tenantId` | Directory (tenant) ID — GUID from Azure app registration overview |
| `clientId` | Application (client) ID — GUID from Azure app registration overview |
| `clientSecret` | The secret **value** (not the secret ID) |

### Knowledge Source fields (per instance)

| Field | Required | Notes |
|---|---|---|
| SharePoint connection | ✅ | Pick the connection created above |
| SharePoint Site URL | ✅ | e.g. `https://contoso.sharepoint.com/sites/HR` |
| Create one Knowledge Source per subfolder | — | Yes/No, default No. See section below. |
| Include document libraries | — | Yes/No, default Yes |
| Include site pages | — | Yes/No, default Yes (ignored in per-subfolder mode) |
| Folder path filter | — | Limit crawl to a subpath of the default library. Required in per-subfolder mode. |
| File type allowlist | — | Default `docx,pdf,txt,md,html,htm,aspx` |
| Max file size (MB) | — | Default `25` |

## Source-per-subfolder mode

By default, one connector instance produces **one Knowledge Source** containing everything on the site. For a small, single-topic site this is fine. For a site that hosts many distinct topics (HR, IT, Products, Legal…), one big Source produces poor retrieval — see [Best practices](#best-practices--organizing-sharepoint-for-rag-quality) point 1.

The **Create one Knowledge Source per subfolder** toggle lets a single connector instance materialise multiple Sources automatically:

- Set **Folder path filter** to the *parent* folder (e.g. `KnowledgeBase`).
- Toggle **Create one Knowledge Source per subfolder** to **Yes**.
- On sync, the connector enumerates the immediate subfolders of that parent (e.g. `KnowledgeBase/HR`, `KnowledgeBase/IT`, `KnowledgeBase/Products`) and creates **one Knowledge Source per subfolder**, named after the subfolder. Files inside each subfolder (recursively) are ingested into that subfolder's Source.

### Behavior details

- **Site pages** are not ingested in this mode — the toggle is ignored. Use a second connector instance in single-source mode if you also want site pages.
- **Empty subfolders** (no supported files) are skipped and do not create a Source.
- **Rename / delete a subfolder in SharePoint** and its Source is auto-cleaned on the next sync (via the built-in orphan cleanup).
- **Multiple libraries**: only the site's default document library is enumerated in this mode. Content in other libraries is ignored.
- **externalIdentifier** is set to `<siteName>::<parentPath>/<subfolder>` so renames on the Cognigy side don't cause duplicates.

### When to use each mode

| Situation | Mode |
|---|---|
| Single topic per site (small wiki, one product's docs) | **Single-source** (default) |
| One site hosts many topics organized into subfolders | **Source per subfolder** |
| Content spans **multiple** SharePoint sites | Multiple connector instances (one per site) |
| Different business units | Multiple connector instances, likely in different Knowledge Stores |

### Multiple instances of the same connector

You do **not** need to reinstall the extension to add another instance. The extension registers the SharePoint connector type once; you can then add as many Knowledge Source instances of it as you want — different sites, different Stores, different modes — by using Build → Knowledge → Add Knowledge → Microsoft SharePoint each time.

## Sync schedule

Cognigy.AI invokes the connector on its built-in schedule (daily default in 2026.5+; time selectable in 2026.7+). The connector is idempotent via `upsertKnowledgeSource` — safe to run repeatedly. A **Sync now** action is also available in the Knowledge Source UI.

## One connector instance per site

To ingest multiple sites, add the connector multiple times (each instance produces its own Knowledge Source with its own schedule and filters).

## Best practices — organizing SharePoint for RAG quality

The connector reads whatever you point it at, verbatim. The single biggest lever on retrieval quality isn't the connector — it's how the source content is organized. If you're standing up SharePoint as a knowledge base for the first time, share this section with the customer's SharePoint admins **before** they upload content.

### 1. One topic per Knowledge Source, not one dump per site

A single Knowledge Source ingesting 4,000+ documents spanning HR policy, IT tickets, product manuals, and press releases will retrieve poorly — the LLM has no way to prefer the right topic. The retriever ranks purely by semantic similarity, and "policy" language repeats across many topics.

Three ways to split (in order of simplicity):

- **Source per subfolder (recommended, single instance).** Organise the library into top-level folders — `KnowledgeBase/HR/`, `KnowledgeBase/IT/`, `KnowledgeBase/Products/`, `KnowledgeBase/Legal/` — and use **one connector instance** with Folder path set to `KnowledgeBase` and *Create one Knowledge Source per subfolder = Yes*. The connector auto-creates one Source per subfolder. See [Source-per-subfolder mode](#source-per-subfolder-mode).
- **Folder-per-topic + one instance per folder.** Same folder layout, but add a separate connector instance per folder (each with its own Folder path). More UI clicks; useful if you want per-folder scheduling.
- **Site-per-topic (more overhead, cleaner permissions).** Split into multiple SharePoint sites, one connector instance per site.

### 2. Keep individual documents narrow and self-contained

RAG works best when a document is *about one thing*. A 200-page "Employee Handbook" that covers benefits, IT policy, dress code, and the fire drill will produce chunks that mix topics — retrieval will surface the wrong section.

- Split mega-documents into topic-focused PDFs/docx (`Benefits-Handbook.pdf`, `IT-Acceptable-Use.pdf`, `Fire-Safety.pdf`).
- If splitting isn't possible, at least ensure the document has clear **H1/H2 headings** every few paragraphs — headings anchor chunks and dramatically improve retrieval precision.

### 3. Descriptive filenames

The filename ends up in the chunk metadata and is often the first thing an agent shows a user as a citation. `Doc1.pdf`, `Untitled.docx`, `Copy of Copy of Policy.pdf` are all citation-hostile.

- Use descriptive names: `Return-Policy-2026.pdf`, `IT-Password-Requirements.pdf`.
- Avoid version numbers *inside* active filenames — keep only the current version live and archive old versions to a separate folder.

### 4. Prune archives, drafts, and duplicates

The connector ingests **every** file in scope. That includes:

- Old versions kept "just in case" (`Handbook-v1.pdf`, `Handbook-v2.pdf`, `Handbook-final.pdf`, `Handbook-final-FINAL.pdf`) — all get ingested, all compete for retrieval, and the agent may cite an obsolete one.
- Draft / working documents that shouldn't influence answers.
- Meeting notes, one-off memos, and personal working files.

Move these to an `Archive/` or `Drafts/` folder **outside** the connector's Folder path filter. Or exclude them by moving to a different library that isn't crawled.

### 5. Prefer native digital documents to scans

- Native PDFs (created from Word/Google Docs) extract cleanly.
- Scanned PDFs (image-only, no OCR layer) will ingest as **empty text** — they show up as zero-content chunks that pollute the store. The connector doesn't OCR.
- If scans are unavoidable, run them through OCR first (Adobe Acrobat, Azure Document Intelligence, etc.) and re-upload the OCR'd version.

### 6. Use SharePoint metadata columns for filtering *(not automatic yet)*

If the customer sets up SharePoint columns like `Audience`, `Department`, `Status = Published`, that discipline pays off later. The current connector doesn't read custom columns, but that's a natural enhancement — reach out if this is important for the deployment and we can wire it in.

### 7. Right-size the individual chunks

The connector chunks text at ~1,200 characters (paragraph-aware). Large image-heavy PDFs with sparse text can produce chunks of just a page title — those don't retrieve well. If you see this pattern, split the source document into text-heavier sub-documents.

### 8. Watch the total document count per Source

Cognigy's per-Source ceiling is 1,000 chunks (~250 short documents, roughly). If a Knowledge Source approaches that limit, retrieval slows and quality drops. Split into multiple Sources long before you hit it — see item 1.

## Stopping or aborting a running sync

Cognigy.AI does **not** currently expose a first-class "cancel sync" button, and the Knowledge Connector SDK gives connector code no cancellation signal to listen for. Once a sync starts, there is no graceful way to interrupt it from either side.

**Treat "Save & Sync" as an irreversible action.** Verify every field (Site URL, Folder path, per-subfolder toggle, file-type allowlist) *before* clicking Save. A misconfigured sync on a large SharePoint site can otherwise run for many minutes ingesting the wrong content.

If a sync has already started and you need to stop it, these are the practical workarounds — none are graceful, and each has a cost:

| Situation | Workaround |
|---|---|
| You spot the mistake **before** clicking Save & Sync | Cancel the dialog. Nothing has started. |
| Sync has just launched and is ingesting the wrong content | **Delete the Knowledge Source** while it's running. Cognigy typically aborts the ingest when its target Source disappears. The next sync will start fresh with the corrected config. |
| Extension is uploaded and you need to prevent *all* syncs of this type | **Uninstall the extension** in Manage → Extensions. All Knowledge Sources of this connector type will then fail their next scheduled sync (safe fail — content already ingested stays intact until you delete it). |
| Runaway sync you can't reach via the UI | Open a ticket with Cognigy support. |

Content already ingested into Cognigy is not automatically rolled back by any of the above — the Knowledge Source (if not deleted) retains whatever chunks made it in before the interruption. On the next successful sync, `upsertKnowledgeSource` reconciles state via the content hash.

## Diagnosing sync failures

Cognigy shows one error line per failed sync — usually `Error while executing extension: Error: ...` followed by whatever the connector threw. The message is often generic ("Error while creating chunk in source with id X"). Follow this flow to isolate the actual cause **before** changing any connector code.

### Step 1 — Is the Cognigy environment able to accept chunks at all?

Bypass this connector entirely first.

1. **Build → Knowledge → open the failing Knowledge Store → + Add Knowledge → File Upload.**
2. Drop in any small plain-text `.txt` file (a few paragraphs of benign content).
3. Wait for it to process.

| Result | Meaning |
|---|---|
| ✅ Uploads and indexes cleanly (~10s) | The Cognigy platform (embedding provider + vector database) is healthy. Skip to Step 2. |
| ❌ Errors — including *"Failed to ingest chunks into the vector database"* | The environment is broken. Fix it before touching the connector. See "Common platform-level failures" below. |
| ❌ Errors — *"Error while creating chunk in source with id X"* | Same as above. This exact message from a manual upload is a platform issue, not a connector issue. |

### Step 2 — Is the SharePoint content the problem?

If manual upload works but the SharePoint sync still fails, the error message will now include the Source name, chunk index, doc title, and text length (thrown from this connector). Common causes:

- **Chunk count over the 1,000-cap** — since v1.1.2 the connector throws a clean error naming the Source and its chunk count. Fix by splitting content (Folder path filter, Source-per-subfolder mode, narrower file-type allowlist).
- **A specific PDF is unreadable** — password-protected or corrupt. The connector logs and skips these internally, but a very large percentage of unreadable files can produce zero-content Sources. Check the source library.
- **Graph 401 mid-sync** — the OAuth token expires after ~1 hour. Very large syncs (thousands of files) can exceed this. Not currently handled by refresh; open an issue if you hit it.

### Common platform-level failures (found in Step 1)

These are Cognigy-side, not connector-side. Fix them first.

- **Vector-database dimension mismatch.** The most common cause of *"Failed to ingest chunks into the vector database"*. The vector store was created expecting one embedding-dimension (e.g. 3,072 for `text-embedding-3-large`), but the embedding model was later switched to one producing different dimensions (e.g. 1,536 for `text-embedding-3-small`). Dimensions can't be changed in place. **Fix:** delete all Knowledge Stores using this embedding, reconfigure the embedding model, recreate the Stores.

- **LLM/embedding "configured" in the UI but not actually working.** The Cognigy admin page shows a model is set, but requests fail. Ways this happens:
  - Bad or expired OpenAI/Azure API key.
  - **Azure OpenAI deployment-name mismatch** — Cognigy asks for a *deployment name*, not the model's underlying name. Azure lets deployment names be arbitrary strings. If Cognigy is set to `text-embedding-3-small` but the actual Azure deployment is named `embed-small-eastus`, every request 404s and surfaces here as the generic error.
  - The wrong model *type* is selected (e.g. a chat-completion model configured where an embedding model is expected).
  - Model deployed with zero TPM quota — every request fails immediately.
  - Wrong Azure `api-version` string.

- **Vector-database service unhealthy.** Rare, but backend storage/pgvector/etc. can be down or over-capacity. The manual upload test surfaces this.

## Troubleshooting (specific error signatures)

- **401 / invalid_client** during sync — wrong tenant or client ID, or the client secret has expired. Regenerate the secret in Azure App Registration.
- **403 on `/sites` or `/drives`**
  - *Option A auth:* admin consent wasn't granted, or `Sites.Read.All` / `Files.Read.All` are missing.
  - *Option B (`Sites.Selected`):* the app hasn't been granted access to this specific site yet (see step 2 of Option B above), or the grant hasn't propagated.
- **404 on site resolve** — the Site URL doesn't match an existing site. Paste the exact URL from the browser address bar. Do **not** include library or folder paths (e.g. `/sites/HR/Shared%20Documents` is wrong; `/sites/HR` is right).
- **"Knowledge Source X would contain N chunks, exceeding Cognigy's cap of 1000..."** — thrown by this connector's pre-flight guard. Split the content: Folder path filter, Source-per-subfolder mode, or narrower file-type allowlist.
- **"Error while creating chunk in source with id X"** on chunk 1 — nearly always a **platform-level** failure. Run the Step 1 diagnostic (upload a small text file directly). If that also fails, fix the platform, not the connector.
- **Pages not appearing** — modern SharePoint site pages only; classic publishing pages are not exposed by Graph. On `Sites.Selected` also see the note in Option B above.
- **Large PDFs silently skipped** — raise the Max file size (MB) field.
- **Sync appears to complete but retrieval returns unrelated chunks** — one big Source ingesting many topics. See [Best practices](#best-practices--organising-sharepoint-for-rag-quality) point 1 and consider Source-per-subfolder mode.
