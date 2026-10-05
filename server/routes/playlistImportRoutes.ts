import express, { Request, Response } from 'express';
import { playlistImportService } from '../core/playlistImportService.js';
import { musicRepository } from '../core/repositories/musicRepository.js';
import { appEventBus } from '../core/eventBus.js';

const router = express.Router();

/**
 * POST /api/playlists/import/parse
 * Parse URL, free text lines, or M3U/CSV string and perform fuzzy matching
 */
router.post('/parse', async (req: Request, res: Response) => {
  try {
    const { input, customTitle } = req.body;
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ success: false, error: '请提供要解析的链接或文本内容' });
    }

    const result = await playlistImportService.parseImportInput(input, customTitle);
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error('[PlaylistImportRoutes] Parse failed:', error);
    return res.status(500).json({ success: false, error: error.message || '歌单解析失败，请检查链接或文本格式' });
  }
});

/**
 * POST /api/playlists/import/confirm
 * Create the imported playlist with selected tracks
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { name, description, coverUrl, songIds } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: '歌单名称不能为空' });
    }

    if (!Array.isArray(songIds) || songIds.length === 0) {
      return res.status(400).json({ success: false, error: '请至少选择一首匹配成功的歌曲加入歌单' });
    }

    // Verify songs exist
    const validSongIds = songIds.filter(id => Boolean(musicRepository.getSongById(id)));

    if (validSongIds.length === 0) {
      return res.status(400).json({ success: false, error: '所选歌曲在本地曲库中不存在' });
    }

    const newPlaylist = {
      id: `playlist-import-${Date.now()}`,
      name: name.trim(),
      description: description || `外部导入歌单 · 共 ${validSongIds.length} 首歌曲`,
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
      songIds: validSongIds,
      createdAt: new Date().toISOString()
    };

    musicRepository.addOrUpdatePlaylist(newPlaylist);

    appEventBus.broadcast('playlists_updated', {
      action: 'import',
      playlist: newPlaylist
    });

    return res.json({
      success: true,
      playlist: newPlaylist,
      message: `成功导入并创建歌单「${newPlaylist.name}」，已添加 ${validSongIds.length} 首本地匹配曲目！`
    });
  } catch (error: any) {
    console.error('[PlaylistImportRoutes] Confirm import failed:', error);
    return res.status(500).json({ success: false, error: error.message || '创建歌单失败' });
  }
});

/**
 * POST /api/playlists/import/export-missing
 * Export missing tracks list as downloadable formatted text
 */
router.post('/export-missing', (req: Request, res: Response) => {
  try {
    const { playlistName, tracks } = req.body;
    const missingTracks = Array.isArray(tracks) ? tracks : [];

    let textContent = `# 「${playlistName || '导入歌单'}」- 待补全缺失歌曲清单\n`;
    textContent += `# 导出时间: ${new Date().toLocaleString('zh-CN')}\n`;
    textContent += `# 共计 ${missingTracks.length} 首未在本地曲库匹配成功的曲目\n\n`;

    missingTracks.forEach((t: any, idx: number) => {
      textContent += `${idx + 1}. ${t.originalTitle || t.title} - ${t.originalArtist || t.artist || '未知'}${t.originalAlbum ? ` (专辑: ${t.originalAlbum})` : ''}\n`;
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="missing_tracks_${Date.now()}.txt"`);
    return res.send(textContent);
  } catch (error: any) {
    console.error('[PlaylistImportRoutes] Export missing failed:', error);
    return res.status(500).json({ success: false, error: '导出缺失列表失败' });
  }
});

export default router;
