import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { errorText } from '../lib/api';

const Context = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState('');
  const queries = useQueryClient();

  useEffect(() => {
    let disposed = false;
    localStorage.removeItem('discourse_api_key');
    const restore = Promise.race([
      invoke('restore_session'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('登录状态检查超时，请重试')), 35000)),
    ]);
    restore
      .then(value => { if (!disposed) setUser(value); })
      .catch(reason => { if (!disposed) setError(errorText(reason)); })
      .finally(() => { if (!disposed) setChecking(false); });
    return () => { disposed = true; };
  }, []);

  const login = useCallback(value => {
    queries.clear();
    setUser(value);
    setGuest(false);
    setError('');
  }, [queries]);

  const logout = useCallback(async () => {
    await invoke('logout');
    queries.clear();
    setUser(null);
    setGuest(false);
  }, [queries]);

  return <Context.Provider value={{ user, checking, guest, error, login, logout, browse: () => setGuest(true), requestLogin: () => { setGuest(false); setError(''); } }}>{children}</Context.Provider>;
}

export const useAuth = () => useContext(Context);
