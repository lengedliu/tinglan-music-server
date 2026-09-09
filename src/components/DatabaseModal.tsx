import React, { useState, useEffect } from 'react';
import { Database, Server, Check, AlertCircle, RefreshCw, Layers, ShieldCheck, Cpu, HardDrive, ArrowRight, Activity, Terminal } from 'lucide-react';
import { DbEngine, DbConfig, DbStatusInfo } from '../types';
import { apiFetch } from '../utils/api';

interface DatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
}

export const DatabaseModal: React.FC<DatabaseModalProps> = ({ isOpen, onClose, onShowToast }) => {
  const [dbStatus, setDbStatus] = useState<DbStatusInfo | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<DbEngine>('sqlite');
  
  // Postgres form
  const [pgHost, setPgHost] = useState('localhost');
  const [pgPort, setPgPort] = useState(5432);
  const [pgUser, setPgUser] = useState('postgres');
  const [pgPassword, setPgPassword] = useState('');
  const [pgDatabase, setPgDatabase] = useState('tinglan_db');

  // MySQL form
  const [myHost, setMyHost] = useState('localhost');
  const [myPort, setMyPort] = useState(3306);
  const [myUser, setMyUser] = useState('root');
  const [myPassword, setMyPassword] = useState('');
  const [myDatabase, setMyDatabase] = useState('tinglan_db');

  // Action states
  const [testing, setTesting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchDbStatus();
    }
  }, [isOpen]);

  const fetchDbStatus = async () => {
    try {
      const res = await apiFetch('/api/db/status');
      const data = await res.json();
      if (res.ok && data.success) {
        setDbStatus(data.status);
        setSelectedEngine(data.status.engine);
        if (data.config?.postgresConfig) {
          setPgHost(data.config.postgresConfig.host || 'localhost');
          setPgPort(data.config.postgresConfig.port || 5432);
          setPgUser(data.config.postgresConfig.user || 'postgres');
          setPgDatabase(data.config.postgresConfig.database || 'tinglan_db');
        }
        if (data.config?.mysqlConfig) {
          setMyHost(data.config.mysqlConfig.host || 'localhost');
          setMyPort(data.config.mysqlConfig.port || 3306);
          setMyUser(data.config.mysqlConfig.user || 'root');
          setMyDatabase(data.config.mysqlConfig.database || 'tinglan_db');
        }
      }
    } catch (e) {
      console.error('Failed to load DB status', e);
    }
  };

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const configPayload: any = { engine: selectedEngine };
    if (selectedEngine === 'postgres') {
      configPayload.postgresConfig = { host: pgHost, port: Number(pgPort), user: pgUser, password: pgPassword, database: pgDatabase };
    } else if (selectedEngine === 'mysql') {
      configPayload.mysqlConfig = { host: myHost, port: Number(myPort), user: myUser, password: myPassword, database: myDatabase };
    }

    try {
      const startTime = Date.now();
      const res = await apiFetch('/api/db/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload)
      });
      const latency = Date.now() - startTime;
      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || '数据库连接成功！', latency });
      } else {
        setTestResult({ success: false, message: data.error || data.message || '连接失败，请检查主机名与密钥' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `网络错误: ${err.message || '请求无法送达'}` });
    } finally {
      setTesting(false);
    }
  };

  const handleSwitchEngine = async () => {
    setSwitching(true);
    const configPayload: any = { engine: selectedEngine };
    if (selectedEngine === 'postgres') {
      configPayload.postgresConfig = { host: pgHost, port: Number(pgPort), user: pgUser, password: pgPassword, database: pgDatabase };
    } else if (selectedEngine === 'mysql') {
      configPayload.mysqlConfig = { host: myHost, port: Number(myPort), user: myUser, password: myPassword, database: myDatabase };
    }

    try {
      const res = await apiFetch('/api/db/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        onShowToast('数据库切换成功', data.message || `已切换至 ${selectedEngine.toUpperCase()} 引擎`, 'success');
        fetchDbStatus();
      } else {
        onShowToast('数据库切换失败', data.error || data.message || '请检查数据库服务器配置', 'error');
      }
    } catch (err: any) {
      onShowToast('网络错误', err.message || '数据库切换请求失败', 'error');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-900/95 border border-white/10 rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl backdrop-blur-xl relative overflow-hidden space-y-6 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FF6700]/15 border border-[#FF6700]/30 text-[#FF6700] flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                数据库管理中心
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  多引擎支持
                </span>
              </h2>
              <p className="text-xs text-zinc-400">支持 SQLite (零配置嵌入库)、PostgreSQL (云原生高并发) 与 MySQL</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition"
          >
            ✕
          </button>
        </div>

        {/* Current Status Card */}
        {dbStatus && (
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#FF6700]" />
                <span className="text-xs text-zinc-400 font-medium">当前运行引擎:</span>
                <span className="text-sm font-bold text-white uppercase tracking-wider">{dbStatus.engineName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${dbStatus.isConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-500'}`} />
                <span className="text-xs font-semibold text-emerald-400">{dbStatus.isConnected ? '正常在线' : '连接异常'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-center">
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase">注册用户</p>
                <p className="text-base font-bold text-white">{dbStatus.totalUsers ?? 0} 人</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase">储存歌曲</p>
                <p className="text-base font-bold text-white">{dbStatus.totalSongs ?? 0} 首</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase">自建歌单</p>
                <p className="text-base font-bold text-white">{dbStatus.totalPlaylists ?? 0} 个</p>
              </div>
              <div className="p-2.5 rounded-xl bg-zinc-900 border border-white/5">
                <p className="text-[10px] text-zinc-500 uppercase">核心数据表</p>
                <p className="text-base font-bold text-[#FF6700]">{dbStatus.tablesCount ?? 5} 张</p>
              </div>
            </div>
          </div>
        )}

        {/* Engine Selector Tabs */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-300">选择目标数据库引擎</label>
          <div className="grid grid-cols-3 gap-3">
            
            {/* SQLite */}
            <button
              onClick={() => setSelectedEngine('sqlite')}
              className={`p-3.5 rounded-2xl border text-left transition relative ${
                selectedEngine === 'sqlite'
                  ? 'bg-[#FF6700]/15 border-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.25)]'
                  : 'bg-zinc-950/60 border-white/10 text-zinc-400 hover:border-white/30'
              }`}
            >
              <HardDrive className="w-5 h-5 text-[#FF6700] mb-2" />
              <p className="text-sm font-bold text-white">SQLite 3</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">本地轻量文件存储 (开箱即用)</p>
            </button>

            {/* PostgreSQL */}
            <button
              onClick={() => setSelectedEngine('postgres')}
              className={`p-3.5 rounded-2xl border text-left transition relative ${
                selectedEngine === 'postgres'
                  ? 'bg-blue-500/15 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.25)]'
                  : 'bg-zinc-950/60 border-white/10 text-zinc-400 hover:border-white/30'
              }`}
            >
              <Server className="w-5 h-5 text-blue-400 mb-2" />
              <p className="text-sm font-bold text-white">PostgreSQL</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">云端高并发关系型数据库</p>
            </button>

            {/* MySQL */}
            <button
              onClick={() => setSelectedEngine('mysql')}
              className={`p-3.5 rounded-2xl border text-left transition relative ${
                selectedEngine === 'mysql'
                  ? 'bg-amber-500/15 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                  : 'bg-zinc-950/60 border-white/10 text-zinc-400 hover:border-white/30'
              }`}
            >
              <Layers className="w-5 h-5 text-amber-400 mb-2" />
              <p className="text-sm font-bold text-white">MySQL</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">经典高性能关系型数据库</p>
            </button>

          </div>
        </div>

        {/* PostgreSQL Config Form */}
        {selectedEngine === 'postgres' && (
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-blue-500/30 space-y-3">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-4 h-4" />
              PostgreSQL 服务器连接设置
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">主机地址 (Host)</label>
                <input
                  type="text"
                  value={pgHost}
                  onChange={(e) => setPgHost(e.target.value)}
                  placeholder="e.g. 127.0.0.1 or ep-abc.aws.neon.tech"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">端口 (Port)</label>
                <input
                  type="number"
                  value={pgPort}
                  onChange={(e) => setPgPort(Number(e.target.value))}
                  placeholder="5432"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">用户名 (User)</label>
                <input
                  type="text"
                  value={pgUser}
                  onChange={(e) => setPgUser(e.target.value)}
                  placeholder="postgres"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">密码 (Password)</label>
                <input
                  type="password"
                  value={pgPassword}
                  onChange={(e) => setPgPassword(e.target.value)}
                  placeholder="输入数据库访问密码"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-zinc-400 mb-1">数据库名 (Database Name)</label>
                <input
                  type="text"
                  value={pgDatabase}
                  onChange={(e) => setPgDatabase(e.target.value)}
                  placeholder="tinglan_db"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* MySQL Config Form */}
        {selectedEngine === 'mysql' && (
          <div className="p-4 rounded-2xl bg-zinc-950/80 border border-amber-500/30 space-y-3">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              MySQL 服务器连接设置
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">主机地址 (Host)</label>
                <input
                  type="text"
                  value={myHost}
                  onChange={(e) => setMyHost(e.target.value)}
                  placeholder="e.g. 127.0.0.1"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">端口 (Port)</label>
                <input
                  type="number"
                  value={myPort}
                  onChange={(e) => setMyPort(Number(e.target.value))}
                  placeholder="3306"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">用户名 (User)</label>
                <input
                  type="text"
                  value={myUser}
                  onChange={(e) => setMyUser(e.target.value)}
                  placeholder="root"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">密码 (Password)</label>
                <input
                  type="password"
                  value={myPassword}
                  onChange={(e) => setMyPassword(e.target.value)}
                  placeholder="输入数据库访问密码"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] text-zinc-400 mb-1">数据库名 (Database Name)</label>
                <input
                  type="text"
                  value={myDatabase}
                  onChange={(e) => setMyDatabase(e.target.value)}
                  placeholder="tinglan_db"
                  className="w-full px-3 py-2 bg-zinc-900 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Test Result Toast */}
        {testResult && (
          <div className={`p-3 rounded-2xl text-xs flex items-center justify-between border ${
            testResult.success
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {testResult.success ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{testResult.message}</span>
            </div>
            {testResult.latency !== undefined && (
              <span className="font-mono text-[10px] opacity-80">{testResult.latency} ms</span>
            )}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold border border-white/10 transition active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {testing ? (
              <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Terminal className="w-4 h-4 text-[#FF6700]" />
            )}
            <span>测试连接</span>
          </button>

          <button
            type="button"
            onClick={handleSwitchEngine}
            disabled={switching}
            className="px-6 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-[0_4px_15px_rgba(255,103,0,0.35)] transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {switching ? (
              <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>保存并切换引擎</span>
          </button>
        </div>

      </div>
    </div>
  );
};
