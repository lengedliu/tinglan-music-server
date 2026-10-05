import React, { useState, useRef } from 'react';
import {
  X,
  Link2,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Music,
  Play,
  ArrowRight,
  Download,
  Sparkles,
  Loader2,
  RefreshCw,
  Search,
  Check,
  Disc3
} from 'lucide-react';
import { Song, Playlist } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';

interface ParsedCandidate {
  song: Song;
  score: number;
}

interface ParsedTrack {
  id: string;
  originalTitle: string;
  originalArtist: string;
  originalAlbum?: string;
  originalDuration?: number;
  status: 'matched' | 'fuzzy' | 'missing';
  matchScore: number;
  matchedSong?: Song;
  candidateSongs?: ParsedCandidate[];
  selectedSongId?: string; // User override
  excludeFromImport?: boolean;
}

interface ParseResult {
  sourceType: 'netease' | 'qqmusic' | 'text' | 'm3u' | 'csv' | 'unknown';
  playlistName: string;
  description: string;
  coverUrl: string;
  totalTracks: number;
  matchedCount: number;
  fuzzyCount: number;
  missingCount: number;
  tracks: ParsedTrack[];
}

interface PlaylistImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (createdPlaylist: Playlist, playImmediately?: boolean) => void;
  onPlaySong?: (song: Song) => void;
  allSongs: Song[];
}

export const PlaylistImportModal: React.FC<PlaylistImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
  onPlaySong,
  allSongs
}) => {
  const { themeConfig, isLight } = useTheme();

  const [activeTab, setActiveTab] = useState<'url' | 'text' | 'file'>('url');
  
  // Input states
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [customPlaylistName, setCustomPlaylistName] = useState('');
  const [fileName, setFileName] = useState('');

  // Processing states
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter in result table: 'all' | 'matched' | 'fuzzy' | 'missing'
  const [resultFilter, setResultFilter] = useState<'all' | 'matched' | 'fuzzy' | 'missing'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  
  // Creating state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Handle URL or Text parsing
  const handleParse = async (overrideInput?: string) => {
    setErrorMsg(null);
    let rawInput = overrideInput !== undefined ? overrideInput : '';

    if (overrideInput === undefined) {
      if (activeTab === 'url') rawInput = urlInput.trim();
      else if (activeTab === 'text') rawInput = textInput.trim();
    }

    if (!rawInput) {
      setErrorMsg(activeTab === 'url' ? '请输入网易云或 QQ 音乐的歌单分享链接/ID' : '请粘贴或输入歌曲清单文本');
      return;
    }

    setIsParsing(true);
    try {
      const res = await apiFetch('/api/playlists/import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: rawInput,
          customTitle: customPlaylistName.trim() || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '解析歌单失败，请检查链接或文本');
      }

      const data = await res.json();
      if (data.success && data.result) {
        const r: ParseResult = data.result;
        // Initialize selectedSongId and exclude flags
        r.tracks = r.tracks.map(t => ({
          ...t,
          selectedSongId: t.matchedSong?.id,
          excludeFromImport: t.status === 'missing'
        }));
        setParseResult(r);
        if (!customPlaylistName) {
          setCustomPlaylistName(r.playlistName);
        }
      } else {
        throw new Error('解析返回数据格式不正确');
      }
    } catch (err: any) {
      console.error('[PlaylistImport] Parse error:', err);
      setErrorMsg(err.message || '歌单解析异常，请稍后重试');
    } finally {
      setIsParsing(false);
    }
  };

  // Handle file upload (M3U / CSV)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg(null);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        setTextInput(content);
        if (!customPlaylistName) {
          setCustomPlaylistName(file.name.replace(/\.[^/.]+$/, ''));
        }
        await handleParse(content);
      }
    };
    reader.onerror = () => {
      setErrorMsg('读取文件失败，请检查文件编码');
    };
    reader.readAsText(file);
  };

  // Toggle track exclusion
  const handleToggleExclude = (trackId: string) => {
    if (!parseResult) return;
    setParseResult({
      ...parseResult,
      tracks: parseResult.tracks.map(t => {
        if (t.id === trackId) {
          return { ...t, excludeFromImport: !t.excludeFromImport };
        }
        return t;
      })
    });
  };

  // Change selected matched song for a track
  const handleSelectMatchedSong = (trackId: string, songId: string) => {
    if (!parseResult) return;
    const targetSong = allSongs.find(s => s.id === songId);
    setParseResult({
      ...parseResult,
      tracks: parseResult.tracks.map(t => {
        if (t.id === trackId) {
          return {
            ...t,
            selectedSongId: songId,
            matchedSong: targetSong,
            status: targetSong ? 'matched' : 'missing',
            excludeFromImport: !targetSong
          };
        }
        return t;
      })
    });
  };

  // Export missing tracks as TXT
  const handleExportMissing = async () => {
    if (!parseResult) return;
    const missing = parseResult.tracks.filter(t => t.status === 'missing' || !t.selectedSongId);
    if (missing.length === 0) {
      alert('所有曲目均已精准匹配，无需导出缺失清单！');
      return;
    }

    try {
      const res = await apiFetch('/api/playlists/import/export-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistName: customPlaylistName || parseResult.playlistName,
          tracks: missing.map(t => ({
            title: t.originalTitle,
            artist: t.originalArtist,
            album: t.originalAlbum
          }))
        })
      });

      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${customPlaylistName || '外部导入歌单'}_待补全缺失清单.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Export missing failed:', e);
    }
  };

  // Confirm import and create playlist
  const handleConfirmImport = async (playImmediately: boolean = false) => {
    if (!parseResult) return;

    const validSongIds = parseResult.tracks
      .filter(t => !t.excludeFromImport && t.selectedSongId)
      .map(t => t.selectedSongId as string);

    if (validSongIds.length === 0) {
      setErrorMsg('请至少勾选或匹配一首本地歌曲加入歌单');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/playlists/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (customPlaylistName || parseResult.playlistName).trim(),
          description: parseResult.description || `外部歌单导入 · 共 ${validSongIds.length} 首`,
          coverUrl: parseResult.coverUrl,
          songIds: validSongIds
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '创建歌单失败');
      }

      onImportSuccess(data.playlist, playImmediately);
      onClose();
    } catch (err: any) {
      console.error('Import confirm error:', err);
      setErrorMsg(err.message || '创建导入歌单失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered tracks for display
  const displayedTracks = (parseResult?.tracks || []).filter(t => {
    if (resultFilter === 'matched' && t.status !== 'matched') return false;
    if (resultFilter === 'fuzzy' && t.status !== 'fuzzy') return false;
    if (resultFilter === 'missing' && t.status !== 'missing') return false;

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchTitle = t.originalTitle.toLowerCase().includes(q);
      const matchArtist = t.originalArtist.toLowerCase().includes(q);
      const matchLocal = t.matchedSong?.title.toLowerCase().includes(q);
      return matchTitle || matchArtist || matchLocal;
    }
    return true;
  });

  const selectedCount = (parseResult?.tracks || []).filter(t => !t.excludeFromImport && t.selectedSongId).length;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-5xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-zinc-100'
        }`}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                外部歌单智能导入与匹配
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  支持网易云 / QQ音乐 / 文本
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                粘贴外部歌单链接或文本清单，智能模糊比对并自动建立本地高保真歌单
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span className="flex-1">{errorMsg}</span>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top Input Method Selection (Tabs) */}
          {!parseResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/5 border border-white/5">
                <button
                  type="button"
                  onClick={() => { setActiveTab('url'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    activeTab === 'url' ? 'bg-white/15 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Link2 className="w-4 h-4" />
                  网易云 / QQ 音乐链接
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('text'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    activeTab === 'text' ? 'bg-white/15 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  自由文本多行粘贴
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('file'); setErrorMsg(null); }}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    activeTab === 'file' ? 'bg-white/15 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  M3U / CSV 文件上传
                </button>
              </div>

              {/* Tab 1: URL Input */}
              {activeTab === 'url' && (
                <div className="space-y-3 p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                  <label className="block text-xs font-medium text-zinc-300">
                    输入网易云音乐或 QQ 音乐歌单分享链接 / ID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="例如: https://music.163.com/playlist?id=3778678 或 y.qq.com/n/ryqq/playlist/..."
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] transition"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleParse();
                      }}
                    />
                  </div>
                  {/* Quick example presets */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="text-zinc-500">快速填入测试：</span>
                    <button
                      type="button"
                      onClick={() => {
                        setUrlInput('https://music.163.com/playlist?id=3778678');
                        setCustomPlaylistName('云音乐热歌榜精选');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs transition"
                    >
                      网易云热歌榜
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUrlInput('https://y.qq.com/n/ryqq/playlist/783946281');
                        setCustomPlaylistName('QQ 音乐巅峰榜');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs transition"
                    >
                      QQ 音乐热门精选
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Free Text Input */}
              {activeTab === 'text' && (
                <div className="space-y-3 p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-300">
                      粘贴或输入歌曲清单文本（每行一首，支持格式如：<span className="text-zinc-400">周杰伦 - 晴天</span> 或 <span className="text-zinc-400">1. 江南 - 林俊杰</span>）
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTextInput(`周杰伦 - 晴天\n林俊杰 - 江南\n李克勤 - 月半小夜曲\n陈奕迅 - 十年\n王菲 - 红豆\n张学友 - 吻别`);
                        setCustomPlaylistName('华语经典试听精选');
                      }}
                      className="text-xs text-[#FF6700] hover:underline"
                    >
                      填入示例清单
                    </button>
                  </div>
                  <textarea
                    rows={6}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="周杰伦 - 晴天&#10;林俊杰 - 江南&#10;李克勤 - 月半小夜曲&#10;陈奕迅 - 十年..."
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl p-3 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] transition"
                  />
                </div>
              )}

              {/* Tab 3: M3U / CSV File Upload */}
              {activeTab === 'file' && (
                <div className="p-8 rounded-2xl bg-white/[0.02] border border-dashed border-white/10 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-400">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">选择或拖拽歌单文件</h4>
                    <p className="text-xs text-zinc-500 mt-1">支持 .m3u, .m3u8, .csv 格式的标准歌单文件</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".m3u,.m3u8,.csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition"
                  >
                    {fileName ? `已选: ${fileName} (点击更换)` : '浏览本地文件'}
                  </button>
                </div>
              )}

              {/* Custom Playlist Name Input */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-zinc-400 whitespace-nowrap">自定义歌单名称：</span>
                <input
                  type="text"
                  value={customPlaylistName}
                  onChange={(e) => setCustomPlaylistName(e.target.value)}
                  placeholder="如未填写将默认使用外部歌单原始名称"
                  className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              {/* Parse Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => handleParse()}
                  disabled={isParsing}
                  className="px-6 py-3 rounded-xl font-bold text-xs text-white shadow-lg flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: themeConfig.primaryColor }}
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      正在智能解析与曲库比对中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      开始解析并比对曲库
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Parse Result Report & Comparison Panel */}
          {parseResult && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Header Summary Banner */}
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={parseResult.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80'}
                    alt="Playlist Cover"
                    className="w-16 h-16 rounded-xl object-cover shadow-md border border-white/10 flex-shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customPlaylistName}
                        onChange={(e) => setCustomPlaylistName(e.target.value)}
                        className="bg-transparent text-base font-bold text-white border-b border-transparent hover:border-white/20 focus:border-[#FF6700] focus:outline-none px-1 -ml-1 transition"
                      />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1 line-clamp-1">
                      {parseResult.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-zinc-300">
                      <span>解析总数: <strong>{parseResult.totalTracks}</strong> 首</span>
                      <span>·</span>
                      <span className="text-emerald-400">精准匹配: <strong>{parseResult.matchedCount}</strong></span>
                      <span>·</span>
                      <span className="text-amber-400">模糊推荐: <strong>{parseResult.fuzzyCount}</strong></span>
                      <span>·</span>
                      <span className="text-rose-400">曲库缺失: <strong>{parseResult.missingCount}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setParseResult(null); setErrorMsg(null); }}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    重新解析
                  </button>
                  {parseResult.missingCount > 0 && (
                    <button
                      type="button"
                      onClick={handleExportMissing}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      导出待补全清单
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs & Search in Comparison */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 text-xs">
                  <button
                    onClick={() => setResultFilter('all')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      resultFilter === 'all' ? 'bg-white/20 text-white' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    全部 ({parseResult.tracks.length})
                  </button>
                  <button
                    onClick={() => setResultFilter('matched')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      resultFilter === 'matched' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    已匹配 ({parseResult.matchedCount})
                  </button>
                  <button
                    onClick={() => setResultFilter('fuzzy')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      resultFilter === 'fuzzy' ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    模糊推荐 ({parseResult.fuzzyCount})
                  </button>
                  <button
                    onClick={() => setResultFilter('missing')}
                    className={`px-3 py-1 rounded-lg font-medium transition ${
                      resultFilter === 'missing' ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    曲库缺失 ({parseResult.missingCount})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="搜索匹配结果..."
                    className="bg-zinc-900 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] w-full sm:w-56"
                  />
                </div>
              </div>

              {/* Comparison Track List */}
              <div className="border border-white/5 rounded-2xl overflow-hidden bg-zinc-900/30">
                <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 text-[11px] font-semibold text-zinc-400 grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-1 text-center">选择</div>
                  <div className="col-span-5">外部歌单原曲目</div>
                  <div className="col-span-6">听澜本地匹配曲目 & 音质</div>
                </div>

                <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
                  {displayedTracks.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-500">
                      没有符合筛选条件的曲目
                    </div>
                  ) : (
                    displayedTracks.map((t, idx) => (
                      <div
                        key={t.id}
                        className={`px-4 py-2.5 grid grid-cols-12 gap-3 items-center text-xs transition ${
                          t.excludeFromImport ? 'opacity-40 bg-black/20' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className="col-span-1 flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={!t.excludeFromImport && Boolean(t.selectedSongId)}
                            disabled={t.status === 'missing' && !t.selectedSongId}
                            onChange={() => handleToggleExclude(t.id)}
                            className="w-4 h-4 rounded text-[#FF6700] focus:ring-0 bg-zinc-800 border-zinc-700 cursor-pointer"
                          />
                        </div>

                        {/* Source Track Info */}
                        <div className="col-span-5 min-w-0 pr-2">
                          <div className="font-semibold text-zinc-200 truncate" title={t.originalTitle}>
                            <span className="text-zinc-500 font-normal mr-1.5">{idx + 1}.</span>
                            {t.originalTitle}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5" title={t.originalArtist}>
                            {t.originalArtist}
                            {t.originalAlbum && <span className="text-zinc-500"> · 《{t.originalAlbum}》</span>}
                          </div>
                        </div>

                        {/* Matched Local Track & Controls */}
                        <div className="col-span-6 flex items-center justify-between gap-2 min-w-0">
                          {t.matchedSong ? (
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${
                                t.status === 'matched' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {t.matchScore}%
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-zinc-200 truncate" title={t.matchedSong.title}>
                                  {t.matchedSong.title}
                                </p>
                                <p className="text-[10px] text-zinc-400 truncate flex items-center gap-1.5">
                                  <span>{t.matchedSong.artist}</span>
                                  <span className="text-[#FF6700] font-mono">{t.matchedSong.bitrate || '高保真'}</span>
                                </p>
                              </div>
                              {onPlaySong && (
                                <button
                                  type="button"
                                  onClick={() => t.matchedSong && onPlaySong(t.matchedSong)}
                                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition flex-shrink-0"
                                  title="试听本地曲目"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-rose-400 text-xs">
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-[10px]">未在本地找到</span>
                              <span className="text-zinc-500 text-[11px]">暂无匹配</span>
                            </div>
                          )}

                          {/* Candidate Selection Dropdown if fuzzy */}
                          {t.candidateSongs && t.candidateSongs.length > 1 && (
                            <select
                              value={t.selectedSongId || ''}
                              onChange={(e) => handleSelectMatchedSong(t.id, e.target.value)}
                              className="bg-zinc-800 border border-white/10 text-[11px] rounded-lg px-2 py-1 text-zinc-300 focus:outline-none focus:border-[#FF6700] max-w-[120px] truncate"
                            >
                              {t.candidateSongs.map(c => (
                                <option key={c.song.id} value={c.song.id}>
                                  {c.score}%: {c.song.title} - {c.song.artist}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 border-t border-white/5 bg-zinc-900/40 flex items-center justify-between flex-shrink-0">
          <div className="text-xs text-zinc-400">
            {parseResult && (
              <span>
                已选定 <strong>{selectedCount}</strong> / {parseResult.totalTracks} 首曲目准备导入
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition"
            >
              取消
            </button>

            {parseResult && (
              <>
                <button
                  type="button"
                  onClick={() => handleConfirmImport(false)}
                  disabled={isSubmitting || selectedCount === 0}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition disabled:opacity-50 cursor-pointer"
                >
                  仅创建歌单
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmImport(true)}
                  disabled={isSubmitting || selectedCount === 0}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: themeConfig.primaryColor }}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      创建中...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      一键导入并立即播放
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
