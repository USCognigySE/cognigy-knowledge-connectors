"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const extension_tools_1 = require("@cognigy/extension-tools");
const minimalConnector_1 = require("./knowledgeConnectors/minimalConnector");
exports.default = (0, extension_tools_1.createExtension)({
    nodes: [],
    connections: [],
    knowledge: [minimalConnector_1.minimalConnector],
    options: {
        label: "Minimal Test Connector"
    }
});
