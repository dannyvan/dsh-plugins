// dsh-balance · Client half（DSH web __ModuleLoader__ 格式）
// 输入框工具行右侧显示 DeepSeek 账户余额 ¥xx.xx，点击刷新，60 秒自动更新。
// 数据来自 Host 路由 GET /api/dsh-balance（key 不出 Host）。
window.__ModuleLoader__.load({
  id: 'dsh-balance',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    const API_PATH = '/api/dsh-balance'
    const REFRESH_MS = 60_000

    function BalanceReadout() {
      const [text, setText] = React.useState('…')

      const refresh = React.useCallback(async () => {
        try {
          const response = await fetch(API_PATH, { cache: 'no-store' })
          if (!response.ok) {
            setText('--')
            return
          }
          const body = await response.json()
          if (body && body.ok && Array.isArray(body.balance_infos) && body.balance_infos.length) {
            const b = body.balance_infos[0]
            const n = Number(b.total_balance)
            const num = Number.isFinite(n) ? n.toFixed(2) : String(b.total_balance)
            setText(b.currency === 'CNY' ? '¥' + num : b.currency + ' ' + num)
          } else {
            setText('--')
          }
        } catch {
          setText('--')
        }
      }, [])

      React.useEffect(() => {
        refresh()
        const timer = setInterval(() => { refresh() }, REFRESH_MS)
        return () => clearInterval(timer)
      }, [refresh])

      return React.createElement('span', {
        onClick: refresh,
        title: 'DeepSeek 余额（点击刷新）',
        style: {
          cursor: 'pointer',
          color: 'var(--dsw-alias-label-tertiary)',
          fontSize: '12px',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        },
      }, text)
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register(
        { name: 'conversation.input.right', id: 'dsh-balance', order: 0, label: () => '余额' },
        () => React.createElement(BalanceReadout, null)
      ))
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
