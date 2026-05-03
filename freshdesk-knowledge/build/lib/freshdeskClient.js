"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FreshdeskClient = void 0;
const axios_1 = __importDefault(require("axios"));
const freshdeskAuth_1 = require("./freshdeskAuth");
const MAX_RETRIES = 5;
class FreshdeskClient {
    constructor(domain, apiKey) {
        const baseURL = (0, freshdeskAuth_1.normaliseFreshdeskBaseUrl)(domain);
        this.http = axios_1.default.create({
            baseURL,
            headers: {
                Authorization: (0, freshdeskAuth_1.buildAuthHeader)(apiKey),
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            timeout: 60000
        });
    }
    async get(url, params) {
        const cleanedParams = params
            ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
            : undefined;
        return this.request({ method: "GET", url, params: cleanedParams });
    }
    async request(config, attempt = 0) {
        try {
            const res = await this.http.request(config);
            return res.data;
        }
        catch (err) {
            const status = err?.response?.status;
            const retryable = status === 429 || status === 503 || status === 504;
            if (retryable && attempt < MAX_RETRIES) {
                const retryAfter = Number(err.response?.headers?.["retry-after"]);
                const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(1000 * 2 ** attempt, 30000);
                await sleep(delayMs);
                return this.request(config, attempt + 1);
            }
            const baseURL = (this.http.defaults.baseURL ?? "").replace(/\/+$/, "");
            const path = (config.url ?? "").startsWith("/") ? config.url : `/${config.url ?? ""}`;
            const fullUrl = `${baseURL}${path}`;
            const url = `${config.method ?? "GET"} ${fullUrl}`;
            const body = err?.response?.data;
            const bodySnippet = body
                ? ` body=${typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500)}`
                : "";
            throw new Error(`Freshdesk request failed [${url}] status=${status ?? "n/a"}${bodySnippet}: ${err?.message ?? err}`);
        }
    }
}
exports.FreshdeskClient = FreshdeskClient;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
