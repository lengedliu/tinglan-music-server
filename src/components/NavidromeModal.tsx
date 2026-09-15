import React, { useState, useEffect } from 'react';
import { 
  Server, Wifi, Check, AlertCircle, RefreshCw, Database, 
  Download, Lock, X, ShieldCheck, Music2, ListMusic, CheckSquare, 
  Square, Search, FolderDown, Clock, Layers
} from 'lucide-react';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

interface NavidromePlaylist {
  id: string;
  name: string;
  comment?: string;
  songCount: number;
  duration: number;
  coverUrl?: string;
  created?: string;
  changed?: string;
  owner?: string;
}

interface NavidromeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSongsSynced?: () => void;
  onPlaylistsSynced?: () => void;
}

export const NavidromeModal: React.FC<NavidromeModalProps> = ({
  isOpen,
  onClose,
  onSongsSynced,
  onPlaylistsSynced,
}) => {
  const { themeConfig } = useTheme();
  const isLight = !!themeConfig?.isLight;

  const [serverUrl, setServerUrl] = useState<string>('http://192.168.1.100:4533');
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState<boolean>(false);
  const [isImportingPlaylists, setIsImportingPlaylists] = useState<boolean>(false);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; count?: number; message?: string } | null>(null);
  const [importResult, setImportResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Playlists fetched from Navidrome
  const [remotePlaylists, setRemotePlaylists] = useState<NavidromePlaylist[]>([]);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState<string>('');

  const [fetchMessage, setFetchMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      apiFetch('/api/navidrome/config')
        .then(res => res.json())
        .then(data => {
          if (data) {
            if (data.serverUrl) setServerUrl(data.serverUrl);
            if (data.username) setUsername(data.username);
            if (data.password) setPassword(data.password);

            // If already configured, attempt to load remote playlists automatically
            if (data.serverUrl && data.username && data.isConnected) {
              fetchRemotePlaylists(data.serverUrl, data.username, data.password);
            }
          }
        })
        .catch(err => console.warn('Load Navidrome config err:', err));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatDuration = (secs: number) => {
    if (!secs) return '0 分钟';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins} 分钟`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs} 小时 ${remMins} 分钟`;
  };

  const fetchRemotePlaylists = async (sUrl = serverUrl, uName = username, pwd = password) => {
    setIsLoadingPlaylists(true);
    setImportResult(null);
    setFetchMessage(null);
    try {
      const res = await apiFetch('/api/navidrome/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: sUrl, username: uName, password: pwd }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.playlists) && data.playlists.length > 0) {
        setRemotePlaylists(data.playlists);
        // Default: select all discovered playlists for convenience
        setSelectedPlaylistIds(data.playlists.map((p: NavidromePlaylist) => p.id));
        setFetchMessage(null);
      } else {
        setRemotePlaylists([]);
        setFetchMessage(data.message || '暂未获取到歌单，请核对账号权限或歌单公开状态');
      }
    } catch (err: any) {
      console.warn('Fetch Navidrome playlists error:', err);
      setFetchMessage(`获取歌单出错: ${err.message || '网络无法访问'}`);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/navidrome/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl, username, password }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        // Automatically fetch playlist list upon successful ping using current form fields
        fetchRemotePlaylists(serverUrl, username, password);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '网络连接失败，请检查 URL 或内网穿透设置' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncNavidrome = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await apiFetch('/api/navidrome/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl, username, password }),
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.success) {
        if (onSongsSynced) onSongsSynced();
        if (onPlaylistsSynced) onPlaylistsSynced();
      }
    } catch (err: any) {
      setSyncResult({ success: false, message: err.message || '同步曲库失败' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTogglePlaylistSelection = (id: string) => {
    setSelectedPlaylistIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPlaylists = () => {
    setSelectedPlaylistIds(remotePlaylists.map(p => p.id));
  };

  const handleDeselectAllPlaylists = () => {
    setSelectedPlaylistIds([]);
  };

  const handleImportSelectedPlaylists = async () => {
    if (selectedPlaylistIds.length === 0) return;
    setIsImportingPlaylists(true);
    setImportResult(null);
    try {
      const res = await apiFetch('/api/navidrome/import-playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          playlistIds: selectedPlaylistIds,
          serverUrl,
          username,
          password
        }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.success) {
        if (onSongsSynced) onSongsSynced();
        if (onPlaylistsSynced) onPlaylistsSynced();
      }
    } catch (err: any) {
      setImportResult({ success: false, message: err.message || '导入歌单网络异常' });
    } finally {
      setIsImportingPlaylists(false);
    }
  };

  const filteredPlaylists = remotePlaylists.filter(p => {
    if (!playlistSearchQuery.trim()) return true;
    const q = playlistSearchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.comment && p.comment.toLowerCase().includes(q));
  });

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className={`w-full max-w-2xl max-h-[90vh] flex flex-col border rounded-3xl shadow-2xl relative overflow-hidden transition ${
        isLight 
          ? 'bg-white border-zinc-200 text-zinc-900 shadow-[0_25px_60px_rgba(0,0,0,0.2)]' 
          : 'bg-zinc-950 border-white/10 text-white'
      }`}>
        
        {/* Background Ambient Light */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#FF6700]/10 blur-[100px] pointer-events-none" />

        {/* Modal Header */}
        <div className={`flex items-center justify-between p-5 sm:p-6 border-b flex-shrink-0 ${
          isLight ? 'border-zinc-200/80 bg-zinc-50/50' : 'border-white/10 bg-zinc-900/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.25)]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base sm:text-lg font-bold flex items-center gap-2 ${isLight ? 'text-zinc-950' : 'text-white'}`}>
                连接 Navidrome 远程曲库与歌单
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-mono font-bold">
                  Subsonic API
                </span>
              </h3>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                支持直接拉取私有 NAS / Docker 中的 Navidrome 歌单并选择性导入
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-full transition ${
              isLight ? 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/60' : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* Server Config Inputs */}
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>
                <Server className="w-3.5 h-3.5 text-[#FF6700]" />
                Navidrome 服务器地址 (Server URL)
              </label>
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="例如 http://192.168.1.100:4533 或 https://music.yourdomain.com"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-[#FF6700] transition ${
                  isLight 
                    ? 'bg-zinc-50 border-zinc-300 text-zinc-950 placeholder-zinc-400 focus:bg-white focus:ring-2 focus:ring-[#FF6700]/20' 
                    : 'bg-zinc-900 border-white/10 text-white placeholder-zinc-500'
                }`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={`text-xs font-semibold ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>
                  用户名 (Username)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Navidrome 登录账号"
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-[#FF6700] transition ${
                    isLight 
                      ? 'bg-zinc-50 border-zinc-300 text-zinc-950 placeholder-zinc-400 focus:bg-white focus:ring-2 focus:ring-[#FF6700]/20' 
                      : 'bg-zinc-900 border-white/10 text-white placeholder-zinc-500'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={`text-xs font-semibold flex items-center gap-1 ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>
                  <Lock className="w-3 h-3 text-zinc-400" />
                  密码 (Password)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Navidrome 登录密码"
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-[#FF6700] transition ${
                    isLight 
                      ? 'bg-zinc-50 border-zinc-300 text-zinc-950 placeholder-zinc-400 focus:bg-white focus:ring-2 focus:ring-[#FF6700]/20' 
                      : 'bg-zinc-900 border-white/10 text-white placeholder-zinc-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Connection Actions */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !serverUrl || !username}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition disabled:opacity-50 ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-zinc-200/80 border-zinc-300 text-zinc-900' 
                  : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-white'
              }`}
            >
              <Wifi className={`w-4 h-4 ${isTesting ? 'animate-pulse text-[#FF6700]' : 'text-zinc-400'}`} />
              <span>{isTesting ? '正在测试...' : '测试并连接'}</span>
            </button>

            <button
              onClick={() => fetchRemotePlaylists(serverUrl, username, password)}
              disabled={isLoadingPlaylists || !serverUrl || !username}
              className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition disabled:opacity-50 ${
                isLight 
                  ? 'bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-950' 
                  : 'bg-zinc-900 hover:bg-zinc-800 border-[#FF6700]/40 text-[#FF6700]'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingPlaylists ? 'animate-spin' : ''}`} />
              <span>{isLoadingPlaylists ? '正在获取歌单...' : '获取 Navidrome 歌单'}</span>
            </button>

            <button
              onClick={handleSyncNavidrome}
              disabled={isSyncing || !serverUrl || !username}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition disabled:opacity-50"
              title="拉取全部 500 首歌曲至曲库"
            >
              <Download className={`w-4 h-4 ${isSyncing ? 'animate-bounce' : ''}`} />
              <span>{isSyncing ? '同步中...' : '同步全量曲库'}</span>
            </button>
          </div>

          {/* Test Alert */}
          {testResult && (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in ${
              testResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}>
              {testResult.success ? (
                <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <p className="font-bold">{testResult.success ? 'Navidrome 连接成功！' : '连接测试未通过'}</p>
                <p className="opacity-90 font-mono text-[11px]">{testResult.message}</p>
                {testResult.version && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Server Engine: {testResult.version}</p>
                )}
              </div>
            </div>
          )}

          {/* Import Result Alert */}
          {importResult && (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in ${
              importResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}>
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">{importResult.success ? '歌单导入完成' : '歌单导入提示'}</p>
                <p className="opacity-90 text-[11px]">{importResult.message}</p>
              </div>
            </div>
          )}

          {/* Sync Result Alert */}
          {syncResult && (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in ${
              syncResult.success 
                ? 'bg-[#FF6700]/10 border-[#FF6700]/30 text-orange-950 dark:text-amber-200' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}>
              <Music2 className="w-5 h-5 text-[#FF6700] flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">{syncResult.success ? `成功导入 ${syncResult.count || 0} 首 Navidrome 歌曲！` : '曲库同步失败'}</p>
                <p className="opacity-90 text-[11px]">{syncResult.message}</p>
              </div>
            </div>
          )}

          {/* Remote Playlists Selection Panel */}
          <div className={`p-4 rounded-2xl border space-y-3 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/50 border-white/10'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-[#FF6700]" />
                <h4 className={`text-xs font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                  Navidrome 远程歌单
                  <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-[#FF6700]/15 text-[#FF6700] font-mono font-bold">
                    {remotePlaylists.length} 个
                  </span>
                </h4>
              </div>

              {remotePlaylists.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={handleSelectAllPlaylists}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded transition ${
                      isLight ? 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    全选
                  </button>
                  <span className={isLight ? 'text-zinc-300' : 'text-zinc-700'}>|</span>
                  <button
                    onClick={handleDeselectAllPlaylists}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded transition ${
                      isLight ? 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    取消全选
                  </button>
                </div>
              )}
            </div>

            {/* Search Filter for Playlists */}
            {remotePlaylists.length > 0 && (
              <div className="relative">
                <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-zinc-400' : 'text-zinc-500'}`} />
                <input
                  type="text"
                  placeholder="搜索 Navidrome 歌单名称..."
                  value={playlistSearchQuery}
                  onChange={(e) => setPlaylistSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-1.5 rounded-xl border text-xs focus:outline-none transition ${
                    isLight 
                      ? 'bg-white border-zinc-300 text-zinc-950 placeholder-zinc-400 focus:border-[#FF6700]' 
                      : 'bg-zinc-950 border-white/10 text-white placeholder-zinc-500 focus:border-[#FF6700]'
                  }`}
                />
              </div>
            )}

            {/* Playlist Cards List */}
            {isLoadingPlaylists ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-zinc-500">
                <RefreshCw className="w-5 h-5 animate-spin text-[#FF6700]" />
                <span>正在获取远程 Navidrome 歌单列表...</span>
              </div>
            ) : remotePlaylists.length === 0 ? (
              <div className={`py-6 px-4 text-center text-xs rounded-xl border border-dashed space-y-1 ${
                isLight ? 'border-zinc-300 text-zinc-600 bg-zinc-100/50' : 'border-zinc-800 text-zinc-400 bg-zinc-950/40'
              }`}>
                <p className="font-semibold">{fetchMessage || '暂未获取到歌单'}</p>
                <p className="text-[11px] opacity-80">请确认已填写上方服务器配置并点击「测试并连接」或「获取 Navidrome 歌单」</p>
              </div>
            ) : filteredPlaylists.length === 0 ? (
              <div className="py-4 text-center text-xs text-zinc-500">
                未搜索到匹配的歌单
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {filteredPlaylists.map(pl => {
                  const isSelected = selectedPlaylistIds.includes(pl.id);
                  return (
                    <div
                      key={pl.id}
                      onClick={() => handleTogglePlaylistSelection(pl.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition ${
                        isSelected
                          ? (isLight ? 'bg-orange-50/90 border-orange-300 shadow-sm' : 'bg-[#FF6700]/15 border-[#FF6700]/40')
                          : (isLight ? 'bg-white hover:bg-zinc-100/80 border-zinc-200' : 'bg-zinc-950/60 hover:bg-zinc-900 border-white/5')
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-[#FF6700] border-[#FF6700] text-white'
                            : (isLight ? 'border-zinc-300 bg-zinc-100 text-transparent' : 'border-zinc-700 bg-zinc-900 text-transparent')
                        }`}>
                          <Check className="w-3.5 h-3.5" />
                        </div>

                        <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 border border-black/10 bg-zinc-800">
                          <img 
                            src={pl.coverUrl} 
                            alt={pl.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${
                            isSelected 
                              ? (isLight ? 'text-orange-950' : 'text-[#FF6700]') 
                              : (isLight ? 'text-zinc-950' : 'text-zinc-100')
                          }`}>
                            {pl.name}
                          </p>
                          <div className={`flex items-center gap-2 text-[10px] truncate mt-0.5 ${
                            isSelected 
                              ? (isLight ? 'text-orange-900/80' : 'text-orange-300/80') 
                              : (isLight ? 'text-zinc-500' : 'text-zinc-400')
                          }`}>
                            <span>{pl.songCount} 首歌曲</span>
                            {pl.duration > 0 && (
                              <>
                                <span>·</span>
                                <span>{formatDuration(pl.duration)}</span>
                              </>
                            )}
                            {pl.owner && (
                              <>
                                <span>·</span>
                                <span>创建者: {pl.owner}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold ml-2 whitespace-nowrap ${
                        isSelected 
                          ? (isLight ? 'bg-orange-200/90 text-orange-950' : 'bg-[#FF6700]/30 text-[#FF6700]') 
                          : (isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400')
                      }`}>
                        {isSelected ? '已选中' : '未选择'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Import Button */}
            {remotePlaylists.length > 0 && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleImportSelectedPlaylists}
                  disabled={isImportingPlaylists || selectedPlaylistIds.length === 0}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-bold shadow-[0_4px_15px_rgba(255,103,0,0.3)] transition disabled:opacity-50"
                >
                  <FolderDown className={`w-4 h-4 ${isImportingPlaylists ? 'animate-bounce' : ''}`} />
                  <span>
                    {isImportingPlaylists 
                      ? '正在拉取歌曲与导入歌单...' 
                      : `导入选中的歌单 (${selectedPlaylistIds.length} 个)`}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Info Note */}
          <div className={`p-3.5 rounded-2xl border space-y-1.5 text-left ${
            isLight ? 'bg-zinc-100/80 border-zinc-200' : 'bg-zinc-900/40 border-white/5'
          }`}>
            <h5 className={`text-xs font-bold flex items-center gap-1.5 ${isLight ? 'text-zinc-800' : 'text-zinc-300'}`}>
              <Database className="w-3.5 h-3.5 text-[#FF6700]" />
              歌单导入与投播说明
            </h5>
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
              勾选并导入的 Navidrome 歌单将直接同步在「歌单列表」中。歌单内的曲目支持在电脑端本地点播、歌词同步，亦可通过「一键投播到小米音箱」实现整张 Navidrome 远程歌单的无缝智能连播。
            </p>
          </div>

        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex items-center justify-between text-[11px] flex-shrink-0 ${
          isLight ? 'border-zinc-200 bg-zinc-50/80 text-zinc-500' : 'border-white/5 bg-zinc-950 text-zinc-500'
        }`}>
          <span>基于 Subsonic / OpenSubsonic REST 协议规范</span>
          <button
            onClick={onClose}
            className={`px-4 py-1.5 rounded-xl font-semibold transition ${
              isLight ? 'bg-zinc-200 text-zinc-800 hover:bg-zinc-300' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            关闭
          </button>
        </div>

      </div>
    </div>
  );
};

