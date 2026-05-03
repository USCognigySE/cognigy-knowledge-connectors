"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.minimalConnector = void 0;
const crypto = __importStar(require("node:crypto"));
const extension_tools_1 = require("@cognigy/extension-tools");
exports.minimalConnector = (0, extension_tools_1.createKnowledgeConnector)({
    type: "minimalTestConnector",
    label: "Minimal Test Connector",
    summary: "Creates one hello-world chunk. For diagnosing Knowledge Store issues.",
    fields: [
        {
            key: "sourceName",
            label: "Source name",
            type: "text",
            defaultValue: "Minimal Test",
            params: { required: true }
        }
    ],
    function: async ({ config, api, sources }) => {
        const text = "Hello world from the minimal test connector. This is a single chunk.";
        const contentHash = crypto.createHash("sha256").update(text).digest("hex");
        const source = await api.upsertKnowledgeSource({
            name: config.sourceName,
            description: "Minimal test source",
            tags: ["test"],
            chunkCount: 1,
            contentHashOrTimestamp: contentHash
        });
        if (source) {
            await api.createKnowledgeChunk({
                knowledgeSourceId: source.knowledgeSourceId,
                text,
                data: {}
            });
        }
        for (const existing of sources) {
            if (existing.externalIdentifier && existing.externalIdentifier !== config.sourceName) {
                await api.deleteKnowledgeSource({
                    knowledgeSourceId: existing.knowledgeSourceId
                });
            }
        }
    }
});
