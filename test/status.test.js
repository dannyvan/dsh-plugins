import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectToolNames, fillToolCounts } from '../index.js'

test('collectToolNames 必须把 agent 传给 tools.schemas（无参是全局视图）', () => {
  const agentA = { id: 'a' }
  const agentB = { id: 'b' }
  const ctx = {
    tools: {
      schemas(scope) {
        if (scope === undefined) return []
        if (scope === agentA) return [{ name: 'mcp__mysql-prod-aaaa__query' }, { name: 'mcp__mysql-prod-aaaa__list' }]
        if (scope === agentB) return [{ name: 'mcp__mysql-dev-bbbb__query' }]
        return []
      },
    },
    agents: { roots: () => [agentA, agentB] },
  }
  const names = collectToolNames(ctx)
  assert.equal(names.size, 3)
  assert.ok(names.has('mcp__mysql-dev-bbbb__query'))
})

test('fillToolCounts：只算对应 serverName 前缀，>0 视为在线', () => {
  const agent = { id: 'root-1' }
  const servers = [
    { serverName: 'mysql-prod-aaaa', online: false, toolCount: 0 },
    { serverName: 'other-cccc', online: false, toolCount: 0 },
  ]
  const ctx = {
    tools: {
      schemas(scope) {
        if (scope === agent) return [{ name: 'mcp__mysql-prod-aaaa__query' }]
        return []
      },
    },
    agents: { roots: () => [agent] },
  }
  fillToolCounts(ctx, servers)
  assert.equal(servers[0].toolCount, 1)
  assert.equal(servers[0].online, true)
  assert.equal(servers[1].toolCount, 0)
  assert.equal(servers[1].online, false)
})
