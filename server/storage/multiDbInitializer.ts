import pg from 'pg';
import mysql from 'mysql2/promise';
import { SqliteDatabaseWrapper } from './sqliteWrapper.js';

export interface DbConnectionConfig {
  engine: 'sqlite' | 'postgres' | 'mysql';
  postgresConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
  mysqlConfig?: {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
}

export const ALL_TABLE_NAMES = [
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
  'playback_checkpoints',
  'playback_resume_points',
  'device_strategy_profiles',
  'system_logs'
];

/**
 * PostgreSQL Schema DDLs
 */
const POSTGRES_DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    avatar_url TEXT,
    created_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS songs (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    album VARCHAR(255),
    duration INTEGER,
    url TEXT,
    cover_url TEXT,
    lyrics TEXT,
    genre VARCHAR(128),
    year INTEGER,
    bitrate VARCHAR(64),
    file_size VARCHAR(64),
    source VARCHAR(64),
    created_at VARCHAR(64)
  )`,
  `CREATE TABLE IF NOT EXISTS playlists (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_url TEXT,
    song_ids TEXT,
    created_at VARCHAR(64)
  )`,
  `CREATE TABLE IF NOT EXISTS user_song_interactions (
    user_id VARCHAR(64) NOT NULL,
    song_id VARCHAR(64) NOT NULL,
    is_favorite SMALLINT DEFAULT 0,
    rating INTEGER DEFAULT 0,
    play_count INTEGER DEFAULT 0,
    last_played_at VARCHAR(64),
    PRIMARY KEY (user_id, song_id)
  )`,
  `CREATE TABLE IF NOT EXISTS play_history (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    song_id VARCHAR(64) NOT NULL,
    song_title VARCHAR(255) NOT NULL,
    song_artist VARCHAR(255),
    device_did VARCHAR(64),
    device_name VARCHAR(128),
    duration_seconds INTEGER,
    played_seconds INTEGER,
    played_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cast_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp VARCHAR(64) NOT NULL,
    log_type VARCHAR(64) NOT NULL,
    device_did VARCHAR(64),
    device_name VARCHAR(128),
    song_title VARCHAR(255),
    status VARCHAR(64) NOT NULL,
    detail TEXT,
    latency_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS lyrics_store (
    song_id VARCHAR(64) PRIMARY KEY,
    raw_lrc TEXT,
    translated_lrc TEXT,
    time_offset_ms INTEGER DEFAULT 0,
    source VARCHAR(64),
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS device_eq_presets (
    id VARCHAR(64) PRIMARY KEY,
    device_did VARCHAR(64),
    user_id VARCHAR(64),
    preset_name VARCHAR(128) NOT NULL,
    bands_json TEXT NOT NULL,
    target_lufs REAL DEFAULT -16.0,
    bass_boost SMALLINT DEFAULT 0,
    spatial_audio SMALLINT DEFAULT 0,
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL,
    cron_expr VARCHAR(64),
    target_time VARCHAR(64),
    target_did VARCHAR(64) NOT NULL,
    target_device_name VARCHAR(128),
    playlist_id VARCHAR(64),
    song_id VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    volume INTEGER,
    fade_duration_seconds INTEGER DEFAULT 0,
    repeat_days VARCHAR(64),
    is_enabled SMALLINT DEFAULT 1,
    last_executed_at VARCHAR(64),
    next_run_at VARCHAR(64),
    tts_text TEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS speaker_groups (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    name VARCHAR(128) NOT NULL,
    member_dids_json TEXT NOT NULL,
    leader_did VARCHAR(64) NOT NULL,
    sync_strategy VARCHAR(64) DEFAULT 'mina_multicast',
    volume_offset_json TEXT,
    is_active SMALLINT DEFAULT 0,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS smart_playlist_rules (
    id VARCHAR(64) PRIMARY KEY,
    playlist_id VARCHAR(64) NOT NULL,
    rule_name VARCHAR(128) NOT NULL,
    condition_type VARCHAR(64) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    operator VARCHAR(32) NOT NULL,
    target_value TEXT NOT NULL,
    sort_by VARCHAR(64),
    sort_order VARCHAR(16) DEFAULT 'desc',
    limit_count INTEGER DEFAULT 50,
    auto_refresh SMALLINT DEFAULT 1,
    last_evaluated_at VARCHAR(64),
    created_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS device_customizations (
    device_did VARCHAR(64) PRIMARY KEY,
    custom_alias VARCHAR(128),
    room_name VARCHAR(128),
    preferred_voice VARCHAR(64),
    preferred_tts_speed REAL DEFAULT 1.0,
    preferred_volume INTEGER,
    auto_switch_source SMALLINT DEFAULT 1,
    night_mode_start VARCHAR(32),
    night_mode_end VARCHAR(32),
    night_volume_limit INTEGER,
    default_volume INTEGER DEFAULT 40,
    max_volume_limit INTEGER DEFAULT 100,
    default_eq_preset_id VARCHAR(64),
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audio_fingerprint_cache (
    song_id VARCHAR(64) PRIMARY KEY,
    fingerprint_hash VARCHAR(255),
    acoustid VARCHAR(128),
    musicbrainz_id VARCHAR(128),
    title VARCHAR(255),
    artist VARCHAR(255),
    album VARCHAR(255),
    cover_url TEXT,
    genre VARCHAR(128),
    year INTEGER,
    lyrics TEXT,
    matched_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS playback_checkpoints (
    id VARCHAR(64) PRIMARY KEY,
    device_did VARCHAR(64),
    user_id VARCHAR(64),
    song_id VARCHAR(64) NOT NULL,
    position_seconds REAL DEFAULT 0,
    duration_seconds REAL DEFAULT 0,
    queue_context_json TEXT,
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS playback_resume_points (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    song_id VARCHAR(64) NOT NULL,
    song_title VARCHAR(255),
    song_artist VARCHAR(255),
    song_cover_url TEXT,
    device_did VARCHAR(64),
    device_name VARCHAR(128),
    resume_position_seconds REAL DEFAULT 0,
    duration_seconds REAL DEFAULT 0,
    progress_percent REAL DEFAULT 0,
    is_completed SMALLINT DEFAULT 0,
    queue_context_json TEXT,
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS device_strategy_profiles (
    device_did VARCHAR(64) PRIMARY KEY,
    device_name VARCHAR(128),
    device_model VARCHAR(128) NOT NULL,
    preferred_protocol VARCHAR(64) NOT NULL,
    direct_stream_supported SMALLINT DEFAULT 0,
    best_mime_type VARCHAR(64) DEFAULT 'audio/mp3',
    transcode_profile VARCHAR(64),
    avg_latency_ms INTEGER DEFAULT 0,
    last_latency_ms INTEGER DEFAULT 0,
    success_rate_percent REAL DEFAULT 100.0,
    total_calls INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    fallback_count INTEGER DEFAULT 0,
    health_score INTEGER DEFAULT 100,
    last_error TEXT,
    last_success_at VARCHAR(64),
    updated_at VARCHAR(64) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    time_formatted VARCHAR(64) NOT NULL,
    category VARCHAR(64) NOT NULL,
    level VARCHAR(32) NOT NULL,
    trace_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    details_json TEXT,
    client_ip VARCHAR(64),
    target_did VARCHAR(64),
    device_name VARCHAR(128),
    song_id VARCHAR(64)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category)`,
  `CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)`,
  `CREATE INDEX IF NOT EXISTS idx_system_logs_trace_id ON system_logs(trace_id)`
];

/**
 * MySQL Schema DDLs
 */
const MYSQL_DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    avatar_url TEXT,
    created_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS songs (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    album VARCHAR(255),
    duration INT,
    url TEXT,
    cover_url TEXT,
    lyrics LONGTEXT,
    genre VARCHAR(128),
    year INT,
    bitrate VARCHAR(64),
    file_size VARCHAR(64),
    source VARCHAR(64),
    created_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS playlists (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cover_url TEXT,
    song_ids LONGTEXT,
    created_at VARCHAR(64)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS user_song_interactions (
    user_id VARCHAR(64) NOT NULL,
    song_id VARCHAR(64) NOT NULL,
    is_favorite TINYINT DEFAULT 0,
    rating INT DEFAULT 0,
    play_count INT DEFAULT 0,
    last_played_at VARCHAR(64),
    PRIMARY KEY (user_id, song_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS play_history (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    song_id VARCHAR(64) NOT NULL,
    song_title VARCHAR(255) NOT NULL,
    song_artist VARCHAR(255),
    device_did VARCHAR(64),
    device_name VARCHAR(128),
    duration_seconds INT,
    played_seconds INT,
    played_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS cast_audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp VARCHAR(64) NOT NULL,
    log_type VARCHAR(64) NOT NULL,
    device_did VARCHAR(64),
    device_name VARCHAR(128),
    song_title VARCHAR(255),
    status VARCHAR(64) NOT NULL,
    detail LONGTEXT,
    latency_ms INT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS lyrics_store (
    song_id VARCHAR(64) PRIMARY KEY,
    raw_lrc LONGTEXT,
    translated_lrc LONGTEXT,
    time_offset_ms INT DEFAULT 0,
    source VARCHAR(64),
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS device_eq_presets (
    id VARCHAR(64) PRIMARY KEY,
    device_did VARCHAR(64),
    user_id VARCHAR(64),
    preset_name VARCHAR(128) NOT NULL,
    bands_json LONGTEXT NOT NULL,
    target_lufs DOUBLE DEFAULT -16.0,
    bass_boost TINYINT DEFAULT 0,
    spatial_audio TINYINT DEFAULT 0,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL,
    cron_expr VARCHAR(64),
    target_time VARCHAR(64),
    target_did VARCHAR(64) NOT NULL,
    target_device_name VARCHAR(128),
    playlist_id VARCHAR(64),
    song_id VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    volume INT,
    fade_duration_seconds INT DEFAULT 0,
    repeat_days VARCHAR(64),
    is_enabled TINYINT DEFAULT 1,
    last_executed_at VARCHAR(64),
    next_run_at VARCHAR(64),
    tts_text LONGTEXT,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS speaker_groups (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    name VARCHAR(128) NOT NULL,
    member_dids_json LONGTEXT NOT NULL,
    leader_did VARCHAR(64) NOT NULL,
    sync_strategy VARCHAR(64) DEFAULT 'mina_multicast',
    volume_offset_json LONGTEXT,
    is_active TINYINT DEFAULT 0,
    created_at VARCHAR(64) NOT NULL,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS smart_playlist_rules (
    id VARCHAR(64) PRIMARY KEY,
    playlist_id VARCHAR(64) NOT NULL,
    rule_name VARCHAR(128) NOT NULL,
    condition_type VARCHAR(64) NOT NULL,
    field_name VARCHAR(64) NOT NULL,
    operator VARCHAR(32) NOT NULL,
    target_value LONGTEXT NOT NULL,
    sort_by VARCHAR(64),
    sort_order VARCHAR(16) DEFAULT 'desc',
    limit_count INT DEFAULT 50,
    auto_refresh TINYINT DEFAULT 1,
    last_evaluated_at VARCHAR(64),
    created_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS device_customizations (
    device_did VARCHAR(64) PRIMARY KEY,
    custom_alias VARCHAR(128),
    room_name VARCHAR(128),
    preferred_voice VARCHAR(64),
    preferred_tts_speed DOUBLE DEFAULT 1.0,
    preferred_volume INT,
    auto_switch_source TINYINT DEFAULT 1,
    night_mode_start VARCHAR(32),
    night_mode_end VARCHAR(32),
    night_volume_limit INT,
    default_volume INT DEFAULT 40,
    max_volume_limit INT DEFAULT 100,
    default_eq_preset_id VARCHAR(64),
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS audio_fingerprint_cache (
    song_id VARCHAR(64) PRIMARY KEY,
    fingerprint_hash VARCHAR(255),
    acoustid VARCHAR(128),
    musicbrainz_id VARCHAR(128),
    title VARCHAR(255),
    artist VARCHAR(255),
    album VARCHAR(255),
    cover_url TEXT,
    genre VARCHAR(128),
    year INT,
    lyrics LONGTEXT,
    matched_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS playback_checkpoints (
    id VARCHAR(64) PRIMARY KEY,
    device_did VARCHAR(64),
    user_id VARCHAR(64),
    song_id VARCHAR(64) NOT NULL,
    position_seconds DOUBLE DEFAULT 0,
    duration_seconds DOUBLE DEFAULT 0,
    queue_context_json LONGTEXT,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS playback_resume_points (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    song_id VARCHAR(64) NOT NULL,
    song_title VARCHAR(255),
    song_artist VARCHAR(255),
    song_cover_url TEXT,
    device_did VARCHAR(64),
    device_name VARCHAR(128),
    resume_position_seconds DOUBLE DEFAULT 0,
    duration_seconds DOUBLE DEFAULT 0,
    progress_percent DOUBLE DEFAULT 0,
    is_completed TINYINT DEFAULT 0,
    queue_context_json LONGTEXT,
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS device_strategy_profiles (
    device_did VARCHAR(64) PRIMARY KEY,
    device_name VARCHAR(128),
    device_model VARCHAR(128) NOT NULL,
    preferred_protocol VARCHAR(64) NOT NULL,
    direct_stream_supported TINYINT DEFAULT 0,
    best_mime_type VARCHAR(64) DEFAULT 'audio/mp3',
    transcode_profile VARCHAR(64),
    avg_latency_ms INT DEFAULT 0,
    last_latency_ms INT DEFAULT 0,
    success_rate_percent DOUBLE DEFAULT 100.0,
    total_calls INT DEFAULT 0,
    success_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    fallback_count INT DEFAULT 0,
    health_score INT DEFAULT 100,
    last_error LONGTEXT,
    last_success_at VARCHAR(64),
    updated_at VARCHAR(64) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS system_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    time_formatted VARCHAR(64) NOT NULL,
    category VARCHAR(64) NOT NULL,
    level VARCHAR(32) NOT NULL,
    trace_id VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    message LONGTEXT NOT NULL,
    details_json LONGTEXT,
    client_ip VARCHAR(64),
    target_did VARCHAR(64),
    device_name VARCHAR(128),
    song_id VARCHAR(64),
    INDEX idx_system_logs_timestamp (timestamp),
    INDEX idx_system_logs_category (category),
    INDEX idx_system_logs_level (level),
    INDEX idx_system_logs_trace_id (trace_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

/**
 * Initialize PostgreSQL Schema & Tables
 */
export async function bootstrapPostgresSchema(config: DbConnectionConfig['postgresConfig'], defaultAdminUser?: any): Promise<{ success: boolean; createdCount: number; message: string; tables: string[] }> {
  if (!config || !config.host) {
    throw new Error('未配置 PostgreSQL 连接参数 (Host 未指定)');
  }

  const targetDb = config.database || 'tinglan_db';

  // 1. Attempt auto-creation of target database if not exists by connecting to default 'postgres' database
  try {
    const adminPool = new pg.Pool({
      host: config.host,
      port: Number(config.port) || 5432,
      user: config.user || 'postgres',
      password: config.password || '',
      database: 'postgres',
      connectionTimeoutMillis: 5000
    });
    const adminClient = await adminPool.connect();
    try {
      const checkRes = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
      if (checkRes.rowCount === 0) {
        const escapedDb = targetDb.replace(/"/g, '""');
        await adminClient.query(`CREATE DATABASE "${escapedDb}" WITH ENCODING 'UTF8';`);
      }
    } finally {
      adminClient.release();
      await adminPool.end().catch(() => {});
    }
  } catch (adminErr: any) {
    // If connecting to 'postgres' fails or user lacks permission, proceed directly to targetDb
    console.warn('[Postgres Init] Notice auto-creating database:', adminErr?.message || adminErr);
  }

  // 2. Connect to target database and build 17 tables and indexes
  const pool = new pg.Pool({
    host: config.host,
    port: Number(config.port) || 5432,
    user: config.user || 'postgres',
    password: config.password || '',
    database: targetDb,
    connectionTimeoutMillis: 8000
  });

  const client = await pool.connect();
  try {
    for (const ddl of POSTGRES_DDL) {
      await client.query(ddl);
    }

    if (defaultAdminUser) {
      await client.query(`
        INSERT INTO users (id, username, email, password_hash, role, avatar_url, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO NOTHING
      `, [
        defaultAdminUser.id,
        defaultAdminUser.username,
        defaultAdminUser.email,
        defaultAdminUser.passwordHash || defaultAdminUser.password_hash,
        defaultAdminUser.role || 'admin',
        defaultAdminUser.avatarUrl || defaultAdminUser.avatar_url || '',
        defaultAdminUser.createdAt || defaultAdminUser.created_at || new Date().toISOString()
      ]);
    }

    // Inspect tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map((r: any) => r.table_name);

    return {
      success: true,
      createdCount: tables.length,
      tables,
      message: `PostgreSQL (${config.host}:${config.port || 5432}/${targetDb}) 17 张数据表结构与索引初始化完成！`
    };
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Initialize MySQL Schema & Tables
 */
export async function bootstrapMysqlSchema(config: DbConnectionConfig['mysqlConfig'], defaultAdminUser?: any): Promise<{ success: boolean; createdCount: number; message: string; tables: string[] }> {
  if (!config || !config.host) {
    throw new Error('未配置 MySQL 连接参数 (Host 未指定)');
  }

  const targetDb = config.database || 'tinglan_db';

  // 1. Connect without selecting database to ensure database exists or create it automatically
  try {
    const rootConn = await mysql.createConnection({
      host: config.host,
      port: Number(config.port) || 3306,
      user: config.user || 'root',
      password: config.password || '',
      connectTimeout: 6000
    });
    try {
      const escapedDb = targetDb.replace(/`/g, '``');
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${escapedDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    } finally {
      await rootConn.end().catch(() => {});
    }
  } catch (err: any) {
    console.warn('[MySQL Init] Notice auto-creating database:', err?.message || err);
  }

  // 2. Connect to target database and build 17 tables and indexes
  const connection = await mysql.createConnection({
    host: config.host,
    port: Number(config.port) || 3306,
    user: config.user || 'root',
    password: config.password || '',
    database: targetDb,
    connectTimeout: 8000,
    multipleStatements: true
  });

  try {
    for (const ddl of MYSQL_DDL) {
      await connection.query(ddl);
    }

    if (defaultAdminUser) {
      await connection.query(`
        INSERT IGNORE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        defaultAdminUser.id,
        defaultAdminUser.username,
        defaultAdminUser.email,
        defaultAdminUser.passwordHash || defaultAdminUser.password_hash,
        defaultAdminUser.role || 'admin',
        defaultAdminUser.avatarUrl || defaultAdminUser.avatar_url || '',
        defaultAdminUser.createdAt || defaultAdminUser.created_at || new Date().toISOString()
      ]);
    }

    // Inspect tables
    const [rows]: [any[], any] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?
    `, [targetDb]);
    const tables = rows.map((r: any) => r.table_name || r.TABLE_NAME);

    return {
      success: true,
      createdCount: tables.length,
      tables,
      message: `MySQL (${config.host}:${config.port || 3306}/${targetDb}) 17 张数据表结构与索引初始化完成！`
    };
  } finally {
    await connection.end();
  }
}

/**
 * Inspect Active Database Details
 */
export async function inspectDatabaseDetails(activeConfig: DbConnectionConfig, sqliteDb: any): Promise<{
  engine: string;
  isConnected: boolean;
  engineName: string;
  tablesCount: number;
  tables: string[];
  totalUsers: number;
  totalSongs: number;
  totalPlaylists: number;
  totalLogs?: number;
  detailsMessage?: string;
}> {
  const engine = activeConfig.engine || 'sqlite';

  if (engine === 'sqlite') {
    let usersCount = 0;
    let songsCount = 0;
    let playlistsCount = 0;
    let logsCount = 0;
    let tables: string[] = ALL_TABLE_NAMES;

    if (sqliteDb) {
      try {
        const u = sqliteDb.get('SELECT COUNT(*) as c FROM users');
        usersCount = u?.c || 0;
        const s = sqliteDb.get('SELECT COUNT(*) as c FROM songs');
        songsCount = s?.c || 0;
        const p = sqliteDb.get('SELECT COUNT(*) as c FROM playlists');
        playlistsCount = p?.c || 0;
        const l = sqliteDb.get('SELECT COUNT(*) as c FROM system_logs');
        logsCount = l?.c || 0;

        const tableRows = sqliteDb.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        if (tableRows && tableRows.length > 0) {
          tables = tableRows.map((r: any) => r.name);
        }
      } catch (err) {
        console.warn('SQLite inspection error:', err);
      }
    }

    return {
      engine: 'sqlite',
      isConnected: Boolean(sqliteDb),
      engineName: 'SQLite 3 (嵌入式轻量库 - 本地零配置)',
      tablesCount: tables.length,
      tables,
      totalUsers: usersCount,
      totalSongs: songsCount,
      totalPlaylists: playlistsCount,
      totalLogs: logsCount,
      detailsMessage: `SQLite3 引擎就绪，包含 ${tables.length} 张业务与日志表。`
    };
  }

  if (engine === 'postgres') {
    const pgCfg = activeConfig.postgresConfig;
    if (!pgCfg || !pgCfg.host) {
      return {
        engine: 'postgres',
        isConnected: false,
        engineName: 'PostgreSQL (远程关系库)',
        tablesCount: 0,
        tables: [],
        totalUsers: 0,
        totalSongs: 0,
        totalPlaylists: 0,
        detailsMessage: '尚未配置 PostgreSQL 主机地址'
      };
    }

    const pool = new pg.Pool({
      host: pgCfg.host,
      port: Number(pgCfg.port) || 5432,
      user: pgCfg.user || 'postgres',
      password: pgCfg.password || '',
      database: pgCfg.database || 'tinglan_db',
      connectionTimeoutMillis: 5000
    });

    try {
      const client = await pool.connect();
      try {
        const tRes = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        const tables = tRes.rows.map((r: any) => r.table_name);

        let usersCount = 0;
        let songsCount = 0;
        let playlistsCount = 0;
        let logsCount = 0;

        if (tables.includes('users')) {
          const r = await client.query('SELECT COUNT(*) as c FROM users');
          usersCount = Number(r.rows[0]?.c) || 0;
        }
        if (tables.includes('songs')) {
          const r = await client.query('SELECT COUNT(*) as c FROM songs');
          songsCount = Number(r.rows[0]?.c) || 0;
        }
        if (tables.includes('playlists')) {
          const r = await client.query('SELECT COUNT(*) as c FROM playlists');
          playlistsCount = Number(r.rows[0]?.c) || 0;
        }
        if (tables.includes('system_logs')) {
          const r = await client.query('SELECT COUNT(*) as c FROM system_logs');
          logsCount = Number(r.rows[0]?.c) || 0;
        }

        return {
          engine: 'postgres',
          isConnected: true,
          engineName: `PostgreSQL (${pgCfg.host}:${pgCfg.port || 5432}/${pgCfg.database || 'tinglan_db'})`,
          tablesCount: tables.length,
          tables,
          totalUsers: usersCount,
          totalSongs: songsCount,
          totalPlaylists: playlistsCount,
          totalLogs: logsCount,
          detailsMessage: `已连通 PostgreSQL，检测到 ${tables.length} 张数据表。`
        };
      } finally {
        client.release();
      }
    } catch (err: any) {
      if (String(err.message).toLowerCase().includes('does not exist')) {
        try {
          const testPool = new pg.Pool({
            host: pgCfg.host,
            port: Number(pgCfg.port) || 5432,
            user: pgCfg.user || 'postgres',
            password: pgCfg.password || '',
            database: 'postgres',
            connectionTimeoutMillis: 5000
          });
          const testClient = await testPool.connect();
          testClient.release();
          await testPool.end().catch(() => {});
          return {
            engine: 'postgres',
            isConnected: true,
            engineName: `PostgreSQL (${pgCfg.host}:${pgCfg.port || 5432}) - 待建库`,
            tablesCount: 0,
            tables: [],
            totalUsers: 0,
            totalSongs: 0,
            totalPlaylists: 0,
            detailsMessage: `已连通 PostgreSQL 服务端！目标数据库「${pgCfg.database || 'tinglan_db'}」尚未创建。点击下方「初始化 17 张数据表」将全自动为您建库建表。`
          };
        } catch {}
      }

      return {
        engine: 'postgres',
        isConnected: false,
        engineName: 'PostgreSQL (连接异常)',
        tablesCount: 0,
        tables: [],
        totalUsers: 0,
        totalSongs: 0,
        totalPlaylists: 0,
        detailsMessage: `连接失败: ${err.message}`
      };
    } finally {
      await pool.end().catch(() => {});
    }
  }

  if (engine === 'mysql') {
    const myCfg = activeConfig.mysqlConfig;
    if (!myCfg || !myCfg.host) {
      return {
        engine: 'mysql',
        isConnected: false,
        engineName: 'MySQL (远程关系库)',
        tablesCount: 0,
        tables: [],
        totalUsers: 0,
        totalSongs: 0,
        totalPlaylists: 0,
        detailsMessage: '尚未配置 MySQL 主机地址'
      };
    }

    try {
      const conn = await mysql.createConnection({
        host: myCfg.host,
        port: Number(myCfg.port) || 3306,
        user: myCfg.user || 'root',
        password: myCfg.password || '',
        database: myCfg.database || 'tinglan_db',
        connectTimeout: 5000
      });

      try {
        const [rows]: [any[], any] = await conn.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = ?
        `, [myCfg.database || 'tinglan_db']);
        const tables = rows.map((r: any) => r.table_name || r.TABLE_NAME);

        let usersCount = 0;
        let songsCount = 0;
        let playlistsCount = 0;
        let logsCount = 0;

        if (tables.includes('users')) {
          const [u]: [any[], any] = await conn.query('SELECT COUNT(*) as c FROM users');
          usersCount = Number(u[0]?.c) || 0;
        }
        if (tables.includes('songs')) {
          const [s]: [any[], any] = await conn.query('SELECT COUNT(*) as c FROM songs');
          songsCount = Number(s[0]?.c) || 0;
        }
        if (tables.includes('playlists')) {
          const [p]: [any[], any] = await conn.query('SELECT COUNT(*) as c FROM playlists');
          playlistsCount = Number(p[0]?.c) || 0;
        }
        if (tables.includes('system_logs')) {
          const [l]: [any[], any] = await conn.query('SELECT COUNT(*) as c FROM system_logs');
          logsCount = Number(l[0]?.c) || 0;
        }

        return {
          engine: 'mysql',
          isConnected: true,
          engineName: `MySQL (${myCfg.host}:${myCfg.port || 3306}/${myCfg.database || 'tinglan_db'})`,
          tablesCount: tables.length,
          tables,
          totalUsers: usersCount,
          totalSongs: songsCount,
          totalPlaylists: playlistsCount,
          totalLogs: logsCount,
          detailsMessage: `已连通 MySQL，检测到 ${tables.length} 张数据表。`
        };
      } finally {
        await conn.end();
      }
    } catch (err: any) {
      if (err.code === 'ER_BAD_DB_ERROR' || String(err.message).toLowerCase().includes('unknown database')) {
        try {
          const testConn = await mysql.createConnection({
            host: myCfg.host,
            port: Number(myCfg.port) || 3306,
            user: myCfg.user || 'root',
            password: myCfg.password || '',
            connectTimeout: 5000
          });
          await testConn.end().catch(() => {});
          return {
            engine: 'mysql',
            isConnected: true,
            engineName: `MySQL (${myCfg.host}:${myCfg.port || 3306}) - 待建库`,
            tablesCount: 0,
            tables: [],
            totalUsers: 0,
            totalSongs: 0,
            totalPlaylists: 0,
            detailsMessage: `已连通 MySQL 服务端！目标数据库「${myCfg.database || 'tinglan_db'}」尚未创建。点击下方「初始化 17 张数据表」将全自动为您建库建表。`
          };
        } catch {}
      }

      return {
        engine: 'mysql',
        isConnected: false,
        engineName: 'MySQL (连接异常)',
        tablesCount: 0,
        tables: [],
        totalUsers: 0,
        totalSongs: 0,
        totalPlaylists: 0,
        detailsMessage: `连接失败: ${err.message}`
      };
    }
  }

  return {
    engine: 'sqlite',
    isConnected: true,
    engineName: 'SQLite 3',
    tablesCount: 17,
    tables: ALL_TABLE_NAMES,
    totalUsers: 0,
    totalSongs: 0,
    totalPlaylists: 0
  };
}
