import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  ChevronRight,
  RotateCcw,
  RotateCw,
  History,
  FastForward,
  Rewind
} from 'lucide-react';
import { XiaomiDevice, Song } from '../types';
import { apiFetch } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { usePlaybackTime, usePlaybackTimeActions } from '../context/PlaybackTimeContext';
import {
  getEpisodeProgress,
  savePodcastProgress,
  clearEpisodeProgress,
  getInProgressEpisodes,
  formatPodcastTime,
  isNewEpisode,
  PodcastEpisodeProgress
} from '../utils/podcastProgress';

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

  // Playback Context & Progress Tracking State
  const playbackTime = usePlaybackTime();
  const playbackActions = usePlaybackTimeActions();
  const [inProgressEpisodes, setInProgressEpisodes] = useState<PodcastEpisodeProgress[]>([]);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');

  const refreshProgress = useCallback(() => {
    setInProgressEpisodes(getInProgressEpisodes());
  }, []);

  useEffect(() => {
    refreshProgress();
  }, [subTab, refreshProgress]);

  // Auto-save progress when playing a podcast episode
  useEffect(() => {
    if (!currentSong || !playbackTime) return;
    if (currentSong.album === '播客单集' || currentSong.url.includes('/api/radio/proxy')) {
      if (playbackTime.currentTime > 2 && playbackTime.duration > 0) {
        savePodcastProgress({
          episodeId: currentSong.id,
          podcastTitle: currentSong.artist,
          episodeTitle: currentSong.title,
          audioUrl: currentSong.url,
          coverUrl: currentSong.coverUrl,
          currentTime: playbackTime.currentTime,
          duration: playbackTime.duration,
          lastPlayedAt: Date.now(),
          completed: false
        });
        refreshProgress();
      }
    }
  }, [currentSong, playbackTime?.currentTime, playbackTime?.duration, refreshProgress]);

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

  const PRESET_PODCASTS = [
    { title: '故事 FM', rssUrl: 'https://feeds.storyfm.cn/storyfm.xml', desc: '倾听普通人讲述真实故事' },
    { title: '声东击西', rssUrl: 'https://feeds.fireside.fm/shengdongjixi/rss', desc: '带你看世界的文化科技播客' },
    { title: '硅谷 101', rssUrl: 'https://feeds.fireside.fm/sv101/rss', desc: '深度解读前沿科技与商业' },
    { title: '半拿铁', rssUrl: 'https://proxy.wavpub.com/caffebreve.xml', desc: '商业沉浮录与趣味历史商业故事' },
    { title: '随机波动', rssUrl: 'https://feeds.fireside.fm/stovol/rss', desc: '泛文化类人文社科与女性视角对话' },
    { title: '文化有限', rssUrl: 'https://s1.proxy.wavpub.com/weknownothing.xml', desc: '每周分享一本好书与人生思考' },
    { title: '无聊斋', rssUrl: 'https://feed.xyzfm.space/njwyhpcjqn9t', desc: '幽默喜剧演员的走心对谈' },
    { title: 'TED Talks Daily', rssUrl: 'https://feeds.acast.com/public/shows/67587e77c705e441797aff96', desc: 'TED 每日精选演讲 (英文)' },
    { title: 'NPR Planet Money', rssUrl: 'https://feeds.npr.org/510289/podcast.xml', desc: 'NPR 经典商业经济解释学 (英文)' },
    { title: 'BBC Global News', rssUrl: 'https://podcasts.files.bbci.co.uk/p02nq0gn.rss', desc: 'BBC 国际环球要闻总览' }
  ];

  const handleParseRss = async (e?: React.FormEvent, directUrl?: string) => {
    if (e) e.preventDefault();
    let urlToUse = (directUrl || rssInputUrl || '').trim();
    if (!urlToUse) {
      setActionMessage({ text: '请填写或选择有效的播客 RSS 订阅 URL 地址', type: 'error' });
      return;
    }

    if (!/^https?:\/\//i.test(urlToUse)) {
      urlToUse = `https://${urlToUse}`;
    }

    setRssInputUrl(urlToUse);
    setIsParsingRss(true);
    setParsedPodcast(null);
    setActionMessage({ text: '正在连接并解析播客 RSS Feed 节点...', type: 'info' });

    try {
      const res = await apiFetch('/api/radio/podcasts/parse-rss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rssUrl: urlToUse })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.podcast) {
          setParsedPodcast(data.podcast);
          // 自动直接提交订阅
          await handleSubscribePodcast(data.podcast, urlToUse);
        } else {
          setActionMessage({ text: data.error || '解析 RSS 失败，请检查 URL 是否为有效的播客 Feed XML', type: 'error' });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setActionMessage({ text: errData.error || `请求 RSS 失败 (HTTP ${res.status})`, type: 'error' });
      }
    } catch (err: any) {
      setActionMessage({ text: `RSS 解析异常: ${err.message || '网络连接超时'}`, type: 'error' });
    } finally {
      setIsParsingRss(false);
    }
  };

  const handleSubscribePodcast = async (podData: any, customRssUrl?: string) => {
    const targetUrl = customRssUrl || rssInputUrl;
    try {
      const res = await apiFetch('/api/radio/podcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: podData.title,
          rssUrl: targetUrl,
          author: podData.author,
          description: podData.description,
          coverUrl: podData.coverUrl,
          link: podData.link,
          episodesCount: podData.episodes?.length || 0
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.podcast) {
          await fetchPodcasts();
          setParsedPodcast(null);
          setRssInputUrl('');
          setActionMessage({ text: `🎉 已成功订阅播客《${podData.title}》！检索到 ${podData.episodes?.length || 0} 集节目`, type: 'success' });
          // 自动展开单集列表
          setSelectedPodcast({
            title: podData.title,
            author: podData.author || '播客主播',
            description: podData.description || '',
            coverUrl: podData.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80',
            rssUrl: targetUrl,
            episodes: podData.episodes || []
          });
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

  const handlePlayEpisodeInBrowser = (ep: PodcastEpisode, podTitle: string, forceFromStart = false) => {
    const streamUrl = `/api/radio/proxy?url=${encodeURIComponent(ep.audioUrl)}`;
    const virtualSong: Song = {
      id: ep.id,
      title: ep.title,
      artist: podTitle,
      album: ep.pubDate || '播客单集',
      duration: 0,
      url: streamUrl,
      filePath: streamUrl,
      coverUrl: ep.coverUrl || selectedPodcast?.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80'
    };

    const savedProgress = getEpisodeProgress(ep.id);
    onPlaySongInBrowser(virtualSong);

    if (!forceFromStart && savedProgress && savedProgress.currentTime > 5 && !savedProgress.completed) {
      setTimeout(() => {
        if (playbackActions) {
          playbackActions.seekTo(savedProgress.currentTime);
        }
      }, 450);
      setActionMessage({
        text: `已恢复播放《${ep.title}》，自动跳转至 ${formatPodcastTime(savedProgress.currentTime)}`,
        type: 'success'
      });
    } else {
      if (forceFromStart) {
        clearEpisodeProgress(ep.id);
      }
      setActionMessage({ text: `正在播放播客单集: ${ep.title}`, type: 'success' });
    }
    refreshProgress();
  };

  const handlePlayEpisodeFromShelf = (prog: PodcastEpisodeProgress) => {
    const virtualSong: Song = {
      id: prog.episodeId,
      title: prog.episodeTitle,
      artist: prog.podcastTitle,
      album: '播客单集',
      duration: prog.duration,
      url: prog.audioUrl,
      filePath: prog.audioUrl,
      coverUrl: prog.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300&auto=format&fit=crop&q=80'
    };

    onPlaySongInBrowser(virtualSong);
    setTimeout(() => {
      if (playbackActions) {
        playbackActions.seekTo(prog.currentTime);
      }
    }, 450);
    setActionMessage({
      text: `已续播《${prog.episodeTitle}》，已播放至 ${formatPodcastTime(prog.currentTime)} / ${formatPodcastTime(prog.duration)}`,
      type: 'success'
    });
  };

  const handleJumpTime = (seconds: number) => {
    if (!playbackTime || !playbackActions) return;
    const newTime = Math.max(0, Math.min(playbackTime.currentTime + seconds, playbackTime.duration));
    playbackActions.seekTo(newTime);
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

  // Filter podcast episodes by search query
  const filteredPodcastEpisodes = useMemo(() => {
    if (!selectedPodcast?.episodes) return [];
    if (!episodeSearchQuery.trim()) return selectedPodcast.episodes;
    const q = episodeSearchQuery.toLowerCase();
    return selectedPodcast.episodes.filter(ep =>
      ep.title.toLowerCase().includes(q) || (ep.description || '').toLowerCase().includes(q)
    );
  }, [selectedPodcast?.episodes, episodeSearchQuery]);

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
                实时解构 AAC/M3U8 广播音频流，聚合全球播客 RSS 节点。独立通道播控，不打乱音乐队列，支持一键无损投播
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

          {/* Podcast Mini Jump Controller when actively listening to a podcast episode */}
          {currentSong && (currentSong.album === '播客单集' || currentSong.url.includes('/api/radio/proxy')) && (
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-md ${
              isLight ? 'bg-amber-50 border-amber-300 text-zinc-900' : 'bg-zinc-900/90 border-amber-500/40 text-white'
            }`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Headphones className="w-4 h-4 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">正在收听播客</p>
                  <p className="text-xs font-bold truncate">{currentSong.title}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleJumpTime(-15)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isLight ? 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800' : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-200'
                  }`}
                  title="快退 15 秒"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>-15s</span>
                </button>
                <button
                  onClick={() => handleJumpTime(30)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                    isLight ? 'bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800' : 'bg-zinc-800 hover:bg-zinc-700 border-white/10 text-zinc-200'
                  }`}
                  title="快进 30 秒"
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-500" />
                  <span>+30s</span>
                </button>
              </div>
            </div>
          )}

          {/* Continue Listening Resume Shelf */}
          {inProgressEpisodes.length > 0 && (
            <div className={`p-5 rounded-2xl border space-y-3.5 backdrop-blur-md ${
              isLight ? 'bg-amber-50/60 border-amber-300/80 shadow-sm' : 'bg-zinc-900/90 border-amber-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isLight ? 'text-amber-900' : 'text-amber-300'
                }`}>
                  <History className="w-4 h-4 text-amber-500 animate-pulse" />
                  <span>播客断点续播 • 接着收听 ({inProgressEpisodes.length})</span>
                </h3>
                <button
                  onClick={() => {
                    if (window.confirm('确定要清空所有播客断点续播记录吗？')) {
                      localStorage.removeItem('tinglan_podcast_progress_v1');
                      refreshProgress();
                    }
                  }}
                  className="text-[11px] text-zinc-400 hover:text-rose-400 transition cursor-pointer"
                >
                  清空记录
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inProgressEpisodes.slice(0, 3).map((prog) => {
                  const percent = Math.min(100, Math.round((prog.currentTime / prog.duration) * 100));
                  return (
                    <div
                      key={prog.episodeId}
                      className={`p-3.5 rounded-xl border transition flex flex-col justify-between gap-3 ${
                        isLight ? 'bg-white border-amber-200 hover:border-amber-400 shadow-xs' : 'bg-zinc-950/90 border-white/10 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <img
                          src={prog.coverUrl || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=150&auto=format&fit=crop&q=80'}
                          alt={prog.episodeTitle}
                          className="w-11 h-11 rounded-lg object-cover border border-black/10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className={`text-xs font-bold line-clamp-1 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            {prog.episodeTitle}
                          </h4>
                          <p className="text-[10px] text-amber-600 font-semibold truncate mt-0.5">{prog.podcastTitle}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                            进度 {percent}% ({formatPodcastTime(prog.currentTime)} / {formatPodcastTime(prog.duration)})
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-500 h-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-0.5">
                        <button
                          onClick={() => {
                            clearEpisodeProgress(prog.episodeId);
                            refreshProgress();
                          }}
                          className="text-[10px] text-zinc-400 hover:text-rose-500 transition cursor-pointer"
                        >
                          移除此记录
                        </button>
                        <button
                          onClick={() => handlePlayEpisodeFromShelf(prog)}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs hover:bg-amber-400 transition cursor-pointer shadow-xs"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>继续播放</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                type="text"
                required
                placeholder="粘贴播客 RSS XML 或小宇宙链接 (如: feed.xyzfm.space/v3epqfvw8 或 xiaoyuzhoufm.com/podcast/...)"
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
                    <span>正在解析与拉取 XML...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>解析并一键订阅</span>
                  </>
                )}
              </button>
            </form>

            {/* Popular Public Podcasts Preset Chips */}
            <div className="pt-2">
              <p className={`text-[11px] font-semibold mb-2 flex items-center gap-1.5 ${
                isLight ? 'text-zinc-500' : 'text-zinc-400'
              }`}>
                <span>💡 热门公共播客一键订阅推荐：</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_PODCASTS.map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    disabled={isParsingRss}
                    onClick={() => handleParseRss(undefined, preset.rssUrl)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      isLight
                        ? 'bg-zinc-100 hover:bg-amber-100 hover:border-amber-300 text-zinc-800 border-zinc-200/80'
                        : 'bg-zinc-950 hover:bg-amber-500/20 hover:border-amber-500/40 text-zinc-300 border-white/10'
                    }`}
                    title={preset.desc}
                  >
                    <Plus className="w-3 h-3 text-amber-500" />
                    <span className="font-bold">{preset.title}</span>
                  </button>
                ))}
              </div>
            </div>

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

                  {/* Episodes Feed Header with Search */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                    <h4 className={`text-xs font-bold ${isLight ? 'text-zinc-700' : 'text-zinc-300'}`}>
                      单集节目列表 ({filteredPodcastEpisodes.length})
                    </h4>
                    <div className="relative w-full sm:w-56">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="搜索本播客单集..."
                        value={episodeSearchQuery}
                        onChange={e => setEpisodeSearchQuery(e.target.value)}
                        className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border transition focus:outline-none ${
                          isLight
                            ? 'bg-zinc-100 border-zinc-300 text-zinc-900 focus:border-amber-500 focus:bg-white'
                            : 'bg-zinc-950 border-white/10 text-zinc-200 focus:border-amber-500'
                        }`}
                      />
                      {episodeSearchQuery && (
                        <button
                          onClick={() => setEpisodeSearchQuery('')}
                          className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {isLoadingEpisodes ? (
                    <div className="py-16 text-center text-zinc-500 text-xs">
                      <RefreshCw className="w-5 h-5 animate-spin text-amber-500 mx-auto mb-2" />
                      正在实时从 RSS 源更新节目单...
                    </div>
                  ) : filteredPodcastEpisodes.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs border border-dashed rounded-xl border-white/10">
                      {episodeSearchQuery ? '未查找到包含匹配关键字的单集' : '该播客暂无可播单集'}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                      {filteredPodcastEpisodes.map(ep => {
                        const prog = getEpisodeProgress(ep.id);
                        const isNew = isNewEpisode(ep.pubDate);
                        const hasProgress = prog && prog.currentTime > 5 && !prog.completed;
                        const isFinished = prog && prog.completed;
                        const pct = prog && prog.duration ? Math.min(100, Math.round((prog.currentTime / prog.duration) * 100)) : 0;

                        return (
                          <div
                            key={ep.id}
                            className={`p-3.5 rounded-xl border transition flex flex-col gap-2.5 ${
                              isLight
                                ? 'bg-zinc-50/80 hover:bg-amber-50/40 border-zinc-200/80'
                                : 'bg-zinc-950/80 hover:bg-zinc-950 border-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  {isFinished && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />
                                      已听完
                                    </span>
                                  )}
                                  {hasProgress && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      在听 {pct}% ({formatPodcastTime(prog.currentTime)})
                                    </span>
                                  )}
                                  {isNew && !isFinished && !hasProgress && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold flex items-center gap-1">
                                      <Sparkles className="w-3 h-3" />
                                      最新单集
                                    </span>
                                  )}
                                  <h5 className={`text-xs font-bold line-clamp-1 ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                                    {ep.title}
                                  </h5>
                                </div>

                                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                                  <span>{ep.pubDate}</span>
                                  {ep.duration && <span>时长 {ep.duration}</span>}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Restart From Beginning if in progress */}
                                {(hasProgress || isFinished) && (
                                  <button
                                    onClick={() => handlePlayEpisodeInBrowser(ep, selectedPodcast.title, true)}
                                    className={`p-1.5 rounded-lg transition cursor-pointer text-[10px] font-semibold flex items-center gap-1 ${
                                      isLight ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                    }`}
                                    title="从头重新播放"
                                  >
                                    <RotateCcw className="w-3 h-3 text-amber-500" />
                                    <span className="hidden sm:inline">从头听</span>
                                  </button>
                                )}

                                {/* Web Play / Resume */}
                                <button
                                  onClick={() => handlePlayEpisodeInBrowser(ep, selectedPodcast.title)}
                                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                                    hasProgress
                                      ? 'bg-amber-500 text-zinc-950 shadow-sm hover:bg-amber-400'
                                      : isLight ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-800' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                                  }`}
                                  title={hasProgress ? '断点续播' : '网页试听'}
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>{hasProgress ? '续播' : '试听'}</span>
                                </button>

                                {/* Cast Episode */}
                                <button
                                  onClick={() => handleCastEpisodeToSpeaker(ep, selectedPodcast.title)}
                                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition text-xs font-semibold cursor-pointer ${
                                    isLight
                                      ? 'bg-amber-500/20 text-amber-900 border border-amber-300 hover:bg-amber-500/30'
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
                                  }`}
                                  title={`投播至 ${activeDevice?.name || '小爱音箱'}`}
                                >
                                  <Cast className="w-3.5 h-3.5" />
                                  <span>投播</span>
                                </button>
                              </div>
                            </div>

                            {/* Episode Progress Bar */}
                            {pct > 0 && (
                              <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden mt-0.5">
                                <div
                                  className={`h-full transition-all duration-300 ${isFinished ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
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
