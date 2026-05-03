import { ConfidentialClientApplication } from "@azure/msal-node";

export interface GraphAuthConfig {
	tenantId: string;
	clientId: string;
	clientSecret: string;
}

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

export async function getGraphToken(config: GraphAuthConfig): Promise<string> {
	const app = new ConfidentialClientApplication({
		auth: {
			clientId: config.clientId,
			clientSecret: config.clientSecret,
			authority: `https://login.microsoftonline.com/${config.tenantId}`
		}
	});

	const result = await app.acquireTokenByClientCredential({ scopes: [GRAPH_SCOPE] });
	if (!result || !result.accessToken) {
		throw new Error("Failed to acquire Microsoft Graph access token");
	}
	return result.accessToken;
}
