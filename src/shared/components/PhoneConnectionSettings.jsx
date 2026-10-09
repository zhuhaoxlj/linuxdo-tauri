import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export default function PhoneConnectionSettings() {
  const [config, setConfig] = useState(null);
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const desktop = Boolean(window.__TAURI_INTERNALS__);

  useEffect(() => {
    if (!desktop) return undefined;
    let active = true;
    let dispose;
    listen('lan-status', event => { if (active) setStatus(event.payload); })
      .then(unlisten => { if (active) dispose = unlisten; else unlisten(); })
      .catch(() => { if (active) setError('无法订阅连接状态，请重新打开设置。'); });
    Promise.all([invoke('relay_settings'), invoke('lan_status')])
      .then(([settings, connection]) => {
        if (!active) return;
        setConfig(settings);
        setEndpoint(settings.endpoint);
        setStatus(connection);
      })
      .catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; dispose?.(); };
  }, [desktop]);

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const settings = await invoke('save_relay_settings', { endpoint, token });
      setConfig(settings);
      setEndpoint(settings.endpoint);
      setToken('');
      setMessage('配置已保存，正在重新连接。只有完成手机握手后才表示直连成功。');
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSaving(false);
    }
  };

  const connectionText = status?.peer
    ? `局域网直连已建立：${status.peer.device || 'Alive'} · ${status.peer.rttMs} ms`
    : status?.relayConnected ? '中继已连接，正在等待手机地址或验证局域网连接。'
      : config?.configured ? '中继尚未连接。' : '尚未配置手机连接。';

  return <section className="settings-section panel">
    <h2>手机连接</h2>
    <p className="muted">用于 Alive 手机扬声器和验证码同步。电脑先通过中继发现手机地址，再验证局域网直连；手机和电脑需使用相同的中继地址与认证令牌。</p>
    {!desktop ? <p>请在桌面应用中配置手机连接。</p> : <>
      <p role="status">{connectionText}</p>
      {status?.lastError && <p className="inline-error">{status.lastError}</p>}
      {config?.environmentOverride && <p>当前配置由 ALIVE_RELAY_URL 环境变量管理。请移除该变量并重启应用后再在此修改。</p>}
      <form className="account-form" onSubmit={save} autoComplete="off">
        <label className="field"><span>中继地址</span><input aria-label="中继地址" type="url" placeholder="wss://你的服务器/alive/ws" value={endpoint} required disabled={!config || saving || config.environmentOverride} onChange={event => setEndpoint(event.target.value)} /><small className="muted">推荐使用 wss://；地址不包含 ?token=，认证令牌在下面单独填写。</small></label>
        <label className="field"><span>认证令牌</span><input aria-label="认证令牌" type="password" autoComplete="new-password" value={token} required={!config?.hasToken} placeholder={config?.hasToken ? '已保存，留空保留原令牌' : '填写手机 Alive 使用的 token'} disabled={!config || saving || config.environmentOverride} onChange={event => setToken(event.target.value)} /><small className="muted">已有令牌不会回显。配置仅保存在本机，不进入浏览器存储或看板同步。</small></label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="button primary" type="submit" disabled={!config || saving || config.environmentOverride}>{saving ? '正在保存…' : '保存并重新连接'}</button>
      </form>
    </>}
  </section>;
}
