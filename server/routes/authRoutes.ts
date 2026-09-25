import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export interface AuthRouterOptions {
  getSecuritySettings: () => any;
  setSecuritySettings: (settings: any) => void;
  getStoredUsers: () => any[];
  setStoredUsers: (users: any[]) => void;
  getClientIp: (req: Request) => string;
  isPrivateOrLocalIp: (ip: string) => boolean;
  isAuthRequiredForRequest: (req: Request) => boolean;
  checkLoginRateLimit: (ip: string) => { allowed: boolean; remainingLockSeconds?: number };
  recordLoginAttempt: (ip: string, isSuccess: boolean) => void;
  getDefaultUserAvatar: (role?: string, username?: string) => string;
  jwtSecret: string;
  sqliteDb?: any;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const {
    getSecuritySettings,
    setSecuritySettings,
    getStoredUsers,
    setStoredUsers,
    getClientIp,
    isPrivateOrLocalIp,
    isAuthRequiredForRequest,
    checkLoginRateLimit,
    recordLoginAttempt,
    getDefaultUserAvatar,
    jwtSecret,
    sqliteDb
  } = options;

  // Authentication & System Security Status Check (Public)
  router.get('/status', (req: Request, res: Response) => {
    const securitySettings = getSecuritySettings();
    const storedUsers = getStoredUsers();
    const clientIp = getClientIp(req);
    const isLan = isPrivateOrLocalIp(clientIp);
    const authRequired = isAuthRequiredForRequest(req);
    const allowRegistration = typeof securitySettings.allowRegistration === 'boolean' ? securitySettings.allowRegistration : true;

    const adminUser = storedUsers.find(u => u.username === 'admin');
    let isDefaultAdminPassword = false;
    if (adminUser && adminUser.passwordHash) {
      try {
        isDefaultAdminPassword = bcrypt.compareSync('admin123', adminUser.passwordHash);
      } catch {}
    }

    res.json({
      success: true,
      authRequired,
      globalRequireAuth: Boolean(securitySettings.requireAuth),
      requireAuth: Boolean(securitySettings.requireAuth),
      authScope: securitySettings.authScope || 'all',
      allowRegistration,
      allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
      allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
      clientIp,
      isLan,
      hasDefaultAdmin: Boolean(adminUser),
      isDefaultAdminPassword,
      userCount: storedUsers.length,
      status: {
        success: true,
        authRequired,
        globalRequireAuth: Boolean(securitySettings.requireAuth),
        requireAuth: Boolean(securitySettings.requireAuth),
        authScope: securitySettings.authScope || 'all',
        allowRegistration,
        allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
        allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
        clientIp,
        isLan,
        hasDefaultAdmin: Boolean(adminUser),
        isDefaultAdminPassword,
        userCount: storedUsers.length
      },
      settings: {
        ...securitySettings,
        allowRegistration
      }
    });
  });

  // Change Password handler
  const handleChangePassword = async (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (!clientUser) {
        return res.status(401).json({ success: false, error: '未登录：请先登录后再修改密码', requireLogin: true });
      }

      const { newPassword, oldPassword, username } = req.body;
      if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ success: false, error: '新密码不能少于 6 位' });
      }

      const targetUsername = (username ? String(username).trim() : clientUser.username).toLowerCase();
      const isSelf = clientUser.username.toLowerCase() === targetUsername || clientUser.userId === targetUsername;

      if (!isSelf && clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员可以修改其他用户的密码' });
      }

      const storedUsers = getStoredUsers();
      const userIndex = storedUsers.findIndex(u => u.username.toLowerCase() === targetUsername || u.id === targetUsername);
      if (userIndex < 0) {
        return res.status(404).json({ success: false, error: `用户「${targetUsername}」不存在` });
      }

      const targetUser = storedUsers[userIndex];

      if (isSelf && targetUser.passwordHash) {
        if (!oldPassword) {
          return res.status(400).json({ success: false, error: '请输入当前旧密码以验证身份' });
        }
        const isOldMatch = await bcrypt.compare(String(oldPassword), targetUser.passwordHash);
        if (!isOldMatch) {
          return res.status(400).json({ success: false, error: '原密码验证失败，请输入正确的旧密码' });
        }
      }

      const passwordHash = await bcrypt.hash(String(newPassword), 10);
      targetUser.passwordHash = passwordHash;
      targetUser.updatedAt = new Date().toISOString();
      setStoredUsers(storedUsers);

      if (sqliteDb) {
        try {
          sqliteDb.run(
            `UPDATE users SET password_hash = ? WHERE LOWER(username) = LOWER(?) OR id = ?`,
            [passwordHash, targetUser.username, targetUser.id]
          );
        } catch (dbErr) {
          console.warn('Could not sync password update to SQLite', dbErr);
        }
      }

      return res.json({
        success: true,
        message: `用户「${targetUser.username}」的密码已成功修改！`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || '修改密码失败' });
    }
  };

  router.post('/change-password', handleChangePassword);
  router.post('/change-admin-password', handleChangePassword);

  // Register User
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const securitySettings = getSecuritySettings();
      if (securitySettings.allowRegistration === false) {
        return res.status(403).json({
          success: false,
          error: '系统当前已关闭开放注册功能。如需账号，请联系管理员直接分配。'
        });
      }

      const { username, email, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: '请填写用户名和密码' });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, error: '密码长度不能少于 6 位' });
      }

      const trimmedUser = String(username).trim();
      const storedUsers = getStoredUsers();
      if (storedUsers.some(u => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
        return res.status(400).json({ success: false, error: '该用户名已被注册，请更换其他名称' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = {
        id: `usr-${Date.now()}`,
        username: trimmedUser,
        email: email ? String(email).trim() : `${trimmedUser}@tinglan.audio`,
        passwordHash,
        role: 'user',
        status: 'active',
        avatarUrl: getDefaultUserAvatar('user', trimmedUser),
        createdAt: new Date().toISOString()
      };

      storedUsers.push(newUser);
      setStoredUsers(storedUsers);

      if (sqliteDb) {
        sqliteDb.run(`
          INSERT OR REPLACE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [newUser.id, newUser.username, newUser.email, newUser.passwordHash, newUser.role, newUser.avatarUrl, newUser.createdAt]);
      }

      const token = jwt.sign(
        { userId: newUser.id, username: newUser.username, role: newUser.role },
        jwtSecret,
        { expiresIn: '30d' }
      );

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      return res.json({
        success: true,
        message: '账号注册成功！',
        user: userWithoutPassword,
        token
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `注册异常: ${err.message}` });
    }
  });

  // Login User
  router.post('/login', async (req: Request, res: Response) => {
    const clientIp = getClientIp(req);
    try {
      const rateCheck = checkLoginRateLimit(clientIp);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: `登录失败次数过多，为保护账号安全，该 IP 已临时锁定，请在 ${rateCheck.remainingLockSeconds} 秒后再试`
        });
      }

      const usernameOrEmail = req.body.usernameOrEmail || req.body.username;
      const { password } = req.body;
      if (!usernameOrEmail || !password) {
        return res.status(400).json({ success: false, error: '请输入用户名/邮箱与密码' });
      }

      const storedUsers = getStoredUsers();
      const query = String(usernameOrEmail).trim().toLowerCase();
      const user = storedUsers.find(u => u.username.toLowerCase() === query || u.email.toLowerCase() === query);

      if (!user) {
        recordLoginAttempt(clientIp, false);
        return res.status(401).json({ success: false, error: '用户不存在或密码错误' });
      }

      if (user.status === 'disabled') {
        return res.status(403).json({ success: false, error: '该账号已被管理员禁用，请联系管理员恢复' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        recordLoginAttempt(clientIp, false);
        return res.status(401).json({ success: false, error: '用户不存在或密码错误' });
      }

      recordLoginAttempt(clientIp, true);

      user.lastLoginAt = new Date().toISOString();
      setStoredUsers(storedUsers);

      let isDefaultPassword = false;
      if (user.username === 'admin' && user.passwordHash) {
        try {
          isDefaultPassword = bcrypt.compareSync('admin123', user.passwordHash);
        } catch {}
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role },
        jwtSecret,
        { expiresIn: '30d' }
      );

      const { passwordHash: _, ...userWithoutPassword } = user;
      return res.json({
        success: true,
        message: '登录成功！',
        user: { ...userWithoutPassword, isDefaultPassword },
        isDefaultPassword,
        token
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `登录异常: ${err.message}` });
    }
  });

  // Current Profile
  router.get('/me', (req: Request, res: Response) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, user: null });
    }

    try {
      const decoded: any = jwt.verify(token, jwtSecret);
      const storedUsers = getStoredUsers();
      const user = storedUsers.find(u => u.id === decoded.userId);
      if (!user) {
        return res.status(404).json({ success: false, user: null });
      }
      let isDefaultPassword = false;
      if (user.username === 'admin' && user.passwordHash) {
        try {
          isDefaultPassword = bcrypt.compareSync('admin123', user.passwordHash);
        } catch {}
      }
      const { passwordHash: _, ...userWithoutPassword } = user;
      return res.json({ success: true, user: { ...userWithoutPassword, isDefaultPassword } });
    } catch (e) {
      return res.status(401).json({ success: false, user: null });
    }
  });

  // List All Users (Admin)
  router.get('/users', (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以查看系统用户列表' });
    }

    const storedUsers = getStoredUsers();
    const sanitized = storedUsers.map(({ passwordHash, ...rest }) => ({
      ...rest,
      status: rest.status || 'active',
      role: rest.role || 'user'
    })).sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    return res.json({ success: true, users: sanitized, total: sanitized.length });
  });

  // Admin Create New User
  router.post('/users', async (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (!clientUser || clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员可以添加用户' });
      }

      const { username, email, password, role, status } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: '请提供用户名和初始密码' });
      }
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, error: '密码长度不能少于 6 位' });
      }

      const trimmedUser = String(username).trim();
      const storedUsers = getStoredUsers();
      if (storedUsers.some(u => u.username.toLowerCase() === trimmedUser.toLowerCase())) {
        return res.status(400).json({ success: false, error: '该用户名已存在，请使用其他名称' });
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      const userRole = role === 'admin' ? 'admin' : 'user';
      const userStatus = status === 'disabled' ? 'disabled' : 'active';
      const newUser = {
        id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        username: trimmedUser,
        email: email ? String(email).trim() : `${trimmedUser}@tinglan.audio`,
        passwordHash,
        role: userRole,
        status: userStatus,
        avatarUrl: getDefaultUserAvatar(userRole, trimmedUser),
        createdAt: new Date().toISOString()
      };

      storedUsers.push(newUser);
      setStoredUsers(storedUsers);

      if (sqliteDb) {
        sqliteDb.run(`
          INSERT OR REPLACE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [newUser.id, newUser.username, newUser.email, newUser.passwordHash, newUser.role, newUser.avatarUrl, newUser.createdAt]);
      }

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      return res.json({
        success: true,
        message: `用户「${trimmedUser}」创建成功！`,
        user: userWithoutPassword
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `添加用户失败: ${err.message}` });
    }
  });

  // Admin Update User
  router.put('/users/:id', async (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (!clientUser || clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员可以修改用户信息' });
      }

      const { id } = req.params;
      const { email, role, status, password, avatarUrl } = req.body;

      const storedUsers = getStoredUsers();
      const userIndex = storedUsers.findIndex(u => u.id === id);
      if (userIndex < 0) {
        return res.status(404).json({ success: false, error: '目标用户不存在' });
      }

      const targetUser = storedUsers[userIndex];

      if (targetUser.role === 'admin' && (role === 'user' || status === 'disabled')) {
        const otherAdmins = storedUsers.filter(u => u.id !== id && u.role === 'admin' && u.status !== 'disabled');
        if (otherAdmins.length === 0) {
          return res.status(400).json({ success: false, error: '操作被阻止：系统必须保留至少一个处于启用状态的管理员账号' });
        }
      }

      if (email) targetUser.email = String(email).trim();
      if (role === 'admin' || role === 'user') targetUser.role = role;
      if (status === 'active' || status === 'disabled') targetUser.status = status;
      if (avatarUrl) targetUser.avatarUrl = avatarUrl;
      if (password && String(password).length >= 6) {
        targetUser.passwordHash = await bcrypt.hash(String(password), 10);
      }
      targetUser.updatedAt = new Date().toISOString();

      setStoredUsers(storedUsers);

      if (sqliteDb) {
        sqliteDb.run(`
          UPDATE users SET email = ?, role = ?, password_hash = ? WHERE id = ?
        `, [targetUser.email, targetUser.role, targetUser.passwordHash, targetUser.id]);
      }

      const { passwordHash: _, ...userWithoutPassword } = targetUser;
      return res.json({
        success: true,
        message: `用户「${targetUser.username}」信息更新成功！`,
        user: userWithoutPassword
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `修改用户失败: ${err.message}` });
    }
  });

  // Admin Delete User
  router.delete('/users/:id', (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (!clientUser || clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员可以删除用户' });
      }

      const { id } = req.params;
      let storedUsers = getStoredUsers();
      const targetUser = storedUsers.find(u => u.id === id);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: '目标用户不存在' });
      }

      if (clientUser && clientUser.userId === id) {
        return res.status(400).json({ success: false, error: '无法删除当前正在登录的账号' });
      }

      if (targetUser.role === 'admin') {
        const otherAdmins = storedUsers.filter(u => u.id !== id && u.role === 'admin');
        if (otherAdmins.length === 0) {
          return res.status(400).json({ success: false, error: '无法删除系统中唯一的管理员账号' });
        }
      }

      storedUsers = storedUsers.filter(u => u.id !== id);
      setStoredUsers(storedUsers);

      if (sqliteDb) {
        sqliteDb.run(`DELETE FROM users WHERE id = ?`, [id]);
      }

      return res.json({
        success: true,
        message: `用户「${targetUser.username}」已成功删除！`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `删除用户失败: ${err.message}` });
    }
  });

  // Admin Reset User Password
  router.post('/users/:id/reset-password', async (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (!clientUser || clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员可以重置密码' });
      }

      const { id } = req.params;
      const { newPassword } = req.body;
      if (!newPassword || String(newPassword).length < 6) {
        return res.status(400).json({ success: false, error: '新密码不能少于 6 位' });
      }

      const storedUsers = getStoredUsers();
      const targetUser = storedUsers.find(u => u.id === id);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: '目标用户不存在' });
      }

      targetUser.passwordHash = await bcrypt.hash(String(newPassword), 10);
      targetUser.updatedAt = new Date().toISOString();
      setStoredUsers(storedUsers);

      if (sqliteDb) {
        sqliteDb.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [targetUser.passwordHash, id]);
      }

      return res.json({
        success: true,
        message: `用户「${targetUser.username}」的密码已成功重置！`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `重置密码失败: ${err.message}` });
    }
  });

  // Admin Toggle User Status
  router.post('/users/:id/toggle-status', (req: Request, res: Response) => {
    try {
      const clientUser = (req as any).user;
      if (!clientUser || clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员可以操作账号状态' });
      }

      const { id } = req.params;
      const storedUsers = getStoredUsers();
      const targetUser = storedUsers.find(u => u.id === id);
      if (!targetUser) {
        return res.status(404).json({ success: false, error: '目标用户不存在' });
      }

      const nextStatus = targetUser.status === 'disabled' ? 'active' : 'disabled';

      if (nextStatus === 'disabled') {
        if (clientUser && clientUser.userId === id) {
          return res.status(400).json({ success: false, error: '无法禁用当前正在操作的自身账号' });
        }
        if (targetUser.role === 'admin') {
          const otherAdmins = storedUsers.filter(u => u.id !== id && u.role === 'admin' && u.status !== 'disabled');
          if (otherAdmins.length === 0) {
            return res.status(400).json({ success: false, error: '无法禁用系统中唯一的活跃管理员账号' });
          }
        }
      }

      targetUser.status = nextStatus;
      targetUser.updatedAt = new Date().toISOString();
      setStoredUsers(storedUsers);

      return res.json({
        success: true,
        message: `用户「${targetUser.username}」状态已变更为: ${nextStatus === 'active' ? '正常启用' : '已停用'}`,
        status: nextStatus
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: `更改用户状态失败: ${err.message}` });
    }
  });

  return router;
}

/**
 * Clean router for system security settings (/api/system/security)
 */
export function createSecurityRouter(options: Pick<AuthRouterOptions, 'getSecuritySettings' | 'setSecuritySettings' | 'getStoredUsers' | 'getClientIp' | 'isPrivateOrLocalIp' | 'isAuthRequiredForRequest'>): Router {
  const router = Router();
  const {
    getSecuritySettings,
    setSecuritySettings,
    getStoredUsers,
    getClientIp,
    isPrivateOrLocalIp,
    isAuthRequiredForRequest
  } = options;

  // System Security Settings Query (Public GET)
  router.get('/security', (req: Request, res: Response) => {
    const securitySettings = getSecuritySettings();
    const storedUsers = getStoredUsers();
    const clientIp = getClientIp(req);
    const isLan = isPrivateOrLocalIp(clientIp);
    const isAuthRequired = isAuthRequiredForRequest(req);
    const allowRegistration = typeof securitySettings.allowRegistration === 'boolean' ? securitySettings.allowRegistration : true;

    const adminUser = storedUsers.find(u => u.username === 'admin');
    let isDefaultAdminPassword = false;
    if (adminUser && adminUser.passwordHash) {
      try {
        isDefaultAdminPassword = bcrypt.compareSync('admin123', adminUser.passwordHash);
      } catch {}
    }

    res.json({
      success: true,
      authRequired: isAuthRequired,
      globalRequireAuth: Boolean(securitySettings.requireAuth),
      requireAuth: Boolean(securitySettings.requireAuth),
      authScope: securitySettings.authScope || 'all',
      allowRegistration,
      allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
      allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
      clientIp,
      isLan,
      isDefaultAdminPassword,
      hasDefaultAdmin: Boolean(adminUser),
      userCount: storedUsers.length,
      settings: {
        ...securitySettings,
        allowRegistration
      },
      status: {
        success: true,
        authRequired: isAuthRequired,
        globalRequireAuth: Boolean(securitySettings.requireAuth),
        requireAuth: Boolean(securitySettings.requireAuth),
        authScope: securitySettings.authScope || 'all',
        allowRegistration,
        allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
        allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
        clientIp,
        isLan,
        isDefaultAdminPassword,
        hasDefaultAdmin: Boolean(adminUser),
        userCount: storedUsers.length
      },
      clientInfo: {
        ip: clientIp,
        isLan,
        isAuthRequired
      }
    });
  });

  // Update System Security Settings (POST)
  router.post('/security', (req: Request, res: Response) => {
    try {
      const { requireAuth, authScope, allowRegistration, allowUserMiotControl, allowUserMiotTts } = req.body;
      
      const clientUser = (req as any).user;
      if (!clientUser || clientUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: '权限不足：仅管理员允许修改系统安全与注册设置' });
      }

      const securitySettings = getSecuritySettings();
      if (typeof requireAuth === 'boolean') {
        securitySettings.requireAuth = requireAuth;
      }
      if (authScope === 'all' || authScope === 'wan_only') {
        securitySettings.authScope = authScope;
      }
      if (typeof allowRegistration === 'boolean') {
        securitySettings.allowRegistration = allowRegistration;
      }
      if (typeof allowUserMiotControl === 'boolean') {
        securitySettings.allowUserMiotControl = allowUserMiotControl;
      }
      if (typeof allowUserMiotTts === 'boolean') {
        securitySettings.allowUserMiotTts = allowUserMiotTts;
      }
      securitySettings.updatedAt = new Date().toISOString();
      setSecuritySettings(securitySettings);

      const clientIp = getClientIp(req);
      const isLan = isPrivateOrLocalIp(clientIp);
      const isAuthRequired = isAuthRequiredForRequest(req);
      const currentAllowReg = typeof securitySettings.allowRegistration === 'boolean' ? securitySettings.allowRegistration : true;
      const storedUsers = getStoredUsers();

      res.json({
        success: true,
        message: '系统安全策略与注册配置已成功更新！',
        settings: securitySettings,
        authRequired: isAuthRequired,
        globalRequireAuth: Boolean(securitySettings.requireAuth),
        requireAuth: Boolean(securitySettings.requireAuth),
        authScope: securitySettings.authScope || 'all',
        allowRegistration: currentAllowReg,
        allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
        allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
        clientIp,
        isLan,
        status: {
          success: true,
          authRequired: isAuthRequired,
          globalRequireAuth: Boolean(securitySettings.requireAuth),
          requireAuth: Boolean(securitySettings.requireAuth),
          authScope: securitySettings.authScope || 'all',
          allowRegistration: currentAllowReg,
          allowUserMiotControl: securitySettings.allowUserMiotControl !== false,
          allowUserMiotTts: Boolean(securitySettings.allowUserMiotTts),
          clientIp,
          isLan,
          hasDefaultAdmin: storedUsers.some(u => u.username === 'admin'),
          userCount: storedUsers.length
        },
        clientInfo: {
          ip: clientIp,
          isLan,
          isAuthRequired
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || '更新安全设置失败' });
    }
  });

  return router;
}
