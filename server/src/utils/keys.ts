import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const ENV_PATH = join(process.cwd(), ".env");

interface KeyConfig {
  jwtSecret: string;
  apiKey: string;
}

function generateKey(): string {
  return randomBytes(32).toString("hex");
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

function writeEnvFile(env: Record<string, string>): void {
  const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf-8");
}

export function ensureKeys(): KeyConfig {
  let env: Record<string, string> = {};

  // Load existing .env if present
  if (existsSync(ENV_PATH)) {
    try {
      const content = readFileSync(ENV_PATH, "utf-8");
      env = parseEnvFile(content);
    } catch {
      console.warn("[keys] Failed to read .env file, will regenerate");
    }
  }

  let modified = false;

  if (process.env.JWT_SECRET) {
    env["JWT_SECRET"] = process.env.JWT_SECRET;
  } else if (!env["JWT_SECRET"]) {
    env["JWT_SECRET"] = generateKey();
    modified = true;
    console.log("[keys] Generated new JWT_SECRET");
  }

  if (process.env.MARKETPLACE_API_KEY) {
    env["MARKETPLACE_API_KEY"] = process.env.MARKETPLACE_API_KEY;
  } else if (!env["MARKETPLACE_API_KEY"]) {
    env["MARKETPLACE_API_KEY"] = generateKey();
    modified = true;
    console.log("[keys] Generated new MARKETPLACE_API_KEY");
  }

  // Write .env if modified
  if (modified) {
    try {
      writeEnvFile(env);
      console.log("[keys] Keys saved to .env file");
    } catch {
      console.error("[keys] Failed to write .env file");
    }
  }

  return {
    jwtSecret: env["JWT_SECRET"],
    apiKey: env["MARKETPLACE_API_KEY"],
  };
}
