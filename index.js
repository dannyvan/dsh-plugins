// dsh-mcp-status · Host half
// GET /api/dsh-mcp-status：返回当前 profile 加载的 MCP server 清单 + 连接状态 + 已注册工具数。
// 数据全部来自运行时 cordis 注册表与工具注册表，不读任何配置文件；
// 只透出公开字段（serverName / transport / command / url 去 query），绝不返回 env / 密码 / headers。

export const name = 'dsh-mcp-status'
export const inject = ['webServer', 'tools']

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
function listMcpServers(ctx) {
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

/** 按 mcp__<serverName>__ 前缀统计每个 server 已注册的工具数（>0 视为在线）。 */
function fillToolCounts(ctx, servers) {
  const schemas = ctx.tools.schemas()
  for (const server of servers) {
    const prefix = `mcp__${server.serverName}__`
    let count = 0
    for (const tool of schemas) {
      if (tool !== null && typeof tool === 'object' && typeof tool.name === 'string' && tool.name.startsWith(prefix)) {
        count += 1
      }
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
}
