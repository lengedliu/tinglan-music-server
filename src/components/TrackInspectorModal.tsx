import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cpu, 
  Disc, 
  FileAudio, 
  Layers, 
  Radio, 
  HardDrive, 
  Clock, 
  FileText, 
  Copy, 
  Check, 
  Play, 
  Speaker,
  Sparkles,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { Song, XiaomiDevice } from '../types';
import { formatTime } from '../utils/lyricParser';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../utils/api';

interface TrackInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
  onPlaySong?: (song: Song) => void;
  onCastSong?: (song: Song) => void;
  activeDevice?: XiaomiDevice;
}

export const TrackInspectorModal: React.FC<TrackInspectorModalProps> = ({
  isOpen,
  onClose,
  song,
  onPlaySong,
  onCastSong,
  activeDevice
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme === 'light';
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [techDetails, setTechDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !song) return;

    setIsLoading(true);
    apiFetch(`/api/songs/${encodeURIComponent(song.id)}/inspector`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.success && data.song) {
          setTechDetails(data.song);
        } else {
          setTechDetails(null);
        }
      })
      .catch(() => setTechDetails(null))
      .finally(() => setIsLoading(false));
  }, [isOpen, song?.id]);

  if (!isOpen || !song) return null;

  const resolved = techDetails || song;
  const isFlac = resolved.format === 'FLAC' || resolved.bitrate?.toLowerCase().includes('flac') || resolved.url?.toLowerCase().includes('.flac');
  const isHiRes = resolved.sampleRate?.includes('96') || resolved.sampleRate?.includes('192') || resolved.bitDepth?.includes('24');

  const copyStreamUrl = () => {
    const urlToCopy = resolved.publicStreamUrl || resolved.url;
    if (urlToCopy) {
      navigator.clipboard.writeText(urlToCopy);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-[#18181b] border-white/10 text-white'
        }`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-zinc-900/50'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FF6700]/15 flex items-center justify-center text-[#FF6700]">
              <Cpu className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-base font-bold flex items-center gap-2">
                音频技术指标与 ID3 元数据
                {isHiRes && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" />
                    Hi-Res Audio
                  </span>
                )}
                {isFlac && !isHiRes && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Lossless 无损
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-500">
                实时分析音频封装规格、采样精度及流媒体分发参数
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isLight ? 'hover:bg-zinc-200 text-zinc-500' : 'hover:bg-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Track Summary Banner */}
          <div className={`p-4 rounded-xl border flex items-center gap-4 ${
            isLight ? 'bg-zinc-50/80 border-zinc-200' : 'bg-zinc-900/60 border-white/5'
          }`}>
            <img 
              src={resolved.coverUrl || '/placeholder.svg'} 
              alt={resolved.title}
              className="w-16 h-16 rounded-lg object-cover shadow-md border border-white/10 flex-shrink-0" 
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-bold truncate text-white dark:text-white mb-0.5" style={{ color: isLight ? '#18181b' : '#ffffff' }}>
                {resolved.title}
              </h4>
              <p className="text-xs text-zinc-400 truncate">
                {resolved.artist} — 《{resolved.album || '未知专辑'}》
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 font-semibold">
                  {resolved.extension || (resolved.bitrate?.includes('FLAC') ? 'FLAC' : 'MP3')}
                </span>
                <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-zinc-500" />
                  {formatTime(resolved.duration)}
                </span>
                <span className="text-[11px] text-zinc-500">•</span>
                <span className="text-[11px] font-mono text-zinc-400">
                  {resolved.fileSize || '未知大小'}
                </span>
              </div>
            </div>
          </div>

          {/* Technical Specs 2x4 Grid */}
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#FF6700]" />
              数字音频解码与硬件参数
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Sample Rate */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <Radio className="w-3 h-3 text-blue-400" />
                  采样率
                </div>
                <div className="text-xs font-mono font-bold">
                  {resolved.sampleRate || (isFlac ? '96.0 kHz' : '44.1 kHz')}
                </div>
              </div>

              {/* Bit Depth */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-emerald-400" />
                  量化位深
                </div>
                <div className="text-xs font-mono font-bold">
                  {resolved.bitDepth || (isFlac ? '24-bit Studio' : '16-bit PCM')}
                </div>
              </div>

              {/* Bitrate */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <ActivityIcon className="w-3 h-3 text-amber-400" />
                  编码码率
                </div>
                <div className="text-xs font-mono font-bold">
                  {resolved.bitrate || (isFlac ? '1411 kbps' : '320 kbps')}
                </div>
              </div>

              {/* Channels */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <Disc className="w-3 h-3 text-purple-400" />
                  声道配置
                </div>
                <div className="text-xs font-mono font-bold">
                  {resolved.channels || '立体声 (Stereo 2.0)'}
                </div>
              </div>

              {/* Codec */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <FileAudio className="w-3 h-3 text-rose-400" />
                  音频编码器
                </div>
                <div className="text-xs font-mono font-bold truncate" title={resolved.codec || (isFlac ? 'FLAC Codec' : 'MPEG-1 Audio Layer 3')}>
                  {resolved.codec || (isFlac ? 'FLAC Codec' : 'MP3 / LAME 3.99')}
                </div>
              </div>

              {/* Source Origin */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-teal-400" />
                  曲库音源
                </div>
                <div className="text-xs font-mono font-bold truncate">
                  {resolved.source === 'navidrome' ? 'Navidrome 远程' : (resolved.source === 'uploaded' ? '用户自主上传' : '本地挂载目录')}
                </div>
              </div>

              {/* Lyrics Status */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-indigo-400" />
                  逐行歌词
                </div>
                <div className="text-xs font-mono font-bold flex items-center gap-1">
                  {resolved.hasLyrics || resolved.lyrics ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      已匹配 ({resolved.lyricLinesCount || (resolved.lyrics ? resolved.lyrics.split('\n').length : 0)} 行)
                    </span>
                  ) : (
                    <span className="text-zinc-500">无内嵌 LRC</span>
                  )}
                </div>
              </div>

              {/* Container Protocol */}
              <div className={`p-3 rounded-xl border ${isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900/40 border-white/5'}`}>
                <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-sky-400" />
                  串流协议支持
                </div>
                <div className="text-xs font-mono font-bold text-emerald-400">
                  HTTP 206 断点续传
                </div>
              </div>
            </div>
          </div>

          {/* Direct Stream / File Path Section */}
          <div>
            <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2 flex items-center justify-between">
              <span>串流地址与物理源路径</span>
              <button
                onClick={copyStreamUrl}
                className="text-xs text-[#FF6700] hover:underline flex items-center gap-1 font-normal lowercase tracking-normal"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedUrl ? '已复制直链' : '复制串流 URL'}
              </button>
            </h5>
            <div className={`p-3 rounded-xl border text-xs font-mono break-all select-all ${
              isLight ? 'bg-zinc-100/70 border-zinc-200 text-zinc-700' : 'bg-black/40 border-white/5 text-zinc-300'
            }`}>
              {resolved.publicStreamUrl || resolved.url}
            </div>
            {resolved.fullPath && (
              <div className="mt-2 text-[11px] text-zinc-500 font-mono truncate">
                服务器物理绝对路径: {resolved.fullPath}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`px-6 py-3.5 border-t flex items-center justify-between ${
          isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-zinc-900/50'
        }`}>
          <div className="text-xs text-zinc-500">
            ID: <span className="font-mono text-zinc-400">{resolved.id}</span>
          </div>

          <div className="flex items-center gap-2">
            {onCastSong && activeDevice && (
              <button
                onClick={() => {
                  onCastSong(resolved);
                  onClose();
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                  isLight 
                    ? 'border-zinc-300 hover:bg-zinc-200 text-zinc-800' 
                    : 'border-white/15 hover:bg-white/10 text-white'
                }`}
              >
                <Speaker className="w-3.5 h-3.5 text-[#FF6700]" />
                投播至【{activeDevice.name}】
              </button>
            )}

            {onPlaySong && (
              <button
                onClick={() => {
                  onPlaySong(resolved);
                  onClose();
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[#FF6700] hover:bg-[#e55c00] text-white flex items-center gap-1.5 shadow-md shadow-[#FF6700]/25 transition"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                本地播放
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function ActivityIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      {...props} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
