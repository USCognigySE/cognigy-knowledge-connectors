import { createKnowledgeConnector } from "@cognigy/extension-tools";
import type { FreshdeskConnection } from "../connections/freshdeskConnection";
import { FreshdeskClient } from "../lib/freshdeskClient";
import {
	iterateFolders,
	iterateArticlesInFolder,
	FreshdeskArticleRecord,
	FreshdeskCategory,
	FreshdeskFolder,
	FreshdeskFetchOptions
} from "../lib/articleFetch";
import { chunkText } from "../lib/chunker";
import { extractFromHtmlString, sanitizeText } from "../lib/extractors";

const FOLDER_ID_PREFIX = "folder:";

export const freshdeskKnowledgeConnector = createKnowledgeConnector({
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
	] as const,
	function: async ({ config, api, sources }) => {
		const { connection, categoryIds, folderIds, includeDrafts, pageSize } = config;
		const creds = connection as FreshdeskConnection;

		const client = new FreshdeskClient(creds.domain, creds.apiKey);

		const fetchOptions: FreshdeskFetchOptions = {
			categoryIds: parseIdList(categoryIds as string),
			folderIds: parseIdList(folderIds as string),
			includeDrafts: Boolean(includeDrafts),
			pageSize: clampPageSize(pageSize as string)
		};

		const ingestedIdentifiers = new Set<string>();

		for await (const { category, folder } of iterateFolders(client, fetchOptions)) {
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

type ChunkData = Record<string, string | number | boolean>;

interface PreparedArticleChunk {
	text: string;
	article: FreshdeskArticleRecord;
	indexInArticle: number;
	totalInArticle: number;
}

async function ingestFolder(
	api: Parameters<typeof freshdeskKnowledgeConnector.function>[0]["api"],
	client: FreshdeskClient,
	category: FreshdeskCategory,
	folder: FreshdeskFolder,
	fetchOptions: FreshdeskFetchOptions,
	ingestedIdentifiers: Set<string>
): Promise<void> {
	const folderChunks: PreparedArticleChunk[] = [];
	let mostRecentUpdatedAt = "";

	for await (const article of iterateArticlesInFolder(client, category, folder, fetchOptions)) {
		if (!article.id) continue;
		let body = extractFromHtmlString(article.description);
		if (!body && article.description_text) body = sanitizeText(article.description_text);
		if (!body) continue;

		const articleChunks = chunkText(body);
		if (articleChunks.length === 0) continue;

		if (article.updated_at && article.updated_at > mostRecentUpdatedAt) {
			mostRecentUpdatedAt = article.updated_at;
		}

		const headerLines: string[] = [`Article: ${sanitizeText(article.title || String(article.id))}`];
		if (article.updated_at) headerLines.push(`Updated: ${article.updated_at}`);
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

	if (folderChunks.length === 0) return;

	const externalIdentifier = `${FOLDER_ID_PREFIX}${folder.id}`;
	const sourceName = sanitizeText(`${category.name} / ${folder.name}`);
	const description = `Freshdesk solutions folder ${folder.id} (category ${category.id})`;

	const tags: string[] = ["freshdesk", `category:${category.id}`, `folder:${folder.id}`];

	const knowledgeSource = await api.upsertKnowledgeSource({
		name: sourceName,
		description,
		tags,
		chunkCount: folderChunks.length,
		contentHashOrTimestamp: mostRecentUpdatedAt || externalIdentifier,
		externalIdentifier
	});

	ingestedIdentifiers.add(externalIdentifier);

	if (!knowledgeSource) return;

	for (let i = 0; i < folderChunks.length; i++) {
		const c = folderChunks[i];
		const data: ChunkData = {
			source: "freshdesk",
			categoryId: category.id,
			categoryName: category.name,
			folderId: folder.id,
			folderName: folder.name,
			articleId: c.article.id,
			articleTitle: sanitizeText(c.article.title),
			articleStatus: c.article.status,
			chunkIndexInArticle: c.indexInArticle,
			chunkCountInArticle: c.totalInArticle,
			chunkIndex: i,
			chunkCount: folderChunks.length
		};
		if (c.article.updated_at) data.lastModified = c.article.updated_at;
		if (c.article.tags && c.article.tags.length > 0) data.articleTags = c.article.tags.join(",");

		try {
			await api.createKnowledgeChunk({
				knowledgeSourceId: knowledgeSource.knowledgeSourceId,
				text: c.text,
				data
			});
		} catch (err: any) {
			const msg = err?.message ?? String(err);
			throw new Error(
				`createKnowledgeChunk failed ` +
				`[chunk ${i + 1}/${folderChunks.length}, folder ${folder.id}, article ${c.article.id}, ` +
				`textLen ${c.text.length}]: ${msg}`
			);
		}
	}
}

function parseIdList(value: string | undefined): number[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => Number(s))
		.filter((n) => Number.isFinite(n) && n > 0)
		.map((n) => Math.floor(n));
}

function clampPageSize(value: string | undefined): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return 100;
	return Math.min(100, Math.max(1, Math.floor(n)));
}
