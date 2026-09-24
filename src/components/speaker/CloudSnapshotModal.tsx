import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  X, 
  Copy, 
  Check, 
  Download, 
  Trash2, 
  AlertCircle, 
  Code, 
  Info, 
  CheckCircle2, 
  FileText 
} from 'lucide-react';
import { MiotConfig } from '../../types';
import { apiFetch } from '../../utils/api';
import { cleanDeviceName } from './speakerUtils';

interface CloudSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  miotConfig: MiotConfig;
  onTriggerScan: () => void;
}

export const CloudSnapshotModal: React.FC<CloudSnapshotModalProps> = ({
  isOpen,
  onClose,
  miotConfig,
  onTriggerScan
}) => {
  const [cloudSnapshots, setCloudSnapshots] = useState<any[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState(0);
  const [copiedSnapshot, setCopiedSnapshot] = useState(false);
  const [copiedItem, setCopiedItem] = useState(false);

  const fetchCloudSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const res = await apiFetch('/api/miot/cloud/snapshots');
      const data = await res.json();
      if (data.success && Array.isArray(data.snapshots)) {
        setCloudSnapshots(data.snapshots);
      }
    } catch (err) {
      console.error('Failed to fetch cloud snapshots', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCloudSnapshots();
    }
  }, [isOpen]);

  const handleClearSnapshots = async () => {
    try {
      await apiFetch('/api/miot/cloud/snapshots/clear', { method: 'POST' });
      setCloudSnapshots([]);
    } catch (err) {
      console.error('Failed to clear snapshots', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-5xl bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                小米云端接口抓包快照与原始设备数据
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  {cloudSnapshots.length} 个请求记录
                </span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                实时记录与米家 (MiHome) / 小爱 (Mina) 各大区云端交互的原始 HTTP 返回，秒级归因“为何无设备”
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchCloudSnapshots}
              disabled={isLoadingSnapshots}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
              title="刷新快照"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingSnapshots ? 'animate-spin text-purple-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Diagnostic / Account Overview Banner */}
        <div className="px-6 py-3 bg-zinc-950/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-zinc-400">
            <span>
              用户ID: <strong className="text-zinc-200">{cleanDeviceName(miotConfig.miUser || miotConfig.userId || '未绑定')}</strong>
            </span>
            <span>
              登录态: <strong className={miotConfig.isLoggedIn ? 'text-emerald-400' : 'text-amber-400'}>{miotConfig.isLoggedIn ? '已授权' : '未登录'}</strong>
            </span>
            <span>
              Token: <strong className={miotConfig.hasServiceToken || miotConfig.serviceToken ? 'text-emerald-400' : 'text-rose-400'}>{miotConfig.hasServiceToken || miotConfig.serviceToken ? '已配置 (已脱敏)' : '未配置'}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const allJson = JSON.stringify(cloudSnapshots, null, 2);
                navigator.clipboard.writeText(allJson);
                setCopiedSnapshot(true);
                setTimeout(() => setCopiedSnapshot(false), 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-semibold transition active:scale-95 cursor-pointer"
            >
              {copiedSnapshot ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnapshot ? '已复制全部' : '复制全部原始快照'}</span>
            </button>
            <a
              href="/api/miot/cloud/export-debug"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 text-xs font-semibold transition active:scale-95 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载诊断包 (.json)</span>
            </a>
            <button
              type="button"
              onClick={handleClearSnapshots}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs transition cursor-pointer"
              title="清空快照"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Split View */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-[400px]">
          {/* Left Side: Snapshot Request List */}
          <div className="w-full md:w-5/12 border-r border-white/10 overflow-y-auto p-3 space-y-2 bg-zinc-950/20">
            {cloudSnapshots.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-3">
                <AlertCircle className="w-8 h-8 text-zinc-500 mx-auto" />
                <p className="text-xs text-zinc-400">暂无云端抓包快照记录</p>
                <button
                  type="button"
                  onClick={() => {
                    onTriggerScan();
                    setTimeout(() => fetchCloudSnapshots(), 1500);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition cursor-pointer"
                >
                  立即发起云端扫描以生成快照
                </button>
              </div>
            ) : (
              cloudSnapshots.map((snap, idx) => {
                const isSelected = selectedSnapshotIndex === idx;
                const isSuccess = snap.status >= 200 && snap.status < 300;
                const hasDevices = snap.deviceCount > 0;
                return (
                  <div
                    key={snap.id || idx}
                    onClick={() => setSelectedSnapshotIndex(idx)}
                    className={`p-3 rounded-2xl border text-xs cursor-pointer transition ${
                      isSelected
                        ? 'bg-purple-900/30 border-purple-500/50 shadow-sm'
                        : 'bg-zinc-900/60 hover:bg-zinc-800/60 border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isSuccess ? (hasDevices ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-rose-400'
                          }`}
                        />
                        <span className="font-bold text-white font-mono truncate max-w-[170px]">
                          {snap.service === 'mina' ? '小爱 Mina 接口' : snap.service === 'mihome' ? '米家 MiHome 接口' : '海外大区接口'}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                          isSuccess
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        HTTP {snap.status || 'ERR'}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-zinc-400 truncate mb-1">
                      {snap.url}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>{snap.timestamp}</span>
                      <span className="flex items-center gap-2">
                        <span>{snap.durationMs}ms</span>
                        <strong className={hasDevices ? 'text-emerald-400 font-bold' : 'text-zinc-400'}>
                          {snap.deviceCount} 台设备
                        </strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Side: Detailed JSON & Analysis */}
          <div className="w-full md:w-7/12 overflow-y-auto p-4 sm:p-5 space-y-4 bg-zinc-900/30">
            {cloudSnapshots.length > 0 && cloudSnapshots[selectedSnapshotIndex] ? (
              (() => {
                const snap = cloudSnapshots[selectedSnapshotIndex];
                const rawJson = typeof snap.rawResponse === 'string'
                  ? snap.rawResponse
                  : JSON.stringify(snap.rawResponse, null, 2);

                return (
                  <div className="space-y-4">
                    {/* Summary Header */}
                    <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono flex items-center gap-2">
                          <Code className="w-4 h-4 text-purple-400" />
                          <span>{snap.url}</span>
                        </span>
                        <span className="text-xs text-zinc-400 font-mono">{snap.timestamp} ({snap.durationMs}ms)</span>
                      </div>

                      {/* Diagnostic Reason / Explanation */}
                      {snap.status === 401 && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <strong className="block font-bold">401 凭据鉴权失败：</strong>
                            小米服务器拒绝了当前 serviceToken。请确认是从 mina.mi.com 复制的最新 Cookie，或重新使用账号密码绑定。
                          </div>
                        </div>
                      )}

                      {snap.status >= 200 && snap.status < 300 && snap.deviceCount === 0 && (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                          <Info className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <strong className="block font-bold">云端接口返回 0 台设备原因归因：</strong>
                            接口通信正常且身份验证通过，但小米云端数据库在该账号下返回空数组 <code className="text-amber-200 font-mono">[]</code>。可能原因：
                            <br />1. 音箱绑定在<strong>家人/其他主账号</strong>下（小爱音箱通常仅主账号拥有云端管理权）。
                            <br />2. 音箱被添加在其他地区服务器（如海外/新加坡）。
                            <br />3. 推荐解决方案：点击主界面【手动添加音箱】，输入音箱的局域网 IP（如 192.168.31.x），局域网模式不受小米账号绑定限制！
                          </div>
                        </div>
                      )}

                      {snap.deviceCount > 0 && (
                        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <strong className="block font-bold">成功解析出 {snap.deviceCount} 台设备：</strong>
                            {snap.extractedDevices?.map((d: any) => `${d.name} (${d.model || d.hardware}) [DID: ${d.did}]`).join('、 ')}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Extracted Devices Summary Cards */}
                    {snap.extractedDevices && snap.extractedDevices.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-zinc-300">提取到的设备明细：</span>
                        <div className="space-y-2">
                          {snap.extractedDevices.map((d: any, dIdx: number) => (
                            <div key={d.did || dIdx} className="p-3 rounded-xl bg-zinc-950/80 border border-white/5 text-xs flex items-center justify-between font-mono">
                              <div>
                                <div className="font-bold text-white">{d.name}</div>
                                <div className="text-[11px] text-zinc-400">DID: {d.did} | Model: {d.model} | HW: {d.hardware}</div>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] ${d.online ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                                {d.online ? '在线' : '离线'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Raw JSON Code Block */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-400 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-purple-400" />
                          <span>原始 HTTP Response (Raw JSON)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(rawJson);
                            setCopiedItem(true);
                            setTimeout(() => setCopiedItem(false), 2000);
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedItem ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>复制单项 JSON</span>
                        </button>
                      </div>
                      
                      <pre className="p-4 rounded-2xl bg-zinc-950 border border-white/10 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-[350px] leading-relaxed select-all">
                        {rawJson}
                      </pre>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="text-center py-20 text-zinc-500 text-xs">
                请在左侧选择一个接口请求快照以查看原始数据
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-950/50 border-t border-white/10 flex items-center justify-between text-xs">
          <span className="text-zinc-500">
            提示：快照仅缓存在运行态内存中，用于排查设备列表为空与网络鉴权问题。
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
