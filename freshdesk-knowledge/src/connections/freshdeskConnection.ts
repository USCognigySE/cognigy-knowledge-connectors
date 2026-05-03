import { IConnectionSchema } from "@cognigy/extension-tools";

export type FreshdeskConnection = {
	domain: string;
	apiKey: string;
};

export const freshdeskConnection: IConnectionSchema = {
	type: "freshdesk",
	label: "Freshdesk (API key)",
	fields: [
		{ fieldName: "domain" },
		{ fieldName: "apiKey" }
	]
};
