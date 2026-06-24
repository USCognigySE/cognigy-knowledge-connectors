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

## Troubleshooting

- **401 / invalid_client** — wrong tenant or client ID, or secret has expired. Regenerate the secret in Azure.
- **403 on /sites or /drives**
  - *Option A:* admin consent wasn't granted, or `Sites.Read.All` / `Files.Read.All` are missing.
  - *Option B:* the app has `Sites.Selected` but hasn't been granted access to *this specific site* yet (see step 2 above), or the grant hasn't propagated.
- **404 on site resolve** — the Site URL doesn't match an existing site. Paste the exact URL as shown in the browser address bar.
- **Pages not appearing** — modern SharePoint site pages only; classic publishing pages are not exposed by Graph. On `Sites.Selected`, also see the note in Option B above.
- **Large PDFs skipped** — raise the Max file size (MB) field.
