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

function getSqliteRows(db: any, table: string, limit = 5000): any[] {
  if (!db) return [];
  try {
    return db.all(`SELECT * FROM ${table} LIMIT ${limit}`) || [];
  } catch {
    return [];
  }
}

export async function migrateDataToRemoteDatabase(options: MigrationOptions): Promise<{
  success: boolean;
  migratedUsers: number;
  migratedSongs: number;
  migratedPlaylists: number;
  migratedLogs: number;
  migratedOthers?: number;
  message: string;
}> {
  const { targetConfig, sqliteDb, users, songs, playlists } = options;
  const engine = targetConfig.engine;

  const logs = getSqliteRows(sqliteDb, 'system_logs', 1000);
  const interactions = getSqliteRows(sqliteDb, 'user_song_interactions', 2000);
  const playHistory = getSqliteRows(sqliteDb, 'play_history', 2000);
  const lyrics = getSqliteRows(sqliteDb, 'lyrics_store', 2000);
  const eqPresets = getSqliteRows(sqliteDb, 'device_eq_presets', 500);
  const scheduledTasks = getSqliteRows(sqliteDb, 'scheduled_tasks', 500);
  const speakerGroups = getSqliteRows(sqliteDb, 'speaker_groups', 500);
  const smartRules = getSqliteRows(sqliteDb, 'smart_playlist_rules', 500);
  const auditLogs = getSqliteRows(sqliteDb, 'cast_audit_logs', 1000);
  const customizations = getSqliteRows(sqliteDb, 'device_customizations', 500);
  const fingerprints = getSqliteRows(sqliteDb, 'audio_fingerprint_cache', 2000);
  const checkpoints = getSqliteRows(sqliteDb, 'playback_checkpoints', 500);
  const resumePoints = getSqliteRows(sqliteDb, 'playback_resume_points', 1000);
  const strategyProfiles = getSqliteRows(sqliteDb, 'device_strategy_profiles', 500);

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
      let otherCount = 0;

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

      // Migrate speaker groups
      for (const sg of speakerGroups) {
        await client.query(`
          INSERT INTO speaker_groups (id, user_id, name, member_dids_json, leader_did, sync_strategy, volume_offset_json, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          sg.id, sg.user_id, sg.name, sg.member_dids_json, sg.leader_did, sg.sync_strategy || 'mina_multicast',
          sg.volume_offset_json, sg.is_active || 0, sg.created_at, sg.updated_at
        ]);
        otherCount++;
      }

      // Migrate scheduled tasks
      for (const task of scheduledTasks) {
        await client.query(`
          INSERT INTO scheduled_tasks (id, user_id, title, type, cron_expr, target_time, target_did, target_device_name, playlist_id, song_id, action, volume, fade_duration_seconds, repeat_days, is_enabled, last_executed_at, next_run_at, tts_text, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (id) DO NOTHING
        `, [
          task.id, task.user_id, task.title, task.type, task.cron_expr, task.target_time, task.target_did,
          task.target_device_name, task.playlist_id, task.song_id, task.action, task.volume,
          task.fade_duration_seconds || 0, task.repeat_days, task.is_enabled ?? 1, task.last_executed_at,
          task.next_run_at, task.tts_text, task.created_at, task.updated_at
        ]);
        otherCount++;
      }

      // Migrate device EQ presets
      for (const eq of eqPresets) {
        await client.query(`
          INSERT INTO device_eq_presets (id, device_did, user_id, preset_name, bands_json, target_lufs, bass_boost, spatial_audio, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `, [
          eq.id, eq.device_did, eq.user_id, eq.preset_name, eq.bands_json, eq.target_lufs ?? -16.0,
          eq.bass_boost || 0, eq.spatial_audio || 0, eq.updated_at
        ]);
        otherCount++;
      }

      // Migrate lyrics store
      for (const lyr of lyrics) {
        await client.query(`
          INSERT INTO lyrics_store (song_id, raw_lrc, translated_lrc, time_offset_ms, source, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (song_id) DO NOTHING
        `, [
          lyr.song_id, lyr.raw_lrc, lyr.translated_lrc, lyr.time_offset_ms || 0, lyr.source, lyr.updated_at
        ]);
        otherCount++;
      }

      // Migrate smart playlist rules
      for (const sr of smartRules) {
        await client.query(`
          INSERT INTO smart_playlist_rules (id, playlist_id, rule_name, condition_type, field_name, operator, target_value, sort_by, sort_order, limit_count, auto_refresh, last_evaluated_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO NOTHING
        `, [
          sr.id, sr.playlist_id, sr.rule_name, sr.condition_type, sr.field_name, sr.operator,
          sr.target_value, sr.sort_by, sr.sort_order || 'desc', sr.limit_count || 50,
          sr.auto_refresh ?? 1, sr.last_evaluated_at, sr.created_at
        ]);
        otherCount++;
      }

      // Migrate user song interactions
      for (const inter of interactions) {
        await client.query(`
          INSERT INTO user_song_interactions (user_id, song_id, is_favorite, rating, play_count, last_played_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (user_id, song_id) DO NOTHING
        `, [
          inter.user_id, inter.song_id, inter.is_favorite || 0, inter.rating || 0, inter.play_count || 0, inter.last_played_at
        ]);
        otherCount++;
      }

      // Migrate play history
      for (const ph of playHistory) {
        await client.query(`
          INSERT INTO play_history (id, user_id, song_id, song_title, song_artist, device_did, device_name, duration_seconds, played_seconds, played_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO NOTHING
        `, [
          ph.id, ph.user_id, ph.song_id, ph.song_title, ph.song_artist, ph.device_did, ph.device_name,
          ph.duration_seconds || 0, ph.played_seconds || 0, ph.played_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate cast audit logs
      for (const al of auditLogs) {
        await client.query(`
          INSERT INTO cast_audit_logs (id, timestamp, log_type, device_did, device_name, song_title, status, detail, latency_ms)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
        `, [
          al.id, al.timestamp, al.log_type || al.logType || 'cast', al.device_did || al.deviceDid,
          al.device_name || al.deviceName, al.song_title || al.songTitle, al.status || 'success',
          al.detail, al.latency_ms || al.latencyMs || 0
        ]);
        otherCount++;
      }

      // Migrate device customizations
      for (const dc of customizations) {
        await client.query(`
          INSERT INTO device_customizations (device_did, custom_alias, room_name, preferred_voice, preferred_tts_speed, preferred_volume, auto_switch_source, night_mode_start, night_mode_end, night_volume_limit, default_volume, max_volume_limit, default_eq_preset_id, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (device_did) DO NOTHING
        `, [
          dc.device_did, dc.custom_alias, dc.room_name, dc.preferred_voice, dc.preferred_tts_speed ?? 1.0,
          dc.preferred_volume, dc.auto_switch_source ?? 1, dc.night_mode_start, dc.night_mode_end,
          dc.night_volume_limit, dc.default_volume ?? 40, dc.max_volume_limit ?? 100, dc.default_eq_preset_id,
          dc.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate audio fingerprint cache
      for (const fp of fingerprints) {
        await client.query(`
          INSERT INTO audio_fingerprint_cache (song_id, fingerprint_hash, acoustid, musicbrainz_id, title, artist, album, cover_url, genre, year, lyrics, matched_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (song_id) DO NOTHING
        `, [
          fp.song_id, fp.fingerprint_hash, fp.acoustid, fp.musicbrainz_id, fp.title, fp.artist,
          fp.album, fp.cover_url, fp.genre, fp.year, fp.lyrics, fp.matched_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate playback checkpoints
      for (const cp of checkpoints) {
        await client.query(`
          INSERT INTO playback_checkpoints (id, device_did, user_id, song_id, position_seconds, duration_seconds, queue_context_json, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING
        `, [
          cp.id, cp.device_did, cp.user_id, cp.song_id, cp.position_seconds || 0,
          cp.duration_seconds || 0, cp.queue_context_json, cp.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate playback resume points
      for (const rp of resumePoints) {
        await client.query(`
          INSERT INTO playback_resume_points (id, user_id, song_id, song_title, song_artist, song_cover_url, device_did, device_name, resume_position_seconds, duration_seconds, progress_percent, is_completed, queue_context_json, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO NOTHING
        `, [
          rp.id, rp.user_id, rp.song_id, rp.song_title, rp.song_artist, rp.song_cover_url,
          rp.device_did, rp.device_name, rp.resume_position_seconds || 0, rp.duration_seconds || 0,
          rp.progress_percent || 0, rp.is_completed || 0, rp.queue_context_json, rp.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate device strategy profiles
      for (const sp of strategyProfiles) {
        await client.query(`
          INSERT INTO device_strategy_profiles (device_did, device_name, device_model, preferred_protocol, direct_stream_supported, best_mime_type, transcode_profile, avg_latency_ms, last_latency_ms, success_rate_percent, total_calls, success_count, fail_count, fallback_count, health_score, last_error, last_success_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (device_did) DO NOTHING
        `, [
          sp.device_did, sp.device_name, sp.device_model || 'XiaoAi', sp.preferred_protocol || 'http_direct',
          sp.direct_stream_supported || 0, sp.best_mime_type || 'audio/mp3', sp.transcode_profile,
          sp.avg_latency_ms || 0, sp.last_latency_ms || 0, sp.success_rate_percent ?? 100.0,
          sp.total_calls || 0, sp.success_count || 0, sp.fail_count || 0, sp.fallback_count || 0,
          sp.health_score ?? 100, sp.last_error, sp.last_success_at, sp.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      return {
        success: true,
        migratedUsers: uCount,
        migratedSongs: sCount,
        migratedPlaylists: pCount,
        migratedLogs: lCount,
        migratedOthers: otherCount,
        message: `成功同步 ${uCount} 位用户、${sCount} 首曲目、${pCount} 个歌单、${lCount} 条系统日志及 ${otherCount} 条配置数据至 PostgreSQL！`
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
      let otherCount = 0;

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

      // Migrate speaker groups
      for (const sg of speakerGroups) {
        await conn.query(`
          INSERT IGNORE INTO speaker_groups (id, user_id, name, member_dids_json, leader_did, sync_strategy, volume_offset_json, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sg.id, sg.user_id, sg.name, sg.member_dids_json, sg.leader_did, sg.sync_strategy || 'mina_multicast',
          sg.volume_offset_json, sg.is_active || 0, sg.created_at, sg.updated_at
        ]);
        otherCount++;
      }

      // Migrate scheduled tasks
      for (const task of scheduledTasks) {
        await conn.query(`
          INSERT IGNORE INTO scheduled_tasks (id, user_id, title, type, cron_expr, target_time, target_did, target_device_name, playlist_id, song_id, action, volume, fade_duration_seconds, repeat_days, is_enabled, last_executed_at, next_run_at, tts_text, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          task.id, task.user_id, task.title, task.type, task.cron_expr, task.target_time, task.target_did,
          task.target_device_name, task.playlist_id, task.song_id, task.action, task.volume,
          task.fade_duration_seconds || 0, task.repeat_days, task.is_enabled ?? 1, task.last_executed_at,
          task.next_run_at, task.tts_text, task.created_at, task.updated_at
        ]);
        otherCount++;
      }

      // Migrate device EQ presets
      for (const eq of eqPresets) {
        await conn.query(`
          INSERT IGNORE INTO device_eq_presets (id, device_did, user_id, preset_name, bands_json, target_lufs, bass_boost, spatial_audio, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          eq.id, eq.device_did, eq.user_id, eq.preset_name, eq.bands_json, eq.target_lufs ?? -16.0,
          eq.bass_boost || 0, eq.spatial_audio || 0, eq.updated_at
        ]);
        otherCount++;
      }

      // Migrate lyrics store
      for (const lyr of lyrics) {
        await conn.query(`
          INSERT IGNORE INTO lyrics_store (song_id, raw_lrc, translated_lrc, time_offset_ms, source, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          lyr.song_id, lyr.raw_lrc, lyr.translated_lrc, lyr.time_offset_ms || 0, lyr.source, lyr.updated_at
        ]);
        otherCount++;
      }

      // Migrate smart playlist rules
      for (const sr of smartRules) {
        await conn.query(`
          INSERT IGNORE INTO smart_playlist_rules (id, playlist_id, rule_name, condition_type, field_name, operator, target_value, sort_by, sort_order, limit_count, auto_refresh, last_evaluated_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sr.id, sr.playlist_id, sr.rule_name, sr.condition_type, sr.field_name, sr.operator,
          sr.target_value, sr.sort_by, sr.sort_order || 'desc', sr.limit_count || 50,
          sr.auto_refresh ?? 1, sr.last_evaluated_at, sr.created_at
        ]);
        otherCount++;
      }

      // Migrate user song interactions
      for (const inter of interactions) {
        await conn.query(`
          INSERT IGNORE INTO user_song_interactions (user_id, song_id, is_favorite, rating, play_count, last_played_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          inter.user_id, inter.song_id, inter.is_favorite || 0, inter.rating || 0, inter.play_count || 0, inter.last_played_at
        ]);
        otherCount++;
      }

      // Migrate play history
      for (const ph of playHistory) {
        await conn.query(`
          INSERT IGNORE INTO play_history (id, user_id, song_id, song_title, song_artist, device_did, device_name, duration_seconds, played_seconds, played_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          ph.id, ph.user_id, ph.song_id, ph.song_title, ph.song_artist, ph.device_did, ph.device_name,
          ph.duration_seconds || 0, ph.played_seconds || 0, ph.played_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate cast audit logs
      for (const al of auditLogs) {
        await conn.query(`
          INSERT IGNORE INTO cast_audit_logs (id, timestamp, log_type, device_did, device_name, song_title, status, detail, latency_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          al.id, al.timestamp, al.log_type || al.logType || 'cast', al.device_did || al.deviceDid,
          al.device_name || al.deviceName, al.song_title || al.songTitle, al.status || 'success',
          al.detail, al.latency_ms || al.latencyMs || 0
        ]);
        otherCount++;
      }

      // Migrate device customizations
      for (const dc of customizations) {
        await conn.query(`
          INSERT IGNORE INTO device_customizations (device_did, custom_alias, room_name, preferred_voice, preferred_tts_speed, preferred_volume, auto_switch_source, night_mode_start, night_mode_end, night_volume_limit, default_volume, max_volume_limit, default_eq_preset_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          dc.device_did, dc.custom_alias, dc.room_name, dc.preferred_voice, dc.preferred_tts_speed ?? 1.0,
          dc.preferred_volume, dc.auto_switch_source ?? 1, dc.night_mode_start, dc.night_mode_end,
          dc.night_volume_limit, dc.default_volume ?? 40, dc.max_volume_limit ?? 100, dc.default_eq_preset_id,
          dc.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate audio fingerprint cache
      for (const fp of fingerprints) {
        await conn.query(`
          INSERT IGNORE INTO audio_fingerprint_cache (song_id, fingerprint_hash, acoustid, musicbrainz_id, title, artist, album, cover_url, genre, year, lyrics, matched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          fp.song_id, fp.fingerprint_hash, fp.acoustid, fp.musicbrainz_id, fp.title, fp.artist,
          fp.album, fp.cover_url, fp.genre, fp.year, fp.lyrics, fp.matched_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate playback checkpoints
      for (const cp of checkpoints) {
        await conn.query(`
          INSERT IGNORE INTO playback_checkpoints (id, device_did, user_id, song_id, position_seconds, duration_seconds, queue_context_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          cp.id, cp.device_did, cp.user_id, cp.song_id, cp.position_seconds || 0,
          cp.duration_seconds || 0, cp.queue_context_json, cp.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate playback resume points
      for (const rp of resumePoints) {
        await conn.query(`
          INSERT IGNORE INTO playback_resume_points (id, user_id, song_id, song_title, song_artist, song_cover_url, device_did, device_name, resume_position_seconds, duration_seconds, progress_percent, is_completed, queue_context_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          rp.id, rp.user_id, rp.song_id, rp.song_title, rp.song_artist, rp.song_cover_url,
          rp.device_did, rp.device_name, rp.resume_position_seconds || 0, rp.duration_seconds || 0,
          rp.progress_percent || 0, rp.is_completed || 0, rp.queue_context_json, rp.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      // Migrate device strategy profiles
      for (const sp of strategyProfiles) {
        await conn.query(`
          INSERT IGNORE INTO device_strategy_profiles (device_did, device_name, device_model, preferred_protocol, direct_stream_supported, best_mime_type, transcode_profile, avg_latency_ms, last_latency_ms, success_rate_percent, total_calls, success_count, fail_count, fallback_count, health_score, last_error, last_success_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          sp.device_did, sp.device_name, sp.device_model || 'XiaoAi', sp.preferred_protocol || 'http_direct',
          sp.direct_stream_supported || 0, sp.best_mime_type || 'audio/mp3', sp.transcode_profile,
          sp.avg_latency_ms || 0, sp.last_latency_ms || 0, sp.success_rate_percent ?? 100.0,
          sp.total_calls || 0, sp.success_count || 0, sp.fail_count || 0, sp.fallback_count || 0,
          sp.health_score ?? 100, sp.last_error, sp.last_success_at, sp.updated_at || new Date().toISOString()
        ]);
        otherCount++;
      }

      return {
        success: true,
        migratedUsers: uCount,
        migratedSongs: sCount,
        migratedPlaylists: pCount,
        migratedLogs: lCount,
        migratedOthers: otherCount,
        message: `成功同步 ${uCount} 位用户、${sCount} 首曲目、${pCount} 个歌单、${lCount} 条系统日志及 ${otherCount} 条配置数据至 MySQL！`
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
