import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { errorText } from '../lib/api';
import { restoreAuthSession, terminateAuthSession } from '../lib/authSession';
import { removeSharedValue, writeSharedValue } from '../../../shared/sharedStorage';

const AuthContext = createContext();

// 本地状态仅用于首帧占位，是否登录最终以原生会话验证结果为准。
export function loadStoredAuth() {
  try {
    const stored = localStorage.getItem('linuxdo-auth');
    if (stored) {
      const auth = JSON.parse(stored);
      if (auth.user?.username || auth.guest === true) {
        return auth;
      }
    }
  } catch (error) {
    console.error('Failed to load stored auth:', error);
  }
  return null;
}

// 保存认证状态到 localStorage，并同步到开发版/正式版共享文件
function saveAuth(auth) {
  try {
    writeSharedValue('linuxdo-auth', JSON.stringify(auth));
  } catch (error) {
    console.error('Failed to save auth:', error);
  }
}

export function AuthProvider({ children }) {
  const [restored] = useState(loadStoredAuth);
  const [user, setUser] = useState(restored?.user || null);
  const [guest, setGuest] = useState(Boolean(restored?.guest));
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);
  const queries = useQueryClient();

  useEffect(() => {
    let disposed = false;
    restoreAuthSession(invoke, restored)
      .then(auth => {
        if (disposed) return;
        setUser(auth?.user || null);
        setGuest(Boolean(auth?.guest));
        if (auth) saveAuth(auth);
        else removeSharedValue('linuxdo-auth');
      })
      .catch(reason => {
        if (disposed) return;
        setUser(null);
        setGuest(false);
        setError(errorText(reason));
        removeSharedValue('linuxdo-auth');
      })
      .finally(() => { if (!disposed) setChecking(false); });
    return () => { disposed = true; };
  }, [restored]);

  const login = useCallback((userData) => {
    queries.clear();
    setUser(userData);
    setGuest(false);
    setError(null);
    saveAuth({ user: userData, guest: false });
  }, [queries]);

  const browse = useCallback(() => {
    setUser(null);
    setGuest(true);
    setError(null);
    saveAuth({ user: null, guest: true });
  }, []);

  const logout = useCallback(async () => {
    await terminateAuthSession(invoke);
    queries.clear();
    setUser(null);
    setGuest(false);
    setError(null);
    removeSharedValue('linuxdo-auth');
  }, [queries]);

  const requestLogin = useCallback(() => {
    setGuest(false);
    setError(null);
    removeSharedValue('linuxdo-auth');
  }, []);

  const value = useMemo(() => ({
    user,
    guest,
    checking,
    error,
    login,
    browse,
    logout,
    requestLogin
  }), [user, guest, checking, error, login, browse, logout, requestLogin]);

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
