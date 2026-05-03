"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const extension_tools_1 = require("@cognigy/extension-tools");
const freshdeskConnection_1 = require("./connections/freshdeskConnection");
const freshdeskConnector_1 = require("./knowledgeConnectors/freshdeskConnector");
exports.default = (0, extension_tools_1.createExtension)({
    nodes: [],
    connections: [freshdeskConnection_1.freshdeskConnection],
    knowledge: [freshdeskConnector_1.freshdeskKnowledgeConnector],
    options: {
        label: "Freshdesk (Knowledge Connector)"
    }
});
