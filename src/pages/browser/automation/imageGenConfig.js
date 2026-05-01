"use strict";
/**
 * imageGenConfig.ts
 *
 * Persists the ChatGPT image-generation URL to a JSON config file
 * so the user can change it from Settings without restarting the app.
 *
 * Config file: <userData>/elite_image_gen.json
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readImageGenConfig = readImageGenConfig;
exports.writeImageGenConfig = writeImageGenConfig;
exports.getChatGptUrl = getChatGptUrl;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const DEFAULT_URL = 'https://chatgpt.com/g/g-p-695fa0174ec88191a103a44f86864e61-image-generation/project';
function configPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'elite_image_gen.json');
}
function readImageGenConfig() {
    try {
        const raw = fs_1.default.readFileSync(configPath(), 'utf8');
        const parsed = JSON.parse(raw);
        return {
            chatGptUrl: (parsed.chatGptUrl && parsed.chatGptUrl.trim()) ? parsed.chatGptUrl.trim() : DEFAULT_URL,
        };
    }
    catch {
        return { chatGptUrl: DEFAULT_URL };
    }
}
function writeImageGenConfig(config) {
    const current = readImageGenConfig();
    const merged = { ...current, ...config };
    fs_1.default.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf8');
}
function getChatGptUrl() {
    return readImageGenConfig().chatGptUrl;
}
