import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

function Login({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // 监听深链接回调
    const unlisten = onOpenUrl((urls) => {
      console.log('收到深链接:', urls);
      urls.forEach(url => {
        if (url.startsWith('discourse://auth_redirect')) {
          handleAuthCallback(url);
        }
      });
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleAuthCallback = async (url) => {
    setLoading(true);
    setError('');
    
    try {
      const result = await invoke('handle_auth_callback', { url });
      console.log('认证成功:', result);
      onLoginSuccess(result.api_key, result.user);
    } catch (err) {
      console.error('认证回调处理失败:', err);
      setError('登录失败: ' + err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      await invoke('start_oauth_flow');
    } catch (err) {
      console.error('启动 OAuth 流程失败:', err);
      setError('启动登录失败: ' + err);
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-white rounded-lg shadow-lg p-8 w-96">
        <h1 className="text-2xl font-bold text-center mb-6">LinuxDo</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? '登录中...' : '浏览器登录'}
        </button>

        <p className="text-sm text-gray-600 mt-4 text-center">
          点击按钮将在浏览器中打开 linux.do 进行授权
        </p>
      </div>
    </div>
  );
}

export default Login;
