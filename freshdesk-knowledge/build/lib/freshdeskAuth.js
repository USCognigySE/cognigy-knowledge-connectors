"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normaliseFreshdeskBaseUrl = normaliseFreshdeskBaseUrl;
exports.buildAuthHeader = buildAuthHeader;
function normaliseFreshdeskBaseUrl(domain) {
    const trimmed = (domain || "").trim().replace(/\/+$/, "");
    if (!trimmed) {
        throw new Error("Freshdesk domain is required (e.g. \"acme\" or \"https://acme.freshdesk.com\")");
    }
    // Bare subdomain (no dot, no scheme) → assume *.freshdesk.com
    if (!trimmed.includes(".") && !/^https?:\/\//i.test(trimmed)) {
        return `https://${trimmed}.freshdesk.com`;
    }
    // Otherwise parse as URL and keep only origin — strips any path
    // (e.g. "https://acme.freshdesk.com/helpdesk" pasted from the support portal).
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const u = new URL(candidate);
        return `${u.protocol}//${u.host}`;
    }
    catch {
        throw new Error(`Freshdesk domain is not a valid URL: "${trimmed}"`);
    }
}
function buildAuthHeader(apiKey) {
    const trimmed = (apiKey || "").trim();
    if (!trimmed) {
        throw new Error("Freshdesk API key is required");
    }
    return "Basic " + Buffer.from(`${trimmed}:X`).toString("base64");
}
