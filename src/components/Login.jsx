import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

function Login({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testUrl, setTestUrl] = useState('');

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
      setError('请在浏览器中授权,然后将回调 URL 粘贴到下面的输入框');
    } catch (err) {
      console.error('启动 OAuth 流程失败:', err);
      setError('启动登录失败: ' + err);
      setLoading(false);
    }
  };

  const handleTestCallback = () => {
    if (testUrl.startsWith('discourse://auth_redirect')) {
      handleAuthCallback(testUrl);
    } else {
      setError('URL 格式错误,应该以 discourse://auth_redirect 开头');
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-white rounded-lg shadow-lg p-8 w-96">
        <h1 className="text-2xl font-bold text-center mb-6">LinuxDo</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed mb-4"
        >
          {loading ? '登录中...' : '浏览器登录'}
        </button>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-2">
            由于系统已安装 Flatpak 版本,回调会被拦截。请手动粘贴回调 URL:
          </p>
          <input
            type="text"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="discourse://auth_redirect?payload=..."
            className="w-full px-3 py-2 border border-gray-300 rounded mb-2 text-sm"
          />
          <button
            onClick={handleTestCallback}
            disabled={!testUrl}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
          >
            手动处理回调
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          提示:在浏览器授权后,复制地址栏的 discourse:// 开头的 URL 并粘贴到上方输入框
        </p>
      </div>
    </div>
  );
}

export default Login;
