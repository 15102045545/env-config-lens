若用户没有显式的允许创建分支，则必须直接基于main分支开发提交推送，不要擅自创建codex分支

## 本地运行时约定

- 当前工程的日常本地服务必须交给 macOS 用户级 LaunchAgent 托管，服务标签为 `com.env-config-lens.local`。
- 不要把长期运行的项目服务挂在 Codex/agent 会话内，例如不要用会话内 `pnpm start`、`nohup` 或后台 `&` 作为日常启动方式；这些进程可能随会话结束而退出。
- LaunchAgent plist 安装位置为 `~/Library/LaunchAgents/com.env-config-lens.local.plist`，工作目录为 `/Users/chongwen002/project/env-config-lens`。
- 检查服务状态使用 `launchctl print gui/$(id -u)/com.env-config-lens.local`；重启使用 `launchctl kickstart -k gui/$(id -u)/com.env-config-lens.local`。
- LaunchAgent 入口脚本为 `scripts/runLaunchAgentService.sh`；每次服务启动都会覆盖写入最新启动日志。
- 访问 URL 和启动令牌从 `.local/logs/env-config-lens.launchd.out.log` 读取；错误日志在 `.local/logs/env-config-lens.launchd.err.log`。
- 修改前端后，需要先构建 `dist/client`，再重启 LaunchAgent。
