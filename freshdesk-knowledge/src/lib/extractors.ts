import { htmlToText } from "html-to-text";

const HTML_TO_TEXT_OPTIONS = {
	wordwrap: false as const,
	selectors: [
		{ selector: "a", options: { ignoreHref: true } },
		{ selector: "img", format: "skip" },
		{ selector: "script", format: "skip" },
		{ selector: "style", format: "skip" }
	]
};

const REPLACEMENT_CHAR_CODE = 0xfffd;

export function extractFromHtmlString(html: string): string {
	if (!html) return "";
	return sanitizeText(htmlToText(html, HTML_TO_TEXT_OPTIONS));
}

export function sanitizeText(text: string): string {
	if (!text) return "";
	let buffer = "";
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code === REPLACEMENT_CHAR_CODE) continue;
		// strip control chars except TAB (9), LF (10), CR (13)
		if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
		if (code === 127) continue;
		buffer += text.charAt(i);
	}
	return buffer
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+/g, " ")
		.replace(/[ \t]*\n[ \t]*/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
