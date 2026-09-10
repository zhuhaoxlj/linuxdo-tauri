import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import TopicList from './components/TopicList';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // 检查是否已登录
    const checkAuth = async () => {
      try {
        const apiKey = localStorage.getItem('discourse_api_key');
        if (apiKey) {
          setIsAuthenticated(true);
          // 可以在这里获取用户信息
        }
      } catch (error) {
        console.error('检查认证状态失败:', error);
      }
    };
    checkAuth();
  }, []);

  const handleLoginSuccess = (apiKey, userData) => {
    localStorage.setItem('discourse_api_key', apiKey);
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('discourse_api_key');
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <div className="w-full h-full bg-gray-50">
      {!isAuthenticated ? (
        <Login onLoginSuccess={handleLoginSuccess} />
      ) : (
        <TopicList user={user} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
