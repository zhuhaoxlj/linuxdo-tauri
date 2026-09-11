import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, ExternalLink, Moon, Sun, Monitor } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { api, errorText } from '../lib/api';
import { ErrorState, Loading, PageHeading } from '../components/Common';
import AuthRequired from '../components/AuthRequired';

function Toggle({ title, description, checked, onChange }) {
  return <label className="setting-row"><span><strong>{title}</strong><small>{description}</small></span><input className="switch" type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}

const FONT_OPTIONS = [['default', '默认字体'], ['lxgw-wenkai', '霞鹜文楷（内置）'], ['system', '系统字体'], ['serif', '衬线字体'], ['mono', '等宽字体']];

export default function SettingsPage() {
  const { settings, updateSettings } = useApp();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'appearance';
  const account = useQuery({ queryKey: ['account', user?.username], enabled: Boolean(user) && tab === 'account', queryFn: () => api.get('/u/' + encodeURIComponent(user.username) + '.json') });
  return <div className="settings-page"><PageHeading eyebrow="MAKE IT YOURS" title="设置" description="调整到你最舒服的阅读方式。" /><div className="tabs section-tabs">{[['appearance', '外观与阅读'], ['account', '个人资料'], ['about', '关于']].map(([value, label]) => <button className={tab === value ? 'active' : ''} key={value} onClick={() => setParams({ tab: value })}>{label}</button>)}</div>
    {tab === 'appearance' ? <><section className="settings-section panel"><h2>外观</h2><p className="muted">选择适合当前环境的主题。</p><div className="theme-options">{[['system', '跟随系统', Monitor], ['light', '浅色', Sun], ['dark', '深色', Moon]].map(([value, label, Icon]) => <button className={'theme-option ' + (settings.theme === value ? 'active' : '')} aria-pressed={settings.theme === value} key={value} onClick={() => updateSettings({ theme: value })}><Icon size={22} /><span>{label}</span>{settings.theme === value && <Check size={16} />}</button>)}</div><div className="setting-row"><span><strong>强调色</strong><small>给界面一点自己的颜色</small></span><div className="accent-options">{[['blue', '#4e7bc9', '湖蓝'], ['teal', '#24867c', '松绿'], ['violet', '#8769b7', '淡紫']].map(([value, color, label]) => <button key={value} title={label} aria-label={label} aria-pressed={settings.accent === value} onClick={() => updateSettings({ accent: value })} style={{ background: color }}>{settings.accent === value && <Check size={16} />}</button>)}</div></div><div className="setting-row"><span><strong>全局字体</strong><small>界面与正文统一使用的字体</small></span><select aria-label="全局字体" value={settings.font || 'default'} onChange={event => updateSettings({ font: event.target.value })}>{FONT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><label className="setting-row"><span><strong>界面字号</strong><small>整体缩放界面文字，当前 {settings.uiFontSize || 14} px</small></span><input type="range" aria-label="界面字号" min="12" max="18" step="1" value={settings.uiFontSize || 14} onChange={event => updateSettings({ uiFontSize: Number(event.target.value) })} /></label></section>
      <section className="settings-section panel"><h2>阅读</h2><label className="setting-row"><span><strong>正文字号</strong><small>当前 {settings.fontSize} px</small></span><input type="range" aria-label="正文字号" min="14" max="22" step="1" value={settings.fontSize} onChange={event => updateSettings({ fontSize: Number(event.target.value) })} /></label><p className="reading-sample" style={{ fontSize: settings.fontSize }}>真诚地分享，友善地交流。让每一次阅读，都带来一点新的发现。</p><Toggle title="紧凑列表" description="在一屏内展示更多话题" checked={settings.compact} onChange={value => updateSettings({ compact: value })} /><Toggle title="显示头像" description="在话题列表中展示作者头像" checked={settings.showAvatars} onChange={value => updateSettings({ showAvatars: value })} /><Toggle title="记录阅读进度" description="保留本机历史，登录后同步论坛已读进度" checked={settings.recordHistory !== false} onChange={value => updateSettings({ recordHistory: value })} /><Toggle title="自动更新通知" description="刷新通知计数和新消息提示" checked={settings.notifications} onChange={value => updateSettings({ notifications: value })} /></section>
      <section className="settings-section panel"><h2>快捷键</h2><div className="shortcut-row"><span>搜索社区</span><kbd>Ctrl K</kbd></div><div className="shortcut-row"><span>发送帖子或消息</span><kbd>Ctrl Enter</kbd></div><div className="shortcut-row"><span>关闭弹窗</span><kbd>Esc</kbd></div></section></>
      : tab === 'account' ? <AuthRequired>{account.isPending ? <Loading /> : account.isError ? <ErrorState error={account.error} retry={account.refetch} /> : <AccountForm key={user?.username} user={account.data?.user} />}</AuthRequired>
        : <section className="about-panel panel"><img src="/fluxdo.png" alt="" width="80" height="80" /><h2>FluxDO</h2><p>与好奇心同行。</p><p className="muted">Linux.do 社区第三方客户端 · Tauri 2 桌面版</p><div className="about-links"><a href="https://linux.do" target="_blank" rel="noreferrer">Linux.do <ExternalLink size={14} /></a><a href="https://github.com/lingyan000/fluxdo" target="_blank" rel="noreferrer">FluxDO 原项目 <ExternalLink size={14} /></a><a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer">GPL-3.0 许可证 <ExternalLink size={14} /></a></div><p className="muted">感谢 FluxDO 和 Discourse 开源社区。</p></section>}
  </div>;
}

function AccountForm({ user }) {
  const { notify } = useApp();
  const [form, setForm] = useState({ name: user?.name || '', bio_raw: user?.bio_raw || '', location: user?.location || '', website: user?.website || '' });
  const mutation = useMutation({ mutationFn: () => api.put('/u/' + encodeURIComponent(user.username) + '.json', form), onSuccess: () => notify('个人资料已保存') });
  if (!user) return <ErrorState error="无法读取个人资料" />;
  return <form className="settings-section panel account-form" onSubmit={event => { event.preventDefault(); mutation.mutate(); }}><h2>个人资料</h2><p className="muted">@{user.username}</p>{[['name', '昵称'], ['location', '所在地'], ['website', '个人网站']].map(([key, title]) => <label className="field" key={key}><span>{title}</span><input value={form[key]} type={key === 'website' ? 'url' : 'text'} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>)}<label className="field"><span>个人简介</span><textarea rows="5" value={form.bio_raw} onChange={event => setForm(current => ({ ...current, bio_raw: event.target.value }))} /></label>{mutation.error && <p className="inline-error" role="alert">{errorText(mutation.error)}</p>}<button className="button primary" disabled={mutation.isPending} type="submit">{mutation.isPending ? '正在保存…' : '保存资料'}</button></form>;
}
