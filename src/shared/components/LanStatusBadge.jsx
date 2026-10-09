import React from 'react';
import { Link } from 'react-router-dom';

/**
 * 侧边栏底部的局域网直连状态。
 *
 * P1 阶段这里只反映「发现 + 握手验证」的结果：手机通过中继广播自己的局域网地址，
 * 但 Rust 侧必须真的在局域网上打通一次握手才会显示成已连接——拿到 IP 不等于能连
 * （IP 可能过期、可能被 AP 隔离、可能被 VPN 劫持）。
 */
export default function LanStatusBadge({ status }) {
  const { text, tone, title } = describe(status);
  return (
    <p className={`lan-status lan-status-${tone}`} title={title || text}>
      <span className="lan-status-dot" aria-hidden="true" />
      {status && !status.peer && !status.relayConnected
        ? <Link to="/settings">{text} · 设置</Link>
        : <span>{text}</span>}
    </p>
  );
}

function describe(status) {
  if (!status) return { text: '局域网：检测中…', tone: 'idle' };

  if (status.peer) {
    const { addr, port, rttMs, device } = status.peer;
    return {
      text: `局域网直连 · ${rttMs}ms`,
      tone: 'ok',
      title: `${device || 'Alive'} @ ${addr}:${port}`,
    };
  }
  if (status.configurationRequired) {
    return { text: '手机连接：待配置', tone: 'warn', title: '点击打开设置，填写中继地址和认证令牌' };
  }
  if (!status.relayConnected) {
    return { text: '局域网：中继未连接', tone: 'warn', title: status.lastError || '' };
  }
  if (status.lastError) {
    return { text: '局域网：不可达', tone: 'warn', title: status.lastError };
  }
  return { text: '局域网：等待手机上报', tone: 'idle' };
}
