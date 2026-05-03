"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchKbArticles = fetchKbArticles;
exports.getKnowledgeBaseId = getKnowledgeBaseId;
exports.fetchArticleBody = fetchArticleBody;
const ARTICLE_FIELDS = [
    "text",
    "wiki",
    "sys_updated_on",
    "kb_knowledge_base",
    "workflow_state",
    "language"
].join(",");
const ID_PREFIX = "kb_knowledge:";
async function* fetchKbArticles(client, options) {
    const filterParts = [];
    const state = options.workflowState?.trim();
    if (state)
        filterParts.push(`workflow_state=${state}`);
    if (options.articleNumbers && options.articleNumbers.length > 0) {
        filterParts.push(`numberIN${options.articleNumbers.join(",")}`);
    }
    const filter = filterParts.join("^");
    const baseParams = {
        fields: ARTICLE_FIELDS,
        filter: filter || undefined
    };
    if (options.knowledgeBases && options.knowledgeBases.length > 0) {
        baseParams.kb = options.knowledgeBases.join(",");
    }
    if (options.language && options.language.trim()) {
        baseParams.language = options.language.trim();
    }
    let offset = 0;
    while (true) {
        const res = await client.get("/api/sn_km_api/knowledge/articles", {
            ...baseParams,
            limit: options.pageSize,
            offset
        });
        const batch = res?.result?.articles ?? [];
        if (batch.length === 0)
            return;
        for (const article of batch) {
            const mapped = mapArticle(article);
            if (mapped)
                yield mapped;
        }
        if (batch.length < options.pageSize)
            return;
        offset += batch.length;
    }
}
function mapArticle(a) {
    if (!a?.id)
        return undefined;
    const sysId = a.id.startsWith(ID_PREFIX) ? a.id.slice(ID_PREFIX.length) : a.id;
    const fields = a.fields ?? {};
    const kbField = fields.kb_knowledge_base;
    const text = pickFieldContent(fields, "text", "wiki");
    return {
        sys_id: sysId,
        number: a.number ?? "",
        title: a.title ?? "",
        snippet: a.snippet,
        text,
        text_source: text.length > 0 ? findContentSource(fields, "text", "wiki") : undefined,
        workflow_state: fields.workflow_state?.value ?? "",
        sys_updated_on: fields.sys_updated_on?.value ?? "",
        language: fields.language?.value,
        kb_knowledge_base_id: kbField?.value,
        kb_knowledge_base_name: kbField?.display_value
    };
}
function pickFieldContent(fields, ...names) {
    for (const name of names) {
        const f = fields[name];
        if (f?.value && f.value.trim())
            return f.value;
        if (f?.display_value && f.display_value.trim())
            return f.display_value;
    }
    return "";
}
function findContentSource(fields, ...names) {
    for (const name of names) {
        const f = fields[name];
        if (f?.value && f.value.trim())
            return `${name}.value`;
        if (f?.display_value && f.display_value.trim())
            return `${name}.display_value`;
    }
    return undefined;
}
function getKnowledgeBaseId(article) {
    return article.kb_knowledge_base_id;
}
async function fetchArticleBody(client, sysId) {
    const res = await client.get(`/api/sn_km_api/knowledge/articles/${sysId}`);
    const result = res?.result;
    if (!result || typeof result !== "object") {
        return { body: "", debug: `noResult(top:${Object.keys(res ?? {}).slice(0, 8).join(",")})` };
    }
    const fromContent = extractAny(result.content);
    if (fromContent)
        return { body: fromContent, debug: `content(${kindOf(result.content)})` };
    const fromEmbedded = extractAny(result.embedded_content);
    if (fromEmbedded)
        return { body: fromEmbedded, debug: `embedded_content(${kindOf(result.embedded_content)})` };
    const fields = (result.fields ?? {});
    const fromFields = pickFieldContent(fields, "text", "wiki", "description");
    if (fromFields)
        return { body: fromFields, debug: "fields.fallback" };
    const cPeek = peek(result.content);
    const ecPeek = peek(result.embedded_content);
    const cFirstKeys = firstBlockKeys(result.content);
    const ecFirstKeys = firstBlockKeys(result.embedded_content);
    const atts = Array.isArray(result.attachments) ? result.attachments : [];
    const attPeek = atts.length === 0 ? "0" : String(atts.length);
    return {
        body: "",
        debug: `none(c=${cPeek}/${cFirstKeys}|ec=${ecPeek}/${ecFirstKeys}|att=${attPeek})`
    };
}
function extractStringish(v) {
    if (typeof v === "string" && v.trim())
        return v;
    if (v && typeof v === "object" && !Array.isArray(v)) {
        if (typeof v.value === "string" && v.value.trim())
            return v.value;
        if (typeof v.display_value === "string" && v.display_value.trim())
            return v.display_value;
    }
    return "";
}
function extractAny(v) {
    const direct = extractStringish(v);
    if (direct)
        return direct;
    if (Array.isArray(v))
        return extractFromBlocks(v);
    return "";
}
const BLOCK_TEXT_KEYS = ["html", "text", "value", "body", "content", "display_value", "rendered", "rich_text", "markdown"];
function extractFromBlocks(blocks) {
    const parts = [];
    for (const block of blocks) {
        if (!block)
            continue;
        if (typeof block === "string") {
            if (block.trim())
                parts.push(block);
            continue;
        }
        if (typeof block !== "object")
            continue;
        let used = "";
        for (const key of BLOCK_TEXT_KEYS) {
            const v = block[key];
            if (typeof v === "string" && v.trim()) {
                used = v;
                break;
            }
            if (Array.isArray(v)) {
                const nested = extractFromBlocks(v);
                if (nested) {
                    used = nested;
                    break;
                }
            }
        }
        if (used) {
            parts.push(used);
        }
        else if (Array.isArray(block.children)) {
            const nested = extractFromBlocks(block.children);
            if (nested)
                parts.push(nested);
        }
    }
    return parts.join("\n\n");
}
function kindOf(v) {
    if (Array.isArray(v))
        return `arr[${v.length}]`;
    if (v === null)
        return "null";
    return typeof v;
}
function firstBlockKeys(v) {
    if (!Array.isArray(v) || v.length === 0)
        return "";
    const first = v[0];
    if (!first || typeof first !== "object")
        return `t=${typeof first}`;
    return `keys:${Object.keys(first).slice(0, 8).join(",")}`;
}
function peek(v) {
    if (v === null)
        return "null";
    if (v === undefined)
        return "undef";
    if (typeof v === "string")
        return `"${v.slice(0, 40)}"(len=${v.length})`;
    if (typeof v === "number" || typeof v === "boolean")
        return String(v);
    if (Array.isArray(v))
        return `arr[${v.length}]`;
    if (typeof v === "object")
        return `obj{${Object.keys(v).slice(0, 6).join(",")}}`;
    return typeof v;
}
