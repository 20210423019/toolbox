# 07-download：下载视频/直播流

## 功能概述

从 B站 或支持的直播平台下载视频/直播流，支持文件命名模板、按大小/时长分割。

## 命令用法

```bash
biliup download [OPTIONS] <URL>

# 基本下载
biliup download https://live.bilibili.com/12345

# 自定义输出文件名
biliup download -o "./videos/{title}.flv" https://live.bilibili.com/12345

# 按大小分割 (1GB 每段)
biliup download --split-size 1G https://live.bilibili.com/12345

# 按时长分割 (30分钟)
biliup download --split-time 30m https://live.bilibili.com/12345
```

## 参数详解

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `<URL>` | `String` | 必填 | 直播/视频 URL |
| `-o, --output` | `String` | `{title}` | 输出文件名模板，`{title}` 替换为视频标题 |
| `--split-size` | `u64` | 无 | 按文件大小分割（支持 K/M/G 后缀） |
| `--split-time` | `Duration` | 无 | 按时间分割（如 30m, 1h） |

## 源码分析

### 模块位置

- **下载入口**：`crates/biliup/src/downloader/mod.rs` — 自动检测 FLV/TS
- **提取器系统**：`crates/biliup/src/downloader/extractor.rs` — SiteDefinition trait + 3 站点注册
- **FLV 处理**：`crates/biliup/src/downloader/httpflv.rs` — FLV 流下载
- **HLS 处理**：`crates/biliup/src/downloader/hls.rs` — m3u8/TS 下载
- **FLV 解析**：`crates/biliup/src/downloader/flv_parser.rs` — nom 实现的完整 FLV 二进制解析
- **FLV 写入**：`crates/biliup/src/downloader/flv_writer.rs` — FLV 文件写入
- **工具**：`crates/biliup/src/downloader/util.rs` — LifecycleFile, Segmentable

### 站点提取器（SiteDefinition 插件系统）

以类似设计模式中的"策略模式"，提供统一的流提取接口：

```rust
#[async_trait]
pub trait SiteDefinition {
    fn can_handle_url(&self, url: &str) -> bool;
    async fn get_site(&self, url: &str, client: StatelessClient) -> Result<Site>;
    fn as_any(&self) -> &dyn Any;
}

const EXTRACTORS: [&(dyn SiteDefinition + Send + Sync); 3] = [
    &bilibili::BiliLive {},   // B站直播
    &huya::HuyaLive {},       // 虎牙直播
    &douyu::DouyuLive,        // 斗鱼直播
];
```

#### B站提取器（bilibili.rs）
```rust
impl SiteDefinition for BiliLive {
    fn can_handle_url(&self, url: &str) -> bool {
        url.starts_with("https://live.bilibili.com/")
        || url.starts_with("https://link.bilibili.com/p/eden/")   
    }

    async fn get_site(...) -> Result<Site> {
        // 请求 B站 直播间 API → 提取 FLV 流地址
        // 返回 Site { name, title, direct_url, extension: Flv }
    }
}
```

#### 斗鱼提取器（douyu.rs）
```rust
impl SiteDefinition for DouyuLive {
    fn can_handle_url(&self, url: &str) -> bool {
        url.starts_with("https://www.douyu.com/")
    }

    async fn get_site(...) -> Result<Site> {
        // 斗鱼 MD5 签名算法获取真实流地址
        // 返回 FLV 流
    }
}
```

#### 虎牙提取器（huya.rs）
```rust
impl SiteDefinition for HuyaLive {
    fn can_handle_url(&self, url: &str) -> bool {
        url.starts_with("https://www.huya.com/")
    }

    async fn get_site(...) -> Result<Site> {
        // 虎牙正则提取流信息
        // 返回 FLV 或 HLS 流
    }
}
```

### 流类型自动检测

```rust
impl Site {
    pub async fn download(&mut self, fmt_file_name: &str, segment: Segmentable, ...) -> Result<()> {
        let fmt_file_name = fmt_file_name.replace("{title}", &self.title);
        match self.extension {
            Extension::Flv => {
                // HTTP-FLV 路径
                let file = LifecycleFile::new(&fmt_file_name, "flv", hook);
                let response = self.client.retryable(&self.direct_url).await?;
                let mut connection = Connection::new(response);
                connection.read_frame(9).await?;  // 跳过 FLV header
                httpflv::parse_flv(connection, file, segment).await?
            }
            Extension::Ts => {
                // HLS 路径
                let file = LifecycleFile::new(&fmt_file_name, "ts", hook);
                hls::download(&self.direct_url, &self.client, file, segment).await?
            }
        }
    }
}
```

### FLV 格式解析（关键）

基于 `nom` 解析器组合库实现完整的 FLV 二进制解析：

```rust
// flv_parser.rs

// FLV 头部 (9 bytes)
// Signature: "FLV" (3 bytes)
// Version: 1 (1 byte)  
// TypeFlags: 0x05=audio+video (1 byte)
// DataOffset: 9 (4 bytes big-endian)

// FLV Tag (header 11 bytes + data)
// TagType: 8=audio, 9=video, 18=script (1 byte)
// DataSize: tag 数据长度 (3 bytes)
// Timestamp: 毫秒级时间戳 (3+1 bytes)
// StreamID: 0 (3 bytes)
// ← PreviousTagSize (4 bytes, 循环)
```

**花屏处理机制**：
- 缓存关键帧前的 `metadata`、`AAC sequence header`、`H.264 sequence header`
- 分割文件时，在新文件开头重新写入缓存的 sequence header
- 确保每个分割片段可独立播放

### 分段控制（Segmentable）

```rust
// util.rs
pub enum Segmentable {
    No,
    Time(Duration),    // 按时长分割
    Size(u64),         // 按大小分割
}
```

- 支持并发分段写入不同的文件
- 自动计算下一个段的起始位置
- 保留关键帧序列保证每一段可独立播放

### 文件生命周期（LifecycleFile）

```rust
// util.rs
pub struct LifecycleFile {
    pub file_name: String,       // 基础文件名
    extension: &'static str,     // 扩展名 (flv/ts)
    hook: Option<CallbackFn>,    // 完成后回调
}
```

- 管理文件的创建、写入和关闭
- 支持完成后的回调通知（如用于联动的 WebUI 上传触发）

## 执行流程

```
用户输入 URL
    │
    ├─① find_extractor(url) → 匹配站点
    │   ├─ live.bilibili.com/xxx → BiliLive 提取器
    │   ├─ douyu.com/xxx → DouyuLive 提取器
    │   └─ huya.com/xxx → HuyaLive 提取器
    │
    ├─② get_site() → 获取流信息
    │   ├─ 名称: {直播间标题}
    │   ├─ 类型: FLV / TS
    │   └─ 直连 URL: {...}
    │
    ├─③ download() → 开始下载
    │   ├─ 文件名模板替换 ({title} 等)
    │   │
    │   ├─ [FLV 路径]
    │   │   ├─ LifecycleFile 创建 .flv 文件
    │   │   ├─ client.retryable() → 获取 stream
    │   │   ├─ skip FLV header (9 bytes)
    │   │   ├─ parse_flv() 逐 tag 解析
    │   │   │   ├─ 缓存 metadata / sequence header
    │   │   │   ├─ 写入 flv_writer
    │   │   │   └─ 分段检查 → 是否分割
    │   │   └─ 完成
    │   │
    │   └─ [HLS 路径]
    │       ├─ LifecycleFile 创建 .ts 文件
    │       ├─ 解析 m3u8 → 获取 TS 片段列表
    │       ├─ 逐段下载
    │       └─ 完成
    │
    └─④ 输出完成信息
```

## 关键设计

### 1. 重新连接与重试

```rust
// client.rs StatelessClient
let retry_policy = ExponentialBackoff::builder().build_with_max_retries(5);
let client_with_middleware = ClientBuilder::new(client.clone())
    .with(RetryTransientMiddleware::new_with_policy(retry_policy))
    .build();

// 自定义 retry 函数（带抖动）
pub async fn retry<F, Fut, O, E: Display>(f: F, max_retries: u32) -> Result<O, E> {
    // 指数退避 + 抖动 (jitter_factor * min(2^wait, 64))
}
```

### 2. 文件名模板

| 变量 | 替换值 | 说明 |
|------|--------|------|
| `{title}` | 直播间标题 | 由 get_site() 获取 |
| 时间格式 | strftime | 如 `%Y-%m-%d` `%H_%M_%S` |

### 3. 断流恢复

下载过程中如直播断流，HTTP 连接会保持（keep-alive），流恢复后继续写入。
- FLV 模式：持续解析 tag，流中断后 connection.read_frame 返回空 → 退出循环
- HLS 模式：轮询 m3u8 获取新 segment

## 开发注意事项

1. **磁盘空间**：直播录制可能产生大量数据，需监控剩余空间
2. **文件名冲突**：同时录制多个直播时确保文件名唯一
3. **FLV 花屏**：分段场景需要通过序列 header 保证播放兼容性
4. **重试策略**：网络不稳定时中间件的 5 次自动重试提供基本保障
5. **时间戳处理**：FLV 时间戳可能溢出（超过 24 天录制），需处理回绕

## API 调用链路

| 步骤 | B站/平台 API | 说明 |
|------|-------------|------|
| B站流地址 | `api.live.bilibili.com/room/v1/Room/playUrl` | 获取 FLV 直链 |
| 斗鱼流地址 | `open.douyucdn.cn/...` + MD5 签名 | 获取 FLV 直链 |
| 虎牙流地址 | 页面正则提取 + `hycdn` 解析 | 获取 FLV/HLS 流 |
| 文件写入 | 本地磁盘 | FLV 文件 / TS 文件 |

## 相关阅读

- [08-dump-flv.md](./08-dump-flv.md) — FLV 元数据提取与分析
- [09-webui.md](./09-webui.md) — Web 管理服务（下载 Actor + SQLite 记录）
- [10-error-handling.md](./10-error-handling.md) — 错误处理与重试策略

## 命令用法

```bash
biliup download [OPTIONS] <URL>
biliup download --help
```

### 参数详解

| 参数 | 类型 | 说明 |
|------|------|------|
| `URL` | `String` | 视频/直播链接 |

### 选项详解

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-o, --output` | `String` | `{title}` | 输出文件名模板 |
| `--split-size` | `Option<u64>` | 无 | 按字节大小分割 |
| `--split-time` | `Option<humantime::Duration>` | 无 | 按时长分割 |

### 文件名模板

支持以下占位符：

| 占位符 | 说明 | 示例 |
|--------|------|------|
| `{title}` | 视频/直播标题 | `我的视频` |
| `%Y` | 年份 (4位) | `2026` |
| `%m` | 月份 (2位) | `07` |
| `%d` | 日期 (2位) | `05` |
| `%H` | 小时 (2位) | `21` |
| `%M` | 分钟 (2位) | `30` |
| `%S` | 秒 (2位) | `00` |

## 源码分析

### 模块位置

- **文件**：`crates/biliup-cli/src/downloader.rs`
- **函数签名**：
```rust
pub async fn download(
    url: &str,                          // 视频/直播 URL
    output: String,                     // 输出文件名模板
    split_size: Option<u64>,            // 按大小分割（字节）
    split_time: Option<humantime::Duration>, // 按时长分割
) -> AppResult<()>
```

## 执行流程

```
① 解析 URL 和输出参数
    │
② 构建 Segmentable (分片配置)
    │
③ 构建 LiveRequest (包含 HTTP 客户端、URL、选项)
    │
④ 遍历内置插件列表 builtin_plugins()
    │   └─ 调用 plugin.matches(url) → 找到匹配的流媒体插件
    │
⑤ plugin.check_stream(request) → 检测流状态
    │   ├─ LiveStatus::Live { stream } → 在线，继续
    │   └─ LiveStatus::Offline → 离线，警告退出
    │
⑥ 根据 stream.downloader_hint 选择下载方式
    │   ├─ StreamGears / Ffmpeg → download_stream()
    │   └─ Streamlink / YtDlp → 不支持（提示使用服务端录制）
    │
⑦ download_stream() 执行实际下载
    │   ├─ 处理 m3u8/ts 分段流
    │   ├─ 或处理 flv 流
    │   ├─ 可选按大小/时间分割
    │   └─ 进度跟踪
    │
⑧ 输出文件保存
```

## 数据结构

```rust
// 分片配置
pub struct Segmentable {
    pub split_time: Option<Duration>,  // 按时长分割
    pub split_size: Option<u64>,       // 按大小分割
}

// 直播请求
pub struct LiveRequest {
    pub client: reqwest::Client,   // HTTP 客户端
    pub url: String,               // 直播 URL
    pub name: String,              // 标识名
    pub options: LiveOptions,       // 选项
    pub credentials: LiveCredentials, // 凭据
}

// 流状态
pub enum LiveStatus {
    Live { stream: LiveStream },   // 在线
    Offline,                       // 离线
}

// 直播流信息
pub struct LiveStream {
    pub raw_stream_url: String,              // 流地址
    pub stream_headers: Vec<(String, String)>, // HTTP 请求头
    pub title: String,                       // 标题
    pub platform: String,                    // 平台名
    pub downloader_hint: DownloaderHint,     // 下载器提示
}

// 下载器提示
pub enum DownloaderHint {
    StreamGears,  // 内置下载器
    Ffmpeg,       // FFmpeg 下载
    Streamlink,   // Streamlink 运行时
    YtDlp,        // yt-dlp 运行时
}
```

## 插件系统

### 内置插件 (builtin_plugins)

`download` 函数使用插件系统适配不同直播平台：

```rust
fn builtin_plugins() -> Vec<Box<dyn LivePlugin>> {
    vec![
        // B站 直播插件
        Box::new(BilibiliPlugin::new()),
        // 斗鱼直播插件
        Box::new(DouyuPlugin::new()),
        // 虎牙直播插件
        Box::new(HuyaPlugin::new()),
        // 抖音直播插件
        Box::new(DouyinPlugin::new()),
        // Twitch 直播插件
        Box::new(TwitchPlugin::new()),
        // YouTube 直播插件
        Box::new(YoutubePlugin::new()),
        // 更多平台...
    ]
}
```

每个插件实现 `LivePlugin` trait：
```rust
#[async_trait]
pub trait LivePlugin: Send + Sync {
    /// 判断是否处理此 URL
    fn matches(&self, url: &str) -> bool;
    
    /// 检查直播流状态
    async fn check_stream(&self, request: LiveRequest) -> Result<LiveStatus, Box<dyn Error>>;
}
```

## 下载方式

### 支持的内置下载 (StreamGears / Ffmpeg)

```rust
async fn download_stream(
    stream_url: &str,
    headers: &[(String, String)],
    title: &str,
    output: &str,
    segmentable: Segmentable,
) -> AppResult<()> {
    // 根据流类型选择处理方式:
    // - HLS (m3u8) → 下载 TS 分片
    // - FLV → 直接下载
    // - 其他 → 按原始格式下载
    
    // 可选: 按时长/大小分割
    if segmentable.split_time.is_some() || segmentable.split_size.is_some() {
        // 分片下载逻辑
    }
    
    // 文件名格式化（替换 {title} 和日期占位符）
    let filename = format_filename(output, title);
    
    // 写入文件...
}
```

### 不支持的下载方式

对于 `Streamlink` 和 `YtDlp` 提示的流，直接返回错误：
```
biliup download 不支持 {platform} 的 {hint} 运行时下载，请使用服务端录制链路
```

## 关键设计

### 1. 插件匹配机制

```rust
let Some(plugin) = builtin_plugins()
    .into_iter()
    .find(|plugin| plugin.matches(url))
else {
    warn!("not find extractor for {url}");
    return Ok(());
};
```

- 按顺序尝试每个插件
- `matches()` 通过 URL 模式匹配判断
- 未找到匹配插件时静默退出（记录 warn 日志）

### 2. 文件名模板处理

```rust
// 使用 time crate 格式化时间
let now = OffsetDateTime::now_local()?;
let formatted = format_description!("[year]-[month]-[day]T[hour]_[min]_[second]");
let time_str = now.format(&formatted)?;
let filename = output
    .replace("{title}", title)
    .replace("%Y", &time_str[..4])
    .replace("%m", &time_str[5..7])
    // ...
```

### 3. 流状态检测

离线检测不是靠 HTTP 状态码，而是通过插件逻辑判断：
```rust
let status = plugin.check_stream(request).await?;
let LiveStatus::Live { stream } = status else {
    warn!("stream is offline: {url}");
    return Ok(());
};
```

## 开发注意事项

1. **适合直播流**：此 `download` 命令主要针对**直播流**下载设计，非 B站 录播视频
2. **插件开发**：如需支持新平台，实现 `LivePlugin` trait 并注册到 `builtin_plugins()`
3. **流格式兼容**：不同平台返回的流格式各异（m3u8/flv/rtmp），下载器需处理多种格式
4. **大文件处理**：不分片时长时间直播文件可能非常大，建议默认启用分割
5. **HTTP 客户端**：使用 `reqwest::Client` 管理连接池，支持自定义 headers

## 使用示例

### 命令行
```powershell
# 下载 B站 直播流
biliup download https://live.bilibili.com/12345

# 指定输出路径和文件名模板
biliup download -o "./recordings/%Y-%m-%dT%H_%M_%S-{title}.flv" https://live.bilibili.com/12345

# 按时长分割（每30分钟一个文件）
biliup download --split-time 30min https://live.bilibili.com/12345

# 按大小分割
biliup download --split-size 500M https://live.bilibili.com/12345
```

### Rust 调用
```rust
use biliup_cli::downloader::download;
use std::time::Duration;

async fn download_live() {
    download(
        "https://live.bilibili.com/12345",
        "./recordings/{title}.flv".to_string(),
        None,                                       // 不分大小
        Some(Duration::from_secs(1800).into()),    // 30分钟分割
    ).await.unwrap();
}
```

## 相关阅读

- [08-dump-flv.md](./08-dump-flv.md) — FLV 元数据分析
- [03-upload.md](./03-upload.md) — 下载后可上传投稿
