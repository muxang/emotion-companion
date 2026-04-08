# VPS 部署脚本

把后端跑在 VPS 上，前端继续上 Vercel，Supabase / Upstash 保持不动。

## 🚀 一键部署（推荐）

VPS 全新 Ubuntu 22.04/24.04，全部就绪后执行**一条命令**：

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/muxang/emotion-companion/main/scripts/vps/bootstrap.sh)
```

脚本会：
1. 把已知配置（域名 / 邮箱 / 仓库）打印出来等你确认
2. 交互式让你输入 3 个 secret（Anthropic API key / DATABASE_URL / CORS_ORIGIN，输入隐藏）
3. 自动 clone 仓库 + 装依赖 + 写 systemd + Nginx + certbot + 启动服务 + 跑数据库迁移 + 自检
4. 全程约 5-10 分钟，最后输出 https://api.botjive.net/api/health 的响应

> 这条命令是幂等的：再跑一次会问"跳过 secret 输入只重启吗？"，可以拿来快速重启或修复部分步骤。

⚠️ **必须在跑这条命令之前**完成：
- VPS 控制台**已开放 22/80/443 端口**
- 域名**已配 A 记录**指向 VPS（境外节点 + Cloudflare DNS-only 灰云）
- 准备好 `ANTHROPIC_API_KEY` / `DATABASE_URL` / 前端 `CORS_ORIGIN`

---

## 这里有什么

```
scripts/vps/
├── README.md                              ← 你正在看的这个
├── bootstrap.sh                           ← ⭐ 一键部署（root 跑,curl|bash 友好）
├── config.example.sh                      ← 配置模板（复制为 config.sh 后编辑）
├── setup.sh                               ← 底层初始化（root 跑,bootstrap.sh 内部调用）
├── deploy.sh                              ← 增量更新（APP_USER 跑）
└── templates/
    ├── emotion-api.service.template       ← systemd unit
    ├── nginx-emotion-api.conf.template    ← Nginx 反代配置
    └── env.production.template            ← apps/api/.env 模板
```

**两套使用方式**：
- **一键模式（bootstrap.sh）**：适合"我把信息都给你了，全自动跑完"的场景
- **手动模式（config.sh + setup.sh）**：适合需要逐步控制 / 排错 / 多个 VPS 不同配置 的场景

下面文档先讲一键模式，然后讲手动模式。

## 一键模式（bootstrap.sh）详解

### 完整流程

```bash
# 1. SSH 到 VPS（境外节点,无需备案）
ssh root@<your-vps-ip>

# 2. 一条命令搞定一切
sudo bash <(curl -fsSL https://raw.githubusercontent.com/muxang/emotion-companion/main/scripts/vps/bootstrap.sh)
```

会看到：

```
╔══════════════════════════════════════════════════════════════╗
║          Emotion Companion · 一键部署 (bootstrap)            ║
╚══════════════════════════════════════════════════════════════╝

  仓库       https://github.com/muxang/emotion-companion.git
  分支       main
  域名       api.botjive.net
  邮箱       chairsmu@gmail.com  (Let's Encrypt 续期通知)
  应用用户   emotion
  应用目录   /home/emotion/emotion
  服务名     emotion-api
  端口       3000  (只在 127.0.0.1)

请在开始前确认：
  ✓ api.botjive.net 的 A 记录已经指向本 VPS（境外节点 + Cloudflare DNS-only 灰云）
  ✓ 已准备好 ANTHROPIC_API_KEY
  ✓ 已准备好 Supabase DATABASE_URL
  ✓ 已准备好 Vercel 前端域名 (如果还没部署,可以先填占位,部完前端再回来改)

确认开始部署？(y/N)
```

按 `y` 后会依次让你输入：

```
[bootstrap] 请输入以下 secret（输入时不显示，回车确认）

  ANTHROPIC_API_KEY (sk-ant-...): ********
[  ok  ]   ANTHROPIC_API_KEY 已收到 (107 chars)
  DATABASE_URL (postgresql://...): ********
[  ok  ]   DATABASE_URL 已收到

  CORS_ORIGIN: https://emotion-companion.vercel.app
[  ok  ]   CORS_ORIGIN = https://emotion-companion.vercel.app

  REDIS_URL (Upstash,留空跳过): rediss://default:xxx@xxx.upstash.io:6379
[  ok  ]   REDIS_URL 已收到
  ANTHROPIC_BASE_URL (中转代理,留空走官方):
[  ok  ]   ANTHROPIC_BASE_URL 留空,走 https://api.anthropic.com
```

之后进入自动模式，6 个步骤跑完：

```
[bootstrap] Step 1/6: 准备脚本
[  ok  ]   脚本已下载到 /tmp/emotion-bootstrap-12345/repo
[bootstrap] Step 2/6: 生成 scripts/vps/config.sh
[  ok  ]   config.sh 已生成
[bootstrap] Step 3/6: 调用 setup.sh（装依赖 / systemd / Nginx / certbot）
------------------------------------------------------------
[setup] Step 1/9: 检查系统依赖
[setup]   Node 未安装,将安装 20.x（NodeSource）
... (~3-5 分钟)
[setup]   HTTPS 证书申请成功
------------------------------------------------------------
[bootstrap] Step 4/6: 把 secret 写入 /home/emotion/emotion/apps/api/.env
[  ok  ]   .env 已更新
[bootstrap] Step 5/6: 启动 emotion-api
[  ok  ]   emotion-api 已运行
[bootstrap] Step 6/6: 运行数据库迁移（幂等）
[  ok  ]   迁移完成

╔══════════════════════════════════════════════════════════════╗
║                     🎉  部署完成                              ║
╚══════════════════════════════════════════════════════════════╝

  域名        https://api.botjive.net
  本地健康    {"success":true,"data":{"status":"ok",...}}
  外部健康    {"success":true,"data":{"status":"ok",...}}

  查日志      sudo journalctl -u emotion-api -f
  重启        sudo systemctl restart emotion-api
  改 .env     sudo nano /home/emotion/emotion/apps/api/.env

  后续更新    sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh
```

### bootstrap.sh 的特性

| 特性 | 说明 |
|---|---|
| **幂等** | 反复跑安全。检测到 .env 已配置完整时,会问"跳过 secret 输入只重启?",可作为快速重启工具 |
| **隐藏输入** | API key 与 DATABASE_URL 用 `read -rs` 输入,屏幕不显示 |
| **二次校验** | 输入的 API key 不是 `sk-ant-` 开头会要求确认;DB URL 不是 `postgresql://` 开头会要求确认 |
| **占位防呆** | 写完 .env 后扫一遍占位符,还有就拒绝启动并指明缺哪些 |
| **健康自检** | 启动后 8 秒内 curl `/api/health`,失败立刻打印日志退出 |
| **CORS 提醒** | 如果你输入的 CORS_ORIGIN 包含 `placeholder` 或 `example`,最后会黄色提醒"部完前端记得回来改" |
| **避开 sed 转义地狱** | 用纯 bash 逐行替换 .env,即便 secret 含 `/` `&` `\` `$` 也不会出错 |

### 一键模式 vs 手动模式

| 场景 | 推荐 |
|---|---|
| 第一次部署，所有信息都准备好了 | **bootstrap.sh** |
| 想看每一步发生了什么 / 学习用 | 手动模式（config.sh + setup.sh） |
| 已经部过一次，只想拉新代码并重启 | `deploy.sh`（不是 bootstrap） |
| .env 写错了想重置 | bootstrap.sh，回答"不跳过 secret" |
| 多个 VPS 不同配置 | 手动模式，每个 VPS 用独立 config.sh |

---

## 前置条件

| 项 | 要求 |
|---|---|
| VPS | Ubuntu 22.04 / 24.04 LTS，1c1g 起步（推荐 1c2g） |
| 域名 | 一个指向 VPS 的 A 记录，例如 `api.yourdomain.com`（**部署前** DNS 已生效）|
| 仓库 | git 仓库可被 VPS 访问（公库直接 clone；私库要先在 VPS 配 deploy key 或 token） |
| 服务 | Supabase（拿到 connection string）、Upstash Redis 可选 |

> ⚠️ DNS 必须提前生效，否则 setup.sh 在最后一步申请 HTTPS 证书时会失败。可以用 `dig api.yourdomain.com` 在 VPS 上确认。

---

## 云厂商特别说明

### 腾讯云 / 阿里云 / 华为云（国内）

国内云的 VPS 比海外多两层防火墙，需要分别开通：

1. **安全组（控制台层）** ⭐ 必须做
   - 控制台 → 实例 → 安全组 → 编辑入站规则
   - 至少放通：`22/tcp`（SSH）、`80/tcp`（HTTP，certbot 验证用）、`443/tcp`（HTTPS）
   - 来源 `0.0.0.0/0`
   - **不开安全组的话，setup.sh 里 ufw 部分跑得再好你也连不上，certbot 也会失败**

2. **备案要求** ⭐ 关键
   - 如果 VPS 在**中国大陆区**（北京/上海/广州/成都等），域名必须**已完成 ICP 备案**才能用 80/443 服务对外
   - 没备案的话腾讯云会自动拦截 80/443 的流量，certbot 申请证书也会失败
   - 解决办法 2 选 1：
     - **A.** 在腾讯云完成域名备案（个人 7-20 工作日）
     - **B.** 把 VPS 换到**腾讯云香港 / 新加坡 / 硅谷**等海外节点，无需备案

3. **腾讯云 Ubuntu 镜像默认开启 root 密码登录**
   - 建议跑 setup.sh 之前先做基础加固：
     ```bash
     # 改 root 密码 + 创建 sudo 用户（可选）
     # 禁用 root 密码登录,只允许 SSH key
     mkdir -p ~/.ssh && chmod 700 ~/.ssh
     # 把你本地的 ~/.ssh/id_ed25519.pub 内容追加到:
     nano ~/.ssh/authorized_keys
     chmod 600 ~/.ssh/authorized_keys
     # 验证 key 能登录后再禁密码:
     sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
     sudo systemctl restart sshd
     ```

4. **国内访问 NodeSource / GitHub 偶尔慢**
   - 如果 setup.sh 卡在 `apt-get install nodejs`，可能是访问 deb.nodesource.com 慢
   - 临时加速：换用清华镜像
     ```bash
     # 改 apt 源为清华镜像（Ubuntu 22.04 / 24.04 通用）
     sudo sed -i.bak 's|http://archive.ubuntu.com|https://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list
     sudo sed -i 's|http://security.ubuntu.com|https://mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list
     sudo apt-get update
     ```
   - GitHub clone 慢的话可以临时改 hosts 或用 ghproxy

### 海外 VPS（Hetzner / Vultr / DigitalOcean / AWS）

- 无备案要求
- 默认 ufw / iptables / 安全组配置因厂商而异
- 一般只需要做：
  - 在控制台 firewall 放通 22/80/443（DigitalOcean 叫 Cloud Firewall，AWS 叫 Security Group）
  - 跑 setup.sh

---

## 手动模式（config.sh + setup.sh）—— 第一次部署

> 大多数情况下你应该用一键模式（bootstrap.sh），手动模式留给需要更多控制的场景。

### 1. 把代码搞到 VPS

```bash
ssh root@<your-vps-ip>
cd /tmp
git clone <your-repo-url> emotion-bootstrap
cd emotion-bootstrap
```

### 2. 写配置

```bash
cd scripts/vps
cp config.example.sh config.sh
nano config.sh
```

填好这几项：
```sh
REPO_URL="https://github.com/youruser/emotion.git"
BRANCH="main"
APP_USER="emotion"
APP_DIR="/home/emotion/emotion"
API_DOMAIN="api.yourdomain.com"   # 必须 DNS 已指向本 VPS
ACME_EMAIL="you@yourdomain.com"
SERVICE_NAME="emotion-api"
NODE_PORT="3000"
```

### 3. 跑 setup.sh

```bash
cd /tmp/emotion-bootstrap
sudo bash scripts/vps/setup.sh
```

脚本会做这些事：
1. 装 Node 20 / pnpm / nginx / certbot / ufw
2. 创建 `APP_USER` 用户
3. 用 `APP_USER` 身份 clone 仓库到 `APP_DIR`
4. `pnpm install` + 构建 `apps/api`
5. 在 `apps/api/.env` 写入生产模板（含**自动生成的强随机 JWT_SECRET**）
6. 写 systemd unit
7. 写 Nginx 反代配置
8. 配置 ufw 防火墙（22/80/443）
9. 申请 HTTPS 证书
10. 检查 `.env` 占位符；全填好则启动服务，否则提示你去填

### 4. 填写 .env 中的剩余字段

setup.sh 会停在最后一步告诉你还缺什么。一般是：

```
- ANTHROPIC_API_KEY
- DATABASE_URL
- CORS_ORIGIN
```

编辑：
```bash
sudo nano /home/emotion/emotion/apps/api/.env
```

填入：
```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx
DATABASE_URL=postgresql://postgres:[pwd]@db.xxx.supabase.co:5432/postgres
CORS_ORIGIN=https://emotion.yourdomain.com   # 你的 Vercel 前端域名,完全匹配,无尾斜杠
```

可选填：
```
ANTHROPIC_BASE_URL=                          # 留空走官方端点
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
```

> JWT_SECRET 已经被自动生成成强随机串，**不要再改**。

### 5. 启动服务

```bash
sudo systemctl start emotion-api
sudo journalctl -u emotion-api -f
```

预期日志：
```
[ai] client ready {"model":"claude-sonnet-4-20250514","baseURL":"...","maxRetries":3,...}
emotion-companion api listening on http://127.0.0.1:3000
```

### 6. 跑数据库迁移（第一次）

```bash
sudo -u emotion -H bash -lc "cd /home/emotion/emotion && pnpm --filter @emotion/api run db:migrate"
```

应输出 `[migrate] done. applied N new migration(s).`（如果之前在本地已经迁移过 Supabase，这里会全 skip）

### 7. 验证

```bash
# 内网（直连 Node）
curl http://127.0.0.1:3000/api/health

# 外网（走 Nginx + HTTPS）
curl -i https://api.yourdomain.com/api/health
```

应返回：
```json
{"success":true,"data":{"status":"ok","version":"...","checks":{"database":"ok","redis":"...","uptime":3},"timestamp":"..."}}
```

### 8. 在 Vercel 配前端

1. Vercel → New Project → Import 你的仓库
2. **Framework**: Vite
3. **Root Directory**: `apps/web`
4. **Build Command**: `cd ../.. && pnpm install --frozen-lockfile && pnpm --filter @emotion/web run build`
5. **Output Directory**: `dist`
6. **Environment Variables**:
   - `VITE_API_BASE_URL=https://api.yourdomain.com`
7. Deploy → 拿到 Vercel 域名（比如 `xxx.vercel.app` 或自定义域名）

> 拿到前端最终域名后，记得回 VPS 把 `apps/api/.env` 的 `CORS_ORIGIN` 更新为这个域名，然后 `sudo systemctl restart emotion-api`。

---

## 后续更新部署

代码改动后，本地推到 git，VPS 上一条命令：

```bash
sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh
```

deploy.sh 会：
1. `git pull`
2. `pnpm install --frozen-lockfile`
3. `pnpm --filter @emotion/api run build`
4. 跑数据库迁移（幂等）
5. `sudo systemctl restart emotion-api`
6. 自检 `/api/health`

可以做个 alias 方便：
```bash
echo 'alias deploy-emotion="sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh"' >> ~/.bashrc
source ~/.bashrc
```

以后就是 `deploy-emotion` 一下。

---

## 常见操作速查

```bash
# 查日志
sudo journalctl -u emotion-api -f
sudo journalctl -u emotion-api -n 100 --no-pager

# 重启 / 停止 / 状态
sudo systemctl restart emotion-api
sudo systemctl stop    emotion-api
sudo systemctl status  emotion-api

# 编辑 .env 后重启
sudo nano /home/emotion/emotion/apps/api/.env
sudo systemctl restart emotion-api

# Nginx 重载（改了 nginx 配置后）
sudo nginx -t && sudo systemctl reload nginx

# 强制续期 HTTPS 证书
sudo certbot renew --force-renewal

# 看证书过期时间
sudo certbot certificates

# 直接连数据库快速看东西
sudo -u emotion psql "$(grep ^DATABASE_URL= /home/emotion/emotion/apps/api/.env | cut -d= -f2-)"
```

---

## 常见问题

| 症状 | 原因 | 解决 |
|---|---|---|
| `setup.sh` 启动 service 失败 "JWT_SECRET looks like a placeholder" | `.env` 还有占位符没改 | `nano apps/api/.env` 填好 |
| `setup.sh` 启动 service 失败 "CORS_ORIGIN must not contain localhost" | `.env` 的 CORS_ORIGIN 没改成正式域名 | 改成 Vercel 域名后重启 |
| `certbot` 申请证书失败 | DNS 没生效 / 80 端口被占 | `dig api.yourdomain.com`；等 10 分钟；确认 nginx 在 80 端口监听 |
| 前端调 API 报 CORS 错 | `CORS_ORIGIN` 不严格等于前端 origin | 多个斜杠 / www 都不行，必须一字不差 |
| SSE 流卡住 / 几秒就断 | Nginx 没关 buffering | 确认 `nginx-emotion-api.conf.template` 里有 `proxy_buffering off` 和 `proxy_read_timeout 3600s` |
| `/api/health` 502 | systemd 没起来 / 端口对不上 | `journalctl -u emotion-api -n 50` |
| `/api/health` 200 但 status=degraded | DB 或 Redis 连不上 | 看 `checks.database` / `checks.redis`；检查 DATABASE_URL、Supabase 防火墙 |
| Chat 偶发 502 | Anthropic 上游或代理抖动 | 已经改成 maxRetries=3；如果一直 502，把 `ANTHROPIC_BASE_URL` 留空走官方 |
| OOM | VPS 内存太小 | 加 swap：`sudo fallocate -l 1G /swap && sudo chmod 600 /swap && sudo mkswap /swap && sudo swapon /swap && echo '/swap none swap sw 0 0' \| sudo tee -a /etc/fstab` |
| `deploy.sh` "请以 emotion 身份运行" | 用 root 跑了 | `sudo -u emotion -H bash /home/emotion/emotion/scripts/vps/deploy.sh` |

---

## 安全建议

setup.sh 已经做了的：
- ✅ Node 进程跑在非 root 用户 `emotion` 下
- ✅ Node 只监听 `127.0.0.1`，外网无法直连
- ✅ ufw 只放 22/80/443
- ✅ systemd 加固：`NoNewPrivileges` / `ProtectSystem=strict` / `ProtectHome=read-only`
- ✅ HTTPS by certbot（80 自动跳 443）
- ✅ JWT_SECRET 自动生成强随机串
- ✅ `apps/api/.env` 文件权限 `600`，只 APP_USER 可读

你**还应该**做的：
- 关闭 SSH 密码登录，只允许 key（编辑 `/etc/ssh/sshd_config` 设 `PasswordAuthentication no`）
- 给 root 也设 ssh 密钥后禁用 root 登录（`PermitRootLogin prohibit-password` 或 `no`）
- 定期 `apt update && apt upgrade`
- Supabase 那边给数据库加 IP 白名单（只允许 VPS IP）

---

## 卸载 / 重装

完全清掉这个部署：

```bash
sudo systemctl stop emotion-api
sudo systemctl disable emotion-api
sudo rm /etc/systemd/system/emotion-api.service
sudo rm /etc/nginx/sites-enabled/emotion-api /etc/nginx/sites-available/emotion-api
sudo systemctl reload nginx
sudo certbot delete --cert-name api.yourdomain.com    # 可选
sudo userdel -r emotion                                # 可选,也会删 /home/emotion
sudo systemctl daemon-reload
```
