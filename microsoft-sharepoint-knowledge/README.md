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
| Include document libraries | — | Yes/No, default Yes |
| Include site pages | — | Yes/No, default Yes |
| Folder path filter | — | Limit crawl to a subpath of the default library |
| File type allowlist | — | Default `docx,pdf,txt,md,html,htm,aspx` |
| Max file size (MB) | — | Default `25` |

## Sync schedule

Cognigy.AI invokes the connector on its built-in schedule (daily default in 2026.5+; time selectable in 2026.7+). The connector is idempotent via `upsertKnowledgeSource` — safe to run repeatedly. A **Sync now** action is also available in the Knowledge Source UI.

## One connector instance per site

To ingest multiple sites, add the connector multiple times (each instance produces its own Knowledge Source with its own schedule and filters).

## Best practices — organizing SharePoint for RAG quality

The connector reads whatever you point it at, verbatim. The single biggest lever on retrieval quality isn't the connector — it's how the source content is organized. If you're standing up SharePoint as a knowledge base for the first time, share this section with the customer's SharePoint admins **before** they upload content.

### 1. One topic per Knowledge Source, not one dump per site

A single Knowledge Source ingesting 4,000+ documents spanning HR policy, IT tickets, product manuals, and press releases will retrieve poorly — the LLM has no way to prefer the right topic. The retriever ranks purely by semantic similarity, and "policy" language repeats across many topics.

Two ways to split:

- **Folder-per-topic + Folder path filter (preferred, one site).** Organise the library into top-level folders — `HR/`, `IT/`, `Products/`, `Legal/` — and add **one connector instance per folder**, each with a different **Folder path filter** and named accordingly. Each instance becomes its own Knowledge Source that Cognigy can tag and route to.
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

## Troubleshooting

- **401 / invalid_client** — wrong tenant or client ID, or secret has expired. Regenerate the secret in Azure.
- **403 on /sites or /drives**
  - *Option A:* admin consent wasn't granted, or `Sites.Read.All` / `Files.Read.All` are missing.
  - *Option B:* the app has `Sites.Selected` but hasn't been granted access to *this specific site* yet (see step 2 above), or the grant hasn't propagated.
- **404 on site resolve** — the Site URL doesn't match an existing site. Paste the exact URL as shown in the browser address bar.
- **Pages not appearing** — modern SharePoint site pages only; classic publishing pages are not exposed by Graph. On `Sites.Selected`, also see the note in Option B above.
- **Large PDFs skipped** — raise the Max file size (MB) field.
