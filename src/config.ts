import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

export interface SparkleConfig {
  sparkleFolder: string;
  maxFileSize: number;
  allowedExtensions: string[];
  autoIndex: boolean;
  watcherEnabled: boolean;
  appVersion?: string;
  serverPort?: number;
}

export const DEFAULT_CONFIG: SparkleConfig = {
  sparkleFolder: "~/Sparkle",
  maxFileSize: 100 * 1024 * 1024, // 100MB
  allowedExtensions: ["*"],
  autoIndex: true,
  watcherEnabled: true,
  appVersion: 'production',
  serverPort: 8080,
};

export const loadConfig = async (): Promise<SparkleConfig> => {
  const configPath = path.join(os.homedir(), "Sparkle", ".mcp-config.json");
  
  try {
    const configData = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configData);
    return {
      ...DEFAULT_CONFIG,
      ...config.settings,
    };
  } catch (error) {
    console.error("Using default configuration");
    return DEFAULT_CONFIG;
  }
};

export const saveConfig = async (config: Partial<SparkleConfig>) => {
  const configPath = path.join(os.homedir(), "Sparkle", ".mcp-config.json");
  
  try {
    const existingData = await fs.readFile(configPath, "utf-8");
    const existing = JSON.parse(existingData);
    
    existing.settings = {
      ...existing.settings,
      ...config,
    };
    existing.updated = new Date().toISOString();
    
    await fs.writeFile(configPath, JSON.stringify(existing, null, 2));
  } catch (error) {
    console.error("Error saving configuration:", error);
    throw error;
  }
};