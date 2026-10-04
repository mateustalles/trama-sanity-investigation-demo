import {existsSync, readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import type { NextConfig } from "next";

// The monorepo keeps shared local development secrets at its root. Load them
// before Next reads this app's optional local overrides.
const workspaceEnvironment = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local')
if (existsSync(workspaceEnvironment)) {
  for (const line of readFileSync(workspaceEnvironment, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match || process.env[match[1]] !== undefined) continue
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
}

const config: NextConfig = {
  experimental: process.env.TRAMA_LOW_MEMORY_BUILD === 'true'
    ? {cpus: 1, webpackMemoryOptimizations: true}
    : {},
  allowedDevOrigins: ["*.trycloudflare.com"],
  transpilePackages: [
    "@trama/application",
    "@trama/core",
    "@trama/database",
    "@trama/local-agent",
    "@trama/mcp",
    "@trama/schemas",
    "@trama/testing"
  ]
};

export default config;
