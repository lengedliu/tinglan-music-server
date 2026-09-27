import pg from 'pg';
import mysql from 'mysql2/promise';
import { DbConnectionConfig } from './multiDbInitializer.js';

export interface MigrationOptions {
  targetConfig: DbConnectionConfig;
  sqliteDb: any;
  users: any[];
  songs: any[];
  playlists: any[];
}

export async function migrateDataToRemoteDatabase(options: MigrationOptions): Promise<{
  success: boolean;
  migratedUsers: number;
  migratedSongs: number;
  migratedPlaylists: number;
  migratedLogs: number;
  message: string;
}> {
  const { targetConfig, sqliteDb, users, songs, playlists } = options;
  const engine = targetConfig.engine;

  let logs: any[] = [];
  if (sqliteDb) {
    try {
      logs = sqliteDb.all('SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 1000') || [];
    } catch (e) {
      console.warn('Could not read sqlite system_logs for migration:', e);
    }
  }

  if (engine === 'postgres') {
    const pgCfg = targetConfig.postgresConfig;
    if (!pgCfg || !pgCfg.host) {
      throw new Error('PostgreSQL 主机未配置');
    }

    const pool = new pg.Pool({
      host: pgCfg.host,
      port: Number(pgCfg.port) || 5432,
      user: pgCfg.user || 'postgres',
      password: pgCfg.password || '',
      database: pgCfg.database || 'tinglan_db',
      connectionTimeoutMillis: 8000
    });

    const client = await pool.connect();
    try {
      let uCount = 0;
      let sCount = 0;
      let pCount = 0;
      let lCount = 0;

      // Migrate users
      for (const u of users) {
        await client.query(`
          INSERT INTO users (id, username, email, password_hash, role, avatar_url, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            avatar_url = EXCLUDED.avatar_url
        `, [
          u.id,
          u.username,
          u.email,
          u.passwordHash || u.password_hash || '',
          u.role || 'user',
          u.avatarUrl || u.avatar_url || '',
          u.createdAt || u.created_at || new Date().toISOString()
        ]);
        uCount++;
      }

      // Migrate songs
      for (const s of songs) {
        await client.query(`
          INSERT INTO songs (id, title, artist, album, duration, url, cover_url, lyrics, genre, year, bitrate, file_size, source, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            artist = EXCLUDED.artist,
            album = EXCLUDED.album,
            duration = EXCLUDED.duration,
            url = EXCLUDED.url,
            cover_url = EXCLUDED.cover_url,
            lyrics = EXCLUDED.lyrics,
            genre = EXCLUDED.genre,
            year = EXCLUDED.year,
            bitrate = EXCLUDED.bitrate,
            file_size = EXCLUDED.file_size
        `, [
          s.id,
          s.title,
          s.artist || '',
          s.album || '',
          s.duration || 0,
          s.url || '',
          s.coverUrl || s.cover_url || '',
          s.lyrics || '',
          s.genre || '',
          s.year || 0,
          s.bitrate || '',
          s.fileSize || s.file_size || '',
          s.source || 'local',
          s.createdAt || s.created_at || new Date().toISOString()
        ]);
        sCount++;
      }

      // Migrate playlists
      for (const p of playlists) {
        const songIdsStr = Array.isArray(p.songIds) ? JSON.stringify(p.songIds) : (typeof p.song_ids === 'string' ? p.song_ids : '[]');
        await client.query(`
          INSERT INTO playlists (id, user_id, name, description, cover_url, song_ids, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            cover_url = EXCLUDED.cover_url,
            song_ids = EXCLUDED.song_ids
        `, [
          p.id,
          p.userId || p.user_id || '',
          p.name,
          p.description || '',
          p.coverUrl || p.cover_url || '',
          songIdsStr,
          p.createdAt || p.created_at || new Date().toISOString()
        ]);
        pCount++;
      }

      // Migrate logs
      for (const log of logs) {
        await client.query(`
          INSERT INTO system_logs (id, timestamp, time_formatted, category, level, trace_id, title, message, details_json, client_ip, target_did, device_name, song_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO NOTHING
        `, [
          log.id,
          log.timestamp,
          log.time_formatted || log.timeFormatted || '',
          log.category || 'system',
          log.level || 'info',
          log.trace_id || log.traceId || '',
          log.title || '',
          log.message || '',
          log.details_json || (log.details ? JSON.stringify(log.details) : null),
          log.client_ip || log.clientIp || '',
          log.target_did || log.targetDid || '',
          log.device_name || log.deviceName || '',
          log.song_id || log.songId || ''
        ]);
        lCount++;
      }

      return {
        success: true,
        migratedUsers: uCount,
        migratedSongs: sCount,
        migratedPlaylists: pCount,
        migratedLogs: lCount,
        message: `成功同步 ${uCount} 位用户、${sCount} 首曲目、${pCount} 个歌单及 ${lCount} 条日志至 PostgreSQL！`
      };
    } finally {
      client.release();
      await pool.end();
    }
  }

  if (engine === 'mysql') {
    const myCfg = targetConfig.mysqlConfig;
    if (!myCfg || !myCfg.host) {
      throw new Error('MySQL 主机未配置');
    }

    const conn = await mysql.createConnection({
      host: myCfg.host,
      port: Number(myCfg.port) || 3306,
      user: myCfg.user || 'root',
      password: myCfg.password || '',
      database: myCfg.database || 'tinglan_db',
      connectTimeout: 8000
    });

    try {
      let uCount = 0;
      let sCount = 0;
      let pCount = 0;
      let lCount = 0;

      // Migrate users
      for (const u of users) {
        await conn.query(`
          INSERT INTO users (id, username, email, password_hash, role, avatar_url, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            email = VALUES(email),
            password_hash = VALUES(password_hash),
            role = VALUES(role),
            avatar_url = VALUES(avatar_url)
        `, [
          u.id,
          u.username,
          u.email,
          u.passwordHash || u.password_hash || '',
          u.role || 'user',
          u.avatarUrl || u.avatar_url || '',
          u.createdAt || u.created_at || new Date().toISOString()
        ]);
        uCount++;
      }

      // Migrate songs
      for (const s of songs) {
        await conn.query(`
          INSERT INTO songs (id, title, artist, album, duration, url, cover_url, lyrics, genre, year, bitrate, file_size, source, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            artist = VALUES(artist),
            album = VALUES(album),
            duration = VALUES(duration),
            url = VALUES(url),
            cover_url = VALUES(cover_url),
            lyrics = VALUES(lyrics),
            genre = VALUES(genre),
            year = VALUES(year),
            bitrate = VALUES(bitrate),
            file_size = VALUES(file_size)
        `, [
          s.id,
          s.title,
          s.artist || '',
          s.album || '',
          s.duration || 0,
          s.url || '',
          s.coverUrl || s.cover_url || '',
          s.lyrics || '',
          s.genre || '',
          s.year || 0,
          s.bitrate || '',
          s.fileSize || s.file_size || '',
          s.source || 'local',
          s.createdAt || s.created_at || new Date().toISOString()
        ]);
        sCount++;
      }

      // Migrate playlists
      for (const p of playlists) {
        const songIdsStr = Array.isArray(p.songIds) ? JSON.stringify(p.songIds) : (typeof p.song_ids === 'string' ? p.song_ids : '[]');
        await conn.query(`
          INSERT INTO playlists (id, user_id, name, description, cover_url, song_ids, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            description = VALUES(description),
            cover_url = VALUES(cover_url),
            song_ids = VALUES(song_ids)
        `, [
          p.id,
          p.userId || p.user_id || '',
          p.name,
          p.description || '',
          p.coverUrl || p.cover_url || '',
          songIdsStr,
          p.createdAt || p.created_at || new Date().toISOString()
        ]);
        pCount++;
      }

      // Migrate logs
      for (const log of logs) {
        await conn.query(`
          INSERT IGNORE INTO system_logs (id, timestamp, time_formatted, category, level, trace_id, title, message, details_json, client_ip, target_did, device_name, song_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          log.id,
          log.timestamp,
          log.time_formatted || log.timeFormatted || '',
          log.category || 'system',
          log.level || 'info',
          log.trace_id || log.traceId || '',
          log.title || '',
          log.message || '',
          log.details_json || (log.details ? JSON.stringify(log.details) : null),
          log.client_ip || log.clientIp || '',
          log.target_did || log.targetDid || '',
          log.device_name || log.deviceName || '',
          log.song_id || log.songId || ''
        ]);
        lCount++;
      }

      return {
        success: true,
        migratedUsers: uCount,
        migratedSongs: sCount,
        migratedPlaylists: pCount,
        migratedLogs: lCount,
        message: `成功同步 ${uCount} 位用户、${sCount} 首曲目、${pCount} 个歌单及 ${lCount} 条日志至 MySQL！`
      };
    } finally {
      await conn.end();
    }
  }

  return {
    success: true,
    migratedUsers: users.length,
    migratedSongs: songs.length,
    migratedPlaylists: playlists.length,
    migratedLogs: logs.length,
    message: 'SQLite 本地数据结构完好，无需远程迁移。'
  };
}
