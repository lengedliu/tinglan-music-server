export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  url: string;
  coverUrl: string;
  lyrics?: string; // LRC formatted string
  genre?: string;
  year?: number;
  bitrate?: string;
  fileSize?: string;
  isFavorite?: boolean;
  source?: 'local' | 'demo' | 'uploaded';
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  translation?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  songIds: string[];
  createdAt: string;
}

export interface XiaomiDeviceStatus {
  playing: boolean;
  volume: number; // 0 - 100
  currentSongId?: string;
  currentTitle?: string;
  currentArtist?: string;
  currentDuration?: number;
  currentPosition?: number;
  streamUrl?: string;
  muted?: boolean;
  lastTts?: string;
  updatedAt: string;
}

export interface DeviceCapabilities {
  hasPlayControl: boolean;
  hasTts: boolean;
  hasVolumeControl: boolean;
  hasClock?: boolean;
  supportsDlna?: boolean;
  supportsLocalMiio?: boolean;
}

export type DevicePlatform = 'mina' | 'miio' | 'miot';
export type DeviceSource = 'cloud' | 'lan' | 'hybrid';
export type DeviceConnectionState = 'online' | 'offline' | 'unknown' | 'connecting' | 'playing' | 'paused' | 'error';

export interface XiaomiDevice {
  did: string;
  name: string;
  model: string;
  hardware?: string;
  ip?: string; // May be undefined for cloud-discovered devices lacking LAN IP
  mac?: string;
  token?: string; // 32-character local device token
  tokenMasked?: string;
  hasToken?: boolean;
  platform?: DevicePlatform;
  source?: DeviceSource;
  capabilities?: DeviceCapabilities;
  online?: boolean;
  isOnline: boolean;
  deviceState?: DeviceConnectionState; // Phase 3: Fine-grained device state
  status: XiaomiDeviceStatus;
}

export interface MiotConfig {
  miUser: string;
  miUserMasked?: string;
  isLoggedIn: boolean;
  serverHost: string;
  activeDeviceId: string;
  autoCast: boolean;
  ttsAnnouncement: boolean;
  ttsPrefix: string;
  volumeSync: boolean;
  userId?: string;
  serviceToken?: string;
  hasServiceToken?: boolean;
  bindMode?: 'account' | 'token' | 'cookie';
}

export interface DiagnosticStepLog {
  timestamp: string;
  step: 'MINA' | 'SPEAKER_HTTP' | 'STREAM_GET' | 'STREAM_RESP' | 'MIIO_UDP' | 'PLAYBACK_CHECK' | string;
  status: 'OK' | 'ERROR' | 'TIMEOUT' | 'PENDING' | string;
  statusCode?: number | string;
  message: string;
}

export interface CastLog {
  id: string;
  timestamp: string;
  type: 'cast' | 'control' | 'tts' | 'sync' | 'error';
  message: string;
  detail?: string;
  success: boolean;

  // Comprehensive Diagnostic Metrics for Troubleshooting
  did?: string;
  ip?: string;
  model?: string;
  protocol?: 'MIoT Cloud' | 'miIO LAN' | 'DLNA' | 'AirPlay' | 'Web Audio' | 'HTTP Audio Stream' | string;
  requestMethod?: string;
  httpStatus?: number;
  miioStatus?: string;
  minaStatus?: string;
  errorCode?: string | number;
  responseTimeMs?: number;
  streamUrl?: string;

  // Detailed Chain Steps Timeline (e.g. 19:42:01 Mina -> OK, 19:42:02 Speaker -> 200, 19:42:04 HTTP 206)
  steps?: DiagnosticStepLog[];
}

export interface DockerDeploymentInfo {
  serverHost: string;
  detectedIps: string[];
  musicDir: string;
  dataDir: string;
  port: number;
  containerName: string;
  imageName: string;
  isHostNetworkRecommended: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  avatarUrl?: string;
  status?: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export type DbEngine = 'sqlite' | 'postgres' | 'mysql';

export interface DbConfig {
  engine: DbEngine;
  postgresConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
    connectionString?: string;
  };
  mysqlConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
}

export interface DbStatusInfo {
  engine: DbEngine;
  isConnected: boolean;
  engineName: string;
  version?: string;
  tablesCount?: number;
  totalUsers?: number;
  totalSongs?: number;
  totalPlaylists?: number;
  connectionDetails?: string;
}

export interface SecuritySettings {
  requireAuth: boolean;
  authScope: 'all' | 'wan_only';
  allowRegistration?: boolean;
  allowUserMiotControl?: boolean;
  allowUserMiotTts?: boolean;
  updatedAt?: string;
}

export interface SecurityStatus {
  success: boolean;
  authRequired: boolean;
  globalRequireAuth: boolean;
  authScope: 'all' | 'wan_only';
  allowRegistration?: boolean;
  allowUserMiotControl?: boolean;
  allowUserMiotTts?: boolean;
  clientIp: string;
  isLan: boolean;
  hasDefaultAdmin?: boolean;
  userCount?: number;
}

export type CommandStatus = 'idle' | 'pending' | 'success' | 'failed' | 'timeout';

export type CastingLifecycleStage =
  | 'IDLE'
  | 'COMMAND_SENT'
  | 'DEVICE_ACK'
  | 'STREAM_CONNECTED'
  | 'PLAYING'
  | 'FAILED';

export interface CastingStageStep {
  stage: CastingLifecycleStage;
  label: string;
  success: boolean;
  active?: boolean;
  detail?: string;
  timestamp?: string;
}

export interface DeviceCommandState {
  status: CommandStatus;
  action?: 'cast' | 'play' | 'pause' | 'volume' | 'seek' | 'tts' | 'stop';
  error?: string;
  targetDid?: string;
  timestamp?: number;
  castingStage?: CastingLifecycleStage;
  stageHistory?: CastingStageStep[];
}


