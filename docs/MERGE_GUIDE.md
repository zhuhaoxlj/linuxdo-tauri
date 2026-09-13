# LinuxDo 模块更新合并指南

本指南说明如何从 LinuxDo 主分支合并代码更新到当前项目。

## 目录映射

原 LinuxDo 项目结构 → 当前项目结构

```
linuxdo-tauri/
├── src/
│   ├── components/     → src/modules/linuxdo/components/
│   ├── context/        → src/modules/linuxdo/context/
│   ├── lib/            → src/modules/linuxdo/lib/
│   ├── pages/          → src/modules/linuxdo/pages/
│   ├── App.jsx         → src/modules/linuxdo/LinuxDoModule.jsx (需要适配)
│   └── main.jsx        → (已重构，无需合并)
```

## 合并步骤

### 1. 准备工作

```bash
# 添加 LinuxDo 原仓库为远程源
git remote add linuxdo <linuxdo-repo-url>

# 拉取最新代码
git fetch linuxdo
```

### 2. 识别变更文件

```bash
# 查看 LinuxDo 主分支的最新提交
git log linuxdo/main --oneline -10

# 查看具体文件变更
git diff linuxdo/main -- src/
```

### 3. 合并策略

#### 方案 A：直接复制更新的文件

```bash
# 示例：更新某个组件
git show linuxdo/main:src/components/Post.jsx > src/modules/linuxdo/components/Post.jsx

# 批量更新所有组件
for file in src/components/*.jsx; do
  filename=$(basename "$file")
  git show linuxdo/main:src/components/$filename > src/modules/linuxdo/components/$filename
done
```

#### 方案 B：使用 patch 方式

```bash
# 生成 patch 文件
git diff linuxdo/main~5..linuxdo/main -- src/components/ > linuxdo-updates.patch

# 应用 patch（需要手动调整路径）
# 编辑 patch 文件，将路径从 src/ 改为 src/modules/linuxdo/
patch -p1 < linuxdo-updates.patch
```

### 4. 需要特别注意的文件

#### src/App.jsx (原项目) → LinuxDoModule.jsx (当前项目)

**原项目结构：**
```javascript
export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<TopicsPage />} />
        // ... 其他路由
      </Route>
    </Routes>
  );
}
```

**当前项目结构：**
```javascript
function LinuxDoRoutes() {
  const { user, checking, guest, error, login, browse } = useAuth();
  
  if (checking) return <Loading />;
  if (!user && !guest) return <Login />;
  
  return (
    <Routes>
      <Route element={<Shell />}>
        // ... 路由保持不变
      </Route>
    </Routes>
  );
}

export default function LinuxDoModule() {
  return (
    <AppProvider>
      <AuthProvider>
        <LinuxDoRoutes />
      </AuthProvider>
    </AppProvider>
  );
}
```

**合并规则：**
- 只需要更新 Routes 内部的路由定义
- 保持 LinuxDoModule 的外层结构不变
- 保持 AuthProvider 和 AppProvider 的包裹

#### 导入路径调整

如果 LinuxDo 新增了跨文件引用，需要调整导入路径：

**原路径：**
```javascript
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
```

**当前路径（在 LinuxDoModule.jsx 中）：**
```javascript
import { useAuth } from './context/AuthContext';
import Login from './components/Login';
```

**说明：** 由于已经在 `modules/linuxdo/` 目录内，相对路径保持不变。

### 5. 测试验证

```bash
# 运行开发服务器
npm run dev

# 测试 LinuxDo 功能
# 1. 点击侧边栏的 "LinuxDo"
# 2. 验证登录功能
# 3. 验证主要页面功能
# 4. 检查浏览器控制台是否有错误

# 构建验证
npm run build
```

### 6. 常见问题处理

#### 问题 1：找不到模块

**症状：**
```
Module not found: Can't resolve './context/AuthContext'
```

**解决：**
检查文件是否正确移动到 `src/modules/linuxdo/` 目录下。

#### 问题 2：样式冲突

**症状：**
LinuxDo 模块样式显示异常。

**解决：**
- 检查是否有新的 CSS 类需要添加到 `src/styles.css`
- 原 LinuxDo 的自定义样式应该已经保留在全局样式中

#### 问题 3：Context 提供者缺失

**症状：**
```
useAuth must be used within AuthProvider
```

**解决：**
确保 `LinuxDoModule.jsx` 正确包裹了 AuthProvider 和 AppProvider。

## 自动化脚本（可选）

创建一个合并脚本 `scripts/merge-linuxdo.sh`：

```bash
#!/bin/bash

# 从 LinuxDo 主分支合并更新
REMOTE="linuxdo"
BRANCH="main"

# 更新目录列表
DIRS=("components" "context" "lib" "pages")

echo "Fetching updates from $REMOTE/$BRANCH..."
git fetch $REMOTE

for dir in "${DIRS[@]}"; do
  echo "Updating $dir..."
  
  # 获取该目录的所有 .jsx 和 .js 文件
  files=$(git ls-tree -r --name-only $REMOTE/$BRANCH -- src/$dir/)
  
  for file in $files; do
    if [[ $file == *.jsx ]] || [[ $file == *.js ]]; then
      filename=$(basename "$file")
      target="src/modules/linuxdo/$dir/$filename"
      
      echo "  Copying $filename..."
      git show $REMOTE/$BRANCH:$file > $target
    fi
  done
done

echo "Merge complete! Please run 'npm run dev' to test."
```

## 版本追踪

建议在项目中记录 LinuxDo 的同步版本：

```bash
# 在 package.json 中添加字段
{
  "linuxdo": {
    "syncedCommit": "abc123def",
    "syncedDate": "2024-09-13"
  }
}
```

每次合并后更新这个字段，方便追踪。

## 最佳实践

1. **定期同步：** 建议每周或每两周同步一次
2. **小步快走：** 每次只合并少量提交，避免冲突过多
3. **充分测试：** 每次合并后完整测试 LinuxDo 功能
4. **保持隔离：** 不要在 LinuxDo 模块中引入看板功能的依赖
5. **文档更新：** 如果 LinuxDo 有重大变更，及时更新本文档
