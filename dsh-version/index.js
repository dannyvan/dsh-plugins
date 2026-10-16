// dsh-version · Host half
// GET /api/dsh-version：返回本机 DeepSeek Harness 版本号 + npm 最新版本（30 分钟缓存）。
// 版本号不硬编码，从 dsh CLI 安装位置动态读取（PATH 真实路径 / nvm 布局 / 模块解析三选一）。
import { existsSync, realpathSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-version'
export const inject = ['webServer']

const API_PATH = '/api/dsh-version'
const CHECK_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
const REGISTRY_URL = 'https://registry.npmjs.org/@deepseek-ai/dsh'
const CLI_NAME = '@deepseek-ai/dsh'

let harnessInfo = null // 解析一次，进程内复用
let profileDir = null
let checkCache = null // { atMs, latest }

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(body)
}

/**
 * 本机 harness 版本与安装根：依次尝试
 * 1) 模块树内解析（bundle 安装在 profile/node_modules 内时）
 * 2) PATH 上的 dsh 二进制 → realpath → lib/bin.js → 包根 package.json
 * 3) nvm 布局：node 可执行同级 lib/node_modules/@deepseek-ai/dsh
 * 每步都校验 package.json 的 name 是 @deepseek-ai/dsh，防止读到同名异物。
 * @returns {{ version: string, installRoot: string } | null}
 */
function resolveHarnessVersion() {
  try {
    const require = createRequire(import.meta.url)
    for (const spec of [`${CLI_NAME}/package.json`, '@deepseek-ai/dsh-web-app/package.json']) {
      try {
        const pkgPath = require.resolve(spec)
        const manifest = readJson(pkgPath)
        if (typeof manifest.version === 'string' && manifest.version) {
          return { version: manifest.version, installRoot: dirname(pkgPath) }
        }
      } catch { /* 下一个候选 */ }
    }
  } catch { /* 模块树不可用 */ }
  for (const dir of (process.env.PATH ?? '').split(/\s*[:;]\s*/)) {
    if (!dir) continue
    try {
      const real = realpathSync(join(dir, 'dsh'))
      if (!/lib[\\/]bin\.js$/.test(real)) continue
      const root = dirname(dirname(real))
      const manifest = readJson(join(root, 'package.json'))
      if (manifest.name === CLI_NAME && typeof manifest.version === 'string') {
        return { version: manifest.version, installRoot: root }
      }
    } catch { /* 继续找 */ }
  }
  try {
    const root = join(dirname(dirname(process.execPath)), 'lib', 'node_modules', '@deepseek-ai', 'dsh')
    const manifest = readJson(join(root, 'package.json'))
    if (manifest.name === CLI_NAME && typeof manifest.version === 'string') {
      return { version: manifest.version, installRoot: root }
    }
  } catch { /* 兜底失败 */ }
  return null
}

/** 当前 profile 目录：从启动参数推导（$DSH_HOME 或 ~/.dsh/profiles）。 */
function resolveProfileDir() {
  const argv = process.argv ?? []
  const candidates = []
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--profile') {
      const name = argv[i + 1]
      if (typeof name === 'string' && name.length > 0 && !name.startsWith('-')) candidates.push(name)
    }
  }
  // `dsh web` 是 `--profile web` 的硬编码别名（bin.js）
  if (argv.includes('web')) candidates.push('web')
  const env = process.env.DSH_PROFILE
  if (typeof env === 'string' && env.length > 0) candidates.push(env)
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  for (const name of candidates) {
    // 校验目录真实存在且是 profile（含 cordis.yml 或带 dsh 声明的 package.json），防误判
    const dir = join(home, 'profiles', name)
    try {
      const root = join(dir, 'cordis.yml')
      if (existsSync(root)) return dir
    } catch { /* 尝试下一个 */ }
    try {
      const manifest = readJson(join(dir, 'package.json'))
      if (manifest && (manifest.dsh !== void 0 || manifest.private === true)) return dir
    } catch { /* 尝试下一个 */ }
  }
  return null
}

// ---- 语义化版本比较（同 dshmarket 规则：只认 latest > current 才算更新，避免降级误报）----

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseSemver(v) {
  const m = SEMVER.exec(String(v).trim())
  if (m === null) return null
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] === undefined ? [] : m[4].split('.') }
}

/**
 * 比较两个 semver：负 / 0 / 正，或 null（任一侧不是合法 semver）。
 * 构建元数据忽略；稳定版高于同 core 的任何预发布；预发布标识数字优先、数字按数值比较。
 */
function compareVersions(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (pa === null || pb === null) return null
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i]
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) return Number(x) - Number(y)
    if (nx !== ny) return nx ? -1 : 1
    return x < y ? -1 : 1
  }
  return 0
}

// ---- npm 最新版本检查 ----

async function fetchLatestFromNpm() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const upstream = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!upstream.ok) return { error: `upstream ${upstream.status}` }
    const body = await upstream.json()
    const latest = body?.['dist-tags']?.latest
    if (typeof latest === 'string' && latest) return { latest }
    return { error: 'no-latest-tag' }
  } catch {
    return { error: 'network' }
  } finally {
    clearTimeout(timer)
  }
}

export async function apply(ctx) {
  if (harnessInfo === null) harnessInfo = resolveHarnessVersion()
  if (profileDir === null) profileDir = resolveProfileDir()
  const current = harnessInfo === null ? null : harnessInfo.version
  const installRoot = harnessInfo === null ? null : harnessInfo.installRoot
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: API_PATH,
    handler: async (req, res) => {
      const now = Date.now()
      let latest = null
      let checkError = null
      if (checkCache === null || now - checkCache.atMs >= CHECK_TTL_MS) {
        const result = await fetchLatestFromNpm()
        if (result.latest !== undefined) {
          latest = result.latest
          checkCache = { atMs: now, latest }
        } else {
          checkError = result.error ?? 'unknown'
          if (checkCache !== null) latest = checkCache.latest
        }
      } else {
        latest = checkCache.latest
      }
      let updateAvailable = false
      if (current !== null && latest !== null) {
        const cmp = compareVersions(latest, current)
        updateAvailable = cmp !== null && cmp > 0
      }
      sendJson(res, 200, {
        ok: true,
        current,
        latest,
        updateAvailable,
        installRoot,
        profileDir,
        checkedAt: new Date(now).toISOString(),
        ...(checkError !== null ? { checkError } : {}),
      })
    },
  }), 'dsh-version: route')
}
