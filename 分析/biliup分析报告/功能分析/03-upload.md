# 03-upload：上传视频（核心功能）

## 功能概述

将本地视频文件上传到 B站 并提交为稿件。支持单P/多P投稿、定时发布、多线路选择、并发控制、断点续传等高级特性。

## 命令用法

```bash
biliup upload [OPTIONS] [VIDEO_PATH]...

# 直接上传
biliup upload video.mp4

# 多P投稿
biliup upload ep01.mp4 ep02.mp4 ep03.mp4

# 完整参数
biliup upload --title "标题" --tag "标签1,标签2" --tid 171 --desc "简介" \
              --cover cover.jpg --line bda2 --limit 5 --dtime 1720000000 \
              --dolby 1 --hires 1 --no-reprint 1 --open-elec 1 \
              video.mp4
```

## 参数详解

### 视频路径参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `VIDEO_PATH` | `Vec<PathBuf>` | 视频文件路径列表，多个文件 = 多P投稿 |

### 投稿选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--submit` | `SubmitOption` | `client` | 提交接口：`client` / `app` / `web` |
| `-c, --config` | `PathBuf` | 无 | 配置文件路径（替代命令行参数） |
| `--title` | `String` | 空 | 视频标题 |
| `--desc` | `String` | 空 | 视频简介 |
| `--dynamic` | `String` | 空 | 空间动态文字 |
| `--tag` | `String` | 空 | 视频标签（逗号分隔） |
| `--tid` | `u32` | `171` (直播) | 投稿分区 ID |
| `--cover` | `String` | 空 | 封面图片路径 |
| `--copyright` | `u8` | `1` (自制) | `1`=自制, `2`=转载 |
| `--source` | `String` | 空 | 转载来源 |
| `--dtime` | `i64` | 无 | 定时发布（10位Unix时间戳） |
| `--interactive` | `u8` | `0` | 互动视频 |
| `--mission-id` | `u64` | 无 | 创作任务 ID |

### 传输选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `-l, --line` | `UploadLine` | 自动探测 | 上传线路：`bda2` `ws` `qn` `bldsa` `tx` `txa` `bda` `alia` |
| `--limit` | `usize` | `3` | 单视频文件最大并发分片数 |

### 音质选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--dolby` | `u8` | `0` | 杜比音效：`0`=关闭, `1`=开启 |
| `--hires` | `u8` | `0` | Hi-Res：`0`=关闭, `1`=开启 |

### 版权选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--no-reprint` | `u8` | `0` | 禁止转载：`0`=允许, `1`=禁止 |
| `--open-elec` | `u8` | `0` | 开启充电：`0`=关闭, `1`=开启 |
| `--up-selection-reply` | `bool` | `false` | 精选评论（仅 `app` 接口） |
| `--up-close-reply` | `bool` | `false` | 关闭评论（仅 `app` 接口） |
| `--up-close-danmu` | `bool` | `false` | 关闭弹幕（仅 `app` 接口） |

### 高级选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `--extra-fields` | `String` | 自定义提交参数（JSON 字符串） |

## 源码分析

### 模块位置

- **CLI 入口**：`crates/biliup-cli/src/uploader.rs` — `upload_by_command()` / `upload_by_config()` / `upload()` / `cover_up()`
- **线路引擎**：`crates/biliup/src/uploader/line.rs` — 8 条线路定义 + `Probe` 测速 + `Parcel` 分片上传
- **Upos 实现**：`crates/biliup/src/uploader/line/upos.rs` — Upos 直传线路（唯一激活的线路引擎）
- **数据结构**：`crates/biliup/src/uploader/bilibili.rs` — `Studio`, `Video`, `Archive`, `Vid`, `BiliBili`, `ResponseData`
- **文件流**：`crates/biliup/src/uploader/mod.rs` — `VideoFile`, `VideoStream`, `Config`
- **配置**：`crates/biliup/src/uploader/mod.rs` — `load_config()` 读取 YAML 配置文件

### 上传引擎架构

```
Line (线路定义)
├─ os: Uploader     ─── 线路类型 (当前仅 Upos 有效)
├─ probe_url        ─── 探针 URL
├─ query            ─── 预上传请求参数
└─ cost             ─── 测速延迟 (ms)

Parcel (分片执行单元)
├─ line: Bucket     ─── 具体存储桶 (Upos/Kodo/Cos)
├─ video_file       ─── 视频文件句柄
└─ upload()         ─── 执行分片上传

Bucket (存储桶枚举)
├─ Upos(bucket)     ─── B站自建 UPOS 上传
├─ Kodo(...)        ─── 七牛云 (已注释)
└─ Cos(...)         ─── 腾讯云 (已注释)
```

### BiliBili 结构的 API 方法

```rust
pub struct BiliBili {
    pub client: reqwest::Client,    // HTTP 客户端（复用登录状态）
    pub login_info: LoginInfo,      // 登录凭证
}

impl BiliBili {
    // 提交稿件（3 种接口）
    submit(studio, proxy)            // 客户端接口（已废弃，自动回退到 app）
    submit_by_app(studio, proxy)     // APP 接口（当前主力）
    edit_by_web(studio)              // Web 编辑接口（修改已有稿件）

    // 查询
    video_data(vid, proxy)           // 查询视频 JSON 信息
    studio_data(vid, proxy)          // 获取完整的 Studio 数据
    my_info()                        // 获取用户信息
    archive_pre()                    // 投稿预检
    recommend_tag(subtype_id, ...)   // 标签推荐
    recent_archives(status, ...)     // 列出稿件
    cover_up(input)                  // 封面上传

    // 辅助
    get_csrf()                       // 从 cookie 中提取 bili_jct
}
```

### Studio 最终提交数据结构

```rust
pub struct Studio {
    pub copyright: u8,                          // 1=自制, 2=转载
    pub source: String,                         // 转载来源
    pub tid: u16,                               // 分区 ID (171=直播)
    pub cover: String,                          // 封面 URL
    pub title: String,                          // 标题（必填）
    pub desc_format_id: u32,                     // 简介格式 ID
    pub desc: String,                           // 简介
    pub desc_v2: Option<Vec<Credit>>,           // 简介 v2（结构化简介）
    pub dynamic: String,                        // 空间动态
    pub subtitle: Subtitle,                     // 字幕
    pub tag: String,                            // 标签（逗号分隔）
    pub videos: Vec<Video>,                     // 已上传视频列表
    pub dtime: Option<u32>,                     // 定时发布时间戳
    pub open_subtitle: bool,                    // 开放字幕
    pub interactive: u8,                        // 互动视频
    pub mission_id: Option<u32>,                // 创作任务
    pub dolby: u8,                              // 杜比音效
    pub lossless_music: u8,                     // Hi-Res
    pub no_reprint: u8,                         // 禁止转载
    pub open_elec: u8,                          // 开启充电
    pub aid: Option<u64>,                       // 追加时目标 aid
    pub up_selection_reply: bool,               // 精选评论
    pub up_close_reply: bool,                   // 关闭评论
    pub up_close_danmu: bool,                   // 关闭弹幕
    pub extra_fields: Option<HashMap<String, Value>>,  // 自定义参数
}
```

## 执行流程

```
用户输入命令
    │
    ├─① 解析参数 → 构建 Studio
    │
    ├─② login_by_cookies() → 读取 cookies.json → 获取 BiliBili 客户端
    │
    ├─③ 如果有封面文件 → cover_up() → 上传封面 → 获取封面 URL
    │
    ├─④ upload() → 核心上传过程
    │   ├─ 加载 UploadCheckpoint (断点续传检查)
    │   ├─ Probe 探测最优上传线路（未指定 line 时）
    │   ├─ 对每个视频文件：
    │   │   ├─ 跳过已上传文件
    │   │   ├─ 分片 (chunk)
    │   │   ├─ 并发上传分片 (limit=N)
    │   │   ├─ Progressbar 追踪进度
    │   │   └─ 记录到 checkpoint
    │   ├─ 保存 checkpoint
    │   └─ 全部完成 → 删除 checkpoint
    │
    ├─⑤ 提交稿件 → B站 API
    │
    └─⑥ 打印结果
```

## 断点续传机制 (UploadCheckpoint)

### 数据结构

```rust
#[derive(Serialize, Deserialize)]
pub struct UploadCheckpoint {
    pub videos: Vec<Video>,          // 已完成的视频
    pub uploaded_files: Vec<String>, // 已上传的文件路径列表
}
```

### 方法

| 方法 | 说明 |
|------|------|
| `load(bili: &BiliBili, path: &Path)` | 从本地数据目录加载 checkpoint |
| `save(bili: &BiliBili, path: &Path)` | 保存 checkpoint 到磁盘 |
| `is_uploaded(file: &Path)` | 检查文件是否已上传 |
| `add_video(video: Video)` | 记录已上传的视频 |

### 存储位置

```
{dirs::data_local_dir()}/biliup/checkpoint/{video_path_hash}.json
```

### 设计要点

1. **哈希标识**：基于视频文件路径的哈希值作为 checkpoint 文件名
2. **增量保存**：每个视频上传成功后立即保存 checkpoint
3. **自动清理**：全部视频上传完成后删除 checkpoint 文件
4. **故障恢复**：上传中断后重新运行，自动跳过已完成文件

## 并发控制

使用 `futures::StreamExt` 控制分片上传并发：

```rust
// 伪代码：limit 控制并发分片数
let upload_stream = futures::stream::iter(chunks)
    .map(|chunk| upload_chunk(bili, chunk))
    .buffer_unordered(limit);

while let Some(result) = upload_stream.next().await {
    // 处理每个分片上传结果
    progress_bar.inc(1);
}
```

## 上传线路探测 (Probe)

当未指定 `--line` 参数时自动执行探针测速，核心代码在 `line.rs`：

```rust
impl Probe {
    pub async fn probe(client: &reqwest::Client) -> Result<Line> {
        // ① 从 B站获取线路列表
        let res: Self = client
            .get("https://member.bilibili.com/preupload?r=probe")
            .send().await?.json().await?;

        let mut choice_line: Line = Default::default();
        for mut line in res.lines {
            // ② 逐条探测线路延迟
            let instant = Instant::now();
            let probe_url = format!("https:{}", line.probe_url);
            let method = if res.probe["get"].is_null() { POST } else { GET };
            if method(probe_url).send().await?.status().is_success() {
                line.cost = instant.elapsed().as_millis();
                // ③ 选择延迟最小的线路
                if choice_line.cost > line.cost {
                    choice_line = line
                }
            }
        }
        Ok(choice_line)
    }
}
```

### 8 条预定义线路

| 线路 | CDN 提供商 | 探针 URL | 查询参数 |
|------|-----------|---------|---------|
| **bda2** | 百度加速 2 | `//upos-cs-upcdnbda2.bilivideo.com/OK` | `probe_version=20221109&upcdn=bda2&zone=cs` |
| **ws** | 网宿 | `//upos-cs-upcdnws.bilivideo.com/OK` | `probe_version=20221109&upcdn=ws&zone=cs` |
| **qn** | 七牛 | `//upos-cs-upcdnqn.bilivideo.com/OK` | `probe_version=20221109&upcdn=qn&zone=cs` |
| **bldsa** | 百度 BL-DSA | `//upos-cs-upcdnbldsa.bilivideo.com/OK` | `zone=cs&upcdn=bldsa&probe_version=20221109` |
| **tx** | 腾讯云 | `//upos-cs-upcdntx.bilivideo.com/OK` | `zone=cs&upcdn=tx&probe_version=20221109` |
| **txa** | 腾讯云加速 | `//upos-cs-upcdntxa.bilivideo.com/OK` | `zone=cs&upcdn=txa&probe_version=20221109` |
| **bda** | 百度加速 | `//upos-cs-upcdnbda.bilivideo.com/OK` | `zone=cs&upcdn=bda&probe_version=20221109` |
| **alia** | 阿里云加速 | `//upos-cs-upcdnalia.bilivideo.com/OK` | `zone=cs&upcdn=alia&probe_version=20221109` |

**默认线路**：`bda2`

### 预上传流程

```rust
// line.rs Line::pre_upload()
pub async fn pre_upload(&self, bili: &BiliBili, video_file: VideoFile) -> Result<Parcel> {
    let params = json!({
        "r": self.os,          // 线路类型 (当前仅 Upos)
        "profile": "ugcupos/bup",
        "ssl": 0,
        "version": "2.11.0",
        "build": 2110000,
        "name": file_name,
        "size": total_size,
    });

    let response = bili.client
        .get("https://member.bilibili.com/preupload?{self.query}")
        .query(&params).send().await?;

    // 根据 os 类型返回对应的 Bucket
    match self.os {
        Uploader::Upos => Ok(Parcel { line: Bucket::Upos(response.json().await?), video_file }),
    }
}
```

### 分片上传（Upos 直传）

`Parcel::upload()` 执行分片传输：

```rust
// line.rs
pub async fn upload(self, client: StatelessClient, limit: usize, ...) -> Result<Video> {
    match self.line {
        Bucket::Upos(bucket) => {
            let chunk_size = bucket.chunk_size;  // B站指定的分片大小
            let upos = Upos::from(client, bucket, retry).await?;
            let mut parts = Vec::new();
            let stream = upos.upload_stream(progress(...), self.video_file.total_size, limit).await?;

            tokio::pin!(stream);
            while let Some((part, _size)) = stream.try_next().await? {
                parts.push(part);
            }
            // 获取上传结果（合并分片）
            upos.get_ret_video_info(&parts, &self.video_file.filepath).await?
        }
    }
}
```

## API 调用链路

| 步骤 | B站 API | 说明 |
|------|---------|------|
| 登录 | `passport.bilibili.com` | 验证 tokens |
| 预上传 | `member.bilibili.com/x/vu/client/add` | 初始化上传会话 |
| 上传分片 | `upos.bilibili.com` | 分片上传（HTTP PUT） |
| 分片合并 | `member.bilibili.com/x/vu/client/upload_complete` | 合并已完成的分片 |
| 封面上传 | `member.bilibili.com/x/vu/web/cover/up` | 上传封面 |
| 提交稿件 | `member.bilibili.com/x/vu/client/submit` | 最终提交审核 |

## 配置上传模式

除命令行参数外，还支持通过 TOML 配置文件上传：

```toml
[[streamers]]
name = "频道名"
# 文件模式匹配
path = ["./video/**/*.mp4"]
# 投稿设置
title = "{name} - {date}"
desc = "自动上传的视频"
tid = 171
tag = "标签1,标签2"
copyright = 1
line = "bda2"
limit = 3
```

`upload_by_config` 函数遍历配置中的每个 `streamer`，匹配文件模式后依次执行上传。

## 开发注意事项

1. **文件大小**：B站 单文件上限约 8GB，超大文件需考虑分割
2. **重试策略**：分片上传建议实现指数退避重试（3-5 次）
3. **流量控制**：`limit` 参数控制网络并发，默认 3，建议根据带宽调整
4. **文件格式**：支持常见视频格式（mp4/flv/mkv/avi 等），B站 服务端会转码
5. **文件名模板**：配置文件中支持 `{name}`/`{date}` 等占位符变量
6. **错误处理**：使用 `error_stack` 提供上下文错误信息
7. **日志级别**：通过 `--rust-log` 控制，建议调试时设为 `debug`

## 典型使用场景

### 基本投稿
```rust
// Rust 代码中调用
use biliup_cli::uploader::{upload_by_command, login_by_cookies};
use biliup::uploader::util::SubmitOption;

async fn upload_video() {
    let bili = login_by_cookies("cookies.json".into(), None).await.unwrap();
    upload_by_command(
        studio,
        "cookies.json".into(),
        vec!["video.mp4".into()],
        None,
        3,
        SubmitOption::App,
        None,
    ).await.unwrap();
}
```

### 批量脚本 (PowerShell)
```powershell
# 批量上传目录下所有 mp4
$videos = Get-ChildItem .\videos\*.mp4
foreach ($v in $videos) {
    biliup upload --title $v.BaseName --tag "批量" --tid 188 $v.FullName
}
```

## 相关阅读

- [01-login.md](./01-login.md) — 登录获取凭证
- [04-append.md](./04-append.md) — 追加视频分P
- [05-list.md](./05-list.md) — 查询已上传稿件
