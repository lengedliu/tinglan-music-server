import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { PlayerBar } from './components/PlayerBar';
import { MusicLibrary } from './components/MusicLibrary';
import { LyricsView } from './components/LyricsView';
import { XiaomiSpeakerPanel } from './components/XiaomiSpeakerPanel';
import { UploadSongModal } from './components/UploadSongModal';
import { AudioEqualizerModal } from './components/AudioEqualizerModal';
import { PlayQueueDrawer } from './components/PlayQueueDrawer';
import { SubsonicDashboardModal } from './components/SubsonicDashboardModal';
import { SubsonicServerView } from './components/SubsonicServerView';
import { NavidromeModal } from './components/NavidromeModal';
import { AuthModal } from './components/AuthModal';
import { SettingsPage } from './components/SettingsPage';
import { SponsorPage } from './components/SponsorPage';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { useTheme } from './context/ThemeContext';
import { Song, Playlist, XiaomiDevice, MiotConfig, CastLog, User, SecurityStatus, DeviceCommandState } from './types';
import { INITIAL_SONGS, INITIAL_PLAYLISTS, INITIAL_XIAOMI_DEVICES } from './data/mockSongs';
import { apiFetch, setStoredAuthToken, getAuthToken } from './utils/api';
import { CheckCircle2, AlertCircle, Radio, X } from 'lucide-react';

export default function App() {
  const { themeConfig, isThemeModalOpen, setIsThemeModalOpen } = useTheme();

  // User Auth & Database States
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('tinglan_auth_token');
    } catch {
      return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);

  // Navigation: 音乐曲库, 歌词播放, 智能音箱, Subsonic API, 设置, 赞助
  const [activeTab, setActiveTab] = useState<'library' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings' | 'sponsor'>(() => {
    try {
      const saved = localStorage.getItem('tinglan_active_tab');
      return (saved === 'library' || saved === 'lyrics' || saved === 'xiaomi' || saved === 'subsonic' || saved === 'settings' || saved === 'sponsor') ? saved : 'library';
    } catch {
      return 'library';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('tinglan_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  // Music state
  const [songs, setSongs] = useState<Song[]>(INITIAL_SONGS);
  const [playQueue, setPlayQueue] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem('tinglan_play_queue');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse tinglan_play_queue from localStorage', e);
    }
    return INITIAL_SONGS;
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(INITIAL_PLAYLISTS);
  const [currentSong, setCurrentSong] = useState<Song | null>(() => {
    try {
      const savedSong = localStorage.getItem('tinglan_current_song');
      if (savedSong !== null) {
        return JSON.parse(savedSong);
      }
      const savedQueue = localStorage.getItem('tinglan_play_queue');
      if (savedQueue !== null) {
        const q = JSON.parse(savedQueue);
        if (Array.isArray(q)) {
          return q.length > 0 ? q[0] : null;
        }
      }
    } catch (e) {
      console.warn('Failed to parse tinglan_current_song from localStorage', e);
    }
    return INITIAL_SONGS[0] || null;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(() => {
    try {
      const savedSong = localStorage.getItem('tinglan_current_song');
      if (savedSong) {
        const s = JSON.parse(savedSong);
        if (s?.duration) return s.duration;
      }
    } catch {}
    return INITIAL_SONGS[0]?.duration || 234;
  });
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem('tinglan_volume');
      if (v !== null) return Number(v);
    } catch {}
    return 0.75;
  });
  const [isShuffle, setIsShuffle] = useState(() => {
    try {
      return localStorage.getItem('tinglan_is_shuffle') === 'true';
    } catch {}
    return false;
  });
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>(() => {
    try {
      const m = localStorage.getItem('tinglan_repeat_mode');
      if (m === 'all' || m === 'one' || m === 'off') return m;
    } catch {}
    return 'all';
  });

  // Xiaomi Speaker & MIoT state
  const [devices, setDevices] = useState<XiaomiDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [isCasting, setIsCasting] = useState<boolean>(() => {
    try {
      return localStorage.getItem('tinglan_is_casting') === 'true';
    } catch {}
    return false;
  });

  // UI Command State: strictly decoupled from physical Device State
  const [commandState, setCommandState] = useState<DeviceCommandState>({
    status: 'idle'
  });
  const [miotConfig, setMiotConfig] = useState<MiotConfig>({
    miUser: '',
    isLoggedIn: false,
    serverHost: typeof window !== 'undefined' ? window.location.origin : '',
    activeDeviceId: '',
    autoCast: false,
    ttsAnnouncement: true,
    ttsPrefix: '正在为您播放',
    volumeSync: true
  });
  const [castLogs, setCastLogs] = useState<CastLog[]>([]);

  // Modals & UI helpers
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEQModalOpen, setIsEQModalOpen] = useState(false);
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);
  const [isSubsonicModalOpen, setIsSubsonicModalOpen] = useState(false);
  const [isNavidromeModalOpen, setIsNavidromeModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ id: number; title: string; desc?: string; type: 'success' | 'info' | 'error'; duration?: number } | null>(null);

  // Auto-dismiss toast notification:
  // Operation success (and info) cards automatically close after 3 seconds
  useEffect(() => {
    if (!toastMessage) return;

    const delay = toastMessage.duration ?? (toastMessage.type === 'error' ? 5000 : 3000);
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, delay);

    return () => clearTimeout(timer);
  }, [toastMessage?.id]);

  // Keep command status banner and failure prompt persistent until manual dismissal

  const fetchSongsFromBackend = () => {
    apiFetch('/api/songs')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSongs(data);
        }
      })
      .catch(() => {});
  };

  // Audio Reference
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeDevice = devices.find(d => d.did === activeDeviceId) || devices[0];

  const showToast = (title: string, desc?: string, type: 'success' | 'info' | 'error' = 'success', durationMs?: number) => {
    setToastMessage({
      id: Date.now() + Math.random(),
      title,
      desc,
      type,
      duration: durationMs ?? (type === 'error' ? 5000 : 3000)
    });
  };

  const loadAllAppData = () => {
    // 1. Fetch MIoT Config
    apiFetch('/api/miot/config')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setMiotConfig(prev => ({ ...prev, ...data }));
          if (data.activeDeviceId) setActiveDeviceId(data.activeDeviceId);
        }
      })
      .catch(() => {});

    // 2. Fetch Devices
    apiFetch('/api/miot/devices')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data)) {
          setDevices(data);
        }
      })
      .catch(() => {});

    // 3. Fetch Songs from backend storage
    apiFetch('/api/songs')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setSongs(data);
        }
      })
      .catch(() => {});

    // 4. Fetch Playlists from backend storage
    apiFetch('/api/playlists')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setPlaylists(data);
        }
      })
      .catch(() => {});

    // 5. Fetch Logs
    apiFetch('/api/miot/logs')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data)) {
          setCastLogs(data);
        }
      })
      .catch(() => {});

    // 6. Fetch active Queue from backend queueEngine & hydrate state
    apiFetch('/api/queue')
      .then(res => res.ok ? res.json() : null)
      .then(resData => {
        if (!resData) return;
        const status = resData.data || resData;
        if (status) {
          if (status.isPlaying) {
            setIsCasting(true);
            setIsPlaying(true);
            if (status.currentSong) {
              setCurrentSong(status.currentSong);
              setDuration(status.currentSong.duration || 200);
            }
            if (typeof status.elapsedSeconds === 'number' && status.elapsedSeconds >= 0) {
              setCurrentTime(status.elapsedSeconds);
            }
            if (status.queue && status.queue.length > 0) {
              setPlayQueue(status.queue);
            }
            if (status.targetDid) {
              setActiveDeviceId(status.targetDid);
            }
            if (status.loopMode) {
              if (status.loopMode === 'shuffle') setIsShuffle(true);
              else if (status.loopMode === 'one' || status.loopMode === 'all') setRepeatMode(status.loopMode);
            }
          } else if (status.queue && status.queue.length > 0) {
            // Even if paused, if backend has a casted queue and client had no custom queue saved:
            const localSaved = localStorage.getItem('tinglan_play_queue');
            if (localSaved === null) {
              setPlayQueue(status.queue);
              if (status.currentSong) setCurrentSong(status.currentSong);
            }
          }
        }
      })
      .catch(() => {});
  };

  const checkSecurityStatus = async () => {
    try {
      const res = await apiFetch('/api/auth/status');
      if (res.ok) {
        const data: SecurityStatus = await res.json();
        setSecurityStatus(data);
        // If security protection is active for this client and user is not logged in, enforce the blocking login modal
        const currentToken = getAuthToken();
        if (data.authRequired && !currentToken) {
          setIsAuthModalOpen(true);
        } else if (currentToken) {
          setIsAuthModalOpen(false);
        }
      }
    } catch (e) {
      console.warn('Could not check security status', e);
    }
  };

  // Initial Fetch and Security Check on mount
  useEffect(() => {
    checkSecurityStatus();
    loadAllAppData();

    const handleUnauthorized = (e: any) => {
      const url = e?.detail?.url || '';
      if (url.includes('/api/auth/me')) {
        setStoredAuthToken(null);
        setAuthToken(null);
        setUser(null);
        return;
      }
      showToast('需要登录', '该操作需要管理员登录授权，请先登录系统', 'info');
      setIsAuthModalOpen(true);
    };

    window.addEventListener('tinglan_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('tinglan_unauthorized', handleUnauthorized);
    };
  }, []);

  // Fetch Current Logged-in User Profile
  useEffect(() => {
    if (authToken) {
      apiFetch('/api/auth/me')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data && data.success && data.user) {
            setUser(data.user);
          } else {
            setStoredAuthToken(null);
            setAuthToken(null);
            setUser(null);
          }
        })
        .catch(() => {});
    }
  }, [authToken]);

  const handleLoginSuccess = (newUser: User, token: string) => {
    setUser(newUser);
    setAuthToken(token);
    setStoredAuthToken(token);
    setIsAuthModalOpen(false);
    showToast('登录成功', `欢迎，${newUser.username} (${newUser.role === 'admin' ? '管理员' : '普通会员'})`, 'success');
    loadAllAppData();
    checkSecurityStatus();
  };

  const handleLogout = () => {
    setUser(null);
    setAuthToken(null);
    setStoredAuthToken(null);
    setIsAuthModalOpen(false);
    showToast('已退出登录', '随时可以重新登录管理个人云曲库与数据库', 'info');
    checkSecurityStatus();
  };


  // Persist play queue & playback preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tinglan_play_queue', JSON.stringify(playQueue));
    } catch {}
  }, [playQueue]);

  useEffect(() => {
    try {
      if (currentSong) {
        localStorage.setItem('tinglan_current_song', JSON.stringify(currentSong));
      } else {
        localStorage.removeItem('tinglan_current_song');
      }
    } catch {}
  }, [currentSong]);

  useEffect(() => {
    try {
      localStorage.setItem('tinglan_is_casting', String(isCasting));
    } catch {}
  }, [isCasting]);

  useEffect(() => {
    try {
      localStorage.setItem('tinglan_volume', String(volume));
    } catch {}
  }, [volume]);

  useEffect(() => {
    try {
      localStorage.setItem('tinglan_is_shuffle', String(isShuffle));
    } catch {}
  }, [isShuffle]);

  useEffect(() => {
    try {
      localStorage.setItem('tinglan_repeat_mode', repeatMode);
    } catch {}
  }, [repeatMode]);

  // Sync audio element volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Active synchronization with speaker queueEngine
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      apiFetch('/api/queue')
        .then(res => res.json())
        .then(resData => {
          if (!isMounted || !resData) return;
          const status = resData.data || resData;
          if (status && status.isPlaying) {
            if (!isCasting) {
              setIsCasting(true);
            }
            if (!isPlaying) {
              setIsPlaying(true);
            }
            if (status.currentSong && status.currentSong.id !== currentSong?.id) {
              setCurrentSong(status.currentSong);
              setDuration(status.currentSong.duration || 200);
            }
            if (typeof status.elapsedSeconds === 'number' && status.elapsedSeconds >= 0) {
              setCurrentTime(status.elapsedSeconds);
            }
            if (status.queue && status.queue.length > 0) {
              setPlayQueue(prev => {
                if (prev.length === status.queue.length && prev.every((s, i) => s.id === status.queue[i]?.id)) {
                  return prev;
                }
                return status.queue;
              });
            }
          }
        })
        .catch(() => {});
    }, isCasting ? 2000 : (isQueueDrawerOpen ? 3000 : 8000));

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isCasting, isPlaying, isQueueDrawerOpen, currentSong?.id]);

  // Audio event handlers
  const handlePlayPause = () => {
    if (!currentSong) {
      if (playQueue.length > 0) {
        handlePlaySong(playQueue[0]);
      } else if (songs.length > 0) {
        handlePlaySong(songs[0]);
      } else {
        showToast('曲库为空', '请先在曲库中导入或添加歌曲', 'info');
      }
      return;
    }

    if (isCasting) {
      // Clean Speaker Output Logic: route commands exclusively to Xiaomi Speaker
      if (isPlaying) {
        setIsPlaying(false);
        if (activeDevice) {
          handleControlDevice(activeDevice.did, 'pause');
          apiFetch('/api/queue/pause', { method: 'POST' }).catch(() => {});
        }
      } else {
        setIsPlaying(true);
        if (activeDevice) {
          apiFetch('/api/queue/resume', { method: 'POST' }).catch(() => {});
          handleControlDevice(activeDevice.did, 'play');
        }
      }
    } else {
      // Clean Local Playback Logic: route exclusively to browser HTML5 Audio
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
        audioRef.current?.play().catch(() => {});
      }
    }
  };

  const handlePlaySong = (song: Song, targetQueue?: Song[]) => {
    setCurrentSong(song);
    setCurrentTime(0);
    setDuration(song.duration);

    if (targetQueue && targetQueue.length > 0) {
      setPlayQueue(targetQueue);
    } else {
      setPlayQueue(prev => {
        if (prev.some(s => s.id === song.id)) return prev;
        return [...prev, song];
      });
    }

    if (isCasting) {
      // In Speaker Cast Mode: pause local audio completely and cast to Xiaomi Speaker
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(true);
      castSongToDevice(song, activeDevice);
    } else {
      // In Local Playback Mode: load and play HTML5 audio directly
      const playSrc = (song.url && !song.url.includes('pixabay')) ? song.url : `/api/stream/${song.id}`;
      if (audioRef.current) {
        audioRef.current.src = playSrc;
        audioRef.current.play().catch(e => {
          console.warn('Audio play request error:', e);
        });
      }
      setIsPlaying(true);

      // If user enabled autoCast, switch to casting
      if (miotConfig.autoCast) {
        setIsCasting(true);
        if (audioRef.current) audioRef.current.pause();
        castSongToDevice(song, activeDevice);
      }
    }
  };

  const handlePlayAll = (targetSongs: Song[], startIndex: number = 0, autoCastToSpeaker?: boolean) => {
    if (!targetSongs || targetSongs.length === 0) {
      showToast('播放列表为空', '请先添加或筛选歌曲', 'info');
      return;
    }

    setPlayQueue(targetSongs);
    const startSong = targetSongs[startIndex] || targetSongs[0];

    const shouldCast = autoCastToSpeaker || isCasting || miotConfig.autoCast;

    if (shouldCast) {
      setIsCasting(true);
      // Ensure continuous playlist loop unless user explicitly selected 'one'
      const queueMode = isShuffle ? 'shuffle' : repeatMode === 'one' ? 'one' : 'all';

      setCurrentSong(startSong);
      setCurrentTime(0);
      setDuration(startSong.duration || 200);
      setIsPlaying(true);

      // Mute/pause browser audio so it does not double-play or trigger onEnded conflicts
      if (audioRef.current) {
        audioRef.current.pause();
      }

      apiFetch('/api/queue/play-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songs: targetSongs,
          startIndex,
          did: activeDevice?.did,
          mode: queueMode
        })
      }).then(res => res.json()).then(data => {
        if (data && data.success) {
          showToast('已启动全歌单连续投播', `已向【${activeDevice?.name || '小爱音箱'}】下发全歌单 (${targetSongs.length} 首) 智能连播`, 'success');
        } else {
          showToast('全歌单投播提示', data?.message || data?.error || '投播指令已发送', 'info');
        }
      }).catch(err => {
        console.warn('Play-all queue request error:', err);
      });
    } else {
      handlePlaySong(startSong, targetSongs);
      showToast('开始播放列表全部', `已将 ${targetSongs.length} 首歌曲载入播放队列`, 'success');
    }
  };

  const handleCastAllToXiaomi = (targetSongs: Song[]) => {
    if (!activeDevice) {
      showToast('请先选择目标音箱', '可在上方“智能音箱”选项卡中扫描或选择小米音箱', 'error');
      return;
    }
    handlePlayAll(targetSongs, 0, true);
  };

  const handleNextSong = () => {
    const queue = playQueue.length > 0 ? playQueue : songs;
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
    let nextIndex = 0;

    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = (currentIndex + 1) % queue.length;
    }

    const nextSong = queue[nextIndex];

    if (isCasting) {
      // Route 'Next' directly to Speaker Queue Engine
      setCurrentSong(nextSong);
      setCurrentTime(0);
      setDuration(nextSong.duration || 200);
      setIsPlaying(true);
      if (audioRef.current) audioRef.current.pause();
      apiFetch('/api/queue/next', { method: 'POST' }).catch(() => {});
      castSongToDevice(nextSong, activeDevice);
    } else {
      // Route 'Next' to local browser audio
      handlePlaySong(nextSong, queue);
    }
  };

  const handlePrevSong = () => {
    const queue = playQueue.length > 0 ? playQueue : songs;
    if (queue.length === 0) return;
    const currentIndex = queue.findIndex(s => s.id === currentSong?.id);
    let prevIndex = 0;

    if (currentTime > 3) {
      // If played for more than 3 seconds, restart current track
      setCurrentTime(0);
      if (isCasting) {
        if (activeDevice) {
          handleControlDevice(activeDevice.did, 'seek', 0);
        }
      } else {
        if (audioRef.current) audioRef.current.currentTime = 0;
      }
      return;
    }

    if (isShuffle) {
      prevIndex = Math.floor(Math.random() * queue.length);
    } else {
      prevIndex = (currentIndex - 1 + queue.length) % queue.length;
    }

    const prevSong = queue[prevIndex];

    if (isCasting) {
      // Route 'Prev' directly to Speaker Queue Engine
      setCurrentSong(prevSong);
      setCurrentTime(0);
      setDuration(prevSong.duration || 200);
      setIsPlaying(true);
      if (audioRef.current) audioRef.current.pause();
      apiFetch('/api/queue/prev', { method: 'POST' }).catch(() => {});
      castSongToDevice(prevSong, activeDevice);
    } else {
      // Route 'Prev' to local browser audio
      handlePlaySong(prevSong, queue);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (isCasting) {
      // Route Seek exclusively to Xiaomi Speaker
      if (activeDevice) {
        handleControlDevice(activeDevice.did, 'seek', Math.floor(time));
      }
    } else {
      // Route Seek to local HTML5 Audio
      if (audioRef.current) {
        audioRef.current.currentTime = time;
      }
    }
  };

  const handleCycleRepeat = () => {
    setRepeatMode(prev => {
      const nextMode = prev === 'off' ? 'all' : prev === 'all' ? 'one' : 'off';
      if (isCasting && activeDevice) {
        const queueMode = isShuffle ? 'shuffle' : nextMode === 'one' ? 'one' : 'all';
        apiFetch('/api/queue/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: queueMode })
        }).catch(() => {});
      }
      return nextMode;
    });
  };

  // Casting Logic to Xiaomi Speaker
  const castSongToDevice = (song: Song, targetDev: XiaomiDevice | undefined) => {
    const dev = targetDev || activeDevice;
    if (!dev) {
      showToast('未找到可用小米音箱', '请先配置或扫描局域网音箱设备', 'error');
      return;
    }

    const nowStr = new Date().toLocaleTimeString();
    const initialStages = [
      { stage: 'COMMAND_SENT' as const, label: '指令发送成功', success: true, active: false, timestamp: nowStr },
      { stage: 'DEVICE_ACK' as const, label: '音箱握据确认', success: false, active: true, timestamp: nowStr },
      { stage: 'STREAM_CONNECTED' as const, label: '音频流建立连接', success: false, active: false, timestamp: nowStr },
      { stage: 'PLAYING' as const, label: '正在高保真播放', success: false, active: false, timestamp: nowStr }
    ];

    // UI State: Command is now pending, awaiting speaker hardware confirmation
    setCommandState({
      status: 'pending',
      action: 'cast',
      targetDid: dev.did,
      timestamp: Date.now(),
      castingStage: 'COMMAND_SENT',
      stageHistory: initialStages
    });

    const cleanId = song.id.replace(/\.(mp3|flac|wav|m4a|aac|ogg|opus|ape)$/i, '');
    const streamBase = miotConfig.serverHost && miotConfig.serverHost.startsWith('http')
      ? miotConfig.serverHost.replace(/\/$/, '')
      : window.location.origin;
    const streamUrl = `${streamBase}/api/stream/${encodeURIComponent(cleanId)}.mp3`;

    // 25-second timeout controller to allow full DLNA/miIO/Cloud multi-track fallback
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 25000);

    apiFetch('/api/miot/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        did: dev.did,
        songId: song.id,
        songTitle: song.title,
        songArtist: song.artist,
        duration: song.duration,
        streamUrl
      }),
      signal: controller.signal
    })
      .then(async res => {
        clearTimeout(timeoutTimer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || `音箱投播响应失败 (HTTP ${res.status})`);
        }
        return data;
      })
      .then(data => {
        const doneStr = new Date().toLocaleTimeString();
        const successStages = data.stages || [
          { stage: 'COMMAND_SENT', label: '指令发送成功', success: true, timestamp: doneStr },
          { stage: 'DEVICE_ACK', label: '音箱云端/局域网已响应', success: true, timestamp: doneStr },
          { stage: 'STREAM_CONNECTED', label: '等待音箱拉流', success: false, pending: true, timestamp: doneStr },
          { stage: 'PLAYING', label: '等待音箱解码播放', success: false, pending: true, timestamp: doneStr }
        ];

        // UI State -> reflect real command delivery
        setCommandState({
          status: 'success',
          action: 'cast',
          targetDid: dev.did,
          timestamp: Date.now(),
          castingStage: 'COMMAND_SENT',
          stageHistory: successStages
        });

        // Device State: strictly updated based on verified server device response
        if (data.device) {
          setDevices(prev => prev.map(d => d.did === dev.did ? data.device : d));
          setIsCasting(Boolean(data.device.status?.playing));
        } else {
          setIsCasting(true);
        }

        if (data.warning) {
          showToast(
            `指令已向【${dev.name}】下发（请注意）`,
            data.warning,
            'info'
          );
        } else {
          showToast(
            `已向【${dev.name}】下发播放指令`,
            data.message || `指令已被接收，正在等待音箱连接音频流 (${song.title})`,
            'success'
          );
        }

        // Add local log with full stream URL and device details
        setCastLogs(prev => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'cast',
            message: `已下发投播指令到【${dev.name}】`,
            detail: `曲目: ${song.title} | 串流源: ${data.streamUrl || streamUrl}`,
            success: true,
            streamUrl: data.streamUrl || streamUrl,
            did: dev.did,
            ip: dev.ip,
            model: dev.model,
            protocol: data.dlnaResult?.success ? 'DLNA LAN' : (data.localMiioResult?.success ? 'miIO LAN' : 'MIoT Cloud'),
            httpStatus: 200,
            responseTimeMs: data.responseTimeMs || 15
          },
          ...prev
        ]);

        // Re-sync authoritative diagnostic logs from server
        apiFetch('/api/miot/logs')
          .then(res => res.ok ? res.json() : null)
          .then(serverLogs => {
            if (Array.isArray(serverLogs) && serverLogs.length > 0) {
              setCastLogs(serverLogs);
            }
          })
          .catch(() => {});

        // Actively monitor whether the speaker hardware connects and fetches the audio stream
        const castStartTime = Date.now();
        const checkInterval = setInterval(async () => {
          try {
            const statusRes = await apiFetch('/api/miot/stream-status');
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              if (statusData.lastSpeakerStream && statusData.lastSpeakerStream.timeMs >= castStartTime - 1000) {
                clearInterval(checkInterval);
                const ackTime = new Date().toLocaleTimeString();
                setCommandState({
                  status: 'success',
                  action: 'cast',
                  targetDid: dev.did,
                  timestamp: Date.now(),
                  castingStage: 'PLAYING',
                  stageHistory: [
                    { stage: 'COMMAND_SENT', label: '指令发送成功', success: true, timestamp: doneStr },
                    { stage: 'DEVICE_ACK', label: '音箱已确认接收', success: true, timestamp: doneStr },
                    { stage: 'STREAM_CONNECTED', label: '音箱已成功拉取音频流', success: true, timestamp: ackTime },
                    { stage: 'PLAYING', label: '音箱正在播放', success: true, timestamp: ackTime }
                  ]
                });
                showToast(
                  `音箱已成功拉流播放`,
                  `【${dev.name}】已成功连接音频流并开始播放《${song.title}》`,
                  'success'
                );
                return;
              }
            }
          } catch {
            // non-blocking
          }

          if (Date.now() - castStartTime > 8000) {
            clearInterval(checkInterval);
            setCommandState(prev => {
              if (prev.action !== 'cast' || prev.targetDid !== dev.did) return prev;
              return {
                ...prev,
                castingStage: 'DEVICE_ACK',
                stageHistory: [
                  { stage: 'COMMAND_SENT', label: '指令发送成功', success: true, timestamp: doneStr },
                  { stage: 'DEVICE_ACK', label: '音箱已接单确认', success: true, timestamp: doneStr },
                  { stage: 'STREAM_CONNECTED', label: '未检测到音箱拉流', success: false, detail: '若音箱无声，请检查【串流地址】配置是否为音箱可访问的局域网 IP', timestamp: new Date().toLocaleTimeString() }
                ]
              };
            });
          }
        }, 2000);
      })
      .catch((err: any) => {
        clearTimeout(timeoutTimer);
        const isTimeout = err.name === 'AbortError';
        let errorDesc = isTimeout
          ? '向音箱下发投播指令超时，设备未响应或网络不可达'
          : (err.message || '音箱拒绝或未响应投播请求');

        if (!miotConfig.isLoggedIn && (errorDesc.includes('超时') || errorDesc.includes('不可达') || errorDesc.includes('拒绝') || isTimeout)) {
          if (!errorDesc.includes('米家账号') && !errorDesc.includes('扫码登录')) {
            errorDesc += '（提示：当前未登录小米账号。若音箱不在本机相同局域网，请前往【智能音箱】->【账号与服务配置】扫码登录米家账号以开启云端推流）';
          }
        }

        const errTime = new Date().toLocaleTimeString();
        const failedStages = [
          { stage: 'COMMAND_SENT' as const, label: '指令发送成功', success: true, timestamp: errTime },
          { stage: 'DEVICE_ACK' as const, label: '音箱握手失败', success: false, detail: errorDesc, timestamp: errTime },
          { stage: 'STREAM_CONNECTED' as const, label: '音频流无法建立', success: false, timestamp: errTime },
          { stage: 'PLAYING' as const, label: '投播中断', success: false, timestamp: errTime }
        ];

        // UI State -> timeout or failed
        setCommandState({
          status: isTimeout ? 'timeout' : 'failed',
          action: 'cast',
          error: errorDesc,
          targetDid: dev.did,
          timestamp: Date.now(),
          castingStage: 'FAILED',
          stageHistory: failedStages
        });

        // Device State: strictly false, do NOT fake playback
        setIsCasting(false);
        setDevices(prev => prev.map(d => {
          if (d.did === dev.did) {
            return {
              ...d,
              status: {
                ...d.status,
                playing: false,
                updatedAt: new Date().toISOString()
              }
            };
          }
          return d;
        }));

        // XiaoMusic smart fallback: ensure local browser audio continues playing seamlessly
        if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(() => {});
        }

        showToast(
          `投放到【${dev.name}】未完成`,
          errorDesc,
          'error'
        );

        // Record real failure log with stream URL
        setCastLogs(prev => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'cast',
            message: `投放失败【${dev.name}】`,
            detail: `${errorDesc} | 串流源: ${streamUrl}`,
            success: false,
            streamUrl: streamUrl,
            did: dev.did,
            ip: dev.ip,
            model: dev.model,
            protocol: 'MIoT / DLNA',
            httpStatus: 502
          },
          ...prev
        ]);

        // Sync latest logs from server
        apiFetch('/api/miot/logs')
          .then(res => res.ok ? res.json() : null)
          .then(serverLogs => {
            if (Array.isArray(serverLogs) && serverLogs.length > 0) {
              setCastLogs(serverLogs);
            }
          })
          .catch(() => {});
      });
  };

  const handleDismissCommandState = () => {
    setCommandState(null);
  };

  const handleSwitchToBrowserAudio = () => {
    setIsCasting(false);
    setCommandState(null);
    if (miotConfig.autoCast) {
      handleUpdateConfig({ autoCast: false });
    }
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    }
    showToast('已切换至浏览器播放', '已退出音箱投播模式，恢复为当前设备/浏览器本地音频输出', 'info');
  };

  const handleToggleCast = () => {
    if (isCasting) {
      // Toggle OFF: Turn off speaker casting, hand over to Local Browser Playback
      setIsCasting(false);
      setCommandState(null);
      if (activeDevice) {
        handleControlDevice(activeDevice.did, 'pause');
        apiFetch('/api/queue/pause', { method: 'POST' }).catch(() => {});
      }

      // If playback was active, seamlessly resume on local browser audio
      if (currentSong && isPlaying) {
        const playSrc = (currentSong.url && !currentSong.url.includes('pixabay')) ? currentSong.url : `/api/stream/${currentSong.id}`;
        if (audioRef.current) {
          audioRef.current.src = playSrc;
          audioRef.current.currentTime = currentTime;
          audioRef.current.play().catch(e => {
            console.warn('Local handoff play error:', e);
          });
        }
      }

      showToast('已切换至本地设备播放', `已退出【${activeDevice?.name || '小爱音箱'}】串流模式，控制按钮已切回本地播放器`, 'info');
    } else {
      // Toggle ON: Turn on Xiaomi Speaker Casting, hand over from Local Playback
      setIsCasting(true);

      // Pause local browser audio immediately so it doesn't collide
      if (audioRef.current) {
        audioRef.current.pause();
      }

      if (currentSong) {
        castSongToDevice(currentSong, activeDevice);
        showToast('已开启小米音箱控制模式', `播放器按钮操作已全权接管至【${activeDevice?.name || '小爱音箱'}】`, 'success');
      } else {
        showToast('小米音箱控制模式已开启', `接下来在曲库或播放列表中点击播放，将直接推流至【${activeDevice?.name || '小爱音箱'}】`, 'success');
      }
    }
  };

  const handleControlDevice = (did: string, action: string, value?: any) => {
    // UI State -> pending
    setCommandState({
      status: 'pending',
      action: action as any,
      targetDid: did,
      timestamp: Date.now()
    });

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 12000);

    apiFetch('/api/miot/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did, action, value }),
      signal: controller.signal
    })
      .then(async res => {
        clearTimeout(timeoutTimer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || `控制指令执行失败 (HTTP ${res.status})`);
        }
        return data;
      })
      .then(data => {
        // UI State -> success
        setCommandState({
          status: 'success',
          action: action as any,
          targetDid: did,
          timestamp: Date.now()
        });

        // Device State: Update purely from verified server device status
        if (data.device) {
          setDevices(prev => prev.map(d => d.did === did ? data.device : d));
          if (action === 'pause' || action === 'stop') {
            if (did === activeDeviceId) setIsCasting(false);
          } else if (action === 'play') {
            if (did === activeDeviceId) setIsCasting(Boolean(data.device.status?.playing));
          }
        }
      })
      .catch((err: any) => {
        clearTimeout(timeoutTimer);
        const isTimeout = err.name === 'AbortError';
        const errorDesc = isTimeout
          ? `控制指令【${action}】响应超时（6秒）`
          : (err.message || `向音箱下发控制指令【${action}】失败`);

        // UI State -> timeout or failed
        setCommandState({
          status: isTimeout ? 'timeout' : 'failed',
          action: action as any,
          error: errorDesc,
          targetDid: did,
          timestamp: Date.now()
        });

        showToast(
          `音箱控制失败: ${action}`,
          errorDesc,
          'error'
        );
      });
  };

  const handleSendTts = (did: string, text: string, mode?: string, voice?: string) => {
    const targetDev = devices.find(d => d.did === did);

    // UI State -> pending
    setCommandState({
      status: 'pending',
      action: 'tts',
      targetDid: did,
      timestamp: Date.now()
    });

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 25000);

    apiFetch('/api/miot/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did, text, mode, voice }),
      signal: controller.signal
    })
      .then(async res => {
        clearTimeout(timeoutTimer);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || `小爱 TTS 指令响应失败 (HTTP ${res.status})`);
        }
        return data;
      })
      .then(data => {
        // UI State -> success
        setCommandState({
          status: 'success',
          action: 'tts',
          targetDid: did,
          timestamp: Date.now()
        });

        if (data.device) {
          setDevices(prev => prev.map(d => d.did === did ? data.device : d));
        }

        const channelNote = data.channel ? ` (${data.channel})` : '';
        showToast('小爱语音播报下发成功', `“${text}”${channelNote}`, 'success');
        setCastLogs(prev => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'tts',
            message: `【${targetDev?.name || '音箱'}】TTS 语音播报成功`,
            detail: `“${text}”${channelNote}`,
            success: true
          },
          ...prev
        ]);
      })
      .catch((err: any) => {
        clearTimeout(timeoutTimer);
        const isTimeout = err.name === 'AbortError';
        const errorDesc = isTimeout
          ? '向音箱下发语音播报指令超时（25秒内多通道均未确认）'
          : (err.message || '音箱未响应语音播报请求');

        // UI State -> failed or timeout
        setCommandState({
          status: isTimeout ? 'timeout' : 'failed',
          action: 'tts',
          error: errorDesc,
          targetDid: did,
          timestamp: Date.now()
        });

        showToast('语音播报失败', errorDesc, 'error');

        setCastLogs(prev => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'tts',
            message: `【${targetDev?.name || '音箱'}】TTS 播报失败`,
            detail: `${errorDesc} | 内容: “${text}”`,
            success: false
          },
          ...prev
        ]);
      });
  };

  const handleUpdateConfig = (newConfig: Partial<MiotConfig>) => {
    const updated = { ...miotConfig, ...newConfig };
    setMiotConfig(updated);
    apiFetch('/api/miot/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch(() => {});
  };

  const handleScanDevices = () => {
    setIsScanning(true);
    apiFetch('/api/miot/devices/scan', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setIsScanning(false);
        if (data.devices) {
          setDevices(data.devices);
          if (data.devices.length > 0 && (!activeDeviceId || !data.devices.some((d: XiaomiDevice) => d.did === activeDeviceId))) {
            setActiveDeviceId(data.activeDeviceId || data.devices[0].did);
          }
        }
        if (data.cloudSyncedCount > 0) {
          showToast('云端同步完成', `已从米家云端成功同步 ${data.cloudSyncedCount} 台音箱设备`, 'success');
        } else {
          showToast('扫描与状态探测完成', `当前共有 ${data.count ?? data.devices?.length ?? devices.length} 台音箱设备就绪`, 'success');
        }
      })
      .catch(() => {
        setIsScanning(false);
        showToast('扫描完成', `当前列表中共有 ${devices.length} 台音箱`, 'info');
      });
  };

  const handleScanMusicDir = async () => {
    setIsScanning(true);
    try {
      const res = await apiFetch('/api/songs/scan', { method: 'POST' });
      const data = await res.json();
      if (data.songs && data.songs.length > 0) {
        setSongs(data.songs);
      }
      showToast('挂载目录 /music 扫描完成', `本次新增 ${data.added || 0} 首，曲库总计 ${data.total || songs.length} 首`, 'success');
    } catch (e) {
      showToast('扫描目录完成', `曲库现有 ${songs.length} 首高保真音频`, 'info');
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleFavorite = async (songId: string) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, isFavorite: !s.isFavorite } : s));
    try {
      await apiFetch(`/api/songs/${songId}/favorite`, { method: 'POST' });
    } catch (e) {}
  };

  const handleAddCustomSong = async (newSongData: Partial<Song> & { fileBase64?: string; fileName?: string }) => {
    try {
      const res = await apiFetch('/api/songs/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSongData)
      });
      const data = await res.json();
      if (data.song) {
        setSongs(prev => [data.song, ...prev.filter(s => s.id !== data.song.id)]);
        showToast('歌曲入库并持久化成功', `《${data.song.title}》已写入服务端 /music 目录`, 'success');
        handlePlaySong(data.song);
        return;
      }
    } catch (e) {
      console.error(e);
    }

    const fallbackSong: Song = {
      id: `song-${Date.now()}`,
      title: newSongData.title || '自定义歌曲',
      artist: newSongData.artist || '本地歌手',
      album: newSongData.album || '自制专辑',
      duration: newSongData.duration || 200,
      url: newSongData.url || '',
      coverUrl: newSongData.coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      genre: newSongData.genre || '本地歌曲',
      lyrics: newSongData.lyrics || '',
      bitrate: '320kbps MP3',
      fileSize: newSongData.fileSize || '8.2 MB',
      source: 'uploaded',
      isFavorite: false
    };

    setSongs(prev => [fallbackSong, ...prev]);
    showToast('歌曲入库成功', `《${fallbackSong.title}》已添加至曲库，支持即刻投放`, 'success');
    handlePlaySong(fallbackSong);
  };

  const handleCreatePlaylist = async (name: string, description: string) => {
    try {
      const res = await apiFetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          songIds: []
        })
      });
      const data = await res.json();
      if (data.playlist) {
        setPlaylists(prev => [...prev, data.playlist]);
        showToast('新歌单创建成功', `歌单《${name}》已持久化保存`, 'success');
        return;
      }
    } catch (e) {}

    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      description,
      songIds: [],
      createdAt: new Date().toISOString().split('T')[0]
    };
    setPlaylists(prev => [...prev, newPl]);
    showToast('新歌单创建成功', `歌单《${name}》已就绪`, 'success');
  };

  const handleToggleSongInPlaylist = async (songId: string, playlistId: string) => {
    const targetPl = playlists.find(p => p.id === playlistId);
    if (!targetPl) return;

    const isAlreadyIn = targetPl.songIds.includes(songId);
    const targetSong = songs.find(s => s.id === songId);

    if (isAlreadyIn) {
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, songIds: p.songIds.filter(id => id !== songId) } : p));
      try {
        await apiFetch(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' });
      } catch (e) {}
      showToast('已从歌单移除', `《${targetSong?.title || '歌曲'}》已从《${targetPl.name}》中移出`, 'info');
    } else {
      setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, songIds: [...p.songIds, songId] } : p));
      try {
        await apiFetch(`/api/playlists/${playlistId}/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songId })
        });
      } catch (e) {}
      showToast('成功加入歌单', `《${targetSong?.title || '歌曲'}》已加入《${targetPl.name}》`, 'success');
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    const targetPl = playlists.find(p => p.id === playlistId);
    setPlaylists(prev => prev.filter(p => p.id !== playlistId));
    try {
      await apiFetch(`/api/playlists/${playlistId}`, { method: 'DELETE' });
    } catch (e) {}
    showToast('歌单已删除', `歌单《${targetPl?.name || ''}》已成功移除`, 'info');
  };

  const handleAddDevice = async (newDev: { name: string; ip: string; did?: string; model?: string; hardware?: string; token?: string }) => {
    try {
      const res = await apiFetch('/api/miot/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDev)
      });
      const data = await res.json();
      if (data.device) {
        setDevices(prev => [...prev, data.device]);
        showToast('音箱添加成功', `已接入【${data.device.name}】(${data.device.ip})`, 'success');
        return;
      }
    } catch (e) {
      showToast('添加音箱失败', '网络请求错误', 'error');
    }
  };

  const handleUpdateDevice = async (did: string, updatedData: Partial<XiaomiDevice>) => {
    try {
      const res = await apiFetch(`/api/miot/devices/${did}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      const data = await res.json();
      if (data.success && data.devices) {
        setDevices(data.devices);
        showToast('音箱信息已更新', `【${data.device?.name || '音箱'}】配置已保存并生效`, 'success');
        return;
      }
    } catch (e) {
      showToast('更新音箱失败', '网络请求错误', 'error');
    }
  };

  const handleDeleteDevice = async (did: string) => {
    const didStr = String(did).trim();

    // 1. Optimistically remove ONLY this single device from local React state
    setDevices(prev => {
      const updated = prev.filter(d => String(d.did).trim() !== didStr && String(d.id || '').trim() !== didStr);
      if (activeDeviceId === didStr) {
        setActiveDeviceId(updated[0]?.did || '');
      }
      return updated;
    });

    try {
      const res = await apiFetch(`/api/miot/devices/${encodeURIComponent(didStr)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success && Array.isArray(data.devices)) {
        setDevices(data.devices);
        if (data.activeDeviceId !== undefined) {
          setActiveDeviceId(data.activeDeviceId);
        }
      }
      showToast('已移除音箱设备', '', 'info');
    } catch (e) {
      showToast('已从列表移除音箱', '', 'info');
    }
  };

  const handleClearDevices = async () => {
    try {
      const res = await apiFetch('/api/miot/devices/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setDevices([]);
        setActiveDeviceId('');
        showToast('已清空音箱列表', '您可以手动添加或重新调取云端与局域网设备', 'info');
      }
    } catch (e) {
      setDevices([]);
      setActiveDeviceId('');
      showToast('已清空音箱列表', '', 'info');
    }
  };

  const handleResetDefaultDevices = async () => {
    setDevices([]);
    setActiveDeviceId('');
    showToast('已清空音箱设备', '已切换为真实设备发现模式（0台=0台）', 'info');
  };

  const handlePingDevice = async (ip: string, port = 80) => {
    const res = await apiFetch('/api/miot/devices/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port })
    });
    return await res.json();
  };

  const isMandatoryAuth = Boolean(securityStatus?.authRequired && !user && !authToken);

  return (
    <div className={`min-h-screen ${themeConfig.bgClass} ${themeConfig.isLight ? 'text-zinc-900' : 'text-zinc-100'} flex flex-col font-sans relative overflow-x-hidden transition-colors duration-300`}>
      
      {/* Immersive UI Background Ambient Glows */}
      <div 
        className="fixed top-[-10%] right-[10%] w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none z-0 transition-all duration-500" 
        style={{ backgroundColor: `rgba(${themeConfig.primaryRgb}, 0.08)` }}
      />
      <div 
        className="fixed bottom-[-10%] left-[10%] w-[400px] h-[400px] rounded-full blur-[100px] pointer-events-none z-0 transition-all duration-500" 
        style={{ backgroundColor: `rgba(${themeConfig.primaryRgb}, 0.05)` }}
      />

      {/* Main Page Layout Wrapper - Gets blurred & interaction locked when mandatory authentication is required */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isMandatoryAuth ? 'pointer-events-none select-none filter blur-md opacity-30 grayscale-[40%]' : ''}`}>
        
        {/* Hidden Audio Engine */}
        <audio
          ref={audioRef}
          src={currentSong?.url}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              setDuration(audioRef.current.duration || currentSong?.duration || 200);
            }
          }}
          onEnded={() => {
            if (repeatMode === 'one') {
              if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(() => {});
              }
            } else {
              handleNextSong();
            }
          }}
        />

        {/* Header Navigation */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeDevice={activeDevice}
          miotConfig={miotConfig}
          isCasting={isCasting}
          songCount={songs.length}
          user={user}
          securityAuthEnabled={Boolean(securityStatus?.globalRequireAuth ?? securityStatus?.authRequired)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 relative z-10">
          {activeTab === 'library' && (
            <MusicLibrary
              songs={songs}
              playlists={playlists}
              currentSong={currentSong}
              isPlaying={isPlaying}
              onPlaySong={handlePlaySong}
              onPlayAll={handlePlayAll}
              onCastSongToXiaomi={(song) => {
                setCurrentSong(song);
                setCurrentTime(0);
                setDuration(song.duration || 200);
                setIsPlaying(true);
                setIsCasting(true);
                if (audioRef.current) audioRef.current.pause();
                castSongToDevice(song, activeDevice);
              }}
              onCastAllToXiaomi={handleCastAllToXiaomi}
              onToggleFavorite={handleToggleFavorite}
              activeDevice={activeDevice}
              isCasting={isCasting}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onScanMusicDir={handleScanMusicDir}
              isScanning={isScanning}
              onCreatePlaylist={handleCreatePlaylist}
              onToggleSongInPlaylist={handleToggleSongInPlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onOpenNavidromeModal={() => setIsNavidromeModalOpen(true)}
            />
          )}

          {activeTab === 'lyrics' && (
            <LyricsView
              currentSong={currentSong}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onSeek={handleSeek}
              activeDevice={activeDevice}
              isCasting={isCasting}
              onToggleCast={handleToggleCast}
              onSongUpdated={(updated) => {
                setSongs(prev => prev.map(s => s.id === updated.id ? updated : s));
                setPlayQueue(prev => prev.map(s => s.id === updated.id ? updated : s));
                setCurrentSong(prev => prev?.id === updated.id ? updated : prev);
              }}
            />
          )}

          {activeTab === 'xiaomi' && (
            <XiaomiSpeakerPanel
              devices={devices}
              activeDevice={activeDevice}
              onSelectDevice={(did) => {
                setActiveDeviceId(did);
                showToast('已切换目标音箱', `当前目标：${devices.find(d => d.did === did)?.name}`, 'info');
              }}
              onControlDevice={handleControlDevice}
              onSendTts={handleSendTts}
              miotConfig={miotConfig}
              onUpdateConfig={handleUpdateConfig}
              castLogs={castLogs}
              onScanDevices={handleScanDevices}
              isScanning={isScanning}
              currentSong={currentSong}
              onCastCurrentSong={() => {
                if (currentSong) castSongToDevice(currentSong, activeDevice);
              }}
              isCasting={isCasting}
              commandState={commandState}
              onAddDevice={handleAddDevice}
              onUpdateDevice={handleUpdateDevice}
              onDeleteDevice={handleDeleteDevice}
              onClearDevices={handleClearDevices}
              onResetDevices={handleResetDefaultDevices}
              onDevicesUpdated={(synced) => setDevices(synced)}
              onPingDevice={handlePingDevice}
              onOpenSecurityModal={() => setActiveTab('settings')}
              onDismissCommandState={handleDismissCommandState}
              onSwitchToBrowserAudio={handleSwitchToBrowserAudio}
              playlists={playlists}
            />
          )}

          {activeTab === 'subsonic' && (
            <SubsonicServerView
              serverHost={miotConfig.serverHost}
              songsCount={songs.length}
              playlistsCount={playlists.length}
              onOpenNavidromeModal={() => setIsNavidromeModalOpen(true)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsPage
              currentUser={user}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onShowToast={(title, desc, type) => showToast(title, desc, type)}
              onSecurityUpdated={checkSecurityStatus}
              onNavigateToSponsor={() => setActiveTab('sponsor')}
            />
          )}

          {activeTab === 'sponsor' && (
            <SponsorPage
              onShowToast={(title, desc, type) => showToast(title, desc, type)}
            />
          )}
        </main>

        {/* Global Sticky Player Bar */}
        <PlayerBar
          currentSong={currentSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onPlayPause={handlePlayPause}
          onNext={handleNextSong}
          onPrev={handlePrevSong}
          onSeek={handleSeek}
          volume={volume}
          onVolumeChange={setVolume}
          activeDevice={activeDevice}
          isCasting={isCasting}
          commandState={commandState}
          onToggleCast={handleToggleCast}
          onOpenLyrics={() => setActiveTab('lyrics')}
          onOpenXiaomiPanel={() => setActiveTab('xiaomi')}
          isShuffle={isShuffle}
          onToggleShuffle={() => setIsShuffle(prev => !prev)}
          repeatMode={repeatMode}
          onCycleRepeat={handleCycleRepeat}
          onOpenEQ={() => setIsEQModalOpen(true)}
          onOpenQueue={() => setIsQueueDrawerOpen(true)}
          onOpenSubsonic={() => setIsSubsonicModalOpen(true)}
          queueCount={playQueue.length}
          speakerVolume={activeDevice?.status?.volume ?? 40}
          onSpeakerVolumeChange={(targetVol) => {
            if (activeDevice) {
              handleControlDevice(activeDevice.did, 'volume', targetVol);
            }
          }}
        />

        {/* Upload Song Modal */}
        <UploadSongModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onAddSong={handleAddCustomSong}
        />

        {/* Audio Equalizer & Spectrum Visualizer Modal */}
        <AudioEqualizerModal
          isOpen={isEQModalOpen}
          onClose={() => setIsEQModalOpen(false)}
          audioRef={audioRef}
          isPlaying={isPlaying}
        />

        {/* Play Queue Drawer */}
        <PlayQueueDrawer
          isOpen={isQueueDrawerOpen}
          onClose={() => setIsQueueDrawerOpen(false)}
          playlist={playQueue}
          currentSong={currentSong}
          isPlaying={isPlaying}
          isCasting={isCasting}
          activeDevice={activeDevice}
          onSelectSong={handlePlaySong}
          onRemoveFromQueue={(songId) => {
            setPlayQueue(prev => {
              const nextQueue = prev.filter(s => s.id !== songId);
              if (currentSong?.id === songId) {
                if (nextQueue.length > 0) {
                  handlePlaySong(nextQueue[0], nextQueue);
                } else {
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                  }
                  setCurrentTime(0);
                  setIsPlaying(false);
                  setCurrentSong(null);
                }
              }
              return nextQueue;
            });
          }}
          onClearQueue={() => {
            setPlayQueue([]);
            setCurrentSong(null);
            setIsPlaying(false);
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
            setCurrentTime(0);
            try {
              localStorage.setItem('tinglan_play_queue', '[]');
              localStorage.removeItem('tinglan_current_song');
            } catch {}
            apiFetch('/api/queue/clear', { method: 'POST' }).catch(() => {});
            if (isCasting && activeDevice) {
              handleControlDevice(activeDevice.did, 'pause');
            }
            showToast('播放队列已清空', '本地播放器已重置为待命状态，曲目暂停', 'info');
          }}
          isShuffle={isShuffle}
          onToggleShuffle={() => setIsShuffle(prev => !prev)}
          repeatMode={repeatMode}
          onCycleRepeat={handleCycleRepeat}
          onNext={handleNextSong}
          onPrev={handlePrevSong}
        />

        {/* Subsonic & OpenSubsonic Gateway Dashboard Modal */}
        <SubsonicDashboardModal
          isOpen={isSubsonicModalOpen}
          onClose={() => setIsSubsonicModalOpen(false)}
          serverHost={miotConfig.serverHost}
        />

        {/* Navidrome Remote Server Modal */}
        <NavidromeModal
          isOpen={isNavidromeModalOpen}
          onClose={() => setIsNavidromeModalOpen(false)}
          onSongsSynced={fetchSongsFromBackend}
        />
      </div>

      {/* Global Toast Notification - Rendered crisp outside of blurred content wrapper */}
      {toastMessage && (
        <div 
          id="toast-notification-card"
          key={toastMessage.id}
          className="fixed top-20 right-6 z-[120] animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto"
        >
          <div className="relative overflow-hidden flex items-start gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-[0_8px_32px_rgba(0,0,0,0.8)] text-xs max-w-sm">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : toastMessage.type === 'info' ? (
              <Radio className="w-5 h-5 text-[#FF6700] flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0 pr-1">
              <h5 className="font-semibold text-zinc-100 leading-snug">{toastMessage.title}</h5>
              {toastMessage.desc && (
                <p className="text-zinc-300 mt-1 leading-relaxed">{toastMessage.desc}</p>
              )}
            </div>
            <button 
              id="btn-close-toast"
              onClick={() => setToastMessage(null)}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer -mr-1 -mt-1 flex-shrink-0"
              title="关闭提示"
            >
              <X className="w-4 h-4" />
            </button>
            {/* 3秒自动关闭微动效进度条 */}
            <div 
              className={`absolute bottom-0 left-0 h-[2.5px] rounded-full ${
                toastMessage.type === 'success' 
                  ? 'bg-emerald-500/80' 
                  : toastMessage.type === 'info' 
                    ? 'bg-[#FF6700]/80' 
                    : 'bg-rose-500/80'
              }`}
              style={{
                animation: `toastProgress ${toastMessage.duration ?? 3000}ms linear forwards`
              }}
            />
          </div>
        </div>
      )}

      {/* User Login & Registration Auth Modal - Razor Sharp outside of blurred wrapper */}
      <AuthModal
        isOpen={isAuthModalOpen || isMandatoryAuth}
        onClose={() => {
          setIsAuthModalOpen(false);
        }}
        onLoginSuccess={handleLoginSuccess}
        isSecurityRequired={isMandatoryAuth}
        allowRegistration={securityStatus?.allowRegistration !== false}
      />

      {/* Quick Theme Selector Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

    </div>
  );
}

