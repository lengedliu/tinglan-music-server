import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Volume2, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck 
} from 'lucide-react';
import { XiaomiDevice, Song, DeviceCommandState } from '../../types';
import { apiFetch } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { cleanDeviceName } from './speakerUtils';

interface PlaybackControlTabProps {
  activeDevice?: XiaomiDevice;
  devices: XiaomiDevice[];
  onSelectDevice: (did: string) => void;
  onControlDevice: (did: string, action: string, value?: any) => void;
  currentSong: Song | null;
  onCastCurrentSong: () => void;
  commandState?: DeviceCommandState;
  onReturnToDeviceList: () => void;
}

export const PlaybackControlTab: React.FC<PlaybackControlTabProps> = ({
  activeDevice,
  devices,
  onSelectDevice,
  onControlDevice,
  currentSong,
  onCastCurrentSong,
  commandState,
  onReturnToDeviceList
}) => {
  const { isLight } = useTheme();
  const [speakerVolume, setSpeakerVolume] = useState(activeDevice?.status?.volume || 30);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [soundTestResult, setSoundTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (activeDevice?.status?.volume !== undefined && !isDraggingVolume) {
      setSpeakerVolume(activeDevice.status.volume);
    }
  }, [activeDevice?.status?.volume, activeDevice?.did, isDraggingVolume]);

  const handleCommitSpeakerVolume = (val?: number) => {
    const targetVal = typeof val === 'number' ? val : speakerVolume;
    setIsDraggingVolume(false);
    if (activeDevice) {
      onControlDevice(activeDevice.did, 'volume', targetVal);
    }
  };

  const handleTestSound = async () => {
    if (!activeDevice) return;
    setIsTestingSound(true);
    setSoundTestResult(null);
    try {
      const res = await apiFetch('/api/miot/test-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: activeDevice.did })
      });
      const data = await res.json();
      setSoundTestResult({
        success: data.success,
        message: data.message || (data.success ? '已成功向音箱发送测声指令，音箱将播放简短提示声' : '发声测试失败')
      });
      setTimeout(() => setSoundTestResult(null), 6000);
    } catch (err: any) {
      setSoundTestResult({ success: false, message: `发声测试网络异常: ${err.message}` });
      setTimeout(() => setSoundTestResult(null), 6000);
    } finally {
      setIsTestingSound(false);
    }
  };

  if (!activeDevice) {
    return (
      <div className={`p-12 rounded-3xl backdrop-blur-md border text-center space-y-4 ${
        isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
      }`}>
        <div className="w-16 h-16 rounded-3xl bg-[#FF6700]/10 text-[#FF6700] border border-[#FF6700]/20 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,103,0,0.15)]">
          <Radio className="w-8 h-8" />
        </div>
        <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
          暂未选择或未发现小爱音箱
        </h3>
        <p className={`text-xs max-w-sm mx-auto ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
          请先在【设备列表】中添加音箱、扫描局域网或选定默认播放音箱。
        </p>
        <button
          type="button"
          onClick={onReturnToDeviceList}
          className="px-5 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_0_15px_rgba(255,103,0,0.3)] transition cursor-pointer"
        >
          返回设备列表
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      {/* Main Control Console with Immersive UI */}
      <div className={`md:col-span-8 p-6 sm:p-8 rounded-3xl backdrop-blur-md border space-y-6 ${
        isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
      }`}>
        <div className={`flex items-center justify-between pb-4 border-b ${
          isLight ? 'border-zinc-200' : 'border-white/5'
        }`}>
          <div>
            <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>当前操作音箱</span>
            <h3 className={`text-lg font-bold flex items-center gap-2 ${
              isLight ? 'text-zinc-900' : 'text-white'
            }`}>
              {cleanDeviceName(activeDevice.name)}
              {activeDevice.ip ? (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 font-mono">
                  {activeDevice.ip}
                </span>
              ) : (
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-sans">
                  云端接入 (未获取局域网IP)
                </span>
              )}
            </h3>
          </div>

          <span className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
            activeDevice.status?.playing 
              ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_10px_rgba(255,103,0,0.2)]' 
              : isLight 
                ? 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                : 'bg-zinc-800/80 text-zinc-400 border border-white/5'
          }`}>
            {activeDevice.status?.playing && (
              <span className="w-2 h-2 rounded-full bg-[#FF6700] animate-pulse shadow-[0_0_6px_rgba(255,103,0,0.8)]" />
            )}
            {activeDevice.status?.playing ? '物理音箱: 正在串流播放' : '物理音箱: 待命闲置'}
          </span>
        </div>

        {/* UI Command Status vs Device State Banner */}
        {commandState && commandState.status !== 'idle' && (
          <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition ${
            commandState.status === 'pending'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 animate-pulse'
              : commandState.status === 'success' || (activeDevice.status?.playing && (commandState.action === 'play' || commandState.action === 'cast'))
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-300'
          }`}>
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {commandState.status === 'pending' && (
                <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {(commandState.status === 'success' || (activeDevice.status?.playing && (commandState.action === 'play' || commandState.action === 'cast'))) && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              )}
              {commandState.status === 'failed' && !(activeDevice.status?.playing && (commandState.action === 'play' || commandState.action === 'cast')) && (
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              {commandState.status === 'timeout' && !(activeDevice.status?.playing && (commandState.action === 'play' || commandState.action === 'cast')) && (
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
              <span className="font-medium truncate">
                {commandState.status === 'pending' && `正在向【${cleanDeviceName(activeDevice.name)}】下发${commandState.action || '控制'}指令，等待音箱硬件确认...`}
                {commandState.status === 'success' && `指令下发成功，音箱已确认执行 (${commandState.action || '操作完成'})`}
                {commandState.status === 'failed' && (
                  activeDevice.status?.playing
                    ? `音箱已处于串流播放中 (${cleanDeviceName(activeDevice.name)})`
                    : `指令执行失败: ${commandState.error || '音箱未在预期内响应'}`
                )}
                {commandState.status === 'timeout' && (
                  activeDevice.status?.playing
                    ? `音箱已成功接收串流并正在播放`
                    : `指令下发超时: 音箱未在超时期限内响应确认`
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono opacity-70 flex-shrink-0">
              <span className={`px-1.5 py-0.5 rounded border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-black/40 border-white/5'}`}>
                UI: {commandState.status.toUpperCase()}
              </span>
              <span className={`px-1.5 py-0.5 rounded border ${isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-black/40 border-white/5'}`}>
                Device: {activeDevice.status?.playing ? 'PLAYING' : 'IDLE'}
              </span>
            </div>
          </div>
        )}

        {/* Currently Playing Track on Speaker */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
          isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/60 border-white/5'
        }`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(255,103,0,0.2)]">
              <Radio className={`w-6 h-6 ${activeDevice.status?.playing ? 'animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <h4 className={`text-sm font-semibold truncate ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                {activeDevice.status?.currentTitle || '暂未投放歌曲'}
              </h4>
              <p className={`text-xs truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {activeDevice.status?.currentArtist || '从曲库点击“投放到音箱”开始点播'}
              </p>
              {activeDevice.status?.streamUrl && (
                <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                  源地址: {activeDevice.status.streamUrl}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              id="btn-test-sound"
              disabled={isTestingSound}
              onClick={handleTestSound}
              className={`px-3 py-2 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200' 
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
              }`}
              title="向音箱下发一段经过高保真编码测试音频，验证音箱扬声器与解码链路"
            >
              <Volume2 className={`w-3.5 h-3.5 text-[#FF6700] ${isTestingSound ? 'animate-bounce' : ''}`} />
              <span>{isTestingSound ? '发声测试中...' : '一键测声'}</span>
            </button>

            {currentSong && (
              <button
                onClick={onCastCurrentSong}
                className="px-4 py-2 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_0_15px_rgba(255,103,0,0.3)] transition whitespace-nowrap cursor-pointer"
              >
                推送当前音乐
              </button>
            )}
          </div>
        </div>

        {/* Test Sound Result Banner */}
        {soundTestResult && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            soundTestResult.success 
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300' 
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300'
          }`}>
            {soundTestResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span>{soundTestResult.message}</span>
          </div>
        )}

        {/* Remote Controller Buttons */}
        <div className="flex flex-col items-center justify-center gap-4 py-6">
          <div className="flex items-center gap-6">
            <button
              id="btn-remote-prev"
              onClick={() => onControlDevice(activeDevice.did, 'prev')}
              className={`p-3.5 rounded-full border transition active:scale-95 shadow-sm cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-zinc-950 border-zinc-200' 
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/5'
              }`}
              title="上一首"
            >
              <SkipBack className="w-6 h-6 fill-current" />
            </button>

            <button
              id="btn-remote-play-pause"
              onClick={() => onControlDevice(activeDevice.did, activeDevice.status?.playing ? 'pause' : 'play')}
              className="w-16 h-16 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white flex items-center justify-center shadow-[0_4px_25px_rgba(255,103,0,0.4)] transition transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              {activeDevice.status?.playing ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>

            <button
              id="btn-remote-next"
              onClick={() => onControlDevice(activeDevice.did, 'next')}
              className={`p-3.5 rounded-full border transition active:scale-95 shadow-sm cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 hover:text-zinc-950 border-zinc-200' 
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/5'
              }`}
              title="下一首"
            >
              <SkipForward className="w-6 h-6 fill-current" />
            </button>
          </div>

          <span className="text-xs text-zinc-500 font-mono">
            MIoT 协议交互延迟约 80~200ms
          </span>
        </div>

        {/* Volume Dial / Slider */}
        <div className={`space-y-3 p-4 rounded-2xl border ${
          isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/60 border-white/5'
        }`}>
          <div className="flex items-center justify-between text-xs">
            <span className={`flex items-center gap-1.5 ${isLight ? 'text-zinc-700' : 'text-zinc-400'}`}>
              <Volume2 className="w-4 h-4 text-[#FF6700]" />
              音箱输出音量
              {isDraggingVolume && (
                <span className="text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono ml-1 animate-pulse">
                  松开后下发指令
                </span>
              )}
            </span>
            <span className={`font-mono font-bold text-sm ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              {speakerVolume}%
            </span>
          </div>
          <input
            id="input-speaker-volume-slider"
            type="range"
            min="0"
            max="100"
            step="1"
            value={speakerVolume}
            onMouseDown={() => setIsDraggingVolume(true)}
            onTouchStart={() => setIsDraggingVolume(true)}
            onChange={(e) => {
              setSpeakerVolume(Number(e.target.value));
              setIsDraggingVolume(true);
            }}
            onMouseUp={(e) => handleCommitSpeakerVolume(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => handleCommitSpeakerVolume(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                handleCommitSpeakerVolume(Number((e.target as HTMLInputElement).value));
              }
            }}
            className={`w-full h-2 rounded-lg accent-[#FF6700] cursor-pointer focus:outline-none ${
              isLight ? 'bg-zinc-200' : 'bg-zinc-800'
            }`}
          />
          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono select-none">
            <button
              type="button"
              onClick={() => {
                setSpeakerVolume(0);
                handleCommitSpeakerVolume(0);
              }}
              className="hover:text-amber-500 transition cursor-pointer hover:underline"
              title="点击设为 0% (静音)"
            >
              0% 静音
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeakerVolume(25);
                handleCommitSpeakerVolume(25);
              }}
              className="hover:text-zinc-700 dark:hover:text-zinc-300 transition cursor-pointer hover:underline"
              title="点击设为 25%"
            >
              25% 夜间伴听
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeakerVolume(50);
                handleCommitSpeakerVolume(50);
              }}
              className="hover:text-zinc-700 dark:hover:text-zinc-300 transition cursor-pointer hover:underline"
              title="点击设为 50%"
            >
              50% 居室标准
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeakerVolume(75);
                handleCommitSpeakerVolume(75);
              }}
              className="hover:text-zinc-700 dark:hover:text-zinc-300 transition cursor-pointer hover:underline"
              title="点击设为 75%"
            >
              75% Hi-Fi 发烧
            </button>
            <button
              type="button"
              onClick={() => {
                setSpeakerVolume(100);
                handleCommitSpeakerVolume(100);
              }}
              className="hover:text-zinc-700 dark:hover:text-zinc-300 transition cursor-pointer hover:underline"
              title="点击设为 100%"
            >
              100% 派对最大
            </button>
          </div>
        </div>

      </div>

      {/* Side Info */}
      <div className="md:col-span-4 space-y-4">
        <div className={`p-6 rounded-3xl backdrop-blur-md border space-y-4 ${
          isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
        }`}>
          <h4 className={`text-sm font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            局域网串流连通保证
          </h4>
          <p className={`text-xs leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
            小米音箱通过本地 HTTP 协议拉取音频文件。请确保：
          </p>
          <ul className={`text-xs space-y-2 list-disc list-inside ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
            <li>音箱与 Tinglan 听澜服务器位于同一 WiFi / 局域网网段</li>
            <li>Docker 部署时建议使用 <code className={`px-1 py-0.5 rounded font-mono text-[#FF6700] ${isLight ? 'bg-zinc-100' : 'bg-zinc-950'}`}>network_mode: host</code></li>
            <li>路由器已允许设备间跨端口访问（无 AP 隔离）</li>
          </ul>
        </div>

        <div className={`p-6 rounded-3xl backdrop-blur-md border space-y-3 ${
          isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
        }`}>
          <h4 className={`text-sm font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>快捷设备切换</h4>
          <div className="space-y-2">
            {devices.map(d => (
              <button
                key={d.did}
                onClick={() => onSelectDevice(d.did)}
                className={`w-full p-3 rounded-2xl text-left text-xs flex items-center justify-between transition cursor-pointer ${
                  activeDevice.did === d.did
                    ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.15)]'
                    : isLight 
                      ? 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-200' 
                      : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-300 border border-white/5'
                }`}
              >
                <span className="truncate">{cleanDeviceName(d.name)}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{d.status?.volume}%</span>
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};
