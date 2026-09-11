# FluxDO → Tauri 2 迁移

功能基准为本机 `../fluxdo`，快照 `41994c7e26e826d7edf2411fc47dc5e2d3d0deaf`（Flutter 0.2.28）。原项目源码保留，当前工程承接 Linux 桌面版本。新增代码沿用 GPL-3.0；`public/vendor/discourse-cook.js` 保留原文件的生成说明及 Discourse 来源。

## 结构

- React 页面按论坛功能划分，React Router 管理页面与阅读位置，TanStack Query 管理服务器数据。
- Rust 管理授权密钥、回调、窗口与会话请求；论坛 WebView 负责同源网络和 HttpOnly Cookie。远程页面只能回传会话结果，不能调用主窗口命令。
- Markdown 编辑器复用原项目的 Discourse cook bundle；帖子 HTML 由 DOMPurify 清洗后渲染。
- 草稿、阅读历史和界面设置按本机用户存储。重构不自动读取或覆盖 Flutter 的 Hive/SQLite 数据。

## 迁移状态

| 范围 | 状态 | 原项目依据 |
| --- | --- | --- |
| 浏览器授权、单实例回调、OTP 换会话、退出 | 已实现，原生隔离测试通过；真实账号待验证 | `user_api_key_service.dart`、`user_api_key_login_flow.dart` |
| 分类、标签、话题列表与详情 | 迁移中 | `_categories.dart`、`_topics.dart` |
| 发帖、回复、编辑、图片与 Markdown 预览 | 迁移中 | `_posts.dart`、`_uploads.dart`、`discourse_cook_service.dart` |
| 搜索、通知、书签、历史、草稿 | 迁移中 | `_search.dart`、`_notifications.dart`、`_drafts.dart` |
| 用户资料、关注、徽章、私信 | 待接入 | `_users.dart` |
| 聊天、实时 MessageBus、投票与管理操作 | 待接入 | `_chat.dart`、`message_bus_service.dart`、`_voting.dart` |
| 外观、阅读与快捷键设置 | 待接入 | `appearance_page.dart`、`reading_settings_page.dart` |
| AI、Notion、LDC/CDK、下载导出、DOH/ECH | 待迁移 | 对应 services/modules、`core/doh_proxy` |
| Android/iOS 专用适配 | 当前 Linux 范围之外 | 相机、移动后台服务、APK 更新等 |

“已实现”要求页面、接口及错误处理可以运行；仅有入口或链接不记为迁移完成。模拟接口验证与真实账号验证分别记录。

## 登录回归

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run tauri build -- --debug --no-bundle
dbus-run-session --config-file=tests/dbus-session.conf -- \
  python3 tests/native-login.py --full
```

原生测试使用 WebKitWebDriver、临时应用数据和独立 D-Bus，浏览器授权由测试脚本截获，论坛写入由测试数据代替。系统 Python 仅作为此原生测试的驱动，使用现有 `cryptography` 包；它不是应用运行依赖。

本机已移除 Flatpak `com.github.lingyan000.fluxdo` 及其沙盒数据、残留启动项。登录修复版已打包并安装为 `linux-do`；包内 `Exec=linuxdo-tauri %u` 会传递浏览器回调。
