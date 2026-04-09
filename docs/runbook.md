# Emotion Companion · 运维 Runbook

> 这份文档是**操作手册**，专注"现在出问题了我应该敲什么命令"。
> 概念性说明请看 `docs/architecture.md`。
>
> 所有命令默认在 VPS 上以 `root` 或带 `sudo` 执行。本项目的 systemd 服务名是 **`emotion-api`**，应用用户是 **`emotion`**，应用目录是 **`/home/emotion/emotion`**。

---

## 目录

1. [日志查看（最常用）](#一日志查看最常用)
2. [服务控制](#二服务控制)
3. [配置文件编辑](#三配置文件编辑)
4. [数据库操作](#四数据库操作)
5. [HTTPS 证书](#五https-证书)
6. [Nginx 操作](#六nginx-操作)
7. [系统资源监控](#七系统资源监控)
8. [代码更新部署](#八代码更新部署)
9. [常用 alias 配置](#九常用-alias-配置)
10. [故障处置 Playbook](#十故障处置-playbook)
11. [应急回滚](#十一应急回滚)

---

## 一、日志查看（最常用）

### ⭐ 实时跟踪 API 日志

```bash
# 主 API
sudo journalctl -u emotion-api -f

# Admin API
sudo journalctl -u emotion-admin-api -f

# 两个一起看
sudo journalctl -u emotion-api -u emotion-admin-api -f
```

- `-u emotion-api` 只看这个服务
- `-f` follow 模式（持续追加新日志）
- `Ctrl+C` 退出

### 看最近 N 行 + 持续跟踪

```bash
sudo journalctl -u emotion-api -n 50 -f
```

打开就能看到最近 50 行历史，然后开始 follow。**日常排查最常用这条**。

### 只看错误级别

```bash
sudo journalctl -u emotion-api -p err -f
```

`-p err` 只显示 error 及以上（只有真正报错时才有输出）。

### 看今天的全部日志

```bash
sudo journalctl -u emotion-api --since today
```

### 看最近 5 分钟

```bash
sudo journalctl -u emotion-api --since "5 min ago"
```

### 看某个时间段

```bash
sudo journalctl -u emotion-api \
  --since "2026-04-08 10:00" \
  --until "2026-04-08 12:00"
```

### 不分页直接全部输出（导出/搜索时用）

```bash
sudo journalctl -u emotion-api -n 200 --no-pager
```

### 配合 grep 过滤

```bash
# 找所有 error
sudo journalctl -u emotion-api -f | grep -i "error"

# 跟踪某个 request_id（找一次完整请求链）
sudo journalctl -u emotion-api -f | grep "<request_id>"

# 只看 chat 路径
sudo journalctl -u emotion-api -f | grep "/api/chat"

# 只看 AI 调用相关
sudo journalctl -u emotion-api -f | grep -i "anthropic\|openai\|ai"
```

### JSON 友好格式（Fastify pino 结构化日志）

后端用 pino 输出 JSON 一行一条。直接看比较累眼，可以用 `pino-pretty` 着色：

```bash
# 装一次（系统级）
sudo npm install -g pino-pretty

# 然后用:
sudo journalctl -u emotion-api -f -o cat | pino-pretty
```

`-o cat` 去掉 systemd 时间戳前缀，只保留 pino JSON 主体，喂给 pino-pretty 后会输出有缩进、有颜色的可读格式。

### 导出最近 1 天日志到文件

```bash
sudo journalctl -u emotion-api --since yesterday --no-pager > ~/emotion-api-$(date +%F).log
```

可以 scp 下载到本地慢慢看：
```powershell
# Windows 本地
scp root@<vps-ip>:~/emotion-api-*.log .
```

sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh
---

## 二、服务控制

### 启动 / 停止 / 重启

```bash
sudo systemctl start emotion-api      # 启动
sudo systemctl stop emotion-api       # 停止
sudo systemctl restart emotion-api    # 重启（平滑,~200ms 中断）
sudo systemctl reload emotion-api     # ❌ Node 不支持 SIGHUP 重载,这条不行
```

### 查看服务状态

```bash
sudo systemctl status emotion-api
```

输出关键字段：
- `Active: active (running)` ← 正常
- `Active: failed` ← 服务挂了
- `Active: activating (auto-restart)` ← systemd 在重试
- `Main PID:` ← 当前进程号

### 看进程是不是真的在跑

```bash
ps aux | grep emotion-api | grep -v grep
```

或者：
```bash
sudo ss -tlnp | grep 3000
```

应该看到 Node 进程在 127.0.0.1:3000 监听。

### 开机自启

```bash
sudo systemctl is-enabled emotion-api    # 查
sudo systemctl enable emotion-api        # 启用
sudo systemctl disable emotion-api       # 禁用
```

`bootstrap.sh` 已经默认 enable，正常情况不用动。

---

## 三、配置文件编辑

### 改环境变量

```bash
sudo nano /home/emotion/emotion/apps/api/.env
sudo systemctl restart emotion-api
```

⚠️ 改完**必须重启**才生效。Node 的 `--env-file` 只在启动时读一次。

### 改 systemd unit

```bash
sudo nano /etc/systemd/system/emotion-api.service
sudo systemctl daemon-reload         # 必须先 reload
sudo systemctl restart emotion-api
```

### 改 Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/emotion-api
sudo nginx -t                        # 语法检查
sudo systemctl reload nginx          # 平滑重载
```

⚠️ 一定要先 `nginx -t`，配置错的话 reload 会让 nginx 整个挂掉。

### 看当前 .env 实际值（不含密钥）

```bash
sudo cat /home/emotion/emotion/apps/api/.env | grep -v "^#" | grep -v "^$" | grep -v "SECRET\|KEY\|PASSWORD\|URL"
```

---

## 四、数据库操作

### 直接连数据库

```bash
sudo -u emotion psql "$(grep ^DATABASE_URL= /home/emotion/emotion/apps/api/.env | cut -d= -f2-)"
```

进入 psql 后常用命令：
```sql
\dt                          -- 列出所有表
\d users                     -- 看 users 表结构
\d sessions                  -- 看 sessions 表结构
SELECT count(*) FROM users;
SELECT count(*) FROM messages;
SELECT count(*) FROM messages WHERE created_at > now() - interval '1 day';
\q                           -- 退出
```

### 跑数据库迁移（拉新代码后必做）

```bash
sudo -u emotion -H bash -lc "cd /home/emotion/emotion && pnpm --filter @emotion/api run db:migrate"
```

输出应包含 `[migrate] done. applied N new migration(s).`，已应用过的会显示 `skip`。

### 看最近活跃用户数

```sql
SELECT count(DISTINCT user_id) AS active_24h
FROM messages
WHERE created_at > now() - interval '24 hours';
```

### 看最近的 critical 触发次数

```sql
SELECT created_at, content
FROM messages
WHERE risk_level = 'critical'
ORDER BY created_at DESC
LIMIT 20;
```

### 应急清理某个用户

⚠️ 谨慎，**不可逆**。

```sql
-- 完全删除某个 user 的所有数据(CASCADE 会自动清掉 sessions/messages/memory_*/recovery_*)
DELETE FROM users WHERE anonymous_id = '<某个 anonymous_id>';
```

---

## 五、HTTPS 证书

### 看证书状态 / 过期时间

```bash
sudo certbot certificates
```

应输出：
```
Certificate Name: api.botjive.net
  Domains: api.botjive.net
  Expiry Date: 2026-07-07 ...  (VALID: 89 days)
```

### 自动续期检查

```bash
sudo systemctl status certbot.timer
```

certbot 已配置每天检查两次自动续期，正常不用管。

### 强制续期（应急）

```bash
sudo certbot renew --force-renewal
```

### 重新申请证书（彻底重做）

```bash
sudo certbot --nginx -d api.botjive.net \
  --non-interactive --agree-tos --email chairsmu@gmail.com --redirect
```

---

## 六、Nginx 操作

### 启停

```bash
sudo systemctl status nginx
sudo systemctl restart nginx
sudo systemctl reload nginx          # 平滑,推荐
```

### 配置语法检查

```bash
sudo nginx -t
```

### 看 Nginx 日志

```bash
# 实时访问日志
sudo tail -f /var/log/nginx/access.log

# 实时错误日志
sudo tail -f /var/log/nginx/error.log

# 找 502/503/504
sudo grep -E " 50[234] " /var/log/nginx/access.log | tail -20
```

### 看哪些请求最多

```bash
sudo awk '{print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20
```

---

## 七、系统资源监控

### 一眼看完系统状态

```bash
free -h && df -h / && uptime
```

### 看内存（人类可读）

```bash
free -h
```

关键字段：
- `available` ← 真正可用内存（不是 free）
- `Swap` 用量 ← 如果常用 swap 说明 RAM 不够

### 看磁盘

```bash
df -h
```

`/` 分区用满会让服务挂、日志写不进，要警惕。

### 看 CPU 负载

```bash
uptime
# load average: 0.15, 0.20, 0.18  ← 三个数字分别是 1/5/15 分钟平均负载
```

负载 < CPU 核数 × 0.7 = 健康。

### 实时看进程

```bash
top -u emotion          # 只看 emotion 用户的进程
htop                    # 更友好的版本(先 sudo apt install htop)
```

### 看哪些端口在监听

```bash
sudo ss -tlnp
```

应该看到：
- `:22` (sshd)
- `:80` (nginx)
- `:443` (nginx)
- `127.0.0.1:3000` (node, emotion-api) ← **必须是 127.0.0.1 不能是 0.0.0.0**

### 看 Node 进程内存占用

```bash
ps aux | grep emotion-api | grep -v grep
```

第 6 列（RSS）是实际占用内存（KB）。Node + Fastify + 我们的依赖大约 100-200 MB。

### 给小内存 VPS 加 swap（OOM 救命）

```bash
sudo fallocate -l 1G /swap
sudo chmod 600 /swap
sudo mkswap /swap
sudo swapon /swap
echo '/swap none swap sw 0 0' | sudo tee -a /etc/fstab
free -h    # 确认 Swap 那一行有数字
```

---

## 八、代码更新部署

### 标准流程（推荐）

**本地（Windows）：**
```powershell
cd E:\ai\project\emotion\source
git add . && git commit -m "..." && git push origin main
```

**VPS（Linux）：**
```bash
sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh
```

`deploy.sh` 会自动：
1. `git pull`
2. `pnpm install --frozen-lockfile`
3. `pnpm --filter @emotion/api run typecheck`
4. `pnpm --filter @emotion/api run db:migrate`
5. `sudo systemctl restart emotion-api`
6. 自检 `/api/health`

### 手动一步一步

```bash
sudo su - emotion
cd ~/emotion
git pull
pnpm install --frozen-lockfile
pnpm --filter @emotion/api run typecheck
pnpm --filter @emotion/api run db:migrate
exit                                   # 回 root
sudo systemctl restart emotion-api
sudo journalctl -u emotion-api -n 30 --no-pager
```

### 强制刷新一切（脏环境救命）

```bash
sudo systemctl stop emotion-api

sudo su - emotion
cd ~/emotion
git fetch origin
git reset --hard origin/main           # ⚠️ 丢失本地未提交修改
rm -rf node_modules apps/api/dist apps/web/dist
pnpm install --frozen-lockfile
exit

sudo systemctl start emotion-api
```

---

## 九、常用 alias 配置

把这些加到 `~/.bashrc`，以后输入更短：

```bash
cat >> ~/.bashrc <<'EOF'

# === Emotion Companion 运维快捷命令 ===
alias logs-api='sudo journalctl -u emotion-api -n 50 -f'
alias logs-err='sudo journalctl -u emotion-api -p err -f'
alias logs-today='sudo journalctl -u emotion-api --since today --no-pager'

alias api-status='sudo systemctl status emotion-api'
alias api-restart='sudo systemctl restart emotion-api'
alias api-stop='sudo systemctl stop emotion-api'
alias api-start='sudo systemctl start emotion-api'

alias api-env='sudo nano /home/emotion/emotion/apps/api/.env'
alias api-deploy='sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh'
alias api-health='curl -s https://api.botjive.net/api/health | head -c 500; echo'
alias api-health-local='curl -s http://127.0.0.1:3000/api/health | head -c 500; echo'

alias nginx-test='sudo nginx -t'
alias nginx-reload='sudo systemctl reload nginx'
alias nginx-access='sudo tail -f /var/log/nginx/access.log'
alias nginx-error='sudo tail -f /var/log/nginx/error.log'

alias sys-mem='free -h'
alias sys-disk='df -h /'
alias sys-load='uptime'
EOF

source ~/.bashrc
```

之后这些命令都可以用：

| alias | 等价命令 |
|---|---|
| `logs-api` | 跟踪 API 实时日志 |
| `logs-err` | 只看 error 级别日志 |
| `logs-today` | 看今天所有日志 |
| `api-status` | 看服务状态 |
| `api-restart` | 重启 |
| `api-env` | 编辑 .env |
| `api-deploy` | 拉新代码 + 重启 + 自检 |
| `api-health` | curl 外网健康检查 |
| `api-health-local` | curl 本地健康检查 |
| `nginx-test` | nginx -t |
| `nginx-reload` | reload nginx |
| `nginx-access` | tail nginx access 日志 |
| `nginx-error` | tail nginx error 日志 |
| `sys-mem` | free -h |
| `sys-disk` | df -h |
| `sys-load` | uptime |

---

## 十、故障处置 Playbook

### 场景 A：浏览器报"登录失败"

```bash
# 1. API 起来没有
api-status
# 看 Active: 那一行

# 2. 健康检查
api-health-local
# 应返回 {"success":true,"data":{"status":"ok",...}}

# 3. 看实时日志,同时浏览器再试一次登录
logs-api
# 看是否有 /api/auth/login 的请求记录

# 4. 如果完全没看到 /api/auth/login 请求 → 问题在前端 → 不是 API 问题
#    如果看到了请求但 500 → 看具体错误堆栈
#    如果看到 4xx → 看 error 字段
```

### 场景 B：聊天发不出去消息

```bash
logs-api

# 浏览器发一条
# 应该看到:
#   chat/stream begin (orchestrator, Phase 2) {requestId: ..., sessionId: ..., userId: ...}
#   ...
#   chat/stream done

# 常见原因排查:
# 1. AI 502 / 超时 → grep "AI_REQUEST_FAILED\|AI_TIMEOUT"
# 2. DB 连不上 → grep "ECONNREFUSED\|database\|pool"
# 3. CORS 错误 → 看浏览器 DevTools Console,前端报 CORS
#    → 检查 .env 的 CORS_ORIGIN 是否严格等于前端域名
# 4. 401 → token 过期或前端 anonymous_id 出错 → 浏览器清 localStorage 重试
```

### 场景 C：Vercel 前端正常但后端 API 全部 502

```bash
# 1. nginx 起着没
sudo systemctl status nginx

# 2. node 起着没
api-status

# 3. node 在监听吗
sudo ss -tlnp | grep 3000

# 4. nginx error 日志
nginx-error
# 通常会看到 "connect() failed" 或 "no live upstreams"

# 5. 如果 node 死了 → api-restart
# 6. 如果 nginx 死了 → sudo systemctl restart nginx
```

### 场景 D：磁盘满了

```bash
sudo df -h /

# 找出最大的目录
sudo du -h --max-depth=1 / 2>/dev/null | sort -rh | head -20

# 常见占用源:
# 1. journald 日志:
sudo journalctl --disk-usage
# 清理:
sudo journalctl --vacuum-time=7d         # 只保留最近 7 天

# 2. nginx 日志:
sudo du -h /var/log/nginx/
# 清理(慎用):
sudo truncate -s 0 /var/log/nginx/access.log
sudo systemctl reload nginx              # 让 nginx 重新打开 fd

# 3. apt 缓存:
sudo apt clean

# 4. node_modules: (不要删,删了 deploy.sh 重装也行)
```

### 场景 E：服务无限重启

```bash
api-status
# 看 "Loaded" 行的 restart 次数

logs-api
# 看启动到崩溃的完整日志

# 常见原因:
# 1. .env 里某个必填字段没填或错了 → 改 .env → restart
# 2. API Key 失效（取决于 AI_PROVIDER：ANTHROPIC_API_KEY 或 OPENAI_API_KEY）→ 改 .env → restart
# 3. DATABASE_URL 不通 → 试 sudo -u emotion psql "$DATABASE_URL"
# 4. node_modules 损坏 → 走"强制刷新一切"流程
# 5. 代码里有 syntax error → 在本地 pnpm typecheck 过了再 push
```

### 场景 F：HTTPS 证书过期

```bash
sudo certbot certificates
# 看 Expiry Date

# 强制续期
sudo certbot renew --force-renewal

# 看 certbot.timer 是否正常
sudo systemctl status certbot.timer

# 如果 timer 挂了:
sudo systemctl restart certbot.timer
```

### 场景 G：被 DDoS / 被刷接口

```bash
# 1. 看哪些 IP 请求最多
sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -20

# 2. 临时封某个 IP
sudo ufw deny from <恶意 IP>

# 3. 看是否打到了限流
logs-api | grep "rate limit\|429"

# 4. 长期方案: 把 Cloudflare 改回橙云代理(开 proxy)
#    控制台 → DNS → api 那条 → 灰云改橙云
#    然后 SSL/TLS 改 Full (strict),Cache Level 改 Bypass
```

### 场景 H：日志看到「[tong-analysis] JSON parse failed, degrading to SAFE_DEFAULT」

```bash
logs-api | grep "tong-analysis"
```

含义与排查步骤：

- **rawLength 很小（< 500）+ rawPreview 文末是中文且显然没说完** → 模型 `finish_reason=length` 截断了。
  parser 已经有 `extractAnalysisFromTruncated` 抢救路径，会拿到一个 `confidence: 0.3` 的部分结果而非完全空白。
  如果用户反馈仍然完全没拿到内容，确认：
  1. `apps/api/src/orchestrator/index.ts` 调用 `runTongAnalysis` 没传死的 `maxTokens`（默认 4096，覆盖了 env 的 1024）
  2. 实际跑的 provider 没设服务端硬上限（DeepSeek / 通义都允许 4096）
  3. 是否值得把默认再调高到 6144 / 8192

- **rawLength 接近上限 + 整段是模型自说自话的文字而非 JSON** → prompt 没让模型听话。检查 `packages/skills/tong-analysis/src/prompt.ts` 是不是被改坏了，`buildTongAnalysisPrompt` 末尾是否还有「请严格输出 JSON」。

- **rawLength 是 0 / 极小** → AI provider 网络异常，应该已经先抛 `AI_REQUEST_FAILED`，去 grep 那个错误码。

### 场景 I：用户截图里出现 ◆◆◆ 乱码

`◆` 是字体渲染不出某个字符的兜底。**根因几乎一定在数据源头，不在传输**：

```bash
logs-api | grep -i "delta"
# 流式 delta 事件如果服务端日志里就是干净文字，问题在前端字体；
# 如果服务端日志里就是 ◆ 或 \uFFFD，问题在 AI 输出 / sanitizeText
```

- **新生成的消息有乱码** → 多半是 AI 输出了 emoji / 装饰符号。
  根治办法是在 prompt 层禁。已有的硬约束在：
  - `packages/skills/companion-response/src/prompt.ts`「【硬性输出约束】」段
  - `packages/skills/message-coach/src/prompt.ts` 铁律第 8 条
  如果新加了 skill，**记得把同样的约束加上**。
  
- **历史消息有乱码** → 旧 DB 数据已经写脏了。`sanitizeText` 只过滤 `U+FFFD` 与不可见控制字符，对已经存进来的字符不会回溯清洗。如有必要写一次性 SQL 修旧数据。

- **`apps/api/src/orchestrator/replay.ts` 的 `sanitizeText` 千万别加 emoji 范围正则**。历史教训：之前用 `[\u{1F300}-\u{1F9FF}]/gu` 误伤了相邻汉字，出现「所◆◆我就来了」式截断。emoji 一律放行，前端 Noto Sans SC 能渲染。

### 场景 J：刷新页面后历史会话里的富文本卡片消失

正常情况下不应该发生。卡片数据存在 `messages.structured_json._actionCard` 里，前端 `chatStore.hydrateFromDb` 加载时重建。排查：

```bash
sudo -u emotion psql "$(grep ^DATABASE_URL= ~/emotion/apps/api/.env | cut -d= -f2-)"
# 然后:
SELECT id, role, content, structured_json->'_actionCard' AS card
FROM messages
WHERE session_id = '<session-uuid>'
ORDER BY created_at ASC;
```

- `card` 全为 NULL → orchestrator 写入路径出问题，看 `apps/api/src/orchestrator/index.ts` 中 `pendingActions[0]` 包装 `_actionCard` 的那段
- `card` 有数据但前端不渲染 → 看 `apps/web/src/stores/chatStore.ts` 的 `hydrateFromDb` 是否在解析 `structured_json._actionCard`
- 仅 `plan_options` 卡片显示按钮不消失 → `isLastMessage` 标记没正确写入；hydrate 时按 `i === lastIndex` 才置 true

### 场景 K：分析 / 话术消息出现重复（卡片 + 上方一段同内容文字）

`analysis` / `coach` 模式应该走 `skipTextReplay = true` 路径，只渲染卡片不回放文字。如果用户截图里看到了一段重复的文字气泡，说明：

```bash
logs-api | grep "skipTextReplay\|analysis_result\|coach_result"
```

- 检查 `orchestrator/index.ts` 在 push `analysis_result` / `coach_result` 到 `pendingActions` 之后是否设置了 `skipTextReplay = true`
- 检查 Step 12 的 `if (!skipTextReplay)` 包裹是否还在
- DB 里 `messages.content` 应该是占位符 `[关系分析结果见上方卡片]` / `[话术建议见上方卡片]`，如果是完整正文，说明持久化分支也漏了 `skipTextReplay` 判断

---

## 十一、应急回滚

### 回滚到上一个 commit

```bash
sudo su - emotion
cd ~/emotion
git log --oneline -10              # 找到要回滚到的 commit hash
git reset --hard <commit-hash>
pnpm install --frozen-lockfile
pnpm --filter @emotion/api run db:migrate
exit
sudo systemctl restart emotion-api
api-health-local
```

### 临时关闭服务（排障期间）

```bash
sudo systemctl stop emotion-api
# 此时 https://api.botjive.net 会返回 502
# 修复后:
sudo systemctl start emotion-api
```

### 临时让 Nginx 返回维护页

创建一个简单维护页：
```bash
sudo bash -c 'cat > /var/www/html/maintenance.html <<EOF
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>维护中</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px">
<h1>系统升级中</h1>
<p>预计 10 分钟内恢复,感谢理解</p>
</body></html>
EOF'
```

修改 Nginx 配置 `/etc/nginx/sites-available/emotion-api` 把所有 location 替换成：
```nginx
location / {
    root /var/www/html;
    try_files /maintenance.html =503;
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

修复后改回原配置 reload。

---

## 附：常用命令速查表

| 我想 | 敲什么 |
|---|---|
| 实时看日志 | `sudo journalctl -u emotion-api -n 50 -f` 或 `logs-api` |
| 看是不是活的 | `sudo systemctl status emotion-api` 或 `api-status` |
| 重启服务 | `sudo systemctl restart emotion-api` 或 `api-restart` |
| 改环境变量 | `sudo nano /home/emotion/emotion/apps/api/.env` 然后 restart |
| 拉新代码部署 | `sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh` |
| 健康检查 | `curl -s http://127.0.0.1:3000/api/health` |
| 看 Nginx 错误 | `sudo tail -f /var/log/nginx/error.log` |
| 看证书过期 | `sudo certbot certificates` |
| 看磁盘 | `df -h /` |
| 看内存 | `free -h` |
| 看监听端口 | `sudo ss -tlnp` |
| 进数据库 | `sudo -u emotion psql "$(grep ^DATABASE_URL= ~/emotion/apps/api/.env \| cut -d= -f2-)"` |

---

## 维护记录

| 日期 | 改动 |
|---|---|
| 2026-04-08 | 初版 |
| 2026-04-09 | 新增故障 playbook 场景 H/I/J/K：tong-analysis JSON parse 降级、◆ 乱码定位、ActionCard 持久化排查、analysis/coach 文字重复排查 |
| 2026-04-08 | 多 Provider 支持：AI_PROVIDER / OPENAI_API_KEY / OPENAI_BASE_URL；更新 AI 相关排查步骤 |
| 2026-04-09 | Admin 后台上线：日志查看命令补 emotion-admin-api；`deploy.sh` 现在自动管两个服务；新增 `add-admin-api.sh` 一键增量部署脚本 |
