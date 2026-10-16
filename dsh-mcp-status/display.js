/** 徽章展示名：项目名（cwd 末段）· 原键；同目录多会话才附短标签。不改 mcp-client 的 serverName。 */

export function parseQualifiedServerName(serverName) {
  if (typeof serverName !== 'string' || serverName.length === 0) {
    return { originalName: '', sessionTag: '' }
  }
  const match = /^(.*)-([0-9a-f]{4})$/.exec(serverName)
  if (match === null) return { originalName: serverName, sessionTag: '' }
  return { originalName: match[1], sessionTag: match[2] }
}

export function projectNameOf(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return ''
  const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/').filter((part) => part.length > 0)
  return parts.length === 0 ? '' : parts[parts.length - 1]
}

export function publicCwd(config) {
  if (config === null || config === undefined || config.transport !== 'stdio') return ''
  return typeof config.cwd === 'string' ? config.cwd : ''
}

export function applyDisplayNames(servers) {
  const tagsByCwd = new Map()
  for (const server of servers) {
    const cwd = typeof server.cwd === 'string' ? server.cwd : ''
    const { sessionTag } = parseQualifiedServerName(server.serverName)
    if (cwd.length === 0 || sessionTag.length === 0) continue
    let tags = tagsByCwd.get(cwd)
    if (tags === undefined) {
      tags = new Set()
      tagsByCwd.set(cwd, tags)
    }
    tags.add(sessionTag)
  }
  for (const server of servers) {
    const cwd = typeof server.cwd === 'string' ? server.cwd : ''
    const { originalName, sessionTag } = parseQualifiedServerName(server.serverName)
    const project = projectNameOf(cwd)
    const base = originalName.length > 0 ? originalName : String(server.serverName ?? '')
    const parts = []
    if (project.length > 0) parts.push(project)
    if (base.length > 0) parts.push(base)
    const multiSession = cwd.length > 0 && (tagsByCwd.get(cwd)?.size ?? 0) > 1
    if (multiSession && sessionTag.length > 0) parts.push(sessionTag)
    server.displayName = parts.join(' · ')
    server.originalName = base
    server.sessionTag = sessionTag
    server.projectName = project
  }
  servers.sort((a, b) => {
    const byLabel = String(a.displayName ?? '').localeCompare(String(b.displayName ?? ''))
    if (byLabel !== 0) return byLabel
    return String(a.serverName ?? '').localeCompare(String(b.serverName ?? ''))
  })
}
