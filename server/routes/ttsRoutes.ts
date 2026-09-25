import { Router, Request, Response } from 'express';
import { ttsEngine, POPULAR_TTS_VOICES } from '../ttsEngine.js';

export function createTtsRouter(): Router {
  const router = Router();

  // Get available TTS voices
  router.get('/voices', (req: Request, res: Response) => {
    res.json({
      success: true,
      voices: POPULAR_TTS_VOICES,
      defaultVoice: 'zh-CN-XiaoxiaoNeural'
    });
  });

  // Stream high-definition TTS speech MP3 (supports HTTP 206 partial content for speakers)
  const handleTtsAudioStream = async (req: Request, res: Response) => {
    const text = String(req.query.text || req.body?.text || '').trim();
    const voice = String(req.query.voice || req.body?.voice || 'zh-CN-XiaoxiaoNeural').trim();
    const rate = String(req.query.rate || '+0%').trim();
    const pitch = String(req.query.pitch || '+0Hz').trim();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept-Ranges');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (!text) {
      return res.status(400).send('Missing "text" query param for TTS synthesis');
    }

    try {
      const audioBuffer = await ttsEngine.synthesizeSpeechMp3(text, voice, rate, pitch);
      const totalLength = audioBuffer.length;
      const rangeHeader = req.headers.range;

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', totalLength);
        return res.status(200).end();
      }

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

        if (start >= totalLength || end >= totalLength) {
          res.status(416).setHeader('Content-Range', `bytes */${totalLength}`).end();
          return;
        }

        const chunk = audioBuffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
        res.setHeader('Content-Length', chunk.length);
        res.send(chunk);
      } else {
        res.setHeader('Content-Length', totalLength);
        res.send(audioBuffer);
      }
    } catch (err: any) {
      console.error('[TTS API] Audio stream error:', err.message);
      res.status(500).send(`TTS Error: ${err.message}`);
    }
  };

  router.get('/stream', handleTtsAudioStream);
  router.get('/audio.mp3', handleTtsAudioStream);
  router.post('/stream', handleTtsAudioStream);

  return router;
}
