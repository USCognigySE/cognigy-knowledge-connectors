import { createExtension } from "@cognigy/extension-tools";
import { sharepointConnection } from "./connections/sharepointConnection";
import { sharepointKnowledgeConnector } from "./knowledgeConnectors/sharepointConnector";

export default createExtension({
	nodes: [],
	connections: [sharepointConnection],
	knowledge: [sharepointKnowledgeConnector],
	options: {
		label: "Microsoft SharePoint (Knowledge Connector)"
	}
});
