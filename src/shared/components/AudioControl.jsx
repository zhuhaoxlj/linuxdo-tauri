import React from 'react';

/**
 * P3：把电脑正在播放的声音推到手机（手机连蓝牙耳机时就从耳机出声）。
 *
 * 只在局域网通道已验证、且手机上报了音频端口时才允许开启——没有直连就推流
 * 只会把 1.5 Mbps 的裸 PCM 灌进公网中继（而且中继单条上限 8 KB，根本传不了）。
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
        title={ready ? `手机音频端口 ${audioPort}` : '需要先建立局域网直连'}
      >
        {streaming ? '⏹ 停止推送音频' : '🎧 推送电脑音频到手机'}
      </button>
      {streaming && audio?.packets > 0 ? (
        <p className="lan-audio-meta">已发送 {audio.packets} 包</p>
      ) : null}
      {audio?.lastError ? <p className="lan-audio-error">{audio.lastError}</p> : null}
    </div>
  );
}
