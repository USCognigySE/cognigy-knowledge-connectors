"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtension = getExtension;
exports.isSupported = isSupported;
exports.extractText = extractText;
exports.extractFromHtmlString = extractFromHtmlString;
exports.sanitizeText = sanitizeText;
const mammoth_1 = __importDefault(require("mammoth"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const html_to_text_1 = require("html-to-text");
const HTML_TO_TEXT_OPTIONS = {
    wordwrap: false,
    selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" }
    ]
};
function getExtension(filename) {
    const idx = filename.lastIndexOf(".");
    return idx >= 0 ? filename.substring(idx + 1).toLowerCase() : "";
}
function isSupported(ext, allowlist) {
    return allowlist.includes(ext.toLowerCase());
}
async function extractText(buffer, ext) {
    let raw;
    switch (ext.toLowerCase()) {
        case "docx":
            raw = (await mammoth_1.default.extractRawText({ buffer })).value;
            break;
        case "pdf":
            raw = (await (0, pdf_parse_1.default)(buffer)).text;
            break;
        case "html":
        case "htm":
        case "aspx":
            raw = (0, html_to_text_1.htmlToText)(buffer.toString("utf8"), HTML_TO_TEXT_OPTIONS);
            break;
        case "txt":
        case "md":
            raw = buffer.toString("utf8");
            break;
        default:
            throw new Error(`Unsupported file extension: ${ext}`);
    }
    return sanitizeText(raw);
}
function extractFromHtmlString(html) {
    return sanitizeText((0, html_to_text_1.htmlToText)(html, HTML_TO_TEXT_OPTIONS));
}
function sanitizeText(text) {
    if (!text)
        return "";
    return text
        .replace(/\uFFFD/g, "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
