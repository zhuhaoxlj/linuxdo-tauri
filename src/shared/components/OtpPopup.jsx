import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

/** 超过这个时间自动关掉：验证码本身有有效期，过期还留着的弹窗只会误导 */
const AUTO_CLOSE_MS = 120_000;

/** 复制成功后停留这么久再关闭：直接关掉会让人不确定到底复制成功没有 */
const CLOSE_AFTER_COPY_MS = 700;

/**
 * 手机解析出的验证码弹窗。
 *
 * 刻意做成屏幕正中、且不可忽略的卡片：收到验证码时用户正在另一个窗口等着填，
 * 藏在角落的通知等于没有。
 */
export default function OtpPopup() {
  const [otp, setOtp] = useState(null);
  const closeTimer = useRef(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // 关闭时通知 Rust 撤销置顶（见 otp.rs 的 focus_window）
  const dismiss = useCallback(() => {
    clearCloseTimer();
    setOtp(null);
    invoke('otp_popup_closed').catch(() => {});
  }, [clearCloseTimer]);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;
    let active = true;
    let unlisten;
    listen('otp-received', event => {
      if (!active) return;
      // 新验证码到来时取消上一条的延迟关闭，否则会把新弹窗一起关掉
      clearCloseTimer();
      setOtp(event.payload);
      setCopied(false);
    }).then(dispose => { if (active) unlisten = dispose; else dispose(); });
    return () => {
      active = false;
      clearCloseTimer();
      unlisten?.();
    };
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!otp) return undefined;
    const deadline = Date.now() + AUTO_CLOSE_MS;
    const timer = setInterval(() => {
      const left = deadline - Date.now();
      if (left <= 0) dismiss();
      else setRemaining(Math.ceil(left / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [otp, dismiss]);

  const copy = useCallback(async () => {
    if (!otp) return;
    try {
      await writeText(otp.code);
    } catch (error) {
      console.warn('剪贴板写入失败：', error);
      return;
    }
    setCopied(true);
    // 复制完就没什么可看的了，短暂显示"已复制"后自动收起
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      dismiss();
    }, CLOSE_AFTER_COPY_MS);
  }, [otp, dismiss, clearCloseTimer]);

  // 回车即可复制；Esc 关闭
  useEffect(() => {
    if (!otp) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') dismiss();
      else if (event.key === 'Enter') void copy();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [otp, copy, dismiss]);

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
          <button type="button" className="otp-btn" onClick={dismiss}>
            关闭
          </button>
        </div>
        <p className="otp-countdown">{remaining}s 后自动关闭</p>
      </div>
    </div>
  );
}
