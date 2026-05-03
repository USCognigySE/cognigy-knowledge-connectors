"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const extension_tools_1 = require("@cognigy/extension-tools");
const serviceNowConnection_1 = require("./connections/serviceNowConnection");
const serviceNowConnector_1 = require("./knowledgeConnectors/serviceNowConnector");
exports.default = (0, extension_tools_1.createExtension)({
    nodes: [],
    connections: [serviceNowConnection_1.serviceNowConnection],
    knowledge: [serviceNowConnector_1.serviceNowKnowledgeConnector],
    options: {
        label: "ServiceNow (Knowledge Connector)"
    }
});
