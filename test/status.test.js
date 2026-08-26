import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectToolNames, fillToolCounts } from '../index.js'

test('collectToolNames 合并 profile 与各 root agent.ctx 的 schema，按 name 去重', () => {
  const ctx = {
    tools: { schemas: () => [{ name: 'mcp__mysql-prod-aaaa__query' }] },
    agents: {
      roots: () => [
        { ctx: { tools: { schemas: () => [{ name: 'mcp__mysql-prod-aaaa__query' }, { name: 'mcp__mysql-prod-aaaa__list' }] } } },
        { ctx: { tools: { schemas: () => [{ name: 'mcp__mysql-dev-bbbb__query' }] } } },
      ],
    },
  }
  const names = collectToolNames(ctx)
  assert.equal(names.size, 3)
  assert.ok(names.has('mcp__mysql-dev-bbbb__query'))
})

test('fillToolCounts：只算对应 serverName 前缀，>0 视为在线', () => {
  const servers = [
    { serverName: 'mysql-prod-aaaa', online: false, toolCount: 0 },
    { serverName: 'other-cccc', online: false, toolCount: 0 },
  ]
  const ctx = {
    tools: { schemas: () => [] },
    agents: {
      roots: () => [{ ctx: { tools: { schemas: () => [{ name: 'mcp__mysql-prod-aaaa__query' }] } } }],
    },
  }
  fillToolCounts(ctx, servers)
  assert.equal(servers[0].toolCount, 1)
  assert.equal(servers[0].online, true)
  assert.equal(servers[1].toolCount, 0)
  assert.equal(servers[1].online, false)
})
