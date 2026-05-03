"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGraphToken = getGraphToken;
const msal_node_1 = require("@azure/msal-node");
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
async function getGraphToken(config) {
    const app = new msal_node_1.ConfidentialClientApplication({
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
