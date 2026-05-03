import * as crypto from "node:crypto";
import { createKnowledgeConnector } from "@cognigy/extension-tools";

export const minimalConnector = createKnowledgeConnector({
	type: "minimalTestConnector",
	label: "Minimal Test Connector",
	summary: "Creates one hello-world chunk. For diagnosing Knowledge Store issues.",
	fields: [
		{
			key: "sourceName",
			label: "Source name",
			type: "text",
			defaultValue: "Minimal Test",
			params: { required: true }
		}
	] as const,
	function: async ({ config, api, sources }) => {
		const text = "Hello world from the minimal test connector. This is a single chunk.";
		const contentHash = crypto.createHash("sha256").update(text).digest("hex");

		const source = await api.upsertKnowledgeSource({
			name: config.sourceName,
			description: "Minimal test source",
			tags: ["test"],
			chunkCount: 1,
			contentHashOrTimestamp: contentHash
		});

		if (source) {
			await api.createKnowledgeChunk({
				knowledgeSourceId: source.knowledgeSourceId,
				text,
				data: {}
			});
		}

		for (const existing of sources) {
			if (existing.externalIdentifier && existing.externalIdentifier !== config.sourceName) {
				await api.deleteKnowledgeSource({
					knowledgeSourceId: existing.knowledgeSourceId
				});
			}
		}
	}
});
