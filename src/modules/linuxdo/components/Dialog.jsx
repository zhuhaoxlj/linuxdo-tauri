import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Dialog({ title, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={'dialog ' + (wide ? 'dialog-wide' : '')} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}
