# Freshdesk Knowledge Connector — Configuration Guide

A step-by-step setup guide for deploying the Freshdesk Knowledge Connector against a real tenant. Covers two starting points:

- **[Scenario A — No Freshdesk access](#scenario-a--no-freshdesk-access)** — you have credentials and a vague description of the KB content but cannot log into the Freshdesk admin UI.
- **[Scenario B — Full Freshdesk access](#scenario-b--full-freshdesk-access)** — you can browse Solutions in the Freshdesk admin UI and can read IDs straight from URLs.

Both scenarios end at the same place: a working Knowledge Source on a Cognigy Knowledge Store, syncing on the project schedule.

---

## Prerequisites

Before either scenario, make sure you have:

| Item | Where it comes from |
|---|---|
| `freshdesk-knowledge.tar.gz` | This repo, after `npm install && npm run build`. Drop a 64×64 `icon.png` in the project root before building. |
| Freshdesk **domain** | Either the bare subdomain (`acme`) or the full host (`https://acme.freshdesk.com`). The portal URL with a path (`/helpdesk`, `/support/home`) is also accepted — the connector strips paths automatically. |
| Freshdesk **API key** | The key for any agent with **read access to Solutions**. From an agent's profile, click **Profile Settings** in the top-right — the key is on the right-hand panel. Treat it like a password. |
| A Cognigy.AI project with **Knowledge Store** enabled | If `Build → Knowledge` doesn't appear, the project's plan or feature flag doesn't include Knowledge Stores. |

### Install the extension once per project

1. **Manage → Extensions → Upload Extension**, upload `freshdesk-knowledge.tar.gz`.
2. Wait for the upload to validate (a few seconds). The extension shows up as **Freshdesk (Knowledge Connector)**.

You only do this once. After that, every Knowledge Store in the project can use it.

---

## Step 1 — Create the Cognigy Connection (universal)

The connection holds credentials so they don't have to be re-entered per Knowledge Source.

1. **Manage → Connections → New Connection**.
2. **Type**: pick **Freshdesk (API key)**.
3. **Name**: something memorable, e.g. `freshdesk-aafes-sandbox`.
4. **Fields**:
   - `domain` — the Freshdesk domain (see the table above).
   - `apiKey` — the agent API key. Toggle **Secret** so it's stored encrypted.
5. **Save**.

> **Sanity check.** Trying to save with an empty `domain` or `apiKey` won't fail at the connection screen — it'll fail on the first sync with a clear error. If the very first sync errors with `Freshdesk request failed [GET https://...] status=401`, the API key is wrong; if `status=404` and the body is HTML, the `domain` doesn't resolve to a Freshdesk tenant (most often a copy-pasted portal URL pointing at a custom subdomain that doesn't have an API).

---

## Step 2 — Decide what to sync

This is where the two scenarios diverge.

### Scenario A — No Freshdesk access

You have credentials but you can't log into the Freshdesk admin UI. You have to discover what's in the KB through the API. **You have three options**, in increasing order of effort and decreasing order of risk-of-noise:

#### A1 — Sync everything (zero discovery)

Leave **Category IDs** and **Folder IDs** blank. The connector walks every category, every top-level folder, and every published article. This is the **fastest path to a working POC** but you may pull content the customer didn't intend (e.g. internal-only categories, historical noise).

Use this when:
- You're doing a first-pass POC and content quality can be reviewed after the first sync.
- The customer confirms the entire Solutions KB is in scope.

#### A2 — Discover via a Cognigy flow, then scope

Build a one-off **discovery flow** in Cognigy using the HTTP Request node. You don't need to publish or keep this flow — it's a scratch flow you delete once you have the IDs.

##### Flow: list categories

| HTTP Request node | Value |
|---|---|
| Method | `GET` |
| URL | `https://<your-domain>/api/v2/solutions/categories?per_page=100` |
| Authorization | **Basic Auth** — Username = *(your API key)*, Password = `X` |
| Store result in | `input.fdCategories` |

Trigger the flow once. The output is a JSON array. Note the `id` and `name` of each category. Example:

```json
[
  { "id": 11000000024207, "name": "Associate Information" },
  { "id": 11000000024212, "name": "Human Resources" },
  …
]
```

##### Flow: list folders inside a category

For each category you want to scope to, add a second HTTP Request node:

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `https://<your-domain>/api/v2/solutions/categories/<categoryId>/folders?per_page=100` |
| Authorization | same Basic Auth |
| Store result in | `input.fdFolders` |

The response includes per-folder fields that help you decide what to ingest:

| Field | What it tells you |
|---|---|
| `id` | The folder ID — paste this into **Folder IDs** if you want to scope at folder granularity. |
| `name` | Folder name. |
| `articles_count` | How many articles live directly in the folder. **Folders with `0` are skipped silently** by the connector. |
| `sub_folders_count` | How many child folders. **The connector does NOT currently follow sub-folders** — see [Limitations](#limitations) below. |
| `visibility` | `2` = visible on the public portal; `1` = logged-in / agent-only. The API returns both; the connector currently ingests articles regardless of folder visibility (only article `status` is filtered). |
| `parent_folder_id` | `null` for top-level folders. Non-null entries don't appear via this endpoint — they live under `/folders/{id}/subfolders`. |

##### Flow (optional): list sub-folders

If a folder reports `sub_folders_count > 0`:

| Field | Value |
|---|---|
| Method | `GET` |
| URL | `https://<your-domain>/api/v2/solutions/folders/<folderId>/subfolders?per_page=100` |
| Authorization | same Basic Auth |

Use this for awareness only — until sub-folder recursion is added to the connector, sub-folder content is not ingested even if you list a parent folder ID.

##### Optional: skip the flow with curl

If you have terminal access, the same data is one line away:

```bash
curl -u <APIKEY>:X "https://<your-domain>/api/v2/solutions/categories?per_page=100" | jq '.[] | {id, name}'
curl -u <APIKEY>:X "https://<your-domain>/api/v2/solutions/categories/<categoryId>/folders?per_page=100" \
  | jq '.[] | {id, name, articles_count, sub_folders_count, visibility}'
```

#### A3 — Have the customer send you a list

If discovery is risky (e.g. you're worried about pulling sensitive HR content into a POC index), ask the customer to send you the **category and folder names** they consider in scope, then use the discovery flow above to translate names → IDs. Cleanest, but adds a back-and-forth.

---

### Scenario B — Full Freshdesk access

You can log into Freshdesk as an admin or agent and browse Solutions directly. Use the URL bar — every page has the IDs you need:

| To find the ID of… | Navigate to… | URL pattern |
|---|---|---|
| A **category** | Solutions → click a category | `https://<your-domain>/a/solutions/categories/`**`<categoryId>`** |
| A **folder** | Solutions → category → click a folder | `https://<your-domain>/a/solutions/categories/<categoryId>/folders/`**`<folderId>`** |
| An **article** (for spot-checks later) | Solutions → folder → click an article | `https://<your-domain>/a/solutions/articles/`**`<articleId>`** |

The IDs are the trailing numeric portions. Paste them comma-separated into **Category IDs** or **Folder IDs**.

> Quick check while you're there: count the published articles per folder you intend to scope to. The connector skips folders with zero published articles, which can confuse "why didn't anything appear?" debugging later.

---

## Step 3 — Add the Knowledge Source

Once you know what you want to sync:

1. **Build → Knowledge**. Open or create a Knowledge Store.
2. Click **+ Add Knowledge**.
3. **Type** dropdown → **Freshdesk**.
4. Fill in the fields below.
5. Save.

Cognigy triggers an initial ingest as soon as you save. From then on, the Knowledge Store's schedule (set on the store itself, not on the connector) drives re-syncs.

### Knowledge Source field reference

| Field | Required | Default | Format | Notes |
|---|---|---|---|---|
| Freshdesk connection | ✅ | — | — | Pick the connection from Step 1. |
| Category IDs | — | (all) | Comma-separated numeric IDs, e.g. `11000000024207, 11000000024212` | Restricts sync to these categories. Spaces tolerated. |
| Folder IDs | — | (all) | Comma-separated numeric IDs, e.g. `11000000047264` | **ANDed** with Category IDs — a folder appears only if both filters allow it. Set just one or the other; setting both intersects them. |
| Include drafts | — | off | toggle | When off (default), only `status=2` (published) articles are ingested. Turn on if the POC needs draft content too. |
| Page size | — | `100` | integer 1–100 | Items fetched per Solutions API request. Freshdesk caps at 100; larger values are clamped. |

### Filter cookbook

| Goal | Category IDs | Folder IDs |
|---|---|---|
| Sync everything | *(blank)* | *(blank)* |
| Sync one category | `11000000024207` | *(blank)* |
| Sync several categories | `11000000024207, 11000000024212` | *(blank)* |
| Sync specific folders, regardless of which categories they're in | *(blank)* | `11000000047264, 11000000047278` |
| Sync only certain folders within certain categories | `11000000024207` | `11000000047264, 11000000047278` |

---

## Step 4 — Verify the first sync

After Cognigy reports the initial sync as complete:

1. **Knowledge Sources count.** Each non-empty Solutions folder becomes one Knowledge Source named `<Category> / <Folder>`. If you scoped to one category with N folders, expect roughly N sources (folders with zero published articles are skipped).
2. **Chunk counts look sane.** Open a source — chunk count should scale with article count. Empty articles, articles with body shorter than ~150 characters after HTML stripping, or articles with only embedded images will be skipped.
3. **Spot check metadata.** Open any chunk and inspect its data fields:
   ```
   source: "freshdesk"
   categoryId, categoryName
   folderId, folderName
   articleId, articleTitle, articleStatus
   articleTags
   lastModified
   chunkIndexInArticle / chunkCountInArticle
   chunkIndex / chunkCount
   ```
   These are the fields the AI Agent can cite back. If `articleStatus` is `1` and you didn't enable **Include drafts**, something's wrong.
4. **Retrieval smoke test.** Open the AI Agent that uses this Knowledge Store, ask a question whose answer is in a known article, confirm the citation includes the right `articleId` / `articleTitle`.
5. **Idempotent re-run.** Trigger **Sync now** again without changing anything in Freshdesk. The run log should show no new sources created and no chunks re-written — Cognigy compares the per-folder `contentHashOrTimestamp` (= newest `updated_at` in the folder) and skips folders that haven't moved.

---

## Limitations

Things this connector v1 deliberately does not do:

| Limitation | Workaround / impact |
|---|---|
| **No sub-folder recursion.** Folders nested inside other folders (`parent_folder_id != null`) are not visited. | If a category has nested folder structures, surface this with the customer — content in sub-folders will be missed. Listing `/folders/{id}/subfolders` in the discovery flow shows what's at risk. (A v2 update can recurse cheaply.) |
| **No attachment ingestion.** Article PDFs / images are not pulled, only the article body. | Acceptable for most KB POCs. Attachments would need a separate ingestion path. |
| **No multi-language support.** Freshdesk supports translated articles per article ID; the connector only ingests the default language returned by the list endpoint. | If the tenant has translated content, only the source-language version is indexed. |
| **No folder-visibility filter.** A folder's `visibility` field is read but not applied. Articles in `visibility=1` (agent-only) folders are still ingested if they're published. | If "agent-only" content must be excluded, scope by Category IDs / Folder IDs and explicitly omit those folder IDs. |
| **Articles must have a body.** If `description` HTML strips to empty and `description_text` is also empty, the article is skipped silently. | Catches truly empty stub articles; an unusual sign of empty content is "stub article with embedded video only" — those won't index. |

If any of these affect the POC, raise it before sync and the connector can be extended.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `status=401` on every request | Wrong, expired, or revoked API key | Re-copy from **Profile Settings → Your API Key**. |
| `status=403` | API key's agent lacks read access to Solutions | Have an admin grant a role that includes Solutions read. |
| `status=404`, body is HTML | `domain` doesn't resolve to a Freshdesk tenant — usually because the connection field has `/helpdesk`, `/support/home`, or some other path glued to the host, OR the subdomain is actually on `*.freshservice.com` | Set `domain` to either the bare subdomain (`acme`) or origin-only (`https://acme.freshdesk.com`). For Freshservice tenants enter `acme.freshservice.com` (with the dot) — the connector keeps that host verbatim. |
| Sync completes but zero sources appear | All folders had zero published articles, **or** all matching folders are sub-folders (which aren't followed) | Re-run the discovery flow and check `articles_count` per folder. If everything is in sub-folders, raise the limitation. |
| One specific folder's articles are missing | That folder was filtered out by Category IDs/Folder IDs, **or** all its articles are drafts | Verify the IDs match your filters; flip **Include drafts** if needed. |
| Sync errors with `429` repeatedly | Tenant rate limit (3,000–5,000 calls/hour depending on plan) is exhausted | Reduce sync scope, or schedule the Knowledge Store sync to run off-peak. The connector retries 429s honouring `Retry-After` automatically up to 5 attempts. |
| Slow first sync | Tenant has thousands of articles | Expected. Consider scoping to a subset of categories for the POC and expanding later. |
| Re-sync re-creates everything from scratch | The connector itself was reinstalled at a new `type` value (e.g. you renamed the project) | Don't change the connector's `type` field between builds — the `externalIdentifier` keys are scoped to it. |

---

## Quick reference — what gets created in Cognigy

For an article in folder *Benefits* (id `11000000047264`) under category *Associate Information* (id `11000000024207`):

- **Knowledge Source**
  - `name`: `Associate Information / Benefits`
  - `externalIdentifier`: `folder:11000000047264`
  - `tags`: `["freshdesk", "category:11000000024207", "folder:11000000047264"]`
  - `contentHashOrTimestamp`: newest `updated_at` across the folder's articles

- **Knowledge Chunks** (one or more per article, ~1,200 chars each, ~150 char overlap)
  - `text`: prefixed with `Article: <title>\nUpdated: <timestamp>\n\n` then the chunk body
  - `data`: full metadata bundle (see Step 4 → "Spot check metadata")

This shape stays stable across syncs, so you can reference it from agent prompts and from analytics.
