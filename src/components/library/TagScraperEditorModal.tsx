import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  Check,
  X,
  Image as ImageIcon,
  FileText,
  Disc,
  User,
  Calendar,
  Tag,
  ArrowRight,
  Save,
  RefreshCw,
  CheckCircle2,
  FileCode
} from 'lucide-react';
import { Song } from '../../types';
import { apiFetch } from '../../utils/api';

export interface OnlineCandidate {
  id: string;
  source: string;
  title: string;
  artist: string;
  album: string;
  year?: number;
  genre?: string;
  trackNumber?: number;
  duration?: number;
  coverUrl?: string;
  lyrics?: string;
  hasSyncedLyrics: boolean;
  confidence: number;
  matchReason: string;
}

interface TagScraperEditorModalProps {
  song: Song | null;
  isLight: boolean;
  onClose: () => void;
  onSaved: () => void;
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const TagScraperEditorModal: React.FC<TagScraperEditorModalProps> = ({
  song,
  isLight,
  onClose,
  onSaved,
  onShowToast
}) => {
  // Editable tag form state
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState<string>('');
  const [genre, setGenre] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [writeSidecarLrc, setWriteSidecarLrc] = useState(true);
  const [saving, setSaving] = useState(false);

  // Online candidate search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchArtist, setSearchArtist] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'itunes' | 'lrclib' | 'netease'>('all');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<OnlineCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  useEffect(() => {
    if (!song) return;
    setTitle(song.title || '');
    setArtist(song.artist || '');
    setAlbum(song.album || '');
    setYear(song.year ? String(song.year) : '');
    setGenre(song.genre || '');
    setCoverUrl(song.coverUrl || '');
    setLyrics(song.lyrics || '');

    const cleanQ = (song.title || '').replace(/\[[^\]]*\]|【[^】]*】/g, '').trim();
    const cleanA =
      song.artist && song.artist !== '未知艺术家' && song.artist !== 'Unknown' ? song.artist : '';
    setSearchQuery(cleanQ);
    setSearchArtist(cleanA);

    // Automatically trigger initial online candidate search
    if (cleanQ) {
      triggerOnlineSearch(cleanQ, cleanA, song.duration, 'all');
    }
  }, [song]);

  const triggerOnlineSearch = async (
    q: string,
    art: string,
    duration?: number,
    src: 'all' | 'itunes' | 'lrclib' | 'netease' = sourceFilter
  ) => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({
        q: q.trim(),
        artist: art.trim(),
        source: src
      });
      if (duration && duration > 0) {
        params.set('duration', String(Math.round(duration)));
      }
      const res = await apiFetch(`/api/library/scrape/search?${params.toString()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        const list: OnlineCandidate[] = data.candidates || [];
        setCandidates(list);
        if (list.length > 0) {
          setSelectedCandidateId(list[0].id);
        }
      }
    } catch (err: any) {
      console.error('Online search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  if (!song) return null;

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId) || candidates[0] || null;

  const applyCandidateFields = (
    cand: OnlineCandidate,
    mode: 'all' | 'missing_only' | 'cover_only' | 'lyrics_only'
  ) => {
    if (mode === 'cover_only') {
      if (cand.coverUrl) {
        setCoverUrl(cand.coverUrl);
        onShowToast('已填入候选封面', `已采用来自 [${cand.source}] 的高清封面，点击底部保存生效`, 'info');
      }
      return;
    }
    if (mode === 'lyrics_only') {
      if (cand.lyrics) {
        setLyrics(cand.lyrics);
        onShowToast('已填入候选歌词', `已采用来自 [${cand.source}] 的同步 LRC 歌词，点击底部保存生效`, 'info');
      }
      return;
    }
    if (mode === 'missing_only') {
      if (!title || title === '未知曲目') setTitle(cand.title || title);
      if (!artist || artist === '未知艺术家' || artist === 'Unknown') setArtist(cand.artist || artist);
      if (!album || album === '未知专辑' || album === 'Unknown') setAlbum(cand.album || album);
      if (!year && cand.year) setYear(String(cand.year));
      if ((!genre || genre === '未知') && cand.genre) setGenre(cand.genre);
      if ((!coverUrl || coverUrl.includes('placeholder')) && cand.coverUrl) setCoverUrl(cand.coverUrl);
      if ((!lyrics || lyrics.trim().length < 20) && cand.lyrics) setLyrics(cand.lyrics);
      onShowToast('已补齐空缺字段', `已将 [${cand.source}] 的元数据填入空缺项`, 'info');
      return;
    }

    // mode === 'all'
    if (cand.title) setTitle(cand.title);
    if (cand.artist) setArtist(cand.artist);
    if (cand.album) setAlbum(cand.album);
    if (cand.year) setYear(String(cand.year));
    if (cand.genre) setGenre(cand.genre);
    if (cand.coverUrl) setCoverUrl(cand.coverUrl);
    if (cand.lyrics) setLyrics(cand.lyrics);
    onShowToast('已全字段填入', `已将 [${cand.source}] 的完整元数据载入左侧编辑器`, 'info');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/library/song/${encodeURIComponent(song.id)}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          artist,
          album,
          year: year ? parseInt(year, 10) : undefined,
          genre,
          coverUrl,
          lyrics,
          writeSidecarLrc
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('标签保存成功', data.message || '歌曲元数据已更新', 'success');
        onSaved();
        onClose();
      } else {
        onShowToast('保存失败', data.error || '无法保存标签', 'error');
      }
    } catch (err: any) {
      onShowToast('保存异常', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const hasSyncedTimestamps = /\[\d{2}:\d{2}(?:\.\d{1,3})?\]/.test(lyrics);
  const lyricsLineCount = lyrics ? lyrics.trim().split('\n').length : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className={`w-full max-w-5xl max-h-[92vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-white'
        }`}
      >
        {/* Top Bar */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/70 border-white/10'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-purple-600 text-white shadow-md shadow-purple-500/20">
              <Tag className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold truncate">
                  单曲标签精修与多源在线刮削对比 (Music-Tag Workbench)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 font-mono font-bold shrink-0">
                  {song.bitrate || song.format || '音频文件'}
                </span>
              </div>
              <p className={`text-[11px] truncate ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                物理文件: {song.localFilename || song.id} · 时长:{' '}
                {song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.round(song.duration % 60)).padStart(2, '0')}` : '未知'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main 2-Column Workbench */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200 dark:divide-white/10">
          {/* LEFT COLUMN (5 cols): Current Song Tag Editor */}
          <div className="lg:col-span-5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-500 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                <span>当前曲目元数据编辑器</span>
              </h4>
              <span className="text-[10px] text-zinc-400">支持手动精修或从右侧一键填入</span>
            </div>

            {/* Cover Preview + URL Input */}
            <div className="flex items-start gap-3.5">
              <div className="relative w-24 h-24 rounded-2xl overflow-hidden border border-black/15 dark:border-white/10 shrink-0 bg-zinc-900 group">
                <img
                  src={
                    coverUrl ||
                    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=240&q=80'
                  }
                  alt={title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] text-white font-mono">
                  封面预览
                </div>
              </div>

              <div className="flex-1 space-y-2 min-w-0">
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-75">歌曲标题 (Title)</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:border-purple-500 ${
                      isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1 opacity-75">艺术家 / 歌手 (Artist)</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className={`w-full px-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:border-purple-500 ${
                      isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Album / Year / Genre Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className="block text-[11px] font-semibold mb-1 opacity-75">专辑名称 (Album)</label>
                <input
                  type="text"
                  value={album}
                  onChange={(e) => setAlbum(e.target.value)}
                  placeholder="专辑名"
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:border-purple-500 ${
                    isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">发行年份 (Year)</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2025"
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-purple-500 ${
                    isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 opacity-75">流派 (Genre)</label>
                <input
                  type="text"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder="Pop / Rock"
                  className={`w-full px-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:border-purple-500 ${
                    isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>
            </div>

            {/* Cover URL input */}
            <div>
              <label className="block text-[11px] font-semibold mb-1 opacity-75">高清封面图 URL (Cover Art)</label>
              <input
                type="text"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                className={`w-full px-3 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:border-purple-500 ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                }`}
              />
            </div>

            {/* LRC Lyrics Editor */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold opacity-75 flex items-center gap-1.5">
                  <span>LRC 歌词内容 (Lyrics)</span>
                  {hasSyncedTimestamps ? (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-500 text-[10px] font-mono">
                      ✓ 含时间轴 ({lyricsLineCount}行)
                    </span>
                  ) : lyricsLineCount > 0 ? (
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 text-[10px] font-mono">
                      纯文本歌词 ({lyricsLineCount}行)
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-500 text-[10px]">未设置歌词</span>
                  )}
                </label>
              </div>
              <textarea
                rows={7}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="[00:00.00]作词 : ...&#10;[00:05.00]支持粘贴或从右侧刮削标准 LRC 同步歌词"
                className={`w-full p-3 rounded-xl border text-xs font-mono leading-relaxed focus:outline-none focus:border-purple-500 resize-y ${
                  isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-zinc-900 border-white/10 text-zinc-200'
                }`}
              />
            </div>

            {/* Sidecar LRC Persistence Toggle */}
            {song.localFilename && (
              <label
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer select-none ${
                  isLight ? 'bg-purple-50/50 border-purple-200' : 'bg-purple-950/20 border-purple-500/20'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4 text-purple-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">同步落盘物理同名 .lrc 歌词文件</div>
                    <div className={`text-[10px] ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      在 music/ 目录生成与音频同名的 .lrc 文件，重装系统或全盘重扫永不丢失
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={writeSidecarLrc}
                  onChange={(e) => setWriteSidecarLrc(e.target.checked)}
                  className="rounded accent-purple-600 w-4 h-4 cursor-pointer"
                />
              </label>
            )}
          </div>

          {/* RIGHT COLUMN (7 cols): Multi-Source Online Candidate Search & Diff */}
          <div className="lg:col-span-7 p-5 space-y-4 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>多源在线元数据检索与候选比对 (iTunes / LRCLIB / 网易云)</span>
              </h4>

              {/* Source Filter Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                {[
                  { id: 'all', label: '全源聚合' },
                  { id: 'itunes', label: 'iTunes 封面' },
                  { id: 'lrclib', label: 'LRCLIB 歌词' },
                  { id: 'netease', label: '网易云' }
                ].map((src) => (
                  <button
                    key={src.id}
                    onClick={() => {
                      const next = src.id as any;
                      setSourceFilter(next);
                      triggerOnlineSearch(searchQuery, searchArtist, song.duration, next);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                      sourceFilter === src.id
                        ? 'bg-indigo-600 text-white'
                        : isLight
                        ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {src.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Inputs */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && triggerOnlineSearch(searchQuery, searchArtist, song.duration, sourceFilter)
                  }
                  placeholder="输入歌名关键词..."
                  className={`w-full pl-8 pr-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-500 ${
                    isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-white/10'
                  }`}
                />
              </div>
              <div className="sm:w-44">
                <input
                  type="text"
                  value={searchArtist}
                  onChange={(e) => setSearchArtist(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && triggerOnlineSearch(searchQuery, searchArtist, song.duration, sourceFilter)
                  }
                  placeholder="歌手名 (可选)..."
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:border-indigo-500 ${
                    isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-white/10'
                  }`}
                />
              </div>
              <button
                onClick={() => triggerOnlineSearch(searchQuery, searchArtist, song.duration, sourceFilter)}
                disabled={searching}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${searching ? 'animate-spin' : ''}`} />
                <span>{searching ? '检索中...' : '在线搜索'}</span>
              </button>
            </div>

            {/* Candidate Results List */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {searching ? (
                <div className="py-10 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                  <span>正在并发检索 iTunes 高清图库、LRCLIB 歌词库与网易云音乐...</span>
                </div>
              ) : candidates.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  未检索到匹配候选，请尝试精简歌名关键词后再试
                </div>
              ) : (
                candidates.map((cand) => {
                  const isSelected = selectedCandidate?.id === cand.id;
                  return (
                    <div
                      key={cand.id}
                      onClick={() => setSelectedCandidateId(cand.id)}
                      className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? isLight
                            ? 'bg-indigo-50/90 border-indigo-400 shadow-sm'
                            : 'bg-indigo-950/40 border-indigo-500/60'
                          : isLight
                          ? 'bg-white hover:bg-zinc-50 border-zinc-200'
                          : 'bg-zinc-900/50 hover:bg-zinc-900 border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={
                            cand.coverUrl ||
                            'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=120&q=80'
                          }
                          alt={cand.title}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-black/10"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold truncate">{cand.title}</span>
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 font-semibold">
                              {cand.source}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                cand.confidence >= 85
                                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                  : cand.confidence >= 65
                                  ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                  : 'bg-zinc-500/20 text-zinc-400'
                              }`}
                            >
                              置信度 {cand.confidence}%
                            </span>
                          </div>
                          <div
                            className={`text-[11px] truncate mt-0.5 ${
                              isLight ? 'text-zinc-600' : 'text-zinc-300'
                            }`}
                          >
                            {cand.artist} · 《{cand.album || '单曲'}》
                            {cand.year ? ` · ${cand.year}年` : ''}
                            {cand.duration
                              ? ` · ${Math.floor(cand.duration / 60)}:${String(cand.duration % 60).padStart(2, '0')}`
                              : ''}
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate mt-0.5">{cand.matchReason}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            applyCandidateFields(cand, 'all');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition cursor-pointer"
                        >
                          采用全部
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Candidate Field-by-Field Diff & Selective Apply Bar */}
            {selectedCandidate && (
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/70 border-white/10'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-200 dark:border-white/10">
                  <div className="text-xs font-bold flex items-center gap-2">
                    <span>候选详情与差异比对:</span>
                    <span className="text-indigo-500">
                      {selectedCandidate.title} - {selectedCandidate.artist}
                    </span>
                  </div>

                  {/* Selective Apply Action Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedCandidate.coverUrl && (
                      <button
                        onClick={() => applyCandidateFields(selectedCandidate, 'cover_only')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          isLight
                            ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                            : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-200'
                        }`}
                      >
                        仅用封面
                      </button>
                    )}
                    {selectedCandidate.lyrics && (
                      <button
                        onClick={() => applyCandidateFields(selectedCandidate, 'lyrics_only')}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          isLight
                            ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                            : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-200'
                        }`}
                      >
                        仅用歌词
                      </button>
                    )}
                    <button
                      onClick={() => applyCandidateFields(selectedCandidate, 'missing_only')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                        isLight
                          ? 'bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700'
                          : 'bg-purple-950/50 hover:bg-purple-900/60 border-purple-500/30 text-purple-300'
                      }`}
                    >
                      仅补空缺项
                    </button>
                    <button
                      onClick={() => applyCandidateFields(selectedCandidate, 'all')}
                      className="px-3 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
                    >
                      全字段覆盖填入
                    </button>
                  </div>
                </div>

                {/* Diff Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/5">
                    <span className="opacity-60">专辑:</span>
                    <span className="font-semibold truncate max-w-[200px]">
                      {album || '无'} <ArrowRight className="inline w-3 h-3 mx-1 text-indigo-400" />{' '}
                      <strong className="text-indigo-500">{selectedCandidate.album || '未提供'}</strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/5">
                    <span className="opacity-60">年份 / 流派:</span>
                    <span className="font-semibold truncate">
                      {selectedCandidate.year || '-'} · {selectedCandidate.genre || '-'}
                    </span>
                  </div>
                </div>

                {/* Candidate LRC Preview */}
                {selectedCandidate.lyrics ? (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-zinc-400 flex items-center justify-between">
                      <span>候选歌词预览 ({selectedCandidate.hasSyncedLyrics ? '带时间轴 LRC' : '纯文本'}):</span>
                      <span>共 {selectedCandidate.lyrics.split('\n').length} 行</span>
                    </div>
                    <pre
                      className={`p-2.5 rounded-xl text-[10px] font-mono max-h-28 overflow-y-auto whitespace-pre-wrap ${
                        isLight ? 'bg-white border border-zinc-200 text-zinc-700' : 'bg-zinc-950 text-zinc-300'
                      }`}
                    >
                      {selectedCandidate.lyrics.slice(0, 600)}
                      {selectedCandidate.lyrics.length > 600 ? '\n...' : ''}
                    </pre>
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-400 italic">
                    该候选主要提供高清专辑封面与唱片信息，可点击上方【LRCLIB 歌词】或【网易云】补充歌词。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div
          className={`px-6 py-4 border-t flex items-center justify-between shrink-0 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/70 border-white/10'
          }`}
        >
          <div className="text-xs text-zinc-500">
            提示：在右侧点击「采用全部」或「仅用封面/歌词」后，可在左侧二次微调，最后点击右侧保存按钮生效。
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                  : 'bg-zinc-900 hover:bg-zinc-800 border-white/10 text-zinc-300'
              }`}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-purple-600/20 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? '正在保存...' : '保存标签更改'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
