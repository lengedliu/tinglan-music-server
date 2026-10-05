import React, { useState, useEffect } from 'react';
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
  Filter,
  ShieldCheck,
  ChevronRight,
  Music,
  DownloadCloud,
  Check,
  X
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';
import { Song } from '../../types';

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
  const [scraperFilter, setScraperFilter] = useState<'all' | 'missing_cover' | 'missing_lyrics' | 'dirty_tag'>('all');
  const [scrapingSongId, setScrapingSongId] = useState<string | null>(null);
  const [isBatchScraping, setIsBatchScraping] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ total: number; done: number } | null>(null);

  // Duplicates Tab State
  const [selectedIdsToDelete, setSelectedIdsToDelete] = useState<string[]>([]);
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);

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
          // Auto-select redundant versions by default
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

  useEffect(() => {
    if (isOpen) {
      fetchHealthData();
    }
  }, [isOpen]);

  // Single Song Scraper
  const handleScrapeSingle = async (songId: string, forceOverwrite = false) => {
    setScrapingSongId(songId);
    try {
      const res = await apiFetch('/api/library/scrape/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId, forceOverwrite })
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

  // Batch Scraper
  const handleBatchScrape = async (forceAll = false) => {
    setIsBatchScraping(true);
    setBatchProgress({ total: songs.length, done: 0 });
    try {
      const res = await apiFetch('/api/library/scrape/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixMissingCovers: true,
          fixMissingLyrics: true,
          cleanAdTags: true,
          forceAll
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
      setBatchProgress(null);
    }
  };

  // Delete Selected Duplicates
  const handleDeleteDuplicates = async () => {
    if (selectedIdsToDelete.length === 0) return;
    setIsDeletingDuplicates(true);
    try {
      const res = await apiFetch('/api/library/duplicates/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIdsToRemove: selectedIdsToDelete })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('去重完成', data.message || `已清理 ${selectedIdsToDelete.length} 首冗余曲目`, 'success');
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
  const filteredScraperSongs = songs.filter(song => {
    const hasCover = song.coverUrl && !song.coverUrl.includes('placeholder') && song.coverUrl.trim().length > 10;
    const hasLyrics = song.lyrics && song.lyrics.trim().length > 20;
    const hasAd = /\[(?:无损|FLAC|320K)[^\]]*\]|www\.[a-z0-9-]+\.com/i.test(song.title);

    if (scraperFilter === 'missing_cover') return !hasCover;
    if (scraperFilter === 'missing_lyrics') return !hasLyrics;
    if (scraperFilter === 'dirty_tag') return hasAd;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className={`w-full max-w-4xl max-h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden transition-all ${
        isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-white'
      }`}>
        {/* Header */}
        <div className={`p-5 sm:p-6 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-900/60 border-white/10'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">曲库智能治理与元数据刮削中枢</h3>
                {report && (
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold font-mono border ${
                    report.score >= 85
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : report.score >= 70
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}>
                    {report.score}分 · {report.grade}级健康
                  </span>
                )}
              </div>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                全库健康体检诊断、在线高清封面与动态歌词刮削补全、同名高低音质智能去重
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchHealthData}
              disabled={loading}
              title="重新体检"
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isLight ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700' : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={`px-6 pt-3 flex items-center gap-2 border-b shrink-0 ${
          isLight ? 'bg-zinc-50/40 border-zinc-200' : 'bg-zinc-900/30 border-white/5'
        }`}>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-400 hover:text-zinc-200'
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
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'scraper'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>元数据智能刮削与歌词补齐</span>
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
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'duplicates'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>重复曲目智能治理</span>
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
            className={`pb-3 px-3 text-xs font-bold transition-all relative cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'watcher'
                ? 'text-purple-600 dark:text-purple-400 font-extrabold'
                : isLight ? 'text-zinc-500 hover:text-zinc-800' : 'text-zinc-400 hover:text-zinc-200'
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
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* TAB 1: AUDIT */}
          {activeTab === 'audit' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Overall Score & Fast Fix Hero Banner */}
              <div className={`p-5 rounded-3xl border relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-5 ${
                isLight
                  ? 'bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border-purple-200/80 shadow-sm'
                  : 'bg-gradient-to-r from-purple-950/30 via-indigo-950/20 to-zinc-900 border-purple-500/20'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-18 h-18 rounded-2xl flex flex-col items-center justify-center border font-mono font-bold shrink-0 ${
                    (report?.score || 0) >= 85
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                      : (report?.score || 0) >= 70
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                  }`}>
                    <span className="text-2xl leading-none">{report?.score || 100}</span>
                    <span className="text-[10px] font-sans opacity-80 mt-1">健康指数</span>
                  </div>

                  <div>
                    <h4 className="text-base font-bold flex items-center gap-2">
                      <span>曲库健康状态评级: {report?.grade || 'S'} 级</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300 font-semibold">
                        共 {report?.totalSongs || 0} 首曲目
                      </span>
                    </h4>
                    <p className={`text-xs mt-1 max-w-lg ${isLight ? 'text-zinc-600' : 'text-zinc-300'}`}>
                      {(report?.score || 0) >= 90
                        ? '✨ 您的音乐资产极为纯净！已具备极高的无损率、完整的专辑封面与同步歌词。'
                        : '💡 发现部分曲目存在封面或歌词缺失，可通过一键智能刮削提升小爱音箱与播放器视听体验。'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    onClick={() => handleBatchScrape(false)}
                    disabled={isBatchScraping}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition flex items-center gap-2 shadow-lg shadow-purple-600/25 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-4 h-4 ${isBatchScraping ? 'animate-spin' : ''}`} />
                    <span>{isBatchScraping ? '全库刮削修复中...' : '一键全库智能修复与补齐'}</span>
                  </button>
                </div>
              </div>

              {/* 4 Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'}`}>
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <Image className="w-3.5 h-3.5 text-purple-500" />
                      <span>封面覆盖率</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.coverPercent || 100}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.coverCount || 0} <span className="text-xs font-normal opacity-60">/ {report?.totalSongs || 0}</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-purple-500 h-full rounded-full" style={{ width: `${report?.coverPercent || 100}%` }} />
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'}`}>
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-blue-500" />
                      <span>LRC 歌词覆盖</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.lyricsPercent || 100}%</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.lyricsCount || 0} <span className="text-xs font-normal opacity-60">/ {report?.totalSongs || 0}</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-blue-500 h-full rounded-full" style={{ width: `${report?.lyricsPercent || 100}%` }} />
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'}`}>
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
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: `${report?.losslessPercent || 0}%` }} />
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-900/60 border-white/5'}`}>
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-[11px] font-semibold flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-emerald-500" />
                      <span>重复曲目组</span>
                    </span>
                    <span className="text-[10px] font-mono">{report?.duplicateGroupCount || 0} 组</span>
                  </div>
                  <div className="text-lg font-bold font-mono">
                    {report?.duplicateSongsTotal || 0} <span className="text-xs font-normal opacity-60">首重复</span>
                  </div>
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${report?.duplicateGroupCount ? 40 : 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Actionable Health Issues */}
              <div className="space-y-3">
                <h5 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  诊断发现与优化建议 ({report?.issues?.length || 0})
                </h5>

                {(!report?.issues || report.issues.length === 0) ? (
                  <div className={`p-6 rounded-2xl border text-center space-y-2 ${
                    isLight ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800' : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                  }`}>
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
                          isLight ? 'bg-white border-zinc-200 hover:border-purple-300' : 'bg-zinc-900/70 border-white/5 hover:border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                            issue.severity === 'high'
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          }`}>
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
                          <span>前往修复</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: METADATA SCRAPER */}
          {activeTab === 'scraper' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { key: 'all', label: `全部歌曲 (${songs.length})` },
                    { key: 'missing_cover', label: `缺封面 (${report?.coverMissingCount || 0})` },
                    { key: 'missing_lyrics', label: `缺歌词 (${report?.lyricsMissingCount || 0})` },
                    { key: 'dirty_tag', label: `待清洗标签 (${report?.dirtyTagCount || 0})` }
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setScraperFilter(f.key as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                        scraperFilter === f.key
                          ? 'bg-purple-600 text-white shadow-sm'
                          : isLight ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200' : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleBatchScrape(false)}
                  disabled={isBatchScraping}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/20 disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isBatchScraping ? 'animate-spin' : ''}`} />
                  <span>{isBatchScraping ? '正在批量刮削...' : '一键刮削补齐当前列表'}</span>
                </button>
              </div>

              {/* Song List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {filteredScraperSongs.length === 0 ? (
                  <div className={`p-8 text-center rounded-2xl border ${isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-900 border-white/5 text-zinc-400'}`}>
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <div className="text-sm font-bold">该筛选条件下无缺失曲目！</div>
                  </div>
                ) : (
                  filteredScraperSongs.map(song => {
                    const hasCover = song.coverUrl && !song.coverUrl.includes('placeholder') && song.coverUrl.trim().length > 10;
                    const hasLyrics = song.lyrics && song.lyrics.trim().length > 20;

                    return (
                      <div
                        key={song.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                          isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={song.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=120&q=80'}
                            alt={song.title}
                            className="w-11 h-11 rounded-xl object-cover shrink-0 border border-black/10"
                          />
                          <div className="truncate min-w-0">
                            <div className="text-xs font-bold truncate">{song.title}</div>
                            <div className={`text-[11px] truncate flex items-center gap-2 mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                              <span>{song.artist || '未知艺术家'}</span>
                              <span>·</span>
                              <span className="font-mono">{song.bitrate || song.format || '标准音质'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              {hasCover ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> 封面就绪
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium">
                                  缺封面
                                </span>
                              )}

                              {hasLyrics ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> LRC歌词
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
                            onClick={() => handleScrapeSingle(song.id, true)}
                            disabled={scrapingSongId === song.id}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                              isLight
                                ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                : 'bg-purple-950/40 hover:bg-purple-900/60 text-purple-300 border-purple-500/30'
                            }`}
                          >
                            <Sparkles className={`w-3 h-3 ${scrapingSongId === song.id ? 'animate-spin' : ''}`} />
                            <span>{scrapingSongId === song.id ? '刮削中...' : '智能刮削'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DUPLICATES */}
          {activeTab === 'duplicates' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100 dark:border-white/5">
                <div>
                  <h4 className="text-xs font-bold flex items-center gap-2">
                    <span>检测到 {duplicates.length} 组同名重复曲目</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-mono font-bold">
                      智能优选最高音质
                    </span>
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    系统已自动识别各版本的码率与编码格式，并建议保留母带无损/最高码率版本。
                  </p>
                </div>

                <button
                  onClick={handleDeleteDuplicates}
                  disabled={selectedIdsToDelete.length === 0 || isDeletingDuplicates}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingDuplicates ? '清理中...' : `清理选中的 ${selectedIdsToDelete.length} 首冗余版本`}</span>
                </button>
              </div>

              {duplicates.length === 0 ? (
                <div className={`p-8 text-center rounded-2xl border ${isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : 'bg-zinc-900 border-white/5 text-zinc-400'}`}>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <div className="text-sm font-bold">太棒了！曲库中无同名重复曲目。</div>
                  <p className="text-xs opacity-70 mt-1">没有发现冗余低音质占用存储空间。</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                  {duplicates.map((group, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-2xl border space-y-3 ${
                        isLight ? 'bg-zinc-50/70 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold flex items-center gap-2">
                          <Music className="w-3.5 h-3.5 text-purple-500" />
                          <span>{group.songTitle}</span>
                          <span className="font-normal opacity-60">· {group.artist}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          共 {group.versions.length} 个版本
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.versions.map((ver: any) => {
                          const isSelected = selectedIdsToDelete.includes(ver.song.id);
                          const isKeep = ver.recommendation === 'keep';

                          return (
                            <div
                              key={ver.song.id}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 transition ${
                                isKeep
                                  ? isLight ? 'bg-emerald-50/80 border-emerald-300' : 'bg-emerald-950/30 border-emerald-500/40'
                                  : isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-white/5'
                              }`}
                            >
                              <div className="truncate min-w-0">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                                    ver.isLossless
                                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                  }`}>
                                    {ver.song.bitrate || ver.song.format || '标准音质'}
                                  </span>
                                  <span className="text-xs truncate">{ver.song.localFilename || ver.song.title}</span>
                                </div>
                                <div className={`text-[10px] mt-0.5 truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                  大小: {ver.song.fileSize || '未知'} · {ver.reason}
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
                                          setSelectedIdsToDelete(selectedIdsToDelete.filter(id => id !== ver.song.id));
                                        }
                                      }}
                                      className="rounded accent-rose-600 cursor-pointer"
                                    />
                                    <span className="text-rose-600 dark:text-rose-400 font-semibold text-[11px]">清理</span>
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
              {/* Header Status Hero Card */}
              <div className={`p-5 rounded-2xl border relative overflow-hidden ${
                isLight ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200' : 'bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border-emerald-500/30'
              }`}>
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
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          watcherStatus?.enabled
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-zinc-500/20 text-zinc-500 border border-zinc-500/30'
                        }`}>
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

                {/* Monitored Directory Details */}
                <div className="mt-4 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center gap-4 text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                    <span className="opacity-60">监控路径:</span>
                    <span className="px-2 py-0.5 rounded bg-black/10 dark:bg-white/10 font-bold">{watcherStatus?.musicDir || 'music/'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                    <span className="opacity-60">已索引音轨:</span>
                    <strong className="text-emerald-600 dark:text-emerald-400">{watcherStatus?.totalWatchedFiles || songs.length}</strong> 首
                  </div>
                </div>
              </div>

              {/* Watcher Automation Switches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Switch 1: Auto Scrape */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                }`}>
                  <div className="space-y-1">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                      <span>新增歌曲自动补齐封面与歌词</span>
                    </div>
                    <p className={`text-[11px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      当拷入新歌时，若文件自身缺封面或歌词，自动异步联网补全
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

                {/* Switch 2: Debounce Config */}
                <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
                }`}>
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

              {/* Real-time Event Stream Logs */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>实时变动审计流 (Live Event Stream)</span>
                  </h4>
                  <span className="text-[10px] text-zinc-500">最近 30 条自动捕获记录</span>
                </div>

                <div className={`border rounded-2xl overflow-hidden divide-y ${
                  isLight ? 'bg-white border-zinc-200 divide-zinc-100' : 'bg-zinc-900/40 border-white/5 divide-white/5'
                }`}>
                  {(!watcherStatus?.recentEvents || watcherStatus.recentEvents.length === 0) ? (
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
                        <div key={evt.id} className="p-3 text-xs flex items-center justify-between gap-3 hover:bg-white/[0.02] transition">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              evt.type === 'added'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : evt.type === 'updated'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {evt.type === 'added' ? '+ 新增' : evt.type === 'updated' ? '⟳ 更新' : '- 移除'}
                            </span>
                            <div className="truncate min-w-0">
                              <span className="font-semibold text-zinc-200 truncate">{evt.songTitle || evt.filename}</span>
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
    </div>
  );
};
