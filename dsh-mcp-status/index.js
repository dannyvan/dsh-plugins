// dsh-mcp-status · Host half
// GET /api/dsh-mcp-status：进程级 MCP 清单（公开字段 only）。
// 挂载（.mcp.json → agent.ctx）在 apply() 的另一条 effect 里；本路由不读配置、
// 绝不返回 env / 密码 / headers。

import { loadMcpClient, mountIfRoot } from './mount.js'

export const name = 'dsh-mcp-status'
export const inject = ['webServer', 'tools', 'agents']

const API_PATH = '/api/dsh-mcp-status'
// cordis FiberState：PENDING=0 LOADING=1 ACTIVE=2 FAILED=3 DISPOSED=4 UNLOADING=5
const FIBER_DISPOSED = 4

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(body)
}

/** Streamable HTTP 端点只保留 origin + pathname，去掉 query（防 token 出现在 URL query 里泄露）。 */
function maskEndpoint(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return ''
  try {
    const u = new URL(raw)
    return u.origin + u.pathname
  } catch {
    return raw
  }
}

/**
 * 端点摘要：stdio 不显示（command/args 无展示意义，args 甚至可能含 --header 等敏感内容）；
 * 仅 streamable-http 显示去 query 的 URL。
 */
function endpointOf(config) {
  if (config.transport === 'stdio') return ''
  return maskEndpoint(config.url)
}

/** 枚举 mcp-client 插件的 live fiber 配置，只取公开字段。 */
export function listMcpServers(ctx) {
  const servers = []
  ctx.registry.forEach((runtime) => {
    if (runtime.name !== 'mcp-client') return
    for (const fiber of runtime.fibers) {
      if (fiber.state === FIBER_DISPOSED) continue
      const config = fiber.config
      if (config === null || config === undefined || typeof config.serverName !== 'string') continue
      servers.push({
        serverName: config.serverName,
        transport: config.transport,
        endpoint: endpointOf(config),
        online: false,
        toolCount: 0,
      })
    }
  })
  // 稳定排序：serverName 字典序（HMR 重载也不会导致列表跳位）
  servers.sort((a, b) => a.serverName.localeCompare(b.serverName))
  return servers
}

function schemaList(tools, scope) {
  if (tools === null || tools === undefined || typeof tools.schemas !== 'function') return []
  const list = scope === undefined ? tools.schemas() : tools.schemas(scope)
  return Array.isArray(list) ? list : []
}

export function collectToolNames(ctx) {
  const names = new Set()
  const add = (list) => {
    for (const tool of list) {
      if (tool !== null && typeof tool === 'object' && typeof tool.name === 'string') {
        names.add(tool.name)
      }
    }
  }
  add(schemaList(ctx.tools))
  try {
    for (const agent of ctx.agents?.roots?.() ?? []) {
      // tools 是上下文全局服务：schemas() 无参 = 全局层；作用域内 MCP 必须 schemas(agent)
      add(schemaList(ctx.tools, agent))
    }
  } catch {
    // roots() / schemas(agent) 不可用时仍用全局视图
  }
  return names
}

export function fillToolCounts(ctx, servers) {
  const names = collectToolNames(ctx)
  for (const server of servers) {
    const prefix = `mcp__${server.serverName}__`
    let count = 0
    for (const name of names) {
      if (name.startsWith(prefix)) count += 1
    }
    server.toolCount = count
    server.online = count > 0
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: async (req, res) => {
      try {
        const servers = listMcpServers(ctx)
        fillToolCounts(ctx, servers)
        sendJson(res, 200, {
          ok: true,
          serverCount: servers.length,
          toolCount: servers.reduce((sum, s) => sum + s.toolCount, 0),
          servers,
          checkedAt: new Date().toISOString(),
        })
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: String(error instanceof Error ? error.message : error),
          checkedAt: new Date().toISOString(),
        })
      }
    },
  }), 'dsh-mcp-status: route')

  ctx.effect(() => {
    const mounted = new WeakSet()
    let stopCreated = () => {}
    let stopping = false
    const start = loadMcpClient().then((mcpClient) => {
      if (stopping) return
      for (const agent of ctx.agents.roots()) {
        mountIfRoot(ctx, agent, mcpClient, mounted)
      }
      stopCreated = ctx.on('agent/created', ({ agent }) => {
        mountIfRoot(ctx, agent, mcpClient, mounted)
      })
    }).catch((error) => {
      ctx.logger.warn(`dsh-mcp-status: cannot load mcp-client, mount disabled: ${String(error)}`)
    })
    return () => {
      stopping = true
      stopCreated()
      return Promise.resolve(start).then(() => {})
    }
  }, 'dsh-mcp-status: mount')
}
