# 02-renew：刷新登录信息

## 功能概述

手动验证当前 `cookies.json` 中的登录信息是否有效，并在需要时刷新凭证。当登录过期或 tokens 需要更新时使用此命令重新验证。

## 命令用法

```bash
biliup renew
biliup renew --help
```

**选项**：无（自动读取 `cookies.json` 并进行刷新）

## 源码分析

### 模块位置

- **CLI 入口**：`crates/biliup-cli/src/uploader.rs` — `renew()` 函数
- **核心逻辑**：`crates/biliup/src/uploader/credential.rs`

### 核心刷新函数（源码细节）

`login_by_cookies` 函数集登录恢复 + 自动刷新于一体，是 renew 的核心：

```rust
pub async fn login_by_cookies(file: impl AsRef<Path>, proxy: Option<&str>) -> Result<BiliBili> {
    let mut file = std::fs::File::options()
        .read(true).write(true)   // 读写模式打开
        .open(file)?;
    let login_info: LoginInfo = serde_json::from_reader(
        std::io::BufReader::new(&file)
    )?;

    let client: Credential = Credential::new(proxy);
    // ① 验证 tokens 是否过期
    let need_refresh = client.validate_tokens(&login_info).await?;

    if need_refresh {
        // ② 需要刷新 → 刷新并覆盖写入
        let new_info = client.renew_tokens(login_info).await?;
        file.rewind()?;           // 回退到文件开头
        file.set_len(0)?;          // 清空文件
        serde_json::to_writer_pretty(
            std::io::BufWriter::new(&file),
            &new_info,
        )?;
        bilibili_from_info(new_info, proxy)
    } else {
        info!("无需更新cookie");
        bilibili_from_info(login_info, proxy)
    }
}
```

### Token 验证机制

```rust
pub async fn validate_tokens(&self, login_info: &LoginInfo) -> Result<bool> {
    let payload = json!({
        "access_key": login_info.token_info.access_token,
        "actionKey": "appkey",
        "appkey": AppKeyStore::Android.app_key(),
        "ts": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
    });

    // MD5 签名
    let urlencoded = serde_urlencoded::to_string(&payload)?;
    let sign = Self::sign(&urlencoded, AppKeyStore::Android.appsec());
    payload["sign"] = Value::from(sign);

    let response = self.0.client
        .get("https://passport.bilibili.com/x/passport-login/oauth2/info")
        .query(&payload).send().await?.json().await?;

    match response {
        ResponseData { data: Some(OAuthInfo { refresh, .. }), .. } => Ok(refresh),
        // refresh=true → 需要刷新；refresh=false → 仍然有效
        _ => Err(Kind::Custom(response.to_string())),
    }
}
```

### Token 刷新机制

```rust
pub async fn renew_tokens(&self, login_info: LoginInfo) -> Result<LoginInfo> {
    // 根据 platform 选择正确的 AppKey
    let keypair = match login_info.platform.as_deref() {
        Some("BiliTV")  => AppKeyStore::BiliTV,   // TV 端签名
        Some("Android") => AppKeyStore::Android,   // Android 端签名
        Some(_)  => return Err("未知平台".into()),
        None     => return Ok(login_info),          // 无平台信息则跳过
    };

    let payload = json!({
        "access_key": login_info.token_info.access_token,
        "actionKey": "appkey",
        "appkey": keypair.app_key(),
        "refresh_token": login_info.token_info.refresh_token,
        "ts": ...,
    });

    // MD5 签名
    let urlencoded = serde_urlencoded::to_string(&payload)?;
    let sign = Self::sign(&urlencoded, keypair.appsec());
    payload["sign"] = Value::from(sign);

    let response = self.0.client
        .post("https://passport.bilibili.com/x/passport-login/oauth2/refresh_token")
        .form(&payload).send().await?.json().await?;

    match response.data {
        Some(LoginInfo(info)) if !info.cookie_info.is_null() => {
            self.set_cookie(&info.cookie_info);     // 更新内存中的 Cookie
            Ok(LoginInfo { platform: login_info.platform, ..info })
        }
        _ => Err(Kind::Custom(response.to_string())),
    }
}
```

### 刷新结果验证

`login_by_cookies` 在执行 renew 后，自动用新信息重建 BiliBili 客户端：

```rust
bilibili_from_info(new_info, proxy)
// = set_cookie → BiliBili { client, login_info }
```

这意味着 renew + upload/list 等后续命令是**原子链**——一次调用覆盖"验证→刷新→使用"全流程。

## API 调用链路

| 步骤 | B站 API | 说明 |
|------|---------|------|
| 验证 | `api.bilibili.com/x/web-interface/nav` | 检查登录状态 |
| 刷新 | `passport.bilibili.com/x/passport-login/web/cookie/refresh` | 刷新 Cookie |

## 关键设计

### 1. 与 login 的关系

```
login (首次) ──→ cookies.json ──→ renew (后续维护)
                      │
                      ├─ 有效期检查
                      ├─ token 刷新
                      └─ 文件更新
```

`login` 和 `renew` 共享相同的文件读写机制（`fopen_rw`）。

### 2. 自动检测机制

`renew` 内部通过调用 `login_by_cookies` 尝试初始化 `BiliBili` 客户端：
```rust
// 伪代码逻辑
async fn renew(user_cookie, proxy) {
    let bili = login_by_cookies(&user_cookie, proxy).await?;
    // 如果 login_by_cookies 成功，说明 Cookie 有效
    // 如果需要手动交互刷新，则触发刷新流程
    // 更新文件
}
```

### 3. 全命令复用

所有需要认证的命令（upload / append / list / show）都通过 `login_by_cookies` 导入：
```rust
async fn login_by_cookies(
    user_cookie: PathBuf, 
    proxy: Option<&str>
) -> AppResult<BiliBili> {
    let file = fopen_rw(&user_cookie)?;
    let credential: Credential = serde_json::from_reader(file)?;
    // 验证 → 返回 BiliBili 客户端
}
```

## 开发注意事项

1. **过期判断**：B站 Cookie 默认有效期 30 天，刷新间隔应小于此期限
2. **刷新失败处理**：如刷新接口返回错误，应保留旧 Cookie 并提示用户重新 login
3. **文件锁定**：多进程并发刷新时需考虑文件锁（`upload_lock.rs` 已有机制）
4. **日志记录**：使用 `tracing` 记录刷新成功/失败日志，便于问题排查
5. **幂等设计**：即使 Cookie 未过期也应允许执行 renew 进行验证

## 与 login 差异对比

| 特性 | login | renew |
|------|-------|-------|
| 交互性 | 用户选择登录方式 | 自动验证，无交互 |
| 创建文件 | ✅ 首次创建 cookies.json | ❌ 文件必须已存在 |
| 刷新 tokens | ❌ 不刷新 | ✅ 刷新过期 tokens |
| 验证状态 | 验证后保存 | 验证+更新 |

## 代码使用示例

```rust
use biliup_cli::uploader::renew;
use std::path::PathBuf;

async fn refresh_session() {
    let cookie_path = PathBuf::from("cookies.json");
    match renew(cookie_path, None).await {
        Ok(_) => println!("Session refreshed successfully"),
        Err(e) => eprintln!("Failed to refresh: {:?}", e),
    }
}
```
