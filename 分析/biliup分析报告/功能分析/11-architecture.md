# 11-architecture：项目架构深度分析

> 从源码层面揭开 biliup 的三层 crate 架构、核心设计模式与模块依赖关系。

## 一、Workspace 架构

项目采用 **Cargo Workspace** 组织，包含 3 个 crate：

```
biliup-rs-master/
├── Cargo.toml              ← workspace root
├── crates/
│   ├── biliup/             ← 核心库（网络层 + 业务逻辑）
│   ├── biliup-cli/         ← 命令行工具 + Web 服务
│   └── stream-gears/       ← Python 绑定（PyO3）
│
├── .sqlx/                  ← 预编译 SQL 查询缓存
├── examples/                ← 配置示例
└── Dockerfile              ← 容器化部署
```

### Crate 职责

| Crate | 用途 | 依赖 |
|-------|------|------|
| **biliup** | API 封装、上传/下载/登录核心逻辑 | `reqwest`, `serde`, `tokio`, `rsa`, `base64`, `cookie` |
| **biliup-cli** | CLI 参数解析 + Axum Web 服务 + SQLite | `clap`, `axum`, `sqlx`, `qrcode`, `indicatif` |
| **stream-gears** | PyO3 Python 模块，导出核心函数 | `pyo3` |

## 二、核心库 (biliup) 模块结构

```
crates/biliup/src/
├── lib.rs              ← 导出 + retry() 重试函数 + Proxy Builder
├── client.rs           ← 双客户端设计 (Stateless/Stateful)
├── error.rs            ← 统一错误类型 Kind
│
├── uploader/
│   ├── mod.rs          ← VideoFile/VideoStream/Config 数据结构
│   ├── bilibili.rs     ← BiliBili 结构体 + 全部业务 API
│   ├── credential.rs   ← 凭证管理 + 6 种登录方式
│   └── line/
│       ├── mod.rs      ← Probe 测速 + 8 条线路定义 + 分片上传
│       └── upos.rs     ← Upos 直传实现（唯一激活的线路）
│
└── downloader/
    ├── mod.rs          ← 下载入口（自动检测 FLV/TS）
    ├── extractor.rs    ← SiteDefinition trait + 3 站点注册
    ├── extractor/
    │   ├── bilibili.rs ← B站直播提取
    │   ├── douyu.rs    ← 斗鱼直播提取
    │   └── huya.rs     ← 虎牙直播提取
    ├── httpflv.rs      ← FLV 流下载与解析
    ├── hls.rs          ← HLS(TS) 流下载
    ├── flv_parser.rs   ← FLV 二进制格式解析 (nom)
    ├── flv_writer.rs   ← FLV 文件写入
    ├── util.rs         ← 文件生命周期 + 分段控制
    └── error.rs        ← 下载器错误类型
```

## 三、核心设计模式

### 模式 1：双客户端策略

```rust
// StatelessClient — 无状态，用于下载器的站点提取
pub struct StatelessClient {
    pub client: reqwest::Client,
    pub client_with_middleware: ClientWithMiddleware,  // 带自动重试
    pub headers: HeaderMap,
}

// StatefulClient — 带 Cookie 状态，用于登录和上传
pub struct StatefulClient {
    pub client: reqwest::Client,
    pub cookie_store: Arc<CookieStoreMutex>,  // 共享 CookieStore
    pub buvid: String,                         // 自动生成设备 ID
}
```

**设计考量**：
- **StatelessClient**：轻量，内置指数退避重试中间件（5 次），适合下载等幂操作
- **StatefulClient**：携带 CookieStore + buvid 设备指纹，适合需要认证的操作
- **buvid 生成**：模拟随机 MD5 字符串，格式匹配 B站 设备标识

### 模式 2：BiliBili 结构体封装全部 B站 API

```rust
pub struct BiliBili {
    pub client: reqwest::Client,      // HTTP 客户端
    pub login_info: LoginInfo,         // 登录凭证 + Cookie
}
```

统一持有登录信息，避免每次调用 API 时都需传递认证参数。

### 模式 3：SiteDefinition 插件系统

```rust
#[async_trait]
pub trait SiteDefinition {
    fn can_handle_url(&self, url: &str) -> bool;          // URL 匹配
    async fn get_site(&self, url: &str, client: StatelessClient) -> Result<Site>;  // 提取流
}

const EXTRACTORS: [&(dyn SiteDefinition + Send + Sync); 3] = [
    &bilibili::BiliLive {},  // B站
    &huya::HuyaLive {},      // 虎牙
    &douyu::DouyuLive,       // 斗鱼
];
```

- **注册式扩展**：新增平台只需实现 `SiteDefinition` trait 并可加入 `EXTRACTORS` 数组
- **URL 路由**：`find_extractor()` 遍历匹配，支持任意 URL 自动识别

### 模式 4：AppKey 多平台签名

```rust
pub(crate) enum AppKeyStore {
    BiliTV,   // TV 端 APP_KEY
    Android,  // Android 端 APP_KEY
}
```

- 登录方式使用不同的 AppKey（BiliTV 或 Android），匹配对应端 B站 API
- 可扩展更多平台，当前已注释掉 5 组额外的 AppKey 对

## 四、数据流全景

### 上传数据流

```
CLI input → clap 解析 → upload_by_command()
  ├─ login_by_cookies() → Cookie文件 → BiliBili 实例
  ├─ 测速？→ Probe.probe() → 选择最优线路
  ├─ pre_upload() → B站预上传 → 获取 upload token
  ├─ 分片上传
  │   └─ Upos::upload_stream()
  │      └─ buffer_unordered(limit) 并发 PUT
  │      └─ 进度条：indicatif ProgressBar
  ├─ get_ret_video_info() → 确认上传完成
  └─ submit_by_app() → 稿件提交 → 发布
```

### 下载数据流

```
CLI input → download command
  ├─ find_extractor(url) → 匹配站点提取器
  ├─ Site::download()
  │   ├─ 自动检测 FLV / TS 格式
  │   ├─ LifecycleFile 管理文件生命周期
  │   └─ Segmentable 分段控制
  │       └─ HTTP-FLV 路径
  │       │   └─ parse_flv() → flv_parser(nom) → flv_writer
  │       └─ HLS 路径
  │           └─ m3u8 解析 → TS 分段下载
  └─ 写入磁盘
```

### 登录数据流

```
交互式菜单 → 选择登录方式
  ├─ 密码登录: get_key() → RSA 加密 → OAuth2 API → LoginInfo
  ├─ 短信登录: send_sms() → 输入验证码 → SMS API → LoginInfo
  ├─ 扫码登录: get_qrcode() → 轮询 → LoginInfo
  ├─ Cookie登录: 手动输入 → validate_tokens() → 可选 renew()
  └─ 统一输出: LoginInfo → JSON → cookies.json
```

## 五、状态管理与并发

### 锁机制

| 位置 | 锁类型 | 用途 |
|------|--------|------|
| `CookieStoreMutex` | `std::sync::Mutex` | 保护 Cookie 存储线程安全 |
| `UploadLock` | 文件锁 | 防止多个进程同时操作 Cookie 文件 |
| `ActorHandle` | `mpsc::channel` | Actor 消息传递，天然无锁 |

### Tokio 运行时

- 全局 `#[tokio::main]` 运行时
- 上传使用 `futures::stream` + `buffer_unordered` 控制并发
- Web 服务使用 `tokio::spawn` 创建 Actor 任务
- 主循环使用 `tokio::time::interval` 定时间隔

## 六、配置体系

### 三种配置方式

| 方式 | 说明 | 适用场景 |
|------|------|----------|
| **CLI 参数** | clap 命令行参数 | 手动单次操作 |
| **TOML 配置** | `upload_by_config` 读取 | 批量自动化上传 |
| **Web API** | Axum REST API | Web 界面管理 |

### 命令行通用参数

```bash
biliup [global options] <command> [args]

Global options:
  -p, --proxy <proxy>         # HTTP 代理
  -u, --user-cookie <FILE>    # Cookie 文件路径 (default: "cookies.json")
      --rust-log <LOG>        # 日志级别 (default: "tower_http=debug,info")
```

### 配置文件格式（TOML）

```toml
[[streamers]]
name = "频道名"
path = ["./video/**/*.mp4"]    # glob 模式匹配
title = "{name} - {date}"      # 模板变量
tid = 171
line = "bda2"
limit = 3
# ... 全部 Studio 字段
```

## 七、安全性设计

| 方面 | 实现 | 说明 |
|------|------|------|
| 密码传输 | RSA-OAEP 加密 (`Pkcs1v15Encrypt`) | 获取 B站 RSA 公钥后加密 |
| Cookie 存储 | 明文 JSON 文件 | 安全性依赖文件系统权限 |
| API 签名 | MD5 (参数排序 + appsec) | 所有请求需 sign 校验 |
| 代理支持 | 全链路 proxy 参数 | 支持所有 HTTP 操作经过代理 |
| CORS | Axum CORS 层 | `localhost:3000` 白名单 |

## 八、多平台支持

### Python 绑定 (stream-gears)

通过 PyO3 导出核心函数为 Python 模块：

| 函数 | 导出方式 |
|------|----------|
| `upload()` | Python 直接调用 |
| `download()` | Python 直接调用 |
| `login_by_xxx()` | 多种登录方式 |
| `send_sms()` | 短信发送 |
| `get_qrcode()` | 二维码获取 |

### Docker 部署

- 多阶段构建（builder: rust:1.67 → runtime: debian bullseye-slim）
- 依赖 libssl + ca-certificates
- CI/CD 支持交叉编译（x86_64 + aarch64）

## 九、总结

```
                          ┌──────────────┐
                          │  用户交互层    │
                          │ CLI / Web / Py│
                          └──────┬───────┘
                                 │
                    ┌────────────┴────────────┐
                    │   command 层 (biliup-cli) │
                    │   参数解析 + 流程编排      │
                    │   Server + Actor + SQLite │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  核心库层 (biliup)        │
                    │  Credential / BiliBili   │
                    │  Uploader / Downloader   │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  网络层 (HTTP Client)    │
                    │  reqwest + CookieStore + │
                    │  retry middleware        │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │  B站 开放 API            │
                    │  passport / member / upos│
                    └─────────────────────────┘
```

## 相关阅读

- [01-login.md](./01-login.md) — 登录模块深入
- [03-upload.md](./03-upload.md) — 上传模块深入
- [07-download.md](./07-download.md) — 下载模块深入
- [09-webui.md](./09-webui.md) — Web 管理服务
- [10-error-handling.md](./10-error-handling.md) — 错误处理
