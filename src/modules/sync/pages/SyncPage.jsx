import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Cloud, Laptop, Link2, LoaderCircle, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { useBoard } from '../../board/context/BoardContext';
import { copyCardContent } from '../../board/lib/clipboardContent';
import '../sync.css';

const STATUS_LABELS = {
  loading: '正在读取本机密钥',
  unpaired: '尚未配对',
  pairing: '等待已有设备批准',
  pending: '有变更等待同步',
  syncing: '正在同步',
  disconnecting: '正在断开本机同步',
  synced: '已同步',
  offline: '离线，联网后自动重试',
  revoked: '此设备已被撤销',
  error: '同步异常',
};

export default function SyncPage() {
  const sync = useBoard();
  const [deviceName, setDeviceName] = useState('LinuxDo Desktop');
  const [approvalCode, setApprovalCode] = useState('');
  const [actionError, setActionError] = useState('');
  const [approved, setApproved] = useState(false);
  const paired = Boolean(sync.syncConfig);

  useEffect(() => {
    if (!paired) return;
    sync.refreshDevices().catch(error => setActionError(error.message || '设备列表读取失败。'));
  }, [paired, sync.syncConfig?.deviceToken]);

  const lastSynced = useMemo(() => sync.lastSyncedAt
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(sync.lastSyncedAt)
    : '尚未完成首次同步', [sync.lastSyncedAt]);

  const approve = async event => {
    event.preventDefault();
    setActionError('');
    setApproved(false);
    try {
      await sync.approvePairing(approvalCode.trim());
      setApprovalCode('');
      setApproved(true);
      await sync.refreshDevices();
    } catch (error) {
      setActionError(error.message || '配对批准失败。');
    }
  };

  return <div className="sync-page">
    <header className="sync-header">
      <div className="sync-heading-icon"><Cloud size={22} /></div>
      <div><span>MAST VAULT</span><h1>同步配对</h1><p>当前看板与知识库使用同一个端到端加密空间。</p></div>
      <div className={`sync-state is-${sync.syncStatus}`}><span />{STATUS_LABELS[sync.syncStatus] || sync.syncStatus}</div>
    </header>

    {(sync.syncError || actionError) && <div className="sync-alert" role="alert">{actionError || sync.syncError}</div>}

    {!paired ? <UnpairedPanel
      name={deviceName}
      onName={setDeviceName}
      pairing={sync.pairing}
      loading={sync.syncStatus === 'loading'}
      onStart={() => sync.beginPairing(deviceName)}
      onCancel={sync.cancelPairing}
    /> : <div className="sync-content">
      <section className="sync-overview">
        <div className="sync-overview-copy"><ShieldCheck size={27} /><div><strong>此设备已加入加密空间</strong><span>{sync.syncConfig.deviceName}</span></div></div>
        <dl><div><dt>设备 ID</dt><dd>{sync.syncConfig.deviceId}</dd></div><div><dt>最近同步</dt><dd>{lastSynced}</dd></div></dl>
        <button className="sync-primary-button" onClick={sync.syncNow} disabled={sync.syncStatus === 'syncing'}>
          <RefreshCw size={16} className={sync.syncStatus === 'syncing' ? 'is-spinning' : ''} />立即同步
        </button>
      </section>

      <div className="sync-grid">
        <section className="sync-panel">
          <header><div><span>PAIR A DEVICE</span><h2>批准新设备</h2></div><Link2 size={19} /></header>
          <form onSubmit={approve}>
            <label htmlFor="sync-approval-code">配对文本</label>
            <textarea id="sync-approval-code" value={approvalCode} onChange={event => { setApprovalCode(event.target.value); setApproved(false); }} placeholder="粘贴另一台设备生成的配对文本" rows={7} />
            <div className="sync-form-actions">{approved && <span className="sync-success"><Check size={14} />已批准</span>}<button className="sync-primary-button" disabled={!approvalCode.trim()}><ShieldCheck size={16} />批准设备</button></div>
          </form>
        </section>

        <section className="sync-panel">
          <header><div><span>TRUSTED DEVICES</span><h2>已配对设备</h2></div><Laptop size={19} /></header>
          <div className="sync-device-list">
            {sync.pairedDevices.map(device => <div className="sync-device" key={device.id}>
              <div className="sync-device-icon"><Laptop size={17} /></div>
              <div><strong>{device.name}</strong><span>{device.id === sync.syncConfig.deviceId ? '当前设备' : device.prefix || '受信任设备'}</span></div>
              {device.id !== sync.syncConfig.deviceId && !device.revoked_at && <button className="sync-icon-button" title="撤销设备" aria-label={`撤销 ${device.name}`} onClick={() => sync.removeDevice(device.id).catch(error => setActionError(error.message))}><Trash2 size={16} /></button>}
            </div>)}
            {!sync.pairedDevices.length && <div className="sync-empty">正在读取设备列表…</div>}
          </div>
          <button className="sync-text-button" onClick={() => sync.disconnectSync()} disabled={sync.syncStatus === 'disconnecting'}><X size={15} />断开本机同步</button>
        </section>
      </div>
    </div>}
  </div>;
}

function UnpairedPanel({ name, onName, pairing, loading, onStart, onCancel }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyCardContent({ title: pairing.code });
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  if (pairing) return <section className="sync-pairing-panel">
    <div className="sync-pairing-copy"><span>DEVICE REQUEST</span><h2>在已配对设备上批准</h2><p>打开 Alive 或 Mast 同步空间，扫描二维码或粘贴下方配对文本。</p><div className="sync-waiting"><LoaderCircle size={17} className="is-spinning" />等待批准，完成后会自动开始同步</div><button className="sync-text-button" onClick={onCancel}><X size={15} />取消本次配对</button></div>
    <div className="sync-qr"><img src={pairing.qrCode} alt="设备配对二维码" /><button className="sync-primary-button" onClick={copy}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? '已复制' : '复制配对文本'}</button></div>
  </section>;
  return <section className="sync-setup-panel">
    <div className="sync-setup-visual"><Cloud size={42} /><span>端到端加密</span></div>
    <div className="sync-setup-form"><span>CONNECT THIS DEVICE</span><h2>把当前应用加入同步空间</h2><p>配对只传递 Vault 密钥和独立设备令牌，服务器无法读取卡片、笔记或附件内容。</p><label htmlFor="sync-device-name">设备名称</label><input id="sync-device-name" value={name} onChange={event => onName(event.target.value)} /><button className="sync-primary-button" onClick={onStart} disabled={loading || !name.trim()}><Link2 size={16} />生成配对请求</button></div>
  </section>;
}
