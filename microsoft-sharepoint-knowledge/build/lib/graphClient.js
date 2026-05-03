"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphClient = void 0;
const axios_1 = __importDefault(require("axios"));
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const MAX_RETRIES = 5;
class GraphClient {
    constructor(accessToken) {
        this.http = axios_1.default.create({
            baseURL: GRAPH_BASE,
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 60000
        });
    }
    async get(url, config) {
        return this.request({ ...config, method: "GET", url });
    }
    async getBuffer(url) {
        const res = await this.request({
            method: "GET",
            url,
            responseType: "arraybuffer"
        });
        return Buffer.from(res);
    }
    async *paginate(url) {
        let next = url;
        while (next) {
            const page = await this.get(next);
            for (const item of page.value ?? []) {
                yield item;
            }
            next = page["@odata.nextLink"];
            if (next && next.startsWith(GRAPH_BASE)) {
                next = next.substring(GRAPH_BASE.length);
            }
        }
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
            throw err;
        }
    }
}
exports.GraphClient = GraphClient;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
