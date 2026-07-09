# 09-webui：Web 管理服务

## 功能概述

biliup 内置了一个可选的 Web 管理服务（基于 Axum 框架），提供 REST API 来管理直播流录制、视频上传模板和用户凭证。通过命令行 `biliup server` 启动，默认绑定 `0.0.0.0:19159`。该模块需要 `server` feature 启用。

## 架构设计

### Actor 模型

服务核心采用 **Actor 模式** 管理直播流：

```
Main Loop (定时触发)
  │
  ├─ status_loop ─────────── 每30秒检查所有直播流状态
  │   └─ SiteDefinition 提取器 → 检测在线/离线
  │
  ├─ DownloadActor ───────── 管理下载任务生命周期
  │   ├─ add_streamer(url)   ← 添加新流到下载队列
  │   ├─ remove_streamer(id) ← 停止并移除流
  │   └─ 内部维护状态映射 (HashMap)
  │
  └─ UploadActor ─────────── 上传完成后触发
      └─ 轮询 download_records → 对已完成下载执行自动上传
```

### 三层架构

```
┌─────────────────────────────────────────────────────────────┐
│  API 层 (api/)                                              │
│  router.rs  ── 路由定义 (Axum Router)                        │
│  endpoints.rs ── CRUD 端点处理函数                           │
│  bilibili_endpoints.rs ── B站代理 API 端点                   │
├─────────────────────────────────────────────────────────────┤
│  核心域层 (core/)                                            │
│  download_actor.rs / upload_actor.rs / live_streamers.rs     │
│  upload_streamers.rs / users.rs / main_loop.rs / util.rs     │
├─────────────────────────────────────────────────────────────┤
│  基础设施层 (infrastructure/)                                │
│  connection_pool.rs ── SQLite 连接池                         │
│  service_register.rs ── 服务注册中心                           │
│  repositories/ ── 6 个 Repository (数据访问)                 │
│  live_streamers_service.rs ── 直播流业务服务                   │
└─────────────────────────────────────────────────────────────┘
```

## 命令用法

```bash
# 启动 Web 服务（需要 server feature）
biliup server
biliup server --bind 127.0.0.1 --port 8080
```

## 完整 API 路由表

| 方法 | 路径 | 说明 | 端点函数 |
|------|------|------|----------|
| GET | `/v1/streamers` | 获取所有直播流配置 | `get_streamers_endpoint` |
| GET | `/v1/streamers/:id` | 获取单个直播流 | `get_streamer_endpoint` |
| POST | `/v1/streamers` | 添加直播流 | `add_streamer_endpoint` |
| PUT | `/v1/streamers/:id` | 更新直播流配置 | `update_streamer_endpoint` |
| DELETE | `/v1/streamers/:id` | 删除直播流 | `delete_streamer_endpoint` |
| GET | `/v1/upload/streamers` | 获取所有上传模板 | `get_upload_streamers_endpoint` |
| GET | `/v1/upload/streamers/:id` | 获取单个上传模板 | `get_upload_streamer_endpoint` |
| POST | `/v1/upload/streamers` | 添加上传模板 | `add_upload_streamer_endpoint` |
| PUT | `/v1/upload/streamers/:id` | 更新上传模板 | `update_template_endpoint` |
| DELETE | `/v1/upload/streamers/:id` | 删除上传模板 | `delete_template_endpoint` |
| GET | `/v1/users` | 获取所有用户 | `get_users_endpoint` |
| POST | `/v1/users` | 添加用户 | `add_user_endpoint` |
| DELETE | `/v1/users/:id` | 删除用户 | `delete_user_endpoint` |
| GET | `/bili/archive/pre` | 代理 B 站预检查 API | `archive_pre_endpoint` |
| GET | `/bili/space/myinfo` | 代理 B 站用户信息 API | `get_myinfo_endpoint` |
| GET | `/bili/proxy` | 通用 B 站 API 代理 | `get_proxy_endpoint` |

## 数据库 Schema（6 张表）

### live_streamers — 直播流录制配置

```sql
create table if not exists live_streamers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    url        TEXT NOT NULL UNIQUE DEFAULT '',           -- 直播流地址
    remark     TEXT NOT NULL DEFAULT '',                  -- 备注
    filename   TEXT NOT NULL DEFAULT './video/...{title}',-- 文件名模板
    split_time INTEGER,                                   -- 按时间分段(秒)
    split_size INTEGER,                                   -- 按大小分段(字节)
    upload_id  INTEGER                                    -- 关联的上传模板ID
);
```

### upload_streamers — 上传模板配置

存储完整的 `Studio` 投稿信息（37 个字段），包括版权、分区、标题、简介、标签、定时发布、音质（杜比/Hi-Res）、互动设置等。

### 其余 4 张表

- **`users`** — 用户凭证存储（name + value + platform），即 B 站登录信息
- **`upload_records`** — 上传记录追踪（identity + status）
- **`download_records`** — 下载记录（关联 live_id + upload_id）
- **`videos`** — 视频片段记录（start_time + end_time + path + status）

## 源码分析

### 模块位置

- **入口文件**：`crates/biliup-cli/src/server.rs`
- **核心逻辑**：`crates/biliup-cli/src/server/` 下 14 个文件

### 路由定义（router.rs）

```
CORS 配置
  └─ allow_origin: http://localhost:3000 (Next.js 前端)
  └─ allow_methods: any
  └─ allow_headers: Content-Type

路由组
  ├─ /v1/streamers/*    ─── 直播流 CRUD
  ├─ /v1/upload/streamers/* ─ 上传模板 CRUD
  ├─ /v1/users/*        ─── 用户管理
  └─ /bili/*            ─── B站 API 代理（解决前端 CORS）
```

### 核心状态枚举

```rust
pub enum StreamStatus {
    Working,    // 正在录制
    Inspecting, // 检测中
    Pending,    // 待处理（默认）
    Idle,       // 空闲
}
```

## 主循环机制

`main_loop.rs` 中的 `spawn_main_loop` 启动定时循环：

1. **每 30 秒**遍历所有 `live_streamers`
2. 对每个 URL 调用 `SiteDefinition::can_handle_url` 识别平台（B站/斗鱼/虎牙）
3. 调用 `get_site` 获取流状态：在线 → `Working`，离线 → `Idle`
4. 状态变化时触发 `DownloadActor` 的添加/移除操作
5. 下载完成后，如果配置了 `upload_id`，自动触发 `UploadActor` 上传

## 关键设计

### 1. B站 API 代理

`bilibili_endpoints.rs` 提供 `/bili/*` 代理端点，前端（如 localhost:3000 的 Next.js 应用）无需直接调用 B 站 API，绕过 CORS 限制。

### 2. 服务注册中心

`service_register.rs` 采用类似依赖注入的模式，将 Repository 和 Service 实例集中注册，通过 Axum 的 State/Extension 注入到各端点处理器。

### 3. 下载与上传联动

`download_records` 表记录了直播录制片段，每段完成后检查是否关联了 `upload_id`，如果关联则自动触发上传流程，形成"录制→上传"自动化管线。

## 开发注意事项

1. **数据库路径**：SQLite 文件默认位置需关注，建议可配置化
2. **前端分离**：`localhost:3000` 说明预期有一个独立的 Next.js 前端，但该项目中未包含
3. **Actor 隔离**：DownloadActor 使用 tokio::spawn 独立运行，通过 channel 通信，需要注意优雅关闭
4. **CORS 安全**：当前 allow_origin 硬编码为 `localhost:3000`，生产环境需改为具体域名
5. **凭证安全**：`users` 表明文存储 token，建议至少运行时加密

## 与 CLI 的关系

Web 管理服务复用了 CLI 的核心模块：
- 直播流检测 → 复用 `downloader/extractor.rs` 的 `SiteDefinition` 提取器
- 上传模板 → 复用 `Studio` 数据结构
- 用户凭证 → 复用 `LoginInfo` 序列化格式

## 典型使用场景

```bash
# 1. 启动服务（需要 server feature 编译）
biliup server

# 2. 通过 API 添加直播流
curl -X POST http://localhost:19159/v1/streamers \
  -H "Content-Type: application/json" \
  -d '{"url": "https://live.bilibili.com/12345", "remark": "我的直播"}'

# 3. 通过 API 添加上传模板
curl -X POST http://localhost:19159/v1/upload/streamers \
  -H "Content-Type: application/json" \
  -d '{"template_name": "默认模板", "tid": 171, "title": "直播录像"}'
```

## 相关阅读

- [03-upload.md](./03-upload.md) — 上传功能（WebUI 的投稿模板复用此逻辑）
- [07-download.md](./07-download.md) — 下载功能（WebUI 的直播录制复用此逻辑）
- [01-login.md](./01-login.md) — 登录（WebUI 的 user 管理复用此凭证格式）
- [11-architecture.md](./11-architecture.md) — 项目架构总览
