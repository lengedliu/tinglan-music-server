export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  url: string;
  publicStreamUrl?: string; // Verified public high-availability MP3 URL for hardware speakers
  coverUrl: string;
  lyrics?: string; // LRC formatted string
  genre?: string;
  year?: number;
  bitrate?: string;
  fileSize?: string;
  isFavorite?: boolean;
  source?: 'local' | 'demo' | 'uploaded';
  sampleRate?: string;
  bitDepth?: string;
  format?: string;
  channels?: string;
  codec?: string;
  filePath?: string;
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
export type DeviceConnectionState = 'online' | 'offline' | 'unknown' | 'connecting' | 'playing' | 'paused' | 'buffering' | 'transcoding' | 'error';

export interface XiaomiDevice {
  did: string;
  uuid?: string;
  deviceID?: string; // Mina Cloud Hardware Device ID
  hardwareDeviceId?: string;
  cloudDid?: string;
  homeId?: string;
  roomId?: string;
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
  raw?: any;
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
  serviceToken?: string; // Legacy fallback
  micoServiceToken?: string; // Mina / XiaoAi Cloud Token
  miotServiceToken?: string; // MIoT Spec / MiHome Cloud Token
  hasServiceToken?: boolean;
  hasMicoServiceToken?: boolean;
  hasMiotServiceToken?: boolean;
  isMicoValid?: boolean;
  bindMode?: 'account' | 'token' | 'cookie';
  castMode?: 'auto' | 'cdn_direct' | 'xiaoai_directive' | 'lan_stream';
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

export interface VoiceCommandRule {
  id: string;
  name: string;
  triggerPhrases: string[];
  actionType: 'play_playlist' | 'play_random_all' | 'play_song_search' | 'control_command';
  targetPlaylistId?: string;
  controlAction?: 'next' | 'prev' | 'pause' | 'stop' | 'resume' | 'volume_up' | 'volume_down';
  ttsFeedback?: string;
  enabled: boolean;
}

export interface VoiceDialogueLog {
  id: string;
  timestamp: number;
  queryText: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  actionSummary?: string;
  status: 'matched' | 'ignored' | 'error';
  source?: 'speaker_mina_poll' | 'speaker_mina_ws' | 'test_manual';
  deviceId?: string;
  deviceName?: string;
}

export interface VoiceListenerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  targetDeviceId?: string;
  ttsFeedbackEnabled: boolean;
  adaptivePollingEnabled?: boolean;
  earlyInterceptionEnabled?: boolean;
  rules: VoiceCommandRule[];
}

export interface VoiceListenerStatus {
  isRunning: boolean;
  enabled: boolean;
  isLoggedIn?: boolean;
  pollIntervalMs: number;
  configuredPollIntervalMs?: number;
  pollingMode?: 'burst' | 'active' | 'idle' | 'standby';
  burstRemainingSec?: number;
  timeSinceLastDialogueSec?: number | null;
  adaptivePollingEnabled?: boolean;
  earlyInterceptionEnabled?: boolean;
  targetDeviceId: string | null;
  rulesCount: number;
  logsCount: number;
  lastProcessedTime: number;
}

export interface SleepTimerConfig {
  enabled: boolean;
  remainingSeconds: number;
  initialMinutes: number;
  stopAtEndOfSong: boolean;
  smoothFadeOut: boolean;
}

export type SongSortOption = 
  | 'default' 
  | 'title_asc' 
  | 'title_desc' 
  | 'artist_asc' 
  | 'duration_asc' 
  | 'duration_desc' 
  | 'bitrate_desc'
  | 'date_desc';

export type LibrarySourceFilter = 'all' | 'local' | 'navidrome' | 'favorites';

export interface ABLoopConfig {
  a: number | null; // start time in seconds
  b: number | null; // end time in seconds
  enabled: boolean;
}

export interface AudioEngineSettings {
  crossfadeDuration: number; // 0 - 12 seconds, 0 = disabled
  replayGainEnabled: boolean; // Loudness Normalization
}

export interface GroupCastDeviceResult {
  did: string;
  name: string;
  success: boolean;
  message?: string;
}

export interface GroupCastResponse {
  success: boolean;
  total: number;
  successCount: number;
  failedCount: number;
  results: GroupCastDeviceResult[];
}




