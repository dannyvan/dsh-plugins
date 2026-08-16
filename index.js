// dsh-balance · Host half
// GET /api/dsh-balance：读取本地 DEEPSEEK_API_KEY，调用官方余额接口，返回 JSON。
// key 只在 Host 进程内使用，不进浏览器。60 秒缓存。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-balance'
export const inject = ['webServer']

const API_PATH = '/api/dsh-balance'
const CACHE_TTL_MS = 60_000
const FETCH_TIMEOUT_MS = 10_000

let cached = null

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(body)
}

function readApiKey() {
  try {
    const path = join(homedir(), '.dsh', '.credentials.yaml')
    const text = readFileSync(path, 'utf8')
    const match = /^\s*DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)/m.exec(text)
    return match?.[1]
  } catch {
    return undefined
  }
}

export async function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: async (req, res) => {
      try {
        const now = Date.now()
        if (cached !== null && now - cached.atMs < CACHE_TTL_MS) {
          sendJson(res, 200, { ok: true, cached: true, ...cached.payload })
          return
        }
        const key = readApiKey()
        if (key === undefined) {
          sendJson(res, 200, { ok: false, error: 'no-key' })
          return
        }
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        let upstream
        try {
          upstream = await fetch('https://api.deepseek.com/user/balance', {
            headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timer)
        }
        if (!upstream.ok) {
          sendJson(res, 200, { ok: false, error: 'upstream', status: upstream.status })
          return
        }
        const payload = await upstream.json()
        cached = { payload, atMs: now }
        sendJson(res, 200, { ok: true, cached: false, ...payload })
      } catch (error) {
        sendJson(res, 200, { ok: false, error: 'network', detail: String(error) })
      }
    },
  }), 'dsh-balance: route')
}
