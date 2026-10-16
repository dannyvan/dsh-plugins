import { createHash } from 'node:crypto'

export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export function sessionTag(sessionId) {
  return createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 4)
}

export function qualifiedServerName(original, sessionId) {
  if (typeof original !== 'string' || original.length === 0) return null
  const name = `${original}-${sessionTag(sessionId)}`
  if (!SERVER_NAME_PATTERN.test(name)) return null
  return name
}

function copyStringRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function toMcpClientConfig(originalName, entry, sessionCwd, sessionId) {
  const serverName = qualifiedServerName(originalName, sessionId)
  if (serverName === null) return { error: 'bad-server-name' }
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return { error: 'not-object' }
  }
  const url = typeof entry.url === 'string' && entry.url.length > 0 ? entry.url : ''
  const command = typeof entry.command === 'string' && entry.command.length > 0 ? entry.command : ''
  if (url) {
    return {
      config: {
        transport: 'streamable-http',
        serverName,
        url,
        headers: copyStringRecord(entry.headers),
        failOnStartupError: false,
      },
    }
  }
  if (command) {
    return {
      config: {
        transport: 'stdio',
        serverName,
        command,
        args: Array.isArray(entry.args) ? entry.args.filter((a) => typeof a === 'string') : [],
        env: copyStringRecord(entry.env),
        cwd: sessionCwd,
        failOnStartupError: false,
      },
    }
  }
  return { error: 'unsupported-transport' }
}
