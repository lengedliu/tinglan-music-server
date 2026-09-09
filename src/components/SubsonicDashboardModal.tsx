import React, { useState } from 'react';
import { Server, Copy, Check, ShieldCheck, Terminal, Smartphone, Radio, Globe, ExternalLink, X, Code } from 'lucide-react';

interface SubsonicDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverHost: string;
}

export const SubsonicDashboardModal: React.FC<SubsonicDashboardModalProps> = ({
  isOpen,
  onClose,
  serverHost,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentHost = serverHost || window.location.origin;
  const subsonicRestUrl = `${currentHost}/rest`;
  const subsonicOpenApiUrl = `${currentHost}/api/subsonic/info`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6 max-h-[90vh] overflow-y-auto">
        
        {/* Background Ambient Glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-[#FF6700]/10 blur-[90px] pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Subsonic & OpenSubsonic 接口网关
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-mono">
                  Songloft Standard
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                兼容 Subsonic/Navidrome 协议，支持任何第三方客户端与 Songloft App 接入
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Connection Parameters */}
        <div className="space-y-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#FF6700]" />
            Subsonic 客户端连接参数
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Server Address */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">服务器 URL (Server URL)</label>
              <div className="flex items-center justify-between gap-2 bg-zinc-950 p-2 rounded-xl border border-white/10 font-mono text-xs text-amber-300 truncate">
                <span className="truncate">{currentHost}</span>
                <button
                  onClick={() => copyToClipboard(currentHost, 'url')}
                  className="p-1 text-zinc-400 hover:text-white transition"
                  title="复制"
                >
                  {copiedField === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* REST Endpoint */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">REST API Endpoint</label>
              <div className="flex items-center justify-between gap-2 bg-zinc-950 p-2 rounded-xl border border-white/10 font-mono text-xs text-amber-300 truncate">
                <span className="truncate">{subsonicRestUrl}</span>
                <button
                  onClick={() => copyToClipboard(subsonicRestUrl, 'rest')}
                  className="p-1 text-zinc-400 hover:text-white transition"
                  title="复制"
                >
                  {copiedField === 'rest' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Default Account */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">默认登录账号 (Username)</label>
              <div className="flex items-center justify-between gap-2 bg-zinc-950 p-2 rounded-xl border border-white/10 font-mono text-xs text-zinc-200">
                <span>admin</span>
                <button
                  onClick={() => copyToClipboard('admin', 'user')}
                  className="p-1 text-zinc-400 hover:text-white transition"
                >
                  {copiedField === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Protocol */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-white/5 space-y-1.5">
              <label className="text-[11px] font-medium text-zinc-400">支持协议 (Supported APIs)</label>
              <div className="p-2 rounded-xl bg-zinc-950 border border-white/10 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Subsonic v1.16.1 & OpenSubsonic</span>
              </div>
            </div>
          </div>
        </div>

        {/* Compatible Apps List */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-[#FF6700]" />
            推荐兼容客户端 (Songloft Ecosystem)
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-1 text-left">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                Songloft Player
              </h5>
              <p className="text-[11px] text-zinc-400 leading-snug">
                基于 Flutter 的全平台无广告音乐客户端
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-1 text-left">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                Symfonium / Dsub
              </h5>
              <p className="text-[11px] text-zinc-400 leading-snug">
                Android / iOS 标准 Subsonic 听歌客户端
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-zinc-900/40 border border-white/5 space-y-1 text-left">
              <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
                Navidrome Clients
              </h5>
              <p className="text-[11px] text-zinc-400 leading-snug">
                SubStreamer, Ultrasonic 等所有通用 APP
              </p>
            </div>
          </div>
        </div>

        {/* API Endpoint Spec details */}
        <div className="p-4 rounded-2xl bg-zinc-900/80 border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
            <span className="flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-[#FF6700]" />
              已启用的 REST 接口清单
            </span>
            <span className="text-[10px] text-emerald-400">Status: Active</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
            /rest/ping.view · /rest/getMusicFolders.view · /rest/getIndexes.view · /rest/getArtists.view · /rest/getAlbum.view · /rest/getPlaylists.view · /rest/getLyrics.view · /rest/stream.view · /rest/search3.view
          </p>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-white/5 text-center text-[11px] text-zinc-500">
          基于 Songloft 插件与 Subsonic 开放规范构建
        </div>

      </div>
    </div>
  );
};
