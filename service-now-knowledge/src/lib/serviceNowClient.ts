import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { normaliseInstanceUrl } from "./serviceNowAuth";

const MAX_RETRIES = 5;

export class ServiceNowClient {
	private http: AxiosInstance;

	constructor(instance: string, accessToken: string) {
		const base = normaliseInstanceUrl(instance);
		this.http = axios.create({
			baseURL: base,
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json"
			},
			timeout: 60000
		});
	}

	async get<T = any>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
		const cleanedParams = params
			? Object.fromEntries(
				Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
			  )
			: undefined;
		return this.request<T>({ method: "GET", url, params: cleanedParams });
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
			const url = `${config.method ?? "GET"} ${config.url ?? ""}`;
			const body = err?.response?.data;
			const bodySnippet = body
				? ` body=${typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500)}`
				: "";
			throw new Error(
				`ServiceNow request failed [${url}] status=${status ?? "n/a"}${bodySnippet}: ${err?.message ?? err}`
			);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
