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
const MAX_CHUNKS_PER_SOURCE = 1000;
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
            key: "sourcePerSubfolder",
            label: "Create one Knowledge Source per subfolder",
            type: "select",
            defaultValue: "no",
            description: "When Yes, each immediate subfolder under Folder path becomes its own Knowledge Source (named after the subfolder). Folder path is required. Include site pages is ignored in this mode.",
            params: {
                options: [
                    { label: "No — one Source for the whole site", value: "no" },
                    { label: "Yes — one Source per subfolder", value: "yes" }
                ]
            }
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
            description: "Ignored when Source per subfolder is Yes.",
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
            description: "Restrict the crawl to this subfolder of the default document library. Required when Source per subfolder is Yes (this is then the parent folder whose immediate subfolders become Sources).",
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
        const { connection, siteUrl, sourcePerSubfolder, includeLibraries, includePages, folderPath, allowedExtensions, maxFileSizeMb } = config;
        const creds = connection;
        const extensionsList = parseList(allowedExtensions, "docx,pdf,txt,md,html,htm,aspx");
        const maxBytes = parsePositiveInt(maxFileSizeMb, 25) * 1024 * 1024;
        const filter = {
            allowedExtensions: extensionsList,
            maxFileSizeBytes: maxBytes
        };
        const token = await (0, graphAuth_1.getGraphToken)({
            tenantId: creds.tenantId,
            clientId: creds.clientId,
            clientSecret: creds.clientSecret
        });
        const client = new graphClient_1.GraphClient(token);
        const site = await (0, sharepointCrawler_1.resolveSite)(client, siteUrl);
        const ingestedIdentifiers = [];
        if (sourcePerSubfolder === "yes") {
            const parentPath = (folderPath || "").trim();
            if (!parentPath) {
                throw new Error("Source per subfolder is enabled but Folder path is empty. " +
                    "Set Folder path to the parent folder whose subfolders you want to become individual Knowledge Sources.");
            }
            const drive = await (0, sharepointCrawler_1.getDefaultDrive)(client, site.id);
            const subfolders = await (0, sharepointCrawler_1.listImmediateSubfolders)(client, drive.id, drive.name, parentPath);
            if (subfolders.length === 0) {
                throw new Error(`No subfolders found under "${parentPath}" in the default document library of ${site.webUrl}.`);
            }
            for (const sf of subfolders) {
                const externalId = `${site.name}::${parentPath}/${sf.name}`;
                const description = `SharePoint: ${sf.webUrl}`;
                const tags = ["sharepoint", "subfolder", sf.name];
                const docs = (0, sharepointCrawler_1.crawlFolderTree)(client, sf, filter);
                const created = await ingestSource(api, sf.name, externalId, description, tags, docs);
                if (created)
                    ingestedIdentifiers.push(externalId);
            }
        }
        else {
            const externalId = site.name;
            const description = `SharePoint site: ${site.webUrl}`;
            const tags = ["sharepoint"];
            const docs = (0, sharepointCrawler_1.crawlSite)(client, site, {
                includeLibraries: includeLibraries !== "no",
                includePages: includePages !== "no",
                folderPath: folderPath || undefined,
                allowedExtensions: extensionsList,
                maxFileSizeBytes: maxBytes
            });
            const created = await ingestSource(api, site.name, externalId, description, tags, docs);
            if (created)
                ingestedIdentifiers.push(externalId);
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
async function ingestSource(api, name, externalIdentifier, description, tags, docs) {
    const preparedChunks = [];
    for await (const doc of docs) {
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
    if (preparedChunks.length === 0) {
        return false;
    }
    if (preparedChunks.length > MAX_CHUNKS_PER_SOURCE) {
        throw new Error(`Knowledge Source "${name}" would contain ${preparedChunks.length} chunks, ` +
            `exceeding Cognigy's cap of ${MAX_CHUNKS_PER_SOURCE} chunks per Source. ` +
            `Reduce content in this Source: split the content across multiple SharePoint ` +
            `subfolders and enable "Create one Knowledge Source per subfolder", ` +
            `use a Folder path filter to scope the crawl, or narrow the File type allowlist.`);
    }
    const contentHash = crypto
        .createHash("sha256")
        .update(preparedChunks.map((c) => c.text).join("\n"))
        .digest("hex");
    const source = await api.upsertKnowledgeSource({
        name,
        description,
        tags,
        chunkCount: preparedChunks.length,
        contentHashOrTimestamp: contentHash,
        externalIdentifier
    });
    if (source) {
        for (let idx = 0; idx < preparedChunks.length; idx++) {
            const chunk = preparedChunks[idx];
            try {
                await api.createKnowledgeChunk({
                    knowledgeSourceId: source.knowledgeSourceId,
                    text: chunk.text,
                    data: chunk.data
                });
            }
            catch (err) {
                const msg = err?.message ?? String(err);
                throw new Error(`createKnowledgeChunk failed ` +
                    `[source "${name}", chunk ${idx + 1}/${preparedChunks.length}, ` +
                    `doc "${chunk.data.title}", textLen ${chunk.text.length}]: ${msg}`);
            }
        }
    }
    return true;
}
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
