import axios from "axios";

export interface ServiceNowAuthConfig {
	instance: string;
	clientId: string;
	clientSecret: string;
	username: string;
	password: string;
}

export interface ServiceNowToken {
	accessToken: string;
	tokenType: string;
	expiresAt: number;
}

export function normaliseInstanceUrl(instance: string): string {
	const trimmed = instance.trim().replace(/\/+$/, "");
	if (!trimmed) {
		throw new Error("ServiceNow instance URL is required");
	}
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

export async function getServiceNowToken(config: ServiceNowAuthConfig): Promise<ServiceNowToken> {
	const base = normaliseInstanceUrl(config.instance);
	const url = `${base}/oauth_token.do`;

	const body = new URLSearchParams({
		grant_type: "password",
		client_id: config.clientId,
		client_secret: config.clientSecret,
		username: config.username,
		password: config.password
	}).toString();

	try {
		const res = await axios.post(url, body, {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				"Accept": "*/*",
				"User-Agent": "Cognigy.AI"
			},
			timeout: 30000
		});
		const data = res.data ?? {};
		if (!data.access_token) {
			throw new Error(`OAuth response missing access_token: ${JSON.stringify(data)}`);
		}
		const expiresInSec = Number(data.expires_in) || 1800;
		return {
			accessToken: data.access_token,
			tokenType: data.token_type || "Bearer",
			expiresAt: Date.now() + expiresInSec * 1000
		};
	} catch (err: any) {
		const status = err?.response?.status;
		const payload = err?.response?.data;
		const detail = payload ? ` body=${JSON.stringify(payload)}` : "";
		throw new Error(`ServiceNow OAuth token request failed (status=${status ?? "n/a"})${detail}: ${err?.message ?? err}`);
	}
}
