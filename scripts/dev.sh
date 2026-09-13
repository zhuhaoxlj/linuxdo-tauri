#!/bin/bash
# 开发模式启动脚本

echo "🚀 启动知识看板开发服务器..."
echo ""

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 检测到未安装依赖，正在安装..."
    npm install
fi

# 启动开发服务器
echo "✨ 启动 Vite 开发服务器..."
npm run dev
