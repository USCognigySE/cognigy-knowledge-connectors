import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { htmlToText } from "html-to-text";

export type SupportedExtension = "docx" | "pdf" | "txt" | "md" | "html" | "htm" | "aspx";

const HTML_TO_TEXT_OPTIONS = {
	wordwrap: false as const,
	selectors: [
		{ selector: "a", options: { ignoreHref: true } },
		{ selector: "img", format: "skip" },
		{ selector: "script", format: "skip" },
		{ selector: "style", format: "skip" }
	]
};

export function getExtension(filename: string): string {
	const idx = filename.lastIndexOf(".");
	return idx >= 0 ? filename.substring(idx + 1).toLowerCase() : "";
}

export function isSupported(ext: string, allowlist: string[]): boolean {
	return allowlist.includes(ext.toLowerCase());
}

export async function extractText(buffer: Buffer, ext: string): Promise<string> {
	let raw: string;
	switch (ext.toLowerCase()) {
		case "docx":
			raw = (await mammoth.extractRawText({ buffer })).value;
			break;
		case "pdf":
			raw = (await pdfParse(buffer)).text;
			break;
		case "html":
		case "htm":
		case "aspx":
			raw = htmlToText(buffer.toString("utf8"), HTML_TO_TEXT_OPTIONS);
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

export function extractFromHtmlString(html: string): string {
	return sanitizeText(htmlToText(html, HTML_TO_TEXT_OPTIONS));
}

export function sanitizeText(text: string): string {
	if (!text) return "";
	return text
		.replace(/\uFFFD/g, "")
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/[ \t]*\n[ \t]*/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
