import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { readLocal, writeLocal } from '../lib/storage';

const Context = createContext(null);
const defaults = { theme: 'system', accent: 'blue', font: 'default', fontSize: 16, compact: false, showAvatars: true, notifications: true };

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ ...defaults, ...readLocal('settings', {}) }));
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
export const useSite = () => useQuery({ queryKey: ['site'], queryFn: () => api.get('/site.json'), staleTime: 5 * 60_000 });
