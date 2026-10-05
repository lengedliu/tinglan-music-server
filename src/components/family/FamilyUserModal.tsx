import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  UserPlus,
  Shield,
  KeyRound,
  CheckCircle2,
  Trash2,
  Lock,
  Volume2,
  Sparkles,
  RefreshCw,
  UserCheck,
  Pencil
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch } from '../../utils/api';

export interface FamilyUser {
  id: string;
  name: string;
  avatar: string;
  role: 'admin' | 'member' | 'kid';
  hasPin?: boolean;
  assignedSpeakerDid?: string;
  createdAt: number;
}

interface FamilyUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserSwitched?: (user: FamilyUser) => void;
  xiaomiDevices?: any[];
}

const AVATAR_PRESETS = ['👨‍💼', '👩‍💼', '👧', '👦', '👵', '👴', '🐱', '🐶', '🎧', '🎸', '🌟'];

export const FamilyUserModal: React.FC<FamilyUserModalProps> = ({
  isOpen,
  onClose,
  onUserSwitched,
  xiaomiDevices = []
}) => {
  const { themeConfig, isLight } = useTheme();

  const [users, setUsers] = useState<FamilyUser[]>([]);
  const [activeUser, setActiveUser] = useState<FamilyUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<FamilyUser | null>(null);

  // Form State
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState('👨‍💼');
  const [newRole, setNewRole] = useState<'admin' | 'member' | 'kid'>('member');
  const [newPin, setNewPin] = useState('');
  const [newSpeakerDid, setNewSpeakerDid] = useState('');

  // Switch State
  const [selectedUserForSwitch, setSelectedUserForSwitch] = useState<FamilyUser | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/family/users');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUsers(data.users || []);
          setActiveUser(data.activeUser || null);
        }
      }
    } catch (err) {
      console.error('Failed to load family users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setShowAddForm(false);
      setSelectedUserForSwitch(null);
      setPinInput('');
      setSwitchError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSwitchUser = async (user: FamilyUser) => {
    if (user.hasPin && (!pinInput || selectedUserForSwitch?.id !== user.id)) {
      setSelectedUserForSwitch(user);
      setPinInput('');
      setSwitchError(null);
      return;
    }

    try {
      const res = await apiFetch('/api/family/users/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, pin: pinInput })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveUser(data.activeUser);
        setSelectedUserForSwitch(null);
        setPinInput('');
        try {
          localStorage.setItem('tinglan_active_family_user_id', data.activeUser.id);
        } catch {}
        if (onUserSwitched) onUserSwitched(data.activeUser);
        fetchUsers();
      } else {
        setSwitchError(data.error || '密码验证失败，无法无缝切换');
      }
    } catch (err: any) {
      setSwitchError(err.message || '切换失败');
    }
  };

  const handleStartEdit = (u: FamilyUser) => {
    setEditingUser(u);
    setNewName(u.name);
    setNewAvatar(u.avatar);
    setNewRole(u.role);
    setNewSpeakerDid(u.assignedSpeakerDid || '');
    setNewPin('');
    setShowAddForm(true);
  };

  const handleStartAdd = () => {
    setEditingUser(null);
    setNewName('');
    setNewAvatar('👨‍💼');
    setNewRole('member');
    setNewSpeakerDid('');
    setNewPin('');
    setShowAddForm(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      const url = editingUser ? `/api/family/users/${editingUser.id}` : '/api/family/users';
      const method = editingUser ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          avatar: newAvatar,
          role: newRole,
          pin: newPin || undefined,
          assignedSpeakerDid: newSpeakerDid || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewName('');
        setNewPin('');
        setShowAddForm(false);
        setEditingUser(null);
        fetchUsers();
      } else {
        alert(data.error || '保存家庭成员失败');
      }
    } catch (err: any) {
      alert('网络错误: ' + err.message);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`确定要移除家庭成员“${name}”吗？其专属歌单和偏好数据将清理。`)) return;
    try {
      const res = await apiFetch(`/api/family/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        fetchUsers();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (err: any) {
      alert(err.message);
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
              {activeUser?.avatar || '👨‍👩‍👧‍👦'}
            </div>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                多用户家庭空间
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">
                  红心与歌单隔离
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                当前听歌身份：<strong className="text-[#FF6700]">{activeUser?.name || '加载中...'}</strong> · 支持音箱绑定与房间隔离
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
          {/* Members Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">选择当前家庭成员：</span>
              <button
                type="button"
                onClick={() => {
                  if (showAddForm) {
                    setShowAddForm(false);
                    setEditingUser(null);
                  } else {
                    handleStartAdd();
                  }
                }}
                className="text-xs text-[#FF6700] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{showAddForm ? '取消操作' : '新增家庭成员'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {users.map(u => {
                const isActive = activeUser?.id === u.id;
                const boundDevice = xiaomiDevices.find(d => d.did === u.assignedSpeakerDid);

                return (
                  <div
                    key={u.id}
                    onClick={() => {
                      if (!isActive) handleSwitchUser(u);
                    }}
                    className={`p-4 rounded-2xl border transition-all duration-200 relative flex flex-col justify-between ${
                      isActive
                        ? isLight
                          ? 'bg-orange-50/80 border-[#FF6700] shadow-md ring-1 ring-[#FF6700]/30'
                          : 'bg-[#FF6700]/10 border-[#FF6700]/50 shadow-lg'
                        : isLight
                          ? 'bg-zinc-50/80 hover:bg-zinc-100/80 border-zinc-200 cursor-pointer hover:border-orange-300 hover:shadow-md'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/5 cursor-pointer hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-2xl shadow-inner ${
                          isLight ? 'bg-white border-zinc-200' : 'bg-black/30 border-white/10'
                        }`}>
                          {u.avatar}
                        </div>
                        <div>
                          <div className={`font-bold text-sm flex items-center gap-1.5 ${isLight ? 'text-zinc-900' : 'text-white'}`}>
                            <span>{u.name}</span>
                            {isActive && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF6700] text-white font-bold">
                                当前使用中
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                            <span className={`px-2 py-0.5 rounded font-medium ${
                              u.role === 'admin' ? (isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300') :
                              u.role === 'kid' ? (isLight ? 'bg-purple-100 text-purple-800' : 'bg-purple-500/20 text-purple-300') : (isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-500/20 text-blue-300')
                            }`}>
                              {u.role === 'admin' ? '全家主主控' : u.role === 'kid' ? '儿童模式' : '家庭成员'}
                            </span>
                            {u.hasPin && (
                              <span className={`flex items-center gap-0.5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                <Lock className="w-3 h-3 text-amber-500" /> PIN密码
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(u);
                          }}
                          className={`p-1.5 rounded-lg transition cursor-pointer ${
                            isLight ? 'text-zinc-500 hover:text-orange-600 hover:bg-orange-100' : 'text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10'
                          }`}
                          title="编辑成员信息与关联设置"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {users.length > 1 && u.role !== 'admin' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(u.id, u.name);
                            }}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isLight ? 'text-zinc-400 hover:text-rose-600 hover:bg-rose-100' : 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10'
                            }`}
                            title="移除此家庭成员"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {boundDevice && (
                      <div className={`mt-3 pt-2 border-t flex items-center gap-1.5 text-[11px] ${
                        isLight ? 'border-zinc-200 text-emerald-700' : 'border-white/5 text-emerald-400'
                      }`}>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>专属音箱: {boundDevice.name || boundDevice.alias || boundDevice.ip}</span>
                      </div>
                    )}

                    <div className="mt-3 pt-2">
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSwitchUser(u);
                          }}
                          className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5 ${
                            isLight
                              ? 'bg-[#FF6700] hover:bg-[#e55c00] active:scale-95 text-white'
                              : 'bg-[#FF6700] hover:bg-[#e55c00] active:scale-95 text-white'
                          }`}
                        >
                          <UserCheck className="w-4 h-4" />
                          <span>切换至此身份</span>
                        </button>
                      ) : (
                        <div className="w-full py-2 text-center text-xs font-bold text-[#FF6700] flex items-center justify-center gap-1 bg-[#FF6700]/10 rounded-xl">
                          <CheckCircle2 className="w-4 h-4" />
                          已就绪
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PIN Prompt Modal Section if PIN Required */}
          {selectedUserForSwitch && selectedUserForSwitch.hasPin && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-3 animate-in fade-in">
              <div className="font-bold flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>请输入成员“{selectedUserForSwitch.name}”的 4 位安全 PIN 密码：</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="请输入 PIN 码"
                  className="bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-400 flex-1 font-mono tracking-widest text-center"
                />
                <button
                  type="button"
                  onClick={() => handleSwitchUser(selectedUserForSwitch)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold transition cursor-pointer"
                >
                  验证并切换
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedUserForSwitch(null)}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                >
                  取消
                </button>
              </div>
              {switchError && <p className="text-rose-400 font-medium">{switchError}</p>}
            </div>
          )}

          {/* New / Edit Family User Form */}
          {showAddForm && (
            <form onSubmit={handleSaveUser} className={`p-5 rounded-2xl border space-y-4 animate-in fade-in ${
              isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-white/[0.02] border-white/5'
            }`}>
              <span className={`text-xs font-bold flex items-center gap-1.5 ${isLight ? 'text-zinc-900' : 'text-zinc-200'}`}>
                {editingUser ? <Pencil className="w-4 h-4 text-[#FF6700]" /> : <UserPlus className="w-4 h-4 text-[#FF6700]" />}
                <span>{editingUser ? `编辑成员：${editingUser.name}` : '新增家庭成员卡片'}</span>
              </span>

              <div className="space-y-1">
                <label className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>选择代表头像 (Emoji):</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewAvatar(emoji)}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition ${
                        newAvatar === emoji ? 'bg-[#FF6700] text-white ring-2 ring-orange-400' : isLight ? 'bg-white border border-zinc-200 hover:bg-zinc-100' : 'bg-black/30 hover:bg-white/10'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>成员昵称/称呼</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="如：妈妈 或 宝贝"
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#FF6700] ${
                      isLight ? 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400' : 'bg-zinc-900 border-white/10 text-zinc-100 placeholder-zinc-500'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>家庭角色权限</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#FF6700] ${
                      isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-white/10 text-zinc-100'
                    }`}
                  >
                    <option value="member">普通家庭成员 (独立歌单与红心)</option>
                    <option value="admin">全家主主控 (可管理配置)</option>
                    <option value="kid">儿童模式 (推荐儿童儿歌过滤)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>专属小爱音箱绑定 (可选)</label>
                  <select
                    value={newSpeakerDid}
                    onChange={(e) => setNewSpeakerDid(e.target.value)}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#FF6700] ${
                      isLight ? 'bg-white border-zinc-300 text-zinc-900' : 'bg-zinc-900 border-white/10 text-zinc-100'
                    }`}
                  >
                    <option value="">不绑定 (全家共享模式)</option>
                    {xiaomiDevices.map(d => (
                      <option key={d.did} value={d.did}>
                        {d.name || d.alias || d.ip} ({d.model || '小爱音箱'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className={`text-xs ${isLight ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {editingUser ? '重置/修改 4位 PIN 密码 (留空保持原密码)' : '4位快捷切换 PIN 码 (可选)'}
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder={editingUser ? '留空不修改密码' : '不设密码则直接无缝切换'}
                    className={`w-full border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-[#FF6700] ${
                      isLight ? 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400' : 'bg-zinc-900 border-white/10 text-zinc-100 placeholder-zinc-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingUser(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isLight ? 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700' : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg cursor-pointer"
                  style={{ backgroundColor: themeConfig.primaryColor }}
                >
                  {editingUser ? '保存修改' : '保存创建成员'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
