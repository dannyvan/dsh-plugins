// dsh-mcp-status · Client half（DSH web __ModuleLoader__ 格式，纯 DOM，零构建）
// 左下角设置按钮那一排加「MCP ×N」徽章，点击弹出服务器列表弹窗：
// - 每行标题为「项目名 · 原键」（同目录多会话再附短标签）+ 状态点 + 工具数 + 传输方式 + 端点摘要
// - 打开弹窗时自动重拉；MCP 握手未完成时后台再试几次；弹窗内「刷新」仍可手点
// - checkedAt 按北京时间展示（API 仍是 UTC ISO）
// - 与 dsh-version 徽章（.dshv-badge）自动错开排列，不重叠
// - 侧边栏收起成窄栏时自动隐藏
// 数据来自 Host 路由 GET /api/dsh-mcp-status（运行时注册表，不含凭证）。
window.__ModuleLoader__.load({
  id: 'dsh-mcp-status',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const API_PATH = '/api/dsh-mcp-status'
    const ROW_SELECTOR = '[class*="_settingsArea"]'
    const RAIL_WIDTH_PX = 100
    const POP_W = 360
    const SETTLE_DELAYS_MS = [500, 1000, 2000, 3000, 5000]

    /** API 的 checkedAt 是 UTC ISO；展示转北京时间并标注。 */
    function formatCheckedAt(iso) {
      if (typeof iso !== 'string' || iso.length === 0) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000)
      return '更新于 ' + bj.toISOString().slice(0, 19).replace('T', ' ') + '（北京时间）'
    }

    function sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    }

    function serversPending(data) {
      const servers = data && Array.isArray(data.servers) ? data.servers : []
      return servers.length === 0 || servers.some((s) => s.online !== true)
    }

    const CSS = `
      .dshm-badge {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        min-width: 0;
        box-sizing: border-box;
        color: var(--dsw-alias-label-tertiary, #888888);
        background: color-mix(in srgb, var(--dsw-alias-bg-base, #ffffff) 88%, transparent);
        border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3));
        border-radius: 999px;
        box-shadow: 0 1px 3px rgba(0,0,0,.15);
        font-size: 12px;
        line-height: 16px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        padding: 3px 9px;
        transition: color .15s ease, opacity .15s ease, border-color .15s ease, background .15s ease;
      }
      .dshm-badge:hover { color: var(--dsw-alias-label-secondary, #666666); }
      .dshm-badge.dshm-checking { opacity: .7; cursor: progress; }
      .dshm-badge.dshm-offline {
        color: var(--dsw-alias-state-warn-label, #e8a33d);
        font-weight: 500;
      }

      .dshm-pop {
        position: fixed;
        z-index: 20000;
        width: ${POP_W}px;
        max-width: calc(100vw - 16px);
        box-sizing: border-box;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
        background: var(--dsw-alias-bg-base, #ffffff);
        color: var(--dsw-alias-label-primary, #222222);
        box-shadow: 0 8px 28px rgba(0,0,0,.28);
        font-size: 13px;
        line-height: 20px;
        max-height: 72vh;
        overflow-y: auto;
      }
      .dshm-pop-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .dshm-pop-close {
        flex: none;
        width: 22px;
        height: 22px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-tertiary, #888888);
        cursor: pointer;
        font-size: 14px;
        line-height: 22px;
        padding: 0;
      }
      .dshm-pop-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15)); }
      .dshm-pop-sub { color: var(--dsw-alias-label-secondary, #555555); margin-bottom: 8px; }
      .dshm-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 6px 2px;
        font-size: 12px;
        line-height: 18px;
        min-width: 0;
      }
      .dshm-dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: 5px;
        background: #9aa0a6;
      }
      .dshm-dot.dshm-on { background: var(--dsw-alias-state-success, #2eb872); }
      .dshm-row-main { min-width: 0; flex: 1; }
      .dshm-row-name {
        font-weight: 600;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dshm-row-meta {
        color: var(--dsw-alias-label-tertiary, #888888);
        font-size: 11px;
        line-height: 16px;
        word-break: break-all;
      }
      .dshm-row-count {
        flex: none;
        color: var(--dsw-alias-label-secondary, #555555);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        margin-top: 1px;
      }
      .dshm-empty { color: var(--dsw-alias-label-tertiary, #888888); padding: 6px 2px; }
      .dshm-pop-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 10px;
      }
      .dshm-pop-btn {
        border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
        background: transparent;
        color: var(--dsw-alias-label-primary, #222222);
        border-radius: 8px;
        padding: 5px 12px;
        font-size: 12px;
        line-height: 16px;
        cursor: pointer;
      }
      .dshm-pop-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
      .dshm-pop-time { color: var(--dsw-alias-label-tertiary, #888888); font-size: 11px; }
    `

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-mcp-status'
        style.textContent = CSS
        document.head.appendChild(style)

        const badge = document.createElement('span')
        badge.className = 'dshm-badge dshm-checking'
        badge.textContent = 'MCP …'
        badge.title = 'MCP 连接状态 · 点击查看'

        let disposed = false
        let rowEl = null
        let rowObserver = null
        let sizeObserver = null
        let versionObserver = null
        let pop = null
        let popHandlers = null
        let payload = null

        function closePopover() {
          if (pop !== null) {
            pop.remove()
            pop = null
          }
          if (popHandlers !== null) {
            document.removeEventListener('pointerdown', popHandlers.onDown, true)
            document.removeEventListener('keydown', popHandlers.onKey, true)
            popHandlers = null
          }
        }

        function renderBadge() {
          if (disposed) return
          const servers = payload && Array.isArray(payload.servers) ? payload.servers : []
          const total = servers.length
          const offline = servers.filter((s) => s.online !== true).length
          badge.textContent = 'MCP ×' + total
          if (offline > 0) {
            badge.className = 'dshm-badge dshm-offline'
            badge.title = 'MCP 状态 · ' + offline + ' 个未连接（共 ' + total + ' 个）· 点击查看'
          } else {
            badge.className = 'dshm-badge'
            badge.title = 'MCP 状态 · ' + total + ' 个已连接 · 点击查看'
          }
        }

        function buildPop() {
          const popEl = document.createElement('div')
          popEl.className = 'dshm-pop'

          const titleRow = document.createElement('div')
          titleRow.className = 'dshm-pop-title'
          const title = document.createElement('span')
          const servers = payload && Array.isArray(payload.servers) ? payload.servers : []
          title.textContent = 'MCP 服务器（' + servers.length + '）'
          const closeBtn = document.createElement('button')
          closeBtn.className = 'dshm-pop-close'
          closeBtn.textContent = '✕'
          closeBtn.title = '关闭'
          closeBtn.onclick = closePopover
          titleRow.append(title, closeBtn)
          popEl.append(titleRow)

          const sub = document.createElement('div')
          sub.className = 'dshm-pop-sub'
          sub.textContent = '点击徽章查看状态 · 数据来自运行时注册表（不含凭证）'
          popEl.append(sub)

          if (servers.length === 0) {
            const empty = document.createElement('div')
            empty.className = 'dshm-empty'
            empty.textContent = '没有加载任何 MCP server。'
            popEl.append(empty)
          } else {
            for (const server of servers) {
              const row = document.createElement('div')
              row.className = 'dshm-row'

              const dot = document.createElement('span')
              dot.className = 'dshm-dot' + (server.online === true ? ' dshm-on' : '')
              dot.title = server.online === true ? '在线' : '未连接'

              const main = document.createElement('div')
              main.className = 'dshm-row-main'
              const nameEl = document.createElement('div')
              nameEl.className = 'dshm-row-name'
              const label = typeof server.displayName === 'string' && server.displayName.length > 0
                ? server.displayName
                : (server.serverName || '(未命名)')
              nameEl.textContent = label
              const hint = []
              if (typeof server.cwd === 'string' && server.cwd.length > 0) hint.push(server.cwd)
              if (typeof server.serverName === 'string' && server.serverName.length > 0) hint.push(server.serverName)
              nameEl.title = hint.join('\n')
              const meta = document.createElement('div')
              meta.className = 'dshm-row-meta'
              const bits = []
              if (typeof server.transport === 'string') bits.push(server.transport)
              if (typeof server.endpoint === 'string' && server.endpoint.length > 0) bits.push(server.endpoint)
              meta.textContent = bits.join(' · ')
              main.append(nameEl, meta)

              const count = document.createElement('div')
              count.className = 'dshm-row-count'
              const n = typeof server.toolCount === 'number' ? server.toolCount : 0
              count.textContent = server.online === true ? n + ' 个工具' : '未连接'
              count.title = server.online === true ? n + ' 个工具已注册' : '无已注册工具（连接失败 / 重试中 / 隧道未通）'

              row.append(dot, main, count)
              popEl.append(row)
            }
          }

          const foot = document.createElement('div')
          foot.className = 'dshm-pop-foot'
          const refreshBtn = document.createElement('button')
          refreshBtn.className = 'dshm-pop-btn'
          refreshBtn.textContent = '刷新'
          refreshBtn.onclick = async () => {
            refreshBtn.textContent = '刷新中…'
            await refresh()
            refreshBtn.textContent = '刷新'
            // 弹窗内容整体重建（buildPop 后重新定位由 openPopover 逻辑接管）
            if (pop !== null) openPopover()
          }
          const time = document.createElement('span')
          time.className = 'dshm-pop-time'
          time.textContent = formatCheckedAt(payload && payload.checkedAt)
          foot.append(refreshBtn, time)
          popEl.append(foot)

          return popEl
        }

        function openPopover() {
          closePopover()
          const popEl = buildPop()
          document.body.appendChild(popEl)
          pop = popEl

          // 定位：徽章上方/下方，视口内夹紧
          const badgeRect = badge.getBoundingClientRect()
          popEl.style.left = Math.max(8, Math.min(badgeRect.right - POP_W, window.innerWidth - POP_W - 8)) + 'px'
          const below = badgeRect.top - popEl.offsetHeight - 8
          popEl.style.top = (below >= 8 ? below : badgeRect.bottom + 8) + 'px'

          const onDown = (event) => {
            if (pop !== null && !pop.contains(event.target) && event.target !== badge) closePopover()
          }
          const onKey = (event) => {
            if (event.key === 'Escape') closePopover()
          }
          document.addEventListener('pointerdown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          popHandlers = { onDown, onKey }

          window.addEventListener('resize', () => {
            if (pop !== null) {
              const r = badge.getBoundingClientRect()
              pop.style.left = Math.max(8, Math.min(r.right - POP_W, window.innerWidth - POP_W - 8)) + 'px'
            }
          })
        }

        async function refresh(opts) {
          if (disposed) return
          const silent = opts !== null && opts !== undefined && opts.silent === true
          if (!silent) {
            badge.className = 'dshm-badge dshm-checking'
            badge.textContent = 'MCP …'
          }
          try {
            const res = await fetch(API_PATH, { cache: 'no-store' })
            const body = res.ok ? await res.json() : null
            payload = body && body.ok === true ? body : null
          } catch {
            payload = null
          }
          renderBadge()
        }

        async function refreshUntilSettled() {
          await refresh()
          for (const ms of SETTLE_DELAYS_MS) {
            if (disposed || !serversPending(payload)) return
            await sleep(ms)
            if (disposed) return
            await refresh({ silent: true })
          }
        }

        // ---- 与 dsh-version 徽章错开：MCP 徽章放在其左侧 ----

        function versionBadgeWidth() {
          const el = rowEl === null ? null : rowEl.querySelector('[class*="dshv-badge"]')
          if (el === null || el.style.display === 'none') return 0
          const rect = el.getBoundingClientRect()
          return rect.width
        }

        function applyBadgePosition() {
          if (rowEl === null) return
          rowEl.style.position = 'relative'
          const pad = versionBadgeWidth() + 8
          badge.style.right = (12 + pad) + 'px'
        }

        function clearRowStyles() {
          if (rowEl === null) return
          rowEl.style.position = ''
          if (badge.style.right !== '') badge.style.right = ''
        }

        function syncVisibility() {
          if (rowEl === null) return
          const narrow = rowEl.getBoundingClientRect().width < RAIL_WIDTH_PX
          if (narrow) {
            badge.style.display = 'none'
            clearRowStyles()
          } else {
            badge.style.display = ''
            applyBadgePosition()
          }
        }

        function mount() {
          const el = document.querySelector(ROW_SELECTOR)
          if (el === null || el === rowEl) return
          rowEl = el
          rowEl.appendChild(badge)
          applyBadgePosition()

          if (rowObserver !== null) rowObserver.disconnect()
          rowObserver = new MutationObserver(() => {
            // React 重渲染可能移走外挂节点，移走就重新挂回
            if (badge.parentNode !== rowEl) rowEl.appendChild(badge)
          })
          rowObserver.observe(el, { childList: true })

          if (sizeObserver !== null) sizeObserver.disconnect()
          sizeObserver = new ResizeObserver(syncVisibility)
          sizeObserver.observe(el)

          // dsh-version 徽章宽度变化（如「新版本 vX」文字变宽）时重新错开
          if (versionObserver !== null) versionObserver.disconnect()
          versionObserver = new ResizeObserver(() => { applyBadgePosition() })
          const vb = el.querySelector('[class*="dshv-badge"]')
          if (vb !== null) versionObserver.observe(vb)

          syncVisibility()
        }

        badge.onclick = async (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (pop !== null) {
            closePopover()
            return
          }
          await refresh()
          if (!disposed) openPopover()
        }

        // 侧边栏异步渲染，等 DOM 出现后再挂载
        const bodyObserver = new MutationObserver(() => { mount() })
        bodyObserver.observe(document.body, { childList: true, subtree: true })
        mount()

        refreshUntilSettled()

        return () => {
          disposed = true
          if (rowObserver !== null) rowObserver.disconnect()
          if (sizeObserver !== null) sizeObserver.disconnect()
          if (versionObserver !== null) versionObserver.disconnect()
          bodyObserver.disconnect()
          closePopover()
          badge.remove()
          style.remove()
          clearRowStyles()
        }
      }, 'dsh-mcp-status: badge')
    }

    exports.inject = []
    exports.apply = apply
    return module.exports
  },
})
