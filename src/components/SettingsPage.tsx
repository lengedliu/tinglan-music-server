import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings,
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Globe, 
  Wifi, 
  Lock, 
  Unlock, 
  Key, 
  Check, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Server,
  Info,
  Database,
  HardDrive,
  Layers,
  Activity,
  UserCheck,
  UserX,
  UserPlus,
  Users,
  LogIn,
  Sliders,
  Radio,
  CheckCircle2,
  Edit3,
  Trash2,
  Search,
  Filter,
  Calendar,
  Clock,
  Power,
  X
} from 'lucide-react';
import { SecurityStatus, User, DbEngine, DbStatusInfo } from '../types';
import { apiFetch } from '../utils/api';
import { getUserAvatar } from '../utils/avatar';

interface SettingsPageProps {
  currentUser: User | null;
  onOpenAuthModal: () => void;
  onShowToast: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
  onSecurityUpdated?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  currentUser,
  onOpenAuthModal,
  onShowToast,
  onSecurityUpdated
}) => {
  const [subTab, setSubTab] = useState<'all' | 'users' | 'security' | 'database' | 'system'>('all');

  // --- Security State ---
  const [secLoading, setSecLoading] = useState(false);
  const [secSaving, setSecSaving] = useState(false);
  const [secStatus, setSecStatus] = useState<SecurityStatus | null>(null);
  const [requireAuth, setRequireAuth] = useState(true);
  const [authScope, setAuthScope] = useState<'all' | 'wan_only'>('all');
  const [allowRegistration, setAllowRegistration] = useState(true);
  
  // Keep track of user's active local choices and pending save after login
  const pendingSaveRef = useRef<{ requireAuth: boolean; authScope: 'all' | 'wan_only'; allowRegistration: boolean } | null>(null);
  const userEditedRef = useRef(false);

  // Password change state
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // --- User Management State ---
  const [usersList, setUsersList] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // Create User Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'user'>('user');
  const [createStatus, setCreateStatus] = useState<'active' | 'disabled'>('active');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user');
  const [editStatus, setEditStatus] = useState<'active' | 'disabled'>('active');
  const [editPassword, setEditPassword] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Reset Password Modal
  const [resetPwdUser, setResetPwdUser] = useState<User | null>(null);
  const [directResetPwd, setDirectResetPwd] = useState('');
  const [resetPwdLoading, setResetPwdLoading] = useState(false);
  const [resetPwdError, setResetPwdError] = useState('');

  // Delete User Confirmation Modal
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // --- Database State ---
  const [dbStatus, setDbStatus] = useState<DbStatusInfo | null>(null);
  const [selectedEngine, setSelectedEngine] = useState<DbEngine>('sqlite');
  const [pgHost, setPgHost] = useState('localhost');
  const [pgPort, setPgPort] = useState(5432);
  const [pgUser, setPgUser] = useState('postgres');
  const [pgPassword, setPgPassword] = useState('');
  const [pgDatabase, setPgDatabase] = useState('tinglan_db');

  const [myHost, setMyHost] = useState('localhost');
  const [myPort, setMyPort] = useState(3306);
  const [myUser, setMyUser] = useState('root');
  const [myPassword, setMyPassword] = useState('');
  const [myDatabase, setMyDatabase] = useState('tinglan_db');

  const [dbTesting, setDbTesting] = useState(false);
  const [dbSwitching, setDbSwitching] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  useEffect(() => {
    if (currentUser && pendingSaveRef.current) {
      const { requireAuth: targetAuth, authScope: targetScope, allowRegistration: targetReg } = pendingSaveRef.current;
      pendingSaveRef.current = null;
      executeSaveSecurity(targetAuth, targetScope, targetReg, true);
    } else {
      fetchSecurityStatus(false);
    }
    fetchDbStatus();
    fetchUsersList();
  }, [currentUser]);

  const fetchSecurityStatus = async (forceSync = false) => {
    setSecLoading(true);
    try {
      const res = await apiFetch('/api/system/security');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const settings = data.settings || data.status || data;
          const isAuthOn = typeof settings.requireAuth === 'boolean'
            ? settings.requireAuth
            : (typeof data.globalRequireAuth === 'boolean' 
                ? data.globalRequireAuth 
                : (typeof data.requireAuth === 'boolean' ? data.requireAuth : Boolean(data.authRequired)));
          const currentScope = settings.authScope || data.authScope || 'all';
          const currentAllowReg = typeof settings.allowRegistration === 'boolean'
            ? settings.allowRegistration
            : (typeof data.allowRegistration === 'boolean' ? data.allowRegistration : true);
          const clientIp = data.clientInfo?.ip || data.clientIp || data.status?.clientIp || '127.0.0.1';
          const isLan = typeof data.clientInfo?.isLan === 'boolean' 
            ? data.clientInfo.isLan 
            : (typeof data.isLan === 'boolean' ? data.isLan : true);
          const isAuthReq = typeof data.clientInfo?.isAuthRequired === 'boolean' 
            ? data.clientInfo.isAuthRequired 
            : Boolean(data.authRequired);

          if (!userEditedRef.current || forceSync) {
            setRequireAuth(isAuthOn);
            setAuthScope(currentScope);
            setAllowRegistration(currentAllowReg);
          }
          setSecStatus({
            success: true,
            authRequired: isAuthReq,
            globalRequireAuth: isAuthOn,
            authScope: currentScope,
            allowRegistration: currentAllowReg,
            clientIp,
            isLan
          });
        }
      }
    } catch (e) {
      console.error('Failed to load security status', e);
    } finally {
      setSecLoading(false);
    }
  };

  // Fetch Users List
  const fetchUsersList = async () => {
    setUsersLoading(true);
    try {
      const res = await apiFetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          setUsersList(data.users);
        }
      }
    } catch (e) {
      console.error('Failed to load users', e);
    } finally {
      setUsersLoading(false);
    }
  };

  // Toggle Switch for Require Auth
  const handleToggleRequireAuth = () => {
    userEditedRef.current = true;
    setRequireAuth(prev => !prev);
  };

  // Toggle Switch for Allow Registration
  const handleToggleAllowRegistration = () => {
    userEditedRef.current = true;
    setAllowRegistration(prev => !prev);
  };

  // Change Scope
  const handleSelectAuthScope = (newScope: 'all' | 'wan_only') => {
    userEditedRef.current = true;
    setAuthScope(newScope);
  };

  const fetchDbStatus = async () => {
    try {
      const res = await apiFetch('/api/db/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.status) {
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
      }
    } catch (e) {
      console.error('Failed to load DB status', e);
    }
  };

  // Core Save Routine
  const executeSaveSecurity = async (
    targetAuth: boolean, 
    targetScope: 'all' | 'wan_only', 
    targetReg: boolean,
    isAfterLogin = false
  ) => {
    setSecSaving(true);
    try {
      const res = await apiFetch('/api/system/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requireAuth: targetAuth, 
          authScope: targetScope,
          allowRegistration: targetReg
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        userEditedRef.current = false;
        pendingSaveRef.current = null;
        setRequireAuth(targetAuth);
        setAuthScope(targetScope);
        setAllowRegistration(targetReg);
        onShowToast(
          isAfterLogin ? '登录成功并已保存策略' : '保存成功',
          targetAuth 
            ? `安全防护已生效（${targetReg ? '允许' : '已关闭'}自主注册）` 
            : '安全防护已关闭（开放管理模式）',
          'success'
        );
        fetchSecurityStatus(true);
        onSecurityUpdated?.();
      } else {
        onShowToast('保存失败', data.error || '保存安全设置失败', 'error');
        if (data.requireLogin) {
          pendingSaveRef.current = { requireAuth: targetAuth, authScope: targetScope, allowRegistration: targetReg };
          onOpenAuthModal();
        }
      }
    } catch (e: any) {
      onShowToast('保存失败', e.message || '网络请求错误', 'error');
    } finally {
      setSecSaving(false);
    }
  };

  // Save Security Settings
  const handleSaveSecurity = async () => {
    if (!currentUser) {
      pendingSaveRef.current = { requireAuth, authScope, allowRegistration };
      onShowToast('需要登录', '修改系统安全防护策略需要管理员权限，请先登录', 'info');
      onOpenAuthModal();
      return;
    }

    await executeSaveSecurity(requireAuth, authScope, allowRegistration, false);
  };

  // Change Admin/User Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordFeedback(null);

    if (!oldPassword) {
      setPasswordFeedback({ success: false, message: '请输入当前密码以验证身份' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordFeedback({ success: false, message: '新密码长度至少需要 6 个字符' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ success: false, message: '两次输入的新密码不一致' });
      return;
    }

    if (!currentUser) {
      onShowToast('需要登录', '修改密码需要先登录系统', 'error');
      onOpenAuthModal();
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPasswordFeedback({ success: true, message: '密码修改成功！请妥善保管新密码' });
        onShowToast('密码修改成功', '新密码已生效', 'success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordFeedback({ success: false, message: data.error || '密码修改失败' });
        if (data.requireLogin) {
          onOpenAuthModal();
        }
      }
    } catch (err: any) {
      setPasswordFeedback({ success: false, message: err.message || '请求失败' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // --- USER MANAGEMENT HANDLERS ---

  // Quick Toggle User Status (active / disabled)
  const handleToggleUserStatus = async (user: User) => {
    if (!currentUser) {
      onShowToast('需要登录', '管理用户状态需要管理员权限', 'info');
      onOpenAuthModal();
      return;
    }

    if (currentUser.id === user.id) {
      onShowToast('操作受限', '无法禁用当前正在登录的管理员账号', 'error');
      return;
    }

    try {
      const res = await apiFetch(`/api/auth/users/${user.id}/toggle-status`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('状态更新成功', data.message || `用户「${user.username}」状态已变更`, 'success');
        fetchUsersList();
      } else {
        onShowToast('操作失败', data.error || '更新用户状态失败', 'error');
      }
    } catch (err: any) {
      onShowToast('网络错误', err.message || '请求失败', 'error');
    }
  };

  // Admin Create New User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (!createUsername.trim()) {
      setCreateError('请输入用户名');
      return;
    }
    if (createPassword.length < 6) {
      setCreateError('密码长度不能少于 6 位');
      return;
    }

    setCreateLoading(true);
    try {
      const res = await apiFetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: createUsername.trim(),
          email: createEmail.trim() || undefined,
          password: createPassword,
          role: createRole,
          status: createStatus
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('创建成功', `用户「${createUsername}」已成功添加`, 'success');
        setShowCreateModal(false);
        setCreateUsername('');
        setCreateEmail('');
        setCreatePassword('');
        setCreateRole('user');
        setCreateStatus('active');
        fetchUsersList();
      } else {
        setCreateError(data.error || '创建用户失败');
      }
    } catch (err: any) {
      setCreateError(err.message || '网络请求错误');
    } finally {
      setCreateLoading(false);
    }
  };

  // Admin Save Edit User
  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');

    setEditLoading(true);
    try {
      const payload: any = {
        email: editEmail.trim(),
        role: editRole,
        status: editStatus
      };
      if (editPassword && editPassword.length >= 6) {
        payload.password = editPassword;
      }

      const res = await apiFetch(`/api/auth/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('修改成功', `用户「${editingUser.username}」信息已更新`, 'success');
        setEditingUser(null);
        setEditPassword('');
        fetchUsersList();
      } else {
        setEditError(data.error || '修改用户失败');
      }
    } catch (err: any) {
      setEditError(err.message || '网络请求错误');
    } finally {
      setEditLoading(false);
    }
  };

  // Admin Direct Reset Password
  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdUser) return;
    setResetPwdError('');

    if (directResetPwd.length < 6) {
      setResetPwdError('新密码长度不能少于 6 位');
      return;
    }

    setResetPwdLoading(true);
    try {
      const res = await apiFetch(`/api/auth/users/${resetPwdUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: directResetPwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('重置成功', `用户「${resetPwdUser.username}」的密码已重置`, 'success');
        setResetPwdUser(null);
        setDirectResetPwd('');
      } else {
        setResetPwdError(data.error || '重置密码失败');
      }
    } catch (err: any) {
      setResetPwdError(err.message || '网络请求错误');
    } finally {
      setResetPwdLoading(false);
    }
  };

  // Admin Delete User
  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteLoading(true);
    try {
      const res = await apiFetch(`/api/auth/users/${deletingUser.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast('删除成功', `用户「${deletingUser.username}」已移除`, 'success');
        setDeletingUser(null);
        fetchUsersList();
      } else {
        onShowToast('删除失败', data.error || '无法删除目标用户', 'error');
      }
    } catch (err: any) {
      onShowToast('网络错误', err.message || '删除请求失败', 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Test DB Connection
  const handleTestConnection = async () => {
    setDbTesting(true);
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
        setTestResult({ success: true, message: data.message || '数据库连接畅通！', latency });
      } else {
        setTestResult({ success: false, message: data.error || data.message || '连接失败，请检查网络与密钥' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: `网络错误: ${err.message || '请求无法送达'}` });
    } finally {
      setDbTesting(false);
    }
  };

  // Switch DB Engine
  const handleSwitchEngine = async () => {
    if (!currentUser) {
      onShowToast('需要登录', '切换数据库引擎需要管理员权限，请先登录', 'error');
      onOpenAuthModal();
      return;
    }

    setDbSwitching(true);
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
        if (data.requireLogin) {
          onOpenAuthModal();
        }
      }
    } catch (err: any) {
      onShowToast('网络错误', err.message || '数据库切换请求失败', 'error');
    } finally {
      setDbSwitching(false);
    }
  };

  // Filter Users
  const filteredUsers = usersList.filter(user => {
    const matchQuery = !userSearchQuery.trim() || 
      user.username.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
      (user.email && user.email.toLowerCase().includes(userSearchQuery.toLowerCase())) ||
      user.id.toLowerCase().includes(userSearchQuery.toLowerCase());
    
    const matchRole = userRoleFilter === 'all' || user.role === userRoleFilter;
    const matchStatus = userStatusFilter === 'all' || 
      (userStatusFilter === 'active' && user.status !== 'disabled') ||
      (userStatusFilter === 'disabled' && user.status === 'disabled');

    return matchQuery && matchRole && matchStatus;
  });

  const totalUsersCount = usersList.length;
  const adminUsersCount = usersList.filter(u => u.role === 'admin').length;
  const activeUsersCount = usersList.filter(u => u.status !== 'disabled').length;

  return (
    <div className="space-y-8 pb-20 max-w-5xl mx-auto">
      
      {/* Top Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#FF6700]/15 border border-[#FF6700]/30 text-[#FF6700] flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(255,103,0,0.15)]">
            <Settings className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">
                系统设置与管理中心
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-white/10 font-mono">
                v1.4.3 MIoT
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-relaxed">
              全面管理系统用户权限、注册开放状态、外网访问保护策略及多引擎数据库存储（SQLite / PostgreSQL / MySQL）。
            </p>
          </div>
        </div>

        {/* User Badge or Login Link */}
        <div className="flex items-center gap-3 self-start md:self-auto bg-zinc-950/60 p-3 rounded-2xl border border-white/5">
          {currentUser ? (
            <div className="flex items-center gap-2.5">
              <img
                src={getUserAvatar(currentUser)}
                alt={currentUser.username}
                className="w-8 h-8 rounded-full object-cover border border-[#FF6700]/40 shadow-sm"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <span className="text-xs font-semibold text-white block leading-tight">
                  {currentUser.username}
                </span>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  已登录 ({currentUser.role === 'admin' ? '系统管理员' : '普通用户'})
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div>
                <span className="text-xs font-medium text-zinc-300 block leading-tight">
                  访客访问模式
                </span>
                <span className="text-[10px] text-zinc-500">
                  可正常操作与浏览所有页面
                </span>
              </div>
              <button
                onClick={onOpenAuthModal}
                className="px-3 py-1.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登录账号</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Guest Mode Notice */}
      {!currentUser && (
        <div className="p-4 rounded-2xl bg-zinc-900/30 border border-white/5 flex items-start gap-3 text-xs text-zinc-400">
          <Info className="w-4 h-4 text-[#FF6700] flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="text-zinc-200 font-semibold block">已开启完全访问体验：</span>
            <p>
              即使系统启用了登录防护，未登录访客<strong>依然可以自由访问、浏览与操作全部页面</strong>（曲库试听、自建歌单、歌词同步滚动与小米音箱设备状态）。修改系统核心策略、用户账号管理或切换数据库引擎时，需验证管理员凭证。
            </p>
          </div>
        </div>
      )}

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSubTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            subTab === 'all'
              ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>全部设置</span>
        </button>

        <button
          onClick={() => setSubTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            subTab === 'users'
              ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>用户管理</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 font-mono">
            {totalUsersCount}
          </span>
        </button>

        <button
          onClick={() => setSubTab('security')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            subTab === 'security'
              ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>安全与注册控制</span>
        </button>

        <button
          onClick={() => setSubTab('database')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            subTab === 'database'
              ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>数据库管理中心</span>
        </button>

        <button
          onClick={() => setSubTab('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
            subTab === 'system'
              ? 'bg-[#FF6700]/15 text-[#FF6700] border border-[#FF6700]/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>网络与环境信息</span>
        </button>
      </div>

      {/* ================= SECTION: USER MANAGEMENT (NEW & COMPREHENSIVE) ================= */}
      {(subTab === 'all' || subTab === 'users') && (
        <div className="space-y-6 pt-2">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#FF6700]" />
              <h2 className="text-lg font-bold text-white tracking-tight">
                用户账号管理
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 font-medium ml-2">
                共 {totalUsersCount} 个账号 ({adminUsersCount} 管理员)
              </span>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={fetchUsersList}
                disabled={usersLoading}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 text-xs transition cursor-pointer"
                title="刷新用户列表"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onShowToast('需要登录', '添加用户需要管理员权限，请先登录', 'info');
                    onOpenAuthModal();
                    return;
                  }
                  setShowCreateModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>添加新用户</span>
              </button>
            </div>
          </div>

          {/* Quick Filter & Search Bar */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-white/5 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索用户名 / 邮箱 / 用户ID..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
              />
              {userSearchQuery && (
                <button
                  onClick={() => setUserSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-white/10 text-xs">
                <span className="text-[10px] text-zinc-500 px-2 font-medium">角色:</span>
                {(['all', 'admin', 'user'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => setUserRoleFilter(role)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      userRoleFilter === role
                        ? 'bg-[#FF6700] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {role === 'all' ? '全部' : role === 'admin' ? '管理员' : '普通用户'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-white/10 text-xs">
                <span className="text-[10px] text-zinc-500 px-2 font-medium">状态:</span>
                {(['all', 'active', 'disabled'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setUserStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition cursor-pointer ${
                      userStatusFilter === st
                        ? 'bg-[#FF6700] text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {st === 'all' ? '全部' : st === 'active' ? '正常启用' : '已停用'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* User Cards / Table List */}
          <div className="space-y-3">
            {usersLoading && usersList.length === 0 ? (
              <div className="p-8 rounded-2xl bg-zinc-900/30 border border-white/5 text-center text-zinc-400 text-xs flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#FF6700]" />
                <span>正在加载用户数据...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 rounded-2xl bg-zinc-900/30 border border-white/5 text-center text-zinc-400 text-xs space-y-2">
                <Users className="w-6 h-6 mx-auto text-zinc-500" />
                <p>未找到符合条件的用户账号</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredUsers.map(user => {
                  const isCurrent = currentUser?.id === user.id;
                  const isAdmin = user.role === 'admin';
                  const isDisabled = user.status === 'disabled';

                  return (
                    <div
                      key={user.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        isDisabled 
                          ? 'bg-zinc-950/40 border-zinc-800/80 opacity-70' 
                          : 'bg-zinc-900/40 hover:bg-zinc-900/60 border-white/5'
                      }`}
                    >
                      {/* Left User Identity */}
                      <div className="flex items-center gap-3.5">
                        <div className="relative">
                          <img
                            src={getUserAvatar(user)}
                            alt={user.username}
                            className="w-11 h-11 rounded-2xl object-cover border border-white/10 shadow-sm"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              // If image fails, set fallback
                              (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80';
                            }}
                          />
                          <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#18181b] ${
                            isDisabled ? 'bg-rose-500' : 'bg-emerald-500'
                          }`} />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-white tracking-tight">
                              {user.username}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-semibold">
                                当前登录账号
                              </span>
                            )}
                            <span className={`text-[10px] px-2 py-0.2 rounded-full font-semibold border ${
                              isAdmin
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            }`}>
                              {isAdmin ? '系统管理员' : '普通用户'}
                            </span>
                            {isDisabled && (
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold">
                                已停用
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                            <span className="font-mono text-zinc-300">{user.email || '未绑定邮箱'}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-zinc-500" />
                              创建于 {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '默认预设'}
                            </span>
                            {user.lastLoginAt && (
                              <>
                                <span className="text-zinc-600">•</span>
                                <span className="flex items-center gap-1 text-zinc-400">
                                  <Clock className="w-3 h-3 text-zinc-500" />
                                  最近登录: {new Date(user.lastLoginAt).toLocaleString('zh-CN')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Action Controls */}
                      <div className="flex items-center gap-2 self-end md:self-center pt-2 md:pt-0 border-t md:border-t-0 border-white/5 w-full md:w-auto justify-end">
                        
                        {/* Status Switch */}
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(user)}
                          disabled={isCurrent}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            isDisabled 
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30 text-rose-300' 
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                          } ${isCurrent ? 'opacity-40 cursor-not-allowed' : ''}`}
                          title={isCurrent ? '无法修改当前自身登录状态' : (isDisabled ? '点击恢复启用' : '点击停用该账号')}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isDisabled ? '已停用 (点击启用)' : '正常 (点击停用)'}</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(user);
                            setEditEmail(user.email || '');
                            setEditRole(user.role);
                            setEditStatus(user.status || 'active');
                            setEditPassword('');
                            setEditError('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3 text-blue-400" />
                          <span>编辑</span>
                        </button>

                        {/* Reset Password Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setResetPwdUser(user);
                            setDirectResetPwd('');
                            setResetPwdError('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                        >
                          <Key className="w-3 h-3 text-amber-400" />
                          <span>重置密码</span>
                        </button>

                        {/* Delete Button */}
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => setDeletingUser(user)}
                            className="p-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 text-xs transition cursor-pointer"
                            title="删除该用户"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ================= SECTION: SECURITY & REGISTRATION CONTROLS ================= */}
      {(subTab === 'all' || subTab === 'security') && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#FF6700]" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              系统安全与开放注册控制
            </h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ml-2 ${
              requireAuth 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-zinc-800 text-zinc-400 border border-white/5'
            }`}>
              {requireAuth ? '登录防护已启用' : '防护未启用'}
            </span>
          </div>

          {/* Network & Client Detection Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/40 border border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 border border-white/5">
                <Server className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-medium block">当前访客客户端 IP</span>
                <span className="text-xs font-mono text-zinc-200 font-semibold">{secStatus?.clientIp || '127.0.0.1'}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 border border-white/5">
                {secStatus?.isLan ? <Wifi className="w-4 h-4 text-emerald-400" /> : <Globe className="w-4 h-4 text-[#FF6700]" />}
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-medium block">当前网络归属</span>
                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1">
                  {secStatus?.isLan ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>局域网内网 (LAN)</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#FF6700]" />
                      <span>外部公网 / 穿透 (WAN)</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-zinc-400 border border-white/5">
                {requireAuth ? <Lock className="w-4 h-4 text-emerald-400" /> : <Unlock className="w-4 h-4 text-zinc-400" />}
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 font-medium block">开放注册状态</span>
                <span className={`text-xs font-semibold ${allowRegistration ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {allowRegistration ? '允许自主注册' : '已关闭开放注册'}
                </span>
              </div>
            </div>
          </div>

          {/* Security Policy Form Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-6">
            
            {/* Toggle Switch 1: Require Auth */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-white block">启用管理登录安全保护</span>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold transition-all ${
                    requireAuth 
                      ? 'bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/50 shadow-sm shadow-[#FF6700]/20' 
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}>
                    {requireAuth ? '已开启' : '已关闭'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  防止暴露在公网 IP、DDNS 动态域名或 FRP / NPS 内网穿透时，他人未经授权修改配置或控制音箱。
                </p>
              </div>
              <button
                type="button"
                id="btn-toggle-require-auth"
                onClick={handleToggleRequireAuth}
                disabled={secSaving}
                className={`w-14 h-8 flex items-center rounded-full p-1 transition-all duration-300 ease-in-out flex-shrink-0 cursor-pointer shadow-inner border ${
                  requireAuth 
                    ? 'bg-[#FF6700] border-[#FF6700] shadow-[0_0_12px_rgba(255,103,0,0.4)]' 
                    : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                } ${secSaving ? 'opacity-70 cursor-wait' : ''}`}
                title={requireAuth ? '点击关闭登录保护' : '点击开启登录保护'}
              >
                <div
                  className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-all duration-300 ease-in-out flex items-center justify-center ${
                    requireAuth ? 'translate-x-6' : 'translate-x-0'
                  }`}
                >
                  {secSaving ? (
                    <span className="animate-spin w-3 h-3 border-2 border-[#FF6700] border-t-transparent rounded-full" />
                  ) : requireAuth ? (
                    <Check className="w-3.5 h-3.5 text-[#FF6700] stroke-[3]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  )}
                </div>
              </button>
            </div>

            {/* Toggle Switch 2: Allow Registration */}
            <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold text-white block">允许新用户开放注册功能</span>
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold transition-all ${
                    allowRegistration 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' 
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {allowRegistration ? '允许注册' : '已禁止注册'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {allowRegistration
                    ? '开启后，访客可在登录弹窗自主注册新账号。'
                    : '关闭后，登录弹窗隐藏注册入口且注册接口禁止调用，仅管理员可在后台统一添加分配账号。'}
                </p>
              </div>
              <button
                type="button"
                id="btn-toggle-allow-registration"
                onClick={handleToggleAllowRegistration}
                disabled={secSaving}
                className={`w-14 h-8 flex items-center rounded-full p-1 transition-all duration-300 ease-in-out flex-shrink-0 cursor-pointer shadow-inner border ${
                  allowRegistration 
                    ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' 
                    : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                } ${secSaving ? 'opacity-70 cursor-wait' : ''}`}
                title={allowRegistration ? '点击关闭自主注册' : '点击开启自主注册'}
              >
                <div
                  className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-all duration-300 ease-in-out flex items-center justify-center ${
                    allowRegistration ? 'translate-x-6' : 'translate-x-0'
                  }`}
                >
                  {allowRegistration ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  )}
                </div>
              </button>
            </div>

            {/* Scope Options */}
            {requireAuth && (
              <div className="pt-4 border-t border-white/5 space-y-3">
                <label className="text-xs font-semibold text-zinc-300 block">防护生效范围策略</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  
                  <div
                    onClick={() => handleSelectAuthScope('all')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      authScope === 'all'
                        ? 'bg-[#FF6700]/10 border-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                        : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-[#FF6700]" />
                        全网强制登录认证 (推荐)
                      </span>
                      {authScope === 'all' && <Check className="w-4 h-4 text-[#FF6700]" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      局域网与外网均对修改操作鉴权。访客仍可自由浏览全部页面并试听歌曲。
                    </p>
                  </div>

                  <div
                    onClick={() => handleSelectAuthScope('wan_only')}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      authScope === 'wan_only'
                        ? 'bg-[#FF6700]/10 border-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                        : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        仅外网访问强制认证 (LAN 免密)
                      </span>
                      {authScope === 'wan_only' && <Check className="w-4 h-4 text-[#FF6700]" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      家中内网 IP（192.168.x.x 等）免登录完全管理；公网通过域名穿透访问时需登录。
                    </p>
                  </div>

                </div>
              </div>
            )}

            {/* Audio Stream Whitelist Note */}
            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/5 flex items-start gap-2.5 text-xs text-zinc-400">
              <Info className="w-4 h-4 text-[#FF6700] flex-shrink-0 mt-0.5" />
              <span>
                <strong>音箱串流免密白名单：</strong> 小爱音箱拉取音乐流 (<code className="text-[#FF6700] font-mono">/api/stream/*</code>) 自动享有硬件级免密通行权，开启安全防护绝不会造成音箱播放中断或鉴权失败。
              </span>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveSecurity}
                disabled={secSaving}
                className="px-6 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition active:scale-95 shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {secSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>保存安全防护与注册策略</span>
              </button>
            </div>

          </div>

          {/* Change Admin Password Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Key className="w-4 h-4 text-[#FF6700]" />
                <h3 className="text-sm font-bold text-white">修改当前管理员密码</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordChange(!showPasswordChange)}
                className="text-xs text-[#FF6700] hover:underline font-medium cursor-pointer"
              >
                {showPasswordChange ? '收起表单' : '修改密码'}
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              修改当前登录的管理员密码。如需管理其他用户密码，可在上方的「用户管理」模块中直接重置。
            </p>

            {showPasswordChange && (
              <form onSubmit={handleChangePassword} className="space-y-4 pt-3 border-t border-white/5">
                {passwordFeedback && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                    passwordFeedback.success
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  }`}>
                    {passwordFeedback.success ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                    <span>{passwordFeedback.message}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">当前原密码</label>
                    <div className="relative">
                      <input
                        type={showOldPassword ? 'text' : 'password'}
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="请输入当前正在使用的旧密码"
                        required
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPassword(!showOldPassword)}
                        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                      >
                        {showOldPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">新密码</label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="至少 6 位字符"
                          required
                          className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700] pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">确认新密码</label>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="重复输入新密码"
                        required
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {passwordLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5 text-[#FF6700]" />}
                    <span>确认更新密码</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= SECTION: DATABASE MANAGEMENT ================= */}
      {(subTab === 'all' || subTab === 'database') && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[#FF6700]" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              数据库管理中心
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-medium ml-2">
              多引擎热切换
            </span>
          </div>

          {/* Current Active Engine Status */}
          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                  <HardDrive className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">当前运行存储引擎</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-base font-bold text-white">
                      {dbStatus?.engineName || 'SQLite 3 (嵌入式轻量库)'}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      连接就绪
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="text-right">
                  <span className="text-[10px] text-zinc-500 block">数据表总数</span>
                  <span className="font-mono text-zinc-200 font-bold">{dbStatus?.tables?.length || 4} 张核心表</span>
                </div>
              </div>
            </div>

            {/* Select Engine Tabs */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-zinc-300 block">选择数据库存储方案</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* SQLite Option */}
                <div
                  onClick={() => setSelectedEngine('sqlite')}
                  className={`p-4 rounded-2xl border cursor-pointer transition ${
                    selectedEngine === 'sqlite'
                      ? 'bg-[#FF6700]/10 border-[#FF6700] text-white shadow-[0_0_15px_rgba(255,103,0,0.15)]'
                      : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#FF6700]" />
                      SQLite 3 (单文件轻量)
                    </span>
                    {selectedEngine === 'sqlite' && <Check className="w-4 h-4 text-[#FF6700]" />}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    无需配置独立数据库服务器，数据直接保存在本地 JSON 与 SQLite 文件中，开箱即用。
                  </p>
                </div>

                {/* PostgreSQL Option */}
                <div
                  onClick={() => setSelectedEngine('postgres')}
                  className={`p-4 rounded-2xl border cursor-pointer transition ${
                    selectedEngine === 'postgres'
                      ? 'bg-blue-500/10 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-blue-400" />
                      PostgreSQL (企业云原生)
                    </span>
                    {selectedEngine === 'postgres' && <Check className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    适合多设备并发访问与 Docker 容器化编排环境，具备事务强一致性与高吞吐能力。
                  </p>
                </div>

                {/* MySQL Option */}
                <div
                  onClick={() => setSelectedEngine('mysql')}
                  className={`p-4 rounded-2xl border cursor-pointer transition ${
                    selectedEngine === 'mysql'
                      ? 'bg-amber-500/10 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'bg-zinc-950/40 border-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-amber-400" />
                      MySQL (经典关系型)
                    </span>
                    {selectedEngine === 'mysql' && <Check className="w-4 h-4 text-amber-400" />}
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    广泛支持各类 NAS (群晖 / 威联通 / 飞牛 NAS) 及云服务器环境，易于备份与维护。
                  </p>
                </div>

              </div>
            </div>

            {/* Test Connection Status Banner */}
            {testResult && (
              <div className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs ${
                testResult.success
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                  <span>{testResult.message}</span>
                </div>
                {testResult.latency !== undefined && (
                  <span className="font-mono text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                    延迟: {testResult.latency} ms
                  </span>
                )}
              </div>
            )}

            {/* PostgreSQL Configuration Fields */}
            {selectedEngine === 'postgres' && (
              <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-4 animate-in fade-in">
                <span className="text-xs font-bold text-white block">PostgreSQL 连接参数</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">主机地址 (Host / IP)</label>
                    <input
                      type="text"
                      value={pgHost}
                      onChange={(e) => setPgHost(e.target.value)}
                      placeholder="127.0.0.1 或 postgres"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">端口号 (Port)</label>
                    <input
                      type="number"
                      value={pgPort}
                      onChange={(e) => setPgPort(Number(e.target.value))}
                      placeholder="5432"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">数据库用户 (User)</label>
                    <input
                      type="text"
                      value={pgUser}
                      onChange={(e) => setPgUser(e.target.value)}
                      placeholder="postgres"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">访问密码 (Password)</label>
                    <input
                      type="password"
                      value={pgPassword}
                      onChange={(e) => setPgPassword(e.target.value)}
                      placeholder="******"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-zinc-400 block mb-1">数据库名称 (Database Name)</label>
                    <input
                      type="text"
                      value={pgDatabase}
                      onChange={(e) => setPgDatabase(e.target.value)}
                      placeholder="tinglan_db"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* MySQL Configuration Fields */}
            {selectedEngine === 'mysql' && (
              <div className="p-5 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-4 animate-in fade-in">
                <span className="text-xs font-bold text-white block">MySQL 连接参数</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">主机地址 (Host / IP)</label>
                    <input
                      type="text"
                      value={myHost}
                      onChange={(e) => setMyHost(e.target.value)}
                      placeholder="127.0.0.1 或 mysql"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">端口号 (Port)</label>
                    <input
                      type="number"
                      value={myPort}
                      onChange={(e) => setMyPort(Number(e.target.value))}
                      placeholder="3306"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">数据库用户 (User)</label>
                    <input
                      type="text"
                      value={myUser}
                      onChange={(e) => setMyUser(e.target.value)}
                      placeholder="root"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-400 block mb-1">访问密码 (Password)</label>
                    <input
                      type="password"
                      value={myPassword}
                      onChange={(e) => setMyPassword(e.target.value)}
                      placeholder="******"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-zinc-400 block mb-1">数据库名称 (Database Name)</label>
                    <input
                      type="text"
                      value={myDatabase}
                      onChange={(e) => setMyDatabase(e.target.value)}
                      placeholder="tinglan_db"
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div>
                {selectedEngine !== 'sqlite' && (
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={dbTesting}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {dbTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5 text-blue-400" />}
                    <span>测试数据库连通性</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleSwitchEngine}
                disabled={dbSwitching}
                className="px-6 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition active:scale-95 shadow-md flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {dbSwitching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>应用并切换数据库引擎</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================= SECTION: SYSTEM & NETWORK ENVIRONMENT ================= */}
      {(subTab === 'all' || subTab === 'system') && (
        <div className="space-y-6 pt-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-[#FF6700]" />
            <h2 className="text-lg font-bold text-white tracking-tight">
              系统与网络环境
            </h2>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 backdrop-blur-md border border-white/5 space-y-4 text-xs text-zinc-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-2">
                <span className="text-[11px] text-zinc-400 font-semibold block uppercase">服务基本参数</span>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">服务名称</span>
                  <span className="font-mono text-white">TingLan Xiaomi Bridge</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">服务版本</span>
                  <span className="font-mono text-[#FF6700]">v1.4.3 MIoT-Spec</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">服务通信端口</span>
                  <span className="font-mono text-white">3000 (HTTP / Reverse Proxy)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">系统协议模式</span>
                  <span className="font-mono text-emerald-400">MIoT & Subsonic API</span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950/60 border border-white/5 space-y-2">
                <span className="text-[11px] text-zinc-400 font-semibold block uppercase">网络访问与安全性</span>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">访客浏览策略</span>
                  <span className="text-emerald-400 font-medium">免登录浏览全部页面</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">管理操作策略</span>
                  <span className="font-medium text-white">{requireAuth ? '必须管理员验证' : '开放访问'}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1.5">
                  <span className="text-zinc-500">用户自主注册</span>
                  <span className={`font-medium ${allowRegistration ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {allowRegistration ? '开放注册中' : '已关闭开放注册'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">当前客户端网络</span>
                  <span className="font-mono text-[#FF6700]">{secStatus?.isLan ? '内网局域网 (LAN)' : '外部网络 (WAN)'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE USER ================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-[#FF6700]/20 text-[#FF6700] border border-[#FF6700]/30 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">添加新用户</h3>
                  <p className="text-xs text-zinc-400">创建新账号并为其分配角色与权限</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  用户名 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="如: user01"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  电子邮箱
                </label>
                <input
                  type="email"
                  placeholder="user@example.com (可选)"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  初始密码 <span className="text-rose-400">* (至少 6 位)</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="输入 6 位以上密码"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">账号角色</label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF6700]"
                  >
                    <option value="user">普通成员 (User)</option>
                    <option value="admin">系统管理员 (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">初始状态</label>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF6700]"
                  >
                    <option value="active">正常启用 (Active)</option>
                    <option value="disabled">暂时停用 (Disabled)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {createLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>确认添加用户</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT USER ================= */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">编辑用户：{editingUser.username}</h3>
                  <p className="text-xs text-zinc-400">修改账号角色、绑定邮箱或账号状态</p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  电子邮箱
                </label>
                <input
                  type="email"
                  placeholder="user@example.com"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">账号角色</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF6700]"
                  >
                    <option value="user">普通成员 (User)</option>
                    <option value="admin">系统管理员 (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">账号状态</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#FF6700]"
                  >
                    <option value="active">正常启用 (Active)</option>
                    <option value="disabled">禁用账号 (Disabled)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  重置登录密码 (选填，留空则保持原密码不变)
                </label>
                <input
                  type="password"
                  placeholder="若无需修改密码请留空"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {editLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>保存修改</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DIRECT RESET PASSWORD ================= */}
      {resetPwdUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-zinc-700 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">重置密码：{resetPwdUser.username}</h3>
                  <p className="text-xs text-zinc-400">直接为该用户设置新的登录密码</p>
                </div>
              </div>
              <button
                onClick={() => setResetPwdUser(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetPwdError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{resetPwdError}</span>
              </div>
            )}

            <form onSubmit={handleResetUserPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  新登录密码 <span className="text-rose-400">* (至少 6 位)</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="输入新密码"
                  value={directResetPwd}
                  onChange={(e) => setDirectResetPwd(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF6700]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setResetPwdUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={resetPwdLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#FF6700] hover:bg-[#e55c00] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {resetPwdLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  <span>确认重置密码</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DELETE CONFIRMATION ================= */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181b] border border-rose-500/40 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">确认删除用户？</h3>
                <p className="text-xs text-zinc-400">此操作无法撤销，账号及配置将被彻底清除</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-white/5 text-xs text-zinc-300 space-y-1">
              <div><strong>目标用户名:</strong> {deletingUser.username}</div>
              <div><strong>电子邮箱:</strong> {deletingUser.email || '无'}</div>
              <div><strong>账号角色:</strong> {deletingUser.role === 'admin' ? '系统管理员' : '普通用户'}</div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={deleteLoading}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {deleteLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>确认永久删除</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
