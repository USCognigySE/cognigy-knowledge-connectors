import { IConnectionSchema } from "@cognigy/extension-tools";

export type SharepointConnection = {
	tenantId: string;
	clientId: string;
	clientSecret: string;
};

export const sharepointConnection: IConnectionSchema = {
	type: "sharepoint",
	label: "SharePoint (Entra ID App)",
	fields: [
		{ fieldName: "tenantId" },
		{ fieldName: "clientId" },
		{ fieldName: "clientSecret" }
	]
};
