import path from 'path';
import { SqliteDatabaseWrapper } from './sqliteWrapper.js';

export function initSqliteDatabase(sqliteFile: string, defaultAdminUser: any) {
  try {
    const sqliteDb = new SqliteDatabaseWrapper(sqliteFile, (db) => {
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            avatar_url TEXT,
            created_at TEXT NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS songs (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            duration INTEGER,
            url TEXT,
            cover_url TEXT,
            lyrics TEXT,
            genre TEXT,
            year INTEGER,
            bitrate TEXT,
            file_size TEXT,
            source TEXT,
            created_at TEXT
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT NOT NULL,
            description TEXT,
            cover_url TEXT,
            song_ids TEXT,
            created_at TEXT
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS user_song_interactions (
            user_id TEXT NOT NULL,
            song_id TEXT NOT NULL,
            is_favorite INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 0,
            play_count INTEGER DEFAULT 0,
            last_played_at TEXT,
            PRIMARY KEY (user_id, song_id)
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS play_history (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            song_id TEXT NOT NULL,
            song_title TEXT NOT NULL,
            song_artist TEXT,
            device_did TEXT,
            device_name TEXT,
            duration_seconds INTEGER,
            played_seconds INTEGER,
            played_at TEXT NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS cast_audit_logs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            log_type TEXT NOT NULL,
            device_did TEXT,
            device_name TEXT,
            song_title TEXT,
            status TEXT NOT NULL,
            detail TEXT,
            latency_ms INTEGER
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS lyrics_store (
            song_id TEXT PRIMARY KEY,
            raw_lrc TEXT,
            translated_lrc TEXT,
            time_offset_ms INTEGER DEFAULT 0,
            source TEXT,
            updated_at TEXT NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS device_eq_presets (
            id TEXT PRIMARY KEY,
            device_did TEXT,
            user_id TEXT,
            preset_name TEXT NOT NULL,
            bands_json TEXT NOT NULL,
            target_lufs REAL DEFAULT -16.0,
            bass_boost INTEGER DEFAULT 0,
            spatial_audio INTEGER DEFAULT 0,
            updated_at TEXT NOT NULL
          )
        `);

        // 服务端离线定时休眠与叫醒任务
        db.run(`
          CREATE TABLE IF NOT EXISTS scheduled_tasks (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            cron_expr TEXT,
            target_time TEXT,
            target_did TEXT NOT NULL,
            target_device_name TEXT,
            playlist_id TEXT,
            song_id TEXT,
            action TEXT NOT NULL,
            volume INTEGER,
            fade_duration_seconds INTEGER DEFAULT 0,
            repeat_days TEXT,
            is_enabled INTEGER DEFAULT 1,
            last_executed_at TEXT,
            next_run_at TEXT,
            tts_text TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);

        // 多房间音箱编组与全屋广播分区
        db.run(`
          CREATE TABLE IF NOT EXISTS speaker_groups (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT NOT NULL,
            member_dids_json TEXT NOT NULL,
            leader_did TEXT NOT NULL,
            sync_strategy TEXT DEFAULT 'mina_multicast',
            volume_offset_json TEXT,
            is_active INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);

        // 智能歌单动态规则
        db.run(`
          CREATE TABLE IF NOT EXISTS smart_playlist_rules (
            id TEXT PRIMARY KEY,
            playlist_id TEXT NOT NULL,
            rule_name TEXT NOT NULL,
            condition_type TEXT NOT NULL,
            field_name TEXT NOT NULL,
            operator TEXT NOT NULL,
            target_value TEXT NOT NULL,
            sort_by TEXT,
            sort_order TEXT DEFAULT 'desc',
            limit_count INTEGER DEFAULT 50,
            auto_refresh INTEGER DEFAULT 1,
            last_evaluated_at TEXT,
            created_at TEXT NOT NULL
          )
        `);

        // 音箱高定别名、播报音色与个性化配额
        db.run(`
          CREATE TABLE IF NOT EXISTS device_customizations (
            device_did TEXT PRIMARY KEY,
            custom_alias TEXT,
            room_name TEXT,
            preferred_voice TEXT,
            preferred_tts_speed REAL DEFAULT 1.0,
            preferred_volume INTEGER,
            auto_switch_source INTEGER DEFAULT 1,
            night_mode_start TEXT,
            night_mode_end TEXT,
            night_volume_limit INTEGER,
            default_volume INTEGER DEFAULT 40,
            max_volume_limit INTEGER DEFAULT 100,
            default_eq_preset_id TEXT,
            updated_at TEXT NOT NULL
          )
        `);

        // 音频指纹识别缓存 & 播放断点会话状态
        db.run(`
          CREATE TABLE IF NOT EXISTS audio_fingerprint_cache (
            song_id TEXT PRIMARY KEY,
            fingerprint_hash TEXT,
            acoustid TEXT,
            musicbrainz_id TEXT,
            title TEXT,
            artist TEXT,
            album TEXT,
            cover_url TEXT,
            genre TEXT,
            year INTEGER,
            lyrics TEXT,
            matched_at TEXT NOT NULL
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS playback_checkpoints (
            id TEXT PRIMARY KEY,
            device_did TEXT,
            user_id TEXT,
            song_id TEXT NOT NULL,
            position_seconds REAL DEFAULT 0,
            duration_seconds REAL DEFAULT 0,
            queue_context_json TEXT,
            updated_at TEXT NOT NULL
          )
        `);

        // 长音频与跨设备断点续播 (playback_resume_points)
        db.run(`
          CREATE TABLE IF NOT EXISTS playback_resume_points (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            song_id TEXT NOT NULL,
            song_title TEXT,
            song_artist TEXT,
            song_cover_url TEXT,
            device_did TEXT,
            device_name TEXT,
            resume_position_seconds REAL DEFAULT 0,
            duration_seconds REAL DEFAULT 0,
            progress_percent REAL DEFAULT 0,
            is_completed INTEGER DEFAULT 0,
            queue_context_json TEXT,
            updated_at TEXT NOT NULL
          )
        `);

        // 音箱硬件自学习策略画像 (device_strategy_profiles)
        db.run(`
          CREATE TABLE IF NOT EXISTS device_strategy_profiles (
            device_did TEXT PRIMARY KEY,
            device_name TEXT,
            device_model TEXT NOT NULL,
            preferred_protocol TEXT NOT NULL,
            direct_stream_supported INTEGER DEFAULT 0,
            best_mime_type TEXT DEFAULT 'audio/mp3',
            transcode_profile TEXT,
            avg_latency_ms INTEGER DEFAULT 0,
            last_latency_ms INTEGER DEFAULT 0,
            success_rate_percent REAL DEFAULT 100.0,
            total_calls INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            fail_count INTEGER DEFAULT 0,
            fallback_count INTEGER DEFAULT 0,
            health_score INTEGER DEFAULT 100,
            last_error TEXT,
            last_success_at TEXT,
            updated_at TEXT NOT NULL
          )
        `);

        // 全链路诊断与审计日志数据表 (system_logs)
        db.run(`
          CREATE TABLE IF NOT EXISTS system_logs (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            time_formatted TEXT NOT NULL,
            category TEXT NOT NULL,
            level TEXT NOT NULL,
            trace_id TEXT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            details_json TEXT,
            client_ip TEXT,
            target_did TEXT,
            device_name TEXT,
            song_id TEXT
          )
        `);

        db.run(`CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp DESC)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs(category)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_system_logs_trace_id ON system_logs(trace_id)`);

        if (defaultAdminUser) {
          db.run(`
            INSERT OR IGNORE INTO users (id, username, email, password_hash, role, avatar_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [
            defaultAdminUser.id,
            defaultAdminUser.username,
            defaultAdminUser.email,
            defaultAdminUser.passwordHash,
            defaultAdminUser.role,
            defaultAdminUser.avatarUrl,
            defaultAdminUser.createdAt
          ]);
        }
      });
    });

    return sqliteDb;
  } catch (e) {
    console.error('SQLite initialization failed:', e);
    return null;
  }
}
