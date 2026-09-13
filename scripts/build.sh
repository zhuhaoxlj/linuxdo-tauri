#!/bin/bash
# 构建生产版本脚本

echo "🏗️ 构建生产版本..."
echo ""

# 清理旧构建
echo "🧹 清理旧的构建产物..."
rm -rf dist

# 构建前端
echo "📦 构建前端资源..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ 前端构建成功！"
    
    # 询问是否构建 Tauri
    read -p "是否构建 Tauri 桌面应用？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🎯 构建 Tauri 应用..."
        npm run tauri build
        
        if [ $? -eq 0 ]; then
            echo "✅ Tauri 构建成功！"
            echo "📦 安装包位于 src-tauri/target/release/bundle/"
        else
            echo "❌ Tauri 构建失败！"
            exit 1
        fi
    fi
else
    echo "❌ 前端构建失败！"
    exit 1
fi

echo ""
echo "🎉 构建完成！"
