import { FreshdeskClient } from "./freshdeskClient";

export interface FreshdeskCategory {
	id: number;
	name: string;
	description?: string;
}

export interface FreshdeskFolder {
	id: number;
	name: string;
	description?: string;
	category_id: number;
}

export interface FreshdeskArticleRecord {
	id: number;
	title: string;
	description: string;
	description_text?: string;
	status: number;
	category_id: number;
	category_name: string;
	folder_id: number;
	folder_name: string;
	tags: string[];
	updated_at: string;
	agent_id?: number;
}

export interface FreshdeskFetchOptions {
	categoryIds: number[];
	folderIds: number[];
	includeDrafts: boolean;
	pageSize: number;
}

async function* paginate<T>(
	client: FreshdeskClient,
	path: string,
	pageSize: number
): AsyncGenerator<T, void, unknown> {
	let page = 1;
	while (true) {
		const batch = await client.get<T[]>(path, { page, per_page: pageSize });
		if (!Array.isArray(batch) || batch.length === 0) return;
		for (const item of batch) yield item;
		if (batch.length < pageSize) return;
		page += 1;
	}
}

export async function* iterateFolders(
	client: FreshdeskClient,
	options: FreshdeskFetchOptions
): AsyncGenerator<{ category: FreshdeskCategory; folder: FreshdeskFolder }, void, unknown> {
	const categoryFilter = options.categoryIds.length > 0 ? new Set(options.categoryIds) : null;
	const folderFilter = options.folderIds.length > 0 ? new Set(options.folderIds) : null;

	for await (const category of paginate<FreshdeskCategory>(
		client,
		"/api/v2/solutions/categories",
		options.pageSize
	)) {
		if (categoryFilter && !categoryFilter.has(category.id)) continue;
		for await (const folder of paginate<FreshdeskFolder>(
			client,
			`/api/v2/solutions/categories/${category.id}/folders`,
			options.pageSize
		)) {
			if (folderFilter && !folderFilter.has(folder.id)) continue;
			yield { category, folder };
		}
	}
}

export async function* iterateArticlesInFolder(
	client: FreshdeskClient,
	category: FreshdeskCategory,
	folder: FreshdeskFolder,
	options: FreshdeskFetchOptions
): AsyncGenerator<FreshdeskArticleRecord, void, unknown> {
	for await (const raw of paginate<any>(
		client,
		`/api/v2/solutions/folders/${folder.id}/articles`,
		options.pageSize
	)) {
		const status = Number(raw?.status);
		if (!options.includeDrafts && status !== 2) continue;
		if (!raw?.id) continue;
		yield {
			id: Number(raw.id),
			title: String(raw.title ?? ""),
			description: typeof raw.description === "string" ? raw.description : "",
			description_text: typeof raw.description_text === "string" ? raw.description_text : undefined,
			status,
			category_id: category.id,
			category_name: category.name,
			folder_id: folder.id,
			folder_name: folder.name,
			tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t)) : [],
			updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
			agent_id: typeof raw.agent_id === "number" ? raw.agent_id : undefined
		};
	}
}
