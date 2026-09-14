import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { siteQuery } from '../lib/queries';
import { readLocal, writeLocal } from '../lib/storage';
import { mergeSettings } from '../lib/settings';

const Context = createContext(null);

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(() => mergeSettings(readLocal('settings', {})));
  const [toast, setToast] = useState('');
  const notify = useCallback(message => setToast(message), []);
  const updateSettings = patch => setSettings(current => {
    const next = { ...current, ...patch };
    writeLocal('settings', next);
    return next;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.accent = settings.accent;
    document.documentElement.dataset.font = settings.font || 'default';
    document.documentElement.style.setProperty('--ui-scale', String((settings.uiFontSize || 14) / 14));
    document.documentElement.style.setProperty('--reading-size', `${settings.fontSize}px`);
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  return <Context.Provider value={{ settings, updateSettings, notify }}>{children}{toast && <div className="toast" role="status">{toast}</div>}</Context.Provider>;
}

export const useApp = () => useContext(Context);
// 与启动预取共用同一份查询定义，保证进入论坛时直接命中缓存。
export const useSite = () => useQuery(siteQuery());
