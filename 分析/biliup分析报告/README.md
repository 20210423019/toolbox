# BiliUp 分析报告

> **biliup-cli v0.2.4** · B站(Bilibili) 命令行投稿与视频下载工具  
> **源码**：[biliup/biliup](https://github.com/biliup/biliup) (MIT, 5.3k Stars)  
> **文件**：`biliup.exe` (10.55 MB)

---

## 目录结构

```
biliup分析报告/
├── README.md                          ← 本文件：总入口
│
├── 功能分析/                          ← 11 个功能/架构的详细分析文档
│   ├── 01-login.md                    ← 登录 B站（6种方式 + 签名机制 + AppKey设计）
│   ├── 02-renew.md                    ← 刷新登录（Cookie 延期机制）
│   ├── 03-upload.md                   ← 上传视频（Probe测速/Upos直传/并发控制/断点续传）
│   ├── 04-append.md                   ← 追加视频分P（Vid合并策略）
│   ├── 05-list.md                     ← 列出稿件（状态筛选+分页）
│   ├── 06-show.md                     ← 查看详情（av/bv互转+统计数据）
│   ├── 07-download.md                 ← 下载视频（SiteDefinition插件系统 + FLV解析）
│   ├── 08-dump-flv.md                 ← FLV 元数据分析（nom 二进制解析）
│   ├── 09-webui.md                    ← ★新 Web 管理服务（Axum + SQLite + Actor模式）
│   ├── 10-error-handling.md           ← ★新 错误处理与异常策略系统分析
│   └── 11-architecture.md             ← ★新 项目架构深度分析（三crate/设计模式/数据流）
│
├── 设计稿/                            ← UI 设计原型
│   ├── biliup-ui-design.html          ← 可视化操作界面（含8个功能页）
│   └── feature-catalog.html           ← 所有功能清单速查
│
├── 可行性分析/
│   └── feasibility-analysis.md        ← 三种集成路径/风险/工作量评估
│
├── 测试/                              ← 测试脚本与报告
│   └── login-tests/
│       ├── mock_password.py           ← ① 密码登录模拟
│       ├── mock_qrcode.py             ← ② 扫码登录模拟
│       ├── mock_sms.py                ← ③ 短信登录模拟
│       ├── mock_browser.py            ← ④ 浏览器登录模拟
│       ├── mock_web_cookies.py        ← ⑤ Web Cookie登录模拟
│       ├── mock_webqr.py              ← ⑥ Web QR Cookie登录模拟
│       ├── mock_renew.py              ←    Cookie刷新模拟
│       ├── test-report.html           ←    可视化测试报告
│       └── all-features-test.py       ←    全功能测试脚本 (49项)
│
└── Tauri开发储备/                     ← Tauri 项目就绪代码
    ├── README.md                      ←   Tauri 技术方案
    ├── 功能验证速查手册.md              ←   每个功能的CLI/Rust/TS三段代码
    ├── all-features-report.html       ←   全功能测试报告
    ├── src/
    │   ├── main.rs                    ←   Tauri 入口
    │   ├── lib.rs                     ←   命令注册
    │   ├── biliup_cmd.rs              ←   进程调用封装
    │   └── commands.rs                ←   8 个 Tauri Command
    └── tests/
        └── all-features-test.py       ←   全功能测试 (49/49通过)
```

---

## 快速导航

| 你想做什么 | 看哪个 |
|-----------|--------|
| 了解这个程序有哪些功能 | [设计稿/feature-catalog.html](设计稿/feature-catalog.html) |
| 了解某个功能的源码细节 | [功能分析/](功能分析/) 对应文档 |
| 了解整体架构设计 | [11-architecture.md](功能分析/11-architecture.md) |
| 理解错误处理机制 | [10-error-handling.md](功能分析/10-error-handling.md) |
| 了解 Web 管理后台 | [09-webui.md](功能分析/09-webui.md) |
| 想做个可视化界面 | [设计稿/biliup-ui-design.html](设计稿/biliup-ui-design.html) |
| 评估能不能基于它做项目 | [可行性分析/feasibility-analysis.md](可行性分析/feasibility-analysis.md) |
| 想用 Tauri 做桌面应用 | [Tauri开发储备/](Tauri开发储备/) |
| 上手直接复制 Rust 代码 | [Tauri开发储备/功能验证速查手册.md](Tauri开发储备/功能验证速查手册.md) |
| 跑测试验证功能 | [Tauri开发储备/tests/all-features-test.py](Tauri开发储备/tests/all-features-test.py) |

---

## 关键发现

| 维度 | 结论 |
|------|------|
| **集成方案** | 推荐进程调用（`tauri-plugin-shell` 调用 biliup.exe），非 Rust 库集成 |
| **测试验证** | **49/49 全部通过** — 所有 8 个功能的 CLI 参数均已真实调用验证 |
| **Tauri 就绪** | Rust 后端代码可直接复制使用（biliup_cmd.rs + commands.rs） |
| **Cookie 方案** | 6 种登录方式输出统一 `{sessdata, bili_jct, dede_user_id, ac_time_value}` 格式 |
| **UI 设计稿** | 含 8 个功能页的交互式 HTML 原型（深色工业实用风） |
| **新发现：架构设计** | 项目采用三层 Crate 架构（biliup/biliup-cli/stream-gears），核心设计模式包括双客户端策略、SiteDefinition 插件系统、AppKey 多平台签名、Actor 并发模型 |
| **新发现：Web 管理服务** | 内置 Axum Web 服务器（默认端口 19159），提供 16 个 REST API 端点 + 6 张 SQLite 表，支持直播流自动录制与上传联动 |
| **新发现：错误处理** | 两层级重试机制（中间件 5 次 + 自定义 3 次抖动重试），覆盖网络/认证/文件/序列化全链路，Probe 测速、二维码轮询、断点续传、Cookie 自动刷新 4 大异常处理策略 |
