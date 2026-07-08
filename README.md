# 🔧 ToolBox — 多功能视频工具箱

> 一个基于 Tauri + React + TypeScript 的多功能视频管理桌面应用。

---

## 📦 特性

### 📹 视频管理
- **库管理** — 多分类 + 多库结构，自由组织视频资源
- **标签系统** — 树形标签分类，支持多选、过滤、搜索
- **批量操作** — 批量标签标记、整理、重命名、元数据编辑
- **视频编码** — 批量转码、参数预设管理
- **智能扫描** — 自动识别视频文本文件（小说、简介、字幕、封面、音频）

### 🔍 扫描与归类
- **智能文本扫描引擎** — 启发式分类算法，自动识别小说/简介/字幕/封面/音频
- **扫描规则配置** — 分类规则、置信度阈值、扫描参数、音频配对规则全自定义
- **封面提取** — 自动缩略图生成，720p 高清封面

### 🏷️ 标签管理
- **树形标签** — 支持父/子层级，拖拽排序
- **标签值** — 每个标签可绑定多个预设值
- **批量标记** — 快速为视频打标签

### 🎨 界面
- **毛玻璃质感** — 深色暗蓝主题，玻璃卡片设计
- **双视图** — 卡片视图 / 列表视图，Ctrl+滚轮缩放
- **自定义主题** — 支持深色/浅色主题

### 🧰 其他
- **统一日志查看器** — 控制台日志 / 清理日志 / 扫描记录 / 错误详情
- **全局设置** — 语言、字体、主题、扫描规则完整可配置

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | **Tauri v1** |
| 前端框架 | **React 18** + **TypeScript** |
| 构建工具 | **Vite 5** |
| 状态管理 | **Zustand** |
| 后端语言 | **Rust** (edition 2018) |
| 数据库 | **SQLite** (rusqlite) |
| 图片处理 | **image-rs** (JPEG / PNG / WebP) |
| 虚拟列表 | **@tanstack/react-virtual** |

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites) 系统依赖

### 安装与运行

```bash
# 1. 安装前端依赖
npm install

# 2. 开发模式运行
npm run dev

# 3. 构建生产版本
npm run build
```

> 开发服务器默认运行在 `http://localhost:1420`

### Tauri 命令

```bash
# 启动 Tauri 桌面应用
npm run tauri dev

# 构建桌面安装包
npm run tauri build
```

---

## 📁 项目结构

```
toolbox/
├── src/                    # 前端源码 (React + TypeScript)
│   ├── components/         # 通用 UI 组件
│   ├── config/             # 配置常量
│   ├── hooks/              # 自定义 Hooks
│   ├── layouts/            # 布局组件
│   ├── mock/               # 模拟数据
│   ├── modules/            # 功能模块
│   │   ├── burn/           # 刻录模块
│   │   ├── library/        # 库管理模块
│   │   ├── processing/     # 处理模块
│   │   ├── system/         # 系统模块
│   │   └── video/          # 视频管理模块
│   ├── store/              # Zustand 状态管理
│   ├── theme/              # 主题系统
│   ├── types/              # TypeScript 类型定义
│   └── utils/              # 工具函数
├── src-tauri/              # 后端源码 (Rust)
│   └── src/
│       ├── command/        # Tauri 命令
│       ├── config/         # 配置
│       ├── domain/         # 领域模型
│       ├── error/          # 错误处理
│       ├── infra/          # 基础设施
│       ├── repository/     # 数据仓库
│       └── service/        # 业务服务
├── designs/                # 设计文档 HTML
├── dist/                   # 构建输出
├── index.html              # 入口 HTML
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 📝 开发说明

- **前端**: `npm run dev` — Vite HMR 开发服务器
- **Rust 后端**: `npm run test:rust` — 运行 Rust 测试
- **TypeScript**: `npx tsc --noEmit` — 类型检查
- **Rust**: `cargo check` — 编译检查

---

## 📄 许可证

[MIT](./LICENSE)
