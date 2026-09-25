import { Router, Request, Response } from 'express';
import { speakerGroupRepository, SpeakerGroup } from '../core/repositories/speakerGroupRepository.js';
import { deviceRepository } from '../core/repositories/deviceRepository.js';
import { xiaomiAdapter } from '../xiaomi/xiaomiAdapter.js';
import { ttsEngine } from '../ttsEngine.js';

export interface GroupRouterOptions {
  callMinaCloudApi: any;
  sendMiioCommand: any;
  getMiotConfig: () => any;
  saveMiotConfig: (cfg: any) => void;
  dispatchCastSongDirectly: any;
}

export function createGroupRouter(options: GroupRouterOptions): Router {
  const router = Router();
  const { callMinaCloudApi, sendMiioCommand, getMiotConfig, saveMiotConfig, dispatchCastSongDirectly } = options;

  // 1. List all speaker groups
  router.get('/', (req: Request, res: Response) => {
    try {
      const groups = speakerGroupRepository.getAllGroups();
      return res.json({
        success: true,
        groups
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Create or update group
  router.post('/', (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.name) {
        return res.status(400).json({ success: false, error: '音箱群组名称不能为空' });
      }

      const id = body.id || `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const group: SpeakerGroup = {
        id,
        name: body.name,
        description: body.description,
        masterDid: body.masterDid,
        memberDids: Array.isArray(body.memberDids) ? body.memberDids : [],
        masterVolume: body.masterVolume !== undefined ? Number(body.masterVolume) : 50,
        volumeOffsets: body.volumeOffsets || {},
        icon: body.icon || 'Radio',
        isDefault: Boolean(body.isDefault),
        createdAt: body.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const saved = speakerGroupRepository.upsertGroup(group);
      return res.json({
        success: true,
        message: '音箱编组已成功保存',
        group: saved
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Delete group
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const ok = speakerGroupRepository.deleteGroup(id);
      if (!ok) {
        return res.status(404).json({ success: false, error: '音箱群组不存在' });
      }
      return res.json({
        success: true,
        message: '音箱编组已删除'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Batch adjust group volume with offsets
  router.post('/:id/volume', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { masterVolume, volumeOffsets } = req.body;
      const group = speakerGroupRepository.getGroupById(id);
      if (!group) {
        return res.status(404).json({ success: false, error: '群组未找到' });
      }

      if (masterVolume !== undefined) {
        group.masterVolume = Math.min(100, Math.max(0, Number(masterVolume)));
      }
      if (volumeOffsets) {
        group.volumeOffsets = { ...group.volumeOffsets, ...volumeOffsets };
      }
      speakerGroupRepository.upsertGroup(group);

      const miotConfig = getMiotConfig();
      const results: any[] = [];

      for (const did of group.memberDids) {
        const dev = deviceRepository.getDeviceByDid(did);
        if (!dev) continue;
        const offset = (group.volumeOffsets && group.volumeOffsets[did]) || 0;
        const targetVol = Math.min(100, Math.max(0, group.masterVolume + offset));

        try {
          const resVol = await xiaomiAdapter.setVolume(
            dev,
            targetVol,
            (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, saveMiotConfig),
            sendMiioCommand,
            miotConfig
          );
          results.push({ did, name: dev.name, volume: targetVol, success: resVol.success });
        } catch (e: any) {
          results.push({ did, name: dev.name, volume: targetVol, success: false, error: e.message });
        }
      }

      return res.json({
        success: true,
        message: `已同步调节编组「${group.name}」主音量为 ${group.masterVolume}%`,
        results,
        group
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Broadcast TTS to whole group
  router.post('/:id/broadcast-tts', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ success: false, error: '播报内容不能为空' });
      }

      const group = speakerGroupRepository.getGroupById(id);
      if (!group) {
        return res.status(404).json({ success: false, error: '群组未找到' });
      }

      const miotConfig = getMiotConfig();
      const results: any[] = [];

      for (const did of group.memberDids) {
        const dev = deviceRepository.getDeviceByDid(did);
        if (!dev) continue;
        try {
          const resTts = await ttsEngine.dispatchToSpeaker({
            targetDevice: dev,
            text,
            miotConfig,
            sendMiioCommandFn: sendMiioCommand,
            callMinaCloudApiFn: (path, method, msg, tDid, retry) => callMinaCloudApi(path, method, msg, tDid, retry, miotConfig, saveMiotConfig)
          });
          results.push({ did, name: dev.name, success: resTts.success });
        } catch (e: any) {
          results.push({ did, name: dev.name, success: false, error: e.message });
        }
      }

      return res.json({
        success: true,
        message: `已向编组「${group.name}」(${group.memberDids.length} 台设备) 发送全屋广播`,
        results
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
