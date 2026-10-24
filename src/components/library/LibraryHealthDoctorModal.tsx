import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Image,
  FileText,
  Trash2,
  Layers,
  Zap,
  Disc,
  ShieldCheck,
  ChevronRight,
  Music,
  Check,
  Edit3,
  Wrench,
  ArrowRight,
  FileCode,
  Play,
  Pause,
  Heart,
  ListMusic,
  Languages,
  FolderEdit
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';
import { Song } from '../../types';
import { TagScraperEditorModal } from './TagScraperEditorModal';

export interface LibraryHealthDoctorModalProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  onRefreshLibrary: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const LibraryHealthDoctorModal: React.FC<LibraryHealthDoctorModalProps> = ({
  isOpen,
  onClose,
  songs,
  onRefreshLibrary,
  onShowToast
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme === 'light';

  const [activeTab, setActiveTab] = useState<'audit' | 'scraper' | 'duplicates' | 'watcher'>('audit');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [duplicates, setDuplicates] = useState<any[]>([]);

  // Watcher Tab State
  const [watcherStatus, setWatcherStatus] = useState<any>(null);
  const [isTogglingWatcher, setIsTogglingWatcher] = useState(false);

  // Scraper Tab State
  const [scraperFilter, setScraperFilter] = useState<
    'all' | 'missing_cover' | 'missing_lyrics' | 'dirty_tag' | 'unparsed'
  >('all');
  const [scrapingSongId, setScrapingSongId] = useState<string | null>(null);
  const [isBatchScraping, setIsBatchScraping] = useState(false);
  const [minConfidence, setMinConfidence] = useState<number>(60);
  const [forceOverwriteBatch, setForceOverwriteBatch] = useState<boolean>(false);

  // Batch 1: Single-Song Interactive Tag Editor & Online Candidate Diff Modal
  const [editingSong, setEditingSong] = useState<Song | null>(null);

  // Batch 2: Music-Tag Batch Tools Drawer State
  const [activeBatchTool, setActiveBatchTool] = useState<
    'none' | 'filename_to_tag' | 'tag_to_filename' | 'fix_encoding'
  >('none');
  const [toolPattern, setToolPattern] = useState<string>('%artist% - %title%');
  const [overwriteExistingTags, setOverwriteExistingTags] = useState<boolean>(false);
  const [toolPreviewLoading, setToolPreviewLoading] = useState<boolean>(false);
  const [toolApplying, setToolApplying] = useState<boolean>(false);
  const [toolPreviewItems, setToolPreviewItems] = useState<any[]>([]);
  const [exportingSidecar, setExportingSidecar] = useState<boolean>(false);

  // Batch 3: Duplicates Tab State & In-Modal Audio Preview Player
  const [selectedIdsToDelete, setSelectedIdsToDelete] = useState<string[]>([]);
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);
  const [previewPlayingSongId, setPreviewPlayingSongId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }
    setPreviewPlayingSongId(null);
  };

  const togglePreviewSong = (song: Song) => {
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.onended = () => setPreviewPlayingSongId(null);
      previewAudioRef.current.onerror = () => {
        setPreviewPlayingSongId(null);
        onShowToast('试听失败', '无法加载该曲目的音频流', 'error');
      };
    }

    if (previewPlayingSongId === song.id) {
      previewAudioRef.current.pause();
      setPreviewPlayingSongId(null);
      return;
    }

    const src =
      song.audioUrl ||
      (song.localFilename ? `/music/${encodeURIComponent(song.localFilename)}` : `/api/music/stream/${encodeURIComponent(song.id)}`);
    previewAudioRef.current.src = src;
    previewAudioRef.current.play().catch(() => {
      onShowToast('试听失败', '浏览器阻止播放或音频文件不可达', 'error');
      setPreviewPlayingSongId(null);
    });
    setPreviewPlayingSongId(song.id);
  };

  useEffect(() => {
    if (!isOpen) {
      stopPreviewAudio();
      setEditingSong(null);
    }
  }, [isOpen]);

  const fetchHealthData = async () => {
    try {
      setLoading(true);
      const [healthRes, dupesRes, watcherRes] = await Promise.all([
        apiFetch('/api/library/health'),
        apiFetch('/api/library/duplicates'),
        apiFetch('/api/library/watcher/status')
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        if (healthData.success) {
          setReport(healthData.report);
        }
      }

      if (watcherRes.ok) {
        const watcherData = await watcherRes.json();
        if (watcherData.success) {
          setWatcherStatus(watcherData.status);
        }
      }

      if (dupesRes.ok) {
        const dupesData = await dupesRes.json();
        if (dupesData.success) {
          setDuplicates(dupesData.duplicates || []);
          const defaultSelects: string[] = [];
          (dupesData.duplicates || []).forEach((group: any) => {
            group.versions.forEach((v: any) => {
              if (v.recommendation === 'redundant') {
                defaultSelects.push(v.song.id);
              }
            });
          });
          setSelectedIdsToDelete(defaultSelects);
        }
      }
    } catch (e: any) {
      console.error('Failed to load library health:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHealthData();
    }
  }, [isOpen]);

  const handleToggleWatcher = async () => {
    if (!watcherStatus) return;
    setIsTogglingWatcher(true);
    try {
      const res = await apiFetch('/api/library/watcher/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !watcherStatus.enabled })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWatcherStatus(data.status);
        onShowToast(
          data.enabled ? '已开启实时监控' : '已暂停监控',
          data.enabled ? '正在实时监听曲库目录，丢入新歌秒级入库' : '自动监控已暂停',
          'success'
        );
      }
    } catch (err: any) {
      onShowToast('操作失败', err.message, 'error');
    } finally {
      setIsTogglingWatcher(false);
    }
  };

  const handleUpdateWatcherConfig = async (newConfig: { autoScrapeOnWatch?: boolean; debounceMs?: number }) => {
    try {
      const res = await apiFetch('/api/library/watcher/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWatcherStatus(data.status);
        onShowToast('配置已保存', '曲库自动增量监控配置已更新', 'success');
      }
    } catch (err: any) {
      onShowToast('更新配置失败', err.message, 'error');
    }
  };

  // Single Song Online Auto-Scraper
  const handleScrapeSingle = async (songId: string, forceOverwrite = false) => {
    setScrapingSongId(songId);
    try {
      const res = await apiFetch('/api/library/scrape/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songId,
          forceOverwrite,
          minConfidence,
          writeSidecarLrc: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('刮削补全成功', data.message || '已补齐歌曲封面与歌词', 'success');
        fetchHealthData();
        onRefreshLibrary();
      } else {
        onShowToast('刮削失败', data.error || '未能完成元数据刮削', 'error');
      }
    } catch (e: any) {
      onShowToast('请求失败', e.message, 'error');
    } finally {
      setScrapingSongId(null);
    }
  };

  // Batch Scraper with Confidence Control
  const handleBatchScrape = async (forceAll = forceOverwriteBatch) => {
    setIsBatchScraping(true);
    try {
      const res = await apiFetch('/api/library/scrape/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixMissingCovers: true,
          fixMissingLyrics: true,
          cleanAdTags: true,
          forceAll,
          minConfidence,
          writeSidecarLrc: true
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('全库刮削完成', data.message || '已全面补齐封面与歌词', 'success');
        fetchHealthData();
        onRefreshLibrary();
      } else {
        onShowToast('批量刮削失败', data.error || '批量操作中断', 'error');
      }
    } catch (e: any) {
      onShowToast('请求异常', e.message, 'error');
    } finally {
      setIsBatchScraping(false);
    }
  };

  // Batch 2: Preview or Execute Batch Tool
  const runBatchTool = async (
    tool: 'filename_to_tag' | 'tag_to_filename' | 'fix_encoding',
    dryRun: boolean,
    customPattern = toolPattern
  ) => {
    if (dryRun) setToolPreviewLoading(true);
    else setToolApplying(true);

    try {
      const endpoint =
        tool === 'filename_to_tag'
          ? '/api/library/tools/filename-to-tag'
          : tool === 'tag_to_filename'
          ? '/api/library/tools/tag-to-filename'
          : '/api/library/tools/fix-encoding';

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern: customPattern,
          dryRun,
          overwriteExisting: overwriteExistingTags
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToolPreviewItems(data.items || []);
        if (!dryRun) {
          onShowToast('批量整理完成', data.message || '已应用标签变更', 'success');
          fetchHealthData();
          onRefreshLibrary();
          setActiveBatchTool('none');
        }
      } else {
        onShowToast('操作失败', data.error || '执行批量工具失败', 'error');
      }
    } catch (err: any) {
      onShowToast('请求失败', err.message, 'error');
    } finally {
      setToolPreviewLoading(false);
      setToolApplying(false);
    }
  };

  const handleExportAllSidecarLrc = async () => {
    setExportingSidecar(true);
    try {
      const res = await apiFetch('/api/library/tools/write-sidecar-lrc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('物理 .lrc 导出成功', data.message, 'success');
        fetchHealthData();
      }
    } catch (err: any) {
      onShowToast('导出失败', err.message, 'error');
    } finally {
      setExportingSidecar(false);
    }
  };

  // Delete Selected Duplicates
  const handleDeleteDuplicates = async () => {
    if (selectedIdsToDelete.length === 0) return;
    stopPreviewAudio();
    setIsDeletingDuplicates(true);
    try {
      const res = await apiFetch('/api/library/duplicates/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIdsToRemove: selectedIdsToDelete })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('安全去重完成', data.message || `已清理 ${selectedIdsToDelete.length} 首冗余曲目`, 'success');
        setSelectedIdsToDelete([]);
        fetchHealthData();
        onRefreshLibrary();
      } else {
        onShowToast('去重失败', data.error || '清理操作失败', 'error');
      }
    } catch (e: any) {
      onShowToast('请求失败', e.message, 'error');
    } finally {
      setIsDeletingDuplicates(false);
    }
  };

  if (!isOpen) return null;

  // Filter songs for Scraper tab
  const filteredScraperSongs = songs.filter((song) => {
    const hasCover = song.coverUrl && !song.coverUrl.includes('placeholder') && song.coverUrl.trim().length > 10;
    const hasLyrics = song.lyrics && song.lyrics.trim().length > 20;
    const hasAd =
      /\[(?:无损|FLAC|320K)[^\]]*\]|www\.[a-z0-9-]+\.com/i.test(song.title) ||
      /[\u00C0-\u00FF]{2,}/.test(song.title || '') ||
      /[\u00C0-\u00FF]{2,}/.test(song.artist || '');
    const isUnparsed =
      (!song.artist || song.artist === '未知艺术家' || song.artist === 'Unknown') &&
      ((song.localFilename && song.localFilename.includes(' - ')) || (song.title && song.title.includes(' - ')));

    if (scraperFilter === 'missing_cover') return !hasCover;
    if (scraperFilter === 'missing_lyrics') return !hasLyrics;
    if (scraperFilter === 'dirty_tag') return hasAd;
    if (scraperFilter === 'unparsed') return Boolean(isUnparsed);
    return true;
  });

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 md:p-8 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-5xl max-h-[86vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition-all ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-white'
        }`}
      >
        {/* Header */}
        <div
          className={`p-5 sm:p-6 border-b flex items-center justify-between shrink-0 ${
            isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-900/60 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold">曲库智能治理与 Music-Tag 元数据刮削工坊</h3>
                {report && (
                  <span
                    className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold font-mono border ${
                      report.score >= 85
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : report.score >= 70
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {report.score}分 · {report.grade}级健康
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                多源在线刮削 (iTunes/LRCLIB/网易云)、单曲候选比对与手动精修、文件名⇄标签互转、同名版本保护与试听去重
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealthData}
              disabled={loading}
              title="重新体检"
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => {
                stopPreviewAudio();
                onClose();
              }}
              className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          className={`px-6 pt-3 flex items-center gap-2 border-b shrink-0 overflow-x-auto ${
            isLight ? 'bg-zinc-50/40 border-zinc-200' : 'bg-zinc-900/30 border-white/5'
          }`}
        >
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'audit'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight
                ? 'text-zinc-500 hover:text-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>全库健康体检诊断</span>
            {activeTab === 'audit' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('scraper')}
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'scraper'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight
                ? 'text-zinc-500 hover:text-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>元数据刮削与标签工坊</span>
            {report && (report.coverMissingCount > 0 || report.lyricsMissingCount > 0) && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-600 dark:text-purple-300 font-mono">
                {report.coverMissingCount + report.lyricsMissingCount}
              </span>
            )}
            {activeTab === 'scraper' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('duplicates')}
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'duplicates'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight
                ? 'text-zinc-500 hover:text-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>重复曲目试听与无损去重</span>
            {duplicates.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 font-mono font-bold">
                {duplicates.length}组
              </span>
            )}
            {activeTab === 'duplicates' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('watcher')}
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'watcher'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight
                ? 'text-zinc-500 hover:text-zinc-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${watcherStatus?.enabled ? 'text-emerald-500 animate-pulse' : ''}`} />
            <span>实时监控与自动增量</span>
            {watcherStatus?.enabled && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">
                已开启
              </span>
            )}
            {activeTab === 'watcher' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400 rounded-full" />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* TAB 1: AUDIT */}
          {activeTab === 'audit' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Overall Score & Fast Fix Hero Banner */}
              <div
                className={`p-5 rounded-3xl border relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-5 ${
                  isLight
                    ? 'bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border-purple-200/80 shadow-sm'
                    : 'bg-gradient-to-r from-purple-950/30 via-indigo-950/20 to-zinc-900 border-purple-500/20'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-18 h-18 rounded-2xl flex flex-col items-center justify-center border font-mono font-bold shrink-0 px-4 py-3 ${
                      (report?.score || 0) >= 85
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                        : (report?.score || 0) >= 70
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    <span className="text-2xl leading-none">{report?.score || 100}</span>
                    <span className="text-[10px] font-sans opacity-80 mt-1">健康指数</span>
                  </div>

                  <div>
                    <h4 className="text-base font-bold flex items-center gap-2 flex-wrap">
                      <span>曲库健康状态评级: {report?.grade || 'S'} 级</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 font-semibold">
                        共 {report?.totalSongs || 0} 首曲目
                      </span>
                      {report?.sidecarLrcCount > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono">
                          已落盘 {report.sidecarLrcCount} 份 .lrc
                        </span>
                      )}
                    </h4>
                    <p className={`text-xs mt-1 max-w-lg ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
                      {(report?.score || 0) >= 90
                        ? '✨ 您的音乐资产极为纯净！已具备极高的无损率、完整的专辑封面与同步歌词。'
                        : '💡 支持从 iTunes / LRCLIB / 网易云多源刮削真实高清封面与逐行时间轴歌词，并同步落盘 .lrc 文件。'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleBatchScrape(false)}
                    disabled={isBatchScraping}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-purple-600/25 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${isBatchScraping ? 'animate-spin' : ''}`} />
                    <span>{isBatchScraping ? '全库联网刮削中...' : '一键全库智能刮削与补齐'}</span>
                  </button>
                </div>
              </div>

              {/* 4 Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <Image className="w-3.5 h-3.5 text-purple-500" />
                      <span>封面覆盖率</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.coverPercent || 100}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.coverCount || 0}{' '}
                    <span className="text-xs font-normal opacity-60">/ {report?.totalSongs || 0}</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="bg-purple-500 h-full rounded-full"
                      style={{ width: `${report?.coverPercent || 100}%` }}
                    />
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span>时间轴 LRC 歌词</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.lyricsPercent || 100}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.syncedLyricsCount ?? report?.lyricsCount ?? 0}{' '}
                    <span className="text-xs font-normal opacity-60">/ {report?.totalSongs || 0}</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="bg-blue-500 h-full rounded-full"
                      style={{ width: `${report?.lyricsPercent || 100}%` }}
                    />
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <Disc className="w-3.5 h-3.5 text-amber-500" />
                      <span>无损母带占比</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.losslessPercent || 0}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.losslessCount || 0} <span className="text-xs font-normal opacity-60">首无损</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{ width: `${report?.losslessPercent || 0}%` }}
                    />
                  </div>
                </div>

                <div
                  className={`p-4 rounded-2xl border ${
                    isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      <span>同版本重复组</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.duplicateGroupCount || 0} 组</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.duplicateSongsTotal || 0} <span className="text-xs font-normal opacity-60">首可精简</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div
                      className="bg-emerald-500 h-full rounded-full"
                      style={{ width: `${report?.duplicateGroupCount ? 40 : 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Actionable Health Issues */}
              <div className="space-y-3">
                <h5
                  className={`text-xs font-bold uppercase tracking-wider ${
                    isLight ? 'text-zinc-600' : 'text-zinc-400'
                  }`}
                >
                  诊断发现与治理建议 ({report?.issues?.length || 0})
                </h5>

                {!report?.issues || report.issues.length === 0 ? (
                  <div
                    className={`p-6 rounded-2xl border text-center space-y-2 ${
                      isLight
                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                        : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                    <div className="text-sm font-bold">曲库状态极佳，未发现明显缺陷！</div>
                    <p className="text-xs opacity-80">所有曲目均具备标准元数据、高保真封面与同步歌词。</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {report.issues.map((issue: any) => (
                      <div
                        key={issue.id}
                        className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition ${
                          isLight
                            ? 'bg-white border-zinc-200 hover:border-purple-300'
                            : 'bg-zinc-900/70 border-white/5 hover:border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                              issue.severity === 'high'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            <AlertCircle className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">{issue.title}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
                                影响 {issue.affectedCount} 首
                              </span>
                            </div>
                            <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              {issue.description}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (issue.actionKey === 'deduplicate') {
                              setActiveTab('duplicates');
                            } else if (issue.actionKey === 'fix_encoding') {
                              setActiveTab('scraper');
                              setActiveBatchTool('fix_encoding');
                              runBatchTool('fix_encoding', true);
                            } else if (issue.actionKey === 'filename_to_tag') {
                              setActiveTab('scraper');
                              setActiveBatchTool('filename_to_tag');
                              runBatchTool('filename_to_tag', true, '%artist% - %title%');
                            } else {
                              setActiveTab('scraper');
                              if (issue.type === 'missing_cover') setScraperFilter('missing_cover');
                              else if (issue.type === 'missing_lyrics') setScraperFilter('missing_lyrics');
                              else if (issue.type === 'dirty_tag') setScraperFilter('dirty_tag');
                            }
                          }}
                          className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition flex items-center gap-1 cursor-pointer ${
                            isLight
                              ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                              : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border-purple-500/30'
                          }`}
                        >
                          <span>前往治理</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: METADATA SCRAPER & MUSIC-TAG BATCH WORKBENCH */}
          {activeTab === 'scraper' && (
            <div className="space-y-4 animate-fadeIn">
              {/* Batch 2: Music-Tag-Web Batch Tools Bar */}
              <div
                className={`p-3.5 rounded-2xl border space-y-3 ${
                  isLight ? 'bg-zinc-50/90 border-zinc-200' : 'bg-zinc-900/60 border-white/10'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-bold">Music-Tag 批量标签效率工具箱</span>
                    <span className="text-[10px] text-zinc-400 hidden sm:inline">
                      支持正则模板解析文件名、规范重命名物理文件、修复 GBK 乱码与导出 .lrc
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => {
                        if (activeBatchTool === 'filename_to_tag') {
                          setActiveBatchTool('none');
                        } else {
                          setActiveBatchTool('filename_to_tag');
                          setToolPattern('%artist% - %title%');
                          runBatchTool('filename_to_tag', true, '%artist% - %title%');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                        activeBatchTool === 'filename_to_tag'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : isLight
                          ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-200'
                      }`}
                    >
                      <FolderEdit className="w-3.5 h-3.5" />
                      <span>文件名 ➔ 标签</span>
                    </button>

                    <button
                      onClick={() => {
                        if (activeBatchTool === 'tag_to_filename') {
                          setActiveBatchTool('none');
                        } else {
                          setActiveBatchTool('tag_to_filename');
                          setToolPattern('%artist% - %title%');
                          runBatchTool('tag_to_filename', true, '%artist% - %title%');
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                        activeBatchTool === 'tag_to_filename'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : isLight
                          ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>标签 ➔ 文件名</span>
                    </button>

                    <button
                      onClick={() => {
                        if (activeBatchTool === 'fix_encoding') {
                          setActiveBatchTool('none');
                        } else {
                          setActiveBatchTool('fix_encoding');
                          runBatchTool('fix_encoding', true);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                        activeBatchTool === 'fix_encoding'
                          ? 'bg-purple-600 text-white border-purple-600'
                          : isLight
                          ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-200'
                      }`}
                    >
                      <Languages className="w-3.5 h-3.5" />
                      <span>GBK 乱码修复</span>
                    </button>

                    <button
                      onClick={handleExportAllSidecarLrc}
                      disabled={exportingSidecar}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
                        isLight
                          ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                          : 'bg-emerald-950/30 hover:bg-emerald-900/50 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>{exportingSidecar ? '导出中...' : '导出物理 .lrc'}</span>
                    </button>
                  </div>
                </div>

                {/* Expandable Batch Tool Preview Drawer */}
                {activeBatchTool !== 'none' && (
                  <div
                    className={`p-4 rounded-xl border space-y-3 animate-fadeIn ${
                      isLight ? 'bg-white border-zinc-200' : 'bg-zinc-950 border-white/10'
                    }`}
                  >
                    {activeBatchTool !== 'fix_encoding' && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold">匹配格式模板:</span>
                          {[
                            '%artist% - %title%',
                            '%track%. %artist% - %title%',
                            '%artist% - %album% - %title%',
                            '%title% - %artist%'
                          ].map((p) => (
                            <button
                              key={p}
                              onClick={() => {
                                setToolPattern(p);
                                runBatchTool(activeBatchTool, true, p);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                                toolPattern === p
                                  ? 'bg-indigo-600 text-white font-bold'
                                  : isLight
                                  ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                                  : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>

                        {activeBatchTool === 'filename_to_tag' && (
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={overwriteExistingTags}
                              onChange={(e) => {
                                setOverwriteExistingTags(e.target.checked);
                                setTimeout(() => runBatchTool('filename_to_tag', true, toolPattern), 50);
                              }}
                              className="rounded accent-purple-600"
                            />
                            <span>覆盖已有非空歌手/标题</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Preview Table */}
                    <div className="max-h-44 overflow-y-auto border rounded-xl divide-y border-zinc-200 dark:border-white/10 divide-zinc-100 dark:divide-white/5 text-xs">
                      {toolPreviewLoading ? (
                        <div className="p-6 text-center text-zinc-400">正在生成变更预览...</div>
                      ) : toolPreviewItems.length === 0 ? (
                        <div className="p-6 text-center text-zinc-500">
                          当前曲库在此规则下无需变更（所有曲目已符合规范）
                        </div>
                      ) : (
                        toolPreviewItems.map((item: any, idx: number) => (
                          <div key={idx} className="px-3 py-2 flex items-center justify-between gap-3 font-mono text-[11px]">
                            {activeBatchTool === 'filename_to_tag' && (
                              <>
                                <span className="truncate text-zinc-400 max-w-[40%]">{item.localFilename}</span>
                                <span className="truncate font-sans">
                                  歌手: <strong>{item.newArtist}</strong> · 标题: <strong>{item.newTitle}</strong>
                                  {item.newAlbum ? ` · 专辑: 《${item.newAlbum}》` : ''}
                                </span>
                              </>
                            )}
                            {activeBatchTool === 'tag_to_filename' && (
                              <>
                                <span className="truncate text-zinc-400 max-w-[45%]">{item.oldFilename}</span>
                                <span className="truncate text-emerald-500 font-semibold">➔ {item.newFilename}</span>
                              </>
                            )}
                            {activeBatchTool === 'fix_encoding' && (
                              <>
                                <span className="truncate text-rose-400 max-w-[45%]">{item.oldValue}</span>
                                <span className="truncate text-emerald-500 font-sans font-bold">➔ {item.newValue}</span>
                              </>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-zinc-500">
                        共匹配到 <strong>{toolPreviewItems.length}</strong> 项待变更记录
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActiveBatchTool('none')}
                          className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          收起
                        </button>
                        <button
                          onClick={() => runBatchTool(activeBatchTool, false, toolPattern)}
                          disabled={toolPreviewItems.length === 0 || toolApplying}
                          className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                        >
                          {toolApplying ? '正在写入...' : `确认应用 (${toolPreviewItems.length} 项)`}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Pills & Batch Scrape Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { key: 'all', label: `全部歌曲 (${songs.length})` },
                    { key: 'missing_cover', label: `缺封面 (${report?.coverMissingCount || 0})` },
                    { key: 'missing_lyrics', label: `缺歌词 (${report?.lyricsMissingCount || 0})` },
                    { key: 'dirty_tag', label: `广告/乱码 (${(report?.dirtyTagCount || 0) + (report?.garbledCount || 0)})` },
                    { key: 'unparsed', label: `待提取文件名 (${report?.unparsedFilenameCount || 0})` }
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setScraperFilter(f.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        scraperFilter === f.key
                          ? 'bg-purple-600 text-white shadow-sm'
                          : isLight
                          ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                          : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Confidence Threshold + Overwrite Mode + Batch Scrape Button */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="opacity-70">最低匹配置信度:</span>
                    <select
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(Number(e.target.value))}
                      className={`px-2 py-1 rounded-lg border text-xs font-mono cursor-pointer ${
                        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/10'
                      }`}
                    >
                      <option value={50}>50% (宽松补全)</option>
                      <option value={65}>65% (标准推荐)</option>
                      <option value={80}>80% (严格精准)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-1 text-[11px] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceOverwriteBatch}
                      onChange={(e) => setForceOverwriteBatch(e.target.checked)}
                      className="rounded accent-purple-600"
                    />
                    <span>强制刷新已有封面/歌词</span>
                  </label>

                  <button
                    onClick={() => handleBatchScrape(forceOverwriteBatch)}
                    disabled={isBatchScraping}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20 disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${isBatchScraping ? 'animate-spin' : ''}`} />
                    <span>{isBatchScraping ? '正在联网刮削...' : '批量智能刮削'}</span>
                  </button>
                </div>
              </div>

              {/* Song List */}
              <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                {filteredScraperSongs.length === 0 ? (
                  <div
                    className={`p-8 text-center rounded-2xl border ${
                      isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-900 border-white/5 text-zinc-400'
                    }`}
                  >
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <div className="text-sm font-bold">该筛选条件下无缺失曲目！</div>
                  </div>
                ) : (
                  filteredScraperSongs.map((song) => {
                    const hasCover =
                      song.coverUrl && !song.coverUrl.includes('placeholder') && song.coverUrl.trim().length > 10;
                    const hasLyrics = song.lyrics && song.lyrics.trim().length > 20;
                    const isSyncedLrc = hasLyrics && /\[\d{2}:\d{2}/.test(song.lyrics || '');

                    return (
                      <div
                        key={song.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                          isLight ? 'bg-white border-zinc-200 hover:border-purple-200' : 'bg-zinc-900/60 border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={
                              song.coverUrl ||
                              'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=120&q=80'
                            }
                            alt={song.title}
                            className="w-11 h-11 rounded-xl object-cover shrink-0 border border-black/10"
                          />
                          <div className="truncate min-w-0">
                            <div className="text-xs font-bold truncate flex items-center gap-2">
                              <span className="truncate">{song.title}</span>
                              {song.album && song.album !== '未知专辑' && (
                                <span className="text-[10px] font-normal opacity-60 truncate hidden sm:inline">
                                  《{song.album}》
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[11px] truncate flex items-center gap-2 mt-0.5 ${
                                isLight ? 'text-zinc-500' : 'text-zinc-400'
                              }`}
                            >
                              <span>{song.artist || '未知艺术家'}</span>
                              <span>·</span>
                              <span className="font-mono">{song.bitrate || song.format || '标准音质'}</span>
                              {song.localFilename && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-[10px] opacity-70 truncate">
                                    {song.localFilename}
                                  </span>
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {hasCover ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> 封面就绪
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium">
                                  缺封面
                                </span>
                              )}

                              {isSyncedLrc ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> 时间轴LRC
                                </span>
                              ) : hasLyrics ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                                  纯文本歌词
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium">
                                  缺歌词
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => setEditingSong(song)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                              isLight
                                ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                                : 'bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border-indigo-500/30'
                            }`}
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>在线搜刮对比 / 精修</span>
                          </button>

                          <button
                            onClick={() => handleScrapeSingle(song.id, true)}
                            disabled={scrapingSongId === song.id}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                              isLight
                                ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            <Sparkles className={`w-3 h-3 ${scrapingSongId === song.id ? 'animate-spin' : ''}`} />
                            <span>{scrapingSongId === song.id ? '刮削中...' : '一键快刮'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DUPLICATES WITH VERSION PROTECTION, PLAYLIST MIGRATION & IN-MODAL AUDIO PREVIEW */}
          {activeTab === 'duplicates' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100 dark:border-white/5">
                <div>
                  <h4 className="text-xs font-bold flex items-center gap-2 flex-wrap">
                    <span>检测到 {duplicates.length} 组同名同版本重复曲目</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                      已隔离保护 Live / 伴奏 / Remix 版本
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 font-mono font-bold">
                      清理时自动无损迁移歌单与收藏
                    </span>
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    点击任意版本右侧的播放按钮可直接试听对比音质；清理冗余副本时，其所在的歌单引用与红心收藏将自动转移至保留的高音质版本。
                  </p>
                </div>

                <button
                  onClick={handleDeleteDuplicates}
                  disabled={selectedIdsToDelete.length === 0 || isDeletingDuplicates}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-600/20 disabled:opacity-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isDeletingDuplicates
                      ? '正在安全去重并迁移引用...'
                      : `清理选中的 ${selectedIdsToDelete.length} 首冗余副本`}
                  </span>
                </button>
              </div>

              {duplicates.length === 0 ? (
                <div
                  className={`p-8 text-center rounded-2xl border ${
                    isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-900 border-white/5 text-zinc-400'
                  }`}
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <div className="text-sm font-bold">太棒了！曲库中无同名同版本冗余曲目。</div>
                  <p className="text-xs opacity-70 mt-1">
                    不同演绎版本（如 Live 现场版、伴奏版）已被智能识别并独立保护。
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1">
                  {duplicates.map((group, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border space-y-3 ${
                        isLight ? 'bg-zinc-50/70 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs font-bold flex items-center gap-2">
                          <Music className="w-3.5 h-3.5 text-purple-500" />
                          <span>{group.songTitle}</span>
                          <span className="font-normal opacity-60">· {group.artist}</span>
                          {group.versionTag && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-500 font-mono">
                              {group.versionTag}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">共 {group.versions.length} 个副本</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {group.versions.map((ver: any) => {
                          const isSelected = selectedIdsToDelete.includes(ver.song.id);
                          const isKeep = ver.recommendation === 'keep';
                          const isPlayingPreview = previewPlayingSongId === ver.song.id;

                          return (
                            <div
                              key={ver.song.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 transition ${
                                isKeep
                                  ? isLight
                                    ? 'bg-emerald-50/80 border-emerald-300'
                                    : 'bg-emerald-950/30 border-emerald-500/40'
                                  : isLight
                                  ? 'bg-white border-zinc-200'
                                  : 'bg-zinc-900 border-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* In-Modal Audio Preview Button */}
                                <button
                                  onClick={() => togglePreviewSong(ver.song)}
                                  title={isPlayingPreview ? '暂停试听' : '试听该版本音质'}
                                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition cursor-pointer ${
                                    isPlayingPreview
                                      ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30'
                                      : isLight
                                      ? 'bg-zinc-100 hover:bg-purple-100 text-zinc-700 hover:text-purple-700'
                                      : 'bg-zinc-800 hover:bg-purple-900/50 text-zinc-300'
                                  }`}
                                >
                                  {isPlayingPreview ? (
                                    <Pause className="w-3.5 h-3.5" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5 ml-0.5" />
                                  )}
                                </button>

                                <div className="truncate min-w-0">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span
                                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                                        ver.isLossless
                                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                      }`}
                                    >
                                      {ver.song.bitrate || ver.song.format || '标准音质'}
                                    </span>
                                    <span className="text-xs font-medium truncate">
                                      {ver.song.localFilename || ver.song.title}
                                    </span>
                                  </div>

                                  <div
                                    className={`text-[10px] mt-0.5 truncate flex items-center gap-1.5 flex-wrap ${
                                      isLight ? 'text-zinc-500' : 'text-zinc-400'
                                    }`}
                                  >
                                    <span>大小: {ver.song.fileSize || '未知'}</span>
                                    <span>·</span>
                                    <span>{ver.reason}</span>
                                  </div>

                                  {/* Playlist & Favorite Reference Badges */}
                                  {(ver.isFavorite || (ver.playlistNames && ver.playlistNames.length > 0)) && (
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                      {ver.isFavorite && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-500 font-semibold flex items-center gap-0.5">
                                          <Heart className="w-2.5 h-2.5 fill-current" /> 已收藏
                                        </span>
                                      )}
                                      {ver.playlistNames && ver.playlistNames.length > 0 && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-500 font-semibold flex items-center gap-0.5">
                                          <ListMusic className="w-2.5 h-2.5" /> 位于歌单: {ver.playlistNames.join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0">
                                {isKeep ? (
                                  <span className="text-[10px] px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> 保留
                                  </span>
                                ) : (
                                  <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedIdsToDelete([...selectedIdsToDelete, ver.song.id]);
                                        } else {
                                          setSelectedIdsToDelete(
                                            selectedIdsToDelete.filter((id) => id !== ver.song.id)
                                          );
                                        }
                                      }}
                                      className="rounded accent-rose-600 cursor-pointer"
                                    />
                                    <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                                      清理
                                    </span>
                                  </label>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: REAL-TIME WATCHER & INCREMENTAL AUTO-SCRAPING */}
          {activeTab === 'watcher' && (
            <div className="space-y-6 animate-fadeIn">
              <div
                className={`p-5 rounded-2xl border relative overflow-hidden ${
                  isLight
                    ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200'
                    : 'bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border-emerald-500/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                      <Zap className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                          曲库文件夹实时内核级自动监控
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            watcherStatus?.enabled
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-zinc-500/20 text-zinc-500 border border-zinc-500/30'
                          }`}
                        >
                          {watcherStatus?.enabled ? '● 正在运行' : '⏸️ 已暂停'}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        基于 Linux inotify 内核中断事件监听，零 CPU 轮询占用。文件拷入/删除自动秒级同步。
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleToggleWatcher}
                    disabled={isTogglingWatcher}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md cursor-pointer ${
                      watcherStatus?.enabled
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                    }`}
                  >
                    {isTogglingWatcher ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                    <span>{watcherStatus?.enabled ? '暂停实时监控' : '开启实时监控'}</span>
                  </button>
                </div>

                <div className="mt-4 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                    <span className="opacity-60">监控路径:</span>
                    <span className="px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold">
                      {watcherStatus?.musicDir || 'music/'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                    <span className="opacity-60">已索引音轨:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      {watcherStatus?.totalWatchedFiles || songs.length}
                    </strong>{' '}
                    首
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      <span>新增歌曲自动多源刮削封面与歌词</span>
                    </div>
                    <p className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      当拷入新歌时，自动联网从 iTunes / LRCLIB 补全封面并落盘 .lrc
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(watcherStatus?.autoScrapeOnWatch)}
                      onChange={(e) => handleUpdateWatcherConfig({ autoScrapeOnWatch: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div
                  className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                    isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
                      <span>网络大文件写入防抖窗口</span>
                    </div>
                    <p className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      防止通过局域网/NAS拷贝大体积 FLAC 尚未写完即触发解析
                    </p>
                  </div>
                  <select
                    value={watcherStatus?.debounceMs || 1800}
                    onChange={(e) => handleUpdateWatcherConfig({ debounceMs: parseInt(e.target.value, 10) })}
                    className="bg-zinc-800 border border-white/10 text-xs rounded-xl px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value={1000}>1.0 秒 (本地快)</option>
                    <option value={1800}>1.8 秒 (推荐)</option>
                    <option value={3000}>3.0 秒 (NAS大文件)</option>
                    <option value={5000}>5.0 秒 (超大母带)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>实时变动审计流 (Live Event Stream)</span>
                  </h4>
                  <span className="text-[10px] text-zinc-500">最近 30 条自动捕获记录</span>
                </div>

                <div
                  className={`border rounded-2xl overflow-hidden divide-y ${
                    isLight ? 'bg-white border-zinc-200 divide-zinc-100' : 'bg-zinc-900/40 border-white/5 divide-white/5'
                  }`}
                >
                  {!watcherStatus?.recentEvents || watcherStatus.recentEvents.length === 0 ? (
                    <div className="p-8 text-center text-xs text-zinc-500">
                      <Zap className="w-6 h-6 text-zinc-400 mx-auto mb-2 opacity-50" />
                      <div>暂无近期变动事件</div>
                      <p className="text-[11px] opacity-70 mt-1">
                        将歌曲文件（FLAC/MP3/WAV/APE/DSD）复制到曲库目录中，此处将实时展示捕获流水
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {watcherStatus.recentEvents.map((evt: any) => (
                        <div
                          key={evt.id}
                          className="p-3 text-xs flex items-center justify-between gap-3 hover:bg-white/[0.02] transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                                evt.type === 'added'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : evt.type === 'updated'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {evt.type === 'added' ? '+ 新增' : evt.type === 'updated' ? '⟳ 更新' : '- 移除'}
                            </span>
                            <div className="truncate min-w-0">
                              <span className="font-semibold text-zinc-200 truncate">
                                {evt.songTitle || evt.filename}
                              </span>
                              {evt.artist && <span className="text-zinc-500 text-[11px] ml-1.5">({evt.artist})</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[10px] text-zinc-500">
                            <span>{evt.details}</span>
                            <span>{new Date(evt.time).toLocaleTimeString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batch 1: Single-Song Interactive Tag Editor & Online Scraper Comparison Modal */}
      {editingSong && (
        <TagScraperEditorModal
          song={editingSong}
          isLight={isLight}
          onClose={() => setEditingSong(null)}
          onSaved={() => {
            fetchHealthData();
            onRefreshLibrary();
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>,
    document.body
  );
};
