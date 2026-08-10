<div align="center">

# MiMo Audio Studio

**一台可触摸、可部署、可私有化的 MiMo 语音工作站**

[![CI](https://github.com/shynloc/MiMo-Audio-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/shynloc/MiMo-Audio-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-f4511e.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-2f6b3b?logo=nodedotjs)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/React-19-20232a?logo=react)](https://react.dev/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-315f8c?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)](https://www.docker.com/)

[功能](#功能) · [快速开始](#本地开发) · [生产部署](#生产部署) · [安全模型](#安全模型) · [运维](#数据备份与恢复)

</div>

MiMo Audio Studio 是一个面向 [MiMo 音频 API](https://mimo.mi.com/docs/en-US/api/audio/tts) 的全栈 TTS / ASR 单页应用。它把语音合成、定时语音、语音识别和历史音频组织在一个复古现代的实体音频设备界面中，同时提供账户系统、管理员控制台、用户级加密凭据、私有对象存储和可恢复的 PostgreSQL 数据层。

> [!IMPORTANT]
> 本项目是社区实现，并非 Xiaomi MiMo 官方产品。MiMo、相关 API 名称和商标归其各自权利人所有。

## 功能

- **语音合成**：预设音色、自然语言表达控制、声音设计、声音克隆与低延迟 PCM16 流式试听。
- **定时语音**：按目标时长生成内容，适用于播报、提示音和固定时长口播。
- **语音识别**：MP3 / WAV 上传、流式转写、结果编辑、自动保存、纯文本与 Markdown 复制。
- **统一播放器**：真实音频时间线、拖动定位、播放/暂停/停止、前后切换、下载和历史装载。
- **账户与邮件**：注册、登录、邮箱验证、密码重置、安全 Cookie 和速率限制。
- **用户密钥库**：每位用户独立保存 MiMo API Key 与 Base URL；浏览器不会读回明文。
- **多 API 通道**：内置 Commercial API 与 Token Plan CN，管理员可维护 HTTPS 端点白名单。
- **管理控制台**：用户角色、API 通道、系统健康、任务与音频统计。
- **私有媒体存储**：音频存入 Cloudflare R2 私有 Bucket，客户端只获得短期签名 URL。
- **实体化界面**：React Three Fiber / Three.js 组件、机械按键音效、响应式桌面与移动布局。

## 架构

```mermaid
flowchart LR
  B["Browser · React / Three.js"] -->|"same-origin /audioplayer/api"| P["Reverse proxy"]
  P --> W["Nginx · static frontend"]
  P --> A["Hono API · Better Auth"]
  A --> D[("PostgreSQL 17")]
  A --> R["Cloudflare R2 · private bucket"]
  A --> M["MiMo audio API"]
  A --> E["SMTP or Resend"]
  R -->|"short-lived signed GET"| B
```

浏览器只与同源 API 交互。MiMo Key、R2 凭据、数据库连接串和邮件密码只存在于服务端运行环境中。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Vite 6、Three.js、React Three Fiber、Phosphor Icons |
| API | Node.js 22、TypeScript、Hono、Zod |
| 身份认证 | Better Auth、邮箱密码登录、Secure / HttpOnly Cookie |
| 数据库 | PostgreSQL 17、原生 SQL 迁移 |
| 媒体存储 | Cloudflare R2、AWS S3 SDK、短期预签名 URL |
| 邮件 | SMTP 或 Resend |
| 部署 | Docker、Docker Compose、Nginx |
| 测试 | Node.js Test Runner、TypeScript 类型检查、构建验证 |

## 目录结构

```text
.
├── src/                         # React UI、播放器与 3D 组件
├── server/                      # Hono API、认证、MiMo、R2、邮件与数据库
│   ├── migrations/              # 可重复执行的应用迁移
│   ├── scripts/                 # 迁移与连接检查
│   └── tests/                   # API / 流式解析 / 加密测试
├── public/                      # 纹理与机械音效等静态资产
├── scripts/                     # 构建、备份、恢复与生产发布工具
├── tests/                       # Sites Worker 兼容性测试
├── Dockerfile                   # 前端镜像
├── Dockerfile.api               # API 镜像
├── compose.dev.yml              # 本地 PostgreSQL
└── compose.prod.example.yml     # 生产栈模板
```

## 本地开发

### 环境要求

- Node.js 22 或更高版本
- npm 10+
- Docker 与 Docker Compose v2
- 一个 MiMo API Key
- 需要完整生成/识别能力时，准备一个私有 Cloudflare R2 Bucket

### 1. 安装与启动数据库

```bash
git clone https://github.com/shynloc/MiMo-Audio-Studio.git
cd MiMo-Audio-Studio
npm ci
docker compose -f compose.dev.yml up -d
```

### 2. 配置服务端

```bash
cp .env.example .env.local
```

本地默认数据库已经与 `compose.dev.yml` 对齐。至少检查以下配置：

```dotenv
NODE_ENV=development
APP_ORIGIN=http://127.0.0.1:4173
API_ORIGIN=http://127.0.0.1:8787
DATABASE_URL=postgresql://mimo:mimo_local_only@127.0.0.1:55432/mimo_audio
REQUIRE_EMAIL_VERIFICATION=false
ADMIN_EMAILS=you@example.com

# 完整音频功能需要填写
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=mimo-studio-audio
```

开发环境会生成确定性的本地认证/加密密钥，不能用于生产。生产环境必须显式设置独立随机密钥。

### 3. 迁移并启动

打开两个终端：

```bash
npm run db:migrate
npm run dev:api
```

```bash
npm run dev
```

访问 `http://127.0.0.1:4173`。Vite 会把 `/api` 代理到 `127.0.0.1:8787`。

### 4. 创建管理员

把管理员邮箱写入 `ADMIN_EMAILS`，注册对应账户后再次运行：

```bash
npm run db:migrate
```

迁移会同步白名单中的管理员角色，同时保护系统不允许降级最后一位管理员。

## 环境变量

完整模板见 [`.env.example`](.env.example)。关键变量如下：

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `APP_ORIGIN` | 是 | 浏览器访问的站点 Origin，不带路径 |
| `API_ORIGIN` | 是 | API 对外地址；生产默认挂载在 `/audioplayer` |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 |
| `POSTGRES_PASSWORD` | 生产 | Compose 创建数据库时使用；应与连接串一致 |
| `BETTER_AUTH_SECRET` | 生产 | 至少 32 字符的认证密钥 |
| `CREDENTIAL_ENCRYPTION_KEY` | 生产 | Base64 编码的 32 字节 AES 密钥 |
| `ADMIN_EMAILS` | 建议 | 逗号分隔的管理员引导邮箱 |
| `REQUIRE_EMAIL_VERIFICATION` | 建议 | 生产建议设为 `true` |
| `SMTP_*` / `RESEND_API_KEY` | 条件必需 | 邮箱验证或密码重置邮件通道 |
| `R2_*` | 音频功能必需 | 私有音频对象存储配置 |
| `MIMO_API_BASE_URL` | 是 | 无用户设置时的默认 MiMo API 地址 |
| `MIMO_*_TIMEOUT_MS` | 否 | MiMo 请求连接与总超时 |
| `MAX_AUDIO_BYTES` | 否 | 服务端允许的上传音频上限 |

生成生产密钥：

```bash
openssl rand -base64 32  # BETTER_AUTH_SECRET
openssl rand -base64 32  # CREDENTIAL_ENCRYPTION_KEY，必须单独生成
openssl rand -hex 32     # POSTGRES_PASSWORD，十六进制可直接用于 DATABASE_URL
```

> [!WARNING]
> `CREDENTIAL_ENCRYPTION_KEY` 必须跨部署保持不变。丢失或直接轮换它会使已有用户的 MiMo API Key 无法解密。请把它与数据库备份分别保存在受控的密码管理器或 Secret Manager 中。

## Cloudflare R2

Bucket 应保持 **Private**。为浏览器播放短期签名 URL，可配置只读 CORS：

```json
[
  {
    "AllowedOrigins": ["https://voice.example.com"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"]
  }
]
```

创建仅限目标 Bucket 的 S3 API Token，不要把 Account ID、Access Key 或 Secret Key 写入前端、Git 历史或 `VITE_*` 变量。

## 生产部署

下面示例使用 `/opt/mimo-studio`，对外路径为 `/audioplayer/`。

### 1. 准备目录和环境

```bash
sudo install -d -m 0700 /opt/mimo-studio
sudo install -d -m 0700 /opt/mimo-studio/data/postgres
sudo cp compose.prod.example.yml /opt/mimo-studio/compose.yml
sudo cp -a . /opt/mimo-studio/
sudo install -m 0600 .env.example /opt/mimo-studio/.env
```

编辑 `/opt/mimo-studio/.env`，至少设置：

```dotenv
NODE_ENV=production
PORT=8787
APP_ORIGIN=https://voice.example.com
API_ORIGIN=https://voice.example.com/audioplayer
DATABASE_URL=postgresql://mimo:<POSTGRES_PASSWORD>@postgres:5432/mimo_audio
POSTGRES_USER=mimo
POSTGRES_PASSWORD=<POSTGRES_PASSWORD>
POSTGRES_DB=mimo_audio
BETTER_AUTH_SECRET=<RANDOM_SECRET>
CREDENTIAL_ENCRYPTION_KEY=<BASE64_32_BYTE_KEY>
REQUIRE_EMAIL_VERIFICATION=true
ADMIN_EMAILS=admin@example.com
EMAIL_FROM=MiMo Studio <no-reply@example.com>

# SMTP 或 Resend 二选一
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@example.com
SMTP_PASSWORD=<SMTP_APP_PASSWORD>

R2_ACCOUNT_ID=<ACCOUNT_ID>
R2_ACCESS_KEY_ID=<ACCESS_KEY_ID>
R2_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY>
R2_BUCKET=mimo-studio-audio
```

### 2. 构建、备份、迁移与发布

仓库提供的发布脚本会：

1. 检查 `.env` 权限；
2. 构建带不可变版本号的前端与 API 镜像；
3. 在任何数据库迁移前生成并校验 `pg_dump -Fc`；
4. 等待 PostgreSQL 与 API 健康；
5. 只更新需要更新的服务；
6. 可选验证公网 URL。

```bash
cd /opt/mimo-studio
APP_ROOT=/opt/mimo-studio \
AUDIOPLAYER_RELEASE=$(git rev-parse --short=12 HEAD) \
PUBLIC_URL=https://voice.example.com/audioplayer/ \
./scripts/deploy-production.sh
```

若使用 `releases/<commit>` + `current` 的版本化目录，把持久化根目录与源码目录分开传入：

```bash
APP_ROOT=/opt/mimo-studio \
SOURCE_DIR=/opt/mimo-studio/releases/<COMMIT> \
COMPOSE_FILE=/opt/mimo-studio/releases/<COMMIT>/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
AUDIOPLAYER_RELEASE=<COMMIT> \
./releases/<COMMIT>/scripts/deploy-production.sh
```

生产 Compose 只把 `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB` 注入 PostgreSQL。修改 SMTP、R2 或 MiMo 配置不会再因为共享整份 `.env` 而重建数据库容器。

### 3. Nginx 反向代理

```nginx
location ^~ /audioplayer/api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_read_timeout 210s;
    client_max_body_size 52m;
}

location ^~ /audioplayer/ {
    proxy_pass http://127.0.0.1:5689/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

两个容器端口都只绑定 `127.0.0.1`；不要把 PostgreSQL 或 API 容器端口直接暴露到公网。

更多升级、回滚和恢复说明见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

## 数据持久化说明

- 生产数据库保存在宿主机 `${APP_ROOT}/data/postgres`，容器更新不会删除该目录。
- 密码重置只会撤销登录会话，不会删除 `api_credentials`、历史音频或 R2 对象。
- 本地开发数据库与生产数据库是两套独立实例；本地注册的账户、API Key 和音频不会自动出现在生产环境。
- 用户 API Key 的密文与 `user_id` 绑定，不能在不同环境间直接复制；迁移账户时应使用受控迁移流程或让用户在目标环境重新录入。
- PostgreSQL 备份不包含 R2 对象；R2 生命周期、对象版本或复制策略需要单独配置。

## 数据备份与恢复

手动创建并校验备份：

```bash
APP_ROOT=/opt/mimo-studio ./scripts/backup-postgres.sh
```

备份默认写入 `/opt/mimo-studio/backups/postgres/`，权限为 `0600`。脚本不会自动删除旧备份。

恢复会替换当前应用数据库并停止 API / Web，必须显式确认：

```bash
APP_ROOT=/opt/mimo-studio \
./scripts/restore-postgres.sh /opt/mimo-studio/backups/postgres/mimo-studio-YYYYMMDDTHHMMSSZ.dump --confirm
```

建议把备份复制到加密的异机存储，并定期在临时数据库中做恢复演练。仅“生成了 dump 文件”不等于备份可用。

## 安全模型

- MiMo Key 使用 AES-256-GCM 加密；关联数据绑定用户 ID，密文不能跨用户替换。
- API Key 查询接口只返回是否配置、末四位和 Base URL，不返回明文。
- Base URL 必须是管理员启用的干净 HTTPS 端点；拒绝凭据、查询串、片段和私网地址。
- 身份 Cookie 使用 `HttpOnly`、`Secure`、`SameSite=Lax`；写请求校验可信 Origin。
- 登录、注册、密码重置和音频生成均有限速。
- R2 Bucket 私有；播放与下载使用短期预签名 URL。
- `.env`、数据库备份和生成音频默认不进入 Git。

发现安全问题请不要在公开 Issue 中提交密钥、数据库内容或可利用细节；请使用仓库的 **Security → Report a vulnerability** 私密报告通道。完整策略见 [`SECURITY.md`](SECURITY.md)。

## 验证与质量检查

```bash
npm run typecheck
npm run test:api
npm run test:sites
npm run build
npm run build:api
```

GitHub Actions 会在每次 Push 和 Pull Request 上执行上述检查。

## 常用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 前端 |
| `npm run dev:api` | 监听并启动 API |
| `npm run db:migrate` | 执行 Better Auth 与应用数据库迁移 |
| `npm run check:r2` | 验证 R2 连接 |
| `npm run check:email` | 验证邮件通道 |
| `npm run build` | 构建前端与 Sites 产物 |
| `npm run build:api` | 构建 API 产物 |
| `scripts/backup-postgres.sh` | 创建并校验数据库备份 |
| `scripts/restore-postgres.sh` | 受保护的数据库恢复 |
| `scripts/deploy-production.sh` | 版本化生产发布 |

## 许可证

本项目以 [MIT License](LICENSE) 发布。第三方库与 MiMo 服务仍受其各自许可证、服务条款和使用政策约束。
