"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
const DEFAULT_CHUNK_CHARS = 1800;
const DEFAULT_OVERLAP_CHARS = 200;
function chunkText(text, options = {}) {
    const maxChars = options.maxChars ?? DEFAULT_CHUNK_CHARS;
    const overlap = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;
    const normalised = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!normalised)
        return [];
    if (normalised.length <= maxChars)
        return [normalised];
    const paragraphs = normalised.split(/\n{2,}/);
    const chunks = [];
    let current = "";
    for (const para of paragraphs) {
        if (para.length > maxChars) {
            if (current) {
                chunks.push(current);
                current = "";
            }
            chunks.push(...splitLongBlock(para, maxChars, overlap));
            continue;
        }
        const candidate = current ? `${current}\n\n${para}` : para;
        if (candidate.length > maxChars) {
            chunks.push(current);
            current = overlap > 0 && current.length > overlap
                ? `${current.slice(-overlap)}\n\n${para}`
                : para;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        chunks.push(current);
    return chunks;
}
function splitLongBlock(block, maxChars, overlap) {
    const out = [];
    let i = 0;
    const step = Math.max(1, maxChars - overlap);
    while (i < block.length) {
        out.push(block.slice(i, i + maxChars));
        i += step;
    }
    return out;
}
