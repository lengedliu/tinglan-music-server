import { Router, Request, Response } from 'express';

export interface NavidromeRouterOptions {
  getNavidromeConfig: () => any;
  setNavidromeConfig: (config: any) => void;
  refreshNavidromeSongCredentials: () => { songsUpdated: number; playlistsUpdated: number };
  getSubsonicAuthQuery: (user: string, pass: string, apiVer?: string) => string;
  getSubsonicPassAuthQuery: (user: string, pass: string, apiVer?: string) => string;
  getStoredSongs: () => any[];
  setStoredSongs: (songs: any[]) => void;
  getStoredPlaylists: () => any[];
  setStoredPlaylists: (playlists: any[]) => void;
}

export function extractSubsonicPlaylists(subResp: any): any[] {
  if (!subResp) return [];
  const list: any[] = [];

  const addItems = (val: any) => {
    if (!val) return;
    if (Array.isArray(val)) {
      list.push(...val);
    } else if (typeof val === 'object') {
      if (val.id || val.name) {
        list.push(val);
      } else {
        Object.values(val).forEach(v => {
          if (v && typeof v === 'object' && ((v as any).id || (v as any).name)) {
            list.push(v);
          }
        });
      }
    }
  };

  if (subResp.playlists) addItems(subResp.playlists.playlist || subResp.playlists);
  if (subResp.playlist) addItems(subResp.playlist);
  if (subResp.publicPlaylists) addItems(subResp.publicPlaylists.playlist || subResp.publicPlaylists);
  if (subResp.smartPlaylists) addItems(subResp.smartPlaylists.playlist || subResp.smartPlaylists);

  const map = new Map<string, any>();
  for (const item of list) {
    const itemId = String(item.id || item.playlistId || item.name || '');
    if (itemId && !map.has(itemId)) {
      map.set(itemId, item);
    }
  }

  return Array.from(map.values());
}

export function sanitizeNavidromeConfig(cfg: any) {
  return {
    serverUrl: cfg?.serverUrl || '',
    username: cfg?.username || '',
    password: cfg?.password ? '••••••••' : '',
    hasPassword: Boolean(cfg?.password),
    isConnected: Boolean(cfg?.isConnected),
    apiVersion: cfg?.apiVersion || '1.16.1',
    serverVersion: cfg?.serverVersion || ''
  };
}

export function createNavidromeRouter(options: NavidromeRouterOptions): Router {
  const router = Router();
  const {
    getNavidromeConfig,
    setNavidromeConfig,
    refreshNavidromeSongCredentials,
    getSubsonicAuthQuery,
    getSubsonicPassAuthQuery,
    getStoredSongs,
    setStoredSongs,
    getStoredPlaylists,
    setStoredPlaylists
  } = options;

  // Get Navidrome config
  router.get('/config', (req: Request, res: Response) => {
    res.json(sanitizeNavidromeConfig(getNavidromeConfig()));
  });

  // Save Navidrome config
  router.post('/config', (req: Request, res: Response) => {
    const { serverUrl, username, password } = req.body;
    const currentConfig = getNavidromeConfig();
    const isMaskedPassword = password === '••••••••' || password === '********' || !password;
    const newConfig = {
      serverUrl: String(serverUrl || '').trim().replace(/\/+$/, ''),
      username: String(username || '').trim(),
      password: isMaskedPassword ? currentConfig.password : String(password || ''),
      isConnected: currentConfig.isConnected,
      apiVersion: currentConfig.apiVersion || '1.16.1',
      serverVersion: currentConfig.serverVersion || ''
    };
    setNavidromeConfig(newConfig);
    const refreshStats = refreshNavidromeSongCredentials();
    res.json({ success: true, config: sanitizeNavidromeConfig(newConfig), refreshStats });
  });

  // Test Navidrome connection
  router.post('/test', async (req: Request, res: Response) => {
    const navidromeConfig = getNavidromeConfig();
    const debugLogs: string[] = [];
    try {
      const serverUrl = String(req.body.serverUrl || navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
      const username = String(req.body.username || navidromeConfig.username || '').trim();
      const rawPassword = String(req.body.password || '');
      const password = (rawPassword === '••••••••' || rawPassword === '********' || !rawPassword)
        ? navidromeConfig.password
        : rawPassword;

      debugLogs.push(`[Navidrome Test Start] ServerUrl: "${serverUrl}", Username: "${username}", Password Provided: ${Boolean(password)}`);
      console.log(debugLogs[debugLogs.length - 1]);

      if (!serverUrl || !username) {
        return res.status(400).json({ success: false, message: '请提供完整的 Navidrome 服务器 URL 和用户名', debugLogs });
      }

      const tokenQuery = getSubsonicAuthQuery(username, password);
      const passQuery = getSubsonicPassAuthQuery(username, password);

      const candidateUrls = [
        `${serverUrl}/rest/ping?${passQuery}`,
        `${serverUrl}/rest/ping.view?${passQuery}`,
        `${serverUrl}/rest/ping?${tokenQuery}`,
        `${serverUrl}/rest/ping.view?${tokenQuery}`
      ];

      let subResp: any = null;
      let lastErr = '';

      for (const targetUrl of candidateUrls) {
        const sanitizedUrl = targetUrl.replace(/p=[^&]+/, 'p=******').replace(/t=[^&]+/, 't=******');
        debugLogs.push(`--> Fetching: ${sanitizedUrl}`);
        console.log(`[Navidrome Test] --> Fetching: ${sanitizedUrl}`);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(timeout);

          debugLogs.push(`    <-- Status: HTTP ${response.status} ${response.statusText}`);
          console.log(`[Navidrome Test] <-- Status: HTTP ${response.status}`);

          if (!response.ok) {
            lastErr = `HTTP ${response.status} ${response.statusText}`;
            continue;
          }

          const text = await response.text();
          let data: any = null;
          try {
            data = JSON.parse(text);
          } catch {
            debugLogs.push(`    [Warning] Response is not JSON, preview: ${text.slice(0, 100)}`);
          }

          const resp = data ? data['subsonic-response'] : null;
          if (resp && resp.status === 'ok') {
            subResp = resp;
            debugLogs.push(`    [Success] Subsonic ping responded status=ok, apiVersion=${resp.version}`);
            break;
          } else if (resp?.error?.message) {
            lastErr = resp.error.message;
            debugLogs.push(`    [Subsonic Error] Code: ${resp.error.code}, Message: ${resp.error.message}`);
          }
        } catch (err: any) {
          lastErr = err.message || '网络连接超时';
          debugLogs.push(`    [Exception] ${lastErr}`);
          console.warn(`[Navidrome Test] Fetch Exception: ${lastErr}`);
        }
      }

      if (subResp && subResp.status === 'ok') {
        const detectedApiVer = subResp.version || '1.16.1';
        const detectedServerVer = subResp.serverVersion || '';

        const updatedConfig = { 
          serverUrl, 
          username, 
          password, 
          isConnected: true, 
          apiVersion: detectedApiVer, 
          serverVersion: detectedServerVer 
        };
        setNavidromeConfig(updatedConfig);
        const refreshStats = refreshNavidromeSongCredentials();

        const refreshMsg = refreshStats.songsUpdated > 0 
          ? `，已同步更新 ${refreshStats.songsUpdated} 首已导入歌曲的播放凭据` 
          : '';

        return res.json({
          success: true,
          message: `成功连通 Navidrome 服务器！(检测到 API 协议版本: v${detectedApiVer})${refreshMsg}`,
          version: detectedServerVer,
          apiVersion: detectedApiVer,
          refreshStats,
          debugLogs
        });
      } else {
        const errDetail = lastErr || '身份鉴权失败，请核对用户名和密码';
        return res.json({ success: false, message: `Navidrome 拒绝连接: ${errDetail}`, debugLogs });
      }
    } catch (e: any) {
      debugLogs.push(`[Fatal Exception] ${e.message}`);
      console.error(`[Navidrome Test Fatal Error]`, e);
      return res.json({
        success: false,
        message: `网络连接异常: ${e.message || '请检查服务器地址与网络可达性'}`,
        debugLogs
      });
    }
  });

  // Sync Songs from Navidrome
  router.post('/sync', async (req: Request, res: Response) => {
    const navidromeConfig = getNavidromeConfig();
    try {
      const serverUrl = String(req.body.serverUrl || navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
      const username = String(req.body.username || navidromeConfig.username || '').trim();
      const rawPassword = String(req.body.password || '');
      const password = (rawPassword === '••••••••' || rawPassword === '********' || !rawPassword)
        ? navidromeConfig.password
        : rawPassword;

      if (!serverUrl || !username) {
        return res.status(400).json({ success: false, message: 'Navidrome 连接未配置' });
      }

      if (!password) {
        return res.status(400).json({ success: false, message: '请重新在上方填入 Navidrome 登录密码并保存' });
      }

      const tokenQuery = getSubsonicAuthQuery(username, password);
      const passQuery = getSubsonicPassAuthQuery(username, password);
      
      const queryUrls = [
        `${serverUrl}/rest/getRandomSongs?size=500&${passQuery}`,
        `${serverUrl}/rest/getRandomSongs.view?size=500&${passQuery}`,
        `${serverUrl}/rest/search3?query=&songCount=500&${passQuery}`,
        `${serverUrl}/rest/search3.view?query=&songCount=500&${passQuery}`,
        `${serverUrl}/rest/getRandomSongs?size=500&${tokenQuery}`,
        `${serverUrl}/rest/getRandomSongs.view?size=500&${tokenQuery}`,
        `${serverUrl}/rest/search3?query=&songCount=500&${tokenQuery}`,
        `${serverUrl}/rest/search3.view?query=&songCount=500&${tokenQuery}`
      ];

      let songList: any[] = [];
      let lastError = '';
      let activeAuthQuery = passQuery;

      for (const targetUrl of queryUrls) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(timeout);

          if (!response.ok) {
            lastError = `HTTP ${response.status}`;
            continue;
          }

          const data = await response.json().catch(() => null);
          const subResp = data ? data['subsonic-response'] : null;

          if (subResp && subResp.status === 'ok') {
            if (subResp.version) navidromeConfig.apiVersion = subResp.version;
            if (subResp.serverVersion) navidromeConfig.serverVersion = subResp.serverVersion;

            const raw = subResp?.randomSongs?.song || subResp?.searchResult3?.song || subResp?.searchResult?.song || subResp?.songs?.song || subResp?.song || [];
            const items = Array.isArray(raw) ? raw : (raw ? [raw] : []);
            if (items.length > 0) {
              songList = items;
              if (targetUrl.includes(tokenQuery)) {
                activeAuthQuery = tokenQuery;
              }
              break;
            }
          } else if (subResp?.error?.message) {
            lastError = subResp.error.message;
          }
        } catch (err: any) {
          lastError = err.message || '超时';
        }
      }

      if (!Array.isArray(songList) || songList.length === 0) {
        return res.json({ 
          success: false, 
          message: `Navidrome 未返回有效歌曲 (${lastError || '列表为空'})。请确认服务器中已扫描音乐文件，且账号具备访问权限。` 
        });
      }

      let importedCount = 0;
      const defaultCover = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

      const newNavidromeSongs = songList.map((item: any) => {
        const trackId = item.id || item.songId || item.key;
        const songId = `navidrome-${trackId}`;
        const streamUrl = `${serverUrl}/rest/stream?id=${encodeURIComponent(trackId)}&${activeAuthQuery}`;
        const coverArtId = item.coverArt || item.coverArtId || item.cover || trackId;
        const coverUrl = coverArtId 
          ? `${serverUrl}/rest/getCoverArt?id=${encodeURIComponent(coverArtId)}&${activeAuthQuery}`
          : defaultCover;

        return {
          id: songId,
          title: item.title || item.name || 'Navidrome Track',
          artist: item.artist || item.artistName || '未知歌手',
          album: item.album || item.albumName || 'Navidrome 音乐库',
          duration: Number(item.duration || 210),
          url: streamUrl,
          coverUrl: coverUrl,
          genre: item.genre || 'Navidrome',
          year: item.year || 2024,
          bitrate: item.bitRate ? `${item.bitRate}kbps ${item.suffix || 'mp3'}` : '320kbps mp3',
          fileSize: item.size ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : '12 MB',
          isFavorite: Boolean(item.starred || item.isFavorite),
          source: 'uploaded',
          lyrics: item.lyrics || `[00:00.00] ${item.title || 'Track'} - ${item.artist || 'Artist'}\n[00:05.00] 来自 Navidrome 远程曲库\n[00:12.00] 小爱音箱高保真串流中...`
        };
      }).filter((s: any) => Boolean(s.id));

      const storedSongs = getStoredSongs();
      newNavidromeSongs.forEach(newSong => {
        const idx = storedSongs.findIndex(s => s.id === newSong.id);
        if (idx >= 0) {
          storedSongs[idx] = newSong;
        } else {
          storedSongs.unshift(newSong);
          importedCount++;
        }
      });

      setStoredSongs(storedSongs);

      if (password && password !== '••••••••' && password !== '********') {
        const savedNavi = {
          serverUrl,
          username,
          password,
          isConnected: true,
          apiVersion: navidromeConfig.apiVersion || '1.16.1',
          serverVersion: navidromeConfig.serverVersion || ''
        };
        setNavidromeConfig(savedNavi);
        refreshNavidromeSongCredentials();
      }

      return res.json({
        success: true,
        count: importedCount > 0 ? importedCount : newNavidromeSongs.length,
        message: `已同步 Navidrome 曲库中的 ${newNavidromeSongs.length} 首歌曲！`
      });

    } catch (e: any) {
      return res.json({
        success: false,
        message: `Navidrome 同步异常: ${e.message || '网络连接超时'}`
      });
    }
  });

  // Fetch all Playlists from Navidrome
  router.all('/playlists', async (req: Request, res: Response) => {
    const navidromeConfig = getNavidromeConfig();
    const debugLogs: string[] = [];
    try {
      const serverUrl = String(req.body?.serverUrl || req.query?.serverUrl || navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
      const username = String(req.body?.username || req.query?.username || navidromeConfig.username || '').trim();
      const rawPassword = String(req.body?.password || req.query?.password || '');
      const password = (rawPassword === '••••••••' || rawPassword === '********' || !rawPassword)
        ? navidromeConfig.password
        : rawPassword;

      debugLogs.push(`[Navidrome Playlists Start] ServerUrl: "${serverUrl}", Username: "${username}", Password Provided: ${Boolean(password)}`);
      console.log(debugLogs[debugLogs.length - 1]);

      if (!serverUrl || !username) {
        return res.status(400).json({ success: false, message: '请先配置或提供 Navidrome 服务器地址与用户名', debugLogs });
      }

      if (password && (serverUrl !== navidromeConfig.serverUrl || username !== navidromeConfig.username || password !== navidromeConfig.password)) {
        const updatedConfig = {
          serverUrl,
          username,
          password,
          isConnected: true,
          apiVersion: navidromeConfig.apiVersion || '1.16.1',
          serverVersion: navidromeConfig.serverVersion || ''
        };
        setNavidromeConfig(updatedConfig);
      }

      const tokenQuery = getSubsonicAuthQuery(username, password);
      const passQuery = getSubsonicPassAuthQuery(username, password);

      const candidateUrls = [
        `${serverUrl}/rest/getPlaylists?${passQuery}`,
        `${serverUrl}/rest/getPlaylists.view?${passQuery}`,
        `${serverUrl}/rest/getPlaylists?${tokenQuery}`,
        `${serverUrl}/rest/getPlaylists.view?${tokenQuery}`,
        `${serverUrl}/rest/getPlaylists?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}&v=1.16.1&c=TingLanMusic&f=json`,
        `${serverUrl}/rest/getPlaylists.view?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}&v=1.16.1&c=TingLanMusic&f=json`
      ];

      let subResp: any = null;
      let rawItems: any[] = [];
      let lastErrorMsg = '';

      for (const targetUrl of candidateUrls) {
        const sanitizedUrl = targetUrl.replace(/p=[^&]+/, 'p=******').replace(/t=[^&]+/, 't=******');
        debugLogs.push(`--> Fetching: ${sanitizedUrl}`);
        console.log(`[Navidrome Playlists] --> Fetching: ${sanitizedUrl}`);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(targetUrl, { signal: controller.signal });
          clearTimeout(timeout);

          const textBody = await response.text().catch(() => '');
          debugLogs.push(`    <-- Status: HTTP ${response.status} ${response.statusText} | Body length: ${textBody.length}`);
          console.log(`[Navidrome Playlists] <-- Status: HTTP ${response.status} | Body preview: ${textBody.slice(0, 150)}`);

          if (!response.ok) {
            lastErrorMsg = `HTTP ${response.status} ${response.statusText}`;
            continue;
          }

          let data: any = null;
          try {
            data = JSON.parse(textBody);
          } catch (jsonErr: any) {
            debugLogs.push(`    [JSON Parse Error] ${jsonErr.message}`);
            console.warn(`[Navidrome Playlists] JSON Parse Error:`, jsonErr.message);
          }

          const resp = data ? data['subsonic-response'] : null;

          if (resp && resp.status === 'ok') {
            subResp = resp;
            if (resp.version) navidromeConfig.apiVersion = resp.version;
            if (resp.serverVersion) navidromeConfig.serverVersion = resp.serverVersion;

            const extracted = extractSubsonicPlaylists(resp);
            rawItems = extracted;
            debugLogs.push(`    [Success] Extracted ${extracted.length} playlist items`);
            break;
          } else if (resp?.error?.message) {
            lastErrorMsg = resp.error.message;
            debugLogs.push(`    [Subsonic Error] Code: ${resp.error.code}, Message: ${resp.error.message}`);
          } else if (data) {
            debugLogs.push(`    [Invalid Response] Response missing 'subsonic-response' key`);
          }
        } catch (err: any) {
          lastErrorMsg = err.message || '网络连接超时';
          debugLogs.push(`    [Exception] ${lastErrorMsg}`);
          console.warn(`[Navidrome Playlists] Fetch Exception: ${lastErrorMsg}`);
        }
      }

      if (!subResp && rawItems.length === 0) {
        return res.json({
          success: false,
          message: `无法拉取 Navidrome 歌单: ${lastErrorMsg || '网络连接超时或服务器无响应'}`,
          debugLogs
        });
      }

      const defaultCover = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

      const formattedPlaylists = rawItems.map((p: any) => {
        const coverArtId = p.coverArt || p.coverArtId || p.cover;
        const coverUrl = coverArtId 
          ? `${serverUrl}/rest/getCoverArt?id=${coverArtId}&${passQuery}`
          : defaultCover;

        return {
          id: String(p.id || p.playlistId || p.key || ''),
          name: p.name || p.title || '未命名歌单',
          comment: p.comment || p.description || '',
          songCount: Number(p.songCount || p.song_count || p.itemCount || (p.entry ? (Array.isArray(p.entry) ? p.entry.length : 1) : 0)),
          duration: Number(p.duration || 0),
          coverUrl,
          created: p.created || p.created_at,
          changed: p.changed || p.updated_at,
          owner: p.owner || username
        };
      }).filter((p: any) => Boolean(p.id));

      return res.json({
        success: true,
        count: formattedPlaylists.length,
        playlists: formattedPlaylists,
        message: formattedPlaylists.length > 0 
          ? `成功获取到 ${formattedPlaylists.length} 个 Navidrome 歌单` 
          : '未能获取到歌单，请确认 Navidrome 中已建立歌单并对该账号开放权限',
        debugLogs
      });

    } catch (e: any) {
      debugLogs.push(`[Fatal Exception] ${e.message}`);
      console.error(`[Navidrome Playlists Fatal Error]`, e);
      return res.json({
        success: false,
        message: `获取 Navidrome 歌单失败: ${e.message || '网络连接超时'}`,
        debugLogs
      });
    }
  });

  // Import Selected Playlists and their Songs from Navidrome
  router.post('/import-playlists', async (req: Request, res: Response) => {
    const navidromeConfig = getNavidromeConfig();
    try {
      const { playlistIds } = req.body;
      const serverUrl = String(req.body?.serverUrl || navidromeConfig.serverUrl || '').trim().replace(/\/+$/, '');
      const username = String(req.body?.username || navidromeConfig.username || '').trim();
      const rawPassword = String(req.body?.password || '');
      const password = (rawPassword === '••••••••' || rawPassword === '********' || !rawPassword)
        ? navidromeConfig.password
        : rawPassword;

      if (!Array.isArray(playlistIds) || playlistIds.length === 0) {
        return res.status(400).json({ success: false, message: '请选择至少一个要导入的歌单' });
      }

      if (!serverUrl || !username) {
        return res.status(400).json({ success: false, message: 'Navidrome 连接未配置' });
      }

      const tokenQuery = getSubsonicAuthQuery(username, password);
      const passQuery = getSubsonicPassAuthQuery(username, password);
      const defaultCover = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80';

      const storedSongs = getStoredSongs();
      const storedPlaylists = getStoredPlaylists();
      let totalSongsImported = 0;
      let totalPlaylistsImported = 0;

      for (const plId of playlistIds) {
        try {
          const candidateUrls = [
            `${serverUrl}/rest/getPlaylist?id=${encodeURIComponent(plId)}&${passQuery}`,
            `${serverUrl}/rest/getPlaylist.view?id=${encodeURIComponent(plId)}&${passQuery}`,
            `${serverUrl}/rest/getPlaylist?id=${encodeURIComponent(plId)}&${tokenQuery}`,
            `${serverUrl}/rest/getPlaylist.view?id=${encodeURIComponent(plId)}&${tokenQuery}`
          ];

          let naviPl: any = null;
          let activeAuthQuery = passQuery;

          for (const targetUrl of candidateUrls) {
            try {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const response = await fetch(targetUrl, { signal: controller.signal });
              clearTimeout(timeout);

              if (!response.ok) continue;

              const data = await response.json().catch(() => null);
              const subResp = data ? data['subsonic-response'] : null;
              if (subResp && subResp.status === 'ok' && subResp.playlist) {
                naviPl = subResp.playlist;
                if (targetUrl.includes(tokenQuery)) {
                  activeAuthQuery = tokenQuery;
                }
                break;
              }
            } catch (e) {
              // Continue to next candidate
            }
          }

          if (!naviPl) continue;

          const rawEntries = naviPl.entry || [];
          const entryArray = Array.isArray(rawEntries) ? rawEntries : (rawEntries ? [rawEntries] : []);
          const songIdList: string[] = [];

          for (const item of entryArray) {
            const songId = `navidrome-${item.id}`;
            songIdList.push(songId);

            const streamUrl = `${serverUrl}/rest/stream?id=${item.id}&${activeAuthQuery}`;
            const coverUrl = item.coverArt 
              ? `${serverUrl}/rest/getCoverArt?id=${item.coverArt}&${activeAuthQuery}`
              : defaultCover;

            const songObj = {
              id: songId,
              title: item.title || 'Navidrome Track',
              artist: item.artist || '未知歌手',
              album: item.album || naviPl.name || 'Navidrome 音乐库',
              duration: item.duration || 210,
              url: streamUrl,
              coverUrl: coverUrl,
              genre: item.genre || 'Navidrome',
              year: item.year || 2024,
              bitrate: `${item.bitRate || 320}kbps ${item.suffix || 'mp3'}`,
              fileSize: item.size ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : '12 MB',
              isFavorite: false,
              source: 'uploaded',
              lyrics: item.lyrics || `[00:00.00] ${item.title} - ${item.artist}\n[00:05.00] 来自 Navidrome 歌单《${naviPl.name}》\n[00:12.00] 小爱音箱高保真串流中...`
            };

            const existSongIdx = storedSongs.findIndex(s => s.id === songId);
            if (existSongIdx >= 0) {
              storedSongs[existSongIdx] = songObj;
            } else {
              storedSongs.unshift(songObj);
              totalSongsImported++;
            }
          }

          const plCoverUrl = naviPl.coverArt 
            ? `${serverUrl}/rest/getCoverArt?id=${naviPl.coverArt}&${activeAuthQuery}`
            : (entryArray[0]?.coverArt 
                ? `${serverUrl}/rest/getCoverArt?id=${entryArray[0].coverArt}&${activeAuthQuery}` 
                : defaultCover);

          const targetPlId = `navidrome-pl-${naviPl.id}`;
          const existingPlIdx = storedPlaylists.findIndex(p => p.id === targetPlId || p.name === naviPl.name);

          const playlistRecord = {
            id: targetPlId,
            name: naviPl.name || 'Navidrome 歌单',
            description: naviPl.comment || `从 Navidrome 导入 (${entryArray.length} 首)`,
            coverUrl: plCoverUrl,
            songIds: songIdList,
            createdAt: new Date().toISOString().split('T')[0]
          };

          if (existingPlIdx >= 0) {
            storedPlaylists[existingPlIdx] = playlistRecord;
          } else {
            storedPlaylists.push(playlistRecord);
          }
          totalPlaylistsImported++;

        } catch (err) {
          console.warn(`[Navidrome Import] Failed to import playlist ${plId}:`, err);
        }
      }

      setStoredSongs(storedSongs);
      setStoredPlaylists(storedPlaylists);

      const savedNavi = {
        serverUrl,
        username,
        password,
        isConnected: true,
        apiVersion: navidromeConfig.apiVersion || '1.16.1',
        serverVersion: navidromeConfig.serverVersion || ''
      };
      setNavidromeConfig(savedNavi);

      return res.json({
        success: true,
        importedPlaylistsCount: totalPlaylistsImported,
        importedSongsCount: totalSongsImported,
        playlists: storedPlaylists,
        message: `成功导入 ${totalPlaylistsImported} 个 Navidrome 歌单（共关联 ${totalSongsImported} 首歌曲）！`
      });

    } catch (e: any) {
      return res.json({
        success: false,
        message: `导入歌单异常: ${e.message || '网络连接超时'}`
      });
    }
  });

  return router;
}
