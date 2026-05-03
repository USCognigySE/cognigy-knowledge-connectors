import { createExtension } from "@cognigy/extension-tools";
import { freshdeskConnection } from "./connections/freshdeskConnection";
import { freshdeskKnowledgeConnector } from "./knowledgeConnectors/freshdeskConnector";

export default createExtension({
	nodes: [],
	connections: [freshdeskConnection],
	knowledge: [freshdeskKnowledgeConnector],
	options: {
		label: "Freshdesk (Knowledge Connector)"
	}
});
