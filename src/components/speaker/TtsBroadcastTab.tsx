import React, { useState, useRef, useEffect } from 'react';
import { Mic2, ShieldCheck, Volume2, Send } from 'lucide-react';
import { XiaomiDevice, DeviceCommandState } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { cleanDeviceName } from './speakerUtils';

interface TtsBroadcastTabProps {
  activeDevice?: XiaomiDevice;
  onSendTts: (did: string, text: string, mode?: string, voice?: string) => void;
  commandState?: DeviceCommandState;
}

export const TtsBroadcastTab: React.FC<TtsBroadcastTabProps> = ({
  activeDevice,
  onSendTts,
  commandState
}) => {
  const { isLight } = useTheme();
  const [ttsInput, setTtsInput] = useState('');
  const [selectedTtsMode, setSelectedTtsMode] = useState<'auto' | 'miot_spec' | 'mina_ubus' | 'audio_stream' | 'local_miio'>('auto');
  const [selectedTtsVoice, setSelectedTtsVoice] = useState('zh-CN-XiaoxiaoNeural');
  const [isPlayingAudioPreview, setIsPlayingAudioPreview] = useState(false);

  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
    onSendTts(activeDevice.did, ttsInput.trim(), selectedTtsMode, selectedTtsVoice);
  };

  const handleAudioStreamPreview = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    // 1. If currently playing, clicking toggles stop
    if (isPlayingAudioPreview) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudioPreview(false);
      return;
    }

    // 2. High-priority Instant Browser Native Speech Synthesis (Zero delay, instant first-click playback)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        speechUtteranceRef.current = utterance;

        // Smart voice matching based on selected voice
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          let matchedVoice: SpeechSynthesisVoice | undefined;
          if (selectedTtsVoice.includes('Jenny') || selectedTtsVoice.includes('en-US')) {
            matchedVoice = voices.find(v => v.lang.startsWith('en') || v.name.toLowerCase().includes('english') || v.name.toLowerCase().includes('jenny'));
            utterance.lang = 'en-US';
          } else if (selectedTtsVoice.includes('HiuMaan') || selectedTtsVoice.includes('zh-HK')) {
            matchedVoice = voices.find(v => v.lang === 'zh-HK' || v.name.toLowerCase().includes('cantonese') || v.name.includes('粤'));
            utterance.lang = 'zh-HK';
          } else if (selectedTtsVoice.includes('Yunxi') || selectedTtsVoice.includes('Yunjian')) {
            matchedVoice = voices.find(v => (v.lang.startsWith('zh') || v.name.includes('Chinese')) && (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('yunxi') || v.name.toLowerCase().includes('yunjian') || v.name.includes('男')));
            utterance.lang = 'zh-CN';
          }

          if (!matchedVoice) {
            matchedVoice = voices.find(v => v.lang === 'zh-CN' || v.lang === 'zh_CN' || v.lang.startsWith('zh') || v.name.toLowerCase().includes('chinese') || v.name.includes('Xiaoxiao') || v.name.includes('Ting-Ting') || v.name.includes('Mei-Jia'));
          }

          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
          setIsPlayingAudioPreview(true);
        };

        utterance.onend = () => {
          setIsPlayingAudioPreview(false);
          speechUtteranceRef.current = null;
        };

        utterance.onerror = (e) => {
          console.warn('[TTS Preview] Web speech playback finished or interrupted', e);
          setIsPlayingAudioPreview(false);
          speechUtteranceRef.current = null;
        };

        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();
        setIsPlayingAudioPreview(true);
        return;
      } catch (err) {
        console.warn('[TTS Preview] Native SpeechSynthesis error, falling back to audio stream', err);
      }
    }

    // 3. Fallback: HTML5 Audio Stream from server
    const streamUrl = `/api/tts/audio.mp3?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(selectedTtsVoice)}&t=${Date.now()}`;
    const audio = new Audio(streamUrl);
    audio.preload = 'auto';
    audioPreviewRef.current = audio;
    setIsPlayingAudioPreview(true);

    audio.onended = () => {
      setIsPlayingAudioPreview(false);
      audioPreviewRef.current = null;
    };
    audio.onerror = () => {
      setIsPlayingAudioPreview(false);
      audioPreviewRef.current = null;
    };

    audio.play().catch(() => {
      setIsPlayingAudioPreview(false);
      audioPreviewRef.current = null;
    });
  };

  const handlePresetTts = (text: string) => {
    if (!activeDevice) return;
    setTtsInput(text);
    onSendTts(activeDevice.did, text, selectedTtsMode, selectedTtsVoice);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className={`p-6 sm:p-8 rounded-3xl backdrop-blur-md border space-y-6 ${
        isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
      }`}>
        <div>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
            isLight ? 'border-zinc-200' : 'border-white/10'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.2)]">
                <Mic2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold flex items-center gap-2 ${
                  isLight ? 'text-zinc-900' : 'text-white'
                }`}>
                  小爱音箱全能语音播报 (Universal TTS Engine)
                </h3>
                <p className={`text-xs mt-0.5 ${
                  isLight ? 'text-zinc-500' : 'text-zinc-400'
                }`}>
                  多通道容灾切换：原生 MIoT 规范 · Mina 云端 · 局域网 miIO · 高保真音频串流
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>目标设备:</span>
              <span className="text-xs font-mono font-semibold text-[#FF6700] px-2.5 py-1 rounded-xl bg-[#FF6700]/10 border border-[#FF6700]/20 truncate max-w-[160px]">
                {cleanDeviceName(activeDevice?.name)}
              </span>
            </div>
          </div>

          {/* Multi-Channel Smart Fallback Notice */}
          <div className={`mt-4 p-3.5 rounded-2xl border flex items-start gap-3 text-xs ${
            isLight 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'
          }`}>
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className={`font-semibold ${isLight ? 'text-emerald-900' : 'text-emerald-300'}`}>
                智能超时防御与无声熔断机制已启用：
              </p>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-emerald-700' : 'text-zinc-300'}`}>
                系统按毫秒级阶梯自动探测：首先执行 <strong>局域网 miIO</strong> 与 <strong>Mina 云端指令</strong>；若该型号音箱不支持或云端指令未响应，系统将在 2.5 秒内自动降级至 <strong>MIoT 规范动作 (siid:5, aiid:1/5)</strong> 或 <strong>高清语音音频串流 (Edge-TTS 串流)</strong>，彻底解决小爱音箱超时、不说话或无反应的问题。
              </p>
            </div>
          </div>
        </div>

        {/* TTS Form */}
        <form onSubmit={handleSendTtsSubmit} className="space-y-4">
          <div>
            <label className={`block text-xs mb-1.5 font-medium ${
              isLight ? 'text-zinc-700' : 'text-zinc-400'
            }`}>播报内容</label>
            <div className="relative">
              <textarea
                rows={3}
                value={ttsInput}
                onChange={(e) => setTtsInput(e.target.value)}
                placeholder="输入要让小爱音箱朗读的文字内容（例如：主人您好，听澜音乐为您服务）..."
                className={`w-full px-4 py-3 rounded-2xl text-sm placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] focus:ring-1 focus:ring-[#FF6700] transition ${
                  isLight 
                    ? 'bg-zinc-50 border border-zinc-200 text-zinc-900' 
                    : 'bg-zinc-950/80 border border-white/10 text-zinc-100'
                }`}
              />
            </div>
          </div>

          {/* Channel Mode and Voice Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className={`block text-[11px] mb-1 font-medium ${
                isLight ? 'text-zinc-600' : 'text-zinc-400'
              }`}>下发协议通道 (Channel Mode)</label>
              <select
                value={selectedTtsMode}
                onChange={(e) => setSelectedTtsMode(e.target.value as any)}
                className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-[#FF6700] ${
                  isLight 
                    ? 'bg-zinc-50 border border-zinc-200 text-zinc-800' 
                    : 'bg-zinc-950/80 border border-white/10 text-zinc-200'
                }`}
              >
                <option value="auto">✨ 自动多通道智能重试 (推荐 · 永不超时)</option>
                <option value="miot_spec">⚡ 米家 MIoT 规范动作 (Play / Execute Text)</option>
                <option value="mina_ubus">☁️ 小爱 Mina 云端指令通道 (Mibrain UBUS)</option>
                <option value="audio_stream">🎵 高清语音串流投播 (Audio Stream TTS)</option>
                <option value="local_miio">📶 局域网 miIO UDP 54321 本地直连</option>
              </select>
            </div>

            <div>
              <label className={`block text-[11px] mb-1 font-medium ${
                isLight ? 'text-zinc-600' : 'text-zinc-400'
              }`}>播报音色 (Voice - 串流/降级模式)</label>
              <select
                value={selectedTtsVoice}
                onChange={(e) => setSelectedTtsVoice(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs focus:outline-none focus:border-[#FF6700] ${
                  isLight 
                    ? 'bg-zinc-50 border border-zinc-200 text-zinc-800' 
                    : 'bg-zinc-950/80 border border-white/10 text-zinc-200'
                }`}
              >
                <option value="zh-CN-XiaoxiaoNeural">晓晓 (亲切温暖女声 · 推荐)</option>
                <option value="zh-CN-YunxiNeural">云希 (阳光清脆男声)</option>
                <option value="zh-CN-YunjianNeural">云健 (影视磁性男声)</option>
                <option value="zh-CN-XiaoyiNeural">晓伊 (甜美清新女声)</option>
                <option value="zh-CN-liaoning-XiaobeiNeural">小北 (东北方言幽默女声)</option>
                <option value="zh-HK-HiuMaanNeural">晓曼 (标准粤语女声)</option>
                <option value="en-US-JennyNeural">Jenny (Natural US English)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-500'}`}>
              支持中文、英文、方言朗读
            </span>
            <div className="flex flex-wrap items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={() => handleAudioStreamPreview(ttsInput)}
                disabled={!ttsInput.trim()}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium border transition active:scale-95 cursor-pointer ${
                  isPlayingAudioPreview
                    ? 'bg-[#FF6700]/20 text-[#FF6700] border-[#FF6700]/40 animate-pulse'
                    : isLight 
                      ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200 disabled:opacity-40'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-white/10 disabled:opacity-40'
                }`}
                title="通过 Edge-TTS 合成并在电脑浏览器本地试听音频效果"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{isPlayingAudioPreview ? '正在播放试听...' : '电脑本地试听 (Preview)'}</span>
              </button>

              <button
                type="submit"
                disabled={!ttsInput.trim() || commandState?.status === 'pending'}
                className="flex items-center gap-2 px-6 py-2 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs sm:text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.3)] disabled:opacity-50 transition active:scale-95 cursor-pointer"
              >
                {commandState?.status === 'pending' && commandState?.action === 'tts' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>正在送达音箱...</span>
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
        <div className={`space-y-2 pt-4 border-t ${isLight ? 'border-zinc-200' : 'border-white/5'}`}>
          <span className={`text-xs block font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>常用快捷播报词：</span>
          <div className="flex flex-wrap gap-2">
            {ttsPresets.map((preset, i) => (
              <button
                key={i}
                onClick={() => handlePresetTts(preset)}
                className={`text-xs px-3.5 py-1.5 rounded-full border transition text-left cursor-pointer ${
                  isLight 
                    ? 'bg-zinc-50 hover:bg-[#FF6700]/10 hover:text-[#FF6700] text-zinc-700 border-zinc-200 hover:border-[#FF6700]/30'
                    : 'bg-zinc-950/60 hover:bg-[#FF6700]/15 hover:text-[#FF6700] text-zinc-300 border-white/5 hover:border-[#FF6700]/30'
                }`}
              >
                “{preset}”
              </button>
            ))}
          </div>
        </div>

        {/* Last TTS status */}
        {activeDevice?.status?.lastTts && (
          <div className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between ${
            isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-600' : 'bg-zinc-950/80 border-white/5 text-zinc-400'
          }`}>
            <span>最近一次播报内容：</span>
            <span className="text-[#FF6700] font-medium">“{activeDevice.status.lastTts}”</span>
          </div>
        )}
      </div>
    </div>
  );
};
