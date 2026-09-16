import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Repeat, 
  Shuffle, 
  Volume2, 
  VolumeX, 
  Mic2, 
  Maximize2, 
  Minimize2, 
  Speaker, 
  Laptop, 
  Sliders, 
  Disc,
  Clock,
  Sparkles,
  Flag,
  RotateCcw
} from 'lucide-react';
import { Song, XiaomiDevice, ABLoopConfig } from '../types';
import { formatTime, parseLrc } from '../utils/lyricParser';
import { useTheme } from '../context/ThemeContext';

interface VinylPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isShuffle: boolean;
  onToggleShuffle: () => void;
  repeatMode: 'off' | 'all' | 'one';
  onCycleRepeat: () => void;
  isCasting: boolean;
  activeDevice?: XiaomiDevice;
  onToggleCast: () => void;
  abLoop: ABLoopConfig;
  onSetABLoop: (loop: ABLoopConfig) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
  onOpenEQ?: () => void;
  onOpenInspector?: () => void;
}

export const VinylPlayerModal: React.FC<VinylPlayerModalProps> = ({
  isOpen,
  onClose,
  currentSong,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  volume,
  onVolumeChange,
  isShuffle,
  onToggleShuffle,
  repeatMode,
  onCycleRepeat,
  isCasting,
  activeDevice,
  onToggleCast,
  abLoop,
  onSetABLoop,
  playbackSpeed,
  onPlaybackSpeedChange,
  onOpenEQ,
  onOpenInspector
}) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [prevVol, setPrevVol] = useState(volume);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  // Parse lyrics for the immersive lyrics view
  const lyricLines = React.useMemo(() => {
    if (!currentSong?.lyrics) return [];
    return parseLrc(currentSong.lyrics);
  }, [currentSong?.lyrics]);

  // Current active lyric index
  const activeLyricIndex = React.useMemo(() => {
    if (lyricLines.length === 0) return -1;
    let activeIdx = 0;
    for (let i = 0; i < lyricLines.length; i++) {
      if (currentTime >= lyricLines[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }
    return activeIdx;
  }, [lyricLines, currentTime]);

  // Auto-scroll lyrics
  useEffect(() => {
    if (!showLyrics || activeLyricIndex < 0 || !lyricsContainerRef.current) return;
    const activeEl = lyricsContainerRef.current.children[activeLyricIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showLyrics, activeLyricIndex]);

  // Listen to Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !currentSong) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const loopAPercent = duration > 0 && abLoop.a !== null ? (abLoop.a / duration) * 100 : null;
  const loopBPercent = duration > 0 && abLoop.b !== null ? (abLoop.b / duration) * 100 : null;

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(prevVol > 0 ? prevVol : 0.7);
    } else {
      setPrevVol(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  };

  const handleSetA = () => {
    onSetABLoop({
      ...abLoop,
      a: currentTime,
      enabled: abLoop.b !== null && currentTime < abLoop.b
    });
  };

  const handleSetB = () => {
    if (abLoop.a === null) {
      onSetABLoop({
        a: 0,
        b: currentTime,
        enabled: true
      });
    } else if (currentTime > abLoop.a) {
      onSetABLoop({
        ...abLoop,
        b: currentTime,
        enabled: true
      });
    }
  };

  const handleResetAB = () => {
    onSetABLoop({ a: null, b: null, enabled: false });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#09090b] text-white flex flex-col justify-between select-none overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      {/* Dynamic Ambient Background Blur */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-30 blur-3xl scale-125 transition-all duration-1000 bg-center bg-cover"
        style={{ backgroundImage: `url(${currentSong.coverUrl || '/placeholder.svg'})` }}
      />
      <div className="absolute inset-0 bg-radial from-transparent via-[#09090b]/80 to-[#09090b] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 px-6 sm:px-10 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FF6700]/20 border border-[#FF6700]/40 flex items-center justify-center text-[#FF6700] shadow-[0_0_15px_rgba(255,103,0,0.3)]">
            <Disc className="w-5 h-5 animate-spin-slow" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-[#FF6700] font-bold">
              沉浸黑胶舞台 · Hi-Fi Vinyl Stage
            </span>
            <div className="text-xs text-zinc-400">
              按 <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono">ESC</kbd> 或点击右上角退出全屏
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Audio Spec Inspector Trigger */}
          {onOpenInspector && (
            <button
              onClick={onOpenInspector}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
              title="查看音频编码格式与参数"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{currentSong.bitrate?.includes('FLAC') ? 'FLAC 无损' : currentSong.bitrate || 'Hi-Fi'}</span>
            </button>
          )}

          {/* Lyrics Toggle */}
          <button
            onClick={() => setShowLyrics(prev => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
              showLyrics 
                ? 'bg-[#FF6700] border-[#FF6700] text-white shadow-[0_0_12px_rgba(255,103,0,0.5)]' 
                : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Mic2 className="w-3.5 h-3.5" />
            <span>{showLyrics ? '黑胶唱盘' : '滚动歌词'}</span>
          </button>

          {/* Close / Minimize */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-400 hover:text-white transition"
            title="退出黑胶全屏模式 (ESC)"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Center Stage: Vinyl Turntable OR Floating Synchronized Lyrics */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-center px-6 sm:px-12 gap-8 md:gap-16 max-w-6xl mx-auto w-full py-4">
        {/* Left / Center: Vinyl Record & Tonearm */}
        <div className="relative flex items-center justify-center w-[280px] h-[280px] sm:w-[360px] sm:h-[360px] md:w-[420px] md:h-[420px] shrink-0">
          
          {/* Ambient Glow behind Turntable */}
          <div 
            className={`absolute inset-0 rounded-full blur-2xl transition-opacity duration-700 ${
              isPlaying ? 'opacity-40 bg-[#FF6700]/30 scale-105' : 'opacity-10 bg-white/10 scale-95'
            }`} 
          />

          {/* Vinyl Disc */}
          <div 
            className={`relative w-full h-full rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.8),inset_0_0_0_2px_rgba(255,255,255,0.08)] flex items-center justify-center transition-all ${
              isPlaying ? 'animate-[spin_24s_linear_infinite]' : ''
            }`}
            style={{
              background: 'radial-gradient(circle, #27272a 0%, #18181b 30%, #09090b 70%, #000000 100%)',
              boxShadow: '0 0 0 8px #18181b, 0 0 0 10px #27272a, 0 25px 50px -12px rgba(0,0,0,0.9)'
            }}
          >
            {/* Concentric Sound Grooves */}
            <div className="absolute inset-[15%] rounded-full border border-white/5 pointer-events-none" />
            <div className="absolute inset-[25%] rounded-full border border-white/5 pointer-events-none" />
            <div className="absolute inset-[32%] rounded-full border border-white/5 pointer-events-none" />
            <div className="absolute inset-[38%] rounded-full border border-white/5 pointer-events-none" />

            {/* Vinyl Light Reflection Sheen */}
            <div 
              className="absolute inset-0 rounded-full pointer-events-none opacity-25"
              style={{
                background: 'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.15) 45deg, transparent 90deg, transparent 180deg, rgba(255,255,255,0.15) 225deg, transparent 270deg)'
              }}
            />

            {/* Center Label (Album Artwork) */}
            <div className="relative w-[40%] h-[40%] rounded-full overflow-hidden shadow-2xl border-4 border-zinc-900 flex items-center justify-center">
              <img 
                src={currentSong.coverUrl || '/placeholder.svg'} 
                alt={currentSong.title} 
                className="w-full h-full object-cover select-none"
              />
              {/* Spindle Center Hole */}
              <div className="absolute w-6 h-6 rounded-full bg-zinc-950 border-2 border-zinc-700 shadow-inner flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-zinc-400" />
              </div>
            </div>
          </div>

          {/* Mechanical Tonearm & Stylus */}
          <div 
            className="absolute -top-6 -right-6 sm:-right-8 w-24 h-48 sm:w-32 sm:h-64 pointer-events-none transition-transform duration-700 origin-top-right"
            style={{
              transform: isPlaying ? 'rotate(24deg)' : 'rotate(0deg)'
            }}
          >
            {/* Tonearm Base / Pivot */}
            <div className="absolute top-0 right-4 w-10 h-10 rounded-full bg-gradient-to-b from-zinc-400 to-zinc-800 shadow-xl border border-zinc-600 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-zinc-900 border border-zinc-500" />
            </div>
            {/* Arm Metal Bar */}
            <div className="absolute top-8 right-8 w-1.5 h-36 sm:h-44 bg-gradient-to-r from-zinc-300 via-zinc-400 to-zinc-600 rounded-full shadow-md" />
            {/* Stylus Cartridge */}
            <div className="absolute top-44 sm:top-52 right-6 w-5 h-8 bg-zinc-900 rounded border border-zinc-600 shadow-md flex items-center justify-center">
              <div className="w-1 h-2 bg-[#FF6700] rounded-full" />
            </div>
          </div>
        </div>

        {/* Right: Song Information OR Synchronized Lyrics */}
        <div className="flex-1 flex flex-col justify-center min-w-0 max-w-lg w-full text-center md:text-left">
          {showLyrics ? (
            <div 
              ref={lyricsContainerRef}
              className="h-[320px] sm:h-[380px] overflow-y-auto px-4 py-8 space-y-6 scrollbar-none mask-gradient"
            >
              {lyricLines.length > 0 ? (
                lyricLines.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  return (
                    <p
                      key={idx}
                      onClick={() => onSeek(line.time)}
                      className={`text-lg sm:text-2xl font-bold cursor-pointer transition-all duration-300 ${
                        isActive 
                          ? 'text-[#FF6700] scale-105 font-extrabold translate-x-2' 
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {line.text}
                    </p>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                  <Mic2 className="w-10 h-10 opacity-30 mb-2" />
                  <p className="text-sm">暂无匹配的 LRC 逐行歌词</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-[#FF6700] font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                {currentSong.bitrate?.includes('FLAC') ? '24-bit 96kHz Lossless Master' : 'Hi-Fi High Definition'}
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight truncate leading-tight text-white drop-shadow-md">
                {currentSong.title}
              </h1>

              <h2 className="text-lg sm:text-xl font-medium text-zinc-300 truncate">
                {currentSong.artist}
              </h2>

              <p className="text-sm text-zinc-500 truncate">
                专辑：《{currentSong.album || '单曲'}》{currentSong.year ? ` · ${currentSong.year}` : ''}
              </p>

              {/* Speaker Cast Indicator */}
              <div className="pt-2 flex items-center justify-center md:justify-start gap-3">
                <button
                  onClick={onToggleCast}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                    isCasting 
                      ? 'bg-[#FF6700] border-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.5)]' 
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {isCasting ? (
                    <>
                      <Speaker className="w-4 h-4 animate-pulse" />
                      <span>正在投播至【{activeDevice?.name || '小米音箱'}】</span>
                    </>
                  ) : (
                    <>
                      <Laptop className="w-4 h-4 text-zinc-400" />
                      <span>电脑本地播放 · 点击投音箱</span>
                    </>
                  )}
                </button>
              </div>

              {/* A-B Looping Status Pill */}
              <div className="pt-2 flex items-center justify-center md:justify-start gap-2">
                <span className="text-xs text-zinc-400 font-mono">A-B 段复读:</span>
                {abLoop.enabled && abLoop.a !== null && abLoop.b !== null ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-mono">
                    <Flag className="w-3 h-3 text-cyan-400" />
                    <span>[{formatTime(abLoop.a)} - {formatTime(abLoop.b)}] 循环中</span>
                    <button 
                      onClick={handleResetAB}
                      className="ml-1 text-zinc-400 hover:text-white"
                      title="清除复读"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSetA}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-xs font-mono text-zinc-300 transition"
                      title="设定当前位置为起点 A"
                    >
                      定 A 点 {abLoop.a !== null ? `(${formatTime(abLoop.a)})` : ''}
                    </button>
                    <button
                      onClick={handleSetB}
                      disabled={abLoop.a === null}
                      className={`px-2 py-0.5 rounded text-xs font-mono transition ${
                        abLoop.a === null 
                          ? 'opacity-30 bg-white/5 text-zinc-600 cursor-not-allowed' 
                          : 'bg-white/10 hover:bg-white/20 text-zinc-300'
                      }`}
                      title="设定当前位置为终点 B"
                    >
                      定 B 点
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Controls Bar */}
      <footer className="relative z-10 px-6 sm:px-12 py-6 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-4 max-w-5xl mx-auto w-full">
        {/* Progress Bar & Timestamps */}
        <div className="space-y-1.5">
          <div 
            ref={progressBarRef}
            onClick={handleProgressBarClick}
            className="relative h-2 rounded-full bg-white/15 cursor-pointer group flex items-center overflow-visible"
          >
            {/* A-B Highlighted Region */}
            {loopAPercent !== null && loopBPercent !== null && loopBPercent > loopAPercent && (
              <div 
                className="absolute top-0 bottom-0 bg-cyan-400/40 rounded-full border-x border-cyan-400 z-0"
                style={{
                  left: `${loopAPercent}%`,
                  width: `${loopBPercent - loopAPercent}%`
                }}
              />
            )}

            {/* Played Progress */}
            <div 
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-[#FF6700] relative z-10"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Marker A Flag */}
            {loopAPercent !== null && (
              <div 
                className="absolute -top-3 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
                style={{ left: `${loopAPercent}%` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-[9px] font-bold text-cyan-300 font-mono">A</span>
              </div>
            )}

            {/* Marker B Flag */}
            {loopBPercent !== null && (
              <div 
                className="absolute -top-3 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
                style={{ left: `${loopBPercent}%` }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span className="text-[9px] font-bold text-cyan-300 font-mono">B</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control Buttons Cluster */}
        <div className="flex items-center justify-between gap-4">
          {/* Left: Shuffle & Repeat */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onToggleShuffle}
              title={isShuffle ? '随机播放已开启' : '随机播放已关闭'}
              className={`p-2 rounded-full transition ${
                isShuffle ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Shuffle className="w-5 h-5" />
            </button>

            <button
              onClick={onCycleRepeat}
              title={`循环模式: ${repeatMode}`}
              className={`p-2 rounded-full transition relative ${
                repeatMode !== 'off' ? 'text-[#FF6700] bg-[#FF6700]/15' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Repeat className="w-5 h-5" />
              {repeatMode === 'one' && (
                <span className="absolute top-0 right-0 text-[9px] font-bold text-[#FF6700]">1</span>
              )}
            </button>
          </div>

          {/* Center: Prev, Play/Pause, Next */}
          <div className="flex items-center gap-4 sm:gap-6">
            <button
              onClick={onPrev}
              title="上一首"
              className="p-2 sm:p-3 text-zinc-300 hover:text-white hover:scale-110 active:scale-95 transition"
            >
              <SkipBack className="w-6 h-6 fill-current" />
            </button>

            <button
              onClick={onPlayPause}
              title={isPlaying ? '暂停' : '播放'}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>

            <button
              onClick={onNext}
              title="下一首"
              className="p-2 sm:p-3 text-zinc-300 hover:text-white hover:scale-110 active:scale-95 transition"
            >
              <SkipForward className="w-6 h-6 fill-current" />
            </button>
          </div>

          {/* Right: Playback Speed & Volume */}
          <div className="flex items-center gap-3">
            {/* Speed Selector */}
            <button
              onClick={() => {
                const speeds = [0.75, 1.0, 1.25, 1.5];
                const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
                onPlaybackSpeedChange(speeds[nextIdx]);
              }}
              title="切换播放速度"
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-mono font-bold text-zinc-300 transition"
            >
              {playbackSpeed}x
            </button>

            {/* EQ trigger */}
            {onOpenEQ && (
              <button
                onClick={onOpenEQ}
                title="专业均衡器"
                className="p-2 text-zinc-400 hover:text-white transition"
              >
                <Sliders className="w-5 h-5" />
              </button>
            )}

            {/* Volume */}
            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={handleToggleMute}
                className="p-1.5 text-zinc-400 hover:text-white transition"
              >
                {volume === 0 || isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setIsMuted(false);
                  onVolumeChange(parseFloat(e.target.value));
                }}
                className="w-20 h-1.5 accent-[#FF6700] rounded-lg cursor-pointer bg-white/20"
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
