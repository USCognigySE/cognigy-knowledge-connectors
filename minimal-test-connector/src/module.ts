import { createExtension } from "@cognigy/extension-tools";
import { minimalConnector } from "./knowledgeConnectors/minimalConnector";

export default createExtension({
	nodes: [],
	connections: [],
	knowledge: [minimalConnector],
	options: {
		label: "Minimal Test Connector"
	}
});
