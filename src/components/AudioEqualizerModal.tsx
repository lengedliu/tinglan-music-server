import React, { useState, useEffect, useRef } from 'react';
import { Sliders, X, Sparkles, Volume2, RotateCcw, Activity } from 'lucide-react';

interface AudioEqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
}

// 10-Band Equalizer frequencies in Hz
const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 0, 2, 4, 5, 6, 7],
  Pop: [-1, 2, 4, 5, 3, -1, -2, -2, -1, -1],
  Rock: [5, 3, -1, -3, -1, 2, 4, 6, 6, 6],
  Jazz: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3],
  Vocal: [-2, -1, 1, 3, 5, 4, 2, 0, -1, -2],
  Classical: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
};

export const AudioEqualizerModal: React.FC<AudioEqualizerModalProps> = ({
  isOpen,
  onClose,
  audioRef,
  isPlaying,
}) => {
  const [eqGains, setEqGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [selectedPreset, setSelectedPreset] = useState<string>('Flat');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize Web Audio API
  useEffect(() => {
    if (!audioRef.current) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        // Create MediaElementSource
        const audioEl = audioRef.current;
        let sourceNode: MediaElementAudioSourceNode;
        
        // Prevent reconnecting duplicate source
        if ((audioEl as any).__audioSourceNode) {
          sourceNode = (audioEl as any).__audioSourceNode;
        } else {
          sourceNode = ctx.createMediaElementSource(audioEl);
          (audioEl as any).__audioSourceNode = sourceNode;
        }

        // Create 10 BiquadFilterNodes
        const filters = FREQUENCIES.map((freq) => {
          const filter = ctx.createBiquadFilter();
          filter.type = freq <= 64 ? 'lowshelf' : freq >= 8000 ? 'highshelf' : 'peaking';
          filter.frequency.value = freq;
          filter.Q.value = 1.4;
          filter.gain.value = 0;
          return filter;
        });
        filtersRef.current = filters;

        // Create AnalyserNode
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        // Chain nodes: Source -> F1 -> F2 ... -> F10 -> Analyser -> Destination
        let prevNode: AudioNode = sourceNode;
        filters.forEach((filter) => {
          prevNode.connect(filter);
          prevNode = filter;
        });
        prevNode.connect(analyser);
        analyser.connect(ctx.destination);
      }
    } catch (e) {
      console.warn('Web Audio API EQ setup notice:', e);
    }
  }, [audioRef]);

  // Resume AudioContext on user interaction/play
  useEffect(() => {
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended' && isPlaying) {
      audioCtxRef.current.resume();
    }
  }, [isPlaying]);

  // Apply Gain Changes
  const applyGain = (index: number, val: number) => {
    const newGains = [...eqGains];
    newGains[index] = val;
    setEqGains(newGains);
    setSelectedPreset('Custom');

    if (filtersRef.current[index]) {
      filtersRef.current[index].gain.value = isEnabled ? val : 0;
    }
  };

  const handleSelectPreset = (presetName: string) => {
    const preset = EQ_PRESETS[presetName];
    if (!preset) return;
    setSelectedPreset(presetName);
    setEqGains([...preset]);

    preset.forEach((gain, idx) => {
      if (filtersRef.current[idx]) {
        filtersRef.current[idx].gain.value = isEnabled ? gain : 0;
      }
    });
  };

  const toggleEQ = () => {
    const nextState = !isEnabled;
    setIsEnabled(nextState);
    eqGains.forEach((gain, idx) => {
      if (filtersRef.current[idx]) {
        filtersRef.current[idx].gain.value = nextState ? gain : 0;
      }
    });
  };

  const resetEQ = () => {
    handleSelectPreset('Flat');
  };

  // Canvas Audio Spectrum Visualizer
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyserRef.current && isPlaying) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        const barWidth = (width / bufferLength) * 1.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height;

          const gradient = ctx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, '#FF6700');
          gradient.addColorStop(0.6, '#fb923c');
          gradient.addColorStop(1, '#fde047');

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight, barWidth - 2, barHeight, [4, 4, 0, 0]);
          ctx.fill();

          x += barWidth + 2;
        }
      } else {
        // Subtle ambient wave when paused
        ctx.fillStyle = 'rgba(255, 103, 0, 0.15)';
        ctx.fillRect(0, height - 4, width, 4);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, isPlaying]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-6">
        
        {/* Glowing Background Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6700]/10 blur-[80px] pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.3)]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                10段专业均衡器 (EQ)
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-mono">
                  Songloft Engine
                </span>
              </h3>
              <p className="text-xs text-zinc-400">
                Web Audio 实时高保真音频混音与频谱可视化
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleEQ}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                isEnabled
                  ? 'bg-[#FF6700] text-white border-[#FF6700]'
                  : 'bg-zinc-800 text-zinc-400 border-white/10'
              }`}
            >
              {isEnabled ? 'EQ 开启' : 'EQ 旁路'}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Spectrum Visualizer Canvas */}
        <div className="relative h-20 bg-zinc-900/60 rounded-2xl border border-white/5 overflow-hidden p-2 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={500}
            height={80}
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 left-3 flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
            <Activity className="w-3 h-3 text-[#FF6700] animate-pulse" />
            <span>REAL-TIME SPECTRUM</span>
          </div>
        </div>

        {/* Presets Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>预设音效 (Presets)</span>
            <button
              onClick={resetEQ}
              className="text-[11px] text-zinc-500 hover:text-[#FF6700] flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3 h-3" />
              重置
            </button>
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(EQ_PRESETS).map((p) => (
              <button
                key={p}
                onClick={() => handleSelectPreset(p)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition ${
                  selectedPreset === p
                    ? 'bg-[#FF6700] text-white font-bold shadow-[0_0_12px_rgba(255,103,0,0.4)]'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 10 Band Sliders */}
        <div className="bg-zinc-900/40 p-4 rounded-2xl border border-white/5">
          <div className="grid grid-cols-10 gap-1 sm:gap-2 h-44 items-end pt-4 pb-2">
            {FREQUENCIES.map((freq, idx) => {
              const gainVal = eqGains[idx];
              const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
              return (
                <div key={freq} className="flex flex-col items-center h-full justify-between group">
                  <span className="text-[10px] font-mono font-semibold text-zinc-400 group-hover:text-[#FF6700] transition">
                    {gainVal > 0 ? `+${gainVal}` : gainVal}
                  </span>
                  
                  <div className="relative flex-1 w-full flex items-center justify-center my-1">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="1"
                      value={gainVal}
                      onChange={(e) => applyGain(idx, parseFloat(e.target.value))}
                      className="w-28 -rotate-90 origin-center accent-[#FF6700] cursor-pointer bg-zinc-800 rounded-lg h-1.5"
                    />
                  </div>

                  <span className="text-[10px] font-mono text-zinc-500 font-bold group-hover:text-white transition">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-2 border-t border-white/5">
          <span>采样率: 44.1kHz / 48kHz PCM</span>
          <span>BiquadFilterNode 响应模式: PEAKING</span>
        </div>

      </div>
    </div>
  );
};
