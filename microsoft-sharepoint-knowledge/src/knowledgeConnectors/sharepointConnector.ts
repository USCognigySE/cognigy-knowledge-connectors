import * as crypto from "node:crypto";
import { createKnowledgeConnector } from "@cognigy/extension-tools";
import type { SharepointConnection } from "../connections/sharepointConnection";
import { getGraphToken } from "../lib/graphAuth";
import { GraphClient } from "../lib/graphClient";
import {
	crawlFolderTree,
	crawlSite,
	getDefaultDrive,
	listImmediateSubfolders,
	resolveSite,
	CrawledDocument,
	FileFilterOptions
} from "../lib/sharepointCrawler";
import { chunkText } from "../lib/chunker";
import { sanitizeText } from "../lib/extractors";

type ChunkData = Record<string, string | number | boolean>;
type PreparedChunk = { text: string; data: ChunkData };

const MAX_CHUNKS_PER_SOURCE = 1000;

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
	] as const,
	function: async ({ config, api, sources }) => {
		const {
			connection,
			siteUrl,
			sourcePerSubfolder,
			includeLibraries,
			includePages,
			folderPath,
			allowedExtensions,
			maxFileSizeMb
		} = config;

		const creds = connection as SharepointConnection;
		const extensionsList = parseList(allowedExtensions as string, "docx,pdf,txt,md,html,htm,aspx");
		const maxBytes = parsePositiveInt(maxFileSizeMb as string, 25) * 1024 * 1024;
		const filter: FileFilterOptions = {
			allowedExtensions: extensionsList,
			maxFileSizeBytes: maxBytes
		};

		const token = await getGraphToken({
			tenantId: creds.tenantId,
			clientId: creds.clientId,
			clientSecret: creds.clientSecret
		});
		const client = new GraphClient(token);
		const site = await resolveSite(client, siteUrl as string);

		const ingestedIdentifiers: string[] = [];

		if (sourcePerSubfolder === "yes") {
			const parentPath = (folderPath as string || "").trim();
			if (!parentPath) {
				throw new Error(
					"Source per subfolder is enabled but Folder path is empty. " +
					"Set Folder path to the parent folder whose subfolders you want to become individual Knowledge Sources."
				);
			}
			const drive = await getDefaultDrive(client, site.id);
			const subfolders = await listImmediateSubfolders(client, drive.id, drive.name, parentPath);
			if (subfolders.length === 0) {
				throw new Error(
					`No subfolders found under "${parentPath}" in the default document library of ${site.webUrl}.`
				);
			}
			for (const sf of subfolders) {
				const externalId = `${site.name}::${parentPath}/${sf.name}`;
				const description = `SharePoint: ${sf.webUrl}`;
				const tags = ["sharepoint", "subfolder", sf.name];
				const docs = crawlFolderTree(client, sf, filter);
				const created = await ingestSource(
					api,
					sf.name,
					externalId,
					description,
					tags,
					docs
				);
				if (created) ingestedIdentifiers.push(externalId);
			}
		} else {
			const externalId = site.name;
			const description = `SharePoint site: ${site.webUrl}`;
			const tags = ["sharepoint"];
			const docs = crawlSite(client, site, {
				includeLibraries: includeLibraries !== "no",
				includePages: includePages !== "no",
				folderPath: (folderPath as string) || undefined,
				allowedExtensions: extensionsList,
				maxFileSizeBytes: maxBytes
			});
			const created = await ingestSource(
				api,
				site.name,
				externalId,
				description,
				tags,
				docs
			);
			if (created) ingestedIdentifiers.push(externalId);
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

async function ingestSource(
	api: any,
	name: string,
	externalIdentifier: string,
	description: string,
	tags: string[],
	docs: AsyncIterable<CrawledDocument>
): Promise<boolean> {
	const preparedChunks: PreparedChunk[] = [];
	for await (const doc of docs) {
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

	if (preparedChunks.length === 0) {
		return false;
	}

	if (preparedChunks.length > MAX_CHUNKS_PER_SOURCE) {
		throw new Error(
			`Knowledge Source "${name}" would contain ${preparedChunks.length} chunks, ` +
			`exceeding Cognigy's cap of ${MAX_CHUNKS_PER_SOURCE} chunks per Source. ` +
			`Reduce content in this Source: split the content across multiple SharePoint ` +
			`subfolders and enable "Create one Knowledge Source per subfolder", ` +
			`use a Folder path filter to scope the crawl, or narrow the File type allowlist.`
		);
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
			} catch (err: any) {
				const msg = err?.message ?? String(err);
				throw new Error(
					`createKnowledgeChunk failed ` +
					`[source "${name}", chunk ${idx + 1}/${preparedChunks.length}, ` +
					`doc "${chunk.data.title}", textLen ${chunk.text.length}]: ${msg}`
				);
			}
		}
	}

	return true;
}

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
