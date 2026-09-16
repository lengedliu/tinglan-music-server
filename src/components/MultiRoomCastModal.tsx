import React, { useState } from 'react';
import { 
  X, 
  Speaker, 
  Radio, 
  Volume2, 
  Play, 
  Pause, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  Sparkles,
  Sliders
} from 'lucide-react';
import { XiaomiDevice, Song } from '../types';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../utils/api';

interface MultiRoomCastModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: XiaomiDevice[];
  currentSong: Song | null;
  onShowToast: (title: string, desc?: string, type?: 'success' | 'info' | 'error') => void;
  onRefreshDevices?: () => void;
}

export const MultiRoomCastModal: React.FC<MultiRoomCastModalProps> = ({
  isOpen,
  onClose,
  devices,
  currentSong,
  onShowToast,
  onRefreshDevices
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme === 'light';

  const [selectedDids, setSelectedDids] = useState<string[]>(() => {
    return devices.filter(d => d.status?.playing || d.ip).map(d => d.did);
  });
  const [masterVolume, setMasterVolume] = useState<number>(45);
  const [deviceVolumes, setDeviceVolumes] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    devices.forEach(d => {
      map[d.did] = d.status?.volume ?? 45;
    });
    return map;
  });
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [lastResults, setLastResults] = useState<{ did: string; name: string; success: boolean; message: string }[] | null>(null);

  if (!isOpen) return null;

  const toggleSelectDevice = (did: string) => {
    setSelectedDids(prev => 
      prev.includes(did) ? prev.filter(id => id !== did) : [...prev, did]
    );
  };

  const toggleSelectAll = () => {
    if (selectedDids.length === devices.length) {
      setSelectedDids([]);
    } else {
      setSelectedDids(devices.map(d => d.did));
    }
  };

  const handleMasterVolumeChange = async (vol: number) => {
    setMasterVolume(vol);
    // Update local state map
    const updated: Record<string, number> = { ...deviceVolumes };
    selectedDids.forEach(did => {
      updated[did] = vol;
    });
    setDeviceVolumes(updated);

    if (selectedDids.length > 0) {
      try {
        await apiFetch('/api/miot/group-cast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dids: selectedDids,
            action: 'volume',
            volume: vol
          })
        });
      } catch (e) {}
    }
  };

  const handleDeviceVolumeChange = async (did: string, vol: number) => {
    setDeviceVolumes(prev => ({ ...prev, [did]: vol }));
    try {
      await apiFetch('/api/miot/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did,
          action: 'volume',
          value: vol
        })
      });
    } catch (e) {}
  };

  const handleGroupCastSong = async () => {
    if (selectedDids.length === 0) {
      onShowToast('请选择目标音箱', '至少需要勾选一个小米音箱设备', 'error');
      return;
    }
    if (!currentSong) {
      onShowToast('无正在播放曲目', '请先在曲库中点选一首歌曲', 'error');
      return;
    }

    setIsBroadcasting(true);
    try {
      const res = await apiFetch('/api/miot/group-cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dids: selectedDids,
          action: 'cast',
          song: currentSong
        })
      });
      const data = await res.json();
      if (data?.results) {
        setLastResults(data.results);
      }
      if (data.success) {
        onShowToast('全屋多音箱广播成功', `已向 ${data.successCount} 台音箱下发同步串流指令`, 'success');
      } else {
        onShowToast('部分音箱未响应', `成功 ${data.successCount || 0} 台，失败 ${data.failedCount || 0} 台`, 'error');
      }
    } catch (err: any) {
      onShowToast('全屋同播异常', err.message || '网络请求失败', 'error');
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleGroupControl = async (action: 'play' | 'pause') => {
    if (selectedDids.length === 0) {
      onShowToast('请选择目标音箱', '至少需要勾选一个音箱', 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/miot/group-cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dids: selectedDids,
          action
        })
      });
      const data = await res.json();
      onShowToast(
        action === 'play' ? '全屋同步恢复' : '全屋同步暂停',
        `已向 ${selectedDids.length} 台设备下发指令`,
        'info'
      );
    } catch (err: any) {
      onShowToast('指令发送失败', err.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[#18181b] border-white/10 text-white'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-zinc-900/50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF6700]/15 flex items-center justify-center text-[#FF6700]">
              <Layers className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                全屋多音箱同播 · Multi-Room Group Cast
              </h3>
              <p className="text-xs text-zinc-500">
                勾选局域网多台小爱音箱，一键多路并发串流与音量联合调控
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isLight ? 'hover:bg-zinc-200 text-zinc-500' : 'hover:bg-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Current Broadcast Track Indicator */}
          {currentSong && (
            <div className={`p-3.5 rounded-xl border flex items-center gap-3 ${
              isLight ? 'bg-orange-50/60 border-orange-200' : 'bg-[#FF6700]/10 border-[#FF6700]/20'
            }`}>
              <img 
                src={currentSong.coverUrl || '/placeholder.svg'} 
                alt={currentSong.title}
                className="w-12 h-12 rounded-lg object-cover shadow-sm border border-white/10" 
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-[#FF6700] font-bold uppercase tracking-wider">广播音轨</div>
                <div className="text-sm font-bold truncate">{currentSong.title}</div>
                <div className="text-xs text-zinc-400 truncate">{currentSong.artist}</div>
              </div>
            </div>
          )}

          {/* Master Volume Bar */}
          <div className={`p-4 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/50 border-white/5'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#FF6700]" />
                全屋主音量同步联动
              </span>
              <span className="text-xs font-mono font-bold text-[#FF6700]">{masterVolume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={masterVolume}
              onChange={(e) => handleMasterVolumeChange(parseInt(e.target.value, 10))}
              className="w-full h-2 accent-[#FF6700] rounded-lg cursor-pointer bg-zinc-700"
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">
              拖动主滑块将同时调控所有已勾选目标音箱的输出声级
            </p>
          </div>

          {/* Device Selection List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Speaker className="w-3.5 h-3.5 text-[#FF6700]" />
                选择参与同播的小爱音箱 ({selectedDids.length}/{devices.length})
              </span>
              <button
                onClick={toggleSelectAll}
                className="text-xs text-[#FF6700] hover:underline font-medium"
              >
                {selectedDids.length === devices.length ? '取消全选' : '全选所有音箱'}
              </button>
            </div>

            <div className="space-y-2.5">
              {devices.length > 0 ? (
                devices.map((device) => {
                  const isChecked = selectedDids.includes(device.did);
                  const vol = deviceVolumes[device.did] ?? (device.status?.volume ?? 45);

                  return (
                    <div 
                      key={device.did}
                      className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isChecked 
                          ? isLight 
                            ? 'bg-orange-50/50 border-orange-300' 
                            : 'bg-zinc-900/90 border-[#FF6700]/40'
                          : isLight 
                            ? 'bg-zinc-50 border-zinc-200 opacity-70' 
                            : 'bg-zinc-900/40 border-white/5 opacity-60'
                      }`}
                    >
                      <div 
                        onClick={() => toggleSelectDevice(device.did)}
                        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // Controlled via parent div click
                          className="w-4 h-4 rounded text-[#FF6700] accent-[#FF6700] cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate flex items-center gap-2">
                            {device.name}
                            {device.status?.playing && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                正在发声
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-zinc-400 font-mono truncate">
                            {device.model || '小爱音箱'} • {device.ip || '云端直连'}
                          </div>
                        </div>
                      </div>

                      {/* Individual Volume Control */}
                      {isChecked && (
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={vol}
                            onChange={(e) => handleDeviceVolumeChange(device.did, parseInt(e.target.value, 10))}
                            className="w-20 h-1.5 accent-[#FF6700] rounded-lg cursor-pointer bg-zinc-700"
                          />
                          <span className="text-xs font-mono text-zinc-400 w-8 text-right">{vol}%</span>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 text-zinc-500 text-xs">
                  暂未检测到小米音箱，请先在“智能音箱”中扫描或登录米家账号
                </div>
              )}
            </div>
          </div>

          {/* Last Broadcast Response Detail */}
          {lastResults && (
            <div className={`p-3 rounded-xl border text-xs space-y-1 ${
              isLight ? 'bg-zinc-100 border-zinc-200' : 'bg-black/40 border-white/5'
            }`}>
              <div className="font-bold text-zinc-400 mb-1.5">最近一次同播响应状态:</div>
              {lastResults.map(r => (
                <div key={r.did} className="flex items-center justify-between font-mono">
                  <span className="text-zinc-300">{r.name}:</span>
                  <span className={r.success ? 'text-emerald-400' : 'text-red-400'}>
                    {r.success ? '✓ 成功' : `✕ ${r.message}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`px-6 py-4 border-t flex items-center justify-between ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-zinc-900/50'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGroupControl('pause')}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                isLight ? 'border-zinc-300 hover:bg-zinc-200 text-zinc-800' : 'border-white/15 hover:bg-white/10 text-white'
              }`}
            >
              <Pause className="w-3.5 h-3.5" />
              全屋暂停
            </button>
            <button
              onClick={() => handleGroupControl('play')}
              className={`px-3 py-2 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                isLight ? 'border-zinc-300 hover:bg-zinc-200 text-zinc-800' : 'border-white/15 hover:bg-white/10 text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              全屋恢复
            </button>
          </div>

          <button
            onClick={handleGroupCastSong}
            disabled={isBroadcasting || selectedDids.length === 0}
            className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg transition ${
              isBroadcasting || selectedDids.length === 0
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-[#FF6700] hover:bg-[#e55c00] text-white shadow-[#FF6700]/30 active:scale-95'
            }`}
          >
            {isBroadcasting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Speaker className="w-4 h-4 animate-pulse" />
            )}
            <span>{isBroadcasting ? '广播下发中...' : `一键全屋同播 (${selectedDids.length}台)`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
