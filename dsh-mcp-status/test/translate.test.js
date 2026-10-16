import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sessionTag, qualifiedServerName, toMcpClientConfig } from '../translate.js'

test('sessionTag 同一 sessionId 稳定且为 4 位 hex', () => {
  const a = sessionTag('sess-abc')
  const b = sessionTag('sess-abc')
  assert.equal(a, b)
  assert.match(a, /^[0-9a-f]{4}$/)
})

test('sessionTag 不同 sessionId 通常不同', () => {
  assert.notEqual(sessionTag('sess-a'), sessionTag('sess-b'))
})

test('qualifiedServerName 拼接原名与短标签', () => {
  const name = qualifiedServerName('mysql-prod', 'sess-abc')
  assert.equal(name, `mysql-prod-${sessionTag('sess-abc')}`)
})

test('qualifiedServerName 超长或不合法则返回 null（不截断）', () => {
  const original = 'a'.repeat(30)
  assert.equal(qualifiedServerName(original, 'sess-abc'), null)
  assert.equal(qualifiedServerName('mysql prod', 'sess-abc'), null)
})

test('toMcpClientConfig：有 url → streamable-http，忽略 type:http', () => {
  const sessionId = 'sess-1'
  const out = toMcpClientConfig('vanehub', {
    type: 'http',
    url: 'https://example.com/mcp?token=secret',
    headers: { Authorization: 'Bearer x' },
  }, '/tmp/ws', sessionId)
  assert.equal(out.error, undefined)
  assert.equal(out.config.transport, 'streamable-http')
  assert.equal(out.config.serverName, `vanehub-${sessionTag(sessionId)}`)
  assert.equal(out.config.url, 'https://example.com/mcp?token=secret')
  assert.deepEqual(out.config.headers, { Authorization: 'Bearer x' })
  assert.equal(out.config.failOnStartupError, false)
})

test('toMcpClientConfig：有 command 无 url → stdio，省略 type 也能翻', () => {
  const sessionId = 'sess-1'
  const out = toMcpClientConfig('mysql-prod', {
    command: '/usr/bin/node',
    args: ['/abs/mcp-server-mysql'],
    env: { MYSQL_HOST: '127.0.0.1' },
  }, '/tmp/ws', sessionId)
  assert.equal(out.error, undefined)
  assert.equal(out.config.transport, 'stdio')
  assert.equal(out.config.command, '/usr/bin/node')
  assert.deepEqual(out.config.args, ['/abs/mcp-server-mysql'])
  assert.deepEqual(out.config.env, { MYSQL_HOST: '127.0.0.1' })
  assert.equal(out.config.cwd, '/tmp/ws')
  assert.equal(out.config.failOnStartupError, false)
})

test('toMcpClientConfig：url 优先于 command', () => {
  const out = toMcpClientConfig('both', {
    url: 'https://example.com/mcp',
    command: '/usr/bin/node',
  }, '/tmp/ws', 'sess-1')
  assert.equal(out.config.transport, 'streamable-http')
})

test('toMcpClientConfig：无 url 无 command → error', () => {
  const out = toMcpClientConfig('sse', { type: 'sse' }, '/tmp/ws', 'sess-1')
  assert.equal(out.config, undefined)
  assert.equal(out.error, 'unsupported-transport')
})

test('toMcpClientConfig：args/env/headers 缺省为空数组或空对象', () => {
  const stdio = toMcpClientConfig('s', { command: 'node' }, '/tmp/ws', 'sess-1')
  assert.deepEqual(stdio.config.args, [])
  assert.deepEqual(stdio.config.env, {})
  const http = toMcpClientConfig('h', { url: 'https://x' }, '/tmp/ws', 'sess-1')
  assert.deepEqual(http.config.headers, {})
})
