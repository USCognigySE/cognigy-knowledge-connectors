"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.iterateFolders = iterateFolders;
exports.iterateArticlesInFolder = iterateArticlesInFolder;
async function* paginate(client, path, pageSize) {
    let page = 1;
    while (true) {
        const batch = await client.get(path, { page, per_page: pageSize });
        if (!Array.isArray(batch) || batch.length === 0)
            return;
        for (const item of batch)
            yield item;
        if (batch.length < pageSize)
            return;
        page += 1;
    }
}
async function* iterateFolders(client, options) {
    const categoryFilter = options.categoryIds.length > 0 ? new Set(options.categoryIds) : null;
    const folderFilter = options.folderIds.length > 0 ? new Set(options.folderIds) : null;
    for await (const category of paginate(client, "/api/v2/solutions/categories", options.pageSize)) {
        if (categoryFilter && !categoryFilter.has(category.id))
            continue;
        for await (const folder of paginate(client, `/api/v2/solutions/categories/${category.id}/folders`, options.pageSize)) {
            if (folderFilter && !folderFilter.has(folder.id))
                continue;
            yield { category, folder };
        }
    }
}
async function* iterateArticlesInFolder(client, category, folder, options) {
    for await (const raw of paginate(client, `/api/v2/solutions/folders/${folder.id}/articles`, options.pageSize)) {
        const status = Number(raw?.status);
        if (!options.includeDrafts && status !== 2)
            continue;
        if (!raw?.id)
            continue;
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
            tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [],
            updated_at: typeof raw.updated_at === "string" ? raw.updated_at : "",
            agent_id: typeof raw.agent_id === "number" ? raw.agent_id : undefined
        };
    }
}
