import React, { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

/** 超过这个时间自动关掉：验证码本身有有效期，过期还留着的弹窗只会误导 */
const AUTO_CLOSE_MS = 120_000;

/**
 * 手机解析出的验证码弹窗。
 *
 * 刻意做成屏幕正中、且不可忽略的卡片：收到验证码时用户正在另一个窗口等着填，
 * 藏在角落的通知等于没有。
 */
export default function OtpPopup() {
  const [otp, setOtp] = useState(null);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;
    let active = true;
    let unlisten;
    listen('otp-received', event => {
      if (!active) return;
      setOtp(event.payload);
      setCopied(false);
    }).then(dispose => { if (active) unlisten = dispose; else dispose(); });
    return () => { active = false; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!otp) return undefined;
    const deadline = Date.now() + AUTO_CLOSE_MS;
    const timer = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) setOtp(null);
      else setRemaining(Math.ceil(left / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [otp]);

  const copy = useCallback(async () => {
    if (!otp) return;
    try {
      await writeText(otp.code);
    } catch (error) {
      console.warn('剪贴板写入失败：', error);
      return;
    }
    setCopied(true);
  }, [otp]);

  // 回车即可复制；Esc 关闭
  useEffect(() => {
    if (!otp) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') setOtp(null);
      else if (event.key === 'Enter') void copy();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [otp, copy]);

  if (!otp) return null;

  const source = otp.service || otp.sender || '短信';
  const via = otp.via === 'lan' ? '局域网' : '中继';

  return (
    <div className="otp-overlay" role="dialog" aria-modal="true" aria-label="收到验证码">
      <div className="otp-card">
        <p className="otp-from">{source} · 经{via}</p>
        <button type="button" className="otp-code" onClick={copy} title="点击复制">
          {otp.code}
        </button>
        <p className="otp-hint">{copied ? '✓ 已复制到剪贴板' : '点击数字或按回车复制'}</p>
        {otp.body ? <p className="otp-body">{otp.body}</p> : null}
        <div className="otp-actions">
          <button type="button" className="otp-btn otp-btn-primary" onClick={copy}>
            {copied ? '已复制' : '复制验证码'}
          </button>
          <button type="button" className="otp-btn" onClick={() => setOtp(null)}>
            关闭
          </button>
        </div>
        <p className="otp-countdown">{remaining}s 后自动关闭</p>
      </div>
    </div>
  );
}
