# LinuxDo Tauri 客户端

基于 Tauri 2 的 LinuxDo 论坛客户端,替代 Flutter 版本。

## 技术栈

- **前端**: React 18 + Vite + TailwindCSS
- **后端**: Rust + Tauri 2
- **认证**: Discourse User API Key OAuth

## 功能

- ✅ 浏览器 OAuth 登录 (discourse:// 深链接)
- ✅ 话题列表显示
- 🚧 话题详情和回复
- 🚧 用户资料

## 开发

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri dev
```

### 构建发布版

```bash
npm run tauri build
```

## 项目结构

```
.
├── src/                    # React 前端
│   ├── components/         # React 组件
│   │   ├── Login.jsx      # 登录组件
│   │   └── TopicList.jsx  # 话题列表
│   ├── App.jsx            # 主应用
│   ├── main.jsx           # 入口文件
│   └── styles.css         # 全局样式
├── src-tauri/             # Rust 后端
│   ├── src/
│   │   ├── lib.rs        # 主逻辑
│   │   └── main.rs       # 入口
│   ├── Cargo.toml        # Rust 依赖
│   └── tauri.conf.json   # Tauri 配置
└── package.json
```

## 认证流程

1. 用户点击"浏览器登录"按钮
2. 后端生成 RSA 密钥对和 nonce
3. 在默认浏览器打开 linux.do 授权页面
4. 用户授权后,浏览器通过 `discourse://auth_redirect?payload=<encrypted>` 回调应用
5. 后端解密 payload 获取 API key
6. 保存 API key 并获取用户信息
7. 跳转到话题列表

## Linux 安装

构建后会生成 `.deb` 包,直接安装即可:

```bash
sudo dpkg -i target/release/bundle/deb/linuxdo-tauri_0.1.0_amd64.deb
```

应用会自动注册 `discourse://` 协议处理器。

## 与 Flutter 版本对比

| 特性 | Flutter 版本 | Tauri 版本 |
|------|-------------|-----------|
| 包大小 | ~100MB | ~10MB |
| 内存占用 | ~200MB | ~50MB |
| WebView | WPE/WebKitGTK | 系统 WebView |
| 打包 | Flatpak | .deb/.AppImage |
| 深链接 | 需手动配置 | 自动注册 |

## 开发进度

- [x] 项目初始化
- [x] OAuth 登录流程
- [x] 深链接支持
- [x] 话题列表
- [ ] 话题详情
- [ ] 发帖回复
- [ ] 通知
- [ ] CI/CD

