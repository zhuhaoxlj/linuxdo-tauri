import React from 'react';
import { Link } from 'react-router-dom';
import PhoneConnectionSettings from './PhoneConnectionSettings';

export default function GlobalSettingsPage() {
  return <div className="global-settings-page">
    <header className="global-settings-heading">
      <h1>设置</h1>
      <p>管理应用级连接与功能，无需进入 LinuxDo 论坛。</p>
    </header>
    <PhoneConnectionSettings />
    <section className="settings-section panel">
      <h2>其他设置</h2>
      <p className="muted">跨设备同步与论坛阅读设置仍由各自的页面管理。</p>
      <div className="global-settings-links">
        <Link className="button secondary" to="/sync">同步配对</Link>
        <Link className="button secondary" to="/linuxdo/settings">LinuxDo 论坛设置</Link>
      </div>
    </section>
  </div>;
}
