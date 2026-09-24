import React, { useState, useRef, useEffect, memo } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

export interface VolumeControllerProps {
  volume: number;
  onVolumeChange: (vol: number) => void;
  speakerVolume?: number;
  onSpeakerVolumeChange?: (vol: number) => void;
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
  const [draggingSpeakerVol, setDraggingSpeakerVol] = useState<number | null>(null);
  const draggingSpeakerVolRef = useRef<number | null>(null);
  draggingSpeakerVolRef.current = draggingSpeakerVol;

  // Release commit listener across window so releasing outside the slider bounds still commits cleanly
  useEffect(() => {
    const handleGlobalRelease = () => {
      if (draggingSpeakerVolRef.current !== null) {
        const finalVal = draggingSpeakerVolRef.current;
        setDraggingSpeakerVol(null);
        if (onSpeakerVolumeChange) {
          onSpeakerVolumeChange(finalVal);
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalRelease);
    window.addEventListener('touchend', handleGlobalRelease);
    return () => {
      window.removeEventListener('mouseup', handleGlobalRelease);
      window.removeEventListener('touchend', handleGlobalRelease);
    };
  }, [onSpeakerVolumeChange]);

  const toggleMute = () => {
    if (isCasting) {
      if (onSpeakerVolumeChange) {
        if (speakerVolume > 0) {
          onSpeakerVolumeChange(0);
        } else {
          onSpeakerVolumeChange(40);
        }
      }
      return;
    }

    if (isMuted) {
      setIsMuted(false);
      onVolumeChange(prevVolume || 0.7);
    } else {
      setPrevVolume(volume);
      setIsMuted(true);
      onVolumeChange(0);
    }
  };

  return (
    <div className="hidden md:flex items-center gap-2">
      <button 
        id="btn-toggle-volume-mute"
        onClick={toggleMute}
        className={`p-1.5 transition ${isCasting ? 'text-[#FF6700] hover:text-[#e55c00]' : isLight ? 'text-zinc-600 hover:text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
        title={
          isCasting 
            ? `【音箱硬件音量: ${speakerVolume}%】点击切换静音` 
            : (isMuted ? '取消静音' : '静音')
        }
      >
        {isCasting ? (
          speakerVolume === 0 ? (
            <VolumeX className="w-4 h-4 text-rose-500" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#FF6700]" />
          )
        ) : isMuted || volume === 0 ? (
          <VolumeX className="w-4 h-4 text-rose-500" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>
      <div className="w-24 flex items-center relative group/vol">
        {isCasting ? (
          // Speaker hardware volume slider with drag commit
          <>
            {draggingSpeakerVol !== null && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-[#FF6700] text-white text-[10px] font-mono font-bold whitespace-nowrap shadow-lg pointer-events-none z-20 animate-in fade-in zoom-in-95 duration-100">
                {draggingSpeakerVol}% 松开下发
              </div>
            )}
            <input 
              id="input-speaker-hardware-volume-slider"
              type="range" 
              min="0" 
              max="100" 
              step="1"
              value={draggingSpeakerVol !== null ? draggingSpeakerVol : speakerVolume}
              onMouseDown={(e) => {
                setDraggingSpeakerVol(Number((e.target as HTMLInputElement).value));
              }}
              onTouchStart={(e) => {
                setDraggingSpeakerVol(Number((e.target as HTMLInputElement).value));
              }}
              onChange={(e) => {
                setDraggingSpeakerVol(Number(e.target.value));
              }}
              onMouseUp={(e) => {
                const targetVal = Number((e.target as HTMLInputElement).value);
                setDraggingSpeakerVol(null);
                if (onSpeakerVolumeChange) onSpeakerVolumeChange(targetVal);
              }}
              onTouchEnd={(e) => {
                const targetVal = Number((e.target as HTMLInputElement).value);
                setDraggingSpeakerVol(null);
                if (onSpeakerVolumeChange) onSpeakerVolumeChange(targetVal);
              }}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
                  const targetVal = Number((e.target as HTMLInputElement).value);
                  setDraggingSpeakerVol(null);
                  if (onSpeakerVolumeChange) onSpeakerVolumeChange(targetVal);
                }
              }}
              title={`音箱硬件音量: ${draggingSpeakerVol !== null ? draggingSpeakerVol : speakerVolume}% (拖动中实时预览，松开下发)`}
              className={`w-full h-1.5 ${isLight ? 'bg-zinc-200' : 'bg-zinc-800'} accent-[#FF6700] rounded-full cursor-pointer`}
            />
          </>
        ) : (
          // Local browser audio volume slider
          <input 
            id="input-audio-volume-slider"
            type="range" 
            min="0" 
            max="1" 
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setIsMuted(false);
              onVolumeChange(val);
            }}
            title={`电脑本地音量: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            className={`w-full h-1.5 ${isLight ? 'bg-zinc-200' : 'bg-zinc-800'} accent-[#FF6700] rounded-full cursor-pointer`}
          />
        )}
      </div>
    </div>
  );
});

VolumeController.displayName = 'VolumeController';
