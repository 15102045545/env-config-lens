# macOS LaunchAgent Runtime

This workspace runs Env Config Lens as a macOS user LaunchAgent for day-to-day use. The service should not be kept alive by a Codex session, a transient terminal, `nohup`, or a shell background job.

## Service

- Label: `com.env-config-lens.local`
- Installed plist: `~/Library/LaunchAgents/com.env-config-lens.local.plist`
- Entrypoint script: `scripts/runLaunchAgentService.sh`
- Working directory: `/Users/chongwen002/project/env-config-lens`
- Port: `4173`
- Bind host: `0.0.0.0`
- Frontend build directory: `dist/client`
- stdout log: `.local/logs/env-config-lens.launchd.out.log`
- stderr log: `.local/logs/env-config-lens.launchd.err.log`

The startup URL includes a session token. Read the current URL from `.local/logs/env-config-lens.launchd.out.log` rather than hard-coding the token in tracked files. The entrypoint script truncates both launchd logs before every service start, so the log files show the latest runtime only.

## Common Operations

Check status:

```bash
launchctl print gui/$(id -u)/com.env-config-lens.local
```

Restart the running service:

```bash
launchctl kickstart -k gui/$(id -u)/com.env-config-lens.local
```

Reload the plist after changing it:

```bash
launchctl unload -w ~/Library/LaunchAgents/com.env-config-lens.local.plist
launchctl load -w ~/Library/LaunchAgents/com.env-config-lens.local.plist
launchctl kickstart -k gui/$(id -u)/com.env-config-lens.local
```

Rebuild after frontend changes:

```bash
pnpm exec vite build
launchctl kickstart -k gui/$(id -u)/com.env-config-lens.local
```

Verify from the macOS host:

```bash
curl -sS -I "http://127.0.0.1:4173/?token=<token-from-log>"
```

Codex sandbox networking may not be able to reach this host service even when launchd and `lsof` show it is running. If a sandbox-local `curl` fails, verify from the macOS host context before changing the service.
