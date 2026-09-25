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
import { SleepTimerModal } from './components/SleepTimerModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { VinylPlayerModal } from './components/VinylPlayerModal';
import { MultiRoomCastModal } from './components/MultiRoomCastModal';
import { TrackInspectorModal } from './components/TrackInspectorModal';
import { ForceChangePasswordModal } from './components/ForceChangePasswordModal';
import { useTheme } from './context/ThemeContext';
import { usePlaybackTimeActions } from './context/PlaybackTimeContext';
import { useAppEvents } from './context/AppEventsContext';
import { Song, Playlist, XiaomiDevice, MiotConfig, CastLog, User, SecurityStatus, DeviceCommandState, SleepTimerConfig, ABLoopConfig, AudioEngineSettings } from './types';
import { INITIAL_SONGS, INITIAL_PLAYLISTS, INITIAL_XIAOMI_DEVICES } from './data/mockSongs';
import { apiFetch, setStoredAuthToken, getAuthToken } from './utils/api';
import { formatTime } from './utils/lyricParser';
import { CheckCircle2, AlertCircle, Radio, X } from 'lucide-react';

export default function App() {
  const { themeConfig, isThemeModalOpen, setIsThemeModalOpen } = useTheme();
  const { subscribe, isConnected } = useAppEvents();

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
  const [isForcePasswordModalOpen, setIsForcePasswordModalOpen] = useState(false);
  const [dismissedDefaultPasswordAlert, setDismissedDefaultPasswordAlert] = useState(false);

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
  const timeActions = usePlaybackTimeActions();
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
  const [activeDeviceId, setActiveDeviceId] = useState<string>(() => {
    try {
      return localStorage.getItem('tinglan_active_device_did') || '';
    } catch {}
    return '';
  });
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
  const [isSleepTimerModalOpen, setIsSleepTimerModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isVinylOpen, setIsVinylOpen] = useState(false);
  const [isMultiRoomOpen, setIsMultiRoomOpen] = useState(false);
  const [inspectorSong, setInspectorSong] = useState<Song | null>(null);
  const [abLoop, setAbLoop] = useState<ABLoopConfig>({ a: null, b: null, enabled: false });
  const [audioSettings, setAudioSettings] = useState<AudioEngineSettings>(() => {
    try {
      const saved = localStorage.getItem('tinglan_audio_settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      crossfadeDuration: 3,
      replayGainEnabled: true,
      eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem('tinglan_audio_settings', JSON.stringify(audioSettings));
    } catch {}
  }, [audioSettings]);

  const isCrossfadingRef = useRef(false);
  const abLoopRef = useRef(abLoop);
  useEffect(() => {
    abLoopRef.current = abLoop;
  }, [abLoop]);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [sleepTimer, setSleepTimer] = useState<SleepTimerConfig>({
    enabled: false,
    remainingSeconds: 0,
    initialMinutes: 0,
    stopAtEndOfSong: false,
    smoothFadeOut: true,
  });
  const sleepTimerFadeInitialVolRef = useRef<number | null>(null);
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

  const fetchPlaylistsFromBackend = () => {
    apiFetch('/api/playlists')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setPlaylists(data);
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

  const fadeAudioOut = (durationMs: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioRef.current || durationMs <= 0) {
        resolve();
        return;
      }
      const startVol = audioRef.current.volume;
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (!audioRef.current) {
          clearInterval(interval);
          resolve();
          return;
        }
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        audioRef.current.volume = Math.max(0, startVol * (1 - progress));
        if (progress >= 1) {
          clearInterval(interval);
          resolve();
        }
      }, 40);
    });
  };

  const fadeAudioIn = (targetVol: number, durationMs: number): void => {
    if (!audioRef.current || durationMs <= 0) {
      if (audioRef.current) audioRef.current.volume = targetVol;
      return;
    }
    audioRef.current.volume = 0;
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (!audioRef.current) {
        clearInterval(interval);
        return;
      }
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      audioRef.current.volume = Math.min(targetVol, targetVol * progress);
      if (progress >= 1) {
        clearInterval(interval);
      }
    }, 40);
  };

  const handleToggleABLoop = () => {
    const now = timeActions.getCurrentTime();
    if (abLoop.enabled) {
      setAbLoop({ a: null, b: null, enabled: false });
      showToast('已关闭 A-B 区间复读', undefined, 'info');
    } else if (abLoop.a === null) {
      setAbLoop({ a: now, b: null, enabled: false });
      showToast(`已设定 A 点: ${formatTime(now)}`, '请继续播放至复读终点后再次点击定 B 点', 'info');
    } else if (abLoop.b === null) {
      if (now <= abLoop.a) {
        showToast('B 点必须大于 A 点', '请在当前播放时间晚于 A 点时设定', 'error');
        return;
      }
      setAbLoop({ a: abLoop.a, b: now, enabled: true });
      showToast('A-B 区间复读已开启', `循环区间: ${formatTime(abLoop.a)} 至 ${formatTime(now)}`, 'success');
    } else {
      setAbLoop({ a: null, b: null, enabled: false });
    }
  };

  // Sleep Timer Countdown & Smooth Fadeout Effect
  useEffect(() => {
    if (!sleepTimer.enabled || sleepTimer.stopAtEndOfSong) return;

    const interval = setInterval(() => {
      setSleepTimer(prev => {
        if (!prev.enabled || prev.stopAtEndOfSong) return prev;
        if (prev.remainingSeconds <= 1) {
          // Timer finished: stop audio
          setIsPlaying(false);
          if (audioRef.current) {
            audioRef.current.pause();
          }
          if (isCasting && activeDevice) {
            handleControlDevice(activeDevice.did, 'pause');
          }
          // Restore volume if smooth fadeout altered it
          if (sleepTimerFadeInitialVolRef.current !== null) {
            setVolume(sleepTimerFadeInitialVolRef.current);
            if (audioRef.current) audioRef.current.volume = sleepTimerFadeInitialVolRef.current;
            sleepTimerFadeInitialVolRef.current = null;
          }
          showToast('睡眠定时器已触发', '定时播放已结束，已为您自动停止音乐播放', 'info');
          return { ...prev, enabled: false, remainingSeconds: 0 };
        }

        // Smooth fade out in the last 60 seconds
        if (prev.smoothFadeOut && prev.remainingSeconds <= 60 && audioRef.current) {
          if (sleepTimerFadeInitialVolRef.current === null) {
            sleepTimerFadeInitialVolRef.current = volume;
          }
          const fraction = Math.max(0, (prev.remainingSeconds - 1) / 60);
          const fadedVolume = (sleepTimerFadeInitialVolRef.current || 0.75) * fraction;
          audioRef.current.volume = Math.max(0, Math.min(1, fadedVolume));
        }

        return { ...prev, remainingSeconds: prev.remainingSeconds - 1 };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimer.enabled, sleepTimer.stopAtEndOfSong, isCasting, activeDevice, volume]);

  const fetchDevices = () => {
    apiFetch('/api/miot/devices')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (Array.isArray(data)) {
          setDevices(data);
          if (data.length > 0) {
            setActiveDeviceId(prev => {
              if (prev && data.some(d => d.did === prev)) return prev;
              try {
                const localSaved = localStorage.getItem('tinglan_active_device_did');
                if (localSaved && data.some(d => d.did === localSaved)) return localSaved;
              } catch {}
              return miotConfig.activeDeviceId && data.some(d => d.did === miotConfig.activeDeviceId)
                ? miotConfig.activeDeviceId
                : data[0].did;
            });
          }
        }
      })
      .catch(() => {});
  };

  const loadAllAppData = () => {
    // 1. Fetch MIoT Config
    apiFetch('/api/miot/config')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setMiotConfig(prev => ({ ...prev, ...data }));
          if (data.activeDeviceId) {
            setActiveDeviceId(data.activeDeviceId);
            try {
              localStorage.setItem('tinglan_active_device_did', data.activeDeviceId);
            } catch {}
          }
        }
      })
      .catch(() => {});

    // 2. Fetch Devices
    fetchDevices();

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
    fetchPlaylistsFromBackend();

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
              timeActions.setDuration(status.currentSong.duration || 200);
            }
            if (typeof status.elapsedSeconds === 'number' && status.elapsedSeconds >= 0) {
              timeActions.setCurrentTime(status.elapsedSeconds);
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

  // Compute whether the default admin password (admin123) is currently active
  const isUsingDefaultAdminPassword = Boolean(
    user?.isDefaultPassword || 
    (user?.role === 'admin' && securityStatus?.isDefaultAdminPassword) ||
    (!user && securityStatus?.isDefaultAdminPassword && !securityStatus?.authRequired)
  );

  // Automatically pop up the ForceChangePasswordModal when default admin password is detected
  useEffect(() => {
    if (isUsingDefaultAdminPassword && !dismissedDefaultPasswordAlert) {
      setIsForcePasswordModalOpen(true);
    }
  }, [isUsingDefaultAdminPassword, dismissedDefaultPasswordAlert]);

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

  // Real-time synchronization via Server-Sent Events (SSE) (Phase 5)
  useEffect(() => {
    const unsubQueue = subscribe('queue:change', (status: any) => {
      if (!status) return;
      // Synchronize speaker queue state in real-time
      if (isCasting) {
        if (status.isPlaying !== undefined && !status.isTransitioning) {
          setIsPlaying(Boolean(status.isPlaying));
        }
        if (status.currentSong && status.currentSong.id !== currentSong?.id) {
          setCurrentSong(status.currentSong);
          timeActions.setDuration(status.currentSong.duration || 200);
        }
        if (typeof status.elapsedSeconds === 'number' && status.elapsedSeconds >= 0) {
          timeActions.setCurrentTime(status.elapsedSeconds);
        }
      }
      if (status?.queue && Array.isArray(status.queue) && status.queue.length > 0) {
        setPlayQueue(prev => {
          if (prev.length === status.queue.length && prev.every((s, i) => s.id === status.queue[i]?.id)) {
            return prev;
          }
          return status.queue;
        });
      }
    });

    const unsubTick = subscribe('playback:tick', (tick: any) => {
      if (!isCasting) return;
      if (tick && typeof tick.elapsedSeconds === 'number') {
        timeActions.setCurrentTime(tick.elapsedSeconds);
        if (tick.duration) {
          timeActions.setDuration(tick.duration);
        }
      }
    });

    return () => {
      unsubQueue();
      unsubTick();
    };
  }, [subscribe, isCasting, currentSong?.id]);

  // Fallback sync ONLY when SSE connection is offline (Zero polling while SSE is active!)
  useEffect(() => {
    if (isConnected) return; // 0 HTTP polling requests while SSE real-time stream is connected

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      apiFetch('/api/queue')
        .then(res => res.json())
        .then(resData => {
          if (!resData) return;
          const status = resData.data || resData;
          if (isCasting && status) {
            if (status.isPlaying !== undefined && !status.isTransitioning) {
              setIsPlaying(Boolean(status.isPlaying));
            }
            if (status.currentSong && status.currentSong.id !== currentSong?.id) {
              setCurrentSong(status.currentSong);
              timeActions.setDuration(status.currentSong.duration || 200);
            }
            if (typeof status.elapsedSeconds === 'number' && status.elapsedSeconds >= 0) {
              timeActions.setCurrentTime(status.elapsedSeconds);
            }
          }
          if (isQueueDrawerOpen && status?.queue && Array.isArray(status.queue) && status.queue.length > 0) {
            setPlayQueue(prev => {
              if (prev.length === status.queue.length && prev.every((s, i) => s.id === status.queue[i]?.id)) {
                return prev;
              }
              return status.queue;
            });
          }
        })
        .catch(() => {});
    }, isCasting ? 8000 : 20000);

    return () => {
      clearInterval(interval);
    };
  }, [isConnected, isCasting, isQueueDrawerOpen, currentSong?.id]);

  // Audio event handlers
  const handlePlayPause = () => {
    // Unlock Web Audio API context if present
    if ((window as any).__tinglanAudioCtx && (window as any).__tinglanAudioCtx.state === 'suspended') {
      (window as any).__tinglanAudioCtx.resume().catch(() => {});
    }

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
      // Clean Speaker Output Logic: route pause/play strictly to Xiaomi Speaker, KEEP casting mode active!
      if (isPlaying) {
        setIsPlaying(false);
        if (activeDevice) {
          apiFetch('/api/queue/pause', { method: 'POST' }).catch(() => {});
          apiFetch('/api/miot/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ did: activeDevice.did, action: 'pause' })
          }).catch(() => {});
        }
      } else {
        setIsPlaying(true);
        if (activeDevice) {
          apiFetch('/api/queue/resume', { method: 'POST' }).catch(() => {});
          apiFetch('/api/miot/control', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ did: activeDevice.did, action: 'play' })
          }).catch(() => {});
        }
      }
    } else {
      // Clean Local Playback Logic: route exclusively to browser HTML5 Audio
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        if (audioRef.current) {
          audioRef.current.volume = volume;
          const isNavi = Boolean((currentSong.id && currentSong.id.startsWith('navidrome-')) || (currentSong.url && currentSong.url.includes('/rest/stream')));
          const playSrc = (currentSong.url && !currentSong.url.includes('pixabay') && !isNavi) 
            ? currentSong.url 
            : `/api/stream/${encodeURIComponent(currentSong.id)}`;
          if (!audioRef.current.src || !audioRef.current.src.includes(currentSong.id)) {
            audioRef.current.src = playSrc;
          }
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(e => {
            console.warn('Audio play request error:', e);
            setIsPlaying(false);
          });
        }
      }
    }
  };

  const handlePlaySong = (song: Song, targetQueue?: Song[]) => {
    // Unlock Web Audio API context if present
    if ((window as any).__tinglanAudioCtx && (window as any).__tinglanAudioCtx.state === 'suspended') {
      (window as any).__tinglanAudioCtx.resume().catch(() => {});
    }

    setCurrentSong(song);
    timeActions.setCurrentTime(0);
    timeActions.setDuration(song.duration || 200);

    const newQueue = (targetQueue && targetQueue.length > 0)
      ? targetQueue
      : (playQueue.length > 0 ? playQueue : songs);

    setPlayQueue(newQueue);

    if (isCasting) {
      // In Speaker Cast Mode: pause local audio completely and cast to Xiaomi Speaker with active queue context
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(true);
      castSongToDevice(song, activeDevice, newQueue);
    } else {
      // In Local Playback Mode: load and play HTML5 audio directly through browser/computer speakers
      const isNavi = Boolean((song.id && song.id.startsWith('navidrome-')) || (song.url && song.url.includes('/rest/stream')));
      const playSrc = (song.url && !song.url.includes('pixabay') && !isNavi) 
        ? song.url 
        : `/api/stream/${encodeURIComponent(song.id)}`;
      if (audioRef.current) {
        if (audioSettings.crossfadeDuration > 0) {
          audioRef.current.volume = 0;
        } else {
          audioRef.current.volume = volume;
        }
        // Check if src needs update without triggering redundant reload
        if (!audioRef.current.src || !audioRef.current.src.includes(encodeURIComponent(song.id))) {
          audioRef.current.src = playSrc;
        }
        audioRef.current.currentTime = 0;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              isCrossfadingRef.current = false;
              if (audioSettings.crossfadeDuration > 0) {
                fadeAudioIn(volume, Math.min(audioSettings.crossfadeDuration * 1000, 3000));
              }
            })
            .catch((e: any) => {
              isCrossfadingRef.current = false;
              if (e && e.name === 'AbortError') {
                // Recover immediately once buffer is ready
                const handleCanPlay = () => {
                  audioRef.current?.play().then(() => {
                    setIsPlaying(true);
                    if (audioSettings.crossfadeDuration > 0) {
                      fadeAudioIn(volume, Math.min(audioSettings.crossfadeDuration * 1000, 3000));
                    }
                  }).catch(() => {});
                  audioRef.current?.removeEventListener('canplay', handleCanPlay);
                };
                audioRef.current?.addEventListener('canplay', handleCanPlay);
              } else {
                console.warn('Audio play request error:', e);
              }
            });
        }
      }
      setIsPlaying(true);
    }
  };

  const handleCrossfadeToNext = async () => {
    if (audioSettings.crossfadeDuration > 0 && !isCasting) {
      await fadeAudioOut(Math.min(audioSettings.crossfadeDuration * 1000, 3000));
    }
    handleNextSong();
  };

  const handlePlayAll = (targetSongs: Song[], startIndex: number = 0, autoCastToSpeaker?: boolean) => {
    if (!targetSongs || targetSongs.length === 0) {
      showToast('播放列表为空', '请先添加或筛选歌曲', 'info');
      return;
    }

    setPlayQueue(targetSongs);
    const startSong = targetSongs[startIndex] || targetSongs[0];

    // Follow isCasting switch strictly unless user explicitly clicked dedicated cast button (autoCastToSpeaker=true)
    const shouldCast = autoCastToSpeaker !== undefined ? autoCastToSpeaker : isCasting;

    if (shouldCast) {
      setIsCasting(true);
      // Ensure continuous playlist loop unless user explicitly selected 'one'
      const queueMode = isShuffle ? 'shuffle' : repeatMode === 'one' ? 'one' : 'all';

      setCurrentSong(startSong);
      timeActions.setCurrentTime(0);
      timeActions.setDuration(startSong.duration || 200);
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

  const handleDirectCastSong = (song: Song) => {
    if (!activeDevice) {
      showToast('未选择播放设备', '请先在顶部或音箱面板中选择一台小米音箱', 'error');
      return;
    }
    setCurrentSong(song);
    timeActions.setCurrentTime(0);
    timeActions.setDuration(song.duration || 200);
    setIsPlaying(true);
    setIsCasting(true);
    if (audioRef.current) audioRef.current.pause();
    const queueToUse = playQueue.length > 0 ? playQueue : songs;
    castSongToDevice(song, activeDevice, queueToUse);
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
      // Route 'Next' directly to Speaker Queue Engine with active queue context
      setCurrentSong(nextSong);
      timeActions.setCurrentTime(0);
      timeActions.setDuration(nextSong.duration || 200);
      setIsPlaying(true);
      if (audioRef.current) audioRef.current.pause();
      castSongToDevice(nextSong, activeDevice, queue);
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

    if (timeActions.getCurrentTime() > 3) {
      // If played for more than 3 seconds, restart current track
      timeActions.setCurrentTime(0);
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
      // Route 'Prev' directly to Speaker Queue Engine with active queue context
      setCurrentSong(prevSong);
      timeActions.setCurrentTime(0);
      timeActions.setDuration(prevSong.duration || 200);
      setIsPlaying(true);
      if (audioRef.current) audioRef.current.pause();
      castSongToDevice(prevSong, activeDevice, queue);
    } else {
      // Route 'Prev' to local browser audio
      handlePlaySong(prevSong, queue);
    }
  };

  const handleSeek = (time: number) => {
    timeActions.setCurrentTime(time);
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

  useEffect(() => {
    return timeActions.registerSeekHandler(handleSeek);
  }, [handleSeek, timeActions]);

  const volumeDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (isCasting && activeDevice) {
      if (volumeDebounceTimerRef.current) clearTimeout(volumeDebounceTimerRef.current);
      volumeDebounceTimerRef.current = setTimeout(() => {
        handleControlDevice(activeDevice.did, 'volume', Math.round(newVolume * 100));
      }, 300);
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
  const castSongToDevice = (song: Song, targetDev: XiaomiDevice | undefined, customQueue?: Song[]) => {
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

    const queueToSend = (customQueue && customQueue.length > 0) ? customQueue : (playQueue.length > 0 ? playQueue : songs);
    const queueMode = isShuffle ? 'shuffle' : repeatMode === 'one' ? 'one' : 'all';

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
        streamUrl,
        queue: queueToSend,
        mode: queueMode
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
        }
        setIsCasting(true);
        setIsPlaying(true);

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
        const isNavi = Boolean((currentSong.id && currentSong.id.startsWith('navidrome-')) || (currentSong.url && currentSong.url.includes('/rest/stream')));
        const playSrc = (currentSong.url && !currentSong.url.includes('pixabay') && !isNavi) 
          ? currentSong.url 
          : `/api/stream/${encodeURIComponent(currentSong.id)}`;
        if (audioRef.current) {
          audioRef.current.src = playSrc;
          audioRef.current.currentTime = timeActions.getCurrentTime();
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
            if (did === activeDeviceId) setIsPlaying(false);
          } else if (action === 'play') {
            if (did === activeDeviceId) setIsPlaying(true);
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

  const handleSelectDevice = async (did: string) => {
    const cleanDid = String(did).trim();
    if (!cleanDid) return;
    setActiveDeviceId(cleanDid);
    setMiotConfig(prev => ({ ...prev, activeDeviceId: cleanDid }));
    try {
      localStorage.setItem('tinglan_active_device_did', cleanDid);
    } catch {}

    const target = devices.find(d => d.did === cleanDid);
    showToast('已设为默认音箱', `当前目标：${target?.name || cleanDid}`, 'info');

    try {
      await apiFetch('/api/miot/active-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: cleanDid })
      });
    } catch (err) {
      console.warn('Failed to persist activeDeviceId:', err);
    }
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
          if (data.activeDeviceId) {
            setActiveDeviceId(data.activeDeviceId);
            try {
              localStorage.setItem('tinglan_active_device_did', data.activeDeviceId);
            } catch {}
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

  const handleRenamePlaylist = async (playlistId: string, newName: string) => {
    setPlaylists(prev => prev.map(pl => pl.id === playlistId ? { ...pl, name: newName } : pl));
    try {
      await apiFetch(`/api/playlists/${playlistId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
      });
    } catch (e) {}
    showToast('歌单重命名成功', `已将歌单更名为《${newName}》`, 'success');
  };

  const handleBatchPlay = (selectedSongs: Song[]) => {
    if (selectedSongs.length === 0) return;
    handlePlayAll(selectedSongs, 0, false);
    showToast('批量播放', `已载入选中的 ${selectedSongs.length} 首歌曲开始播放`, 'success');
  };

  const handleBatchCast = (selectedSongs: Song[]) => {
    if (selectedSongs.length === 0) return;
    if (!activeDevice) {
      showToast('请先选择目标音箱', '可在上方“智能音箱”选项卡中扫描或选择小米音箱', 'error');
      return;
    }
    handlePlayAll(selectedSongs, 0, true);
    showToast('批量投播', `已将选中的 ${selectedSongs.length} 首歌曲投播至【${activeDevice.name}】`, 'success');
  };

  const handleBatchAddToQueue = (selectedSongs: Song[]) => {
    if (selectedSongs.length === 0) return;
    setPlayQueue(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const toAdd = selectedSongs.filter(s => !existingIds.has(s.id));
      const nextQueue = [...prev, ...toAdd];
      try {
        localStorage.setItem('tinglan_play_queue', JSON.stringify(nextQueue));
      } catch {}
      return nextQueue;
    });
    showToast('已加入播放队列', `已将 ${selectedSongs.length} 首歌曲追加至当前队列末尾`, 'success');
  };

  const handleBatchAddToPlaylist = async (songIds: string[], playlistId: string) => {
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        const set = new Set(pl.songIds);
        songIds.forEach(id => set.add(id));
        return { ...pl, songIds: Array.from(set) };
      }
      return pl;
    }));
    try {
      await apiFetch(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songIds })
      });
    } catch (e) {}
    const targetPl = playlists.find(p => p.id === playlistId);
    showToast('已加入歌单', `已将 ${songIds.length} 首歌曲批量存入《${targetPl?.name || '指定歌单'}》`, 'success');
  };

  const handleBatchRemoveFromPlaylist = async (songIds: string[], playlistId: string) => {
    const toRemove = new Set(songIds);
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        return { ...pl, songIds: pl.songIds.filter(id => !toRemove.has(id)) };
      }
      return pl;
    }));
    const targetPl = playlists.find(p => p.id === playlistId);
    if (targetPl) {
      const remaining = targetPl.songIds.filter(id => !toRemove.has(id));
      try {
        await apiFetch(`/api/playlists/${playlistId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ songIds: remaining })
        });
      } catch (e) {}
    }
    showToast('已移出歌单', `已从当前歌单中移出 ${songIds.length} 首歌曲`, 'info');
  };

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    showToast('倍速调整', `当前播放速度调整为 ${speed}x`, 'info');
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            handleNextSong();
          } else {
            const curDur = timeActions.getDuration();
            const curTime = timeActions.getCurrentTime();
            handleSeek(curDur > 0 ? Math.min(curDur, curTime + 5) : curTime + 5);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            handlePrevSong();
          } else {
            const curTime = timeActions.getCurrentTime();
            handleSeek(Math.max(0, curTime - 5));
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.05));
          break;
        case 'KeyM':
          e.preventDefault();
          handleVolumeChange(volume > 0 ? 0 : 0.75);
          break;
        case 'KeyL':
          e.preventDefault();
          setActiveTab(prev => prev === 'lyrics' ? 'library' : 'lyrics');
          break;
        case 'KeyS':
          e.preventDefault();
          setIsShuffle(prev => !prev);
          break;
        case 'KeyR':
          e.preventDefault();
          handleCycleRepeat();
          break;
        case 'KeyC':
          e.preventDefault();
          handleToggleCast();
          break;
        case 'KeyV':
          e.preventDefault();
          setIsVinylOpen(prev => !prev);
          break;
        case 'Slash':
          if (e.shiftKey) { // '?' key
            e.preventDefault();
            setIsShortcutsModalOpen(prev => !prev);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleNextSong, handlePrevSong, handleSeek, handleVolumeChange, handleCycleRepeat, handleToggleCast, volume, timeActions]);

  // MediaSession API Integration
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentSong.title,
          artist: currentSong.artist,
          album: currentSong.album || '听澜音乐',
          artwork: [
            { src: currentSong.coverUrl || '/placeholder.svg', sizes: '96x96', type: 'image/jpeg' },
            { src: currentSong.coverUrl || '/placeholder.svg', sizes: '128x128', type: 'image/jpeg' },
            { src: currentSong.coverUrl || '/placeholder.svg', sizes: '256x256', type: 'image/jpeg' },
            { src: currentSong.coverUrl || '/placeholder.svg', sizes: '512x512', type: 'image/jpeg' },
          ],
        });

        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        navigator.mediaSession.setActionHandler('play', () => {
          handlePlayPause();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          handlePlayPause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          handlePrevSong();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          handleNextSong();
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            handleSeek(details.seekTime);
          }
        });
      } catch (err) {
        console.warn('MediaSession API setup error:', err);
      }
    }
  }, [currentSong, isPlaying, handlePlayPause, handlePrevSong, handleNextSong, handleSeek]);

  const handleClearAllSongs = async () => {
    try {
      const res = await apiFetch('/api/songs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSongs([]);
        setPlayQueue([]);
        setPlaylists(prev => prev.map(p => ({ ...p, songIds: [] })));
        if (isPlaying) {
          setIsPlaying(false);
          if (audioRef.current) audioRef.current.pause();
        }
        setCurrentSong(null);
        timeActions.setCurrentTime(0);
        showToast('曲库已清空', `成功清除 ${data.count || 0} 首歌曲及播放队列`, 'success');
        return;
      }
    } catch (e) {
      console.error('Clear all songs error:', e);
    }
    setSongs([]);
    setPlayQueue([]);
    setPlaylists(prev => prev.map(p => ({ ...p, songIds: [] })));
    if (isPlaying) {
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
    setCurrentSong(null);
    timeActions.setCurrentTime(0);
    showToast('曲库已清空', '已重置本地曲库列表', 'info');
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
          src={currentSong?.url || (currentSong ? `/api/stream/${encodeURIComponent(currentSong.id)}` : undefined)}
          crossOrigin="anonymous"
          preload="auto"
          playsInline
          onPlay={() => {
            if ((window as any).__tinglanAudioCtx && (window as any).__tinglanAudioCtx.state === 'suspended') {
              (window as any).__tinglanAudioCtx.resume().catch(() => {});
            }
            if (audioRef.current) {
              audioRef.current.playbackRate = playbackSpeed;
            }
          }}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              timeActions.setCurrentTime(cur);

              // A-B Loop Logic: Seamless loop back to A when reaching B
              if (abLoopRef.current.enabled && abLoopRef.current.a !== null && abLoopRef.current.b !== null && abLoopRef.current.b > abLoopRef.current.a) {
                if (cur >= abLoopRef.current.b) {
                  audioRef.current.currentTime = abLoopRef.current.a;
                  timeActions.setCurrentTime(abLoopRef.current.a);
                  return;
                }
              }

              // Crossfade auto-advance near track end
              const curDuration = timeActions.getDuration();
              if (
                !isCasting &&
                audioSettings.crossfadeDuration > 0 &&
                repeatMode !== 'one' &&
                curDuration > 0 &&
                cur >= curDuration - audioSettings.crossfadeDuration &&
                cur < curDuration - 0.5 &&
                !isCrossfadingRef.current
              ) {
                isCrossfadingRef.current = true;
                handleCrossfadeToNext();
              }
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              timeActions.setDuration(audioRef.current.duration || currentSong?.duration || 200);
              audioRef.current.playbackRate = playbackSpeed;
            }
          }}
          onEnded={() => {
            if (sleepTimer.enabled && sleepTimer.stopAtEndOfSong) {
              setSleepTimer(prev => ({ ...prev, enabled: false, remainingSeconds: 0 }));
              setIsPlaying(false);
              if (audioRef.current) audioRef.current.pause();
              if (isCasting && activeDevice) {
                handleControlDevice(activeDevice.did, 'pause');
              }
              showToast('睡眠定时器已触发', '当前歌曲已播放完毕，已为您自动停止音乐播放', 'info');
              return;
            }

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

        {/* Top Warning Ribbon for Default Admin Password */}
        {isUsingDefaultAdminPassword && (
          <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 text-white text-xs px-4 py-2 flex items-center justify-between shadow-md relative z-50 animate-fade-in">
            <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="p-1 rounded bg-black/20 text-amber-200 flex-shrink-0 animate-pulse">⚠️</span>
                <span className="font-semibold truncate">
                  首次部署安全强提醒：当前管理员账号 (admin) 仍在使用默认弱密码 admin123，极易遭遇公网爆破。
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsForcePasswordModalOpen(true)}
                  className="px-3 py-1 rounded-lg bg-white text-zinc-900 font-bold hover:bg-amber-100 transition shadow-sm cursor-pointer"
                >
                  立即修改密码
                </button>
              </div>
            </div>
          </div>
        )}

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
              onCastSongToXiaomi={handleDirectCastSong}
              onCastAllToXiaomi={handleCastAllToXiaomi}
              onToggleFavorite={handleToggleFavorite}
              activeDevice={activeDevice}
              isCasting={isCasting}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onScanMusicDir={handleScanMusicDir}
              isScanning={isScanning}
              onCreatePlaylist={handleCreatePlaylist}
              onRenamePlaylist={handleRenamePlaylist}
              onToggleSongInPlaylist={handleToggleSongInPlaylist}
              onDeletePlaylist={handleDeletePlaylist}
              onClearAllSongs={handleClearAllSongs}
              onOpenNavidromeModal={() => setIsNavidromeModalOpen(true)}
              onBatchPlay={handleBatchPlay}
              onBatchCast={handleBatchCast}
              onBatchAddToQueue={handleBatchAddToQueue}
              onBatchAddToPlaylist={handleBatchAddToPlaylist}
              onBatchRemoveFromPlaylist={handleBatchRemoveFromPlaylist}
              onInspectSong={(song) => setInspectorSong(song)}
            />
          )}

          {activeTab === 'lyrics' && (
            <LyricsView
              currentSong={currentSong}
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
              onSelectDevice={handleSelectDevice}
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
          onPlayPause={handlePlayPause}
          onNext={handleNextSong}
          onPrev={handlePrevSong}
          onSeek={handleSeek}
          volume={volume}
          onVolumeChange={handleVolumeChange}
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
          sleepTimer={sleepTimer}
          onOpenSleepTimer={() => setIsSleepTimerModalOpen(true)}
          onOpenShortcuts={() => setIsShortcutsModalOpen(true)}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={handlePlaybackSpeedChange}
          queueCount={playQueue.length}
          speakerVolume={activeDevice?.status?.volume ?? 40}
          onSpeakerVolumeChange={(targetVol) => {
            if (activeDevice) {
              handleControlDevice(activeDevice.did, 'volume', targetVol);
            }
          }}
          onOpenVinyl={() => setIsVinylOpen(true)}
          onOpenMultiRoom={() => setIsMultiRoomOpen(true)}
          onOpenInspector={() => {
            if (currentSong) setInspectorSong(currentSong);
          }}
          abLoop={abLoop}
          onToggleABLoop={handleToggleABLoop}
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
          audioSettings={audioSettings}
          onAudioSettingsChange={setAudioSettings}
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
          onDeviceChange={(dev) => setActiveDeviceId(dev.did)}
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
                  timeActions.setCurrentTime(0);
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
            timeActions.setCurrentTime(0);
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
          onPlaylistsSynced={fetchPlaylistsFromBackend}
        />

        {/* Sleep Timer Configuration Modal */}
        <SleepTimerModal
          isOpen={isSleepTimerModalOpen}
          onClose={() => setIsSleepTimerModalOpen(false)}
          config={sleepTimer}
          onSaveConfig={(newConfig) => {
            setSleepTimer(newConfig);
            if (newConfig.enabled) {
              if (newConfig.stopAtEndOfSong) {
                showToast('睡眠定时器已设定', '播放完当前歌曲后将自动暂停', 'success');
              } else {
                showToast('睡眠定时器已开启', `设定为 ${newConfig.initialMinutes} 分钟后停止播放`, 'success');
              }
            } else {
              showToast('睡眠定时器已关闭', '已取消自动停止播放设定', 'info');
            }
          }}
        />

        {/* Keyboard Shortcuts Cheatsheet Modal */}
        <KeyboardShortcutsModal
          isOpen={isShortcutsModalOpen}
          onClose={() => setIsShortcutsModalOpen(false)}
        />

        {/* Fullscreen Immersive Vinyl Player Modal */}
        <VinylPlayerModal
          isOpen={isVinylOpen}
          onClose={() => setIsVinylOpen(false)}
          currentSong={currentSong}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onNext={handleNextSong}
          onPrev={handlePrevSong}
          onSeek={handleSeek}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          isShuffle={isShuffle}
          onToggleShuffle={() => setIsShuffle(prev => !prev)}
          repeatMode={repeatMode}
          onCycleRepeat={handleCycleRepeat}
          isCasting={isCasting}
          activeDevice={activeDevice}
          onToggleCast={handleToggleCast}
          abLoop={abLoop}
          onSetABLoop={(newLoop) => {
            setAbLoop(newLoop);
            if (newLoop.enabled) {
              showToast('A-B 区间复读已开启', `循环区间: ${formatTime(newLoop.a || 0)} 至 ${formatTime(newLoop.b || 0)}`, 'success');
            } else if (newLoop.a !== null && newLoop.b === null) {
              showToast(`已设定 A 点: ${formatTime(newLoop.a)}`, '请继续播放至复读终点后定 B 点', 'info');
            } else {
              showToast('已清除 A-B 区间复读', undefined, 'info');
            }
          }}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={handlePlaybackSpeedChange}
          onOpenEQ={() => setIsEQModalOpen(true)}
          onOpenInspector={() => {
            if (currentSong) setInspectorSong(currentSong);
          }}
        />

        {/* Multi-Room Speaker Group Cast Modal */}
        <MultiRoomCastModal
          isOpen={isMultiRoomOpen}
          onClose={() => setIsMultiRoomOpen(false)}
          devices={devices}
          currentSong={currentSong}
          onShowToast={(title, desc, type) => showToast(title, desc, type)}
          onRefreshDevices={fetchDevices}
        />

        {/* Audio Track Technical Inspector Modal */}
        <TrackInspectorModal
          isOpen={!!inspectorSong}
          onClose={() => setInspectorSong(null)}
          song={inspectorSong}
          onPlaySong={(s) => handlePlaySong(s)}
          onCastSong={(s) => handleDirectCastSong(s)}
          activeDevice={activeDevice}
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
        isDefaultAdminPassword={securityStatus?.isDefaultAdminPassword ?? false}
      />

      {/* Quick Theme Selector Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      {/* Force Change Admin Default Password Modal (P0 Security) */}
      <ForceChangePasswordModal
        isOpen={isForcePasswordModalOpen}
        onClose={() => {
          setIsForcePasswordModalOpen(false);
          setDismissedDefaultPasswordAlert(true);
        }}
        onPasswordChanged={() => {
          checkSecurityStatus();
          if (user) {
            setUser(prev => prev ? ({ ...prev, isDefaultPassword: false }) : null);
          }
          setSecurityStatus(prev => prev ? ({ ...prev, isDefaultAdminPassword: false }) : null);
          setDismissedDefaultPasswordAlert(true);
          showToast('管理员密码已成功更新！', '系统安全加固完成，初始弱口令已清除', 'success');
        }}
        username={user?.username || 'admin'}
      />

    </div>
  );
}

