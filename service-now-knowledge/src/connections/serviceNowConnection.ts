import { IConnectionSchema } from "@cognigy/extension-tools";

export type ServiceNowConnection = {
	instance: string;
	clientId: string;
	clientSecret: string;
	username: string;
	password: string;
};

export const serviceNowConnection: IConnectionSchema = {
	type: "servicenow",
	label: "ServiceNow (OAuth Password Grant)",
	fields: [
		{ fieldName: "instance" },
		{ fieldName: "clientId" },
		{ fieldName: "clientSecret" },
		{ fieldName: "username" },
		{ fieldName: "password" }
	]
};
