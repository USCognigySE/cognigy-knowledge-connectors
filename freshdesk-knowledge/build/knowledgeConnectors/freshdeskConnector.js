"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freshdeskKnowledgeConnector = void 0;
const extension_tools_1 = require("@cognigy/extension-tools");
const freshdeskClient_1 = require("../lib/freshdeskClient");
const articleFetch_1 = require("../lib/articleFetch");
const chunker_1 = require("../lib/chunker");
const extractors_1 = require("../lib/extractors");
const FOLDER_ID_PREFIX = "folder:";
exports.freshdeskKnowledgeConnector = (0, extension_tools_1.createKnowledgeConnector)({
    type: "freshdesk",
    label: "Freshdesk",
    summary: "Synchronize Freshdesk Solutions articles into a Cognigy Knowledge Store.",
    fields: [
        {
            key: "connection",
            label: "Freshdesk connection",
            type: "connection",
            params: {
                connectionType: "freshdesk",
                required: true
            }
        },
        {
            key: "categoryIds",
            label: "Category IDs (optional)",
            type: "text",
            description: "Comma-separated Solutions category IDs. Blank = all categories.",
            params: { required: false }
        },
        {
            key: "folderIds",
            label: "Folder IDs (optional)",
            type: "text",
            description: "Comma-separated folder IDs. ANDed with category filter. Blank = all folders.",
            params: { required: false }
        },
        {
            key: "includeDrafts",
            label: "Include drafts",
            type: "toggle",
            description: "When off, only published articles (status=2) are ingested.",
            defaultValue: false,
            params: { required: false }
        },
        {
            key: "pageSize",
            label: "Page size",
            type: "text",
            description: "Articles fetched per request (max 100).",
            defaultValue: "100",
            params: { required: false }
        }
    ],
    function: async ({ config, api, sources }) => {
        const { connection, categoryIds, folderIds, includeDrafts, pageSize } = config;
        const creds = connection;
        const client = new freshdeskClient_1.FreshdeskClient(creds.domain, creds.apiKey);
        const fetchOptions = {
            categoryIds: parseIdList(categoryIds),
            folderIds: parseIdList(folderIds),
            includeDrafts: Boolean(includeDrafts),
            pageSize: clampPageSize(pageSize)
        };
        const ingestedIdentifiers = new Set();
        for await (const { category, folder } of (0, articleFetch_1.iterateFolders)(client, fetchOptions)) {
            await ingestFolder(api, client, category, folder, fetchOptions, ingestedIdentifiers);
        }
        for (const existing of sources) {
            const id = existing.externalIdentifier;
            if (id && id.startsWith(FOLDER_ID_PREFIX) && !ingestedIdentifiers.has(id)) {
                await api.deleteKnowledgeSource({ knowledgeSourceId: existing.knowledgeSourceId });
            }
        }
    }
});
async function ingestFolder(api, client, category, folder, fetchOptions, ingestedIdentifiers) {
    const folderChunks = [];
    let mostRecentUpdatedAt = "";
    for await (const article of (0, articleFetch_1.iterateArticlesInFolder)(client, category, folder, fetchOptions)) {
        if (!article.id)
            continue;
        let body = (0, extractors_1.extractFromHtmlString)(article.description);
        if (!body && article.description_text)
            body = (0, extractors_1.sanitizeText)(article.description_text);
        if (!body)
            continue;
        const articleChunks = (0, chunker_1.chunkText)(body);
        if (articleChunks.length === 0)
            continue;
        if (article.updated_at && article.updated_at > mostRecentUpdatedAt) {
            mostRecentUpdatedAt = article.updated_at;
        }
        const headerLines = [`Article: ${(0, extractors_1.sanitizeText)(article.title || String(article.id))}`];
        if (article.updated_at)
            headerLines.push(`Updated: ${article.updated_at}`);
        const header = headerLines.join("\n");
        for (let i = 0; i < articleChunks.length; i++) {
            folderChunks.push({
                text: `${header}\n\n${articleChunks[i]}`,
                article,
                indexInArticle: i,
                totalInArticle: articleChunks.length
            });
        }
    }
    if (folderChunks.length === 0)
        return;
    const externalIdentifier = `${FOLDER_ID_PREFIX}${folder.id}`;
    const sourceName = (0, extractors_1.sanitizeText)(`${category.name} / ${folder.name}`);
    const description = `Freshdesk solutions folder ${folder.id} (category ${category.id})`;
    const tags = ["freshdesk", `category:${category.id}`, `folder:${folder.id}`];
    const knowledgeSource = await api.upsertKnowledgeSource({
        name: sourceName,
        description,
        tags,
        chunkCount: folderChunks.length,
        contentHashOrTimestamp: mostRecentUpdatedAt || externalIdentifier,
        externalIdentifier
    });
    ingestedIdentifiers.add(externalIdentifier);
    if (!knowledgeSource)
        return;
    for (let i = 0; i < folderChunks.length; i++) {
        const c = folderChunks[i];
        const data = {
            source: "freshdesk",
            categoryId: category.id,
            categoryName: category.name,
            folderId: folder.id,
            folderName: folder.name,
            articleId: c.article.id,
            articleTitle: (0, extractors_1.sanitizeText)(c.article.title),
            articleStatus: c.article.status,
            chunkIndexInArticle: c.indexInArticle,
            chunkCountInArticle: c.totalInArticle,
            chunkIndex: i,
            chunkCount: folderChunks.length
        };
        if (c.article.updated_at)
            data.lastModified = c.article.updated_at;
        if (c.article.tags && c.article.tags.length > 0)
            data.articleTags = c.article.tags.join(",");
        try {
            await api.createKnowledgeChunk({
                knowledgeSourceId: knowledgeSource.knowledgeSourceId,
                text: c.text,
                data
            });
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            throw new Error(`createKnowledgeChunk failed ` +
                `[chunk ${i + 1}/${folderChunks.length}, folder ${folder.id}, article ${c.article.id}, ` +
                `textLen ${c.text.length}]: ${msg}`);
        }
    }
}
function parseIdList(value) {
    if (!value)
        return [];
    return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n));
}
function clampPageSize(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
        return 100;
    return Math.min(100, Math.max(1, Math.floor(n)));
}
