import { createKnowledgeConnector } from "@cognigy/extension-tools";
import type { ServiceNowConnection } from "../connections/serviceNowConnection";
import { getServiceNowToken } from "../lib/serviceNowAuth";
import { ServiceNowClient } from "../lib/serviceNowClient";
import { fetchKbArticles, fetchArticleBody, getKnowledgeBaseId, KbArticleRecord } from "../lib/articleFetch";
import { chunkText } from "../lib/chunker";
import { extractFromHtmlString, sanitizeText } from "../lib/extractors";

export const serviceNowKnowledgeConnector = createKnowledgeConnector({
	type: "servicenow",
	label: "ServiceNow",
	summary: "Synchronize ServiceNow Knowledge Base articles into a Cognigy Knowledge Store.",
	fields: [
		{
			key: "connection",
			label: "ServiceNow connection",
			type: "connection",
			params: {
				connectionType: "servicenow",
				required: true
			}
		},
		{
			key: "knowledgeBases",
			label: "Knowledge Bases (optional)",
			type: "text",
			description: "Comma-separated list of kb_knowledge_base sys_ids to limit ingestion. Leave blank to pull every knowledge base on the instance.",
			params: { required: false }
		},
		{
			key: "articleNumbers",
			label: "Article numbers (optional)",
			type: "text",
			description: "Comma-separated KB article numbers (e.g. KB0010001, KB0017559). ANDed with other filters. Blank = no number filter.",
			params: { required: false }
		},
		{
			key: "language",
			label: "Language filter (optional)",
			type: "text",
			description: "ServiceNow language code (e.g. en, es). Leave blank for all languages.",
			params: { required: false }
		},
		{
			key: "workflowState",
			label: "Workflow state",
			type: "text",
			description: "Workflow state to ingest. Default is 'published' so retired and draft articles are excluded.",
			defaultValue: "published",
			params: { required: false }
		},
		{
			key: "pageSize",
			label: "Page size",
			type: "text",
			description: "Number of articles fetched per Table API request.",
			defaultValue: "200",
			params: { required: false }
		}
	] as const,
	function: async ({ config, api, sources }) => {
		const { connection, knowledgeBases, articleNumbers, language, workflowState, pageSize } = config;
		const creds = connection as ServiceNowConnection;

		const token = await getServiceNowToken({
			instance: creds.instance,
			clientId: creds.clientId,
			clientSecret: creds.clientSecret,
			username: creds.username,
			password: creds.password
		});
		const client = new ServiceNowClient(creds.instance, token.accessToken);

		const kbList = parseList(knowledgeBases as string);
		const numberList = parseList(articleNumbers as string).map((n) => n.toUpperCase());
		const ingestedIdentifiers = new Set<string>();

		const trimmedState = (workflowState as string | undefined)?.trim();
		for await (const article of fetchKbArticles(client, {
			knowledgeBases: kbList,
			articleNumbers: numberList,
			language: (language as string)?.trim() || undefined,
			workflowState: trimmedState === undefined ? "published" : trimmedState,
			pageSize: parsePositiveInt(pageSize as string, 200)
		})) {
			if (!article.text) {
				try {
					const detail = await fetchArticleBody(client, article.sys_id);
					if (detail.body) {
						article.text = detail.body;
						article.text_source = `detail:${detail.debug}`;
					}
				} catch {
					// ignore — article will fall through with empty body and be skipped
				}
			}
			await ingestArticle(api, article, ingestedIdentifiers);
		}

		for (const existing of sources) {
			const id = existing.externalIdentifier;
			if (id && !ingestedIdentifiers.has(id)) {
				await api.deleteKnowledgeSource({
					knowledgeSourceId: existing.knowledgeSourceId
				});
			}
		}
	}
});

type ChunkData = Record<string, string | number | boolean>;

async function ingestArticle(
	api: Parameters<typeof serviceNowKnowledgeConnector.function>[0]["api"],
	article: KbArticleRecord,
	ingestedIdentifiers: Set<string>
): Promise<void> {
	if (!article?.sys_id) return;

	const sysId = article.sys_id;
	ingestedIdentifiers.add(sysId);

	const title = sanitizeText(article.title || article.number || sysId);
	const cleanText = extractFromHtmlString(article.text || "");
	if (!cleanText) return;

	const chunks = chunkText(cleanText);
	if (chunks.length === 0) return;

	const number = sanitizeText(article.number || "");
	const sourceName = number ? `${number} - ${title}` : title;
	const kbId = getKnowledgeBaseId(article);

	const tags: string[] = ["servicenow"];
	if (kbId) tags.push(`kb:${kbId}`);
	if (article.workflow_state) tags.push(`state:${article.workflow_state}`);

	const knowledgeSource = await api.upsertKnowledgeSource({
		name: sourceName,
		description: `ServiceNow KB ${number || sysId}`,
		tags,
		chunkCount: chunks.length,
		contentHashOrTimestamp: article.sys_updated_on || sysId,
		externalIdentifier: sysId
	});

	if (!knowledgeSource) return;

	for (let i = 0; i < chunks.length; i++) {
		const data: ChunkData = {
			source: "servicenow",
			sysId,
			number,
			title,
			chunkIndex: i,
			chunkCount: chunks.length
		};
		if (kbId) data.knowledgeBase = kbId;
		if (article.kb_knowledge_base_name) data.knowledgeBaseName = article.kb_knowledge_base_name;
		if (article.language) data.language = article.language;
		if (article.workflow_state) data.workflowState = article.workflow_state;
		if (article.sys_updated_on) data.lastModified = article.sys_updated_on;

		try {
			await api.createKnowledgeChunk({
				knowledgeSourceId: knowledgeSource.knowledgeSourceId,
				text: chunks[i],
				data
			});
		} catch (err: any) {
			const msg = err?.message ?? String(err);
			throw new Error(
				`createKnowledgeChunk failed ` +
				`[chunk ${i + 1}/${chunks.length}, article ${number || sysId}, ` +
				`textLen ${chunks[i].length}]: ${msg}`
			);
		}
	}
}

function parseList(value: string | undefined): string[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
