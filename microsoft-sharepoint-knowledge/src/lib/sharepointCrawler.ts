import { GraphClient } from "./graphClient";
import { extractFromHtmlString, extractText, getExtension, isSupported } from "./extractors";

export interface SiteRef {
	id: string;
	name: string;
	webUrl: string;
}

export interface CrawledDocument {
	text: string;
	metadata: {
		kind: "file" | "page";
		title: string;
		webUrl: string;
		path?: string;
		library?: string;
		lastModified?: string;
	};
}

export interface CrawlOptions {
	includeLibraries: boolean;
	includePages: boolean;
	folderPath?: string;
	allowedExtensions: string[];
	maxFileSizeBytes: number;
}

export async function resolveSite(client: GraphClient, siteUrl: string): Promise<SiteRef> {
	const parsed = new URL(siteUrl);
	const hostname = parsed.hostname;
	const relativePath = parsed.pathname.replace(/\/+$/, "");
	const endpoint = relativePath
		? `/sites/${hostname}:${relativePath}:`
		: `/sites/${hostname}`;
	try {
		const site: any = await client.get(endpoint);
		return { id: site.id, name: site.displayName || site.name, webUrl: site.webUrl };
	} catch (err: any) {
		const status = err?.response?.status;
		throw new Error(
			`Failed to resolve SharePoint site (${status ?? "?"}) at GET ${endpoint}. ` +
			`Verify the Site URL is correct and the app registration has Sites.Read.All application permission with admin consent.`
		);
	}
}

export async function* crawlSite(
	client: GraphClient,
	site: SiteRef,
	options: CrawlOptions
): AsyncGenerator<CrawledDocument, void, unknown> {
	if (options.includeLibraries) {
		yield* crawlDrives(client, site, options);
	}
	if (options.includePages) {
		yield* crawlPages(client, site);
	}
}

async function* crawlDrives(
	client: GraphClient,
	site: SiteRef,
	options: CrawlOptions
): AsyncGenerator<CrawledDocument, void, unknown> {
	const drives = client.paginate<any>(`/sites/${site.id}/drives`);
	for await (const drive of drives) {
		const rootPath = options.folderPath
			? `/drives/${drive.id}/root:/${encodePath(options.folderPath)}:/children`
			: `/drives/${drive.id}/root/children`;
		yield* walkFolder(client, rootPath, drive.name, options);
	}
}

async function* walkFolder(
	client: GraphClient,
	listUrl: string,
	libraryName: string,
	options: CrawlOptions
): AsyncGenerator<CrawledDocument, void, unknown> {
	for await (const item of client.paginate<any>(listUrl)) {
		if (item.folder) {
			const childUrl = `/drives/${item.parentReference.driveId}/items/${item.id}/children`;
			yield* walkFolder(client, childUrl, libraryName, options);
			continue;
		}
		if (!item.file) continue;
		const ext = getExtension(item.name);
		if (!isSupported(ext, options.allowedExtensions)) continue;
		if (typeof item.size === "number" && item.size > options.maxFileSizeBytes) continue;

		try {
			const buffer = await client.getBuffer(
				`/drives/${item.parentReference.driveId}/items/${item.id}/content`
			);
			const text = await extractText(buffer, ext);
			if (!text.trim()) continue;
			yield {
				text,
				metadata: {
					kind: "file",
					title: item.name,
					webUrl: item.webUrl,
					path: item.parentReference?.path,
					library: libraryName,
					lastModified: item.lastModifiedDateTime
				}
			};
		} catch (err: any) {
			console.error(`[sharepoint] failed to ingest ${item.webUrl}: ${err?.message || err}`);
		}
	}
}

async function* crawlPages(
	client: GraphClient,
	site: SiteRef
): AsyncGenerator<CrawledDocument, void, unknown> {
	const pages = client.paginate<any>(
		`/sites/${site.id}/pages/microsoft.graph.sitePage?$expand=canvasLayout`
	);
	for await (const page of pages) {
		try {
			const text = extractPageText(page);
			if (!text.trim()) continue;
			yield {
				text,
				metadata: {
					kind: "page",
					title: page.title || page.name,
					webUrl: page.webUrl,
					lastModified: page.lastModifiedDateTime
				}
			};
		} catch (err: any) {
			console.error(`[sharepoint] failed to ingest page ${page.webUrl}: ${err?.message || err}`);
		}
	}
}

function extractPageText(page: any): string {
	const parts: string[] = [];
	if (page.title) parts.push(page.title);
	if (page.description) parts.push(page.description);

	const sections = page.canvasLayout?.horizontalSections ?? [];
	for (const section of sections) {
		for (const column of section.columns ?? []) {
			for (const webpart of column.webparts ?? []) {
				const html = webpart?.innerHtml || webpart?.data?.innerHTML;
				if (html) parts.push(extractFromHtmlString(html));
				else if (webpart?.data?.title) parts.push(webpart.data.title);
			}
		}
	}
	const vertical = page.canvasLayout?.verticalSection;
	if (vertical?.webparts) {
		for (const webpart of vertical.webparts) {
			const html = webpart?.innerHtml || webpart?.data?.innerHTML;
			if (html) parts.push(extractFromHtmlString(html));
		}
	}
	return parts.filter(Boolean).join("\n\n");
}

function encodePath(path: string): string {
	return path
		.split("/")
		.filter(Boolean)
		.map(encodeURIComponent)
		.join("/");
}
