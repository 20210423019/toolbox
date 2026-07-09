# 04-append：追加视频到已有稿件

## 功能概述

向已发布的 B站 稿件（通过 av 或 bv 号指定）追加新的视频分P。适用于补充分P、修正内容等场景。

## 命令用法

```bash
biliup append [OPTIONS] --vid <VID> [VIDEO_PATH]...
biliup append --help
```

**必填参数**：

| 参数 | 说明 |
|------|------|
| `-v, --vid <VID>` | 目标稿件的 av 或 bv 号 |

### 参数详解

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--vid` | `Vid` | **必填** | av 号 (如 `av12345`) 或 bv 号 (如 `BV1xx`) |
| `VIDEO_PATH` | `Vec<PathBuf>` | — | 追加的视频文件（可多个） |
| `-l, --line` | `UploadLine` | 自动 | 上传线路 |
| `--limit` | `usize` | `3` | 并发数 |
| `--submit` | `SubmitOption` | `client` | 提交接口 |
| `-c, --config` | `PathBuf` | — | 配置文件路径 |

> 其余参数 (title/desc/tag/tid/cover 等) 与 `upload` 命令一致。

## 源码分析

### 模块位置

- **文件**：`crates/biliup-cli/src/uploader.rs`
- **函数签名**：
```rust
pub async fn append(
    user_cookie: PathBuf,           // Cookie 文件
    vid: Vid,                       // 目标稿件 ID
    video_path: Vec<PathBuf>,       // 追加视频路径列表
    line: Option<UploadLine>,       // 上传线路
    limit: usize,                   // 并发数
    submit: SubmitOption,           // 提交接口
    proxy: Option<&str>,            // 代理
) -> AppResult<()>
```

## Vid 类型

```rust
// Vid 枚举 - 支持 av 号和 bv 号
pub enum Vid {
    Av(u64),    // av123456
    Bv(String), // BV1GJ411x7xY
}
```

## 执行流程

```
① 解析 --vid 参数 → Vid 枚举
    │
② login_by_cookies() → BiliBili 客户端
    │
③ 获取已发布稿件 → 获取已有 videos 列表
    │
④ upload() → 上传新视频文件
    │   ├─ 断点续传
    │   ├─ 并发上传
    │   └─ 返回已上传 Video 列表
    │
⑤ 合并新旧 videos → 调用编辑接口
    │
⑥ 更新稿件
    │
⑦ 打印结果
```

## API 调用链路

| 步骤 | B站 API | 说明 |
|------|---------|------|
| 稿件查询 | `api.bilibili.com/x/web-interface/view` | 获取稿件详情 |
| 上传视频 | `member.bilibili.com/x/vu/client/add` | 上传新视频（同 upload） |
| 编辑稿件 | `member.bilibili.com/x/vu/client/edit` | 更新视频分P列表 |

## 关键设计

### 1. 合并策略

```
原始稿件 videos: [video_a, video_b]
新上传 videos:    [video_c, video_d]
合并后 videos:    [video_a, video_b, video_c, video_d]
                     ↑ 保留原顺序 ↑ 追加到末尾
```

`append` 函数将新上传的 videos 追加到原有列表末尾，然后调用编辑 API 更新稿件。

### 2. 断点续传复用

`append` 内部调用的 `upload()` 函数与 `upload` 命令使用的是同一个核心上传函数，因此断点续传机制完全一致。

### 3. 与 upload 共享参数逻辑

```rust
// 在 main.rs 中的路由
Commands::Append => {
    let submit = cmd.submit.unwrap_or(SubmitOption::App);
    append(user_cookie, cmd.vid, cmd.video_path, 
           cmd.line, cmd.limit, submit, 
           cli.proxy.as_deref()).await?
}
```

## 开发注意事项

1. **VID 解析**：自动识别 av/bv 号格式，av 号为纯数字，bv 号为 "BV" 开头
2. **稿件编辑限制**：已过审稿件可追加分P，但需注意 B站 对稿件编辑频率有限制
3. **数据一致性**：合并 videos 列表时需保持类型一致（所有 Video 结构体）
4. **错误处理**：如果稿件不存在或无权限编辑，需提供明确错误提示

## 使用场景对比

| 场景 | 推荐命令 |
|------|----------|
| 新建投稿 | `upload` |
| 补充已发布的稿件 | `append` |
| 批量修正已发布合集 | `append` (多次调用) |

## 代码使用示例

```rust
use biliup_cli::uploader::append;

async fn add_clip_to_video() {
    let vid = Vid::Bv("BV1GJ411x7xY".to_string());
    append(
        "cookies.json".into(),
        vid,
        vec!["new_clip.mp4".into()],
        None,       // 自动选择线路
        3,          // 3并发
        SubmitOption::App,
        None,
    ).await.unwrap();
}
```

## 相关阅读

- [03-upload.md](./03-upload.md) — 核心上传逻辑
- [05-list.md](./05-list.md) — 查询已有稿件
- [06-show.md](./06-show.md) — 查看稿件详情
