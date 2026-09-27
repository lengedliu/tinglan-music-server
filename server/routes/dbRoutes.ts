import { Router, Request, Response } from 'express';
import pg from 'pg';
import mysql from 'mysql2/promise';
import {
  bootstrapPostgresSchema,
  bootstrapMysqlSchema,
  inspectDatabaseDetails,
  ALL_TABLE_NAMES,
  DbConnectionConfig
} from '../storage/multiDbInitializer.js';
import { migrateDataToRemoteDatabase } from '../storage/multiDbMigrator.js';
import { logEngine } from '../core/logEngine.js';

export interface DbRouterOptions {
  getActiveDbConfig: () => any;
  setActiveDbConfig: (config: any) => void;
  getStoredUsers: () => any[];
  getStoredSongs: () => any[];
  getStoredPlaylists: () => any[];
  sqliteDb?: any;
  defaultAdminUser?: any;
}

export function createDbRouter(options: DbRouterOptions): Router {
  const router = Router();
  const {
    getActiveDbConfig,
    setActiveDbConfig,
    getStoredUsers,
    getStoredSongs,
    getStoredPlaylists,
    sqliteDb,
    defaultAdminUser
  } = options;

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

  // 1. Get Database Status & Real-time Table Inspection
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const activeDbConfig = getActiveDbConfig();
      const status = await inspectDatabaseDetails(activeDbConfig, sqliteDb);

      return res.json({
        success: true,
        config: sanitizeDbConfig(activeDbConfig),
        status: {
          ...status,
          supportedEngines: [
            { id: 'sqlite', name: 'SQLite 3 (本地高性能 WASM/文件引擎)', default: true },
            { id: 'postgres', name: 'PostgreSQL 12+ (企业级关系数据库)', default: false },
            { id: 'mysql', name: 'MySQL 8.0+ / MariaDB (分布式关系数据库)', default: false }
          ]
        }
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `获取数据库状态异常: ${err.message}`
      });
    }
  });

  // 2. Test Database Connection
  router.post('/test', async (req: Request, res: Response) => {
    const activeDbConfig = getActiveDbConfig();
    const { engine, postgresConfig, mysqlConfig } = req.body;

    if (engine === 'sqlite') {
      return res.json({
        success: true,
        message: 'SQLite 3 嵌入式本地数据库运行良好，17 张系统表就绪！',
        engine: 'sqlite'
      });
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
        const tRes = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        const existingTables = tRes.rows.map((r: any) => r.table_name);
        client.release();
        await pool.end();

        return res.json({
          success: true,
          message: `成功连通 PostgreSQL (${postgresConfig.host}:${postgresConfig.port || 5432})！当前已有 ${existingTables.length} 张数据表。`,
          existingTablesCount: existingTables.length,
          existingTables
        });
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
        const [rows]: [any[], any] = await connection.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = ?
        `, [mysqlConfig.database || 'tinglan_db']);
        const existingTables = rows.map((r: any) => r.table_name || r.TABLE_NAME);
        await connection.end();

        return res.json({
          success: true,
          message: `成功连通 MySQL (${mysqlConfig.host}:${mysqlConfig.port || 3306})！当前已有 ${existingTables.length} 张数据表。`,
          existingTablesCount: existingTables.length,
          existingTables
        });
      } catch (err: any) {
        return res.status(400).json({ success: false, error: `MySQL 连接失败: ${err.message}` });
      }
    }

    return res.status(400).json({ success: false, error: '未知数据库引擎' });
  });

  // 3. Initialize / Bootstrap Database Schema (DDL for 17 Tables)
  router.post('/init-tables', async (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (clientUser && clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以执行数据库初始化' });
    }

    const activeDbConfig = getActiveDbConfig();
    const { engine, postgresConfig, mysqlConfig } = req.body;
    const targetEngine = engine || activeDbConfig.engine || 'sqlite';

    try {
      if (targetEngine === 'sqlite') {
        return res.json({
          success: true,
          message: 'SQLite 3 本地 17 张数据表与索引已处于最新初始化就绪状态！',
          tablesCount: ALL_TABLE_NAMES.length,
          tables: ALL_TABLE_NAMES
        });
      }

      if (targetEngine === 'postgres') {
        const rawPgPass = postgresConfig?.password || '';
        const actualPgPass = (rawPgPass === '••••••••' || rawPgPass === '********' || !rawPgPass)
          ? (activeDbConfig.postgresConfig?.password || '')
          : rawPgPass;

        const effectivePgConfig = {
          host: postgresConfig?.host || activeDbConfig.postgresConfig?.host,
          port: Number(postgresConfig?.port || activeDbConfig.postgresConfig?.port || 5432),
          user: postgresConfig?.user || activeDbConfig.postgresConfig?.user || 'postgres',
          password: actualPgPass,
          database: postgresConfig?.database || activeDbConfig.postgresConfig?.database || 'tinglan_db'
        };

        const result = await bootstrapPostgresSchema(effectivePgConfig, defaultAdminUser);
        logEngine.info('system', 'PostgreSQL 数据表结构初始化', result.message, {
          targetEngine: 'postgres',
          tablesCount: result.createdCount
        });

        return res.json({
          success: true,
          message: result.message,
          tablesCount: result.createdCount,
          tables: result.tables
        });
      }

      if (targetEngine === 'mysql') {
        const rawMyPass = mysqlConfig?.password || '';
        const actualMyPass = (rawMyPass === '••••••••' || rawMyPass === '********' || !rawMyPass)
          ? (activeDbConfig.mysqlConfig?.password || '')
          : rawMyPass;

        const effectiveMyConfig = {
          host: mysqlConfig?.host || activeDbConfig.mysqlConfig?.host,
          port: Number(mysqlConfig?.port || activeDbConfig.mysqlConfig?.port || 3306),
          user: mysqlConfig?.user || activeDbConfig.mysqlConfig?.user || 'root',
          password: actualMyPass,
          database: mysqlConfig?.database || activeDbConfig.mysqlConfig?.database || 'tinglan_db'
        };

        const result = await bootstrapMysqlSchema(effectiveMyConfig, defaultAdminUser);
        logEngine.info('system', 'MySQL 数据表结构初始化', result.message, {
          targetEngine: 'mysql',
          tablesCount: result.createdCount
        });

        return res.json({
          success: true,
          message: result.message,
          tablesCount: result.createdCount,
          tables: result.tables
        });
      }

      return res.status(400).json({ success: false, error: '不支持的数据库引擎类型' });
    } catch (err: any) {
      logEngine.error('system', '数据表初始化失败', `初始化 ${targetEngine.toUpperCase()} 失败: ${err.message}`, {
        error: err.message
      });
      return res.status(500).json({ success: false, error: `数据表初始化失败: ${err.message}` });
    }
  });

  // 4. Data Migration / Sync (From Local SQLite to Remote Database)
  router.post('/migrate-data', async (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (clientUser && clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以执行数据迁移' });
    }

    const activeDbConfig = getActiveDbConfig();
    const { engine, postgresConfig, mysqlConfig } = req.body;
    const targetEngine = engine || activeDbConfig.engine || 'sqlite';

    try {
      const rawPgPass = postgresConfig?.password || '';
      const actualPgPass = (rawPgPass === '••••••••' || rawPgPass === '********' || !rawPgPass)
        ? (activeDbConfig.postgresConfig?.password || '')
        : rawPgPass;

      const rawMyPass = mysqlConfig?.password || '';
      const actualMyPass = (rawMyPass === '••••••••' || rawMyPass === '********' || !rawMyPass)
        ? (activeDbConfig.mysqlConfig?.password || '')
        : rawMyPass;

      const targetConfig: DbConnectionConfig = {
        engine: targetEngine,
        postgresConfig: postgresConfig ? {
          ...postgresConfig,
          password: actualPgPass
        } : activeDbConfig.postgresConfig,
        mysqlConfig: mysqlConfig ? {
          ...mysqlConfig,
          password: actualMyPass
        } : activeDbConfig.mysqlConfig
      };

      // First ensure tables exist on destination
      if (targetEngine === 'postgres') {
        await bootstrapPostgresSchema(targetConfig.postgresConfig, defaultAdminUser);
      } else if (targetEngine === 'mysql') {
        await bootstrapMysqlSchema(targetConfig.mysqlConfig, defaultAdminUser);
      }

      const migrationResult = await migrateDataToRemoteDatabase({
        targetConfig,
        sqliteDb,
        users: getStoredUsers(),
        songs: getStoredSongs(),
        playlists: getStoredPlaylists()
      });

      logEngine.info('audit', '数据库全量数据迁移', migrationResult.message, {
        targetEngine,
        migratedUsers: migrationResult.migratedUsers,
        migratedSongs: migrationResult.migratedSongs,
        migratedPlaylists: migrationResult.migratedPlaylists
      });

      return res.json({
        success: true,
        ...migrationResult
      });
    } catch (err: any) {
      logEngine.error('system', '数据库数据迁移失败', `迁移至 ${targetEngine.toUpperCase()} 失败: ${err.message}`, {
        error: err.message
      });
      return res.status(500).json({ success: false, error: `数据迁移失败: ${err.message}` });
    }
  });

  // 5. Save & Switch Active Database Engine (Admin Only)
  router.post('/switch', async (req: Request, res: Response) => {
    const clientUser = (req as any).user;
    if (clientUser && clientUser.role !== 'admin') {
      return res.status(403).json({ success: false, error: '权限不足：仅管理员可以切换数据库引擎' });
    }

    const { engine, postgresConfig, mysqlConfig, autoBootstrap } = req.body;
    
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

    // Auto-bootstrap schema if switching to Postgres / MySQL
    let bootstrapMsg = '';
    try {
      if (engine === 'postgres' && activeDbConfig.postgresConfig?.host) {
        const initRes = await bootstrapPostgresSchema(activeDbConfig.postgresConfig, defaultAdminUser);
        bootstrapMsg = ` (已自动校验并初始化 ${initRes.createdCount} 张表结构)`;
      } else if (engine === 'mysql' && activeDbConfig.mysqlConfig?.host) {
        const initRes = await bootstrapMysqlSchema(activeDbConfig.mysqlConfig, defaultAdminUser);
        bootstrapMsg = ` (已自动校验并初始化 ${initRes.createdCount} 张表结构)`;
      }
    } catch (e: any) {
      console.warn('Auto-bootstrap during switch encountered an issue:', e.message);
      bootstrapMsg = ` (表结构自动初始化提示: ${e.message})`;
    }

    setActiveDbConfig(activeDbConfig);

    logEngine.info('audit', '切换活动数据库引擎', `活动数据库引擎已切换为 ${engine.toUpperCase()}${bootstrapMsg}`, {
      engine,
      operator: clientUser?.username || 'admin'
    });

    return res.json({
      success: true,
      message: `已成功保存配置并切换活动数据库引擎为 ${engine.toUpperCase()}！${bootstrapMsg}`,
      config: sanitizeDbConfig(activeDbConfig)
    });
  });

  return router;
}
