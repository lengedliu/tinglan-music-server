import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export interface VolumeControllerProps {
  volume: number;
  onVolumeChange: (vol: number) => void;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number, silent?: boolean) => void;
  isCasting: boolean;
  isLight?: boolean;
}

export const VolumeController: React.FC<VolumeControllerProps> = memo(({
  volume,
  onVolumeChange,
  speakerVolume = 40,
  onSpeakerVolumeChange,
  isCasting,
  isLight = false
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [prevVolume, setPrevVolume] = useState(volume);
  const [prevSpeakerVolume, setPrevSpeakerVolume] = useState(speakerVolume || 40);
  const [isHovering, setIsHovering] = useState(false);

  // Speaker drag state + post-release optimistic hold so thumb never snaps back
  const [draggingSpeakerVol, setDraggingSpeakerVol] = useState<number | null>(null);
  const [committedSpeakerVol, setCommittedSpeakerVol] = useState<number | null>(null);

  const draggingSpeakerVolRef = useRef<number | null>(null);
  draggingSpeakerVolRef.current = draggingSpeakerVol;

  const lastLiveDispatchAtRef = useRef<number>(0);
  const commitHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear optimistic hold once parent speakerVolume catches up
  useEffect(() => {
    if (committedSpeakerVol !== null && Math.abs(speakerVolume - committedSpeakerVol) <= 1) {
      setCommittedSpeakerVol(null);
      if (commitHoldTimerRef.current) {
        clearTimeout(commitHoldTimerRef.current);
        commitHoldTimerRef.current = null;
      }
    }
  }, [speakerVolume, committedSpeakerVol]);

  useEffect(() => {
    return () => {
      if (commitHoldTimerRef.current) clearTimeout(commitHoldTimerRef.current);
      if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
    };
  }, []);

  const commitSpeakerVolume = useCallback((finalVal: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(finalVal)));
    if (clamped > 0) setPrevSpeakerVolume(clamped);
    setDraggingSpeakerVol(null);
    draggingSpeakerVolRef.current = null;
    setCommittedSpeakerVol(clamped);

    if (commitHoldTimerRef.current) clearTimeout(commitHoldTimerRef.current);
    commitHoldTimerRef.current = setTimeout(() => {
      setCommittedSpeakerVol(null);
    }, 2200);

    if (onSpeakerVolumeChange) {
      onSpeakerVolumeChange(clamped, false);
    }
  }, [onSpeakerVolumeChange]);

  // Release commit listener across window so releasing outside the slider bounds still commits cleanly
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (draggingSpeakerVolRef.current !== null) {
        commitSpeakerVolume(draggingSpeakerVolRef.current);
      }
    };

    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [commitSpeakerVolume]);

  const effectiveSpeakerVol =
    draggingSpeakerVol !== null
      ? draggingSpeakerVol
      : committedSpeakerVol !== null
        ? committedSpeakerVol
        : speakerVolume;

  const effectiveLocalVol = isMuted ? 0 : Math.max(0, Math.min(1, volume));
  const displayPercent = isCasting
    ? Math.round(effectiveSpeakerVol)
    : Math.round(effectiveLocalVol * 100);

  const toggleMute = () => {
    if (isCasting) {
      if (effectiveSpeakerVol > 0) {
        setPrevSpeakerVolume(effectiveSpeakerVol);
        commitSpeakerVolume(0);
      } else {
        commitSpeakerVolume(prevSpeakerVolume > 0 ? prevSpeakerVolume : 40);
      }
      return;
    }

    if (isMuted || volume === 0) {
      setIsMuted(false);
      onVolumeChange(prevVolume > 0.02 ? prevVolume : 0.7);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  };

  // Mouse wheel smooth adjustment (±3% per notch)
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 1 : -1;

    if (isCasting) {
      const nextVal = Math.max(0, Math.min(100, Math.round(effectiveSpeakerVol + delta * 3)));
      if (nextVal === effectiveSpeakerVol) return;
      setCommittedSpeakerVol(nextVal);
      if (commitHoldTimerRef.current) clearTimeout(commitHoldTimerRef.current);
      commitHoldTimerRef.current = setTimeout(() => {
        setCommittedSpeakerVol(null);
      }, 2200);

      if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
      wheelCommitTimerRef.current = setTimeout(() => {
        if (onSpeakerVolumeChange) {
          onSpeakerVolumeChange(nextVal, true);
        }
      }, 90);
    } else {
      const nextLocal = Math.max(0, Math.min(1, Math.round((effectiveLocalVol + delta * 0.03) * 100) / 100));
      setIsMuted(nextLocal === 0);
      if (nextLocal > 0) setPrevVolume(nextLocal);
      onVolumeChange(nextLocal);
    }
  };

  const isInteracting = draggingSpeakerVol !== null || isHovering;

  return (
    <div
      className="hidden md:flex items-center gap-1.5 select-none"
      onWheel={handleWheel}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button 
        id="btn-toggle-volume-mute"
        onClick={toggleMute}
        className={`p-1.5 rounded-lg transition cursor-pointer ${
          isCasting
            ? 'text-[#FF6700] hover:bg-[#FF6700]/10'
            : isLight
              ? 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
        }`}
        title={
          isCasting 
            ? `【音箱硬件音量: ${displayPercent}%】点击切换静音 (支持滚轮微调)` 
            : `${isMuted || displayPercent === 0 ? '取消静音' : '静音'} (${displayPercent}% · 支持滚轮微调)`
        }
      >
        {displayPercent === 0 ? (
          <VolumeX className="w-4 h-4 text-rose-500" />
        ) : (
          <Volume2 className={`w-4 h-4 ${isCasting ? 'text-[#FF6700]' : ''}`} />
        )}
      </button>

      <div className="w-24 h-7 flex items-center relative group/vol">
        {/* Floating Volume Tooltip on Hover or Drag */}
        {isInteracting && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md bg-[#FF6700] text-white text-[10px] font-mono font-bold whitespace-nowrap shadow-md pointer-events-none z-20 transition-opacity duration-75">
            {isCasting ? `音箱 ${displayPercent}%` : `${displayPercent}%`}
          </div>
        )}

        {/* Custom High-Contrast Track + Smooth Fill + Thumb (Immune to global input !important overrides) */}
        <div
          className={`w-full h-1.5 group-hover/vol:h-2 rounded-full relative transition-all duration-150 pointer-events-none ${
            isLight ? 'bg-zinc-200/90' : 'bg-zinc-700/80'
          }`}
        >
          {/* Active Fill Bar */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#FF6700] to-orange-400"
            style={{ width: `${displayPercent}%` }}
          />
          {/* Thumb Indicator */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-[#FF6700] shadow-[0_1px_6px_rgba(255,103,0,0.55)] transition-transform duration-100 ${
              isInteracting ? 'scale-110 opacity-100' : 'scale-90 opacity-0 group-hover/vol:opacity-100'
            }`}
            style={{ left: `${displayPercent}%` }}
          />
        </div>

        {isCasting ? (
          // Speaker hardware volume slider with throttled live scrubbing & optimistic release
          <input 
            id="input-speaker-hardware-volume-slider"
            type="range" 
            min="0" 
            max="100" 
            step="1"
            value={effectiveSpeakerVol}
            onChange={(e) => {
              const nextVal = Number(e.target.value);
              setDraggingSpeakerVol(nextVal);
              draggingSpeakerVolRef.current = nextVal;

              // Throttled silent live dispatch while dragging so speaker responds smoothly in real time
              const now = Date.now();
              if (now - lastLiveDispatchAtRef.current >= 180) {
                lastLiveDispatchAtRef.current = now;
                if (onSpeakerVolumeChange) {
                  onSpeakerVolumeChange(nextVal, true);
                }
              }
            }}
            onPointerUp={(e) => {
              commitSpeakerVolume(Number((e.target as HTMLInputElement).value));
            }}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                commitSpeakerVolume(Number((e.target as HTMLInputElement).value));
              }
            }}
            title={`音箱硬件音量: ${displayPercent}% (支持点击跳转、实时拖拽与滚轮调节)`}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0"
          />
        ) : (
          // Local browser audio volume slider
          <input 
            id="input-audio-volume-slider"
            type="range" 
            min="0" 
            max="1" 
            step="0.01"
            value={effectiveLocalVol}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setIsMuted(val === 0);
              if (val > 0) setPrevVolume(val);
              onVolumeChange(val);
            }}
            title={`电脑本地音量: ${displayPercent}% (支持点击跳转、拖拽与滚轮调节)`}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0"
          />
        )}
      </div>
    </div>
  );
});

VolumeController.displayName = 'VolumeController';

