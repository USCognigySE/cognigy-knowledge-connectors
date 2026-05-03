import * as crypto from "node:crypto";
import { createKnowledgeConnector } from "@cognigy/extension-tools";
import type { SharepointConnection } from "../connections/sharepointConnection";
import { getGraphToken } from "../lib/graphAuth";
import { GraphClient } from "../lib/graphClient";
import { crawlSite, resolveSite, CrawledDocument } from "../lib/sharepointCrawler";
import { chunkText } from "../lib/chunker";
import { sanitizeText } from "../lib/extractors";

export const sharepointKnowledgeConnector = createKnowledgeConnector({
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
	] as const,
	function: async ({ config, api, sources }) => {
		const {
			connection,
			siteUrl,
			includeLibraries,
			includePages,
			folderPath,
			allowedExtensions,
			maxFileSizeMb
		} = config;

		const creds = connection as SharepointConnection;
		const extensionsList = parseList(allowedExtensions as string, "docx,pdf,txt,md,html,htm,aspx");
		const maxBytes = parsePositiveInt(maxFileSizeMb as string, 25) * 1024 * 1024;

		const token = await getGraphToken({
			tenantId: creds.tenantId,
			clientId: creds.clientId,
			clientSecret: creds.clientSecret
		});
		const client = new GraphClient(token);
		const site = await resolveSite(client, siteUrl as string);

		const documents: CrawledDocument[] = [];
		for await (const doc of crawlSite(client, site, {
			includeLibraries: includeLibraries !== "no",
			includePages: includePages !== "no",
			folderPath: (folderPath as string) || undefined,
			allowedExtensions: extensionsList,
			maxFileSizeBytes: maxBytes
		})) {
			documents.push(doc);
		}

		type ChunkData = Record<string, string | number | boolean>;
		type PreparedChunk = { text: string; data: ChunkData };
		const preparedChunks: PreparedChunk[] = [];
		for (const doc of documents) {
			const chunks = chunkText(doc.text);
			for (let i = 0; i < chunks.length; i++) {
				const cleanText = sanitizeText(chunks[i]);
				if (!cleanText) continue;
				const data: ChunkData = {
					kind: sanitizeText(doc.metadata.kind),
					title: sanitizeText(doc.metadata.title),
					webUrl: sanitizeText(doc.metadata.webUrl),
					chunkIndex: i,
					chunkCount: chunks.length
				};
				if (doc.metadata.path) data.path = sanitizeText(doc.metadata.path);
				if (doc.metadata.library) data.library = sanitizeText(doc.metadata.library);
				if (doc.metadata.lastModified) data.lastModified = sanitizeText(doc.metadata.lastModified);
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

		const ingestedIdentifiers: string[] = [site.name];

		if (knowledgeSource) {
			for (let idx = 0; idx < preparedChunks.length; idx++) {
				const chunk = preparedChunks[idx];
				try {
					await api.createKnowledgeChunk({
						knowledgeSourceId: knowledgeSource.knowledgeSourceId,
						text: chunk.text,
						data: chunk.data
					});
				} catch (err: any) {
					const msg = err?.message ?? String(err);
					throw new Error(
						`createKnowledgeChunk failed ` +
						`[chunk ${idx + 1}/${preparedChunks.length}, ` +
						`doc "${chunk.data.title}", textLen ${chunk.text.length}]: ${msg}`
					);
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

function parseList(value: string | undefined, fallback: string): string[] {
	const raw = (value && value.trim()) || fallback;
	return raw
		.split(",")
		.map((s) => s.trim().toLowerCase().replace(/^\./, ""))
		.filter(Boolean);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
