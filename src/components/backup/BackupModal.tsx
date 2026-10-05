import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Download,
  UploadCloud,
  FileCheck,
  RefreshCw,
  Clock,
  Sparkles,
  Database,
  History,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreComplete?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  onRestoreComplete
}) => {
  const { themeConfig, isLight } = useTheme();

  const [snapshots, setSnapshots] = useState<Array<{ filename: string; sizeKb: string; createdAt: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchSnapshots = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/system/snapshots');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSnapshots(data.snapshots || []);
        }
      }
    } catch (err) {
      console.error('Failed to load DR snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSnapshots();
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExportBackup = () => {
    window.open('/api/system/export-backup', '_blank');
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    setStatusMessage(null);
    try {
      const text = await file.text();
      const backupObj = JSON.parse(text);

      const res = await apiFetch('/api/system/restore-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupObj)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: data.message || '全量云端灾备还原成功！' });
        if (onRestoreComplete) onRestoreComplete();
        fetchSnapshots();
      } else {
        setStatusMessage({ type: 'error', text: data.error || '灾备文件解析或还原失败' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: '格式错误: ' + err.message });
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  const handleCreateSnapshot = async () => {
    setCreatingSnapshot(true);
    setStatusMessage(null);
    try {
      const res = await apiFetch('/api/system/snapshots/create', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMessage({ type: 'success', text: data.message || '本地 DR 快照创建成功！' });
        fetchSnapshots();
      } else {
        setStatusMessage({ type: 'error', text: data.error || '创建快照失败' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setCreatingSnapshot(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-3xl border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden ${
          isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-white/10 text-zinc-100'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg text-lg"
              style={{ backgroundColor: themeConfig.primaryColor }}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                全量云端灾备与数据复原
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Zero Data Loss DR
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                包含家庭账号、音箱绑定、自动化、NAS 挂载、歌单与红心全量配置
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition text-left flex flex-col justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <Download className="w-4 h-4 group-hover:scale-110 transition" />
                <span>导出全量 DR 灾备备份包</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2">
                生成加密包含音箱集群、家庭成员、红心歌单的全量备份文件 (.json)
              </p>
            </button>

            <label className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition text-left flex flex-col justify-between cursor-pointer group relative">
              <input
                type="file"
                accept=".json"
                onChange={handleFileImport}
                disabled={restoring}
                className="hidden"
              />
              <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
                {restoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4 group-hover:scale-110 transition" />}
                <span>{restoring ? '正在恢复中...' : '导入恢复云端灾备包'}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-2">
                选择备份 JSON 一键全量解包复原，瞬间恢复音箱与家庭成员数据
              </p>
            </label>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Local Snapshots Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <History className="w-4 h-4 text-amber-400" />
                本地自动灾备快照归档
              </span>
              <button
                type="button"
                onClick={handleCreateSnapshot}
                disabled={creatingSnapshot}
                className="text-xs text-amber-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {creatingSnapshot ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>立即生成全量 DR 快照</span>
              </button>
            </div>

            {snapshots.length === 0 ? (
              <div className="p-6 rounded-2xl bg-black/20 border border-white/5 text-center text-xs text-zinc-500">
                暂无自动生成的 DR 快照，点击右上方按钮可立即生成第一份归档快照。
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {snapshots.map((s, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs text-zinc-300"
                  >
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="font-mono text-[11px] font-bold">{s.filename}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          {new Date(s.createdAt).toLocaleString('zh-CN')} · {s.sizeKb} KB
                        </div>
                      </div>
                    </div>

                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                      归档已保护
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
