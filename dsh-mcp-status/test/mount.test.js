import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readMcpServers, mountAgent, mountIfRoot } from '../mount.js'
import { sessionTag } from '../translate.js'

test('readMcpServers：cwd 空 / 文件不存在 / JSON 坏 → null', () => {
  assert.equal(readMcpServers(''), null)
  assert.equal(readMcpServers('/no/such/dir-mcp-status-test'), null)
  const dir = mkdtempSync(join(tmpdir(), 'mcp-json-'))
  try {
    writeFileSync(join(dir, '.mcp.json'), '{not json')
    assert.equal(readMcpServers(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readMcpServers：读出 mcpServers 对象', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-json-'))
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: { 'mysql-prod': { command: 'node' } },
    }))
    const servers = readMcpServers(dir)
    assert.equal(servers['mysql-prod'].command, 'node')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mountAgent：没有 cwd 或没有文件时不调 plugin', () => {
  const calls = []
  const agent = { session: { header: {}, id: 's1' }, ctx: { plugin: (...a) => calls.push(a) } }
  mountAgent(agent, { name: 'mcp-client' }, { warn() {} })
  assert.equal(calls.length, 0)
})

test('mountAgent：逐条 plugin；坏条目跳过，好的仍挂', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-json-'))
  const calls = []
  const warns = []
  try {
    writeFileSync(join(dir, '.mcp.json'), JSON.stringify({
      mcpServers: {
        bad: { type: 'sse' },
        ok: { command: 'node', args: ['x'] },
      },
    }))
    const agent = {
      session: { header: { cwd: dir }, id: 'sess-9' },
      ctx: {
        plugin(mod, config) {
          calls.push({ name: mod.name, config })
          return Promise.resolve()
        },
      },
    }
    mountAgent(agent, { name: 'mcp-client' }, { warn: (m) => warns.push(m) })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].config.serverName, `ok-${sessionTag('sess-9')}`)
    assert.equal(calls[0].config.transport, 'stdio')
    assert.ok(warns.some((m) => String(m).includes('bad')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mountIfRoot：非 root 或已挂过则跳过', () => {
  const agent = { session: { header: {}, id: 's' }, ctx: { plugin() { throw new Error('should not') } } }
  const ctx = { agents: { roots: () => [] }, logger: { warn() {} } }
  const mounted = new WeakSet()
  mountIfRoot(ctx, agent, { name: 'mcp-client' }, mounted)
  ctx.agents.roots = () => [agent]
  mountIfRoot(ctx, agent, { name: 'mcp-client' }, mounted)
  mountIfRoot(ctx, agent, { name: 'mcp-client' }, mounted)
  assert.equal(mounted.has(agent), true)
})
