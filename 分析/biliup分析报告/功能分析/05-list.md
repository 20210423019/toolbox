# 05-list：列出已上传稿件

## 功能概述

查询并列出当前 B站 账号下的所有已投稿件，支持按状态筛选和分页查询。

## 命令用法

```bash
biliup list [OPTIONS]
biliup list --help
```

### 参数详解

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--is-pubing` | `bool` | `false` | 只显示审核中的稿件 |
| `--pubed` | `bool` | `false` | 只显示已通过的稿件 |
| `--not-pubed` | `bool` | `false` | 只显示未通过的稿件 |
| `-f, --from-page` | `u32` | `1` | 起始页码 |
| `-m, --max-pages` | `Option<u32>` | 无限制 | 最大页数 |

### 状态筛选说明

三个状态选项互斥，同时指定多个 = 任意匹配：
- 均未指定 → 显示所有状态
- `--pubed` → 仅显示已通过
- `--is-pubing` → 仅显示审核中
- `--not-pubed` → 仅显示未通过

## 源码分析

### 模块位置

- **文件**：`crates/biliup-cli/src/uploader.rs`
- **函数签名**：
```rust
pub async fn list(
    user_cookie: PathBuf,        // Cookie 文件
    is_pubing: bool,              // 审核中
    pubed: bool,                  // 已通过
    not_pubed: bool,              // 未通过
    proxy: Option<&str>,         // 代理
    from_page: u32,              // 起始页
    max_pages: Option<u32>,      // 最大页数
) -> AppResult<()>
```

## 执行流程

```
① 解析筛选参数 → 构建查询条件
    │
② login_by_cookies() → BiliBili 客户端
    │
③ 循环分页请求 (从 from_page 到 max_pages)
    │   ├─ 请求第 N 页数据
    │   ├─ 解析视频列表
    │   └─ 本地状态筛选
    │
④ 打印结果 (JSON 格式)
```

## API 调用链路

| 步骤 | B站 API | 说明 |
|------|---------|------|
| 稿件列表 | `member.bilibili.com/x/web/archives` | 获取投稿列表（分页） |
| URL | `GET member.bilibili.com/x/web/archives?type=1&pn={page}&ps=30` | 每页 30 条 |

## 数据结构

```rust
// B站 API 返回的稿件信息
pub struct ArchiveItem {
    pub aid: u64,          // av 号
    pub bvid: String,      // bv 号
    pub title: String,     // 标题
    pub cover: String,     // 封面 URL
    pub state: u8,         // 状态：0=通过, 1=审核中, 2=未通过
    pub pubdate: u64,      // 发布时间
    pub desc: String,      // 简介
    pub tag: String,       // 标签
    pub tid: u32,          // 分区 ID
    pub copyright: u8,     // 版权类型
    pub view: u32,         // 播放数
    pub danmaku: u32,      // 弹幕数
    pub reply: u32,        // 评论数
    pub favorite: u32,     // 收藏数
    pub coin: u32,         // 硬币数
    pub share: u32,        // 分享数
    pub like: u32,         // 点赞数
}
```

## 关键设计

### 1. 分页循环

```rust
// 伪代码：分页请求逻辑
async fn list(...) {
    let mut page = from_page;
    let mut total_pages = 0;
    
    loop {
        let response = fetch_page(bili, page).await?;
        
        if max_pages.is_none() {
            total_pages = response.total_pages;
        } else {
            total_pages = min(response.total_pages, max_pages.unwrap());
        }
        
        for item in response.items {
            // 本地状态筛选
            if matches_filter(item, is_pubing, pubed, not_pubed) {
                print_item(item);
            }
        }
        
        page += 1;
        if page > total_pages { break; }
    }
}
```

### 2. 状态筛选逻辑

三个布尔值是本地筛选而非 API 端过滤。API 返回所有稿件，然后：
```rust
fn matches_filter(item: &ArchiveItem, is_pubing: bool, pubed: bool, not_pubed: bool) -> bool {
    if is_pubing && item.state == 1 { return true; }
    if pubed && item.state == 0 { return true; }
    if not_pubed && item.state == 2 { return true; }
    // 均未指定 = 显示全部
    !is_pubing && !pubed && !not_pubed
}
```

## 开发注意事项

1. **分页限制**：不加 `-m` 限制时可能遍历所有页（大量请求），建议生产环境设置上限
2. **API 限流**：频繁分页请求可能触发 B站 API 限流，建议请求间加短延迟
3. **输出格式**：当前输出为 JSON，开发时可增加可读性格式化选项
4. **大账号处理**：投稿量大的账号（数千稿件）建议增加 `--max-pages` 限制

## 使用示例

### 命令行
```powershell
# 查看所有稿件
biliup list

# 只看已通过稿件，前5页
biliup list --pubed -f 1 -m 5

# 查看审核中稿件
biliup list --is-pubing
```

### Rust 调用
```rust
use biliup_cli::uploader::list;

async fn check_uploads() {
    list(
        "cookies.json".into(),
        false,  // is_pubing
        true,   // pubed
        false,  // not_pubed
        None,   // proxy
        1,      // from_page
        Some(10), // max_pages
    ).await.unwrap();
}
```

## 相关阅读

- [06-show.md](./06-show.md) — 查看单个稿件详情
- [03-upload.md](./03-upload.md) — 上传新视频
