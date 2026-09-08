<div align="center">

# MiMo Audio Studio

**一台可触摸、可部署、可私有化的 MiMo TTS / ASR 语音工作站**

[English](README.en.md) · 简体中文

[![CI](https://github.com/shynloc/MiMo-Audio-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/shynloc/MiMo-Audio-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-f4511e.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/React-19-20232a?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-API-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 6](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![Hono](https://img.shields.io/badge/Hono-4-e36002?logo=hono&logoColor=white)](https://hono.dev/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)](https://www.docker.com/)

[功能](#核心功能) · [界面](#界面预览) · [架构](#系统架构) · [本地开发](#本地开发) · [生产部署](#生产部署) · [运维](#备份恢复与回滚) · [安全](#安全模型)

</div>

MiMo Audio Studio 是一个面向 [MiMo Audio API](https://mimo.mi.com/docs/en-US/api/audio/tts) 的全栈语音应用。它把语音合成、定时语音、语音识别和历史音频组织在一台复古现代的实体音频设备中，并提供账户系统、管理员控制台、用户级加密凭据、私有对象存储和可恢复的 PostgreSQL 数据层。

> [!IMPORTANT]
> 本项目是社区实现，并非 Xiaomi MiMo 官方产品。MiMo、相关 API 名称和商标归其各自权利人所有。使用前请自行确认 API 访问权限、费用和服务条款。

## 界面预览

![MiMo Audio Studio 工作台](docs/images/studio-overview.jpg)

<table>
  <tr>
    <td width="68%"><img src="docs/images/transport-detail.jpg" alt="机械播放器、磁带、状态灯、波形与时间线" /></td>
    <td width="32%"><img src="docs/images/inspector-detail.jpg" alt="音色、表达、语速与输出控制面板" /></td>
  </tr>
  <tr>
    <td align="center">磁带播放器、状态灯、实体按键与可拖动时间线</td>
    <td align="center">音色、表达、语速与输出设置</td>
  </tr>
</table>

界面使用本地纹理、本地字体、Three.js 实体组件和短机械音效构建，不依赖整页背景截图；桌面与移动端使用同一套功能状态和响应式布局。

## 核心功能

- **语音合成**：MiMo V2.5 预设音色、导演指令、表达风格、五档语速、WAV / MP3 / PCM16 输出。
- **低延迟试听**：服务端解析上游 SSE，浏览器按 PCM16 分片播放，最终封装并保存为 WAV。
- **音色设计与克隆**：自然语言描述目标声音，或在用户明确授权后上传 MP3 / WAV 参考音频。
- **定时语音**：围绕目标时长多轮调整生成结果，适合播报、提示音和固定时长口播。
- **语音识别**：MP3 / WAV 上传、流式转写、同区编辑、自动保存、纯文本与 Markdown 复制。
- **统一播放器**：播放、暂停、停止、前后切换、时间线推进、点击/拖动定位、Range 播放与下载。
- **账户与邮件**：注册、登录、邮箱验证、密码重置、Secure / HttpOnly Cookie 和速率限制。
- **用户密钥库**：每位用户独立保存 MiMo API Key 与 Base URL，浏览器无法读取密钥明文。
- **API 通道白名单**：内置 Commercial API 与 Token Plan CN；管理员可维护额外 HTTPS 端点。
- **管理控制台**：用户角色、端点、数据库/R2 健康状态、任务和音频统计。
- **私有媒体存储**：音频写入 Cloudflare R2 私有 Bucket，经同源鉴权 API 读取，支持 HTTP Range / `206 Partial Content`。
- **可恢复部署**：不可变镜像标签、迁移前数据库备份、健康检查、持久化数据目录和受保护的恢复脚本。

## 系统架构

```mermaid
flowchart LR
  B["Browser · React 19"] -->|"same-origin HTTPS"| P["Caddy / Nginx"]
  P --> W["Nginx · static UI"]
  P --> A["Hono API · Node.js 22"]
  A --> AUTH["Better Auth"]
  AUTH --> DB[("PostgreSQL 17")]
  A --> DB
  A --> M["MiMo Audio API"]
  A --> R["Cloudflare R2 · private"]
  A --> E["SMTP / Resend"]
  R -->|"authenticated stream · Range 206"| A
```

浏览器只访问同源页面和 API。MiMo Key、R2 凭据、数据库连接串及邮件凭据只存在于服务端。音频不会通过公共 R2 URL 暴露；API 会校验登录会话、资源所有权和 Range 后再转发对象流。

### 数据与信任边界

| 数据 | 存放位置 | 浏览器是否能读取明文 |
| --- | --- | --- |
| MiMo API Key | PostgreSQL，AES-256-GCM 密文 | 否，仅返回配置状态和末四位 |
| 用户账户与会话 | PostgreSQL + 安全 Cookie | 仅能读取当前用户资料 |
| 生成音频/上传音频 | 私有 Cloudflare R2 | 仅能经鉴权 API 读取自己的对象 |
| 音频元数据/转写结果 | PostgreSQL | 仅当前用户或授权管理员 |
| R2、SMTP、数据库凭据 | 服务端 `.env` | 否 |

## 技术栈

| 层级 | 技术与职责 |
| --- | --- |
| UI | React 19.2、React DOM、响应式单页工作台 |
| 3D / Motion | Three.js、React Three Fiber、Drei、Web Audio API、CSS 动效 |
| Design | IBM Plex Sans、Cormorant Garamond、Phosphor Icons、本地金属/象牙纹理与机械音效 |
| Build | Vite 6、React Plugin、ES Modules |
| API | Node.js 22、TypeScript、Hono、Zod、原生 Fetch / Streams |
| Authentication | Better Auth、邮箱密码登录、角色插件、安全 Cookie、邮件验证与密码重置 |
| Database | PostgreSQL 17、`pg`、Better Auth 迁移、可重复执行的原生 SQL 迁移 |
| Credential Vault | Node.js Crypto、AES-256-GCM、基于用户 ID / provider 的 AAD 绑定 |
| Audio | MiMo V2.5 TTS / ASR、SSE、PCM16 → WAV、MP3/WAV 上传、Range 请求 |
| Object Storage | Cloudflare R2、AWS SDK for JavaScript v3、私有 Bucket |
| Email | Nodemailer SMTP 或 Resend HTTP API |
| Containers | 多阶段 Dockerfile、非 root API 用户、Nginx 静态前端、Docker Compose |
| Hardening | 只读 Web/API 根文件系统、tmpfs、`no-new-privileges`、回环端口 |
| Quality | TypeScript 类型检查、Node.js Test Runner、Worker 兼容测试、GitHub Actions |

## 目录结构

```text
.
├── src/                         # React UI、播放器、认证与 3D 硬件组件
│   └── lib/                     # 同源 API / Better Auth 客户端
├── server/                      # Hono API、MiMo、R2、邮件、加密与数据库
│   ├── migrations/              # 应用 SQL 迁移
│   ├── scripts/                 # 迁移及连接检查
│   └── tests/                   # 加密、SSE 与客户端流测试
├── public/                      # 本地纹理和机械音效
├── docs/
│   ├── images/                  # README 截图
│   └── DEPLOYMENT.md            # 运维与恢复补充说明
├── scripts/                     # 构建、备份、恢复和生产发布脚本
├── tests/                       # Worker / 静态站点兼容测试
├── worker/                      # 静态站点 Worker 入口
├── Dockerfile                   # 前端多阶段镜像
├── Dockerfile.api               # API 多阶段镜像
├── compose.dev.yml              # 本地 PostgreSQL
└── compose.prod.example.yml     # 生产栈模板
```

## 本地开发

### 前置条件

- Node.js 22 或更高版本
- npm 10+
- Docker Engine / Docker Desktop 与 Docker Compose v2
- 一个可用的 MiMo API Key
- 完整音频功能需要私有 Cloudflare R2 Bucket
- 测试邮箱验证/密码重置时需要 SMTP 或 Resend

### 1. 获取代码和依赖

```bash
git clone https://github.com/shynloc/MiMo-Audio-Studio.git
cd MiMo-Audio-Studio
npm ci
```

### 2. 启动本地 PostgreSQL

```bash
docker compose -f compose.dev.yml up -d
docker compose -f compose.dev.yml ps
```

数据库只绑定到 `127.0.0.1:55432`，数据保存在 Docker volume `mimo-postgres-data`。

### 3. 创建本地配置

```bash
cp .env.example .env.local
chmod 600 .env.local
```

最小本地配置：

```dotenv
NODE_ENV=development
PORT=8787
APP_ORIGIN=http://127.0.0.1:4173
API_ORIGIN=http://127.0.0.1:8787
APP_BASE_PATH=/
DATABASE_URL=postgresql://mimo:mimo_local_only@127.0.0.1:55432/mimo_audio
REQUIRE_EMAIL_VERIFICATION=false
ADMIN_EMAILS=admin@example.com
```

开发模式会生成确定性的本地认证/加密密钥，仅用于开发。不要把它们复制到生产环境。

### 4. 迁移并启动

```bash
npm run db:migrate
```

终端 A：

```bash
npm run dev:api
```

终端 B：

```bash
npm run dev
```

打开 `http://127.0.0.1:4173`。Vite 会将 `/api` 请求代理到 `127.0.0.1:8787`。

### 5. 完成本地账户设置

1. 注册账户；
2. 若邮箱位于 `ADMIN_EMAILS`，重新运行 `npm run db:migrate` 同步管理员角色；
3. 在“连接设置”中选择或输入管理员批准的 Base URL；
4. 输入 MiMo API Key，保存并执行“测试连接”；
5. 使用无隐私短文本验证 TTS，再用生成的 WAV 验证 ASR。

## 配置说明

完整模板见 [`.env.example`](.env.example)。生产 `.env` 不得提交 Git，建议权限为 `0600`。

| 变量 | 生产要求 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | 必需 | 生产使用 `production` |
| `PORT` | 必需 | API 容器监听端口，默认 `8787` |
| `APP_ORIGIN` | 必需 | 浏览器公开 Origin，不带路径 |
| `API_ORIGIN` | 必需 | API 对外 Origin；同源部署通常与 `APP_ORIGIN` 相同 |
| `APP_BASE_PATH` | 必需 | 独立域名根路径用 `/`；子路径示例为 `/audioplayer` |
| `DATABASE_URL` | 必需 | API 连接 PostgreSQL 的 URL |
| `POSTGRES_*` | Compose 必需 | 初始化数据库容器；密码需与 `DATABASE_URL` 一致 |
| `BETTER_AUTH_SECRET` | 必需 | 独立随机密钥，至少 32 字符 |
| `CREDENTIAL_ENCRYPTION_KEY` | 必需 | Base64 编码的 32 字节 AES 密钥 |
| `ADMIN_EMAILS` | 建议 | 逗号分隔的管理员引导邮箱 |
| `REQUIRE_EMAIL_VERIFICATION` | 建议 | 公网生产建议为 `true` |
| `EMAIL_FROM` | 开启邮件时必需 | 发件人名称与地址 |
| `SMTP_*` / `RESEND_API_KEY` | 二选一 | 邮箱验证和密码重置通道 |
| `R2_ACCOUNT_ID` | 音频功能必需 | Cloudflare 账户 ID，仅服务端使用 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 音频功能必需 | 限定目标 Bucket 的 S3 凭据 |
| `R2_BUCKET` | 音频功能必需 | 私有 Bucket 名称 |
| `MIMO_API_BASE_URL` | 必需 | 默认 MiMo Base URL |
| `MIMO_CONNECT_TIMEOUT_MS` | 可选 | 连接超时策略 |
| `MIMO_TOTAL_TIMEOUT_MS` | 可选 | 完整生成/识别超时 |
| `MAX_AUDIO_BYTES` | 可选 | 服务端音频体积上限 |

生产密钥必须分别生成，不要复用：

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET
openssl rand -base64 32   # CREDENTIAL_ENCRYPTION_KEY
openssl rand -hex 32      # POSTGRES_PASSWORD
```

> [!CAUTION]
> `CREDENTIAL_ENCRYPTION_KEY` 与 `BETTER_AUTH_SECRET` 必须跨发布保持稳定。丢失或直接替换加密密钥会使已有用户的 MiMo Key 无法解密。请将其放在密码管理器或 Secret Manager，并与数据库备份分开保存。

## Cloudflare R2

1. 创建 **Private** Bucket；
2. 创建仅能访问该 Bucket 的 S3 API Token；
3. 将 Account ID、Access Key、Secret Key 和 Bucket 名写入服务端 `.env`；
4. 执行 `npm run check:r2`。

检查脚本会写入一个临时对象、通过短期签名 URL 读取，再删除该对象。正常浏览器播放不需要把 R2 设为 Public，也不需要浏览器直连 R2 CORS；`/api/audio/:id/content` 会执行会话、所有权和 Range 校验，再同源流式返回对象。

## 邮件服务

SMTP 与 Resend 二选一。开启 `REQUIRE_EMAIL_VERIFICATION=true` 时，必须设置 `EMAIL_FROM` 和一套有效邮件配置。

```bash
npm run check:email             # 验证传输，不发送邮件
npm run check:email -- --send   # 向 SMTP_USER 发送配置测试邮件
```

## 生产部署

推荐使用“稳定配置 + 不可变发布 + 独立数据目录”：

```text
/opt/mimo-studio/
├── .env                         # 稳定配置，0600
├── current -> releases/<sha>    # 当前版本
├── releases/<sha>/              # 只读源码发布
├── data/postgres/               # PostgreSQL 持久化数据
└── backups/postgres/            # 经验证的 pg_dump
```

以下示例使用独立根域 `https://voice.example.com/`、Web 回环端口 `5689`、API 回环端口 `8787`。

### 1. 确定并验证版本

```bash
git fetch --all --tags
git status --short
git rev-parse HEAD
npm ci
npm run typecheck
npm run test:api
npm run build
npm run test:sites
npm run build:api
```

不要从有未提交修改的工作目录直接制作生产发布。记录完整 commit SHA 和源码归档 SHA-256。

### 2. 准备目录和环境

```bash
sudo install -d -m 0700 /opt/mimo-studio
sudo install -d -m 0700 /opt/mimo-studio/releases
sudo install -d -m 0700 /opt/mimo-studio/data/postgres
sudo install -d -m 0700 /opt/mimo-studio/backups/postgres
sudo install -m 0600 .env.example /opt/mimo-studio/.env
sudoedit /opt/mimo-studio/.env
```

将已验证提交导出到 `/opt/mimo-studio/releases/<12位短SHA>`。不要把 `.git`、`.env`、数据库、备份、用户媒体或本地缓存放进构建上下文。

根域部署至少设置：

```dotenv
NODE_ENV=production
APP_ORIGIN=https://voice.example.com
API_ORIGIN=https://voice.example.com
APP_BASE_PATH=/
API_HOST_PORT=8787
WEB_HOST_PORT=5689
API_HEALTH_PATH=/api/health
```

再填写独立数据库密码、认证密钥、凭据加密密钥、邮件和 R2 配置。所有占位符必须替换，且不要把最终 `.env` 回显到日志。

### 3. 首次发布或版本升级

```bash
APP_ROOT=/opt/mimo-studio \
SOURCE_DIR=/opt/mimo-studio/releases/<SHORT_SHA> \
COMPOSE_FILE=/opt/mimo-studio/releases/<SHORT_SHA>/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
PROJECT_NAME=mimo-studio \
AUDIOPLAYER_RELEASE=<SHORT_SHA> \
WEB_IMAGE_REPO=mimo-studio-web \
API_IMAGE_REPO=mimo-studio-api \
VITE_APP_BASE_PATH=/ \
HEALTH_URL=http://127.0.0.1:8787/api/health \
PUBLIC_URL=https://voice.example.com/ \
/opt/mimo-studio/releases/<SHORT_SHA>/scripts/deploy-production.sh
```

脚本会检查 `.env` 权限、构建不可变镜像、校验 Compose、在迁移前创建并验证 dump、等待 PostgreSQL/API healthy，最后更新 Web。确认候选版本通过后再更新 `current`，不要自动删除旧发布、旧镜像或备份。

### 4. Caddy 反向代理

```caddy
voice.example.com {
    encode zstd gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8787 {
            flush_interval -1
        }
    }

    handle {
        reverse_proxy 127.0.0.1:5689
    }
}
```

`flush_interval -1` 用于及时转发 TTS / ASR SSE。修改前备份，然后：

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

只执行 reload，不需要重启服务器。Cloudflare 代理的 SSL/TLS 模式应使用 **Full (strict)**，不要使用 Flexible。

### 5. Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name voice.example.com;
    client_max_body_size 52m;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 210s;
    }

    location / {
        proxy_pass http://127.0.0.1:5689;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

TLS、HTTP → HTTPS 和安全响应头应在反向代理层配置。Web/API 只绑定 `127.0.0.1`，PostgreSQL 不发布宿主端口。

### 6. 上线验收

```bash
curl -fsS https://voice.example.com/api/health
curl -I https://voice.example.com/
curl -I https://voice.example.com/assets/<REAL_ASSET>.js
curl -I https://voice.example.com/assets/definitely-missing.js
```

最低验收清单：

- 三个容器均为 healthy，数据库与 R2 为 `ready`；
- 页面、JS、CSS、字体、纹理、音效 MIME 正确；未知静态资源返回 `404`；
- 注册、验证、登录、密码重置和管理员入口正常；
- 浏览器只能看到 Key 状态和末四位；
- TTS 普通生成、SSE 试听、ASR 流式转写、编辑和自动保存正常；
- 私有音频未登录返回 `401`，已登录 Range 请求返回 `206`；
- 播放、暂停、停止、进度跳转和下载正常；
- 桌面/移动端无横向溢出，控制台无应用错误；
- 检查 API、Web 与代理日志，并区分客户端取消流和真实服务错误。

## 数据持久化

- PostgreSQL 数据和 `.env` 必须位于不可变发布目录之外。
- 每次升级复用同一个 `BETTER_AUTH_SECRET` 与 `CREDENTIAL_ENCRYPTION_KEY`。
- R2 存音频；PostgreSQL 存所有权、对象键、配置、用量和转写元数据。
- 密码重置只撤销会话，不会删除 Key、历史或音频。
- 本地和生产数据库独立，账户与凭据不会自动迁移。
- 密文与原始 `user_id` 绑定，不能直接复制给另一个用户。
- PostgreSQL dump 不包含 R2 对象，R2 生命周期和异地备份需单独规划。

## 备份、恢复与回滚

### 创建并验证备份

```bash
APP_ROOT=/opt/mimo-studio \
COMPOSE_FILE=/opt/mimo-studio/current/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
PROJECT_NAME=mimo-studio \
/opt/mimo-studio/current/scripts/backup-postgres.sh
```

备份默认写入 `/opt/mimo-studio/backups/postgres/`，权限为 `0600`。脚本使用 `pg_restore --list` 验证归档，不自动清理旧备份。

### 恢复数据库

恢复会替换当前应用数据库并暂时停止 API/Web，必须先验证 dump、校验和及维护窗口：

```bash
APP_ROOT=/opt/mimo-studio \
COMPOSE_FILE=/opt/mimo-studio/current/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
PROJECT_NAME=mimo-studio \
/opt/mimo-studio/current/scripts/restore-postgres.sh \
  /opt/mimo-studio/backups/postgres/mimo-studio-YYYYMMDDTHHMMSSZ.dump \
  --confirm
```

### 应用回滚

迁移向后兼容时可保留数据库并切回上一版 Web/API：

```bash
AUDIOPLAYER_RELEASE=<PREVIOUS_SHA> \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
APP_ENV_FILE=/opt/mimo-studio/.env \
docker compose --env-file /opt/mimo-studio/.env \
  -p mimo-studio \
  -f /opt/mimo-studio/releases/<PREVIOUS_SHA>/compose.prod.example.yml \
  up -d --no-deps api web
```

回滚后重新验证健康、登录、加密凭据、既有音频和 Range。不要在应用回滚时删除 R2 对象、PostgreSQL 列、旧镜像或旧发布。更多说明见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

## 安全模型

- MiMo Key 使用 AES-256-GCM；AAD 绑定用户 ID 与 provider。
- 凭据接口不返回明文；Base URL 必须是管理员批准的干净 HTTPS URL。
- 拒绝带凭据、查询串、片段、localhost 或私网 IP 的端点。
- Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Lax`；写请求校验可信 Origin。
- 登录、注册、密码重置和生成接口有限速。
- R2 保持私有，每次媒体请求校验所有权；Range 语法受限。
- API 镜像使用非 root 用户；生产 Compose 支持只读根、tmpfs 和 `no-new-privileges`。
- `.env`、数据库、dump、Cookie、签名 URL、用户音频和上传文件不得进入 Git。

如果秘密曾进入 Git 历史，先轮换，再清理所有受影响历史；只从最新文件删除并不够。安全问题请使用 **Security → Report a vulnerability** 私密报告，参见 [`SECURITY.md`](SECURITY.md)。

## 验证与常用命令

```bash
npm run typecheck
npm run test:api
npm run build
npm run test:sites
npm run build:api
npm audit --audit-level=high
```

> `npm run test:sites` 依赖 `dist/client/index.html`，应先执行 `npm run build`。

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 前端 |
| `npm run dev:api` | 启动/监听 Hono API |
| `npm run db:migrate` | 执行 Better Auth 与应用迁移 |
| `npm run check:r2` | R2 写入、读取和清理检查 |
| `npm run check:email` | 验证邮件传输 |
| `npm run check:email -- --send` | 发送配置测试邮件 |
| `npm run build` | 构建前端与静态站点产物 |
| `npm run build:api` | 编译生产 API |
| `scripts/backup-postgres.sh` | 创建并验证 PostgreSQL 备份 |
| `scripts/restore-postgres.sh` | 显式确认后恢复数据库 |
| `scripts/deploy-production.sh` | 版本化生产发布 |

## 常见问题

**登录后显示 OFFLINE**：检查 `/api/credentials/mimo`、API 日志、数据库凭据行和加密密钥是否与上一版一致。浏览器状态异常不等于数据已删除。

**Key 保存但生成失败**：确认 Base URL 在管理员白名单中；Commercial 与 Token Plan 的 Key/通道必须匹配。

**音频可播放但不能跳转**：确认内容接口传递 `Range`，并返回 `206`、`Accept-Ranges`、`Content-Range` 和正确媒体类型。

**SSE 完成后一次性出现**：关闭反向代理缓冲，并提供足够的上游读取超时。

**更新后账户或 Key 消失**：确认仍使用同一宿主 PostgreSQL 目录、`.env` 和认证/加密密钥，不要把数据库放进 release 目录。

## 贡献

欢迎提交 Issue 和 Pull Request。提交前请运行完整验证；UI 变更需检查桌面/移动端，音频变更需覆盖 MIME、Range、SSE 和取消请求行为。

请勿提交真实 Key、生产拓扑、账户标识、数据库 dump、R2 对象或私密音频作为测试数据。

## 许可证

本项目以 [MIT License](LICENSE) 发布。第三方依赖和 MiMo 服务仍受其各自许可证、服务条款与使用政策约束。
