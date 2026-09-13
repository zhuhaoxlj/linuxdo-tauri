import { useEffect, useState } from 'react';
import { readLocal } from './storage';

export function useLocalValue(key, fallback) {
  const [value, setValue] = useState(() => readLocal(key, fallback));
  useEffect(() => {
    const update = () => setValue(readLocal(key, fallback));
    update();
    window.addEventListener('fluxdo:storage', update);
    window.addEventListener('storage', update);
    return () => { window.removeEventListener('fluxdo:storage', update); window.removeEventListener('storage', update); };
  }, [key]);
  return value;
}
