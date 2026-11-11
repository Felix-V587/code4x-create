---
"@code4x/cli": minor
---

单仓库/全栈新增 workspace 级 `.env`：`API_PORT`（默认 3030）、`WEB_PORT`（默认 8088）、`LOG_LEVEL`、`API_DEV_PROXY`、`VITE_API_BASE_URL`；Web dev 端口/代理与 API 构建端口均由环境变量驱动。全栈 API 挂载 `/api/todos` 并打通 Web dev 代理与生产同源部署；Desktop 内嵌 Hono API（`app://./api/*`），打包后无需单独后端。新增 `--force` 强制覆盖任意已存在目标目录，交互模式对已存在目录提供覆盖确认；目标已存在且在 git 仓库内时，不再提供 `git init`，改为 Commit（可填提交信息）/ 新建并切换分支（可填分支名）/ 保持现状。
