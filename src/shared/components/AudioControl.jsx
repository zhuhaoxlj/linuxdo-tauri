import React from 'react';

/**
 * P3：把电脑正在播放的声音推到手机（手机连蓝牙耳机时就从耳机出声）。
 *
 * 只在局域网通道已验证、且手机上报了音频端口时才允许开启——没有直连就推流
 * 只会把 1.5 Mbps 的裸 PCM 灌进公网中继（而且中继单条上限 8 KB，根本传不了）。
 *
 * 开启时会顺带静音电脑本地输出：否则电脑音箱和手机会同时出声（差几百毫秒），
 * 叠在一起听起来像回声。停止时自动恢复。
 */
export default function AudioControl({ lan, audio, onToggle }) {
  const audioPort = lan?.peer?.audioPort;
  const ready = Boolean(audioPort);
  const streaming = Boolean(audio?.streaming);

  return (
    <div className="lan-audio">
      <button
        type="button"
        className={`lan-audio-button${streaming ? ' is-on' : ''}`}
        onClick={onToggle}
        disabled={!ready && !streaming}
        title={
          ready
            ? `手机音频端口 ${audioPort}；开始时会静音电脑本地输出，停止时恢复`
            : '需要先建立局域网直连'
        }
      >
        {streaming ? '⏹ 停止推送音频' : '🎧 推到手机当扬声器'}
      </button>
      {streaming && audio?.localMuted ? (
        <p className="lan-audio-meta">电脑已静音 · 已发送 {audio.packets} 包</p>
      ) : null}
      {streaming && !audio?.localMuted && audio?.packets > 0 ? (
        <p className="lan-audio-meta">已发送 {audio.packets} 包</p>
      ) : null}
      {streaming && audio?.packets > 400 && audio?.level === 0 ? (
        <p className="lan-audio-warn">
          ⚠ 采到的是静音 —— 电脑当前没有音频输出到默认设备
          （播放器把音频流挂起时就是这样，重新播放一次即可）
        </p>
      ) : null}
      {audio?.lastError ? <p className="lan-audio-error">{audio.lastError}</p> : null}
    </div>
  );
}
