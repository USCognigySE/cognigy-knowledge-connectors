import { createExtension } from "@cognigy/extension-tools";
import { serviceNowConnection } from "./connections/serviceNowConnection";
import { serviceNowKnowledgeConnector } from "./knowledgeConnectors/serviceNowConnector";

export default createExtension({
	nodes: [],
	connections: [serviceNowConnection],
	knowledge: [serviceNowKnowledgeConnector],
	options: {
		label: "ServiceNow (Knowledge Connector)"
	}
});
