import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AuthContext = createContext();

// 从 localStorage 恢复认证状态
function loadStoredAuth() {
  try {
    const stored = localStorage.getItem('linuxdo-auth');
    if (stored) {
      const auth = JSON.parse(stored);
      // 简单验证数据结构
      if (auth.user || auth.guest) {
        return auth;
      }
    }
  } catch (error) {
    console.error('Failed to load stored auth:', error);
  }
  return null;
}

// 保存认证状态到 localStorage
function saveAuth(auth) {
  try {
    localStorage.setItem('linuxdo-auth', JSON.stringify(auth));
  } catch (error) {
    console.error('Failed to save auth:', error);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [guest, setGuest] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  // 恢复登录状态
  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored) {
      setUser(stored.user || null);
      setGuest(stored.guest || false);
      console.log('✅ LinuxDo 认证状态已恢复');
    }
    setChecking(false);
  }, []);

  const login = useCallback((userData) => {
    setUser(userData);
    setGuest(false);
    setError(null);
    saveAuth({ user: userData, guest: false });
  }, []);

  const browse = useCallback(() => {
    setUser(null);
    setGuest(true);
    setError(null);
    saveAuth({ user: null, guest: true });
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setGuest(false);
    setError(null);
    localStorage.removeItem('linuxdo-auth');
  }, []);

  const value = useMemo(() => ({
    user,
    guest,
    checking,
    error,
    login,
    browse,
    logout
  }), [user, guest, checking, error, login, browse, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
