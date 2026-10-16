# dsh-plugins

DeepSeek Harness（dsh）插件合集。由原先独立仓库合并而来，每个插件仍是可单独安装的子目录。

## 插件

| 目录 | 说明 |
|------|------|
| [`dsh-balance`](./dsh-balance/) | 输入框工具行右侧显示 DeepSeek 账户余额（点击刷新，60 秒自动更新） |
| [`dsh-mcp-status`](./dsh-mcp-status/) | 左下角 MCP 状态徽章；按工作区 cwd 挂载 `.mcp.json` |
| [`dsh-version`](./dsh-version/) | 左下角显示 dsh 版本；有新版本 / 插件可更新时提示 |

## 安装

各子目录仍是独立插件（含 `dsh.plugin.json` / `package.json`）。按各子目录 README 或 dshmarket 方式安装即可。

## 来源

2026-10-16 将以下仓库用 `git subtree` 合并进本仓（历史保留），原仓已归档：

- dannyvan/dsh-balance
- dannyvan/dsh-file-drop
- dannyvan/dsh-mcp-status
- dannyvan/dsh-version

2026-10-16 移除 `dsh-file-drop`（依赖已删除的 dsh-desktop 桌面壳），历史仍可在 git log 中找到。
