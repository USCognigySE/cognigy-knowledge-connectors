"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serviceNowConnection = void 0;
exports.serviceNowConnection = {
    type: "servicenow",
    label: "ServiceNow (OAuth Password Grant)",
    fields: [
        { fieldName: "instance" },
        { fieldName: "clientId" },
        { fieldName: "clientSecret" },
        { fieldName: "username" },
        { fieldName: "password" }
    ]
};
