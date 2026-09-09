import React, { useState } from 'react';
import { 
  Server, 
  Copy, 
  Check, 
  ShieldCheck, 
  Terminal, 
  Smartphone, 
  Globe, 
  Code, 
  RefreshCw, 
  Radio, 
  CheckCircle2, 
  Zap, 
  Cpu, 
  Key, 
  HardDrive
} from 'lucide-react';
import { Song } from '../types';

interface SubsonicServerViewProps {
  serverHost: string;
  songsCount: number;
  playlistsCount: number;
  onOpenNavidromeModal?: () => void;
}

export const SubsonicServerView: React.FC<SubsonicServerViewProps> = ({
  serverHost,
  songsCount,
  playlistsCount,
  onOpenNavidromeModal
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [testApiLog, setTestApiLog] = useState<string | null>(null);
  const [isTestingApi, setIsTestingApi] = useState<boolean>(false);

  const currentHost = serverHost || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const subsonicRestUrl = `${currentHost}/rest`;
  const openSubsonicInfoUrl = `${currentHost}/api/subsonic/info`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTestPing = async () => {
    setIsTestingApi(true);
    setTestApiLog(null);
    try {
      const res = await fetch(`${subsonicRestUrl}/ping?f=json`);
      const data = await res.json().catch(() => ({}));
      setIsTestingApi(false);
      setTestApiLog(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setIsTestingApi(false);
      setTestApiLog(`Error testing /rest/ping: ${err.message || 'Network failure'}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Banner: Subsonic Hub Introduction */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/10 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#FF6700]/10 blur-[120px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 text-xs font-semibold">
              <Server className="w-3.5 h-3.5" />
              <span>家庭 NAS 音乐流媒体中枢 · Subsonic / OpenSubsonic API</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Tinglan Subsonic 开放服务端
            </h2>

            <p className="text-sm text-zinc-300 leading-relaxed">
              Tinglan 原生提供完整的 Subsonic v1.16.1 & OpenSubsonic 规范接口。任何支持 Subsonic / Navidrome 协议的移动端 APP、平板、PC 或车机（如 Symfonium、DSub、Ultrasonic、Audirvana 等），均可以 Tinglan 作为家庭音乐服务端直接连接！
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
            <button
              onClick={handleTestPing}
              disabled={isTestingApi}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-white/10 transition active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isTestingApi ? 'animate-spin text-[#FF6700]' : 'text-zinc-400'}`} />
              <span>测试 /rest/ping 响应</span>
            </button>

            {onOpenNavidromeModal && (
              <button
                onClick={onOpenNavidromeModal}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-bold shadow-[0_4px_20px_rgba(255,103,0,0.3)] transition active:scale-95"
              >
                <Globe className="w-4 h-4" />
                <span>连接外部 Navidrome 源</span>
              </button>
            )}
          </div>
        </div>

        {/* Server Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8 pt-6 border-t border-white/10">
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">服务端口</span>
            <span className="text-base font-bold text-emerald-400 font-mono">3000 (HTTP/REST)</span>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">协议版本</span>
            <span className="text-base font-bold text-amber-400 font-mono">Subsonic v1.16.1</span>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">NAS 曲库总量</span>
            <span className="text-base font-bold text-white font-mono">{songsCount} 首发烧曲目</span>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-1">
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider block">自建歌单</span>
            <span className="text-base font-bold text-white font-mono">{playlistsCount} 个播放列表</span>
          </div>
        </div>
      </div>

      {/* Connection Parameters Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Connection Parameters */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-[#FF6700]" />
              <span>第三方客户端连接配置参数</span>
            </h3>
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              Ready for Connections
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Server Address */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block">服务器基准地址 (Server Host)</label>
              <div className="flex items-center justify-between gap-2 bg-zinc-900 p-2.5 rounded-xl border border-white/5 font-mono text-xs text-amber-300">
                <span className="truncate">{currentHost}</span>
                <button
                  onClick={() => copyToClipboard(currentHost, 'host')}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                  title="复制地址"
                >
                  {copiedField === 'host' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">在客户端（如 Symfonium）中将此 URL 填入“服务器”字段。</p>
            </div>

            {/* REST Endpoint */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block">REST 协议入口 (REST Path)</label>
              <div className="flex items-center justify-between gap-2 bg-zinc-900 p-2.5 rounded-xl border border-white/5 font-mono text-xs text-amber-300">
                <span className="truncate">{subsonicRestUrl}</span>
                <button
                  onClick={() => copyToClipboard(subsonicRestUrl, 'rest')}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                  title="复制路径"
                >
                  {copiedField === 'rest' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">Subsonic API 标准入口，自动补全 `.view` 与 `?f=json`。</p>
            </div>

            {/* Default Username */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block">默认管理员账号 (Username)</label>
              <div className="flex items-center justify-between gap-2 bg-zinc-900 p-2.5 rounded-xl border border-white/5 font-mono text-xs text-zinc-200">
                <span>admin</span>
                <button
                  onClick={() => copyToClipboard('admin', 'user')}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                  title="复制用户名"
                >
                  {copiedField === 'user' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">可使用登录账号或通过令牌机制（MD5 token/salt）认证。</p>
            </div>

            {/* Auth Protocol */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-2">
              <label className="text-xs font-semibold text-zinc-400 block">加盐认证 (Token Auth)</label>
              <div className="flex items-center gap-2 bg-zinc-900 p-2.5 rounded-xl border border-white/5 font-mono text-xs text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Supports MD5 t + s auth</span>
              </div>
              <p className="text-[11px] text-zinc-500">兼容 Subsonic Token/Salt 加密密码，保障明文密码安全。</p>
            </div>

          </div>

          {/* Supported API Endpoints */}
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Code className="w-4 h-4 text-[#FF6700]" />
                已部署 Subsonic API Endpoints
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                Active & Verified
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
              <div className="p-2 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300">
                /rest/ping.view
              </div>
              <div className="p-2 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300">
                /rest/getMusicFolders
              </div>
              <div className="p-2 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300">
                /rest/getIndexes.view
              </div>
              <div className="p-2 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300">
                /rest/search3.view
              </div>
              <div className="p-2 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300">
                /rest/getPlaylists.view
              </div>
              <div className="p-2 rounded-xl bg-zinc-900/80 border border-white/5 text-zinc-300">
                /rest/stream.view
              </div>
            </div>
          </div>

          {/* Test log viewer */}
          {testApiLog && (
            <div className="p-4 rounded-2xl bg-zinc-950 border border-amber-500/30 space-y-2">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5" />
                API 测试响应结果 (/rest/ping):
              </span>
              <pre className="p-3 bg-black/60 rounded-xl text-xs text-zinc-300 font-mono overflow-x-auto">
                {testApiLog}
              </pre>
            </div>
          )}

        </div>

        {/* Right 1 Col: Ecosystem Apps & NAS Mount */}
        <div className="space-y-6">
          
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#FF6700]" />
              <span>推荐全平台客户端 (Subsonic App)</span>
            </h3>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Symfonium</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-semibold">
                    Android 最佳
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  极具现代感的发烧音乐播放器，完美同步 Tinglan 曲库、歌词与无损封面。
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">DSub / Ultrasonic</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                    Android 开源
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  经典且稳定的 Subsonic 客户端，占用极低，支持离线缓存。
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">SubStreamer / AmuseNet</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                    iOS / macOS
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  优雅的 Apple 生态 Subsonic 播放器，完美连接 Tinglan 服务端。
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Audirvana / MusicBee</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                    Windows / Mac PC
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  桌面高保真发烧软件，通过 Subsonic 协议串流 NAS 里的 FLAC/WAV 无损音频。
                </p>
              </div>
            </div>
          </div>

          {/* NAS Directory Info */}
          <div className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#FF6700]" />
              <span>家庭 NAS 曲库挂载</span>
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Tinglan 自动同步 Docker `/music` 挂载目录或局域网 SMB/NFS 音乐共享。通过 Subsonic API，随时随地在手机上听 NAS 里的无损音乐。
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};
