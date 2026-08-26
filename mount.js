import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { toMcpClientConfig } from './translate.js'

export function readMcpServers(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return null
  let text
  try {
    text = readFileSync(join(cwd, '.mcp.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const doc = JSON.parse(text)
    const servers = doc?.mcpServers
    if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) return null
    return servers
  } catch {
    return null
  }
}

export async function loadMcpClient() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const require = createRequire(join(home, 'profiles', 'web', 'package.json'))
  const resolved = require.resolve('@deepseek-ai/dsh-mcp-client')
  return import(pathToFileURL(resolved).href)
}

export function mountAgent(agent, mcpClient, log) {
  const cwd = agent?.session?.header?.cwd
  const sessionId = agent?.session?.id ?? agent?.id
  const servers = readMcpServers(cwd)
  if (servers === null) return
  for (const [originalName, entry] of Object.entries(servers)) {
    const translated = toMcpClientConfig(originalName, entry, cwd, sessionId)
    if (translated.error !== undefined) {
      log?.warn(`dsh-mcp-status: skip MCP server "${originalName}": ${translated.error}`)
      continue
    }
    try {
      const fiber = agent.ctx.plugin(mcpClient, translated.config)
      Promise.resolve(fiber).catch((error) => {
        log?.warn(`dsh-mcp-status: mcp-client "${translated.config.serverName}" failed: ${String(error)}`)
      })
    } catch (error) {
      log?.warn(`dsh-mcp-status: mcp-client "${translated.config.serverName}" threw: ${String(error)}`)
    }
  }
}

export function mountIfRoot(ctx, agent, mcpClient, mounted) {
  if (agent === null || agent === undefined) return
  if (mounted.has(agent)) return
  let roots
  try {
    roots = ctx.agents.roots()
  } catch {
    return
  }
  if (!Array.isArray(roots) || !roots.includes(agent)) return
  mounted.add(agent)
  mountAgent(agent, mcpClient, ctx.logger)
}
