// dsh-version · Client half（DSH web __ModuleLoader__ 格式，纯 DOM，零构建）
// 版本徽章放在左侧边栏底部「设置按钮那一排」的最右侧（胶囊样式，悬停不触发按钮）：
// - 平时显示 dsh vX.Y.Z，点击手动重查
// - npm 有新版本时高亮为「新版本 vX.Y.Z」，点击弹出升级说明卡片（含可复制命令）
// - 已安装插件（dshmarket 管理的 registry 依赖）有新版本时，高亮为「N 个插件可更新」，
//   点击弹出插件更新列表（含 pnpm add 命令）；harness 与插件都有更新时弹窗两者都列
// - 侧边栏收起成窄栏时自动隐藏
// - 预览：URL 加 ?dshv-demo=1 模拟「harness + 插件都有更新」，?dshv-demo=plugins 只模拟插件更新
// 数据来自 Host 路由 GET /api/dsh-version + dshmarket GET /dsh-market/updates（npm 检查均在 Host 侧，30 分钟缓存）。
window.__ModuleLoader__.load({
  id: 'dsh-version',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const API_PATH = '/api/dsh-version'
    // dshmarket 的已安装插件更新检测接口（同一 origin，Host 侧 30 分钟缓存；未装 dshmarket 时优雅降级）
    const MARKET_UPDATES_PATH = '/dsh-market/updates'
    const REFRESH_MS = 30 * 60 * 1000
    const RELEASES_URL = 'https://github.com/deepseek-ai/deepseek-harness/releases'
    // 设置按钮所在容器（sidebar.settings 的渲染容器，类名带 _settingsArea 后缀）
    const ROW_SELECTOR = '[class*="_settingsArea"]'
    // 窄于该宽度视为收起（rail 模式），隐藏徽章
    const RAIL_WIDTH_PX = 100
    // 升级卡宽度
    const POP_W = 348

    const CSS = `
      .dshv-badge {
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
        font-size: 13px;
        line-height: 18px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        cursor: pointer;
        user-select: none;
        padding: 3px 10px;
        transition: color .15s ease, opacity .15s ease, border-color .15s ease, background .15s ease;
      }
      .dshv-badge:hover { color: var(--dsw-alias-label-secondary, #666666); }
      .dshv-badge.dshv-checking { opacity: .7; cursor: progress; }
      .dshv-badge.dshv-update {
        color: var(--dsw-alias-state-business-primary, #4f7cff);
        font-weight: 500;
      }
      .dshv-badge.dshv-update:hover { color: var(--dsw-alias-state-business-primary, #4f7cff); }
      .dshv-badge.dshv-plugin-update {
        color: var(--dsw-alias-state-warn-label, #e8a33d);
        font-weight: 500;
      }
      .dshv-badge.dshv-plugin-update:hover { color: var(--dsw-alias-state-warn-label, #e8a33d); }

      .dshv-pop {
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
      .dshv-pop-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .dshv-pop-close {
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
      .dshv-pop-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.15)); }
      .dshv-pop-sub { color: var(--dsw-alias-label-secondary, #555555); margin-bottom: 8px; }
      .dshv-pop-hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.25)); margin: 8px 0; }
      .dshv-pop-step { color: var(--dsw-alias-label-secondary, #555555); margin: 2px 0 4px; }
      .dshv-pop-cmd {
        display: block;
        margin: 0 0 6px;
        padding: 6px 8px;
        border-radius: 6px;
        background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12));
        color: var(--dsw-alias-label-primary, #222222);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 18px;
        white-space: pre-wrap;
        word-break: break-all;
        user-select: text;
      }
      .dshv-pop-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
      .dshv-pop-btn {
        border: 1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35));
        background: transparent;
        color: var(--dsw-alias-label-primary, #222222);
        border-radius: 8px;
        padding: 5px 12px;
        font-size: 12px;
        line-height: 16px;
        cursor: pointer;
      }
      .dshv-pop-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
      .dshv-pop-link {
        color: var(--dsw-alias-state-business-primary, #4f7cff);
        text-decoration: none;
        font-size: 12px;
        margin-left: auto;
      }
      .dshv-pop-link:hover { text-decoration: underline; }
      .dshv-pop-root { color: var(--dsw-alias-label-tertiary, #888888); font-size: 11px; margin-top: 6px; word-break: break-all; }
      .dshv-plugin-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 2px;
        font-size: 12px;
        line-height: 18px;
        min-width: 0;
      }
      .dshv-plugin-name {
        font-weight: 600;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .dshv-plugin-ver {
        margin-left: auto;
        flex: none;
        color: var(--dsw-alias-label-secondary, #555555);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .dshv-pop-hint { color: var(--dsw-alias-label-tertiary, #888888); font-size: 11px; }
    `

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-version'
        style.textContent = CSS
        document.head.appendChild(style)

        const badge = document.createElement('span')
        badge.className = 'dshv-badge dshv-checking'
        badge.textContent = '…'
        badge.title = 'DeepSeek Harness 版本 · 点击检查更新'

        let timer = null
        let disposed = false
        let rowEl = null
        let rowObserver = null
        let sizeObserver = null
        let pop = null
        let popHandlers = null

        // ---- 升级说明卡片 ----

        function escapeSed(v) {
          return v.replace(/[.\\/]/g, (c) => '\\' + c)
        }

        function buildCommands(payload) {
          const current = payload.current
          const latest = payload.latest
          const profile = payload.profileDir || '~/.dsh/profiles/<你的profile名>'
          return [
            '# DeepSeek Harness 升级：' + current + ' → ' + latest,
            'npm install -g @deepseek-ai/dsh@latest',
            'cd ' + profile,
            "sed -i '' 's/" + escapeSed(current) + '/' + latest + "/g' package.json",
            'pnpm install',
            '# 最后重启 dsh web 生效（dshmarket 插件页 → 重启）',
          ].join('\n')
        }

        function buildPluginCommands(payload) {
          const profile = payload.profileDir || '~/.dsh/profiles/<你的profile名>'
          const names = (payload.pluginUpdates ?? []).map((p) => p.name + '@latest').join(' ')
          return [
            '# DeepSeek Harness 插件更新（' + payload.pluginUpdates.length + ' 个）',
            'cd ' + profile,
            'pnpm add ' + names,
            '# 更新后重启 dsh web 生效（dshmarket 插件页 → 重启）',
          ].join('\n')
        }

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

        function openPopover(payload) {
          closePopover()
          const current = payload.current
          const latest = payload.latest
          const harnessUpdate = payload.updateAvailable === true && typeof latest === 'string'
          const plugins = Array.isArray(payload.pluginUpdates) ? payload.pluginUpdates : []

          const popEl = document.createElement('div')
          popEl.className = 'dshv-pop'

          const titleRow = document.createElement('div')
          titleRow.className = 'dshv-pop-title'
          const title = document.createElement('span')
          title.textContent = harnessUpdate
            ? 'DeepSeek Harness 有新版本 ' + latest
            : plugins.length + ' 个插件可更新'
          const closeBtn = document.createElement('button')
          closeBtn.className = 'dshv-pop-close'
          closeBtn.textContent = '✕'
          closeBtn.title = '关闭'
          titleRow.append(title, closeBtn)
          popEl.append(titleRow)

          // ---- harness 段（仅当 harness 有更新）----
          if (harnessUpdate) {
            const sub = document.createElement('div')
            sub.className = 'dshv-pop-sub'
            sub.textContent = '当前 v' + current

            const hr1 = document.createElement('hr')
            hr1.className = 'dshv-pop-hr'

            const step1 = document.createElement('div')
            step1.className = 'dshv-pop-step'
            step1.textContent = '1) 升级全局 CLI：'
            const cmd1 = document.createElement('code')
            cmd1.className = 'dshv-pop-cmd'
            cmd1.textContent = 'npm install -g @deepseek-ai/dsh@latest'

            const step2 = document.createElement('div')
            step2.className = 'dshv-pop-step'
            step2.textContent = '2) 同步 profile 依赖版本（升级钉住版本 + pnpm install）：'
            const cmd2 = document.createElement('code')
            cmd2.className = 'dshv-pop-cmd'
            cmd2.textContent = (payload.profileDir
              ? 'cd ' + payload.profileDir + '\n'
              : 'cd ~/.dsh/profiles/<你的profile名>\n')
              + "sed -i '' 's/" + escapeSed(current) + '/' + latest + "/g' package.json\n"
              + 'pnpm install'

            const step3 = document.createElement('div')
            step3.className = 'dshv-pop-step'
            step3.textContent = '3) 重启生效：'
            const cmd3 = document.createElement('code')
            cmd3.className = 'dshv-pop-cmd'
            cmd3.textContent = '在 dshmarket 插件页点「重启」，或重新运行 dsh web'

            popEl.append(sub, hr1, step1, cmd1, step2, cmd2, step3, cmd3)
          }

          // ---- 插件段（有插件更新时）----
          if (plugins.length > 0) {
            const hr = document.createElement('hr')
            hr.className = 'dshv-pop-hr'
            popEl.append(hr)

            const head = document.createElement('div')
            head.className = 'dshv-pop-sub'
            head.textContent = harnessUpdate ? '已安装插件也有更新：' : '以下插件有新版本：'
            popEl.append(head)

            for (const p of plugins) {
              const row = document.createElement('div')
              row.className = 'dshv-plugin-row'
              const nm = document.createElement('span')
              nm.className = 'dshv-plugin-name'
              nm.textContent = p.name
              nm.title = p.name
              const ver = document.createElement('span')
              ver.className = 'dshv-plugin-ver'
              ver.textContent = 'v' + (typeof p.current === 'string' ? p.current : '?') + ' → v' + p.latest
              row.append(nm, ver)
              popEl.append(row)
            }

            const pfoot = document.createElement('div')
            pfoot.className = 'dshv-pop-foot'
            const copyBtn = document.createElement('button')
            copyBtn.className = 'dshv-pop-btn'
            copyBtn.textContent = '复制更新命令'
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(buildPluginCommands(payload))
                copyBtn.textContent = '已复制 ✓'
                setTimeout(() => { copyBtn.textContent = '复制更新命令' }, 1600)
              } catch {
                copyBtn.textContent = '复制失败'
              }
            }
            const restartHint = document.createElement('span')
            restartHint.className = 'dshv-pop-hint'
            restartHint.textContent = '更新后需在 dshmarket 插件页重启生效'
            pfoot.append(copyBtn, restartHint)
            popEl.append(pfoot)
          }

          // ---- harness 段尾部（升级命令复制 + Releases 跳转 + 安装位置）----
          if (harnessUpdate) {
            const hr2 = document.createElement('hr')
            hr2.className = 'dshv-pop-hr'

            const foot = document.createElement('div')
            foot.className = 'dshv-pop-foot'
            const copyBtn = document.createElement('button')
            copyBtn.className = 'dshv-pop-btn'
            copyBtn.textContent = '复制全部命令'
            copyBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(buildCommands(payload))
                copyBtn.textContent = '已复制 ✓'
                setTimeout(() => { copyBtn.textContent = '复制全部命令' }, 1600)
              } catch {
                copyBtn.textContent = '复制失败'
              }
            }
            const link = document.createElement('a')
            link.className = 'dshv-pop-link'
            link.textContent = '查看更新内容 ↗'
            link.href = RELEASES_URL
            link.target = '_blank'
            link.rel = 'noopener'
            foot.append(copyBtn, link)

            const rootInfo = document.createElement('div')
            rootInfo.className = 'dshv-pop-root'
            rootInfo.textContent = 'CLI 安装位置：' + (payload.installRoot || '未知')

            popEl.append(hr2, foot, rootInfo)
          }

          document.body.appendChild(popEl)
          pop = popEl

          // 定位：徽章上方，视口内夹紧
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
          closeBtn.onclick = closePopover
          window.addEventListener('resize', () => {
            if (pop !== null) {
              const r = badge.getBoundingClientRect()
              pop.style.left = Math.max(8, Math.min(r.right - POP_W, window.innerWidth - POP_W - 8)) + 'px'
            }
          })
        }

        // ---- 徽章状态渲染 ----

        function render(payload) {
          if (disposed) return
          const current = payload && typeof payload.current === 'string' ? payload.current : null
          const label = current === null ? 'v--' : 'v' + current
          const update = payload && payload.updateAvailable === true
          const latest = update && payload && typeof payload.latest === 'string' ? payload.latest : null
          const plugins = payload && Array.isArray(payload.pluginUpdates) ? payload.pluginUpdates : []
          // harness 更新优先（蓝色）；插件更新其次（琥珀色）；都无则普通状态
          if (update && latest !== null) {
            badge.className = 'dshv-badge dshv-update'
            badge.textContent = '新版本 ' + latest
            badge.title = 'DeepSeek Harness 有新版本 ' + latest + '（当前 ' + (current ?? '?') + '）'
              + (plugins.length > 0 ? ' · 另有 ' + plugins.length + ' 个插件可更新' : '') + ' · 点击查看'
            badge.onclick = (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (pop !== null) closePopover()
              else openPopover(payload)
            }
            return
          }
          if (plugins.length > 0) {
            badge.className = 'dshv-badge dshv-plugin-update'
            badge.textContent = plugins.length + ' 个插件可更新'
            badge.title = '有 ' + plugins.length + ' 个已安装插件可更新 · 点击查看详情'
            badge.onclick = (event) => {
              event.preventDefault()
              event.stopPropagation()
              if (pop !== null) closePopover()
              else openPopover(payload)
            }
            return
          }
          closePopover()
          if (payload && payload.checkError) {
            badge.className = 'dshv-badge dshv-error'
            badge.textContent = label
            badge.title = 'DeepSeek Harness ' + (current ?? '版本未知') + ' · 版本检查失败，点击重试'
          } else {
            badge.className = 'dshv-badge'
            badge.textContent = label
            badge.title = 'DeepSeek Harness ' + (current ?? '版本未知') + ' · 点击检查更新'
          }
          badge.onclick = () => { refresh() }
        }

        async function refresh() {
          if (disposed) return
          badge.className = 'dshv-badge dshv-checking'
          badge.textContent = '…'
          const [harnessRes, marketRes] = await Promise.allSettled([
            fetch(API_PATH, { cache: 'no-store' }),
            fetch(MARKET_UPDATES_PATH, { cache: 'no-store' }),
          ])
          const payload = {}
          if (harnessRes.status === 'fulfilled' && harnessRes.value.ok) {
            try {
              const body = await harnessRes.value.json()
              if (body && body.ok) Object.assign(payload, body)
            } catch { /* harness 响应解析失败，仅保留插件部分 */ }
          }
          // 插件更新：复用 dshmarket 的 /dsh-market/updates（同一语义比较规则 + Host 侧 30 分钟缓存）。
          // dshmarket 未安装 / 接口失败时优雅降级，不影响 harness 徽章。
          let pluginUpdates = []
          if (marketRes.status === 'fulfilled' && marketRes.value.ok) {
            try {
              const body = await marketRes.value.json()
              const updates = body && typeof body.updates === 'object' ? body.updates : {}
              pluginUpdates = Object.entries(updates)
                .filter(([, u]) => u && u.updateAvailable === true && typeof u.latest === 'string')
                .map(([name, u]) => ({ name, current: typeof u.current === 'string' ? u.current : null, latest: u.latest }))
                .sort((a, b) => a.name.localeCompare(b.name))
            } catch { /* 忽略插件部分 */ }
          }
          payload.pluginUpdates = pluginUpdates
          render(payload.ok === true || pluginUpdates.length > 0 ? payload : null)
        }

        // ---- 挂载到「设置按钮所在行」的右上角（按钮本体全宽，角标向左延伸）----

        function applyRowStyles() {
          if (rowEl === null) return
          // 徽章绝对定位在行右上角，行需要成为定位上下文（角标贴按钮右上角）
          rowEl.style.position = 'relative'
        }

        function clearRowStyles() {
          if (rowEl === null) return
          rowEl.style.position = ''
        }

        function syncVisibility() {
          if (rowEl === null) return
          const narrow = rowEl.getBoundingClientRect().width < RAIL_WIDTH_PX
          if (narrow) {
            badge.style.display = 'none'
            clearRowStyles()
          } else {
            badge.style.display = ''
            applyRowStyles()
          }
        }

        /** 把徽章挂到设置按钮所在行（React 可能重渲染，幂等实现）。 */
        function attachBadge() {
          if (rowEl === null) return
          rowEl.appendChild(badge)
          applyRowStyles()
        }

        function mount() {
          const el = document.querySelector(ROW_SELECTOR)
          if (el === null || el === rowEl) return
          rowEl = el
          attachBadge()
          if (rowObserver !== null) rowObserver.disconnect()
          rowObserver = new MutationObserver(() => {
            // React 重渲染可能移走外挂节点，移走就重新挂回
            if (badge.parentNode !== rowEl) rowEl.appendChild(badge)
          })
          rowObserver.observe(el, { childList: true })
          if (sizeObserver !== null) sizeObserver.disconnect()
          sizeObserver = new ResizeObserver(syncVisibility)
          sizeObserver.observe(el)
          syncVisibility()
        }

        // 侧边栏异步渲染，等 DOM 出现后再挂载（body 级观察足够廉价）
        const bodyObserver = new MutationObserver(() => { mount() })
        bodyObserver.observe(document.body, { childList: true, subtree: true })
        mount()

        // 预览钩子：?dshv-demo=1 模拟「harness + 插件都有更新」，?dshv-demo=plugins 只模拟插件更新
        const demo = new URLSearchParams(location.search).get('dshv-demo')
        if (demo !== null) {
          const plugins = [
            { name: 'dsh-better-sidebar', current: '0.14.0', latest: '0.15.0' },
            { name: 'dshmarket', current: '1.17.1', latest: '1.18.0' },
          ]
          if (demo === 'plugins') {
            render({ ok: true, current: '0.1.1-rc.2', latest: '0.1.1-rc.2', updateAvailable: false, installRoot: '/path/to/dsh', profileDir: '~/.dsh/profiles/web', pluginUpdates: plugins })
          } else {
            render({ ok: true, current: '0.1.0-rc.7', latest: '0.1.0-rc.8', updateAvailable: true, installRoot: '/path/to/dsh', profileDir: '~/.dsh/profiles/web', pluginUpdates: plugins })
          }
        } else {
          refresh()
          timer = setInterval(() => { refresh() }, REFRESH_MS)
        }

        return () => {
          disposed = true
          if (timer !== null) clearInterval(timer)
          if (rowObserver !== null) rowObserver.disconnect()
          if (sizeObserver !== null) sizeObserver.disconnect()
          bodyObserver.disconnect()
          closePopover()
          badge.remove()
          style.remove()
          clearRowStyles()
        }
      }, 'dsh-version: badge')
    }

    exports.inject = []
    exports.apply = apply
    return module.exports
  },
})
