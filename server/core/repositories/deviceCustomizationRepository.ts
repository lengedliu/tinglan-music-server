import fs from 'fs';
import path from 'path';

export interface DeviceCustomization {
  deviceDid: string;
  customName?: string;
  roomName?: string;
  icon?: string;
  hotkeyMappings?: Record<string, string>; // e.g. { "togglePlay": "Space", "prev": "ArrowLeft", "next": "ArrowRight" }
  defaultVolume?: number; // 0 - 100
  maxVolumeLimit?: number; // 0 - 100
  defaultEqPresetId?: string;
  updatedAt: string;
}

export class DeviceCustomizationRepository {
  private dataDir: string;
  private customFile: string;
  private customizations: Map<string, DeviceCustomization> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.customFile = path.join(this.dataDir, 'device_customizations.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.customFile)) {
        const raw = fs.readFileSync(this.customFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(c => this.customizations.set(c.deviceDid, c));
        }
      }
    } catch (err) {
      console.warn('[DeviceCustomizationRepository] Failed to read device_customizations.json:', err);
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM device_customizations', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const item: DeviceCustomization = {
              deviceDid: r.device_did,
              customName: r.custom_name,
              roomName: r.room_name,
              icon: r.icon,
              hotkeyMappings: r.hotkey_mappings_json ? JSON.parse(r.hotkey_mappings_json) : undefined,
              defaultVolume: r.default_volume ?? 40,
              maxVolumeLimit: r.max_volume_limit ?? 100,
              defaultEqPresetId: r.default_eq_preset_id,
              updatedAt: r.updated_at
            };
            this.customizations.set(item.deviceDid, item);
          });
        }
      });
    } catch (e) {
      console.error('[DeviceCustomizationRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.customizations.values());
      fs.writeFile(this.customFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[DeviceCustomizationRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[DeviceCustomizationRepository] Persist async error:', e);
    }
  }

  public getAll(): DeviceCustomization[] {
    return Array.from(this.customizations.values());
  }

  public getByDid(did: string): DeviceCustomization | undefined {
    return this.customizations.get(did);
  }

  public upsert(custom: DeviceCustomization): DeviceCustomization {
    const record: DeviceCustomization = {
      ...custom,
      updatedAt: new Date().toISOString()
    };
    this.customizations.set(record.deviceDid, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO device_customizations (
            device_did, custom_name, room_name, icon, hotkey_mappings_json,
            default_volume, max_volume_limit, default_eq_preset_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(device_did) DO UPDATE SET
            custom_name = excluded.custom_name,
            room_name = excluded.room_name,
            icon = excluded.icon,
            hotkey_mappings_json = excluded.hotkey_mappings_json,
            default_volume = excluded.default_volume,
            max_volume_limit = excluded.max_volume_limit,
            default_eq_preset_id = excluded.default_eq_preset_id,
            updated_at = excluded.updated_at
        `, [
          record.deviceDid,
          record.customName || null,
          record.roomName || null,
          record.icon || null,
          record.hotkeyMappings ? JSON.stringify(record.hotkeyMappings) : null,
          record.defaultVolume ?? 40,
          record.maxVolumeLimit ?? 100,
          record.defaultEqPresetId || null,
          record.updatedAt
        ]);
      } catch (e) {
        console.error('[DeviceCustomizationRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }
}

export const deviceCustomizationRepository = new DeviceCustomizationRepository();
