import express, { Request, Response } from 'express';
import { familyUserService } from '../core/familyUserService.js';

const router = express.Router();

/**
 * GET /api/family/users
 * List all family members
 */
router.get('/users', (req: Request, res: Response) => {
  try {
    const users = familyUserService.getUsers();
    const activeUserId = familyUserService.getActiveUserId();
    const activeUser = familyUserService.getActiveUser();
    return res.json({ success: true, users, activeUserId, activeUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/family/users/switch
 * Switch active family member
 */
router.post('/users/switch', (req: Request, res: Response) => {
  try {
    const { userId, pin } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: '缺少目标用户 ID' });
    }
    const switchedUser = familyUserService.setActiveUser(userId, pin);
    return res.json({
      success: true,
      message: `已无缝切换至家庭成员: ${switchedUser.name}`,
      activeUser: switchedUser
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/family/users
 * Create new family member
 */
router.post('/users', (req: Request, res: Response) => {
  try {
    const { name, avatar, role, pin, assignedSpeakerDid } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '请输入成员姓名或昵称' });
    }
    const newUser = familyUserService.addUser({
      name: name.trim(),
      avatar: avatar || '👤',
      role: role || 'member',
      pin: pin ? String(pin) : undefined,
      assignedSpeakerDid
    });
    return res.json({ success: true, user: newUser, message: `成功创建家庭成员: ${newUser.name}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/family/users/:id
 * Update existing family member
 */
router.put('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updated = familyUserService.updateUser(id, updates);
    return res.json({ success: true, user: updated, message: '家庭成员配置已更新' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/family/users/:id
 * Delete family member
 */
router.delete('/users/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    familyUserService.deleteUser(id);
    return res.json({ success: true, message: '已成功移除家庭成员' });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/family/favorites
 * Get favorites list for active or specified user
 */
router.get('/favorites', (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || familyUserService.getActiveUserId();
    const songIds = familyUserService.getUserFavorites(userId);
    return res.json({ success: true, userId, songIds });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/family/favorites/toggle
 * Toggle favorite song for active or specified user
 */
router.post('/favorites/toggle', (req: Request, res: Response) => {
  try {
    const { songId, userId } = req.body;
    if (!songId) {
      return res.status(400).json({ success: false, error: '缺少歌曲 ID' });
    }
    const targetUserId = userId || familyUserService.getActiveUserId();
    const result = familyUserService.toggleFavorite(targetUserId, songId);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
