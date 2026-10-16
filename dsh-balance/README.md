# dsh-balance

DeepSeek Harness (dsh) Web 插件：在输入框工具行右侧显示 DeepSeek 账户余额。

## 效果

- 输入框工具行右侧显示当前余额：`¥86.20`
- 点击数字手动刷新
- 每 60 秒自动刷新
- API key 只在 Host 进程内读取使用，不会传到浏览器

## 安装

1. 克隆本仓库到本地任意位置，例如：

   ```bash
   git clone <repo-url> ~/Codes/github.com/dsh-balance
   ```

2. 在 dsh profile 的 `package.json` 里添加依赖（link 方式）：

   ```json
   {
     "dependencies": {
       "dsh-balance": "link:/绝对路径/dsh-balance"
     },
     "dsh": {
       "profile": {
         "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-balance"]
       }
     }
   }
   ```

3. 在 profile 目录运行 `pnpm install`
4. 重启 dsh，余额自动显示在输入框工具行右侧

## 配置

余额读取自 `~/.dsh/.credentials.yaml` 中的 `DEEPSEEK_API_KEY`，走官方接口：

```
GET https://api.deepseek.com/user/balance
```

60 秒内重复请求命中缓存，不重复调用上游接口。

## 文件结构

```
dsh-balance/
├── index.js            # Host 半：/api/dsh-balance 路由，读 key 调官方接口
├── client.js           # Client 半：输入框工具行右侧余额显示
├── cordis.patch.yml    # 组合插入补丁
├── dsh.plugin.json     # 插件元数据
└── package.json        # dsh.client 声明 + exports
```

## License

MIT
