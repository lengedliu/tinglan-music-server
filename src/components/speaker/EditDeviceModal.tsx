import React, { useState, useEffect } from 'react';
import { Edit3, X } from 'lucide-react';
import { XiaomiDevice } from '../../types';

interface EditDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: XiaomiDevice | null;
  onUpdateDevice: (did: string, updates: Partial<XiaomiDevice>) => void;
}

export const EditDeviceModal: React.FC<EditDeviceModalProps> = ({
  isOpen,
  onClose,
  device,
  onUpdateDevice
}) => {
  const [editDevName, setEditDevName] = useState('');
  const [editDevIp, setEditDevIp] = useState('');
  const [editDevDid, setEditDevDid] = useState('');
  const [editDevModel, setEditDevModel] = useState('');
  const [editDevHardware, setEditDevHardware] = useState('');
  const [editDevToken, setEditDevToken] = useState('');

  useEffect(() => {
    if (device) {
      setEditDevName(device.name || '');
      setEditDevIp(device.ip || '');
      setEditDevDid(device.did || '');
      setEditDevModel(device.model || 'xiaomi.wifispeaker.sound');
      setEditDevHardware(device.hardware || 'Sound');
      setEditDevToken('');
    }
  }, [device]);

  if (!isOpen || !device) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDevName.trim() || !editDevIp.trim()) return;

    const updates: Partial<XiaomiDevice> = {
      name: editDevName.trim(),
      ip: editDevIp.trim(),
      model: editDevModel.trim(),
      hardware: editDevHardware.trim()
    };

    if (editDevDid.trim()) {
      updates.did = editDevDid.trim();
    }

    if (editDevToken.trim()) {
      updates.token = editDevToken.trim();
    }

    onUpdateDevice(device.did, updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 shadow-[0_0_12px_rgba(255,103,0,0.25)]">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">编辑音箱配置</h3>
              <p className="text-xs text-zinc-400">修改名称、局域网 IP 或型号硬件参数</p>
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
            <label className="block text-xs text-zinc-400 mb-1 font-medium">设备名称 *</label>
            <input
              type="text"
              required
              placeholder="音箱名称"
              value={editDevName}
              onChange={(e) => setEditDevName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 IP 地址 *</label>
            <input
              type="text"
              required
              placeholder="例如：192.168.31.108"
              value={editDevIp}
              onChange={(e) => setEditDevIp(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/80 border border-white/10 rounded-xl text-sm text-zinc-100 font-mono focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">设备 DID (设备唯一标识)</label>
            <input
              type="text"
              placeholder="例如：381928471"
              value={editDevDid}
              onChange={(e) => setEditDevDid(e.target.value)}
              className="w-full px-4 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5 font-medium">快速切换机型预设</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {[
                { name: '小爱音箱 Pro', model: 'xiaomi.wifispeaker.lx06', hw: 'LX06' },
                { name: '小爱音箱 Play', model: 'xiaomi.wifispeaker.l05c', hw: 'L05C' },
                { name: 'Xiaomi Sound', model: 'xiaomi.wifispeaker.l16a', hw: 'L16A' },
                { name: '小爱触屏音箱', model: 'xiaomi.wifispeaker.lx04', hw: 'LX04' },
                { name: '小爱音箱 Art', model: 'xiaomi.wifispeaker.l09a', hw: 'L09A' },
                { name: '小爱音箱 (通用)', model: 'xiaomi.wifispeaker.sound', hw: 'Sound' },
              ].map((preset) => (
                <button
                  key={preset.model}
                  type="button"
                  onClick={() => {
                    setEditDevModel(preset.model);
                    setEditDevHardware(preset.hw);
                  }}
                  className={`p-2 rounded-xl text-left border transition cursor-pointer ${
                    editDevModel === preset.model
                      ? 'bg-[#FF6700]/20 border-[#FF6700] text-white shadow-sm'
                      : 'bg-zinc-950/60 border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  <div className="font-medium text-xs text-zinc-200">{preset.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">{preset.hw}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">Model 标识</label>
              <input
                type="text"
                placeholder="xiaomi.wifispeaker.sound"
                value={editDevModel}
                onChange={(e) => setEditDevModel(e.target.value)}
                className="w-full px-3.5 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1 font-medium">硬件代号</label>
              <input
                type="text"
                placeholder="L16A / LX06"
                value={editDevHardware}
                onChange={(e) => setEditDevHardware(e.target.value)}
                className="w-full px-3.5 py-2 bg-zinc-950/80 border border-white/10 rounded-xl text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#FF6700] transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1 font-medium">局域网 Token (可选)</label>
            <input
              type="text"
              placeholder={device.hasToken ? `已配置Token (${device.tokenMasked || '已加密'})，留空保持原Token` : "32位十六进制 Token (留空则使用局域网自动协商)"}
              value={editDevToken}
              onChange={(e) => setEditDevToken(e.target.value)}
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
              disabled={!editDevName.trim() || !editDevIp.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#FF6700] hover:bg-[#e55c00] text-white text-sm font-semibold shadow-[0_4px_20px_rgba(255,103,0,0.35)] transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              保存修改
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
