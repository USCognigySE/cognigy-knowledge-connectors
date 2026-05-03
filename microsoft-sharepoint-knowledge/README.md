# Microsoft SharePoint — Cognigy Knowledge Connector

A Cognigy.AI Knowledge Connector that synchronizes a SharePoint site's **document libraries** and **site pages** into a Cognigy Knowledge Store. Runs on Cognigy's built-in Knowledge Connector sync schedule (daily by default; time-of-day selectable from Cognigy.AI 2026.7+).

## What it ingests

- Files in any document library on the site (docx, pdf, txt, md, html, htm, aspx by default)
- SharePoint Site Pages (`.aspx` pages authored in SharePoint)

Not in v1: SharePoint Lists, subsite recursion, delta/incremental sync, OCR on image PDFs, per-file ACLs.

## Azure App Registration (one-time setup)

1. In the Azure portal go to **Entra ID** → **App registrations** → **New registration**.
2. Give it a name (e.g. `Cognigy SharePoint Connector`), choose **Single tenant**, click **Register**.
3. Note the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
4. Go to **Certificates & secrets** → **New client secret**. Copy the **Value** immediately (you can't see it again) — this is your **Client Secret**.
5. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** and add:
   - `Sites.Read.All`
   - `Files.Read.All`
6. Click **Grant admin consent for <tenant>**.

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

## Troubleshooting

- **401 / invalid_client** — wrong tenant or client ID, or secret has expired. Regenerate the secret in Azure.
- **403 on /sites or /drives** — admin consent wasn't granted, or `Sites.Read.All` / `Files.Read.All` are missing.
- **404 on site resolve** — the Site URL doesn't match an existing site. Paste the exact URL as shown in the browser address bar.
- **Pages not appearing** — modern SharePoint site pages only; classic publishing pages are not exposed by Graph.
- **Large PDFs skipped** — raise the Max file size (MB) field.
