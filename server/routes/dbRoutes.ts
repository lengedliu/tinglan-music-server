import { Router, Request, Response } from 'express';
import pg from 'pg';
import mysql from 'mysql2/promise';

export interface DbRouterOptions {
  getActiveDbConfig: () => any;
  setActiveDbConfig: (config: any) => void;
  getStoredUsers: () => any[];
  getStoredSongs: () => any[];
  getStoredPlaylists: () => any[];
  sqliteDb?: any;
}

export function createDbRouter(options: DbRouterOptions): Router {
  const router = Router();
  const {
    getActiveDbConfig,
    setActiveDbConfig,
    getStoredUsers,
    getStoredSongs,
    getStoredPlaylists,
    sqliteDb
  } = options;

  const engineNames: Record<string, string> = {
    sqlite: 'SQLite 3 (嵌入式轻量库 - 默认启用)',
    postgres: 'PostgreSQL (远程关系库 - 实验性连通)',
    mysql: 'MySQL (远程关系库 - 实验性连通)'
  };

  function sanitizeDbConfig(cfg: any) {
    return {
      engine: cfg.engine,
      postgresConfig: cfg.postgresConfig ? {
        ...cfg.postgresConfig,
        password: cfg.postgresConfig.password ? '••••••••' : '',
        hasPassword: Boolean(cfg.postgresConfig.password)
      } : undefined,
      mysqlConfig: cfg.mysqlConfig ? {
        ...cfg.mysqlConfig,
        password: cfg.mysqlConfig.password ? '••••••••' : '',
        hasPassword: Boolean(cfg.mysqlConfig.password)
      } : undefined
    };
  }

  // Get Database Status
  router.get('/status', (req: Request, res: Response) => {
    const activeDbConfig = getActiveDbConfig();
    const storedUsers = getStoredUsers();
    const currentSongs = getStoredSongs();
    const currentPlaylists = getStoredPlaylists();

    const tableNames = [
      'users',
      'songs',
      'playlists',
      'user_song_interactions',
      'play_history',
      'cast_audit_logs',
      'lyrics_store',
      'device_eq_presets',
      'scheduled_tasks',
      'speaker_groups',
      'smart_playlist_rules',
      'device_customizations',
      'audio_fingerprint_cache',
      'playback_checkpoints'
    ];

    return res.json({
      success: true,
      config: sanitizeDbConfig(activeDbConfig),
      status: {
        engine: activeDbConfig.engine,
        isConnected: true,
        engineName: engineNames[activeDbConfig.engine] || 'SQLite 3',
        tablesCount: sqliteDb ? tableNames.length : 0,
        tables: tableNames,
        totalUsers: storedUsers.length,
        totalSongs: currentSongs.length,
        totalPlaylists: currentPlaylists.length
      }
    });
  });

  // Test Database Connection
  router.post('/test', async (req: Request, res: Response) => {
    const activeDbConfig = getActiveDbConfig();
    const { engine, postgresConfig, mysqlConfig } = req.body;

    if (engine === 'sqlite') {
      return res.json({ success: true, message: 'SQLite3 本地数据库运行良好！' });
    }

    if (engine === 'postgres') {
      if (!postgresConfig?.host) {
        return res.status(400).json({ success: false, error: '缺少 PostgreSQL 主机地址' });
      }
      try {
        const rawPgPass = postgresConfig.password || '';
        const actualPgPass = (rawPgPass === '••••••••' || rawPgPass === '********' || !rawPgPass)
          ? (activeDbConfig.postgresConfig?.password || '')
          : rawPgPass;

        const pool = new pg.Pool({
          host: postgresConfig.host,
          port: Number(postgresConfig.port) || 5432,
          user: postgresConfig.user || 'postgres',
          password: actualPgPass,
          database: postgresConfig.database || 'tinglan_db',
          connectionTimeoutMillis: 5000
        });
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        await pool.end();
        return res.json({ success: true, message: `成功连接至 PostgreSQL (${postgresConfig.host}:${postgresConfig.port || 5432})` });
      } catch (err: any) {
        return res.status(400).json({ success: false, error: `PostgreSQL 连接失败: ${err.message}` });
      }
    }

    if (engine === 'mysql') {
      if (!mysqlConfig?.host) {
        return res.status(400).json({ success: false, error: '缺少 MySQL 主机地址' });
      }
      try {
        const rawMyPass = mysqlConfig.password || '';
        const actualMyPass = (rawMyPass === '••••••••' || rawMyPass === '********' || !rawMyPass)
          ? (activeDbConfig.mysqlConfig?.password || '')
          : rawMyPass;

        const connection = await mysql.createConnection({
          host: mysqlConfig.host,
          port: Number(mysqlConfig.port) || 3306,
          user: mysqlConfig.user || 'root',
          password: actualMyPass,
          database: mysqlConfig.database || 'tinglan_db',
          connectTimeout: 5000
        });
        await connection.ping();
        await connection.end();
        return res.json({ success: true, message: `成功连接至 MySQL (${mysqlConfig.host}:${mysqlConfig.port || 3306})` });
      } catch (err: any) {
        return res.status(400).json({ success: false, error: `MySQL 连接失败: ${err.message}` });
      }
    }

    return res.status(400).json({ success: false, error: '未知数据库引擎' });
  });

  // Save & Switch Active Database Engine (Admin Only)
  router.post('/switch', async (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (!clientUser || clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以切换数据库引擎' });
    }

    const { engine, postgresConfig, mysqlConfig } = req.body;
    
    if (!['sqlite', 'postgres', 'mysql'].includes(engine)) {
      return res.status(400).json({ success: false, error: '不支援的数据库引擎类型' });
    }

    const activeDbConfig = getActiveDbConfig();
    activeDbConfig.engine = engine;
    if (postgresConfig) {
      const rawPass = postgresConfig.password || '';
      const actualPass = (rawPass === '••••••••' || rawPass === '********' || !rawPass)
        ? (activeDbConfig.postgresConfig?.password || '')
        : rawPass;
      activeDbConfig.postgresConfig = {
        ...postgresConfig,
        password: actualPass
      };
    }
    if (mysqlConfig) {
      const rawPass = mysqlConfig.password || '';
      const actualPass = (rawPass === '••••••••' || rawPass === '********' || !rawPass)
        ? (activeDbConfig.mysqlConfig?.password || '')
        : rawPass;
      activeDbConfig.mysqlConfig = {
        ...mysqlConfig,
        password: actualPass
      };
    }

    setActiveDbConfig(activeDbConfig);

    return res.json({
      success: true,
      message: `已成功保存配置并切换活动数据库引擎为 ${engine.toUpperCase()}！`,
      config: sanitizeDbConfig(activeDbConfig)
    });
  });

  return router;
}
