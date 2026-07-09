# 01-login：登录 B 站

## 功能概述

执行 B站 登录流程，支持多种登录方式，登录成功后保存登录凭证到 `cookies.json` 文件。该文件可被其他命令复用。

## 命令用法

```bash
biliup login
biliup login --help
```

**选项**：无（纯交互式流程）

## 源码分析

### 模块位置

- **CLI 入口**：`crates/biliup-cli/src/uploader.rs` — `login()` 函数（交互式菜单）
- **核心凭证**：`crates/biliup/src/uploader/credential.rs` — `Credential` 结构体 + 6 种登录方式 + 签名算法
- **API 封装**：`crates/biliup/src/uploader/bilibili.rs` — `BiliBili` 结构体

### Credential 结构体

```rust
// 实际源码中的 Credential —— 是对 StatefulClient 的包装
#[derive(Debug)]
pub struct Credential(StatefulClient);

// StatefulClient 携带 CookieStore 和 buvid 设备指纹
pub struct StatefulClient {
    pub client: reqwest::Client,
    pub cookie_store: Arc<CookieStoreMutex>,  // 线程安全共享
    pub buvid: String,                         // 随机生成设备标识
}
```

### LoginInfo 响应数据结构

```rust
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct LoginInfo {
    pub cookie_info: serde_json::Value,  // cookies 数组
    pub sso: Vec<String>,                 // SSO 登录 URL
    pub token_info: TokenInfo,            // OAuth2 token
    pub platform: Option<String>,         // 平台标识（Android/BiliTV）
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct TokenInfo {
    pub access_token: String,
    expires_in: u32,
    mid: u64,              // B站 用户 mid
    refresh_token: String,
}
```

### 函数签名
```rust
// CLI 入口
pub async fn login(
    user_cookie: PathBuf,    // Cookie 保存路径（默认 cookies.json）
    proxy: Option<&str>,     // 代理地址（可选）
) -> AppResult<()>

// 从 Cookie 文件恢复登录
pub fn bilibili_from_cookies(file: impl AsRef<Path>, proxy: Option<&str>) -> Result<BiliBili>

// 直接从 LoginInfo 恢复
pub fn bilibili_from_info(login_info: LoginInfo, proxy: Option<&str>) -> Result<BiliBili>

// 带自动刷新
pub async fn login_by_cookies(file: impl AsRef<Path>, proxy: Option<&str>) -> Result<BiliBili>
```

### 支持 6 种登录方式

| # | 方式 | 函数 | 说明 |
|---|------|------|------|
| 1 | 账号密码 | `login_by_password` | 输入用户名 + 密码，B站 API 验证 |
| 2 | 短信验证码 | `login_by_sms` | 手机号 + 验证码（含图形验证码处理） |
| 3 | 扫码登录 | `login_by_qrcode` | 终端显示二维码或保存为图片 |
| 4 | 浏览器登录 | `login_by_browser` | 打印登录 URL，复制到浏览器完成 |
| 5 | 网页 Cookie 1 | `login_by_web_cookies` | 手动输入 SESSDATA + bili_jct |
| 6 | 网页 Cookie 2 | `login_by_webqr_cookies` | 手动输入 SESSDATA + DedeUserID |

### 执行流程

```
① 用户选择登录方式 (交互式菜单)
    │
② 对应 login_by_xxx 函数执行
    │
③ B站 API 认证 → 获取 token / cookie
    │
④ 保存到 cookies.json (fopen_rw 读写打开)
    │
⑤ 验证登录状态 → 打印结果
```

### 关键数据结构

```rust
// biliup-core 中的 Credential 结构
pub struct Credential {
    pub phone: Option<String>,        // 手机号（短信登录）
    pub password: Option<String>,     // 密码（密码登录）
    pub sessdata: Option<String>,     // SESSDATA Cookie
    pub bili_jct: Option<String>,     // bili_jct Cookie
    pub dede_user_id: Option<String>, // DedeUserID Cookie
    pub ac_time_value: Option<String>,// ac_time_value Cookie
}
```

## API 调用链路

| 步骤 | B站 API | 说明 |
|------|---------|------|
| 密码登录 | `passport.bilibili.com/api/v3/oauth2/login` | 用户名密码认证 |
| 短信登录 | `passport.bilibili.com/api/v3/sms/login` | 手机短信验证 |
| 二维码生成 | `passport.bilibili.com/x/passport-login/web/qrcode/generate` | 生成二维码 |
| 二维码扫码 | `passport.bilibili.com/x/passport-login/web/qrcode/poll` | 轮询扫码结果 |
| Cookie 验证 | `api.bilibili.com/x/web-interface/nav` | 验证登录状态 |

## 关键设计

### 1. 交互式菜单设计

`login` 函数通过标准输入输出提供交互式菜单：
```
请选择登录方式:
  1. 账号密码登录
  2. 短信验证码登录
  3. 扫码登录
  4. 浏览器登录
  5. 手动输入 Cookie (SESSDATA + bili_jct)
  6. 手动输入 Cookie (SESSDATA + DedeUserID)
```

### 2. 文件操作

使用 `fopen_rw` 辅助函数以读写模式打开 Cookie 文件（自动创建/覆盖）：
```rust
pub fn fopen_rw<P: AsRef<Path>>(path: P) -> AppResult<std::fs::File> {
    // 创建父目录 → 以读写方式打开/创建文件
}
```

### 3. Credential 管理

- 各种登录方式统一返回 `LoginInfo`（包含 tokens + cookie_info）
- 最终序列化为 JSON 写入 `cookies.json`
- `renew` 命令依赖此文件的 tokens 进行刷新

### 4. API 签名机制 (sign)

所有 B站 API 请求都需要 MD5 签名：

```rust
pub fn sign(param: &str, app_sec: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("{param}{app_sec}"));
    format!("{:x}", hasher.finalize())
}
```

**流程**：参数 URL 编码 → 拼接 appsec → MD5 哈希 → 16 进制字符串 → 追加到请求

### 5. 多平台 AppKey 设计

```rust
pub(crate) enum AppKeyStore {
    BiliTV,   // TV 端：app_key="4409e2ce8ffd12b8", appsec="59b43e04ad6965f34319062b478f83dd"
    Android,  // Android 端：app_key="783bbb7264451d82", appsec="2653583c8873dea268ab9386918b1d65"
}
```

- **密码/短信登录** → 使用 `Android` 端 AppKey（模拟 Android 客户端）
- **扫码登录** → 使用 `BiliTV` 端 AppKey（模拟 TV 客户端）
- **代码中另注释有 5 组备选 AppKey**（历史遗留/备用）

### 6. Cookie 设置机制

```rust
fn set_cookie(&self, cookie_info: &serde_json::Value) {
    let mut store = self.0.cookie_store.lock().unwrap();
    for cookie in cookie_info["cookies"].as_array().unwrap() {
        let cookie = Cookie::build((cookie["name"].as_str().unwrap(),
                                    cookie["value"].as_str().unwrap()))
            .domain("bilibili.com")
            .into();
        store.insert_raw(&cookie, &Url::parse("https://bilibili.com/").unwrap()).unwrap();
    }
}
```

- 遍历 `cookie_info.cookies` 数组，逐个设置到 CookieStore
- 统一 domain 设为 `bilibili.com`
- B站 将 SESSDATA, bili_jct, DedeUserID, ac_time_value 作为多个 cookie 返回

### 7. 二维码登录轮询（无超时设计）

```rust
pub async fn login_by_qrcode(&self, value: Value) -> Result<LoginInfo> {
    loop {
        tokio::time::sleep(Duration::from_secs(1)).await;
        let res = self.0.client.post(...)...;
        match res {
            code: 0, data: Some(Login(info)) => break Ok(info),     // 成功
            code: 86039, .. => continue,                            // 未扫码，继续轮询
            _ => break Err(Kind::Custom(...))                       // 其他错误终止
        }
    }
}
```

- 轮询间隔：1 秒
- 退出条件：成功(0) 或非 86039 错误码
- **没有超时机制**：理论上可能无限循环，建议使用时注意

## 开发注意事项

1. **敏感信息处理**：密码输入建议屏蔽回显（Rust 的 `rpassword` crate 或类似机制）
2. **验证码处理**：短信登录可能触发图形验证码，需提供输入接口
3. **二维码显示**：终端兼容性有限，建议同时支持保存为图片文件
4. **Cookie 有效期**：B站 Cookie 通常有效期为 30 天，需配合 `renew` 命令定期刷新
5. **并发安全**：使用 `upload_lock.rs` 中的 `UploadLock` 防止多进程同时操作 Cookie

## 代码使用示例

```rust
// 在代码中调用登录（伪代码）
use biliup_cli::uploader::login;

#[tokio::main]
async fn main() {
    let cookie_path = PathBuf::from("cookies.json");
    login(cookie_path, None).await.unwrap();
}
```

## 相关阅读

- [02-renew.md](./02-renew.md) — 刷新登录信息
- [03-upload.md](./03-upload.md) — 上传视频依赖登录信息
