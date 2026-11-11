---
"@code4x/cli": minor
---

单仓库/全栈新增 workspace 级 `.env` 支持（API 端口/日志、Web 代理与生产 API 地址），全栈 API 挂载 `/api/todos` 并打通 Web dev 代理与生产同源部署；Desktop 内嵌 Hono API（`app://./api/*`），打包后无需单独后端；新增 `--force` 强制覆盖任意已存在目标目录，交互模式对已存在目录提供覆盖确认。
