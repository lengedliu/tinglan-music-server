import React, { useState, useEffect } from 'react';
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
  Sliders,
  BookmarkPlus,
  Trash2,
  Send,
  Users
} from 'lucide-react';
import { XiaomiDevice, Song, SpeakerGroup } from '../types';
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

  // P1 Speaker Groups
  const [groups, setGroups] = useState<SpeakerGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showSaveGroup, setShowSaveGroup] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [ttsBroadcastText, setTtsBroadcastText] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      fetchGroups();
    }
  }, [isOpen]);

  const fetchGroups = async () => {
    try {
      const res = await apiFetch('/api/groups');
      const data = await res.json();
      if (res.ok && data.success) {
        setGroups(data.groups || []);
      }
    } catch (e) {
      console.warn('Failed to load speaker groups:', e);
    }
  };

  const handleApplyGroup = (grp: SpeakerGroup) => {
    setActiveGroupId(grp.id);
    setSelectedDids(grp.memberDids);
    setMasterVolume(grp.masterVolume || 45);
    if (grp.volumeOffsets) {
      const newVols: Record<string, number> = {};
      devices.forEach(d => {
        const offset = grp.volumeOffsets[d.did] || 0;
        newVols[d.did] = Math.min(100, Math.max(0, (grp.masterVolume || 45) + offset));
      });
      setDeviceVolumes(newVols);
    }
    onShowToast('已套用音箱编组', `已加载「${grp.name}」(${grp.memberDids.length} 台设备)`, 'info');
  };

  const handleSaveCurrentAsGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || selectedDids.length === 0) return;

    try {
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          memberDids: selectedDids,
          masterVolume,
          volumeOffsets: {},
          icon: 'Users'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('编组保存成功', `已持久化「${newGroupName}」到数据库 (P1)`, 'success');
        setNewGroupName('');
        setShowSaveGroup(false);
        fetchGroups();
      }
    } catch (e: any) {
      onShowToast('保存编组失败', e.message, 'error');
    }
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    try {
      const res = await apiFetch(`/api/groups/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onShowToast('编组已删除', `已移除「${name}」`, 'info');
        setGroups(prev => prev.filter(g => g.id !== id));
        if (activeGroupId === id) setActiveGroupId(null);
      }
    } catch (e: any) {
      onShowToast('删除失败', e.message, 'error');
    }
  };

  const handleGroupTtsBroadcast = async () => {
    if (!ttsBroadcastText.trim() || selectedDids.length === 0) return;
    try {
      const res = await apiFetch('/api/miot/group-cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dids: selectedDids,
          action: 'tts',
          text: ttsBroadcastText.trim()
        })
      });
      if (res.ok) {
        onShowToast('全屋语音广播已发送', `已向 ${selectedDids.length} 台音箱播报`, 'success');
        setTtsBroadcastText('');
      }
    } catch (e: any) {
      onShowToast('全屋播报失败', e.message, 'error');
    }
  };

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
      await apiFetch('/api/miot/group-cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dids: selectedDids,
          action
        })
      });
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
                全屋多音箱编组与广播 · Multi-Room (P1)
              </h3>
              <p className="text-xs text-zinc-500">
                多房间编组持久化 · 一键多路并发串流 · 主音量协同
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
          {/* Preset Speaker Groups (P1) */}
          <div className={`p-4 rounded-xl border space-y-3 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Users className="w-4 h-4" />
                预设音箱编组 (P1)
              </span>
              <button
                onClick={() => setShowSaveGroup(!showSaveGroup)}
                className="text-xs text-[#FF6700] hover:underline flex items-center gap-1 font-semibold"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                保存当前为新编组
              </button>
            </div>

            {/* Group Chips */}
            <div className="flex flex-wrap gap-2">
              {groups.map(grp => {
                const isActive = activeGroupId === grp.id;
                return (
                  <div
                    key={grp.id}
                    className={`flex items-center gap-1.5 py-1 px-2.5 rounded-xl border text-xs transition ${
                      isActive
                        ? 'bg-blue-500/20 border-blue-500 text-blue-300 font-bold shadow-sm'
                        : 'bg-zinc-950/60 border-white/10 text-zinc-300 hover:border-white/20'
                    }`}
                  >
                    <button
                      onClick={() => handleApplyGroup(grp)}
                      className="flex items-center gap-1.5 text-left"
                    >
                      <Radio className="w-3.5 h-3.5 text-blue-400" />
                      <span>{grp.name}</span>
                      <span className="text-[10px] opacity-60">({grp.memberDids.length}台)</span>
                    </button>
                    {!grp.isDefault && (
                      <button
                        onClick={() => handleDeleteGroup(grp.id, grp.name)}
                        className="ml-1 text-zinc-500 hover:text-rose-400 p-0.5"
                        title="删除编组"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Save New Group Form */}
            {showSaveGroup && (
              <form onSubmit={handleSaveCurrentAsGroup} className="flex gap-2 pt-2 border-t border-white/5">
                <input
                  type="text"
                  placeholder="输入新编组名称 (例: 客厅+餐厅)..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-zinc-950 border border-white/10 rounded-xl text-xs text-white"
                />
                <button
                  type="submit"
                  disabled={!newGroupName.trim() || selectedDids.length === 0}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition"
                >
                  保存
                </button>
              </form>
            )}
          </div>

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
                编组主音量联动调控
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

          {/* Quick Whole-home TTS Broadcast */}
          <div className={`p-4 rounded-xl border space-y-2 ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/50 border-white/5'}`}>
            <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              编组一键全屋 TTS 语音喊话
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="输入全屋喊话内容 (例: 开饭啦！)..."
                value={ttsBroadcastText}
                onChange={(e) => setTtsBroadcastText(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-zinc-950 border border-white/10 rounded-xl text-xs text-white"
              />
              <button
                type="button"
                onClick={handleGroupTtsBroadcast}
                disabled={!ttsBroadcastText.trim() || selectedDids.length === 0}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
              >
                <Send className="w-3 h-3" />
                广播
              </button>
            </div>
          </div>

          {/* Device Selection List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Speaker className="w-4 h-4 text-emerald-400" />
                音箱成员列表 ({selectedDids.length}/{devices.length})
              </span>
              <button
                onClick={toggleSelectAll}
                className="text-xs text-[#FF6700] hover:underline font-semibold"
              >
                {selectedDids.length === devices.length ? '全部取消' : '全选音箱'}
              </button>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {devices.map((device) => {
                const isSelected = selectedDids.includes(device.did);
                const currentVol = deviceVolumes[device.did] ?? (device.status?.volume ?? 45);

                return (
                  <div
                    key={device.did}
                    className={`p-3.5 rounded-xl border transition flex flex-col gap-2 ${
                      isSelected
                        ? isLight
                          ? 'bg-orange-50/40 border-orange-300 shadow-sm'
                          : 'bg-[#FF6700]/10 border-[#FF6700]/40'
                        : isLight
                        ? 'bg-zinc-50 border-zinc-200 opacity-60'
                        : 'bg-zinc-900/40 border-white/5 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        onClick={() => toggleSelectDevice(device.did)}
                        className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                      >
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition ${
                          isSelected 
                            ? 'bg-[#FF6700] border-[#FF6700] text-white' 
                            : 'border-white/20 bg-zinc-800'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold truncate flex items-center gap-2">
                            {device.name}
                            <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/5">
                              {device.model || 'Sound'}
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                            <span>IP: {device.ip || '云端在线'}</span>
                            <span>·</span>
                            <span>{device.status?.playing ? '🟢 正在播放' : '⚪ 待命中'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-zinc-400">{currentVol}%</span>
                      </div>
                    </div>

                    {/* Individual Device Volume Slider */}
                    {isSelected && (
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={currentVol}
                          onChange={(e) => handleDeviceVolumeChange(device.did, parseInt(e.target.value, 10))}
                          className="w-full h-1 accent-[#FF6700] rounded-lg cursor-pointer bg-zinc-700"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className={`px-6 py-4 border-t flex items-center justify-between gap-3 ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-zinc-900/80'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleGroupControl('play')}
              disabled={selectedDids.length === 0}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-white transition flex items-center gap-1.5 border border-white/10"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              全屋恢复
            </button>
            <button
              onClick={() => handleGroupControl('pause')}
              disabled={selectedDids.length === 0}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-bold text-white transition flex items-center gap-1.5 border border-white/10"
            >
              <Pause className="w-3.5 h-3.5 text-amber-400" />
              全屋暂停
            </button>
          </div>

          <button
            id="btn-confirm-multi-room-cast"
            onClick={handleGroupCastSong}
            disabled={isBroadcasting || selectedDids.length === 0 || !currentSong}
            className="px-5 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#ff7b1a] disabled:opacity-40 text-sm font-bold text-white shadow-lg shadow-[#FF6700]/25 transition flex items-center gap-2"
          >
            {isBroadcasting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                正在广播串流...
              </>
            ) : (
              <>
                <Radio className="w-4 h-4" />
                向勾选设备全屋推流 ({selectedDids.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
