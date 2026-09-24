import React, { useState } from 'react';
import { Radio, X } from 'lucide-react';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (dev: { name: string; ip: string; did?: string; model?: string; hardware?: string; token?: string }) => void;
}

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  onAddDevice
}) => {
  const [newDevName, setNewDevName] = useState('');
  const [newDevIp, setNewDevIp] = useState('');
  const [newDevModel, setNewDevModel] = useState('xiaomi.wifispeaker.sound');
  const [newDevHardware, setNewDevHardware] = useState('Sound');
  const [newDevToken, setNewDevToken] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDevName.trim() || !newDevIp.trim()) return;

    onAddDevice({
      name: newDevName.trim(),
      ip: newDevIp.trim(),
      model: newDevModel.trim(),
      hardware: newDevHardware.trim(),
      token: newDevToken.trim() || undefined
    });

    setNewDevName('');
    setNewDevIp('');
    setNewDevToken('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.25)]">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">手动接入小米音箱</h3>
              <p className="text-xs text-zinc-400">支持不同子网或静态绑定的音箱设备</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">设备自定义名称 *</label>
            <input
              type="text"
              required
              placeholder="例如：客厅小爱 Pro / 卧室音箱"
              value={newDevName}
              onChange={(e) => setNewDevName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 IP 地址 *</label>
            <input
              type="text"
              required
              placeholder="例如：192.168.31.155"
              value={newDevIp}
              onChange={(e) => setNewDevIp(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 font-mono focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">快速选择音箱机型预设</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {[
                { name: '小爱音箱 Pro', model: 'xiaomi.wifispeaker.lx06', hw: 'LX06', desc: '发烧级/DLNA/红外' },
                { name: '小爱音箱 Play', model: 'xiaomi.wifispeaker.l05c', hw: 'L05C', desc: '时钟版/性价比' },
                { name: 'Xiaomi Sound', model: 'xiaomi.wifispeaker.l16a', hw: 'L16A', desc: '高保真/计算音频' },
                { name: '小爱触屏音箱', model: 'xiaomi.wifispeaker.lx04', hw: 'LX04', desc: '带屏/多模态' },
                { name: '小爱音箱 Art', model: 'xiaomi.wifispeaker.l09a', hw: 'L09A', desc: '金属机身/DTS' },
                { name: '小爱音箱 (通用)', model: 'xiaomi.wifispeaker.sound', hw: 'Sound', desc: '标准 MIoT 协议' },
              ].map((preset) => (
                <button
                  key={preset.model}
                  type="button"
                  onClick={() => {
                    setNewDevModel(preset.model);
                    setNewDevHardware(preset.hw);
                    if (!newDevName || newDevName === '客厅小爱 Pro' || newDevName.startsWith('小爱')) {
                      setNewDevName(preset.name);
                    }
                  }}
                  className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                    newDevModel === preset.model
                      ? 'bg-[#FF6700]/20 border-[#FF6700] text-white shadow-sm'
                      : 'bg-zinc-950/60 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-medium text-xs text-zinc-200">{preset.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{preset.hw} · {preset.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">设备 Model</label>
              <input
                type="text"
                value={newDevModel}
                onChange={(e) => setNewDevModel(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">硬件代号</label>
              <input
                type="text"
                value={newDevHardware}
                onChange={(e) => setNewDevHardware(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 Token (可选)</label>
            <input
              type="text"
              placeholder="32位十六进制 Token (免密/局域网直连使用)"
              value={newDevToken}
              onChange={(e) => setNewDevToken(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!newDevName.trim() || !newDevIp.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.35)] transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              保存并接入
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
