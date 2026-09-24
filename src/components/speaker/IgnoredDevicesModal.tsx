import React from 'react';
import { ShieldCheck, X, Plus } from 'lucide-react';

interface IgnoredDevice {
  did: string;
  name?: string;
  ip?: string;
  model?: string;
  source?: string;
  reason?: string;
}

interface IgnoredDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  ignoredDevices: IgnoredDevice[];
  onAddDevice?: (dev: { name: string; ip: string; did?: string; model?: string; hardware?: string; token?: string }) => void;
}

export const IgnoredDevicesModal: React.FC<IgnoredDevicesModalProps> = ({
  isOpen,
  onClose,
  ignoredDevices,
  onAddDevice
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-xl bg-zinc-900 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                MIoT Spec 过滤设备清单 ({ignoredDevices.length} 台)
              </h3>
              <p className="text-xs text-zinc-400">
                双轨融合后经 MIoT Spec 研判判定为非音箱的设备
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 text-xs text-zinc-400 space-y-1">
          <span className="font-semibold text-zinc-300 block">过滤判定规则 (MIoT Spec Policy)：</span>
          <p className="text-[11px] leading-relaxed">
            按照小米设备发现架构规范，系统检索各设备的官方 MIoT 规范定义。若设备属于照明（light）、插座（switch/outlet）、摄像机、传感器等非智能音箱品类，且无 <code className="text-rose-300 font-mono">intelligent-speaker</code> 或 <code className="text-rose-300 font-mono">play-control</code> 服务，则自动将其从音箱面板剔除。
          </p>
        </div>

        <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
          {ignoredDevices.length === 0 ? (
            <div className="text-center py-8 text-zinc-500 text-xs">
              暂无被过滤的非音箱设备记录
            </div>
          ) : (
            ignoredDevices.map((dev, idx) => (
              <div key={dev.did || idx} className="p-3 rounded-2xl bg-zinc-950/80 border border-white/5 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white font-mono">{dev.name || '未命名设备'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/20 font-mono">
                    已忽略
                  </span>
                </div>
                <div className="text-zinc-500 text-[11px] font-mono flex flex-wrap gap-x-3">
                  <span>DID: {dev.did}</span>
                  {dev.ip && <span className="text-emerald-400 font-bold">IP: {dev.ip}</span>}
                  <span>Model: {dev.model}</span>
                  <span>来源: {dev.source === 'lan' ? '局域网 miIO Hello' : dev.source === 'cloud' ? '米家云端' : dev.source}</span>
                </div>
                <div className="text-rose-400 text-[11px] pt-1">
                  原因: {dev.reason}
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const suggestedName = dev.name && !dev.name.includes('miio') 
                        ? dev.name 
                        : (dev.ip ? `小爱音箱 (${dev.ip})` : `小爱音箱 (${dev.did.slice(-4)})`);
                      
                      onAddDevice?.({
                        name: suggestedName,
                        ip: dev.ip || '',
                        did: dev.did,
                        model: dev.model && dev.model !== 'miio.device.unknown' ? dev.model : 'xiaomi.wifispeaker',
                        hardware: 'XiaoAi Smart Speaker'
                      });
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#FF6700] to-amber-600 hover:from-[#e55c00] hover:to-amber-500 text-white font-semibold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>强制收录为小爱音箱 {dev.ip ? `(IP: ${dev.ip})` : ''}</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
