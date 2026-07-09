# 10-error-handling：错误处理与异常策略分析

## 概述

biliup 作为一个网络密集型的 CLI 工具（HTTP API 通信 + 大文件上传下载），错误处理覆盖了多个层级。本章系统分析项目的错误处理机制、异常场景应对策略以及潜在风险。

## 错误类型系统

### 核心错误枚举

```rust
// crates/biliup/src/error.rs
pub enum Kind {
    Custom(String),                      // 自定义错误消息
    IO(std::io::Error),                  // 文件 I/O 错误
    Reqwest(reqwest::Error),             // HTTP 请求错误
    ReqwestMiddleware(reqwest_middleware::Error), // 中间件错误
    InvalidHeaderValue,                  // 无效 HTTP 头值
    InvalidHeaderName,                   // 无效 HTTP 头名
    SerdeYaml(serde_yaml::Error),        // YAML 解析错误
    SerdeJson(serde_json::Error),        // JSON 解析错误
    SerdeUrl(serde_urlencoded::ser::Error), // URL 编码错误
    AnyhowError(anyhow::Error),          // 通用错误
    NeedRecaptcha(String),               // 需要极验验证码（含 URL）
}
```

### 设计特点

| 特性 | 说明 |
|------|------|
| `thiserror` 派生 | 自动实现 `Display` + `Error` trait |
| `#[from]` 自动转换 | `?` 操作符直接转换 IO/Reqwest/Serde 等标准错误 |
| `From<String>` | 字符串可直接转为 `Kind::Custom`，方便快速报错 |
| 完整错误链 | `reqwest` → `reqwest_middleware` → `serde` 全链路覆盖 |

### 下载器单独的错误类型

```rust
// crates/biliup/src/downloader/error.rs
// 另有独立的错误类型用于下载模块
```

## 异常场景与应对策略

### 1. 网络请求重试

**场景**：HTTP 请求因网络波动/服务端限流临时失败

**策略**：两层级重试

#### 层级一：中间件自动重试

```rust
// crates/biliup/src/client.rs
let retry_policy = ExponentialBackoff::builder().build_with_max_retries(5);
let client_with_middleware = ClientBuilder::new(client.clone())
    .with(RetryTransientMiddleware::new_with_policy(retry_policy))
    .build();
```

- **指数退避**：自动计算重试间隔（1s → 2s → 4s → ...）
- **最大重试**：5 次
- **覆盖范围**：所有通过 `client_with_middleware` 发起的请求

#### 层级二：自定义重试函数

```rust
// crates/biliup/src/lib.rs
pub async fn retry<F, Fut, O, E: Display>(f: F, max_retries: u32) -> Result<O, E>
```

- **抖动退避**：`jitter_factor * min(2^wait, 64)` 防止惊群效应
- **调用位置**：下载器中的 HTTP 请求使用 `client.retryable()` 调用此函数
- **最大重试**：3 次（硬编码）

### 2. 密码加密失败

**场景**：B站 RSA 公钥获取失败或加密异常

```rust
let (key_hash, pub_key) = self.get_key().await?;
let pub_key = RsaPublicKey::from_public_key_pem(&pub_key).unwrap();
let enc_data = pub_key.encrypt(&mut rng, Pkcs1v15Encrypt, ...)?;
```

**风险**：`from_public_key_pem` 使用 `unwrap()`，如果公钥格式变更会 panic。

### 3. 二维码过期/重试

**场景**：扫码登录二维码过期未扫

```rust
pub async fn login_by_qrcode(&self, value: Value) -> Result<LoginInfo> {
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let raw = self.0.client.post(...)...;
        match res {
            ResponseData { code: 0, data: Some(LoginInfo(info)), .. } => break Ok(info),
            ResponseData { code: 86039, .. } => { continue; }  // 未扫码，继续轮询
            _ => break Err(...)  // 其他错误终止
        }
    }
}
```

- 循环间隔：1 秒
- 退出条件：成功(0) 或 非 86039 的错误码
- **没有超时机制**：理论上可能无限循环

### 4. 上传中断与断点续传

**场景**：大文件上传过程中网络中断/程序退出

```rust
// UploadCheckpoint 机制
pub struct UploadCheckpoint {
    pub videos: Vec<Video>,          // 已完成的视频
    pub uploaded_files: Vec<String>, // 已上传的文件路径列表
}
```

- **存储位置**：`{data_local_dir}/biliup/checkpoint/{视频路径hash}.json`
- **增量保存**：每个视频完成后立即保存
- **故障恢复**：重新上传时自动跳过已完成文件
- **自动清理**：全部完成后删除 checkpoint

### 5. 并发分片上传失败

**场景**：多分片并发上传时部分分片失败

```rust
// futures::stream::iter(chunks)
//     .map(|chunk| upload_chunk(bili, chunk))
//     .buffer_unordered(limit);
```

- **并发控制**：`buffer_unordered(limit)` 限制最大并发数
- **失败处理**：单分片失败 → `?` 操作符传播错误 → 整个上传流程终止
- **改进空间**：未实现分片级别重试，需依赖上层重试

### 6. Cookie 过期与自动刷新

**场景**：Cookies 过期导致的 API 401

```rust
pub async fn login_by_cookies(file: impl AsRef<Path>, proxy: Option<&str>) -> Result<BiliBili> {
    let need_refresh = client.validate_tokens(&login_info).await?;
    if need_refresh {
        let new_info = client.renew_tokens(login_info).await?;
        file.rewind()?; file.set_len(0)?;  // 覆盖写入
        serde_json::to_writer_pretty(..., &new_info)?;
    }
}
```

- **自动检测**：调用 `oauth2/info` 验证 token 有效性
- **自动刷新**：过期时调用 `oauth2/refresh_token` 获取新 token
- **自动持久化**：刷新后的 token 覆盖写入文件

### 7. B站 API 错误处理

```rust
// BiliBili 各方法中的错误处理模式
ResponseData {
    code: 0,
    data: Some(v),
    ..
} => Ok(v)

_ => Err(Kind::Custom(format!("{res:?}")))
```

- `code != 0` → 转换为 `Kind::Custom` 错误
- `data: None` → 同样视为错误
- 错误信息包含完整的 ResponseData 序列化，方便调试

## 未覆盖的异常场景

| 场景 | 风险 | 建议 |
|------|------|------|
| **无限轮询** | 二维码轮询无超时退出 | 添加超时（建议 120 秒） |
| **公钥 unwrap** | B站 API 变更导致 panic | 改用 `?` 传播错误 |
| **分片级重试** | 单分片失败导致全文件重传 | 实现分片级重试（3 次后放弃） |
| **大文件检查** | 超过 8GB 时上传可能失败 | 上传前预检查文件大小 |
| **速率限制** | 频繁 API 调用可能被限流 | 实现自适应速率控制 |
| **磁盘空间** | Flv 下载写入时磁盘满 | 写入前检查可用空间 |
| **部分成功** | 多P上传时部分成功部分失败 | 实现原子提交或部分回滚 |

## 重试机制对比

| 特性 | 中间件重试 | 自定义 retry() |
|------|-----------|----------------|
| 策略 | 指数退避 | 抖动指数退避 |
| 最大次数 | 5 | 3 |
| 适用范围 | 所有中间件请求 | `retryable()` 方法 |
| 抖动 | 无 | 有（均匀随机） |
| 错误匹配 | 自动（瞬态错误） | 手动（所有错误） |

## 日志追踪

项目使用 `tracing` crate 提供结构化日志：

```rust
use tracing::{info, warn};

info!("通过cookie登录");
info!("pre_upload: {}", params);
warn!("客户端接口已失效, 将使用APP接口");
```

```bash
# 控制日志级别
biliup --rust-log debug <command>
```

- 默认级别：`tower_http=debug,info`
- 关键操作点：登录、预上传、分片上传、线路探测、错误回退

## 相关阅读

- [01-login.md](./01-login.md) — 登录中的密码加密与二维码轮询
- [03-upload.md](./03-upload.md) — 上传中的断点续传与并发控制
- [07-download.md](./07-download.md) — 下载中的重试与流处理
- [11-architecture.md](./11-architecture.md) — 架构总览中的错误传播路径
