import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_RETRIES = 5;

export class GraphClient {
	private http: AxiosInstance;

	constructor(accessToken: string) {
		this.http = axios.create({
			baseURL: GRAPH_BASE,
			headers: { Authorization: `Bearer ${accessToken}` },
			timeout: 60000
		});
	}

	async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
		return this.request<T>({ ...config, method: "GET", url });
	}

	async getBuffer(url: string): Promise<Buffer> {
		const res = await this.request<ArrayBuffer>({
			method: "GET",
			url,
			responseType: "arraybuffer"
		});
		return Buffer.from(res);
	}

	async *paginate<T = any>(url: string): AsyncGenerator<T, void, unknown> {
		let next: string | undefined = url;
		while (next) {
			const page: { value: T[]; "@odata.nextLink"?: string } = await this.get(next);
			for (const item of page.value ?? []) {
				yield item;
			}
			next = page["@odata.nextLink"];
			if (next && next.startsWith(GRAPH_BASE)) {
				next = next.substring(GRAPH_BASE.length);
			}
		}
	}

	private async request<T>(config: AxiosRequestConfig, attempt = 0): Promise<T> {
		try {
			const res = await this.http.request<T>(config);
			return res.data;
		} catch (err: any) {
			const status = err?.response?.status;
			const retryable = status === 429 || status === 503 || status === 504;
			if (retryable && attempt < MAX_RETRIES) {
				const retryAfter = Number(err.response?.headers?.["retry-after"]);
				const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
					? retryAfter * 1000
					: Math.min(1000 * 2 ** attempt, 30000);
				await sleep(delayMs);
				return this.request<T>(config, attempt + 1);
			}
			throw err;
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
