"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const extension_tools_1 = require("@cognigy/extension-tools");
const sharepointConnection_1 = require("./connections/sharepointConnection");
const sharepointConnector_1 = require("./knowledgeConnectors/sharepointConnector");
exports.default = (0, extension_tools_1.createExtension)({
    nodes: [],
    connections: [sharepointConnection_1.sharepointConnection],
    knowledge: [sharepointConnector_1.sharepointKnowledgeConnector],
    options: {
        label: "Microsoft SharePoint (Knowledge Connector)"
    }
});
