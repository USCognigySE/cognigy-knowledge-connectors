"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharepointKnowledgeConnector = void 0;
const crypto = __importStar(require("node:crypto"));
const extension_tools_1 = require("@cognigy/extension-tools");
const graphAuth_1 = require("../lib/graphAuth");
const graphClient_1 = require("../lib/graphClient");
const sharepointCrawler_1 = require("../lib/sharepointCrawler");
const chunker_1 = require("../lib/chunker");
const extractors_1 = require("../lib/extractors");
exports.sharepointKnowledgeConnector = (0, extension_tools_1.createKnowledgeConnector)({
    type: "sharepoint",
    label: "Microsoft SharePoint",
    summary: "Synchronize documents and site pages from a SharePoint site into a Cognigy Knowledge Store.",
    fields: [
        {
            key: "connection",
            label: "SharePoint connection",
            type: "connection",
            params: {
                connectionType: "sharepoint",
                required: true
            }
        },
        {
            key: "siteUrl",
            label: "SharePoint Site URL",
            type: "text",
            description: "e.g. https://contoso.sharepoint.com/sites/HR",
            params: { required: true }
        },
        {
            key: "includeLibraries",
            label: "Include document libraries",
            type: "select",
            defaultValue: "yes",
            params: {
                options: [
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" }
                ]
            }
        },
        {
            key: "includePages",
            label: "Include site pages",
            type: "select",
            defaultValue: "yes",
            params: {
                options: [
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" }
                ]
            }
        },
        {
            key: "folderPath",
            label: "Folder path filter (optional)",
            type: "text",
            description: "Restrict the crawl to this subfolder of the default document library. Leave blank for the whole site.",
            params: { required: false }
        },
        {
            key: "allowedExtensions",
            label: "File type allowlist (comma-separated)",
            type: "text",
            defaultValue: "docx,pdf,txt,md,html,htm,aspx",
            params: { required: false }
        },
        {
            key: "maxFileSizeMb",
            label: "Max file size (MB)",
            type: "text",
            defaultValue: "25",
            params: { required: false }
        }
    ],
    function: async ({ config, api, sources }) => {
        const { connection, siteUrl, includeLibraries, includePages, folderPath, allowedExtensions, maxFileSizeMb } = config;
        const creds = connection;
        const extensionsList = parseList(allowedExtensions, "docx,pdf,txt,md,html,htm,aspx");
        const maxBytes = parsePositiveInt(maxFileSizeMb, 25) * 1024 * 1024;
        const token = await (0, graphAuth_1.getGraphToken)({
            tenantId: creds.tenantId,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret
        });
        const client = new graphClient_1.GraphClient(token);
        const site = await (0, sharepointCrawler_1.resolveSite)(client, siteUrl);
        const documents = [];
        for await (const doc of (0, sharepointCrawler_1.crawlSite)(client, site, {
            includeLibraries: includeLibraries !== "no",
            includePages: includePages !== "no",
            folderPath: folderPath || undefined,
            allowedExtensions: extensionsList,
            maxFileSizeBytes: maxBytes
        })) {
            documents.push(doc);
        }
        const preparedChunks = [];
        for (const doc of documents) {
            const chunks = (0, chunker_1.chunkText)(doc.text);
            for (let i = 0; i < chunks.length; i++) {
                const cleanText = (0, extractors_1.sanitizeText)(chunks[i]);
                if (!cleanText)
                    continue;
                const data = {
                    kind: (0, extractors_1.sanitizeText)(doc.metadata.kind),
                    title: (0, extractors_1.sanitizeText)(doc.metadata.title),
                    webUrl: (0, extractors_1.sanitizeText)(doc.metadata.webUrl),
                    chunkIndex: i,
                    chunkCount: chunks.length
                };
                if (doc.metadata.path)
                    data.path = (0, extractors_1.sanitizeText)(doc.metadata.path);
                if (doc.metadata.library)
                    data.library = (0, extractors_1.sanitizeText)(doc.metadata.library);
                if (doc.metadata.lastModified)
                    data.lastModified = (0, extractors_1.sanitizeText)(doc.metadata.lastModified);
                preparedChunks.push({ text: cleanText, data });
            }
        }
        const contentHash = crypto
            .createHash("sha256")
            .update(preparedChunks.map((c) => c.text).join("\n"))
            .digest("hex");
        const knowledgeSource = await api.upsertKnowledgeSource({
            name: site.name,
            description: `SharePoint site: ${site.webUrl}`,
            tags: ["sharepoint"],
            chunkCount: preparedChunks.length,
            contentHashOrTimestamp: contentHash
        });
        const ingestedIdentifiers = [site.name];
        if (knowledgeSource) {
            for (let idx = 0; idx < preparedChunks.length; idx++) {
                const chunk = preparedChunks[idx];
                try {
                    await api.createKnowledgeChunk({
                        knowledgeSourceId: knowledgeSource.knowledgeSourceId,
                        text: chunk.text,
                        data: chunk.data
                    });
                }
                catch (err) {
                    const msg = err?.message ?? String(err);
                    throw new Error(`createKnowledgeChunk failed ` +
                        `[chunk ${idx + 1}/${preparedChunks.length}, ` +
                        `doc "${chunk.data.title}", textLen ${chunk.text.length}]: ${msg}`);
                }
            }
        }
        for (const existing of sources) {
            const id = existing.externalIdentifier;
            if (id && !ingestedIdentifiers.includes(id)) {
                await api.deleteKnowledgeSource({
                    knowledgeSourceId: existing.knowledgeSourceId
                });
            }
        }
    }
});
function parseList(value, fallback) {
    const raw = (value && value.trim()) || fallback;
    return raw
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean);
}
function parsePositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
