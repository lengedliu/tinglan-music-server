import React, { useState, useEffect, useRef } from 'react';
import { 
  Radio, 
  Wifi, 
  WifiOff, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Mic2, 
  Server, 
  Settings, 
  Terminal, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle,
  Sparkles, 
  RefreshCw, 
  Info, 
  MessageSquare, 
  Send,
  Cast,
  Cpu,
  Tv,
  Smartphone,
  Plus,
  Activity,
  Trash2,
  Edit3,
  RotateCcw,
  X,
  LogOut,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  BookOpen,
  HelpCircle,
  ExternalLink,
  QrCode,
  Network,
  Code,
  Zap,
  Sliders,
  Eye,
  Layers,
  ArrowRight,
  FileText,
  Download,
  Bug,
  Database,
  Key
} from 'lucide-react';
import { XiaomiDevice, MiotConfig, CastLog, Song, DeviceCommandState } from '../types';
import { apiFetch, getAuthToken } from '../utils/api';
import QRCode from 'qrcode';

interface XiaomiSpeakerPanelProps {
  devices: XiaomiDevice[];
  activeDevice: XiaomiDevice | undefined;
  onSelectDevice: (did: string) => void;
  onControlDevice: (did: string, action: string, value?: any) => void;
  onSendTts: (did: string, text: string) => void;
  miotConfig: MiotConfig;
  onUpdateConfig: (newConfig: Partial<MiotConfig>) => void;
  castLogs: CastLog[];
  onScanDevices: () => void;
  isScanning: boolean;
  currentSong: Song | null;
  onCastCurrentSong: () => void;
  isCasting: boolean;
  commandState?: DeviceCommandState;
  onAddDevice?: (dev: { name: string; ip: string; did?: string; model?: string; hardware?: string; token?: string }) => void;
  onUpdateDevice?: (did: string, dev: Partial<XiaomiDevice>) => void;
  onDeleteDevice?: (did: string) => void;
  onClearDevices?: () => void;
  onResetDevices?: () => void;
  onDevicesUpdated?: (devices: XiaomiDevice[]) => void;
  onPingDevice?: (ip: string, port?: number) => Promise<{ reachable: boolean; latency: number; message: string }>;
  onOpenSecurityModal?: () => void;
}

export const XiaomiSpeakerPanel: React.FC<XiaomiSpeakerPanelProps> = ({
  devices,
  activeDevice,
  onSelectDevice,
  onControlDevice,
  onSendTts,
  miotConfig,
  onUpdateConfig,
  castLogs,
  onScanDevices,
  isScanning,
  currentSong,
  onCastCurrentSong,
  isCasting,
  commandState,
  onAddDevice,
  onUpdateDevice,
  onDeleteDevice,
  onClearDevices,
  onResetDevices,
  onDevicesUpdated,
  onPingDevice,
  onOpenSecurityModal
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'devices' | 'control' | 'tts' | 'rpc' | 'settings' | 'logs'>('devices');
  const [ttsInput, setTtsInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isUnbinding, setIsUnbinding] = useState(false);
  const [bindMode, setBindMode] = useState<'account' | 'qrcode' | 'token' | 'cookie'>('account');
  const [loginUsername, setLoginUsername] = useState(miotConfig.miUser || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [directToken, setDirectToken] = useState('');
  const [directIp, setDirectIp] = useState('192.168.31.');
  const [serviceTokenInput, setServiceTokenInput] = useState(miotConfig.serviceToken || '');
  const [passTokenInput, setPassTokenInput] = useState(miotConfig.passToken || '');
  const [userIdInput, setUserIdInput] = useState(miotConfig.userId || '');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccessMsg, setLoginSuccessMsg] = useState<string | null>(null);
  const [serverHostInput, setServerHostInput] = useState(miotConfig.serverHost || (typeof window !== 'undefined' ? window.location.origin : ''));
  const [showLoginSuccess, setShowLoginSuccess] = useState(false);
  const [showTokenTutorial, setShowTokenTutorial] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // QR Code Login State
  const [qrCodeData, setQrCodeData] = useState<{ qrUrl?: string; loginUrl?: string; lpUrl?: string } | null>(null);
  const [qrStatusText, setQrStatusText] = useState<string>('等待生成二维码');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isPollingQr, setIsPollingQr] = useState(false);
  const [qrSyncSuccess, setQrSyncSuccess] = useState<{ user: string; count: number } | null>(null);
  const qrPollingTimerRef = useRef<any>(null);

  // Mina WebSocket Live Monitor State
  const [minaWsStatus, setMinaWsStatus] = useState<{
    connected: boolean;
    activeSpeaker: string;
    lastPingTime: string;
    reconnectAttempts: number;
    messageCount: number;
    connectedSince: string;
  }>({
    connected: false,
    activeSpeaker: '',
    lastPingTime: '尚未连接',
    reconnectAttempts: 0,
    messageCount: 0,
    connectedSince: ''
  });
  const [minaLiveEvents, setMinaLiveEvents] = useState<any[]>([]);

  // Subnet & SSDP Discovery State
  const [subnetPrefix, setSubnetPrefix] = useState('192.168.31');
  const [isScanningSubnet, setIsScanningSubnet] = useState(false);
  const [subnetScanResult, setSubnetScanResult] = useState<string | null>(null);

  // Auto-detected active speaker from recent stream logs (excluding browser preview playback)
  const detectedStreamLog = castLogs?.find(l => l.ip && l.ip !== '127.0.0.1' && !(l as any).isBrowser && !devices.some(d => d.ip === l.ip));

  // Dual-Track & MIoT Spec Resolution State
  const [isResolving, setIsResolving] = useState(false);
  const [resolveMetrics, setResolveMetrics] = useState<{
    cloudFound: number;
    lanFound: number;
    hybridMerged: number;
    speakerConfirmed: number;
    nonSpeakerIgnored: number;
  } | null>(null);
  const [ignoredDevices, setIgnoredDevices] = useState<Array<{
    did: string;
    name: string;
    model: string;
    reason: string;
    source: string;
  }>>([]);
  const [showArchitectureGuide, setShowArchitectureGuide] = useState(false);
  const [showIgnoredModal, setShowIgnoredModal] = useState(false);

  // Diagnostic Log System Filter & Inspector State
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'cast' | 'sync' | 'error'>('all');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // MIoT Spec RPC Console State
  const [rpcSiid, setRpcSiid] = useState('2');
  const [rpcPiid, setRpcPiid] = useState('1');
  const [rpcAiid, setRpcAiid] = useState('1');
  const [rpcPropValue, setRpcPropValue] = useState('50');
  const [rpcActionParams, setRpcActionParams] = useState('[]');
  const [rpcRawMethod, setRpcRawMethod] = useState('get_prop');
  const [rpcRawParams, setRpcRawParams] = useState('["power"]');
  const [rpcResponse, setRpcResponse] = useState<any>(null);
  const [isExecutingRpc, setIsExecutingRpc] = useState(false);
  const [specDefinition, setSpecDefinition] = useState<any>(null);
  const [isLoadingSpec, setIsLoadingSpec] = useState(false);

  // SSE Live Event listener and WebSocket status polling
  useEffect(() => {
    const fetchWsStatus = async () => {
      try {
        const res = await apiFetch('/api/miot/ws/status');
        if (res.ok) {
          const data = await res.json();
          if (data.status) {
            setMinaWsStatus(data.status);
          }
          if (Array.isArray(data.recentEvents) && data.recentEvents.length > 0) {
            setMinaLiveEvents(data.recentEvents);
          }
        }
      } catch {}
    };

    fetchWsStatus();
    const interval = setInterval(fetchWsStatus, 8000);

    // Setup SSE connection
    let eventSource: EventSource | null = null;
    try {
      const token = getAuthToken();
      const sseUrl = token ? `/api/miot/events?token=${encodeURIComponent(token)}` : '/api/miot/events';
      eventSource = new EventSource(sseUrl);
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setMinaLiveEvents(prev => [parsed, ...prev.slice(0, 49)]);
        } catch {}
      };
    } catch {}

    return () => {
      clearInterval(interval);
      if (eventSource) {
        eventSource.close();
      }
      if (qrPollingTimerRef.current) {
        clearInterval(qrPollingTimerRef.current);
      }
    };
  }, []);

  // Fetch QR Code for Login
  const handleGenerateQrCode = async () => {
    setIsGeneratingQr(true);
    setLoginError(null);
    setQrSyncSuccess(null);
    setQrStatusText('正在向小米认证中心申请安全登录二维码...');
    try {
      const res = await apiFetch('/api/miot/passport/qrcode/get');
      const data = await res.json();
      if (data.success && (data.qr || data.loginUrl || data.qrUrl)) {
        let finalQrImage = data.qrUrl || data.qrCodeUrl || data.qrDataUrl || '';
        const qrScanTarget = data.qr || data.loginUrl;
        if (!finalQrImage.startsWith('data:image') && qrScanTarget) {
          try {
            finalQrImage = await QRCode.toDataURL(qrScanTarget, {
              width: 320,
              margin: 1,
              color: { dark: '#000000', light: '#ffffff' }
            });
          } catch {}
        }
        setQrCodeData({
          qrUrl: finalQrImage,
          loginUrl: data.loginUrl,
          lpUrl: data.lpUrl
        });
        setQrStatusText('请使用【米家 App / 手机相机 / 小米账号扫一扫】扫描');
        startQrCodePolling(data.loginUrl, data.lpUrl);
      } else {
        setLoginError(data.error || '获取登录二维码失败');
        setQrStatusText(data.error || '获取二维码失败，请点击重试');
      }
    } catch (err: any) {
      setLoginError(`请求二维码异常: ${err.message}`);
      setQrStatusText('网络异常，请点击重新刷新');
    } finally {
      setIsGeneratingQr(false);
    }
  };

  // Poll QR Code Login Status
  const startQrCodePolling = (loginUrl: string, lpUrl?: string) => {
    if (qrPollingTimerRef.current) {
      clearInterval(qrPollingTimerRef.current);
    }
    setIsPollingQr(true);

    qrPollingTimerRef.current = setInterval(async () => {
      try {
        const res = await apiFetch('/api/miot/passport/qrcode/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loginUrl, lpUrl })
        });
        const data = await res.json();

        if (data.status === 'scanned') {
          setQrStatusText('📱 手机已扫码！请在手机端点击【确认登录】');
        } else if (data.status === 'confirmed' && data.success) {
          clearInterval(qrPollingTimerRef.current);
          setIsPollingQr(false);
          const deviceCount = Array.isArray(data.devices) ? data.devices.length : 0;
          const userStr = data.user || '已授权用户';
          
          setQrSyncSuccess({ user: userStr, count: deviceCount });
          setQrStatusText(`✅ 登录与同步完成！共发现 ${deviceCount} 台小爱音箱设备`);
          setLoginSuccessMsg(`小米账号绑定成功 (${userStr})，已同步 ${deviceCount} 台音箱设备`);
          
          onUpdateConfig({
            isLoggedIn: true,
            miUser: userStr,
            bindMode: 'account',
            ...(data.config || {})
          });
          if (data.devices && Array.isArray(data.devices)) {
            onDevicesUpdated?.(data.devices);
          }
          setShowLoginSuccess(true);
          
          // Auto switch to devices tab after 1.8s so user directly sees the speakers!
          setTimeout(() => {
            setBindMode('account');
            setActiveSubTab('devices');
            setShowLoginSuccess(false);
          }, 1800);
        } else if (data.status === 'expired') {
          clearInterval(qrPollingTimerRef.current);
          setIsPollingQr(false);
          setQrStatusText('⌛ 二维码已过期，请点击重新刷新');
        } else if (data.success === false || data.status === 'error') {
          clearInterval(qrPollingTimerRef.current);
          setIsPollingQr(false);
          setLoginError(data.error || '扫码登录失败，请重试');
          setQrStatusText(data.error || '登录失败，请刷新二维码重新扫码');
        }
      } catch {
        // continue polling
      }
    }, 2000);
  };

  // Mina WebSocket Reconnect
  const handleReconnectMinaWs = async () => {
    try {
      const res = await apiFetch('/api/miot/ws/reconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLoginSuccessMsg('已发送 Mina WebSocket 重连请求');
        setTimeout(() => setLoginSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setLoginError(`重连失败: ${err.message}`);
    }
  };

  // Trigger Subnet Scan via XiaoAi Resolver Engine
  const handleSubnetScan = async () => {
    setIsScanningSubnet(true);
    setSubnetScanResult(null);
    try {
      const res = await apiFetch('/api/miot/devices/scan-subnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnetPrefix: subnetPrefix.trim() })
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) {
          setResolveMetrics(data.metrics);
        }
        if (data.ignoredDevices) {
          setIgnoredDevices(data.ignoredDevices);
        }
        setSubnetScanResult(
          `探测与解析完成！双轨检索云端(${data.metrics?.cloudFound ?? 0})与局域网Hello(${data.metrics?.lanFound ?? 0})，MIoT Spec 过滤确认 ${data.metrics?.speakerConfirmed ?? data.devices?.length ?? 0} 台小爱音箱${data.metrics?.nonSpeakerIgnored ? `（自动忽略 ${data.metrics.nonSpeakerIgnored} 台非音箱设备）` : ''}`
        );
        if (data.devices && Array.isArray(data.devices)) {
          onDevicesUpdated?.(data.devices);
        }
      } else {
        setSubnetScanResult(data.error || '网段扫描失败');
      }
    } catch (err: any) {
      setSubnetScanResult(`扫描异常: ${err.message}`);
    } finally {
      setIsScanningSubnet(false);
    }
  };

  // Full Dual-Track Discovery & Resolution Pipeline
  const handleFullResolve = async () => {
    setIsResolving(true);
    setLoginError(null);
    try {
      const res = await apiFetch('/api/miot/devices/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subnetPrefix: subnetPrefix.trim() })
      });
      const data = await res.json();
      if (data.success) {
        if (data.metrics) {
          setResolveMetrics(data.metrics);
        }
        if (data.ignoredDevices) {
          setIgnoredDevices(data.ignoredDevices);
        }
        if (data.devices && Array.isArray(data.devices)) {
          onDevicesUpdated?.(data.devices);
        }
        setLoginSuccessMsg(
          `双轨解析完成：MIoT Spec 确认 ${data.metrics?.speakerConfirmed || data.devices?.length || 0} 台音箱，双轨融合 ${data.metrics?.hybridMerged || 0} 台，过滤 ${data.metrics?.nonSpeakerIgnored || 0} 台非音箱`
        );
        setTimeout(() => setLoginSuccessMsg(null), 5000);
      } else {
        setLoginError(data.error || '解析失败');
      }
    } catch (err: any) {
      setLoginError(`双轨解析异常: ${err.message}`);
    } finally {
      setIsResolving(false);
    }
  };

  // Execute MIoT RPC Get Property
  const handleRpcGetProp = async () => {
    if (!activeDevice) return;
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      const res = await apiFetch('/api/miot/rpc/prop/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDevice.did,
          siid: Number(rpcSiid),
          piid: Number(rpcPiid)
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  // Execute MIoT RPC Set Property
  const handleRpcSetProp = async () => {
    if (!activeDevice) return;
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      let parsedVal: any = rpcPropValue;
      if (rpcPropValue === 'true') parsedVal = true;
      else if (rpcPropValue === 'false') parsedVal = false;
      else if (!isNaN(Number(rpcPropValue)) && rpcPropValue.trim() !== '') parsedVal = Number(rpcPropValue);

      const res = await apiFetch('/api/miot/rpc/prop/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDevice.did,
          siid: Number(rpcSiid),
          piid: Number(rpcPiid),
          value: parsedVal
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  // Execute MIoT RPC Action
  const handleRpcAction = async () => {
    if (!activeDevice) return;
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      let inParams: any[] = [];
      try {
        inParams = JSON.parse(rpcActionParams);
      } catch {}

      const res = await apiFetch('/api/miot/rpc/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDevice.did,
          siid: Number(rpcSiid),
          aiid: Number(rpcAiid),
          in: inParams
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  // Execute MIoT Raw Packet
  const handleRpcRaw = async () => {
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      let paramsVal: any = [];
      try {
        paramsVal = JSON.parse(rpcRawParams);
      } catch {
        paramsVal = [rpcRawParams];
      }

      const res = await apiFetch('/api/miot/rpc/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: activeDevice?.ip,
          token: activeDevice?.token,
          did: activeDevice?.did,
          method: rpcRawMethod,
          params: paramsVal
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  // Query Device Model MIoT Spec
  const handleLoadModelSpec = async (model: string) => {
    setIsLoadingSpec(true);
    try {
      const res = await apiFetch(`/api/miot/spec/${encodeURIComponent(model)}`);
      const data = await res.json();
      if (data.success && data.spec) {
        setSpecDefinition(data.spec);
      }
    } catch {
      setSpecDefinition(null);
    } finally {
      setIsLoadingSpec(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Ping test state
  const [pingResults, setPingResults] = useState<Record<string, { reachable: boolean; latency: number; message: string; timestamp: string }>>({});
  const [pingingDids, setPingingDids] = useState<Record<string, boolean>>({});

  // Helper to remove any internal prompt suffix from device names
  const cleanDeviceName = (name?: string) => {
    if (!name) return '小爱音箱';
    return name.replace(/\s*[\(（]点击(右侧)?编辑[\)）]/g, '').trim() || '小爱音箱';
  };

  // Add custom device modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDevName, setNewDevName] = useState('');
  const [newDevIp, setNewDevIp] = useState('192.168.31.');
  const [newDevModel, setNewDevModel] = useState('xiaomi.wifispeaker.l05b');
  const [newDevHardware, setNewDevHardware] = useState('L05B');
  const [newDevToken, setNewDevToken] = useState('');

  // Edit device modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<XiaomiDevice | null>(null);
  const [editDevName, setEditDevName] = useState('');
  const [editDevIp, setEditDevIp] = useState('');
  const [editDevDid, setEditDevDid] = useState('');
  const [editDevModel, setEditDevModel] = useState('');
  const [editDevHardware, setEditDevHardware] = useState('');
  const [editDevToken, setEditDevToken] = useState('');

  // Cloud Snapshot & Debug Modal State
  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(false);
  const [cloudSnapshots, setCloudSnapshots] = useState<any[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);

  const fetchCloudSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const res = await apiFetch('/api/miot/cloud/snapshots');
      const data = await res.json();
      if (data.success && Array.isArray(data.snapshots)) {
        setCloudSnapshots(data.snapshots);
      }
    } catch (err) {
      console.error('Failed to fetch cloud snapshots', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const handleClearSnapshots = async () => {
    try {
      await apiFetch('/api/miot/cloud/snapshots/clear', { method: 'POST' });
      setCloudSnapshots([]);
    } catch (err) {
      console.error('Failed to clear snapshots', err);
    }
  };

  const openSnapshotModal = () => {
    fetchCloudSnapshots();
    setIsSnapshotModalOpen(true);
  };

  const openEditModal = (dev: XiaomiDevice) => {
    setEditingDevice(dev);
    setEditDevName(dev.name);
    setEditDevIp(dev.ip);
    setEditDevDid(dev.did);
    setEditDevModel(dev.model || 'xiaomi.wifispeaker');
    setEditDevHardware(dev.hardware || 'Xiaoai');
    setEditDevToken(dev.token || '');
    setIsEditModalOpen(true);
  };

  const handleEditDeviceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice || !editDevName.trim() || !editDevIp.trim()) return;
    if (onUpdateDevice) {
      onUpdateDevice(editingDevice.did, {
        name: editDevName.trim(),
        ip: editDevIp.trim(),
        did: editDevDid.trim() || editingDevice.did,
        model: editDevModel.trim() || 'xiaomi.wifispeaker',
        hardware: editDevHardware.trim() || 'Xiaoai',
        token: editDevToken.trim() || undefined
      });
    }
    setIsEditModalOpen(false);
    setEditingDevice(null);
  };

  const handlePing = async (dev: XiaomiDevice) => {
    if (!dev.ip) {
      setPingResults(prev => ({
        ...prev,
        [dev.did]: {
          reachable: false,
          isMiio: false,
          latency: 0,
          message: '未获取局域网 IP（云端发现设备可通过右上角编辑手动填写局域网 IP）',
          timestamp: new Date().toLocaleTimeString()
        }
      }));
      return;
    }
    setPingingDids(prev => ({ ...prev, [dev.did]: true }));
    if (onPingDevice) {
      try {
        const res = await onPingDevice(dev.ip, 80);
        setPingResults(prev => ({
          ...prev,
          [dev.did]: {
            ...res,
            timestamp: new Date().toLocaleTimeString()
          }
        }));
      } catch (err: any) {
        setPingResults(prev => ({
          ...prev,
          [dev.did]: {
            reachable: false,
            latency: 0,
            message: err.message || '握手失败',
            timestamp: new Date().toLocaleTimeString()
          }
        }));
      }
    }
    setPingingDids(prev => ({ ...prev, [dev.did]: false }));
  };

  const handleAddDeviceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDevName.trim() || !newDevIp.trim()) return;
    if (onAddDevice) {
      onAddDevice({
        name: newDevName.trim(),
        ip: newDevIp.trim(),
        model: newDevModel.trim(),
        hardware: newDevHardware.trim()
      });
    }
    setIsAddModalOpen(false);
    setNewDevName('');
    setNewDevIp('192.168.31.');
  };

  const ttsPresets = [
    '正在为您播放 Tinglan 听澜高保真音乐',
    '小爱同学已就绪，已连接听澜音乐服务器',
    '主人，已为您切换到下一首发烧曲目',
    '小爱音箱提醒您：音量已设定至舒适区间',
    '准备就绪，开启晚安助眠伴奏'
  ];

  const handleSendTtsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttsInput.trim() || !activeDevice) return;
    onSendTts(activeDevice.did, ttsInput.trim());
    setTtsInput('');
  };

  const handleBrowserDebugPreview = (text: string) => {
    if (!text.trim()) return;
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.trim());
        utterance.lang = 'zh-CN';
        utterance.pitch = 1.0;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Browser TTS debug preview error', e);
      }
    }
  };

  const handlePresetTts = (text: string) => {
    if (!activeDevice) return;
    onSendTts(activeDevice.did, text);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      serverHost: serverHostInput.trim(),
      miUser: loginUsername.trim()
    });
    setShowLoginSuccess(true);
    setTimeout(() => setShowLoginSuccess(false), 3000);
  };

  const handleCookieInputPaste = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (!pastedText) return;

    // Check JSON .mi.token format
    if (pastedText.startsWith('{') || pastedText.includes('"userId"') || pastedText.includes('"micoapi"') || pastedText.includes('"passToken"')) {
      try {
        const parsed = JSON.parse(pastedText);
        if (parsed.userId) {
          e.preventDefault();
          setUserIdInput(String(parsed.userId).trim());
        }
        if (parsed.passToken) {
          e.preventDefault();
          setPassTokenInput(String(parsed.passToken).trim());
        }
        const sToken = parsed.micoapi?.serviceToken || parsed.serviceToken || parsed.xiaomiio?.serviceToken;
        if (sToken) {
          e.preventDefault();
          setServiceTokenInput(String(sToken).trim());
        }
        return;
      } catch {}
    }

    if (pastedText.includes('userId') || pastedText.includes('serviceToken') || pastedText.includes('passToken') || pastedText.includes('cUserId')) {
      e.preventDefault();
      // Prioritize pure numeric userId: userId=12345678 or uid=12345678
      const numericUidMatch = pastedText.match(/\b(?:userId|uid)\s*[:=]\s*["']?(\d{5,15})["']?/i);
      const rawUidMatch = pastedText.match(/(?:^|[\s;,])userId\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
      const fallbackUidMatch = pastedText.match(/(?:uid)\s*[:=]\s*["']?([^;\s,"'}{]+)/i);

      const tokenMatch = pastedText.match(/(?:serviceToken)\s*[:=]\s*["']?([^;\s,"'}{]+)/i);
      const passMatch = pastedText.match(/(?:passToken)\s*[:=]\s*["']?([^;\s,"'}{]+)/i);

      if (numericUidMatch) {
        setUserIdInput(numericUidMatch[1].trim());
      } else if (rawUidMatch) {
        setUserIdInput(rawUidMatch[1].trim());
      } else if (fallbackUidMatch) {
        setUserIdInput(fallbackUidMatch[1].trim());
      }

      if (tokenMatch) {
        setServiceTokenInput(tokenMatch[1].trim());
      }
      if (passMatch) {
        setPassTokenInput(passMatch[1].trim());
      }
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSuccessMsg(null);
    setIsLoggingIn(true);

    try {
      let bodyData: any = {};
      if (bindMode === 'account') {
        if (!loginUsername.trim() || !loginPassword.trim()) {
          setLoginError('请输入小米账号和密码');
          setIsLoggingIn(false);
          return;
        }
        bodyData = {
          mode: 'account',
          username: loginUsername.trim(),
          password: loginPassword.trim()
        };
      } else if (bindMode === 'token') {
        if (!directIp.trim() || !directToken.trim()) {
          setLoginError('请输入音箱局域网 IP 和 32 位 Token');
          setIsLoggingIn(false);
          return;
        }
        bodyData = {
          mode: 'token',
          ip: directIp.trim(),
          token: directToken.trim()
        };
      } else if (bindMode === 'cookie') {
        if (!userIdInput.trim()) {
          setLoginError('请输入小米 User ID（Cookie 中的 userId）');
          setIsLoggingIn(false);
          return;
        }
        if (!passTokenInput.trim() && !serviceTokenInput.trim()) {
          setLoginError('请输入 Pass Token（推荐）或 Service Token');
          setIsLoggingIn(false);
          return;
        }
        bodyData = {
          mode: 'cookie',
          userId: userIdInput.trim(),
          passToken: passTokenInput.trim(),
          serviceToken: serviceTokenInput.trim()
        };
      }

      const res = await apiFetch('/api/miot/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoginError(data.error || '登录认证失败，请检查账号密码！');
      } else {
        const syncedDevices = data.devices || [];
        if (onDevicesUpdated && Array.isArray(syncedDevices)) {
          onDevicesUpdated(syncedDevices);
        }
        if (onScanDevices) {
          onScanDevices();
        }

        const devCount = Array.isArray(syncedDevices) ? syncedDevices.length : 0;
        setLoginSuccessMsg(
          data.message || (devCount > 0 
            ? `绑定成功！已同步 ${devCount} 台小米智能音箱设备` 
            : '绑定成功！已关联小米云端服务')
        );
        onUpdateConfig({
          isLoggedIn: true,
          miUser: data.user || loginUsername.trim(),
          bindMode: bindMode,
          ...(data.config || {})
        });
        setLoginPassword('');
        setShowLoginSuccess(true);
        setTimeout(() => setShowLoginSuccess(false), 4000);
      }
    } catch (err: any) {
      setLoginError(`网络请求异常: ${err.message || '请检查服务端连通性'}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setIsUnbinding(true);
    setLoginError(null);
    try {
      const res = await apiFetch('/api/miot/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onUpdateConfig({
          isLoggedIn: false,
          miUser: '',
          userId: '',
          serviceToken: ''
        });
        setLoginSuccessMsg('已成功解除小米账号绑定');
        setTimeout(() => setLoginSuccessMsg(null), 3000);
      }
    } catch (e: any) {
      setLoginError(`解除绑定失败: ${e.message}`);
    } finally {
      setIsUnbinding(false);
    }
  };

  return (
    <div className="space-y-6 pb-28">
      
      {/* Top Banner with Immersive UI Styling */}
      <div className="relative overflow-hidden rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl p-6 sm:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/20 to-[#FF6700]/25 mix-blend-overlay pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
        <div className="absolute top-[-10%] right-[-5%] w-[350px] h-[350px] bg-[#FF6700]/15 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_10px_rgba(255,103,0,0.3)]">
                <Radio className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                播放协议控制中枢 (Cast Protocols Hub)
              </h1>
              <span className="text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                多协议路由在线
              </span>
              <span className={`text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border font-semibold flex items-center gap-1.5 ${
                minaWsStatus.connected 
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                  : 'bg-zinc-800 text-zinc-400 border-white/10'
              }`}>
                <Activity className={`w-3 h-3 ${minaWsStatus.connected ? 'text-blue-400 animate-pulse' : 'text-zinc-500'}`} />
                <span>Mina WS: {minaWsStatus.connected ? '长连接在线' : '离线/未连接'}</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-2xl leading-relaxed">
              Tinglan 家庭音乐控制层：支持 XiaoAi MIoT / Mina 智能音箱、DLNA / UPnP 局域网影音设备、AirPlay 音频路由及 Web Audio 本地高保真 DAC 声卡输出。
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3">
            {minaWsStatus.connected ? (
              <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span>已接收 {minaWsStatus.messageCount} 条小爱事件</span>
              </span>
            ) : (
              miotConfig.isLoggedIn && (
                <button
                  onClick={handleReconnectMinaWs}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs font-semibold border border-blue-500/30 transition"
                  title="重新建立 Mina WebSocket 长连接"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>重连 Mina WS</span>
                </button>
              )
            )}

            <button
              id="btn-scan-xiaomi-devices"
              onClick={onScanDevices}
              disabled={isScanning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold backdrop-blur-md border border-white/10 transition active:scale-95 disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-[#FF6700]' : ''}`} />
              <span>{isScanning ? '扫描设备中...' : '重新扫描设备'}</span>
            </button>

            {currentSong && (
              <button
                id="btn-cast-now-banner"
                onClick={onCastCurrentSong}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.35)] transition active:scale-95"
              >
                <Cast className="w-4 h-4" />
                <span>投放到【{cleanDeviceName(activeDevice?.name)}】</span>
              </button>
            )}
          </div>
        </div>

        {/* Phase 4: Stream Lifecycle State Banner */}
        {commandState && commandState.action === 'cast' && (
          <div className={`mt-6 p-4.5 rounded-2xl border backdrop-blur-md transition-all ${
            commandState.status === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
              : commandState.status === 'pending'
              ? 'bg-blue-950/40 border-blue-500/30 text-blue-200'
              : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cast className={`w-4 h-4 ${commandState.status === 'pending' ? 'animate-bounce text-blue-400' : commandState.status === 'success' ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="text-xs font-bold uppercase tracking-wider">
                  投播指令全生命周期追踪 ({commandState.status === 'pending' ? '下发推进中...' : commandState.status === 'success' ? '✓ 全链路通畅' : '✕ 下发失败'})
                </span>
              </div>
              {commandState.timestamp && (
                <span className="text-[11px] font-mono text-zinc-400">
                  {new Date(commandState.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>

            {/* Lifecycle Stages Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {(commandState.stageHistory || [
                { stage: 'COMMAND_SENT', label: '指令发送成功', success: true },
                { stage: 'DEVICE_ACK', label: '音箱握手确认', success: commandState.status === 'success' },
                { stage: 'STREAM_CONNECTED', label: '音频流建立', success: commandState.status === 'success' },
                { stage: 'PLAYING', label: '高保真播放中', success: commandState.status === 'success' }
              ]).map((step, idx) => (
                <div key={idx} className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
                  step.success
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : commandState.status === 'pending' && idx === 1
                    ? 'bg-blue-500/15 border-blue-500/30 text-blue-300 animate-pulse'
                    : 'bg-zinc-900/60 border-white/5 text-zinc-500'
                }`}>
                  {step.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : commandState.status === 'pending' && idx === 1 ? (
                    <RefreshCw className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400/60 flex-shrink-0" />
                  )}
                  <span className="truncate">{step.label}</span>
                </div>
              ))}
            </div>
            {commandState.error && (
              <div className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-medium space-y-2">
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <strong className="text-rose-200">投播未生效：</strong>
                    {commandState.error.includes('<!doctype html') || commandState.error.includes('HTTP 401')
                      ? '小米云端服务令牌 (serviceToken) 已过期或无此设备控制权限 (HTTP 401 Unauthorized)。请重新登录小米账号或使用局域网直连。'
                      : commandState.error}
                  </div>
                </div>
                {(commandState.error.includes('401') || commandState.error.includes('令牌') || commandState.error.includes('Unauthorized')) && (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-rose-500/15">
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('account')}
                      className="px-3 py-1 rounded-lg bg-[#FF6700]/20 hover:bg-[#FF6700]/30 text-[#FF6700] text-[11px] font-semibold border border-[#FF6700]/30 transition"
                    >
                      ➔ 前往【账号管理】重新登录
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('protocol')}
                      className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold border border-white/10 transition"
                    >
                      ➔ 切换为【局域网直连】
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sub-tabs with Immersive UI Pills */}
        <div className="relative z-10 flex items-center gap-2 pt-6 border-t border-white/10 mt-6 overflow-x-auto scrollbar-none">
          <button
            id="subtab-devices"
            onClick={() => setActiveSubTab('devices')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeSubTab === 'devices'
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            <Radio className="w-4 h-4 text-[#FF6700]" />
            <span>设备列表 ({devices.length})</span>
          </button>

          <button
            id="subtab-control"
            onClick={() => setActiveSubTab('control')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeSubTab === 'control'
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            <Volume2 className="w-4 h-4 text-emerald-400" />
            <span>音箱播控台</span>
          </button>

          <button
            id="subtab-tts"
            onClick={() => setActiveSubTab('tts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeSubTab === 'tts'
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <span>语音播报 (TTS)</span>
          </button>

          <button
            id="subtab-rpc"
            onClick={() => setActiveSubTab('rpc')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeSubTab === 'rpc'
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            <Code className="w-4 h-4 text-purple-400" />
            <span>MIoT RPC 控制台</span>
          </button>

          <button
            id="subtab-settings"
            onClick={() => setActiveSubTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeSubTab === 'settings'
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            <Settings className="w-4 h-4 text-blue-400" />
            <span>协议与串流配置</span>
          </button>

          <button
            id="subtab-logs"
            onClick={() => setActiveSubTab('logs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition whitespace-nowrap ${
              activeSubTab === 'logs'
                ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.2)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-white/5'
            }`}
          >
            <Terminal className="w-4 h-4 text-zinc-400" />
            <span>MIoT 指令流水 ({castLogs.length})</span>
          </button>
        </div>
      </div>

      {/* ---------------- Sub-tab 1: Devices List ---------------- */}
      {activeSubTab === 'devices' && (
        <div className="space-y-6">

          {/* Device List Header Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-zinc-900/40 border border-white/10 backdrop-blur-md">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#FF6700]" />
                小米智能音箱列表 ({devices.length} 台设备就绪)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                支持 mDNS/UPnP 广播自动发现、米家云端同步与手动指定内网静态 IP / Token 直连
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {devices.length > 0 && onClearDevices && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.confirm('确定要清空当前所有音箱设备吗？')) {
                      onClearDevices();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-zinc-800/60 hover:bg-rose-950/40 hover:text-rose-300 text-xs font-medium text-zinc-400 border border-white/5 transition active:scale-95 cursor-pointer"
                  title="清空当前列表所有设备"
                >
                  <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                  清空列表
                </button>
              )}

              <button
                onClick={handleFullResolve}
                disabled={isResolving}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-[0_0_15px_rgba(147,51,234,0.3)] transition active:scale-95 disabled:opacity-50"
                title="并行执行 Cloud 查询与 LAN miIO Hello 探测，通过 MIoT Spec 自动甄别音箱"
              >
                <Zap className={`w-3.5 h-3.5 ${isResolving ? 'animate-spin' : ''}`} />
                {isResolving ? '双轨解析中...' : '双轨发现与规范过滤'}
              </button>

              <button
                onClick={onScanDevices}
                disabled={isScanning}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/5 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[#FF6700]' : ''}`} />
                {isScanning ? '正在扫描/同步中...' : '重新扫描与同步'}
              </button>

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-xs font-semibold text-white shadow-[0_0_15px_rgba(255,103,0,0.3)] transition active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                手动添加音箱
              </button>
            </div>
          </div>

          {/* XiaoAi Discovery Architecture & MIoT Spec Pipeline Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/50 border border-white/10 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#FF6700]/10 text-[#FF6700] border border-[#FF6700]/20">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">
                      小米设备双轨发现与 MIoT Spec 规范解析架构
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      双轨融合引擎就绪
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Cloud 契约与 LAN miIO Hello 并行探测，DID 归一合并，基于 MIoT 规范自动研判与过滤音箱
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowArchitectureGuide(!showArchitectureGuide)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-white/5 transition flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{showArchitectureGuide ? '收起架构图' : '查看发现架构'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleFullResolve}
                  disabled={isResolving}
                  className="px-3.5 py-1.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_0_12px_rgba(255,103,0,0.3)] transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Zap className={`w-3.5 h-3.5 ${isResolving ? 'animate-spin' : ''}`} />
                  <span>{isResolving ? '解析中...' : '一键双轨解析'}</span>
                </button>
              </div>
            </div>

            {/* Metrics Strip */}
            {resolveMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-white/5">
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5">
                  <span className="text-[10px] text-zinc-500 block">云端检索 (Cloud)</span>
                  <span className="text-sm font-bold font-mono text-sky-400">{resolveMetrics.cloudFound} 台</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5">
                  <span className="text-[10px] text-zinc-500 block">局域网探测 (LAN miIO)</span>
                  <span className="text-sm font-bold font-mono text-amber-400">{resolveMetrics.lanFound} 台</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5">
                  <span className="text-[10px] text-zinc-500 block">双轨合并 (DID 归一)</span>
                  <span className="text-sm font-bold font-mono text-indigo-400">{resolveMetrics.hybridMerged} 台</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5">
                  <span className="text-[10px] text-zinc-500 block">小爱音箱 (MIoT 确认)</span>
                  <span className="text-sm font-bold font-mono text-emerald-400">{resolveMetrics.speakerConfirmed} 台</span>
                </div>
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">非音箱设备 (已过滤)</span>
                    <span className="text-sm font-bold font-mono text-rose-400">{resolveMetrics.nonSpeakerIgnored} 台</span>
                  </div>
                  {ignoredDevices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowIgnoredModal(true)}
                      className="text-[10px] px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition"
                    >
                      查看明细
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Visual Architecture Diagram (from user request) */}
            {showArchitectureGuide && (
              <div className="p-4 rounded-xl bg-zinc-950/80 border border-white/10 space-y-3 font-mono text-xs">
                <div className="text-zinc-300 font-bold flex items-center justify-between pb-2 border-b border-white/5">
                  <span>小爱设备发现与规范解析流 (Dual-Track Architecture)</span>
                  <span className="text-[11px] font-normal text-[#FF6700]">Xiaomi Cloud + LAN Discovery</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-sans">
                  <div className="p-3 rounded-lg bg-sky-950/30 border border-sky-500/20 space-y-1">
                    <div className="text-sky-400 font-bold flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5" />
                      1. Xiaomi Cloud 轨
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      调用米家 Mina / MIoT 云端接口，拉取用户账号名下设备，提取官方唯一 <span className="text-sky-300 font-mono">DID</span> 和 <span className="text-sky-300 font-mono">Model</span>。
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/20 space-y-1">
                    <div className="text-amber-400 font-bold flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5" />
                      2. LAN Discovery 轨
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      UDP 54321 向网段下发 <span className="text-amber-300 font-mono">miIO Hello</span> 握手帧，直接嗅探内网活跃设备的 <span className="text-amber-300 font-mono">DID</span> 与实时 <span className="text-amber-300 font-mono">IP</span>。
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/20 space-y-1">
                    <div className="text-indigo-400 font-bold flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      3. Device Resolver 引擎
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      以 <span className="text-indigo-300 font-bold font-mono">DID</span> 为唯一主键进行拓扑级联匹配，聚合云端令牌与局域网 IP，生成双轨融合设备表。
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-purple-950/30 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-sans">
                  <div className="space-y-1">
                    <div className="text-purple-400 font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      4. MIoT Spec 规范研判：判断是不是音箱
                    </div>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      依据官方 MIoT Spec 定义检索设备能力，匹配 <code className="text-purple-300 font-mono">device:speaker</code>、<code className="text-purple-300 font-mono">service:play-control</code>、<code className="text-purple-300 font-mono">service:intelligent-speaker</code>。
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                      ✓ 是 → 确认为小爱音箱
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30">
                      ✗ 否 → 自动过滤忽略
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Subnet Discovery & SSDP Probe Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Network className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    局域网主动探测与网段深度扫描 (Subnet UDP / SSDP Discovery)
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    向指定网段 (UDP 54321) 及 UPnP 广播频道下发 Hello 握手帧，直接探测局域网内的米家音箱
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-zinc-950/80 border border-white/10 rounded-xl px-2.5 py-1 text-xs text-zinc-300 font-mono">
                  <span>网段:</span>
                  <input
                    type="text"
                    value={subnetPrefix}
                    onChange={(e) => setSubnetPrefix(e.target.value)}
                    placeholder="192.168.31"
                    className="w-24 bg-transparent text-white focus:outline-none font-mono"
                  />
                  <span>.1~254</span>
                </div>

                <button
                  type="button"
                  onClick={handleSubnetScan}
                  disabled={isScanningSubnet}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md transition active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningSubnet ? 'animate-spin' : ''}`} />
                  <span>{isScanningSubnet ? '正在探测网段...' : '开始网段扫描'}</span>
                </button>
              </div>
            </div>

            {subnetScanResult && (
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-200 flex items-center gap-2 animate-fadeIn">
                <Info className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <span>{subnetScanResult}</span>
              </div>
            )}
          </div>

          {/* Empty State when no devices */}
          {devices.length === 0 && (
            <div className="p-8 sm:p-10 rounded-3xl bg-zinc-900/40 border border-dashed border-white/10 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-[#FF6700]/10 border border-[#FF6700]/20 flex items-center justify-center mx-auto text-[#FF6700]">
                <Radio className="w-7 h-7" />
              </div>
              <div className="space-y-2 max-w-lg mx-auto">
                <h4 className="text-base font-bold text-white">暂未发现可联动的小米音箱设备</h4>
                {miotConfig.isLoggedIn && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs text-left space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                      绑状态：已成功关联 {miotConfig.bindMode === 'cookie' ? 'ServiceToken 令牌' : '小米云端账号'} (UserID: {miotConfig.userId || '已授权'})
                    </p>
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      系统已轮询 Mina / 米家云端 11 个接口节点，云端返回该账号下未挂载默认主音箱。排查建议：
                      <br />1. 请确认该 ServiceToken 是在登录 <code className="text-amber-300 font-mono">mina.mi.com</code> 后从 Cookie 复制的。
                      <br />2. 若音箱处于同局域网下，强烈建议使用【手动添加音箱】直接输入音箱 IP (如 192.168.31.x) 实现直连播报！
                    </p>
                  </div>
                )}
                {!miotConfig.isLoggedIn && (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    系统遵循真实设备模式（0台=0台）。请在【账号与凭据】中授权同步米家云端音箱，或点击【+ 手动添加音箱】输入局域网 IP 直连。
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  onClick={onScanDevices}
                  disabled={isScanning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/10 transition active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[#FF6700]' : ''}`} />
                  {isScanning ? '正在调取云端与局域网...' : '重新调取云端与局域网'}
                </button>
                <button
                  onClick={openSnapshotModal}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold transition active:scale-95 cursor-pointer"
                >
                  <Bug className="w-3.5 h-3.5 text-purple-400" />
                  <span>抓包快照 / 查看云端原始数据</span>
                </button>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-xs font-semibold text-white shadow-[0_0_15px_rgba(255,103,0,0.3)] transition active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  手动添加音箱 (IP 直连)
                </button>
              </div>
            </div>
          )}

          {devices.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 text-center space-y-6">
              <div className="w-16 h-16 rounded-3xl bg-[#FF6700]/10 text-[#FF6700] border border-[#FF6700]/20 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,103,0,0.15)]">
                <Radio className="w-8 h-8" />
              </div>

              <div className="max-w-lg mx-auto space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold border border-white/5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  当前未发现音箱 (0 台)
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  {miotConfig.isLoggedIn ? '账号已成功绑定，但云端未检索到音箱设备' : '暂未接入小爱音箱设备'}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {miotConfig.isLoggedIn ? (
                    <>
                      已验证小米云端身份（用户: <span className="font-mono text-zinc-200">{cleanDeviceName(miotConfig.miUser || miotConfig.userId)}</span>），但米家/Mina 云端接口返回 0 台设备。设备可能由其他家庭成员绑定，或处于不同小米账号下。
                    </>
                  ) : (
                    '您可以前往绑定小米账号、扫描局域网，或直接输入音箱 IP 与 Token 进行局域网直连。'
                  )}
                </p>
              </div>

              {/* Detected Speaker from Audio Stream Log Banner */}
              {detectedStreamLog && (
                <div className="max-w-lg mx-auto p-4 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-500/30 text-left space-y-3 shadow-lg animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-xs font-bold text-emerald-300">📡 捕获到活跃小爱音箱连接</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">{detectedStreamLog.timestamp}</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    检测到来自 <strong className="text-emerald-300 font-mono">{detectedStreamLog.ip}</strong> 的音频流请求（<code className="text-emerald-400">HTTP 206</code> 接管成功），音箱已在拉取播放！可直接一键添加至受控列表：
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onAddDevice?.({
                        name: `小爱音箱 (${detectedStreamLog.ip})`,
                        ip: detectedStreamLog.ip!,
                        model: detectedStreamLog.model || 'wifispeaker',
                        hardware: 'XiaoAi Smart Speaker'
                      });
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>一键收录此音箱 (IP: {detectedStreamLog.ip})</span>
                  </button>
                </div>
              )}

              {/* Suggestions / Guidance */}
              <div className="max-w-lg mx-auto p-4 rounded-2xl bg-zinc-950/60 border border-white/5 text-left space-y-2.5 text-xs">
                <span className="font-semibold text-zinc-200 block text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF6700]" />
                  真实设备接入建议：
                </span>
                <ul className="space-y-1.5 text-[11px] text-zinc-400">
                  <li className="flex items-start gap-1.5">
                    <span className="text-[#FF6700] font-bold">1.</span>
                    <span><strong className="text-zinc-200">手动添加局域网 IP</strong>：直接点击下方「手动添加音箱」，填入音箱在路由器上的局域网 IP（例如 192.168.31.x）。</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-[#FF6700] font-bold">2.</span>
                    <span><strong className="text-zinc-200">局域网 Token 直连 (推荐)</strong>：在【协议配置】选择「方式三：局域网 Token 直连」，实现 0 延迟本地推流。</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-[#FF6700] font-bold">3.</span>
                    <span><strong className="text-zinc-200">主账号核对</strong>：若音箱为家庭共享设备，需登录最初绑定该音箱的小米主账号。</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_0_15px_rgba(255,103,0,0.35)] transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  手动添加音箱
                </button>

                <button
                  type="button"
                  onClick={openSnapshotModal}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/35 text-xs font-semibold transition active:scale-95 cursor-pointer"
                >
                  <Bug className="w-3.5 h-3.5 text-purple-400" />
                  <span>抓包排查：查看云端原始返回 (JSON)</span>
                </button>

                <button
                  type="button"
                  onClick={onScanDevices}
                  disabled={isScanning}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/10 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[#FF6700]' : ''}`} />
                  {isScanning ? '正在探测局域网...' : '重新扫描设备'}
                </button>

                {!miotConfig.isLoggedIn && (
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('settings')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-800/60 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 border border-white/5 transition cursor-pointer"
                  >
                    前往绑定小米账号
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {devices.map((dev) => {
                const isSelected = activeDevice?.did === dev.did;
                const isDevPlaying = dev.status?.playing;
                const pingInfo = pingResults[dev.did];
                const isPinging = pingingDids[dev.did];

                return (
                  <div
                    key={dev.did}
                    id={`device-card-${dev.did}`}
                    className={`p-6 rounded-3xl border transition-all relative overflow-hidden backdrop-blur-md ${
                      isSelected
                        ? 'bg-zinc-900/60 border-[#FF6700]/50 shadow-[0_0_25px_rgba(255,103,0,0.15)]'
                        : 'bg-zinc-900/40 border-white/5 hover:border-white/10'
                    }`}
                  >
                    {/* Top line indicator */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-2xl border ${
                          isSelected 
                            ? 'bg-[#FF6700]/20 text-[#FF6700] border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]' 
                            : 'bg-zinc-800/80 text-zinc-400 border-white/5'
                        }`}>
                          <Radio className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white tracking-tight">
                              {dev.name}
                            </h3>
                            {isSelected && (
                              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF6700] text-white font-bold shadow-[0_0_8px_rgba(255,103,0,0.5)]">
                                当前默认
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 font-mono mt-0.5">
                            型号: {dev.model} · 硬件: {dev.hardware}
                          </p>

                          {/* Source, Platform & Capability Tags */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {dev.source === 'hybrid' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                双轨融合 (Cloud+LAN)
                              </span>
                            )}
                            {dev.source === 'cloud' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                云端拉取
                              </span>
                            )}
                            {dev.source === 'lan' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                局域网 Hello 探测
                              </span>
                            )}

                            {dev.platform && (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-white/5">
                                {dev.platform === 'mina' ? 'Mina Cloud' : dev.platform === 'miio' ? 'miIO UDP' : 'MIoT'}
                              </span>
                            )}

                            {dev.capabilities?.hasTts && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                                TTS
                              </span>
                            )}
                            {dev.capabilities?.hasPlayControl && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                                播控
                              </span>
                            )}
                            {dev.capabilities?.hasVolumeControl && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
                                音量
                              </span>
                            )}
                            {dev.capabilities?.supportsDlna && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                                DLNA
                              </span>
                            )}
                            {dev.capabilities?.hasClock && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                                时钟
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          dev.deviceState === 'playing' ? 'bg-amber-400 animate-ping' :
                          dev.deviceState === 'connecting' ? 'bg-blue-400 animate-pulse' :
                          dev.deviceState === 'paused' ? 'bg-blue-400' :
                          dev.deviceState === 'error' ? 'bg-rose-500' :
                          dev.isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'
                        }`} />
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                          dev.deviceState === 'playing' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                          dev.deviceState === 'connecting' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                          dev.deviceState === 'paused' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                          dev.deviceState === 'error' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                          dev.isOnline ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}>
                          {dev.deviceState === 'playing' ? '▶ 播放中' :
                           dev.deviceState === 'connecting' ? '⏳ 握手连接中' :
                           dev.deviceState === 'paused' ? '⏸ 已暂停' :
                           dev.deviceState === 'error' ? '✕ 响应异常' :
                           dev.isOnline ? '✓ 在线待命' : '离线未连接'}
                        </span>
                      </div>
                    </div>

                    {/* Device Network & Hardware Info */}
                    <div className="grid grid-cols-2 gap-2 my-4 p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 text-xs">
                      <div>
                        <span className="text-zinc-500">局域网 IP:</span>
                        {dev.ip ? (
                          <span className="text-zinc-200 font-mono ml-1.5">{dev.ip}</span>
                        ) : (
                          <span className="text-amber-400 font-mono ml-1.5 text-[11px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            未获取 (云端设备)
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-zinc-500">设备 DID:</span>
                        <span className="text-zinc-200 font-mono ml-1.5">{dev.did}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">MAC 地址:</span>
                        <span className="text-zinc-200 font-mono ml-1.5">{dev.mac}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">当前音量:</span>
                        <span className="text-[#FF6700] font-mono font-bold ml-1.5">{dev.status?.volume ?? 40}%</span>
                      </div>

                      {/* Ping Handshake, Edit, and Delete Row */}
                      <div className="col-span-2 pt-2 mt-1 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handlePing(dev)}
                            disabled={isPinging}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/90 hover:bg-[#FF6700]/20 hover:text-[#FF6700] text-zinc-300 text-[11px] font-medium transition"
                            title="向音箱发起 TCP 握手测算延迟与连通性"
                          >
                            <Activity className={`w-3 h-3 ${isPinging ? 'animate-spin text-[#FF6700]' : ''}`} />
                            {isPinging ? '探测中...' : '测试握手 (Ping)'}
                          </button>

                          {pingInfo && (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono flex items-center gap-1 ${
                              pingInfo.reachable
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}>
                              {pingInfo.reachable ? `✓ 延迟 ${pingInfo.latency}ms` : `⚠ ${pingInfo.message}`}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Edit Device Button */}
                          <button
                            type="button"
                            onClick={() => openEditModal(dev)}
                            className="text-zinc-400 hover:text-[#FF6700] px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-[#FF6700]/10 border border-white/5 text-[11px] flex items-center gap-1 transition"
                            title="修改此音箱的名称、IP地址或硬件型号"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            编辑配置
                          </button>

                          {/* Delete Device Button */}
                          {onDeleteDevice && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDeleteDevice(dev.did);
                              }}
                              className="text-zinc-400 hover:text-rose-400 px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-rose-950/40 border border-white/5 text-[11px] flex items-center gap-1 transition active:scale-95 cursor-pointer"
                              title="从列表中移除此音箱"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              移除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Playback Status */}
                    <div className="mb-4">
                      {isDevPlaying ? (
                        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#FF6700]/10 border border-[#FF6700]/20 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <Radio className="w-4 h-4 text-[#FF6700] animate-pulse flex-shrink-0" />
                            <div className="min-w-0">
                              <span className="text-zinc-200 font-medium block truncate">
                                正在播音：{dev.status?.currentTitle}
                              </span>
                              <span className="text-zinc-400 text-[11px] block truncate">
                                {dev.status?.currentArtist}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => onControlDevice(dev.did, 'pause')}
                            className="px-3 py-1 rounded-full bg-[#FF6700] text-white text-xs font-semibold hover:bg-[#e55c00] transition shadow-sm"
                          >
                            暂停
                          </button>
                        </div>
                      ) : (
                        <div className="p-3 rounded-2xl bg-zinc-950/40 border border-white/5 text-xs text-zinc-500 flex items-center justify-between">
                          <span>当前处于空闲待命状态</span>
                          {currentSong && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSelectDevice(dev.did);
                                onCastCurrentSong();
                              }}
                              className="text-[#FF6700] hover:text-[#e55c00] font-semibold cursor-pointer"
                            >
                              投放到此音箱
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5">
                      <button
                        type="button"
                        id={`btn-select-device-${dev.did}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectDevice(dev.did);
                        }}
                        className={`flex-1 py-2.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-white/10 text-white border border-white/10'
                            : 'bg-zinc-800/80 hover:bg-[#FF6700] hover:text-white text-zinc-300'
                        }`}
                      >
                        {isSelected ? '已选为默认音箱' : '设为目标音箱'}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectDevice(dev.did);
                          setActiveSubTab('control');
                        }}
                        className="px-4 py-2.5 rounded-full bg-zinc-800/60 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-white/5 hover:border-white/10 transition cursor-pointer"
                      >
                        音量与播控
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Device Modal Dialog */}
          {isAddModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-zinc-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.25)]">
                      <Radio className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">手动接入小米音箱</h3>
                      <p className="text-xs text-zinc-400">支持不同子网或静态绑定的音箱设备</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleAddDeviceSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">设备自定义名称 *</label>
                    <input
                      type="text"
                      required
                      placeholder="例如：客厅小爱 Pro / 卧室音箱"
                      value={newDevName}
                      onChange={(e) => setNewDevName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 IP 地址 *</label>
                    <input
                      type="text"
                      required
                      placeholder="例如：192.168.31.155"
                      value={newDevIp}
                      onChange={(e) => setNewDevIp(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 font-mono focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1 font-medium">设备 Model</label>
                      <input
                        type="text"
                        value={newDevModel}
                        onChange={(e) => setNewDevModel(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1 font-medium">硬件代号</label>
                      <input
                        type="text"
                        value={newDevHardware}
                        onChange={(e) => setNewDevHardware(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 Token (可选)</label>
                    <input
                      type="text"
                      placeholder="32位十六进制 Token (免密/局域网直连使用)"
                      value={newDevToken}
                      onChange={(e) => setNewDevToken(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setIsAddModalOpen(false)}
                      className="px-5 py-2.5 rounded-full text-sm text-zinc-400 hover:text-zinc-200 transition"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={!newDevName.trim() || !newDevIp.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.35)] transition active:scale-95 disabled:opacity-50"
                    >
                      保存并接入
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Device Modal Dialog */}
          {isEditModalOpen && editingDevice && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-zinc-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.25)]">
                      <Edit3 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">编辑音箱配置</h3>
                      <p className="text-xs text-zinc-400">修改名称、局域网 IP 或型号硬件参数</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingDevice(null);
                    }}
                    className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleEditDeviceSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">设备名称 *</label>
                    <input
                      type="text"
                      required
                      placeholder="音箱名称"
                      value={editDevName}
                      onChange={(e) => setEditDevName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 IP 地址 *</label>
                    <input
                      type="text"
                      required
                      placeholder="例如：192.168.31.108"
                      value={editDevIp}
                      onChange={(e) => setEditDevIp(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 font-mono focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">设备 DID (设备唯一标识)</label>
                    <input
                      type="text"
                      placeholder="例如：381928471"
                      value={editDevDid}
                      onChange={(e) => setEditDevDid(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1 font-medium">Model 标识</label>
                      <input
                        type="text"
                        placeholder="xiaomi.wifispeaker.sound"
                        value={editDevModel}
                        onChange={(e) => setEditDevModel(e.target.value)}
                        className="w-full px-3.5 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1 font-medium">硬件代号</label>
                      <input
                        type="text"
                        placeholder="L16A / LX06"
                        value={editDevHardware}
                        onChange={(e) => setEditDevHardware(e.target.value)}
                        className="w-full px-3.5 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 Token (可选)</label>
                    <input
                      type="text"
                      placeholder={editingDevice?.hasToken ? `已配置Token (${editingDevice.tokenMasked || '已加密'})，留空保持原Token` : "32位十六进制 Token (留空则使用局域网自动协商)"}
                      value={editDevToken}
                      onChange={(e) => setEditDevToken(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        setEditingDevice(null);
                      }}
                      className="px-5 py-2.5 rounded-full text-sm text-zinc-400 hover:text-zinc-200 transition"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={!editDevName.trim() || !editDevIp.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.35)] transition active:scale-95 disabled:opacity-50"
                    >
                      保存修改
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Voice Cheat Sheet */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#FF6700]" />
              小爱同学语音唤醒与常用指令指南
            </h3>
            <p className="text-xs text-zinc-400">
              TingLan 与小米小爱音箱通过 MIoT Spec 和 Mina 协议双向打通，您可以直接通过语音或米家场景训练计划联动控制：
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5">
                <span className="text-xs font-semibold text-[#FF6700] block mb-1">“小爱同学，播放歌曲”</span>
                <p className="text-[11px] text-zinc-400">音箱恢复播放 TingLan 推送的音乐流，无需开启手机。</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5">
                <span className="text-xs font-semibold text-[#FF6700] block mb-1">“小爱同学，音量调到 50%”</span>
                <p className="text-[11px] text-zinc-400">精准调节音箱输出功率，TingLan 网页端控制台实时同步更新。</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5">
                <span className="text-xs font-semibold text-[#FF6700] block mb-1">“小爱同学，暂停 / 停止”</span>
                <p className="text-[11px] text-zinc-400">音箱停止本地 HTTP Range 音频拉取并进入静默待命状态。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Sub-tab 2: Remote Control ---------------- */}
      {activeSubTab === 'control' && !activeDevice && (
        <div className="p-12 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-[#FF6700]/10 text-[#FF6700] border border-[#FF6700]/20 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(255,103,0,0.15)]">
            <Radio className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-white">暂未选择或未发现小爱音箱</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            请先在【设备列表】中添加音箱、扫描局域网或选定默认播放音箱。
          </p>
          <button
            type="button"
            onClick={() => setActiveSubTab('list')}
            className="px-5 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_0_15px_rgba(255,103,0,0.3)] transition cursor-pointer"
          >
            返回设备列表
          </button>
        </div>
      )}

      {activeSubTab === 'control' && activeDevice && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Main Control Console with Immersive UI */}
          <div className="md:col-span-8 p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div>
                <span className="text-xs text-zinc-400">当前操作音箱</span>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  {activeDevice?.name}
                  {activeDevice?.ip ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 font-mono">
                      {activeDevice.ip}
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 font-sans">
                      云端接入 (未获取局域网IP)
                    </span>
                  )}
                </h3>
              </div>

              <span className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                activeDevice?.status?.playing 
                  ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_10px_rgba(255,103,0,0.2)]' 
                  : 'bg-zinc-800/80 text-zinc-400 border border-white/5'
              }`}>
                {activeDevice?.status?.playing && (
                  <span className="w-2 h-2 rounded-full bg-[#FF6700] animate-pulse shadow-[0_0_6px_rgba(255,103,0,0.8)]" />
                )}
                {activeDevice?.status?.playing ? '物理音箱: 正在串流播放' : '物理音箱: 待命闲置'}
              </span>
            </div>

            {/* UI Command Status vs Device State Banner */}
            {commandState && commandState.status !== 'idle' && (
              <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition ${
                commandState.status === 'pending'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse'
                  : commandState.status === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                <div className="flex items-center gap-2">
                  {commandState.status === 'pending' && (
                    <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                  {commandState.status === 'success' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  )}
                  {(commandState.status === 'failed' || commandState.status === 'timeout') && (
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                  <span className="font-medium">
                    {commandState.status === 'pending' && `正在向【${activeDevice?.name}】下发${commandState.action || '控制'}指令，等待音箱硬件确认...`}
                    {commandState.status === 'success' && `指令下发成功，音箱已确认执行 (${commandState.action || '操作完成'})`}
                    {commandState.status === 'failed' && `指令执行失败: ${commandState.error || '音箱未在预期内响应'}`}
                    {commandState.status === 'timeout' && `指令下发超时: 音箱未在超时期限内响应确认`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono opacity-70 flex-shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-black/40 border border-white/5">
                    UI: {commandState.status.toUpperCase()}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-black/40 border border-white/5">
                    Device: {activeDevice?.status?.playing ? 'PLAYING' : 'IDLE'}
                  </span>
                </div>
              </div>
            )}

            {/* Currently Playing Track on Speaker */}
            <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_rgba(255,103,0,0.2)]">
                  <Radio className={`w-6 h-6 ${activeDevice?.status?.playing ? 'animate-pulse' : ''}`} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white truncate">
                    {activeDevice?.status?.currentTitle || '暂未投放歌曲'}
                  </h4>
                  <p className="text-xs text-zinc-400 truncate">
                    {activeDevice?.status?.currentArtist || '从曲库点击“投放到音箱”开始点播'}
                  </p>
                  {activeDevice?.status?.streamUrl && (
                    <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                      源地址: {activeDevice.status.streamUrl}
                    </p>
                  )}
                </div>
              </div>

              {currentSong && (
                <button
                  onClick={onCastCurrentSong}
                  className="px-4 py-2 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_0_15px_rgba(255,103,0,0.3)] transition whitespace-nowrap"
                >
                  推送当前音乐
                </button>
              )}
            </div>

            {/* Remote Controller Buttons */}
            <div className="flex flex-col items-center justify-center gap-4 py-6">
              <div className="flex items-center gap-6">
                <button
                  id="btn-remote-prev"
                  onClick={() => onControlDevice(activeDevice!.did, 'prev')}
                  className="p-3.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition active:scale-95 shadow-sm"
                  title="上一首"
                >
                  <SkipBack className="w-6 h-6 fill-current" />
                </button>

                <button
                  id="btn-remote-play-pause"
                  onClick={() => onControlDevice(activeDevice!.did, activeDevice?.status?.playing ? 'pause' : 'play')}
                  className="w-16 h-16 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white flex items-center justify-center shadow-[0_4px_25px_rgba(255,103,0,0.4)] transition transform hover:scale-105 active:scale-95"
                >
                  {activeDevice?.status?.playing ? (
                    <Pause className="w-7 h-7 fill-current" />
                  ) : (
                    <Play className="w-7 h-7 fill-current ml-1" />
                  )}
                </button>

                <button
                  id="btn-remote-next"
                  onClick={() => onControlDevice(activeDevice!.did, 'next')}
                  className="p-3.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 transition active:scale-95 shadow-sm"
                  title="下一首"
                >
                  <SkipForward className="w-6 h-6 fill-current" />
                </button>
              </div>

              <span className="text-xs text-zinc-500 font-mono">
                MIoT 协议交互延迟约 80~200ms
              </span>
            </div>

            {/* Volume Dial / Slider */}
            <div className="space-y-3 p-4 rounded-2xl bg-zinc-950/60 border border-white/5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4 text-[#FF6700]" />
                  音箱输出音量
                </span>
                <span className="text-white font-mono font-bold">
                  {activeDevice?.status?.volume ?? 40}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={activeDevice?.status?.volume ?? 40}
                onChange={(e) => onControlDevice(activeDevice!.did, 'volume', e.target.value)}
                className="w-full h-2 bg-zinc-800 rounded-lg accent-[#FF6700] cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                <span>0% 静音</span>
                <span>25% 夜间伴听</span>
                <span>50% 居室标准</span>
                <span>75% Hi-Fi 发烧</span>
                <span>100% 派对最大</span>
              </div>
            </div>

          </div>

          {/* Side Info */}
          <div className="md:col-span-4 space-y-4">
            <div className="p-6 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                局域网串流连通保证
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                小米音箱通过本地 HTTP 协议拉取音频文件。请确保：
              </p>
              <ul className="text-xs text-zinc-400 space-y-2 list-disc list-inside">
                <li>音箱与 Tinglan 听澜服务器位于同一 WiFi / 局域网网段</li>
                <li>Docker 部署时建议使用 <code className="text-[#FF6700] bg-zinc-950 px-1 py-0.5 rounded font-mono">network_mode: host</code></li>
                <li>路由器已允许设备间跨端口访问（无 AP 隔离）</li>
              </ul>
            </div>

            <div className="p-6 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-3">
              <h4 className="text-sm font-bold text-white">快捷设备切换</h4>
              <div className="space-y-2">
                {devices.map(d => (
                  <button
                    key={d.did}
                    onClick={() => onSelectDevice(d.did)}
                    className={`w-full p-3 rounded-2xl text-left text-xs flex items-center justify-between transition ${
                      activeDevice?.did === d.did
                        ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 font-semibold shadow-[0_0_12px_rgba(255,103,0,0.15)]'
                        : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-300 border border-white/5'
                    }`}
                  >
                    <span className="truncate">{d.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">{d.status?.volume}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ---------------- Sub-tab 3: TTS Broadcast ---------------- */}
      {activeSubTab === 'tts' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Mic2 className="w-5 h-5 text-[#FF6700]" />
                小爱音箱语音广播 (Text-To-Speech)
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                向当前连接的【{activeDevice?.name}】发送文字，小爱同学将立刻使用其原生声音朗读播报。
              </p>
              <div className="mt-3 p-3 rounded-2xl bg-zinc-950/80 border border-white/10 flex items-center gap-2.5 text-xs text-zinc-300">
                <Sparkles className="w-4 h-4 text-[#FF6700] flex-shrink-0" />
                <span>
                  <strong>小爱硬件发音：</strong>点击【下发至小爱音箱】将直接通过 MIoT / 云端协议下发至物理音箱发声，电脑浏览器保持静音；若需要预览声音，可使用右侧【本地试听 (Debug / Preview)】。
                </span>
              </div>
            </div>

            {/* TTS Form */}
            <form onSubmit={handleSendTtsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">播报内容</label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={ttsInput}
                    onChange={(e) => setTtsInput(e.target.value)}
                    placeholder="输入要让小爱音箱朗读的文字内容..."
                    className="w-full px-4 py-3 bg-zinc-950/80 border border-white/10 rounded-2xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] focus:ring-1 focus:ring-[#FF6700] transition"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-zinc-500 hidden sm:inline">
                  支持中文、英文朗读，最大 200 字
                </span>
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleBrowserDebugPreview(ttsInput)}
                    disabled={!ttsInput.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-white/10 disabled:opacity-40 transition active:scale-95"
                    title="通过当前浏览器 Web Speech API 试听文字发音（仅调试预览，不下发音箱）"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>本地试听 (Debug / Preview)</span>
                  </button>

                  <button
                    type="submit"
                    disabled={!ttsInput.trim() || commandState?.status === 'pending'}
                    className="flex items-center gap-2 px-6 py-2 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs sm:text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.3)] disabled:opacity-50 transition active:scale-95"
                  >
                    {commandState?.status === 'pending' && commandState?.action === 'tts' ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>下发指令中...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>下发至小爱音箱</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Presets */}
            <div className="space-y-2 pt-4 border-t border-white/5">
              <span className="text-xs text-zinc-400 block font-medium">常用快捷播报词：</span>
              <div className="flex flex-wrap gap-2">
                {ttsPresets.map((preset, i) => (
                  <button
                    key={i}
                    onClick={() => handlePresetTts(preset)}
                    className="text-xs px-3.5 py-1.5 rounded-full bg-zinc-950/60 hover:bg-[#FF6700]/15 hover:text-[#FF6700] text-zinc-300 border border-white/5 hover:border-[#FF6700]/30 transition text-left"
                  >
                    “{preset}”
                  </button>
                ))}
              </div>
            </div>

            {/* Last TTS status */}
            {activeDevice?.status?.lastTts && (
              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/5 text-xs text-zinc-400 flex items-center justify-between">
                <span>最近一次播报内容：</span>
                <span className="text-[#FF6700] font-medium">“{activeDevice.status.lastTts}”</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Sub-tab: MIoT Spec RPC Console ---------------- */}
      {activeSubTab === 'rpc' && (
        <div className="space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-purple-400" />
                  MIoT Spec 指令调试控制台 (RPC Console)
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  直接向当前选中的音箱下发 MIoT Spec 规范指令 (SIID/PIID/AIID) 或通过局域网 UDP miIO / 米家云端发送原始 RPC 封包
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">目标设备:</span>
                <span className="text-xs font-mono font-semibold text-[#FF6700] px-2.5 py-1 rounded-xl bg-[#FF6700]/10 border border-[#FF6700]/20">
                  {cleanDeviceName(activeDevice?.name)} ({activeDevice?.ip || '未获取局域网IP'})
                </span>
              </div>
            </div>

            {/* Quick RPC Presets */}
            <div className="space-y-2">
              <span className="text-xs text-zinc-400 block font-medium">常用 MIoT Spec 快捷指令预设：</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setRpcSiid('2'); setRpcPiid('1'); }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-950/60 hover:bg-purple-500/20 text-xs text-zinc-300 hover:text-purple-300 border border-white/5 transition font-mono"
                >
                  读取音量 (siid:2, piid:1)
                </button>
                <button
                  type="button"
                  onClick={() => { setRpcSiid('2'); setRpcPiid('2'); }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-950/60 hover:bg-purple-500/20 text-xs text-zinc-300 hover:text-purple-300 border border-white/5 transition font-mono"
                >
                  读取静音 (siid:2, piid:2)
                </button>
                <button
                  type="button"
                  onClick={() => { setRpcSiid('3'); setRpcPiid('1'); }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-950/60 hover:bg-purple-500/20 text-xs text-zinc-300 hover:text-purple-300 border border-white/5 transition font-mono"
                >
                  读取播放状态 (siid:3, piid:1)
                </button>
                <button
                  type="button"
                  onClick={() => { setRpcSiid('3'); setRpcAiid('1'); setRpcActionParams('[]'); }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-950/60 hover:bg-purple-500/20 text-xs text-zinc-300 hover:text-purple-300 border border-white/5 transition font-mono"
                >
                  触发播放动作 (siid:3, aiid:1)
                </button>
                <button
                  type="button"
                  onClick={() => { setRpcRawMethod('miIO.info'); setRpcRawParams('[]'); }}
                  className="px-3 py-1.5 rounded-xl bg-zinc-950/60 hover:bg-purple-500/20 text-xs text-zinc-300 hover:text-purple-300 border border-white/5 transition font-mono"
                >
                  miIO.info 设备详情
                </button>
                {activeDevice?.model && (
                  <button
                    type="button"
                    onClick={() => handleLoadModelSpec(activeDevice.model)}
                    className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-xs text-purple-200 border border-purple-500/30 transition font-mono flex items-center gap-1"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>查看 {activeDevice.model} 官方 Spec</span>
                  </button>
                )}
              </div>
            </div>

            {/* RPC Operations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Form 1: MIoT Property / Action */}
              <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-400" />
                  MIoT 属性与动作调用
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Service ID (siid)</label>
                    <input
                      type="number"
                      value={rpcSiid}
                      onChange={(e) => setRpcSiid(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Property ID (piid)</label>
                    <input
                      type="number"
                      value={rpcPiid}
                      onChange={(e) => setRpcPiid(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1 font-mono">Action ID (aiid)</label>
                    <input
                      type="number"
                      value={rpcAiid}
                      onChange={(e) => setRpcAiid(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">设置属性值 (value):</label>
                  <input
                    type="text"
                    value={rpcPropValue}
                    onChange={(e) => setRpcPropValue(e.target.value)}
                    placeholder="例如: 50 或 true"
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-mono">动作输入参数 (in params JSON):</label>
                  <input
                    type="text"
                    value={rpcActionParams}
                    onChange={(e) => setRpcActionParams(e.target.value)}
                    placeholder="[]"
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleRpcGetProp}
                    disabled={isExecutingRpc || !activeDevice}
                    className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/10 transition active:scale-95 disabled:opacity-50"
                  >
                    读取属性 (Get Prop)
                  </button>
                  <button
                    type="button"
                    onClick={handleRpcSetProp}
                    disabled={isExecutingRpc || !activeDevice}
                    className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                  >
                    设置属性 (Set Prop)
                  </button>
                  <button
                    type="button"
                    onClick={handleRpcAction}
                    disabled={isExecutingRpc || !activeDevice}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50"
                  >
                    执行动作 (Action)
                  </button>
                </div>
              </div>

              {/* Form 2: Raw miIO UDP / Cloud RPC */}
              <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  原始 miIO / Cloud RPC 封包测试
                </h4>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-mono">RPC Method</label>
                  <input
                    type="text"
                    value={rpcRawMethod}
                    onChange={(e) => setRpcRawMethod(e.target.value)}
                    placeholder="get_prop / miIO.info / set_properties"
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1 font-mono">RPC Params (JSON 数组或对象)</label>
                  <textarea
                    rows={3}
                    value={rpcRawParams}
                    onChange={(e) => setRpcRawParams(e.target.value)}
                    placeholder='["power", "volume"]'
                    className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleRpcRaw}
                    disabled={isExecutingRpc}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50 shadow-md flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isExecutingRpc ? '正在发送 RPC 请求...' : '发送原始 RPC 封包'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Response Console */}
            {rpcResponse && (
              <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-2 animate-fadeIn font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="text-zinc-400 flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>RPC 响应返回结果</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(rpcResponse, null, 2), 'rpc_res')}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition flex items-center gap-1"
                  >
                    {copiedKey === 'rpc_res' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'rpc_res' ? '已复制' : '复制 JSON'}</span>
                  </button>
                </div>
                <pre className="text-xs text-emerald-400 overflow-x-auto p-2 bg-zinc-950 rounded-xl max-h-60 leading-relaxed">
                  {JSON.stringify(rpcResponse, null, 2)}
                </pre>
              </div>
            )}

            {/* Spec Definition Modal / View */}
            {specDefinition && (
              <div className="p-5 rounded-2xl bg-zinc-950 border border-purple-500/30 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    MIoT Spec 官方服务与属性定义 ({specDefinition.type})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSpecDefinition(null)}
                    className="text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto space-y-2 text-xs">
                  {Array.isArray(specDefinition.services) && specDefinition.services.map((svc: any) => (
                    <div key={svc.iid} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center justify-between font-mono text-purple-300 font-semibold">
                        <span>SIID {svc.iid}: {svc.description || svc.type}</span>
                        <span className="text-[10px] text-zinc-500 font-normal">{svc.properties?.length || 0} 属性 / {svc.actions?.length || 0} 动作</span>
                      </div>
                      {Array.isArray(svc.properties) && svc.properties.length > 0 && (
                        <div className="mt-1.5 pl-2 text-[11px] text-zinc-400 space-y-0.5 font-mono">
                          {svc.properties.map((p: any) => (
                            <div key={p.iid} className="flex items-center justify-between">
                              <span>PIID {p.iid}: {p.description || p.type} ({p.format})</span>
                              <span className="text-zinc-500 text-[10px]">{p.access?.join('/') || 'rw'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Sub-tab 4: Protocol & Settings ---------------- */}
      {activeSubTab === 'settings' && (
        <div className="space-y-6">
          
          {showLoginSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>配置更新已保存并同步至 Tinglan 听澜后端引擎！</span>
            </div>
          )}

          {/* System Security & Remote Access Protection */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#FF6700]" />
                  系统登录与外网访问安全保护
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  通过公网 IP、DDNS 或内网穿透（FRP / NPS / Cloudflare）暴露到外网时，开启登录保护可防止被未经授权的人员随意播放或控制音箱。
                </p>
              </div>

              {onOpenSecurityModal && (
                <button
                  type="button"
                  onClick={onOpenSecurityModal}
                  className="px-4 py-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#FF6700]" />
                  <span>配置登录与防护策略</span>
                </button>
              )}
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 flex items-start gap-2.5 text-xs text-zinc-400">
              <Info className="w-4 h-4 text-[#FF6700] flex-shrink-0 mt-0.5" />
              <span>
                <strong>音箱直连白名单保障：</strong> 即使开启全域登录保护，小爱音箱拉取歌曲音频流 (<code className="text-[#FF6700] font-mono">/api/stream/*</code>) 依然自动享有免密硬件直通，音箱播放不受任何影响。
              </span>
            </div>
          </div>

          {/* Server Host & LAN Audio Stream Config */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-5">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" />
              局域网音频串流地址 (Server Host)
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              小米音箱在接收到播放指令后，会通过 HTTP GET 向此地址请求音乐流文件。如果运行在 Docker / NAS 环境，请输入宿主机局域网 IP（例如：<code className="text-[#FF6700] font-mono">http://192.168.1.50:3000</code>）。
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5 font-medium">当前服务器串流地址</label>
                <input
                  type="text"
                  value={serverHostInput}
                  onChange={(e) => setServerHostInput(e.target.value)}
                  placeholder="http://192.168.1.100:3000"
                  className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <input
                    id="checkbox-tts-announce"
                    type="checkbox"
                    checked={miotConfig.ttsAnnouncement}
                    onChange={(e) => onUpdateConfig({ ttsAnnouncement: e.target.checked })}
                    className="w-4 h-4 rounded accent-[#FF6700] bg-zinc-950"
                  />
                  <label htmlFor="checkbox-tts-announce" className="text-xs text-zinc-300 cursor-pointer">
                    开始播放前由小爱播报歌名
                  </label>
                </div>

                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.3)] transition"
                >
                  保存网络配置
                </button>
              </div>
            </form>
          </div>

          {/* Xiaomi Account Cloud & Token Authentication */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Radio className="w-5 h-5 text-[#FF6700]" />
                  小爱音箱服务接入授权与绑定
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  真实对接小米云端 Passport 及局域网 MIoT 协议，支持双向真实鉴权与免密直连。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('logs');
                    setLogTypeFilter('sync');
                  }}
                  className="text-xs px-3 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-white/10 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="跳转至 MIoT 指令流水查看账号授权与同步历史"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>查看绑定日志</span>
                </button>

                <span className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                  miotConfig.isLoggedIn 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-zinc-800 text-zinc-400 border border-white/5'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${miotConfig.isLoggedIn ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                  {miotConfig.isLoggedIn ? `已绑定 (${miotConfig.miUser || '小米服务'})` : '未绑定/未登录'}
                </span>

                {miotConfig.isLoggedIn && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={isUnbinding}
                    className="text-xs px-3 py-1 rounded-full bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition disabled:opacity-50 flex items-center gap-1"
                  >
                    {isUnbinding ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                    <span>解除绑定</span>
                  </button>
                )}
              </div>
            </div>

            {/* Error Message Box */}
            {loginError && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">绑定失败或凭据错误</p>
                  <p className="mt-0.5 text-rose-200/90 leading-relaxed">{loginError}</p>
                </div>
              </div>
            )}

            {/* Success Message Box */}
            {loginSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="font-medium">{loginSuccessMsg}</span>
              </div>
            )}

            {/* Binding Mode Tabs */}
            <div className="flex flex-wrap border-b border-white/5 pb-2 gap-2 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setBindMode('account'); setLoginError(null); }}
                className={`px-3 py-1.5 rounded-xl transition ${
                  bindMode === 'account'
                    ? 'bg-[#FF6700] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 bg-white/5'
                }`}
              >
                方式一：小米账号密码云端登录
              </button>
              <button
                type="button"
                onClick={() => { setBindMode('qrcode'); setLoginError(null); if (!qrCodeData) handleGenerateQrCode(); }}
                className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1.5 ${
                  bindMode === 'qrcode'
                    ? 'bg-[#FF6700] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 bg-white/5'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>方式二：手机扫码一键登录 (免密安全)</span>
              </button>
              <button
                type="button"
                onClick={() => { setBindMode('token'); setLoginError(null); }}
                className={`px-3 py-1.5 rounded-xl transition ${
                  bindMode === 'token'
                    ? 'bg-[#FF6700] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 bg-white/5'
                }`}
              >
                方式三：局域网 Token 直连 (免 2FA)
              </button>
              <button
                type="button"
                onClick={() => { setBindMode('cookie'); setLoginError(null); }}
                className={`px-3 py-1.5 rounded-xl transition ${
                  bindMode === 'cookie'
                    ? 'bg-[#FF6700] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 bg-white/5'
                }`}
              >
                方式四：手动 Token / PassToken (支持 www.mi.com Cookie)
              </button>
            </div>

            {bindMode === 'qrcode' && (
              <div className="p-6 rounded-2xl bg-zinc-950/80 border border-white/5 space-y-4 text-center">
                <div className="max-w-md mx-auto space-y-3">
                  <h4 className="text-sm font-bold text-white flex items-center justify-center gap-2">
                    <QrCode className="w-4 h-4 text-[#FF6700]" />
                    小米安全扫码授权登录
                  </h4>

                  {qrSyncSuccess || (qrStatusText && (qrStatusText.includes('登录成功') || qrStatusText.includes('同步完成'))) ? (
                    <div className="p-6 rounded-2xl bg-gradient-to-b from-emerald-500/15 to-emerald-500/5 border border-emerald-500/30 text-center space-y-4 my-2">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/60 flex items-center justify-center mx-auto text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.35)]">
                        <Check className="w-8 h-8 stroke-[3]" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-bold text-white flex items-center justify-center gap-1.5">
                          <span>小米账号授权成功</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-normal">已连接</span>
                        </h4>
                        <p className="text-xs text-zinc-300">
                          账号：<span className="text-emerald-300 font-semibold">{qrSyncSuccess?.user || miotConfig.miUser || '已授权'}</span>
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          {(qrSyncSuccess?.count ?? devices.length) > 0 
                            ? `已成功同步 ${(qrSyncSuccess?.count ?? devices.length)} 台小爱音箱设备` 
                            : '已完成账号绑定，云端与长连接准备就绪'}
                        </p>
                      </div>

                      <div className="pt-2 flex flex-col gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setBindMode('account');
                            setActiveSubTab('devices');
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>立即前往音箱设备列表</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateQrCode}
                          className="text-xs text-zinc-400 hover:text-zinc-200 transition py-1"
                        >
                          重新扫码更换账号
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-200/90 text-left space-y-1.5">
                        <p className="font-semibold flex items-center gap-1.5 text-emerald-300 text-xs">
                          <Check className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                          支持「米家 App」直接扫码授权
                        </p>
                        <p className="text-zinc-300 text-[11px] leading-relaxed">
                          已切换为官方<strong>米家 (MIoT) 原生授权二维码</strong>，你可以通过以下方式扫码：
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-emerald-200/80 pl-1 leading-relaxed">
                          <li><strong>方式 1（推荐）</strong>：打开<strong>【米家 App】➔ 右上角「+」或「扫一扫」</strong>，扫描二维码并在手机上点击<strong>确认授权</strong>。</li>
                          <li><strong>方式 2</strong>：使用手机自带<strong>【系统相机】</strong>或<strong>【微信扫一扫】</strong>对准二维码打开授权页。</li>
                          <li><strong>方式 3（小米/Redmi 手机）</strong>：进入手机<strong>【设置】➔ 顶部【小米账号】➔ 右上角【扫一扫】</strong>。</li>
                        </ul>
                      </div>

                      <div className="p-4 bg-white rounded-2xl inline-block shadow-lg relative my-2">
                        {isGeneratingQr ? (
                          <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-zinc-600">
                            <RefreshCw className="w-8 h-8 animate-spin text-[#FF6700]" />
                            <span className="text-xs">正在申请二维码...</span>
                          </div>
                        ) : qrCodeData?.qrUrl ? (
                          <img
                            src={qrCodeData.qrUrl}
                            alt="Xiaomi QR Code"
                            className="w-56 h-56 rounded-lg object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-zinc-600">
                            <QrCode className="w-10 h-10 text-zinc-400" />
                            <span className="text-xs">暂无可用二维码</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex items-center justify-center gap-2 text-xs">
                          {isPollingQr && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                          <span className="text-zinc-300 font-medium">
                            {qrStatusText || '请使用米家 App 扫码'}
                          </span>
                        </div>

                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={handleGenerateQrCode}
                            disabled={isGeneratingQr}
                            className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-white/10 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingQr ? 'animate-spin text-[#FF6700]' : ''}`} />
                            <span>刷新二维码</span>
                          </button>

                          {(qrCodeData?.qr || qrCodeData?.loginUrl) && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(qrCodeData.qr || qrCodeData.loginUrl!, 'qr_link')}
                              className="px-3.5 py-1.5 rounded-xl bg-[#FF6700]/20 hover:bg-[#FF6700]/30 text-xs font-semibold text-[#FF6700] border border-[#FF6700]/30 transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                              title="复制手机端授权登录网页链接"
                            >
                              {copiedKey === 'qr_link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedKey === 'qr_link' ? '已复制登录链接' : '复制授权登录链接'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {bindMode !== 'qrcode' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
              {bindMode === 'account' && (
                <>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    系统将通过小米官方 Passport 鉴权接口（<code className="text-zinc-300 font-mono">serviceLoginAuth2</code>）进行真实验证。输入错误的账号或密码将立即被小米服务器拦截并返回确切错误。
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5 font-medium">小米账号 / 邮箱 / 手机号</label>
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="user@xiaomi.com 或 138xxxxxxxx"
                        className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5 font-medium">小米账号密码</label>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
                      />
                    </div>
                  </div>
                </>
              )}

              {bindMode === 'token' && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      直接使用音箱局域网 IP 与 32 位通讯 Token 绑定，采用真实 miIO UDP 54321 协议直连，完全不受小米两步验证 (2FA) 影响。
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowTokenTutorial(!showTokenTutorial)}
                      className="flex items-center gap-1 text-xs text-[#FF6700] hover:text-[#ff8533] transition flex-shrink-0 font-medium ml-2 px-2 py-1 rounded-lg bg-[#FF6700]/10 hover:bg-[#FF6700]/20 border border-[#FF6700]/20"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>{showTokenTutorial ? '收起获取教程' : '如何获取 Token？'}</span>
                      {showTokenTutorial ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Token Extraction Guide Box */}
                  {showTokenTutorial && (
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-[#FF6700]/30 space-y-4 text-xs text-zinc-300 shadow-xl animate-fadeIn">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <span className="font-bold text-white flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-[#FF6700]" />
                          三种常用获取小爱音箱 32 位 Token 的方法
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">100% 官方离线协议</span>
                      </div>

                      {/* Method 1 */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#FF6700]">方法一：一键式开源提取工具（最推荐，免配环境）</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">耗时约 1 分钟</span>
                        </div>
                        <p className="text-zinc-400 leading-relaxed text-[11px]">
                          使用开源项目 <strong className="text-white">Xiaomi-cloud-tokens-extractor</strong>（GitHub 开源），下载即可直接运行：
                        </p>
                        <ol className="list-decimal list-inside space-y-1 text-zinc-400 text-[11px] pl-1">
                          <li>前往 GitHub 搜索下载 <code className="text-white bg-white/10 px-1 py-0.5 rounded">token_extractor.exe</code>（或 Python 脚本）。</li>
                          <li>双击打开后，按提示输入您的小米账号与密码，服务器选 <code className="text-[#FF6700] font-mono">cn</code>。</li>
                          <li>程序将自动列出您名下所有小爱音箱的 <strong>名称、局域网 IP、DID</strong> 以及 <strong>32位 Token</strong>，复制粘贴回上方即可。</li>
                        </ol>
                      </div>

                      {/* Method 2 */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-blue-400">方法二：Python 命令行工具 (python-miio)</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard('pip install python-miio\nmiiocli cloud', 'py_cmd')}
                            className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 font-mono flex items-center gap-1 transition"
                          >
                            {copiedKey === 'py_cmd' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === 'py_cmd' ? '已复制命令' : '复制命令'}</span>
                          </button>
                        </div>
                        <p className="text-zinc-400 leading-relaxed text-[11px]">
                          电脑已安装 Python 的用户，只需在终端中执行：
                        </p>
                        <div className="p-2 rounded bg-black/80 font-mono text-[11px] text-emerald-400 border border-white/10">
                          <code>pip install python-miio</code><br />
                          <code>miiocli cloud</code>
                        </div>
                        <p className="text-[11px] text-zinc-400">输入账号后将完整输出当前账号所有设备 Token 列表。</p>
                      </div>

                      {/* Method 3 */}
                      <div className="space-y-1.5 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                        <span className="font-semibold text-purple-400">方法三：魔改版米家 App / 开发者日志 (Android)</span>
                        <p className="text-zinc-400 leading-relaxed text-[11px]">
                          使用 Android 手机或模拟器安装第三方增强版米家（如 Vevs 俄版米家），在设备信息页会直接明文展示 32 位 Token。
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5 font-medium">小爱音箱局域网 IP</label>
                      <input
                        type="text"
                        value={directIp}
                        onChange={(e) => setDirectIp(e.target.value)}
                        placeholder="192.168.31.108"
                        className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5 font-medium">32位 Device Token</label>
                      <input
                        type="text"
                        value={directToken}
                        onChange={(e) => setDirectToken(e.target.value)}
                        placeholder="例如: 4a6f2b8c9d1e3f5a7b9c1d3e5f7a9b1c"
                        className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {bindMode === 'cookie' && (
                <>
                  <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200/90 space-y-1.5">
                    <p className="font-semibold text-purple-300 flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-purple-400" />
                      Token / Cookie 直连模式 (建议使用二维码扫码或 mina.mi.com 凭据)
                    </p>
                    <p className="text-zinc-300 text-[11px] leading-relaxed">
                      小爱音箱云端需使用 <code className="text-white bg-white/10 px-1 py-0.5 rounded">micoapi</code> 专属令牌。推荐最便捷方式：直接使用<strong className="text-white">【方式二：二维码扫码登录】</strong>或<strong className="text-white">【方式一：账号密码登录】</strong>（由小米 Passport 自动签发全套令牌）。若需使用 Cookie，请在登录 <code className="text-white bg-white/10 px-1 py-0.5 rounded">https://mina.mi.com</code> 小爱官网后复制 Cookie 中的 <strong className="text-white font-mono">serviceToken</strong> 与 <strong className="text-white font-mono">userId</strong>。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5 font-medium">User ID (Cookie 中的 userId)</label>
                      <input
                        type="text"
                        value={userIdInput}
                        onChange={(e) => setUserIdInput(e.target.value)}
                        onPaste={handleCookieInputPaste}
                        placeholder="例如: 704875207 或直接粘贴整段 Cookie"
                        className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5 font-medium">Pass Token (Cookie 中的 passToken，最推荐)</label>
                      <input
                        type="password"
                        value={passTokenInput}
                        onChange={(e) => setPassTokenInput(e.target.value)}
                        onPaste={handleCookieInputPaste}
                        placeholder="Cookie 中的 passToken (例如: V1_xxx...)"
                        className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1 font-medium flex items-center justify-between">
                      <span>或者直接输入 Mina serviceToken (可选备用)</span>
                      <span className="text-[10px] text-zinc-600 font-normal">支持直接粘贴完整 Cookie / .mi.token JSON</span>
                    </label>
                    <input
                      type="password"
                      value={serviceTokenInput}
                      onChange={(e) => setServiceTokenInput(e.target.value)}
                      onPaste={handleCookieInputPaste}
                      placeholder="若已有 serviceToken 可在此输入，或直接粘贴整段 Cookie 自动解析"
                      className="w-full px-4 py-2 bg-zinc-950/50 border border-white/5 rounded-xl text-xs text-zinc-300 focus:outline-none focus:border-[#FF6700] transition font-mono"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-zinc-500">
                  {bindMode === 'account' ? '密码仅在本次请求中使用 MD5 摘要直连小米服务器' : '配置仅保存在本地 data/config.json'}
                </span>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.3)] transition active:scale-95 disabled:opacity-50"
                >
                  {isLoggingIn && <RefreshCw className="w-4 h-4 animate-spin text-white" />}
                  <span>{isLoggingIn ? '正在连接小米服务器鉴权...' : '确认绑定并同步设备'}</span>
                </button>
              </div>
            </form>
            )}
          </div>

        </div>
      )}

      {/* ---------------- Sub-tab 5: MIoT Command & Stream Diagnostic Logs ---------------- */}
      {activeSubTab === 'logs' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-6">
          {/* Header & Meta */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    全链路投播与音频流诊断日志系统 (Diagnostic Live Logs)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    实时捕获 Mina 云端 UBUS、miIO 局域网 UDP、HTTP 206 串流响应与耗时节点，秒级归因诊断
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openSnapshotModal}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition cursor-pointer"
              >
                <Bug className="w-3.5 h-3.5 text-purple-400" />
                <span>云端抓包/原始数据快照</span>
              </button>
              <a
                href="/api/miot/cloud/export-debug"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>导出完整诊断包</span>
              </a>
              <span className="text-xs text-zinc-400 font-mono bg-zinc-950/80 px-3 py-1.5 rounded-xl border border-white/10">
                记录数: <strong className="text-emerald-400">{castLogs.length}</strong> 条
              </span>
            </div>
          </div>

          {/* Filter Toolbar & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Quick Type Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-950/80 rounded-2xl border border-white/10 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setLogTypeFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                  logTypeFilter === 'all'
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                全部日志 ({castLogs.length})
              </button>
              <button
                onClick={() => setLogTypeFilter('cast')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                  logTypeFilter === 'cast'
                    ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                投播指令 ({castLogs.filter(l => l.type === 'cast').length})
              </button>
              <button
                onClick={() => setLogTypeFilter('sync')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                  logTypeFilter === 'sync'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                音频流拉取 / 账号同步 ({castLogs.filter(l => l.type === 'sync').length})
              </button>
              <button
                onClick={() => setLogTypeFilter('error')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                  logTypeFilter === 'error'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                异常失败 ({castLogs.filter(l => !l.success).length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <input
                type="text"
                value={logSearchTerm}
                onChange={e => setLogSearchTerm(e.target.value)}
                placeholder="搜索 DID / IP / 状态码 / 协议 / 错误..."
                className="w-full bg-zinc-950/80 border border-white/10 rounded-2xl px-4 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
              {logSearchTerm && (
                <button
                  onClick={() => setLogSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Detailed Log Entries Stream */}
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {castLogs.filter(log => {
              if (logTypeFilter === 'cast' && log.type !== 'cast') return false;
              if (logTypeFilter === 'sync' && log.type !== 'sync') return false;
              if (logTypeFilter === 'error' && log.success) return false;
              if (!logSearchTerm) return true;
              const q = logSearchTerm.toLowerCase();
              return (
                (log.message && log.message.toLowerCase().includes(q)) ||
                (log.detail && log.detail.toLowerCase().includes(q)) ||
                (log.did && log.did.toLowerCase().includes(q)) ||
                (log.ip && log.ip.toLowerCase().includes(q)) ||
                (log.model && log.model.toLowerCase().includes(q)) ||
                (log.protocol && log.protocol.toLowerCase().includes(q)) ||
                (log.requestMethod && log.requestMethod.toLowerCase().includes(q)) ||
                (log.minaStatus && log.minaStatus.toLowerCase().includes(q)) ||
                (log.miioStatus && log.miioStatus.toLowerCase().includes(q)) ||
                (log.streamUrl && log.streamUrl.toLowerCase().includes(q)) ||
                (log.httpStatus && String(log.httpStatus).includes(q))
              );
            }).length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-zinc-950/40 border border-white/5 space-y-2">
                <Terminal className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-sm font-semibold text-zinc-400">未找到符合条件的诊断日志</p>
                <p className="text-xs text-zinc-600">可以尝试更换筛选条件或向小爱音箱下发一次投播操作</p>
              </div>
            ) : (
              castLogs.filter(log => {
                if (logTypeFilter === 'cast' && log.type !== 'cast') return false;
                if (logTypeFilter === 'sync' && log.type !== 'sync') return false;
                if (logTypeFilter === 'error' && log.success) return false;
                if (!logSearchTerm) return true;
                const q = logSearchTerm.toLowerCase();
                return (
                  (log.message && log.message.toLowerCase().includes(q)) ||
                  (log.detail && log.detail.toLowerCase().includes(q)) ||
                  (log.did && log.did.toLowerCase().includes(q)) ||
                  (log.ip && log.ip.toLowerCase().includes(q)) ||
                  (log.model && log.model.toLowerCase().includes(q)) ||
                  (log.protocol && log.protocol.toLowerCase().includes(q)) ||
                  (log.requestMethod && log.requestMethod.toLowerCase().includes(q)) ||
                  (log.minaStatus && log.minaStatus.toLowerCase().includes(q)) ||
                  (log.miioStatus && log.miioStatus.toLowerCase().includes(q)) ||
                  (log.streamUrl && log.streamUrl.toLowerCase().includes(q)) ||
                  (log.httpStatus && String(log.httpStatus).includes(q))
                );
              }).map(log => (
                <div
                  key={log.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    !log.success
                      ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                      : log.type === 'cast'
                      ? 'bg-zinc-950/80 border-white/10 hover:border-[#FF6700]/30'
                      : 'bg-zinc-950/80 border-white/10 hover:border-blue-500/30'
                  }`}
                >
                  {/* Item Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-mono font-bold text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-lg border border-white/5">
                        [{log.timestamp}]
                      </span>

                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                        log.type === 'cast' ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30' :
                        log.type === 'sync' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        'bg-zinc-800 text-zinc-300 border border-white/10'
                      }`}>
                        {log.type === 'cast' ? '投播指令' : log.type === 'sync' ? '音频流拉取' : log.type}
                      </span>

                      {log.protocol && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-white/5">
                          {log.protocol}
                        </span>
                      )}

                      <h4 className="text-xs font-bold text-zinc-100 min-w-0">
                        {log.message}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2">
                      {log.responseTimeMs !== undefined && (
                        <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                          ⚡ {log.responseTimeMs} ms
                        </span>
                      )}

                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                        log.success
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}>
                        {log.httpStatus ? `HTTP ${log.httpStatus}` : (log.success ? '✓ 200 OK' : '✕ ERROR')}
                      </span>

                      <button
                        onClick={() => {
                          const fullJson = JSON.stringify(log, null, 2);
                          navigator.clipboard.writeText(fullJson);
                          setCopiedLogId(log.id);
                          setTimeout(() => setCopiedLogId(null), 2000);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5 transition"
                        title="复制完整诊断日志 (JSON)"
                      >
                        {copiedLogId === log.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Comprehensive Parameters Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs font-mono">
                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">设备 DID</span>
                      <span className="text-zinc-200 truncate block">{log.did || '未知/全局'}</span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">设备 IP</span>
                      <span className="text-zinc-200 truncate block">{log.ip || '未检测局域网IP'}</span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">设备型号</span>
                      <span className="text-zinc-200 truncate block">{log.model || 'wifispeaker'}</span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">请求方法</span>
                      <span className="text-zinc-200 truncate block">{log.requestMethod || 'POST'}</span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">Mina 状态</span>
                      <span className={`truncate block ${log.minaStatus?.includes('ERROR') ? 'text-rose-400 font-bold' : 'text-zinc-200'}`}>
                        {log.minaStatus || 'N/A'}
                      </span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">miIO 状态</span>
                      <span className={`truncate block ${log.miioStatus?.includes('ERROR') ? 'text-rose-400 font-bold' : 'text-zinc-200'}`}>
                        {log.miioStatus || 'N/A'}
                      </span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">错误代码</span>
                      <span className={`truncate block ${!log.success ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                        {log.errorCode ?? 0}
                      </span>
                    </div>

                    <div className="bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                      <span className="text-[10px] text-zinc-500 block uppercase font-sans font-semibold">Stream URL</span>
                      <span className="text-zinc-300 truncate block text-[10px]" title={log.streamUrl}>
                        {log.streamUrl ? log.streamUrl.replace(/^https?:\/\/[^\/]+/, '') : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* One-Glance Timeline Chain Sequence */}
                  <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex-shrink-0">
                      诊断链路:
                    </span>

                    {(log.steps && log.steps.length > 0 ? log.steps : [
                      { timestamp: log.timestamp, step: 'MINA', status: log.minaStatus?.includes('OK') ? 'OK' : 'INFO', message: log.minaStatus || 'Mina' },
                      { timestamp: log.timestamp, step: 'MIIO', status: log.miioStatus?.includes('OK') ? 'OK' : 'INFO', message: log.miioStatus || 'miIO' },
                      { timestamp: log.timestamp, step: 'SPEAKER', status: log.success ? 'OK' : 'ERROR', message: log.success ? '200 OK' : '502 Rejected' }
                    ]).map((s, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="text-zinc-600 text-[10px]">➔</span>}
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-mono border flex items-center gap-1 flex-shrink-0 ${
                          s.status === 'OK'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : s.status === 'ERROR'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            : 'bg-zinc-900 border-white/5 text-zinc-400'
                        }`}>
                          <span className="font-bold">{s.step}</span>
                          <span className="opacity-75">→ {s.message}</span>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Inline One-Click Add Action if IP is not yet in devices */}
                  {log.ip && log.ip !== '127.0.0.1' && !devices.some(d => d.ip === log.ip) && (
                    <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>检测到局域网音箱活跃 IP: <strong className="text-emerald-300 font-mono">{log.ip}</strong></span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onAddDevice?.({
                            name: `小爱音箱 (${log.ip})`,
                            ip: log.ip!,
                            model: log.model || 'wifispeaker',
                            hardware: 'XiaoAi Smart Speaker'
                          });
                          setActiveSubTab('devices');
                        }}
                        className="px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>一键添加此音箱至列表</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Filtered Non-Speaker Devices Modal */}
      {showIgnoredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-xl bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    MIoT Spec 过滤设备清单 ({ignoredDevices.length} 台)
                  </h3>
                  <p className="text-xs text-zinc-400">
                    双轨融合后经 MIoT Spec 研判判定为非音箱的设备
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIgnoredModal(false)}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 text-xs text-zinc-400 space-y-1">
              <span className="font-semibold text-zinc-300 block">过滤判定规则 (MIoT Spec Policy)：</span>
              <p className="text-[11px] leading-relaxed">
                按照小米设备发现架构规范，系统检索各设备的官方 MIoT 规范定义。若设备属于照明（light）、插座（switch/outlet）、摄像机、传感器等非智能音箱品类，且无 <code className="text-rose-300 font-mono">intelligent-speaker</code> 或 <code className="text-rose-300 font-mono">play-control</code> 服务，则自动将其从音箱面板剔除。
              </p>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {ignoredDevices.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  暂无被过滤的非音箱设备记录
                </div>
              ) : (
                ignoredDevices.map((dev, idx) => (
                  <div key={dev.did || idx} className="p-3 rounded-2xl bg-zinc-950/80 border border-white/5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">{dev.name || '未命名设备'}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/20 font-mono">
                        已忽略
                      </span>
                    </div>
                    <div className="text-zinc-500 text-[11px] font-mono flex flex-wrap gap-x-3">
                      <span>DID: {dev.did}</span>
                      {dev.ip && <span className="text-emerald-400 font-bold">IP: {dev.ip}</span>}
                      <span>Model: {dev.model}</span>
                      <span>来源: {dev.source === 'lan' ? '局域网 miIO Hello' : dev.source === 'cloud' ? '米家云端' : dev.source}</span>
                    </div>
                    <div className="text-rose-400 text-[11px] pt-1">
                      原因: {dev.reason}
                    </div>

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const suggestedName = dev.name && !dev.name.includes('miio') 
                            ? dev.name 
                            : (dev.ip ? `小爱音箱 (${dev.ip})` : `小爱音箱 (${dev.did.slice(-4)})`);
                          
                          onAddDevice?.({
                            name: suggestedName,
                            ip: dev.ip || '',
                            did: dev.did,
                            model: dev.model && dev.model !== 'miio.device.unknown' ? dev.model : 'xiaomi.wifispeaker',
                            hardware: 'XiaoAi Smart Speaker'
                          });
                          setShowIgnoredModal(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6700] to-amber-600 hover:from-[#e55c00] hover:to-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>强制收录为小爱音箱 {dev.ip ? `(IP: ${dev.ip})` : ''}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowIgnoredModal(false)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Cloud Device Query Raw Snapshots Inspector Modal ---------------- */}
      {isSnapshotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-5xl bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-zinc-950/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    小米云端接口抓包快照与原始设备数据
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                      {cloudSnapshots.length} 个请求记录
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    实时记录与米家 (MiHome) / 小爱 (Mina) 各大区云端交互的原始 HTTP 返回，秒级归因“为何无设备”
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchCloudSnapshots();
                  }}
                  disabled={isLoadingSnapshots}
                  className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-50"
                  title="刷新快照"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingSnapshots ? 'animate-spin text-purple-400' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSnapshotModalOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Diagnostic / Account Overview Banner */}
            <div className="px-6 py-3 bg-zinc-950/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400">
                <span>
                  用户ID: <strong className="text-zinc-200">{cleanDeviceName(miotConfig.miUser || miotConfig.userId || '未绑定')}</strong>
                </span>
                <span>
                  登录态: <strong className={miotConfig.isLoggedIn ? 'text-emerald-400' : 'text-amber-400'}>{miotConfig.isLoggedIn ? '已授权' : '未登录'}</strong>
                </span>
                <span>
                  Token: <strong className={miotConfig.hasServiceToken || miotConfig.serviceToken ? 'text-emerald-400' : 'text-rose-400'}>{miotConfig.hasServiceToken || miotConfig.serviceToken ? '已配置 (已脱敏)' : '未配置'}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allJson = JSON.stringify(cloudSnapshots, null, 2);
                    navigator.clipboard.writeText(allJson);
                    setCopiedSnapshot(true);
                    setTimeout(() => setCopiedSnapshot(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-semibold transition active:scale-95"
                >
                  {copiedSnapshot ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSnapshot ? '已复制全部' : '复制全部原始快照'}</span>
                </button>
                <a
                  href="/api/miot/cloud/export-debug"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 text-xs font-semibold transition active:scale-95"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载诊断包 (.json)</span>
                </a>
                <button
                  type="button"
                  onClick={handleClearSnapshots}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs transition"
                  title="清空快照"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Split View */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-[400px]">
              {/* Left Side: Snapshot Request List */}
              <div className="w-full md:w-5/12 border-r border-white/10 overflow-y-auto p-3 space-y-2 bg-zinc-950/20">
                {cloudSnapshots.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto" />
                    <p className="text-xs text-zinc-400">暂无云端抓包快照记录</p>
                    <button
                      type="button"
                      onClick={() => {
                        onScanDevices();
                        setTimeout(() => fetchCloudSnapshots(), 1500);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition"
                    >
                      立即发起云端扫描以生成快照
                    </button>
                  </div>
                ) : (
                  cloudSnapshots.map((snap, idx) => {
                    const isSelected = selectedSnapshotIndex === idx;
                    const isSuccess = snap.status >= 200 && snap.status < 300;
                    const hasDevices = snap.deviceCount > 0;
                    return (
                      <div
                        key={snap.id || idx}
                        onClick={() => setSelectedSnapshotIndex(idx)}
                        className={`p-3 rounded-2xl border text-xs cursor-pointer transition ${
                          isSelected
                            ? 'bg-purple-900/30 border-purple-500/50 shadow-sm'
                            : 'bg-zinc-900/60 hover:bg-zinc-800/60 border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isSuccess ? (hasDevices ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-rose-400'
                              }`}
                            />
                            <span className="font-bold text-white font-mono truncate max-w-[170px]">
                              {snap.service === 'mina' ? '小爱 Mina 接口' : snap.service === 'mihome' ? '米家 MiHome 接口' : '海外大区接口'}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                              isSuccess
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            HTTP {snap.status || 'ERR'}
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-zinc-400 truncate mb-1">
                          {snap.url}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                          <span>{snap.timestamp}</span>
                          <span className="flex items-center gap-2">
                            <span>{snap.durationMs}ms</span>
                            <strong className={hasDevices ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                              {snap.deviceCount} 台设备
                            </strong>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Side: Detailed JSON & Analysis */}
              <div className="w-full md:w-7/12 overflow-y-auto p-4 sm:p-5 space-y-4 bg-zinc-900/30">
                {cloudSnapshots.length > 0 && cloudSnapshots[selectedSnapshotIndex] ? (
                  (() => {
                    const snap = cloudSnapshots[selectedSnapshotIndex];
                    const rawJson = typeof snap.rawResponse === 'string'
                      ? snap.rawResponse
                      : JSON.stringify(snap.rawResponse, null, 2);

                    return (
                      <div className="space-y-4">
                        {/* Summary Header */}
                        <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white font-mono flex items-center gap-2">
                              <Code className="w-4 h-4 text-purple-400" />
                              <span>{snap.url}</span>
                            </span>
                            <span className="text-xs text-zinc-400 font-mono">{snap.timestamp} ({snap.durationMs}ms)</span>
                          </div>

                          {/* Diagnostic Reason / Explanation */}
                          {snap.status === 401 && (
                            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                              <div>
                                <strong className="block font-bold">401 凭据鉴权失败：</strong>
                                小米服务器拒绝了当前 serviceToken。请确认是从 mina.mi.com 复制的最新 Cookie，或重新使用账号密码绑定。
                              </div>
                            </div>
                          )}

                          {snap.status >= 200 && snap.status < 300 && snap.deviceCount === 0 && (
                            <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                              <Info className="w-4 h-4 mt-0.5 shrink-0" />
                              <div>
                                <strong className="block font-bold">云端接口返回 0 台设备原因归因：</strong>
                                接口通信正常且身份验证通过，但小米云端数据库在该账号下返回空数组 <code className="text-amber-200 font-mono">[]</code>。可能原因：
                                <br />1. 音箱绑定在<strong>家人/其他主账号</strong>下（小爱音箱通常仅主账号拥有云端管理权）。
                                <br />2. 音箱被添加在其他地区服务器（如海外/新加坡）。
                                <br />3. 推荐解决方案：点击主界面【手动添加音箱】，输入音箱的局域网 IP（如 192.168.31.x），局域网模式不受小米账号绑定限制！
                              </div>
                            </div>
                          )}

                          {snap.deviceCount > 0 && (
                            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                              <div>
                                <strong className="block font-bold">成功解析出 {snap.deviceCount} 台设备：</strong>
                                {snap.extractedDevices?.map((d: any) => `${d.name} (${d.model || d.hardware}) [DID: ${d.did}]`).join('、 ')}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Extracted Devices Summary Cards */}
                        {snap.extractedDevices && snap.extractedDevices.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-zinc-300">提取到的设备明细：</span>
                            <div className="space-y-2">
                              {snap.extractedDevices.map((d: any, dIdx: number) => (
                                <div key={d.did || dIdx} className="p-3 rounded-xl bg-zinc-950/80 border border-white/5 text-xs flex items-center justify-between font-mono">
                                  <div>
                                    <div className="font-bold text-white">{d.name}</div>
                                    <div className="text-[11px] text-zinc-400">DID: {d.did} | Model: {d.model} | HW: {d.hardware}</div>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${d.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                                    {d.online ? '在线' : '离线'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Raw JSON Code Block */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-purple-400" />
                              <span>原始 HTTP Response (Raw JSON)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(rawJson);
                                setCopiedSnapshot(true);
                                setTimeout(() => setCopiedSnapshot(false), 2000);
                              }}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 transition"
                            >
                              {copiedSnapshot ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>复制单项 JSON</span>
                            </button>
                          </div>
                          
                          <pre className="p-4 rounded-2xl bg-zinc-950 border border-white/10 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-[350px] leading-relaxed select-all">
                            {rawJson}
                          </pre>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-center py-20 text-zinc-500 text-xs">
                    请在左侧选择一个接口请求快照以查看原始数据
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-zinc-950/50 border-t border-white/10 flex items-center justify-between text-xs">
              <span className="text-zinc-500">
                提示：快照仅缓存在运行态内存中，用于排查设备列表为空与网络鉴权问题。
              </span>
              <button
                type="button"
                onClick={() => setIsSnapshotModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
