import React, { useState, useEffect } from 'react';
import {
  Radio as RadioIcon,
  Rss,
  Play,
  Cast,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ExternalLink,
  Music,
  Headphones,
  Sliders,
  Volume2,
  X,
  Layers,
  ChevronRight
} from 'lucide-react';
import { XiaomiDevice, Song } from '../types';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';

interface RadioStation {
  id: string;
  name: string;
  url: string;
  category: 'national' | 'music' | 'lofi' | 'news' | 'classical' | 'custom';
  logoUrl?: string;
  description?: string;
  bitrate?: string;
  isCustom?: boolean;
}

interface PodcastEpisode {
  id: string;
  title: string;
  audioUrl: string;
  pubDate: string;
  duration?: string;
  description?: string;
  coverUrl?: string;
}

interface PodcastSubscription {
  id: string;
  title: string;
  rssUrl: string;
  author?: string;
  description?: string;
  coverUrl?: string;
  link?: string;
  episodesCount?: number;
}

interface RadioPodcastTabProps {
  devices: XiaomiDevice[];
  activeDevice: XiaomiDevice | undefined;
  currentSong?: Song | null;
  isPlaying?: boolean;
  isCasting?: boolean;
  onPlaySongInBrowser: (song: Song) => void;
  onCastToSpeaker: (deviceId: string, title: string, artist: string, audioUrl: string, coverUrl?: string) => void;
}

export const RadioPodcastTab: React.FC<RadioPodcastTabProps> = ({
  devices,
  activeDevice,
  currentSong,
  isPlaying,
  isCasting,
  onPlaySongInBrowser,
  onCastToSpeaker
}) => {
  const { themeConfig, isLight } = useTheme();

  // Sub-tabs: 'radio' | 'podcasts'
  const [subTab, setSubTab] = useState<'radio' | 'podcasts'>('radio');

  // Radio State
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isLoadingStations, setIsLoadingStations] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [radioSearchQuery, setRadioSearchQuery] = useState('');
  
  // Custom Radio Modal
  const [isAddStationModalOpen, setIsAddStationModalOpen] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationUrl, setNewStationUrl] = useState('');
  const [newStationDesc, setNewStationDesc] = useState('');
  const [newStationCategory, setNewStationCategory] = useState<'national' | 'music' | 'lofi' | 'news' | 'classical' | 'custom'>('custom');
  const [isSavingStation, setIsSavingStation] = useState(false);

  // Podcast State
  const [podcasts, setPodcasts] = useState<PodcastSubscription[]>([]);
  const [isLoadingPodcasts, setIsLoadingPodcasts] = useState(true);
  const [rssInputUrl, setRssInputUrl] = useState('');
  const [isParsingRss, setIsParsingRss] = useState(false);
  const [parsedPodcast, setParsedPodcast] = useState<{
    title: string;
    author: string;
    description: string;
    coverUrl: string;
    link: string;
    episodes: PodcastEpisode[];
  } | null>(null);

  // Active viewing Podcast episodes
  const [selectedPodcast, setSelectedPodcast] = useState<{
    title: string;
    author: string;
    description: string;
    coverUrl: string;
    rssUrl: string;
    episodes: PodcastEpisode[];
  } | null>(null);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  // Status Feedback
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch initial radio stations & podcasts
  const fetchStations = async () => {
    setIsLoadingStations(true);
    try {
      const res = await apiFetch('/api/radio/stations');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStations(data.stations || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch radio stations:', err);
    } finally {
      setIsLoadingStations(false);
    }
  };

  const fetchPodcasts = async () => {
    setIsLoadingPodcasts(true);
    try {
      const res = await apiFetch('/api/radio/podcasts');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPodcasts(data.podcasts || []);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch podcasts:', err);
    } finally {
      setIsLoadingPodcasts(false);
    }
  };

  useEffect(() => {
    fetchStations();
    fetchPodcasts();
  }, []);

  const handleAddCustomStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName || !newStationUrl) return;
    setIsSavingStation(true);
    try {
      const res = await apiFetch('/api/radio/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newStationName,
          url: newStationUrl,
          category: newStationCategory,
          description: newStationDesc
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStations(prev => [data.station, ...prev]);
          setIsAddStationModalOpen(false);
          setNewStationName('');
          setNewStationUrl('');
          setNewStationDesc('');
          setActionMessage({ text: `网络电台「${data.station.name}」已成功保存！`, type: 'success' });
        }
      }
    } catch (err: any) {
      setActionMessage({ text: `添加电台失败: ${err.message}`, type: 'error' });
    } finally {
      setIsSavingStation(false);
    }
  };

  const handleDeleteStation = async (id: string, name: string) => {
    if (!window.confirm(`确定要删除自定义电台「${name}」吗？`)) return;
    try {
      const res = await apiFetch(`/api/radio/stations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setStations(prev => prev.filter(s => s.id !== id));
        setActionMessage({ text: `电台「${name}」已删除`, type: 'success' });
      }
    } catch (err: any) {
      setActionMessage({ text: `删除电台失败: ${err.message}`, type: 'error' });
    }
  };

  const handleParseRss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rssInputUrl || !rssInputUrl.startsWith('http')) return;
    setIsParsingRss(true);
    setParsedPodcast(null);
    try {
      const res = await apiFetch('/api/radio/podcasts/parse-rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rssUrl: rssInputUrl })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.podcast) {
          setParsedPodcast(data.podcast);
        } else {
          setActionMessage({ text: data.error || '解析 RSS 失败，请检查 URL 是否为有效的播客 Feed XML', type: 'error' });
        }
      }
    } catch (err: any) {
      setActionMessage({ text: `RSS 解析异常: ${err.message}`, type: 'error' });
    } finally {
      setIsParsingRss(false);
    }
  };

  const handleSubscribePodcast = async (podData: any) => {
    try {
      const res = await apiFetch('/api/radio/podcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: podData.title,
          rssUrl: rssInputUrl,
          author: podData.author,
          description: podData.description,
          coverUrl: podData.coverUrl,
          link: podData.link,
          episodesCount: podData.episodes?.length || 0
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPodcasts(prev => [data.podcast, ...prev]);
          setParsedPodcast(null);
          setRssInputUrl('');
          setActionMessage({ text: `已成功订阅播客《${podData.title}》！`, type: 'success' });
        }
      }
    } catch (err: any) {
      setActionMessage({ text: `订阅播客失败: ${err.message}`, type: 'error' });
    }
  };

  const handleUnsubscribePodcast = async (id: string, title: string) => {
    if (!window.confirm(`确定要取消订阅播客《${title}》吗？`)) return;
    try {
      const res = await apiFetch(`/api/radio/podcasts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setPodcasts(prev => prev.filter(p => p.id !== id));
        if (selectedPodcast?.rssUrl) setSelectedPodcast(null);
        setActionMessage({ text: `已取消订阅播客《${title}》`, type: 'success' });
      }
    } catch (err: any) {
      setActionMessage({ text: `取消订阅失败: ${err.message}`, type: 'error' });
    }
  };

  const handleViewPodcastEpisodes = async (pod: PodcastSubscription) => {
    setIsLoadingEpisodes(true);
    setSelectedPodcast({
      title: pod.title,
      author: pod.author || '播客主播',
      description: pod.description || '',
      coverUrl: pod.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80',
      rssUrl: pod.rssUrl,
      episodes: []
    });
    try {
      const res = await apiFetch('/api/radio/podcasts/parse-rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rssUrl: pod.rssUrl })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.podcast) {
          setSelectedPodcast({
            title: data.podcast.title,
            author: data.podcast.author,
            description: data.podcast.description,
            coverUrl: data.podcast.coverUrl,
            rssUrl: pod.rssUrl,
            episodes: data.podcast.episodes || []
          });
        }
      }
    } catch (err) {
      console.warn('Failed to load podcast episodes:', err);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const handlePlayStationInBrowser = (st: RadioStation) => {
    const streamUrl = `/api/radio/stream/${encodeURIComponent(st.id)}`;
    const virtualSong: Song = {
      id: st.id,
      title: st.name,
      artist: st.description || '网络广播电台直播流',
      album: st.category.toUpperCase(),
      duration: 0,
      url: streamUrl,
      filePath: streamUrl,
      coverUrl: st.logoUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80'
    };
    onPlaySongInBrowser(virtualSong);
    setActionMessage({ text: `正在 Web 网页播放网络电台: ${st.name}`, type: 'success' });
  };

  const handleCastStationToSpeaker = (st: RadioStation) => {
    const targetDid = activeDevice?.did;
    if (!targetDid) {
      setActionMessage({ text: '请先在顶部音箱选择面板选中一台小爱音箱设备', type: 'error' });
      return;
    }
    const streamUrl = `/api/radio/stream/${encodeURIComponent(st.id)}`;
    onCastToSpeaker(targetDid, st.name, st.description || '网络电台直播流', streamUrl, st.logoUrl);
    setActionMessage({ text: `已向【${activeDevice.name}】发送投播网络电台指令: ${st.name}`, type: 'success' });
  };

  const handlePlayEpisodeInBrowser = (ep: PodcastEpisode, podTitle: string) => {
    const streamUrl = `/api/radio/proxy?url=${encodeURIComponent(ep.audioUrl)}`;
    const virtualSong: Song = {
      id: ep.id,
      title: ep.title,
      artist: podTitle,
      album: ep.pubDate || '播客单集',
      duration: 0,
      url: streamUrl,
      filePath: streamUrl,
      coverUrl: ep.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80'
    };
    onPlaySongInBrowser(virtualSong);
    setActionMessage({ text: `正在播放播客单集: ${ep.title}`, type: 'success' });
  };

  const handleCastEpisodeToSpeaker = (ep: PodcastEpisode, podTitle: string) => {
    const targetDid = activeDevice?.did;
    if (!targetDid) {
      setActionMessage({ text: '请先在顶部音箱选择面板选中一台小爱音箱设备', type: 'error' });
      return;
    }
    const streamUrl = `/api/radio/proxy?url=${encodeURIComponent(ep.audioUrl)}`;
    onCastToSpeaker(targetDid, ep.title, podTitle, streamUrl, ep.coverUrl);
    setActionMessage({ text: `已向【${activeDevice.name}】投播播客单集: ${ep.title}`, type: 'success' });
  };

  // Filter stations
  const filteredStations = stations.filter(st => {
    if (selectedCategory !== 'all' && st.category !== selectedCategory) return false;
    if (radioSearchQuery) {
      const q = radioSearchQuery.toLowerCase();
      return st.name.toLowerCase().includes(q) || (st.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Action Notification Banner */}
      {actionMessage && (
        <div className={`p-4 rounded-xl flex items-center justify-between shadow-lg backdrop-blur-md border animate-fadeIn ${
          actionMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
        }`}>
          <div className="flex items-center gap-3 text-sm font-medium">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="p-1 hover:bg-white/10 rounded-lg cursor-pointer">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      )}

      {/* Top Banner & Mode Toggle */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-white/10 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <RadioIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                网络广播电台 & 播客 RSS 订阅 Hub
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                  PHASE 2
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                实时解构 AAC/M3U8 广播音频流，聚合全球播客 RSS 节点，一键无缝无损投播至小爱音箱集群
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 border border-white/10 rounded-xl">
          <button
            onClick={() => setSubTab('radio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'radio'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <RadioIcon className="w-4 h-4" />
            <span>网络广播电台 ({stations.length})</span>
          </button>
          <button
            onClick={() => setSubTab('podcasts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === 'podcasts'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Rss className="w-4 h-4" />
            <span>播客 RSS 聚合 ({podcasts.length})</span>
          </button>
        </div>
      </div>

      {/* --- SUBTAB 1: NETWORK RADIO STATIONS --- */}
      {subTab === 'radio' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border backdrop-blur-md transition ${
            isLight
              ? 'bg-white border-zinc-200/80 shadow-sm text-zinc-900'
              : 'bg-zinc-900/80 border-white/5 shadow-md text-white'
          }`}>
            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto p-0.5">
              {[
                { id: 'all', label: '全部频道' },
                { id: 'national', label: '央广国家台' },
                { id: 'music', label: '流行乐' },
                { id: 'lofi', label: 'Lofi Chill' },
                { id: 'classical', label: '爵士古典' },
                { id: 'news', label: '资讯外语' },
                { id: 'custom', label: '自定义电台' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-zinc-950 font-bold border border-amber-400 shadow-md scale-[1.02]'
                      : isLight
                        ? 'bg-zinc-100 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200 border border-zinc-200/60'
                        : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-100 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Search & Add Custom Button */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-56">
                <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${
                  isLight ? 'text-zinc-400' : 'text-zinc-500'
                }`} />
                <input
                  type="text"
                  placeholder="搜索电台频率或关键词..."
                  value={radioSearchQuery}
                  onChange={e => setRadioSearchQuery(e.target.value)}
                  className={`w-full rounded-lg pl-9 pr-3 py-1.5 text-xs transition focus:outline-none ${
                    isLight
                      ? 'bg-zinc-100 border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:bg-white'
                      : 'bg-zinc-950/80 border border-white/10 text-zinc-200 placeholder-zinc-500 focus:border-amber-500/50'
                  }`}
                />
              </div>

              <button
                onClick={() => setIsAddStationModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition text-xs font-semibold cursor-pointer shrink-0 ${
                  isLight
                    ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>自定义电台</span>
              </button>
            </div>
          </div>

          {/* Stations Grid */}
          {isLoadingStations ? (
            <div className="py-20 text-center text-zinc-500 text-xs flex flex-col items-center gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
              <span>正在加载在线广播频道节点...</span>
            </div>
          ) : filteredStations.length === 0 ? (
            <div className={`py-16 text-center text-xs border border-dashed rounded-2xl ${
              isLight ? 'bg-white border-zinc-200 text-zinc-500' : 'border-white/10 text-zinc-500'
            }`}>
              暂未找到匹配的网络广播电台
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredStations.map(st => {
                const isActive = (currentSong?.id === st.id) || (currentSong?.title === st.name);

                return (
                  <div
                    key={st.id}
                    onClick={() => {
                      if (isCasting && activeDevice) {
                        handleCastStationToSpeaker(st);
                      } else {
                        handlePlayStationInBrowser(st);
                      }
                    }}
                    className={`group p-4 rounded-xl transition-all shadow-md flex flex-col justify-between space-y-3 cursor-pointer relative ${
                      isActive
                        ? isLight
                          ? 'bg-amber-50/80 border-2 border-amber-500 shadow-amber-500/10 shadow-lg'
                          : 'bg-amber-500/10 border-2 border-amber-500/60 shadow-amber-500/10 shadow-lg'
                        : isLight
                          ? 'bg-white hover:bg-zinc-50/90 border border-zinc-200/80 hover:border-amber-500/50 hover:shadow-lg'
                          : 'bg-zinc-900/80 hover:bg-zinc-800/90 border border-white/5 hover:border-amber-500/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <img
                          src={st.logoUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80'}
                          alt={st.name}
                          className={`w-12 h-12 rounded-lg object-cover group-hover:scale-105 transition ${
                            isLight ? 'bg-zinc-100 border border-zinc-200' : 'bg-zinc-950 border border-white/10'
                          }`}
                        />
                        {isActive && isPlaying && (
                          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className={`text-sm font-bold truncate transition flex items-center gap-1.5 ${
                            isActive
                              ? 'text-amber-500 font-extrabold'
                              : isLight ? 'text-zinc-900 group-hover:text-amber-600' : 'text-white group-hover:text-amber-400'
                          }`}>
                            <span className="truncate">{st.name}</span>
                            {isActive && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500 text-zinc-950 font-bold shrink-0">
                                播放中
                              </span>
                            )}
                          </h3>
                          {st.isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteStation(st.id, st.name);
                              }}
                              className="p-1 text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                              title="删除自定义电台"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <p className={`text-[11px] line-clamp-2 mt-0.5 ${
                          isLight ? 'text-zinc-500' : 'text-zinc-400'
                        }`}>
                          {st.description || '24/7 高清在线广播流'}
                        </p>
                      </div>
                    </div>

                    <div className={`pt-2 border-t flex items-center justify-between gap-2 ${
                      isLight ? 'border-zinc-100' : 'border-white/5'
                    }`}>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        isLight ? 'bg-zinc-100 text-zinc-600 border-zinc-200' : 'bg-zinc-950 text-zinc-500 border-white/5'
                      }`}>
                        {st.bitrate || '128kbps AAC'}
                      </span>

                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {/* Web Play */}
                        <button
                          onClick={() => handlePlayStationInBrowser(st)}
                          className={`p-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs ${
                            isActive && !isCasting
                              ? 'bg-amber-500 text-zinc-950 font-bold'
                              : isLight ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                          }`}
                          title="在网页浏览器播放"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span className="hidden sm:inline text-[11px]">网页播</span>
                        </button>

                        {/* Cast to Speaker */}
                        <button
                          onClick={() => handleCastStationToSpeaker(st)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition text-xs font-semibold cursor-pointer ${
                            isActive && isCasting
                              ? 'bg-amber-500 text-zinc-950 font-bold shadow-md'
                              : isLight
                                ? 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                          }`}
                          title={`一键投播至 ${activeDevice?.name || '小爱音箱'}`}
                        >
                          <Cast className="w-3.5 h-3.5" />
                          <span>投播音箱</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- SUBTAB 2: PODCAST RSS AGGREGATOR --- */}
      {subTab === 'podcasts' && (
        <div className="space-y-6">
          {/* RSS Input Bar */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/80 border-white/10'
          }`}>
            <h3 className={`text-sm font-bold flex items-center gap-2 ${
              isLight ? 'text-zinc-900' : 'text-zinc-200'
            }`}>
              <Rss className="w-4 h-4 text-amber-500" />
              <span>解析与添加播客 RSS Feed 节点</span>
            </h3>

            <form onSubmit={handleParseRss} className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                required
                placeholder="粘贴播客 RSS XML 链接 (例如: https://feed.xyz.fm/xxx 或 https://rss.art19.com/xxx)"
                value={rssInputUrl}
                onChange={e => setRssInputUrl(e.target.value)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-xs transition focus:outline-none ${
                  isLight
                    ? 'bg-zinc-100 border border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-amber-500 focus:bg-white'
                    : 'bg-zinc-950/80 border border-white/10 text-zinc-200 placeholder-zinc-500 focus:border-amber-500/50'
                }`}
              />
              <button
                type="submit"
                disabled={isParsingRss}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
              >
                {isParsingRss ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在拉取与解析 XML...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>解析 RSS 节点</span>
                  </>
                )}
              </button>
            </form>

            {/* Parsed Preview Modal Card */}
            {parsedPodcast && (
              <div className={`p-4 rounded-xl border space-y-3 animate-fadeIn ${
                isLight ? 'bg-amber-50/50 border-amber-300 text-zinc-900' : 'bg-zinc-950 border-amber-500/30 text-white'
              }`}>
                <div className="flex items-start gap-4">
                  <img
                    src={parsedPodcast.coverUrl}
                    alt={parsedPodcast.title}
                    className="w-16 h-16 rounded-xl object-cover border border-black/10 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-base font-bold">{parsedPodcast.title}</h4>
                    <p className="text-xs text-amber-600 font-semibold">{parsedPodcast.author}</p>
                    <p className={`text-xs line-clamp-2 mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {parsedPodcast.description}
                    </p>
                  </div>
                  <button
                    onClick={() => handleSubscribePodcast(parsedPodcast)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-xs hover:bg-emerald-400 transition cursor-pointer shrink-0 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>确认订阅该播客</span>
                  </button>
                </div>

                <div className={`text-xs pt-2 border-t flex items-center justify-between ${
                  isLight ? 'border-amber-200 text-zinc-600' : 'border-white/5 text-zinc-400'
                }`}>
                  <span>共检索到 {parsedPodcast.episodes.length} 集可在线播放单集</span>
                  <span className="font-mono text-[10px] opacity-75">{rssInputUrl}</span>
                </div>
              </div>
            )}
          </div>

          {/* Subscribed Podcasts & Episode Browser */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Subscriptions Column */}
            <div className="space-y-4">
              <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center justify-between ${
                isLight ? 'text-zinc-500' : 'text-zinc-400'
              }`}>
                <span>已订阅播客清单 ({podcasts.length})</span>
              </h3>

              {isLoadingPodcasts ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin text-amber-500 mx-auto mb-2" />
                  加载订阅列表中...
                </div>
              ) : podcasts.length === 0 ? (
                <div className={`py-12 text-center text-xs border border-dashed rounded-2xl ${
                  isLight ? 'bg-white border-zinc-200 text-zinc-500' : 'border-white/10 text-zinc-500'
                }`}>
                  暂未订阅播客，请在上方输入 RSS 地址解析添加
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {podcasts.map(pod => (
                    <div
                      key={pod.id}
                      onClick={() => handleViewPodcastEpisodes(pod)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        selectedPodcast?.rssUrl === pod.rssUrl
                          ? isLight
                            ? 'bg-amber-500 text-zinc-950 border-amber-400 font-semibold shadow-sm'
                            : 'bg-amber-500/10 border-amber-500/40 text-white'
                          : isLight
                            ? 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-800'
                            : 'bg-zinc-900/80 hover:bg-zinc-800 border-white/5 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={pod.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80'}
                          alt={pod.title}
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-black/10"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold truncate">{pod.title}</h4>
                          <p className={`text-[10px] truncate ${
                            selectedPodcast?.rssUrl === pod.rssUrl && isLight ? 'text-zinc-900/80' : 'text-zinc-500'
                          }`}>
                            {pod.author || '播客主播'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleUnsubscribePodcast(pod.id, pod.title);
                          }}
                          className={`p-1 transition cursor-pointer ${
                            selectedPodcast?.rssUrl === pod.rssUrl && isLight ? 'text-zinc-900 hover:text-rose-700' : 'text-zinc-400 hover:text-rose-500'
                          }`}
                          title="取消订阅"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 opacity-60" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Episode List Column */}
            <div className={`lg:col-span-2 p-5 rounded-2xl border space-y-4 ${
              isLight ? 'bg-white border-zinc-200/80 shadow-sm' : 'bg-zinc-900/60 border-white/10'
            }`}>
              {!selectedPodcast ? (
                <div className="py-24 text-center text-zinc-500 text-xs">
                  请在左侧选择一个已订阅的播客节目以浏览单集列表
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selected Podcast Header */}
                  <div className={`flex items-start gap-4 pb-4 border-b ${
                    isLight ? 'border-zinc-200' : 'border-white/10'
                  }`}>
                    <img
                      src={selectedPodcast.coverUrl}
                      alt={selectedPodcast.title}
                      className="w-16 h-16 rounded-xl object-cover border border-black/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-base font-bold ${isLight ? 'text-zinc-900' : 'text-white'}`}>{selectedPodcast.title}</h3>
                      <p className="text-xs text-amber-600 font-medium">{selectedPodcast.author}</p>
                      <p className={`text-xs line-clamp-2 mt-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        {selectedPodcast.description}
                      </p>
                    </div>
                  </div>

                  {/* Episodes Feed */}
                  <h4 className={`text-xs font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                    单集节目列表 ({selectedPodcast.episodes.length})
                  </h4>

                  {isLoadingEpisodes ? (
                    <div className="py-16 text-center text-zinc-500 text-xs">
                      <RefreshCw className="w-5 h-5 animate-spin text-amber-500 mx-auto mb-2" />
                      正在实时从 RSS 源更新节目单...
                    </div>
                  ) : selectedPodcast.episodes.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs">
                      该播客暂无可播单集
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {selectedPodcast.episodes.map(ep => (
                        <div
                          key={ep.id}
                          className={`p-3.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                            isLight
                              ? 'bg-zinc-50/80 hover:bg-amber-50/40 border-zinc-200/80'
                              : 'bg-zinc-950/80 hover:bg-zinc-950 border-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <h5 className={`text-xs font-bold line-clamp-1 ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                              {ep.title}
                            </h5>
                            <div className="flex items-center gap-3 text-[10px] text-zinc-500 mt-1">
                              <span>{ep.pubDate}</span>
                              {ep.duration && <span>{ep.duration}</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {/* Web Play */}
                            <button
                              onClick={() => handlePlayEpisodeInBrowser(ep, selectedPodcast.title)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                isLight ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                              }`}
                              title="网页试听"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>

                            {/* Cast Episode */}
                            <button
                              onClick={() => handleCastEpisodeToSpeaker(ep, selectedPodcast.title)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-xs font-semibold cursor-pointer ${
                                isLight
                                  ? 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                              }`}
                            >
                              <Cast className="w-3.5 h-3.5" />
                              <span>投播音箱</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- ADD CUSTOM STATION MODAL --- */}
      {isAddStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <RadioIcon className="w-5 h-5 text-amber-400" />
                <span>添加自定义网络电台</span>
              </h3>
              <button
                onClick={() => setIsAddStationModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddCustomStation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">电台名称 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如: Chillout Radio 99.1"
                  value={newStationName}
                  onChange={e => setNewStationName(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">音频直播流 URL (M3U8 / AAC / MP3) *</label>
                <input
                  type="url"
                  required
                  placeholder="http(s)://stream.example.com/live.m3u8"
                  value={newStationUrl}
                  onChange={e => setNewStationUrl(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">频率分类</label>
                <select
                  value={newStationCategory}
                  onChange={e => setNewStationCategory(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50"
                >
                  <option value="custom">自定义 (Custom)</option>
                  <option value="national">国家广播 (National)</option>
                  <option value="music">流行音乐 (Music)</option>
                  <option value="lofi">Lofi Chill (Lofi)</option>
                  <option value="classical">爵士古典 (Classical)</option>
                  <option value="news">资讯新闻 (News)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">电台描述简介</label>
                <textarea
                  rows={2}
                  placeholder="可填写播送地区、简介或频道特色..."
                  value={newStationDesc}
                  onChange={e => setNewStationDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500/50 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddStationModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingStation}
                  className="px-5 py-2 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer disabled:opacity-50"
                >
                  {isSavingStation ? '保存中...' : '保存电台'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
