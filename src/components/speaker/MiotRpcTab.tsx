import React, { useState } from 'react';
import { 
  Code, 
  Send, 
  Terminal, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  Sliders, 
  Zap, 
  Layers, 
  ExternalLink, 
  X, 
  Loader2 
} from 'lucide-react';
import { XiaomiDevice } from '../../types';
import { apiFetch } from '../../utils/api';
import { useTheme } from '../../context/ThemeContext';
import { cleanDeviceName } from './speakerUtils';

interface MiotRpcTabProps {
  activeDevice?: XiaomiDevice;
}

export const MiotRpcTab: React.FC<MiotRpcTabProps> = ({ activeDevice }) => {
  const { isLight } = useTheme();
  const [rpcSiid, setRpcSiid] = useState('2');
  const [rpcPiid, setRpcPiid] = useState('1');
  const [rpcAiid, setRpcAiid] = useState('1');
  const [rpcPropValue, setRpcPropValue] = useState('');
  const [rpcActionParams, setRpcActionParams] = useState('[]');
  const [rpcRawMethod, setRpcRawMethod] = useState('miIO.info');
  const [rpcRawParams, setRpcRawParams] = useState('[]');
  const [rpcResponse, setRpcResponse] = useState<any>(null);
  const [isExecutingRpc, setIsExecutingRpc] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // MIoT Spec Definition Viewer State
  const [specDefinition, setSpecDefinition] = useState<any>(null);
  const [isLoadingSpec, setIsLoadingSpec] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);
  const [specSuccessMsg, setSpecSuccessMsg] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRpcGetProp = async () => {
    if (!activeDevice) return;
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      const res = await apiFetch('/api/miot/rpc/prop/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDevice.did,
          siid: Number(rpcSiid),
          piid: Number(rpcPiid)
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  const handleRpcSetProp = async () => {
    if (!activeDevice) return;
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      let parsedVal: any = rpcPropValue;
      if (rpcPropValue === 'true') parsedVal = true;
      else if (rpcPropValue === 'false') parsedVal = false;
      else if (!isNaN(Number(rpcPropValue)) && rpcPropValue.trim() !== '') parsedVal = Number(rpcPropValue);

      const res = await apiFetch('/api/miot/rpc/prop/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDevice.did,
          siid: Number(rpcSiid),
          piid: Number(rpcPiid),
          value: parsedVal
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  const handleRpcAction = async () => {
    if (!activeDevice) return;
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      let inParams: any[] = [];
      try {
        inParams = JSON.parse(rpcActionParams);
      } catch {}

      const res = await apiFetch('/api/miot/rpc/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          did: activeDevice.did,
          siid: Number(rpcSiid),
          aiid: Number(rpcAiid),
          in: inParams
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  const handleRpcRaw = async () => {
    setIsExecutingRpc(true);
    setRpcResponse(null);
    try {
      let paramsVal: any = [];
      try {
        paramsVal = JSON.parse(rpcRawParams);
      } catch {
        paramsVal = [rpcRawParams];
      }

      const res = await apiFetch('/api/miot/rpc/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: activeDevice?.ip,
          token: activeDevice?.token,
          did: activeDevice?.did,
          method: rpcRawMethod,
          params: paramsVal
        })
      });
      const data = await res.json();
      setRpcResponse(data);
    } catch (err: any) {
      setRpcResponse({ success: false, error: err.message });
    } finally {
      setIsExecutingRpc(false);
    }
  };

  const handleLoadModelSpec = async (model: string) => {
    setIsLoadingSpec(true);
    setSpecError(null);
    setSpecSuccessMsg(null);
    try {
      const res = await apiFetch(`/api/miot/spec/${encodeURIComponent(model)}`);
      const data = await res.json();
      if (data.success && data.spec) {
        setSpecDefinition(data.spec);
        setSpecSuccessMsg(`已成功加载 ${model} 的官方 MIoT Spec 实例`);
        setTimeout(() => {
          const el = document.getElementById('miot-spec-definition-view');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 120);
      } else {
        setSpecDefinition(null);
        setSpecError(data.error || `未检索到 ${model} 的官方 MIoT Spec 实例`);
      }
    } catch (err: any) {
      setSpecDefinition(null);
      setSpecError(`加载规范异常: ${err.message}`);
    } finally {
      setIsLoadingSpec(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={`p-6 sm:p-8 rounded-3xl backdrop-blur-md border space-y-6 ${
        isLight ? 'bg-white/90 border-zinc-200 shadow-sm' : 'bg-zinc-900/40 border-white/5'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
          isLight ? 'border-zinc-200' : 'border-white/5'
        }`}>
          <div>
            <h3 className={`text-lg font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              <Code className="w-5 h-5 text-purple-400" />
              MIoT Spec 指令调试控制台 (RPC Console)
            </h3>
            <p className={`text-xs mt-1 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
              直接向当前选中的音箱下发 MIoT Spec 规范指令 (SIID/PIID/AIID) 或通过局域网 UDP miIO / 米家云端发送原始 RPC 封包
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>目标设备:</span>
            <span className="text-xs font-mono font-semibold text-[#FF6700] px-2.5 py-1 rounded-xl bg-[#FF6700]/10 border border-[#FF6700]/20">
              {cleanDeviceName(activeDevice?.name)} ({activeDevice?.ip || '未获取局域网IP'})
            </span>
          </div>
        </div>

        {/* Quick RPC Presets */}
        <div className="space-y-2">
          <span className={`text-xs block font-medium ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>常用 MIoT Spec 快捷指令预设：</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setRpcSiid('2'); setRpcPiid('1'); }}
              className={`px-3 py-1.5 rounded-xl text-xs border transition font-mono cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-purple-100 text-zinc-700 hover:text-purple-700 border-zinc-200' 
                  : 'bg-zinc-950/60 hover:bg-purple-500/20 text-zinc-300 hover:text-purple-300 border-white/5'
              }`}
            >
              读取音量 (siid:2, piid:1)
            </button>
            <button
              type="button"
              onClick={() => { setRpcSiid('2'); setRpcPiid('2'); }}
              className={`px-3 py-1.5 rounded-xl text-xs border transition font-mono cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-purple-100 text-zinc-700 hover:text-purple-700 border-zinc-200' 
                  : 'bg-zinc-950/60 hover:bg-purple-500/20 text-zinc-300 hover:text-purple-300 border-white/5'
              }`}
            >
              读取静音 (siid:2, piid:2)
            </button>
            <button
              type="button"
              onClick={() => { setRpcSiid('3'); setRpcPiid('1'); }}
              className={`px-3 py-1.5 rounded-xl text-xs border transition font-mono cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-purple-100 text-zinc-700 hover:text-purple-700 border-zinc-200' 
                  : 'bg-zinc-950/60 hover:bg-purple-500/20 text-zinc-300 hover:text-purple-300 border-white/5'
              }`}
            >
              读取播放状态 (siid:3, piid:1)
            </button>
            <button
              type="button"
              onClick={() => { setRpcSiid('3'); setRpcAiid('1'); setRpcActionParams('[]'); }}
              className={`px-3 py-1.5 rounded-xl text-xs border transition font-mono cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-purple-100 text-zinc-700 hover:text-purple-700 border-zinc-200' 
                  : 'bg-zinc-950/60 hover:bg-purple-500/20 text-zinc-300 hover:text-purple-300 border-white/5'
              }`}
            >
              触发播放动作 (siid:3, aiid:1)
            </button>
            <button
              type="button"
              onClick={() => { setRpcRawMethod('miIO.info'); setRpcRawParams('[]'); }}
              className={`px-3 py-1.5 rounded-xl text-xs border transition font-mono cursor-pointer ${
                isLight 
                  ? 'bg-zinc-100 hover:bg-purple-100 text-zinc-700 hover:text-purple-700 border-zinc-200' 
                  : 'bg-zinc-950/60 hover:bg-purple-500/20 text-zinc-300 hover:text-purple-300 border-white/5'
              }`}
            >
              miIO.info 设备详情
            </button>
            {activeDevice?.model && (
              <button
                type="button"
                disabled={isLoadingSpec}
                onClick={() => handleLoadModelSpec(activeDevice.model)}
                className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-xs text-purple-700 dark:text-purple-200 border border-purple-500/30 transition font-mono flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                title={`从小米官方 miot-spec.org 查询 ${activeDevice.model} 的完整硬件服务、属性与动作规范`}
              >
                {isLoadingSpec ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                ) : (
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                )}
                <span>{isLoadingSpec ? '正在检索官方 Spec...' : `查看 ${activeDevice.model} 官方 Spec`}</span>
              </button>
            )}
          </div>
        </div>

        {/* Spec Query Status Message / Error Banner */}
        {specError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 dark:text-rose-300 flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <span>{specError}</span>
            </div>
            {activeDevice?.model && (
              <a
                href={`https://home.miot-spec.com/s/${encodeURIComponent(activeDevice.model)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-700 dark:text-rose-200 border border-rose-500/30 transition flex items-center gap-1 flex-shrink-0 no-underline"
              >
                <span>在 MIoT 社区手动搜索</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {specSuccessMsg && !specError && (
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-600 dark:text-emerald-300 flex items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>{specSuccessMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSpecSuccessMsg(null)}
              className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* RPC Operations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form 1: MIoT Property / Action */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <h4 className={`text-sm font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              <Sliders className="w-4 h-4 text-purple-500" />
              MIoT 属性与动作调用
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={`block text-[11px] mb-1 font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>Service ID (siid)</label>
                <input
                  type="number"
                  value={rpcSiid}
                  onChange={(e) => setRpcSiid(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-purple-500 ${
                    isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[11px] mb-1 font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>Property ID (piid)</label>
                <input
                  type="number"
                  value={rpcPiid}
                  onChange={(e) => setRpcPiid(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-purple-500 ${
                    isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>
              <div>
                <label className={`block text-[11px] mb-1 font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>Action ID (aiid)</label>
                <input
                  type="number"
                  value={rpcAiid}
                  onChange={(e) => setRpcAiid(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-purple-500 ${
                    isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[11px] mb-1 ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>设置属性值 (value):</label>
              <input
                type="text"
                value={rpcPropValue}
                onChange={(e) => setRpcPropValue(e.target.value)}
                placeholder="例如: 50 或 true"
                className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-purple-500 ${
                  isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[11px] mb-1 font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>动作输入参数 (in params JSON):</label>
              <input
                type="text"
                value={rpcActionParams}
                onChange={(e) => setRpcActionParams(e.target.value)}
                placeholder="[]"
                className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-purple-500 ${
                  isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                }`}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={handleRpcGetProp}
                disabled={isExecutingRpc || !activeDevice}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition active:scale-95 disabled:opacity-50 cursor-pointer ${
                  isLight 
                    ? 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-200' 
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-white/10'
                }`}
              >
                读取属性 (Get Prop)
              </button>
              <button
                type="button"
                onClick={handleRpcSetProp}
                disabled={isExecutingRpc || !activeDevice}
                className="flex-1 py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                设置属性 (Set Prop)
              </button>
              <button
                type="button"
                onClick={handleRpcAction}
                disabled={isExecutingRpc || !activeDevice}
                className="flex-1 py-2 px-3 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                执行动作 (Action)
              </button>
            </div>
          </div>

          {/* Form 2: Raw miIO UDP / Cloud RPC */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-950/60 border-white/5'
          }`}>
            <h4 className={`text-sm font-bold flex items-center gap-2 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
              <Zap className="w-4 h-4 text-amber-500" />
              原始 miIO / Cloud RPC 封包测试
            </h4>

            <div>
              <label className={`block text-[11px] mb-1 font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>RPC Method</label>
              <input
                type="text"
                value={rpcRawMethod}
                onChange={(e) => setRpcRawMethod(e.target.value)}
                placeholder="get_prop / miIO.info / set_properties"
                className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500 ${
                  isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                }`}
              />
            </div>

            <div>
              <label className={`block text-[11px] mb-1 font-mono ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>RPC Params (JSON 数组或对象)</label>
              <textarea
                rows={3}
                value={rpcRawParams}
                onChange={(e) => setRpcRawParams(e.target.value)}
                placeholder='["power", "volume"]'
                className={`w-full px-3 py-2 border rounded-xl text-xs font-mono focus:outline-none focus:border-amber-500 ${
                  isLight ? 'bg-white border-zinc-200 text-zinc-900' : 'bg-zinc-900 border-white/10 text-white'
                }`}
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleRpcRaw}
                disabled={isExecutingRpc}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition active:scale-95 disabled:opacity-50 shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isExecutingRpc ? '正在发送 RPC 请求...' : '发送原始 RPC 封包'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Response Console */}
        {rpcResponse && (
          <div className="p-5 rounded-2xl bg-black border border-white/10 space-y-2 animate-fadeIn font-mono">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
              <span className="text-zinc-400 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>RPC 响应返回结果</span>
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(JSON.stringify(rpcResponse, null, 2), 'rpc_res')}
                className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition flex items-center gap-1 cursor-pointer"
              >
                {copiedKey === 'rpc_res' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'rpc_res' ? '已复制' : '复制 JSON'}</span>
              </button>
            </div>
            <pre className="text-xs text-emerald-400 overflow-x-auto p-2 bg-zinc-950 rounded-xl max-h-60 leading-relaxed">
              {JSON.stringify(rpcResponse, null, 2)}
            </pre>
          </div>
        )}

        {/* Spec Definition Modal / View */}
        {specDefinition && (
          <div id="miot-spec-definition-view" className="p-5 sm:p-6 rounded-3xl bg-zinc-950 border border-purple-500/40 space-y-4 animate-fadeIn shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold uppercase font-mono">
                    官方 MIoT Spec 规范
                  </span>
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    已从 miot-spec.org 解析
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mt-1.5 flex items-center gap-2 font-mono">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>{specDefinition.type}</span>
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  点击属性或动作右侧的 <span className="text-purple-300 font-medium">【填入】</span> 按钮，即可将 SIID / PIID / AIID 快速带入上方调试表单。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://home.miot-spec.com/spec/${encodeURIComponent(specDefinition.type)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-xs font-semibold border border-purple-500/30 transition flex items-center gap-1.5 no-underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>在 MIoT 官网打开</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSpecDefinition(null)}
                  className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                  title="关闭 Spec 面板"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-3 text-xs pr-1">
              {Array.isArray(specDefinition.services) && specDefinition.services.map((svc: any) => (
                <div key={svc.iid} className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-2.5">
                  <div className="flex items-center justify-between font-mono text-purple-300 font-semibold border-b border-white/5 pb-2">
                    <span className="flex items-center gap-2 text-sm text-white">
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[11px] font-bold">
                        SIID {svc.iid}
                      </span>
                      <span>{svc.description || svc.type}</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      {svc.properties?.length || 0} 属性 · {svc.actions?.length || 0} 动作
                    </span>
                  </div>

                  {/* Properties */}
                  {Array.isArray(svc.properties) && svc.properties.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Sliders className="w-3 h-3 text-blue-400" />
                        <span>属性定义 (Properties)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {svc.properties.map((p: any) => (
                          <div
                            key={p.iid}
                            className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono hover:border-purple-500/30 transition group"
                          >
                            <div className="space-y-0.5 min-w-0 pr-2">
                              <div className="text-zinc-200 font-medium truncate">
                                <span className="text-[#FF6700] mr-1">P{p.iid}:</span>
                                <span>{p.description || p.type}</span>
                              </div>
                              <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                                <span>{p.format}</span>
                                <span>·</span>
                                <span>{p.access?.join('/') || 'read'}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setRpcSiid(String(svc.iid));
                                setRpcPiid(String(p.iid));
                                setSpecSuccessMsg(`已将 SIID:${svc.iid} PIID:${p.iid} (${p.description || p.type}) 带入属性调试表单`);
                              }}
                              className="px-2 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/30 text-purple-300 text-[10px] font-semibold border border-purple-500/20 transition flex-shrink-0 cursor-pointer"
                            >
                              填入 PIID
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {Array.isArray(svc.actions) && svc.actions.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>动作指令 (Actions)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {svc.actions.map((a: any) => (
                          <div
                            key={a.iid}
                            className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5 text-[11px] font-mono hover:border-amber-500/30 transition group"
                          >
                            <div className="space-y-0.5 min-w-0 pr-2">
                              <div className="text-zinc-200 font-medium truncate">
                                <span className="text-amber-400 mr-1">A{a.iid}:</span>
                                <span>{a.description || a.type}</span>
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                {a.in && a.in.length > 0 ? `入参: [${a.in.join(', ')}]` : '无需入参'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setRpcSiid(String(svc.iid));
                                setRpcAiid(String(a.iid));
                                if (a.in && a.in.length > 0) {
                                  setRpcActionParams(JSON.stringify(a.in.map(() => '')));
                                } else {
                                  setRpcActionParams('[]');
                                }
                                setSpecSuccessMsg(`已将 SIID:${svc.iid} AIID:${a.iid} (${a.description || a.type}) 带入动作执行表单`);
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold border border-amber-500/20 transition flex-shrink-0 cursor-pointer"
                            >
                              填入动作
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
