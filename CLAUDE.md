# BondCat — Tauri 桌宠游戏

## 源码位置（**唯一权威**）
- 当前目录 `/root/bondcat/` 就是源码根
- GitHub: https://github.com/shuitian23-bot/bondcat.git
- 本地 Mac **没有** clone（只有 DMG 安装包在 `~/Downloads/bondcat-*`）
- 所有改动在这台新加坡服务器完成，push 到 GitHub 后本地 Mac pull 构建 DMG

## 技术栈
- Tauri 2.x（Rust 后端 + WKWebView 前端）
- 前端：**纯 HTML/JS**（`src/`，不是 Vite/React/Vue）
- Rust 后端：`src-tauri/`
- Bundle ID: `com.baiyubot.bondcat`
- 当前版本: 见 `package.json` 和 `src-tauri/tauri.conf.json`

## 窗口特征
- 500×160 透明 + alwaysOnTop + decorations=false + skipTaskbar=true = 桌面浮动小猫
- `macOSPrivateApi: true`，CSP 关闭

## 关键路径
| 路径 | 说明 |
|---|---|
| `src/` | 前端 HTML/JS/CSS/资源（index.html + assets/） |
| `src-tauri/` | Rust 后端 |
| `src-tauri/src/` | Rust 源码（CGEventTap 全局键盘监听在此） |
| `src-tauri/tauri.conf.json` | Tauri 配置 |
| `src-tauri/Cargo.toml` | Rust 依赖 |
| `_gen/` | 生成产物 |
| `ITER_LOG.md` | 每次迭代日志，**改动后必写** |

## 构建流程
新加坡是 **Linux 服务器，不能本地 build DMG**。流程：

```bash
# 1. 在新加坡改代码 → commit → push
cd /root/bondcat
git add -A && git commit -m "..." && git push

# 2. 本地 Mac (或 CI) 构建
git pull
cd src-tauri && cargo tauri build
```

开发调试：
```bash
npm install
npm run tauri dev   # 需要 macOS 或 Linux 桌面环境
```

## 已知问题（避免反复踩）
- **macOS 输入监控权限不自动弹窗**：需在 Rust 侧调 `IOHIDRequestAccess`
- **反复构建 → 签名变 → TCC 权限失效**：解法 `tccutil reset Accessibility|ListenEvent com.baiyubot.bondcat`
- ~~Boss 角色黑底~~：v0.5.3 已修（PNG 本身黑底，已 PIL flood fill 抠掉外围）

## 约定（baiyu 风格）
- 改动后立即 commit（无需二次确认）
- 每次改动必写 `ITER_LOG.md`
- 改完必自测（语法 + 逻辑）
- 版本号必须递增（`package.json` + `tauri.conf.json` 一起改）

## 关联记忆
- macOS 全局输入监听权限：CGEventTap + tccutil reset 反复踩的坑
