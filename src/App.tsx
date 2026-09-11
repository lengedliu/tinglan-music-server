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
import { Song, Playlist, XiaomiDevice, MiotConfig, CastLog, User, SecurityStatus, DeviceCommandState } from './types';
import { INITIAL_SONGS, INITIAL_PLAYLISTS, INITIAL_XIAOMI_DEVICES } from './data/mockSongs';
import { apiFetch, setStoredAuthToken, getAuthToken } from './utils/api';
import { CheckCircle2, AlertCircle, Radio, X } from 'lucide-react';

export default function App() {
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

  // Navigation: 音乐曲库, 歌词播放, 智能音箱, Subsonic API, 设置
  const [activeTab, setActiveTab] = useState<'library' | 'lyrics' | 'xiaomi' | 'subsonic' | 'settings'>(() => {
    try {
      const saved = localStorage.getItem('tinglan_active_tab');
      return (saved === 'library' || saved === 'lyrics' || saved === 'xiaomi' || saved === 'subsonic' || saved === 'settings') ? saved : 'library';
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
  const [playlists, setPlaylists] = useState<Playlist[]>(INITIAL_PLAYLISTS);
  const [currentSong, setCurrentSong] = useState<Song | null>(INITIAL_SONGS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(INITIAL_SONGS[0]?.duration || 234);
  const [volume, setVolume] = useState(0.75);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('all');

  // Xiaomi Speaker & MIoT state
  const [devices, setDevices] = useState<XiaomiDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [isCasting, setIsCasting] = useState<boolean>(false);

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
  const [toastMessage, setToastMessage] = useState<{ title: string; desc?: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Auto-dismiss command status banner after completion
  useEffect(() => {
    if (commandState.status === 'success' || commandState.status === 'failed' || commandState.status === 'timeout') {
      const timer = setTimeout(() => {
        setCommandState({ status: 'idle' });
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [commandState.status, commandState.timestamp]);

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

  const showToast = (title: string, desc?: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ title, desc, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
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


  // Sync audio element volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Audio event handlers
  const handlePlayPause = () => {
    if (!currentSong) return;

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      if (isCasting && activeDevice) {
        handleControlDevice(activeDevice.did, 'pause');
      }
    } else {
      audioRef.current?.play().catch(() => {});
      setIsPlaying(true);
      if (isCasting && activeDevice && currentSong) {
        // Explicitly re-cast the current song stream URL to guarantee the exact track plays
        castSongToDevice(currentSong, activeDevice);
      }
    }
  };

  const handlePlaySong = (song: Song) => {
    setCurrentSong(song);
    setCurrentTime(0);
    setDuration(song.duration);

    const playSrc = (song.url && !song.url.includes('pixabay')) ? song.url : `/api/stream/${song.id}`;
    if (audioRef.current) {
      audioRef.current.src = playSrc;
      audioRef.current.play().catch(e => {
        console.warn('Audio play request error:', e);
      });
    }
    setIsPlaying(true);

    // If autoCast is on or currently in casting mode
    if (isCasting || miotConfig.autoCast) {
      castSongToDevice(song, activeDevice);
    }
  };

  const handleNextSong = () => {
    if (songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong?.id);
    let nextIndex = 0;

    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * songs.length);
    } else {
      nextIndex = (currentIndex + 1) % songs.length;
    }

    handlePlaySong(songs[nextIndex]);
  };

  const handlePrevSong = () => {
    if (songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong?.id);
    let prevIndex = 0;

    if (currentTime > 3) {
      // If played for more than 3 seconds, restart current track
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }

    if (isShuffle) {
      prevIndex = Math.floor(Math.random() * songs.length);
    } else {
      prevIndex = (currentIndex - 1 + songs.length) % songs.length;
    }

    handlePlaySong(songs[prevIndex]);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
    if (isCasting && activeDevice) {
      handleControlDevice(activeDevice.did, 'seek', Math.floor(time));
    }
  };

  const handleCycleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
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
    const streamUrl = `${miotConfig.serverHost}/api/stream/${encodeURIComponent(cleanId)}.mp3`;

    // 15-second timeout controller to detect un-reachable device
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 15000);

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

        // Add local log
        setCastLogs(prev => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'cast',
            message: `已下发投播指令到【${dev.name}】`,
            detail: `曲目: ${song.title} | 串流源: ${data.streamUrl || streamUrl}`,
            success: true
          },
          ...prev
        ]);

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
        const errorDesc = isTimeout
          ? '向音箱下发投播指令超时（8秒未响应），设备可能未联网或局域网不可达'
          : (err.message || '音箱拒绝或未响应投播请求');

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

        showToast(
          `投放到【${dev.name}】失败`,
          errorDesc,
          'error'
        );

        // Record real failure log
        setCastLogs(prev => [
          {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            type: 'cast',
            message: `投放失败【${dev.name}】`,
            detail: `${errorDesc} | 串流源: ${streamUrl}`,
            success: false
          },
          ...prev
        ]);
      });
  };

  const handleToggleCast = () => {
    if (isCasting) {
      setIsCasting(false);
      if (activeDevice) {
        handleControlDevice(activeDevice.did, 'pause');
      }
      showToast(`已断开与【${activeDevice?.name}】的投放`, '恢复为当前浏览器本地播放', 'info');
    } else {
      if (currentSong) {
        castSongToDevice(currentSong, activeDevice);
      } else {
        showToast('请先选择一首歌曲', '', 'info');
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
    <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col font-sans selection:bg-[#FF6700] selection:text-white relative overflow-x-hidden">
      
      {/* Immersive UI Background Ambient Glows */}
      <div className="fixed top-[-10%] right-[10%] w-[500px] h-[500px] bg-[#FF6700]/5 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] left-[10%] w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none z-0" />

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
              onCastSongToXiaomi={(song) => {
                handlePlaySong(song);
                castSongToDevice(song, activeDevice);
              }}
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
              onSongUpdated={(updated) => setSongs(prev => prev.map(s => s.id === updated.id ? updated : s))}
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
          playlist={songs}
          currentSong={currentSong}
          onSelectSong={handlePlaySong}
          onRemoveFromQueue={(songId) => setSongs(prev => prev.filter(s => s.id !== songId))}
          onClearQueue={() => {
            setSongs([]);
            setCurrentSong(null);
            setIsPlaying(false);
            setIsQueueDrawerOpen(false);
          }}
          isShuffle={isShuffle}
          onToggleShuffle={() => setIsShuffle(prev => !prev)}
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
        <div className="fixed top-20 right-6 z-[120] animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-[0_8px_32px_rgba(0,0,0,0.8)] text-xs max-w-sm">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : toastMessage.type === 'info' ? (
              <Radio className="w-5 h-5 text-[#FF6700] flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <h5 className="font-semibold text-zinc-100">{toastMessage.title}</h5>
              {toastMessage.desc && (
                <p className="text-zinc-300 mt-0.5 leading-relaxed">{toastMessage.desc}</p>
              )}
            </div>
            <button 
              onClick={() => setToastMessage(null)}
              className="text-zinc-400 hover:text-zinc-200 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
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

    </div>
  );
}

