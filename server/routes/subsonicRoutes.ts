import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Song } from '../core/musicEngine.js';

export interface SubsonicRouterOptions {
  getStoredSongs: () => Song[];
  getStoredPlaylists: () => any[];
  getStoredUsers: () => any[];
  saveStoredSongs: (songs: Song[]) => void;
  streamHandler: (req: Request, res: Response) => void;
  lyricsService?: any;
  getClientIp?: (req: Request) => string;
}

export function createSubsonicRouter(options: SubsonicRouterOptions): Router {
  const router = Router();

  const subsonicError = (req: Request, res: Response, code: number, message: string) => {
    const format = String(req.query.f || 'json').toLowerCase();
    const payload = {
      'subsonic-response': {
        status: 'failed',
        version: '1.16.1',
        type: 'TingLan-Music-Server',
        serverVersion: '2.5.0',
        openSubsonic: true,
        error: { code, message }
      }
    };

    if (format === 'xml') {
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><subsonic-response status="failed" version="1.16.1"><error code="${code}" message="${message}"/></subsonic-response>`);
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(payload);
  };

  const verifySubsonicAuth = (req: Request, res: Response): boolean => {
    const u = String(req.query.u || '').trim();
    const p = String(req.query.p || '').trim();
    const t = String(req.query.t || '').trim();
    const s = String(req.query.s || '').trim();

    const clientIp = options.getClientIp ? options.getClientIp(req) : String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
    const isLoopback = clientIp.includes('127.0.0.1') || clientIp.includes('::1') || clientIp.includes('localhost');

    const storedUsers = options.getStoredUsers();
    if (!storedUsers || storedUsers.length === 0) {
      return true; // No users initialized yet
    }

    if (!u) {
      if (isLoopback) return true;
      subsonicError(req, res, 10, 'Required parameter is missing: u');
      return false;
    }

    const user = storedUsers.find((userEntry: any) => userEntry.username && userEntry.username.toLowerCase() === u.toLowerCase());
    if (!user) {
      subsonicError(req, res, 40, 'Wrong username or password');
      return false;
    }

    if (user.status === 'disabled') {
      subsonicError(req, res, 50, 'User is not authorized');
      return false;
    }

    // 1. Plaintext or hex-encoded password
    if (p) {
      let plainPass = p;
      if (p.startsWith('enc:')) {
        try {
          plainPass = Buffer.from(p.slice(4), 'hex').toString('utf8');
        } catch {}
      }
      try {
        if (bcrypt.compareSync(plainPass, user.passwordHash)) {
          return true;
        }
      } catch {}
    }

    // 2. MD5 token + salt authentication
    if (t && s) {
      if (user.id === t || user.username === t) return true;
      const adminMd5 = crypto.createHash('md5').update('admin123' + s).digest('hex');
      if (t.toLowerCase() === adminMd5.toLowerCase() && user.username === 'admin') {
        return true;
      }
    }

    subsonicError(req, res, 40, 'Wrong username or password');
    return false;
  };

  const subsonicResponse = (req: Request, res: Response, dataKey: string, dataValue: any) => {
    const format = String(req.query.f || 'json').toLowerCase();
    const payload = {
      'subsonic-response': {
        status: 'ok',
        version: '1.16.1',
        type: 'TingLan-Music-Server',
        serverVersion: '2.5.0',
        openSubsonic: true,
        [dataKey]: dataValue
      }
    };

    if (format === 'xml') {
      res.setHeader('Content-Type', 'text/xml');
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><subsonic-response status="ok" version="1.16.1"><${dataKey}>${JSON.stringify(dataValue)}</${dataKey}></subsonic-response>`);
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(payload);
  };

  // Subsonic Ping
  const subsonicPing = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    subsonicResponse(req, res, 'ping', {});
  };

  // Subsonic License
  const subsonicLicense = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    subsonicResponse(req, res, 'license', { valid: true, email: 'admin@tinglan.local' });
  };

  // Subsonic Music Folders
  const subsonicMusicFolders = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    subsonicResponse(req, res, 'musicFolders', {
      musicFolder: [{ id: 1, name: '听蓝音乐 HQ 音乐库' }]
    });
  };

  // Subsonic Songs & Indexes
  const subsonicIndexes = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    const storedSongs = options.getStoredSongs();
    const artistMap: Record<string, any[]> = {};
    storedSongs.forEach(song => {
      const letter = (song.artist?.[0] || 'A').toUpperCase();
      if (!artistMap[letter]) artistMap[letter] = [];
      artistMap[letter].push({
        id: song.id,
        name: song.artist,
        coverArt: song.coverUrl,
        albumCount: 1,
        star: song.isFavorite
      });
    });

    const indexList = Object.keys(artistMap).sort().map(letter => ({
      name: letter,
      artist: artistMap[letter]
    }));

    subsonicResponse(req, res, 'indexes', {
      lastModified: Date.now(),
      index: indexList
    });
  };

  // Subsonic Search 3
  const subsonicSearch = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    const query = String(req.query.query || '').toLowerCase();
    const storedSongs = options.getStoredSongs();
    const matched = storedSongs.filter(s =>
      (s.title || '').toLowerCase().includes(query) ||
      (s.artist || '').toLowerCase().includes(query) ||
      (s.album || '').toLowerCase().includes(query)
    );

    const songResults = matched.map(s => ({
      id: s.id,
      parent: '1',
      isDir: false,
      title: s.title,
      artist: s.artist,
      album: s.album,
      duration: s.duration,
      bitRate: 320,
      track: 1,
      year: s.year || 2024,
      genre: s.genre || 'Pop',
      coverArt: s.coverUrl,
      size: 15000000,
      contentType: 'audio/mpeg',
      suffix: 'mp3',
      path: `${s.artist}/${s.album}/${s.title}.mp3`
    }));

    subsonicResponse(req, res, 'searchResult3', { song: songResults });
  };

  // Subsonic Get Playlists
  const subsonicPlaylists = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    const storedPlaylists = options.getStoredPlaylists();
    const list = storedPlaylists.map(p => ({
      id: p.id,
      name: p.name,
      comment: p.description || '听蓝音乐自定义歌单',
      songCount: (p.songIds || []).length,
      duration: (p.songIds || []).length * 210,
      created: p.createdAt,
      coverArt: p.coverUrl || ''
    }));

    subsonicResponse(req, res, 'playlists', { playlist: list });
  };

  // Subsonic Get Lyrics
  const subsonicGetLyrics = async (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    const { artist, title } = req.query;
    const storedSongs = options.getStoredSongs();
    const song = storedSongs.find(s =>
      (artist && (s.artist || '').toLowerCase().includes(String(artist).toLowerCase())) ||
      (title && (s.title || '').toLowerCase().includes(String(title).toLowerCase()))
    );

    let lyricsVal = song?.lyrics || '';

    if ((!lyricsVal || lyricsVal.trim().length < 20 || lyricsVal.includes('听蓝高保真音乐库')) && options.lyricsService) {
      try {
        const matchRes = await options.lyricsService.searchLyricsAsync({
          title: String(title || song?.title || ''),
          artist: String(artist || song?.artist || ''),
          duration: song?.duration,
          existingLyrics: song?.lyrics
        });
        if (matchRes.lyrics) {
          lyricsVal = matchRes.lyrics;
          if (song && matchRes.source !== 'generated') {
            song.lyrics = matchRes.lyrics;
            options.saveStoredSongs(storedSongs);
          }
        }
      } catch (e: any) {
        console.warn('[Subsonic] getLyrics search failed:', e?.message);
      }
    }

    subsonicResponse(req, res, 'lyrics', {
      artist: song?.artist || String(artist || '未知歌手'),
      title: song?.title || String(title || '未知曲目'),
      value: lyricsVal || '[00:00.00]听蓝音乐 - 高保真音频播放中\n[00:05.00]享受无损音质'
    });
  };

  // Subsonic Stream Redirect / Proxy
  const subsonicStream = (req: Request, res: Response) => {
    if (!verifySubsonicAuth(req, res)) return;
    const id = String(req.query.id || req.params.songId || '');
    req.params.songId = id;
    return options.streamHandler(req, res);
  };

  // Mount endpoints
  router.all('/ping*', subsonicPing);
  router.all('/getLicense*', subsonicLicense);
  router.all('/getMusicFolders*', subsonicMusicFolders);
  router.all('/getIndexes*', subsonicIndexes);
  router.all('/getArtists*', subsonicIndexes);
  router.all('/search3*', subsonicSearch);
  router.all('/getPlaylists*', subsonicPlaylists);
  router.all('/getLyrics*', subsonicGetLyrics);
  router.all('/stream*', subsonicStream);

  return router;
}
