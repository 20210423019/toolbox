# 06-show：查看稿件详情

## 功能概述

根据 av 或 bv 号查询指定稿件的详细信息并输出 JSON，包括标题、简介、统计数据、分P列表等。

## 命令用法

```bash
biliup show <VID>
biliup show --help
```

### 参数详解

| 参数 | 类型 | 说明 |
|------|------|------|
| `VID` | `Vid` | av 号（如 `av12345`）或 bv 号（如 `BV1xx`) |

## 源码分析

### 模块位置

- **文件**：`crates/biliup-cli/src/uploader.rs`
- **函数签名**：
```rust
pub async fn show(
    user_cookie: PathBuf,    // Cookie 文件
    vid: Vid,                // 稿件 ID
    proxy: Option<&str>,     // 代理
) -> AppResult<()>
```

## 执行流程

```
① 解析 VID 参数 → Vid 枚举
    │
② login_by_cookies() → BiliBili 客户端
    │
③ bili.video_data(vid) → 调用 B站 API 获取详情
    │
④ serde_json::to_string_pretty() → 格式化输出
    │
⑤ 打印 JSON
```

## API 调用链路

| 步骤 | B站 API | 说明 |
|------|---------|------|
| 视频详情 | `api.bilibili.com/x/web-interface/view?bvid={bvid}` | 获取视频详细信息 |
| 可选 | `api.bilibili.com/x/web-interface/view?aid={aid}` | 通过 av 号查询 |

## 数据结构 (Video 结构体)

```rust
// 核心视频信息结构
#[derive(Serialize, Deserialize, Debug)]
pub struct Video {
    pub aid: u64,                // av号
    pub bvid: String,            // bv号
    pub title: String,           // 标题
    pub cover: String,           // 封面
    pub desc: String,            // 简介
    pub duration: u64,           // 总时长(秒)
    pub owner: Owner,            // 作者信息
    pub stat: VideoStat,         // 统计数据
    pub pages: Vec<Page>,        // 分P列表
    pub pubdate: u64,            // 发布时间戳
    pub tid: u32,                // 分区ID
    pub tname: String,           // 分区名称
    pub tag: String,             // 标签
    pub copyright: u8,           // 版权类型
    pub dynamic: String,         // 动态
    pub mission_id: Option<u64>, // 创作任务
    pub ugc_season: Option<Season>, // 合集信息
}

pub struct Owner {
    pub mid: u64,        // 用户ID
    pub name: String,    // 用户名
    pub face: String,    // 头像URL
}

pub struct VideoStat {
    pub view: u32,       // 播放
    pub danmaku: u32,    // 弹幕
    pub reply: u32,      // 评论
    pub favorite: u32,   // 收藏
    pub coin: u32,       // 硬币
    pub share: u32,      // 分享
    pub like: u32,       // 点赞
}

pub struct Page {
    pub cid: u64,        // 分P ID
    pub page: u32,       // 分P号
    pub part: String,    // 分P名称
    pub duration: u64,   // 分P时长
}
```

## 关键设计

### 1. av/bv 互转

`Vid` 枚举内部自动处理 av 号和 bv 号的互转：
```rust
pub enum Vid {
    Av(u64),
    Bv(String),
}

impl Vid {
    // av → bv 或 bv → av 的算法转换
    pub fn to_bv(&self) -> String { ... }
    pub fn to_av(&self) -> u64 { ... }
}
```

### 2. JSON 输出

`show` 函数直接利用 `serde_json::to_string_pretty` 将获取到的 `Video` 结构体格式化为易读的 JSON 输出。

## 开发注意事项

1. **数据完整性**：`video_data` 返回的数据包含所有统计字段，可用于数据分析和监控
2. **公开/私有**：可以查看任意公开稿件的详情（无需登录），私有稿件需登录验证
3. **输出格式**：JSON 输出便于管道处理（`jq` 等工具解析），可增加 `--json` / `--table` 选项

## 使用示例

### 命令行
```powershell
# 通过 bv 号查看
biliup show BV1GJ411x7xY

# 通过 av 号查看
biliup show av123456
```

### 输出示例 (JSON)
```json
{
  "aid": 123456,
  "bvid": "BV1GJ411x7xY",
  "title": "视频标题",
  "desc": "视频简介",
  "duration": 3600,
  "owner": {
    "mid": 10086,
    "name": "用户名",
    "face": "https://..."
  },
  "stat": {
    "view": 10000,
    "danmaku": 500,
    "reply": 200,
    "favorite": 1000,
    "coin": 800,
    "share": 300,
    "like": 2000
  },
  "pages": [
    {
      "cid": 10001,
      "page": 1,
      "part": "P1 开场",
      "duration": 120
    }
  ],
  "pubdate": 1720000000,
  "tid": 171,
  "tname": "直播"
}
```

### Rust 调用
```rust
use biliup_cli::uploader::show;
use biliup::uploader::util::Vid;

async fn get_video_info() {
    let vid = Vid::Bv("BV1GJ411x7xY".to_string());
    show("cookies.json".into(), vid, None).await.unwrap();
}
```

## 相关阅读

- [05-list.md](./05-list.md) — 列出所有稿件
- [03-upload.md](./03-upload.md) — 上传新视频
