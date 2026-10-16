import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyDisplayNames, projectNameOf, parseQualifiedServerName } from '../display.js'

test('projectNameOf 取 cwd 末段', () => {
  assert.equal(projectNameOf('/Users/me/Work/medela-bms'), 'medela-bms')
  assert.equal(projectNameOf('/Users/me/Work/medela-bms/'), 'medela-bms')
  assert.equal(projectNameOf(''), '')
})

test('parseQualifiedServerName 拆原键与 4 位 hex', () => {
  assert.deepEqual(parseQualifiedServerName('mysql-prod-19fc'), { originalName: 'mysql-prod', sessionTag: '19fc' })
  assert.deepEqual(parseQualifiedServerName('mysql-prod'), { originalName: 'mysql-prod', sessionTag: '' })
})

test('单会话同目录：标题为 项目名 · 原键，不附短标签', () => {
  const cwd = '/Users/me/Work/medela-bms'
  const servers = [
    { serverName: 'mysql-dev-19fc', cwd },
    { serverName: 'mysql-prod-19fc', cwd },
  ]
  applyDisplayNames(servers)
  assert.equal(servers[0].displayName, 'medela-bms · mysql-dev')
  assert.equal(servers[1].displayName, 'medela-bms · mysql-prod')
})

test('同目录多个会话：标题再附短标签', () => {
  const cwd = '/Users/me/Work/medela-bms'
  const servers = [
    { serverName: 'mysql-prod-19fc', cwd },
    { serverName: 'mysql-prod-2cf5', cwd },
  ]
  applyDisplayNames(servers)
  const names = servers.map((s) => s.displayName).sort()
  assert.deepEqual(names, ['medela-bms · mysql-prod · 19fc', 'medela-bms · mysql-prod · 2cf5'])
})

test('没有 cwd：只有原键', () => {
  const servers = [{ serverName: 'vanehub-abcd', cwd: '' }]
  applyDisplayNames(servers)
  assert.equal(servers[0].displayName, 'vanehub')
})
