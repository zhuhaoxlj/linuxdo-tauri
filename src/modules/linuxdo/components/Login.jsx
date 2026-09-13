import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { ArrowRight, ExternalLink, LoaderCircle } from 'lucide-react';

export default function Login({ onLoginSuccess, onBrowse, sessionError }) {
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const handledUrls = useRef(new Set());

  useEffect(() => {
    let disposed = false;
    let unlisten;

    const receive = async (urls) => {
      for (const url of urls ?? []) {
        let parsed;
        try { parsed = new URL(url); } catch { continue; }
        if (parsed.protocol !== 'discourse:' || parsed.hostname !== 'auth_redirect') continue;
        if (disposed || handledUrls.current.has(url)) continue;
        handledUrls.current.add(url);
        setPhase('completing');
        setError('');
        try {
          const user = await invoke('handle_auth_callback', { url });
          if (!disposed) onLoginSuccess(user);
        } catch (err) {
          if (!disposed) {
            setError(String(err));
            setPhase('idle');
          }
        }
      }
    };

    const setup = async () => {
      try {
        // Subscribe first so callbacks arriving while getCurrent resolves cannot be lost.
        unlisten = await onOpenUrl(receive);
        if (disposed) { unlisten(); return; }
        const urls = await getCurrent();
        if (!disposed) {
          setReady(true);
          receive(urls);
        }
      } catch (err) {
        if (!disposed) setError(`无法接收浏览器登录回调：${err}`);
      }
    };
    setup();
    return () => { disposed = true; unlisten?.(); };
  }, [onLoginSuccess]);

  const handleLogin = async () => {
    setPhase('opening');
    setError('');
    try {
      await invoke('start_oauth_flow');
      setPhase(current => current === 'opening' ? 'waiting' : current);
    } catch (err) {
      setError(String(err));
      setPhase('idle');
    }
  };

  const cancel = async () => {
    try {
      await invoke('cancel_login');
      setPhase('idle');
    } catch (err) { setError(String(err)); }
  };

  const labels = {
    idle: '浏览器登录', opening: '正在打开浏览器…',
    waiting: '等待浏览器授权…', completing: '正在完成登录…',
  };

  return (
    <div className="login-screen">
      <div className="login-art"><div className="login-brand"><img src="/fluxdo.png" alt="" /><strong>FluxDO</strong></div><div className="login-intro"><span className="eyebrow">HELLO, CURIOUS MIND.</span><h1>好奇心，<br />在这里相遇。</h1><p>从一个问题，到一个新发现。<br />与 Linux.do 社区一起，让有价值的对话继续。</p><div className="login-values"><span>真诚</span><span>友善</span><span>团结</span><span>专业</span></div></div><div className="login-orbit" aria-hidden="true"><i /><i /><span>F</span></div><small className="login-footnote">为社区而生 · FluxDO</small></div>
      <div className="login-panel"><div className="login-card"><img src="/fluxdo.png" className="login-mark" alt="" /><h2>欢迎回来</h2><p className="login-description">登录，继续你的社区之旅。</p>
        {(error || sessionError) && <div role="alert" className="inline-error login-error">{error || sessionError}</div>}
        <button onClick={handleLogin} disabled={!ready || phase !== 'idle'}
          className="button primary login-button">
          {phase !== 'idle' ? <LoaderCircle className="spin" size={18} /> : <ExternalLink size={18} />}
          {labels[phase]}
        </button>
        <p role="status" className="login-status">
          {phase === 'completing' ? '正在确认登录状态，请稍候。' : '在浏览器完成授权后，会自动返回应用。'}
        </p>
        {phase === 'waiting' && <button onClick={cancel} className="button text login-cancel">取消登录</button>}
        {onBrowse && phase === 'idle' && <button className="button text browse-button" onClick={onBrowse}>先逛逛社区 <ArrowRight size={16} /></button>}
        <p className="login-privacy">授权由 Linux.do 处理，应用不会读取你的密码。</p>
      </div></div>
    </div>
  );
}
