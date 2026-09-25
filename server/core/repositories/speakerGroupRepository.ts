import fs from 'fs';
import path from 'path';

export interface SpeakerGroup {
  id: string;
  name: string;
  description?: string;
  masterDid?: string;
  memberDids: string[]; // List of XiaoAi speaker DIDs
  masterVolume: number; // 0 - 100
  volumeOffsets: Record<string, number>; // { [did: string]: number (-20 to +20) }
  icon?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export class SpeakerGroupRepository {
  private dataDir: string;
  private groupsFile: string;
  private groups: Map<string, SpeakerGroup> = new Map();
  private sqliteDb: any = null;

  constructor(dataDir: string = path.join(process.cwd(), 'data'), sqliteDb: any = null) {
    this.dataDir = dataDir;
    this.sqliteDb = sqliteDb;
    this.groupsFile = path.join(this.dataDir, 'speaker_groups.json');
    this.loadFromDisk();
  }

  public setSqliteDb(db: any) {
    this.sqliteDb = db;
    this.syncFromSqlite();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.groupsFile)) {
        const raw = fs.readFileSync(this.groupsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(g => this.groups.set(g.id, g));
          return;
        }
      }
    } catch (err) {
      console.warn('[SpeakerGroupRepository] Failed to read speaker_groups.json:', err);
    }

    // Default sample speaker group if empty
    if (this.groups.size === 0) {
      const defaultGroup: SpeakerGroup = {
        id: 'grp-all-speakers',
        name: '全屋广播组',
        description: '同步控制家中所有音箱设备进行广播或多房间串流',
        memberDids: [],
        masterVolume: 45,
        volumeOffsets: {},
        icon: 'Radio',
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.groups.set(defaultGroup.id, defaultGroup);
      this.persistAsync();
    }
  }

  private syncFromSqlite() {
    if (!this.sqliteDb) return;
    try {
      this.sqliteDb.all('SELECT * FROM speaker_groups', (err: any, rows: any[]) => {
        if (!err && Array.isArray(rows) && rows.length > 0) {
          rows.forEach(r => {
            const grp: SpeakerGroup = {
              id: r.id,
              name: r.name,
              description: r.description,
              masterDid: r.master_did,
              memberDids: r.member_dids ? JSON.parse(r.member_dids) : [],
              masterVolume: r.master_volume || 50,
              volumeOffsets: r.volume_offsets ? JSON.parse(r.volume_offsets) : {},
              icon: r.icon,
              isDefault: Boolean(r.is_default),
              createdAt: r.created_at,
              updatedAt: r.updated_at
            };
            this.groups.set(grp.id, grp);
          });
        }
      });
    } catch (e) {
      console.error('[SpeakerGroupRepository] Sync from SQLite error:', e);
    }
  }

  private persistAsync() {
    try {
      const arr = Array.from(this.groups.values());
      fs.writeFile(this.groupsFile, JSON.stringify(arr, null, 2), 'utf-8', (err) => {
        if (err) console.error('[SpeakerGroupRepository] JSON save error:', err);
      });
    } catch (e) {
      console.error('[SpeakerGroupRepository] Persist async error:', e);
    }
  }

  public getAllGroups(): SpeakerGroup[] {
    return Array.from(this.groups.values()).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  }

  public getGroupById(id: string): SpeakerGroup | undefined {
    return this.groups.get(id);
  }

  public upsertGroup(group: SpeakerGroup): SpeakerGroup {
    const record: SpeakerGroup = {
      ...group,
      updatedAt: new Date().toISOString()
    };
    this.groups.set(record.id, record);
    this.persistAsync();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.run(`
          INSERT INTO speaker_groups (
            id, name, description, master_did, member_dids, master_volume,
            volume_offsets, icon, is_default, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            master_did = excluded.master_did,
            member_dids = excluded.member_dids,
            master_volume = excluded.master_volume,
            volume_offsets = excluded.volume_offsets,
            icon = excluded.icon,
            is_default = excluded.is_default,
            updated_at = excluded.updated_at
        `, [
          record.id,
          record.name,
          record.description || null,
          record.masterDid || null,
          JSON.stringify(record.memberDids || []),
          record.masterVolume || 50,
          JSON.stringify(record.volumeOffsets || {}),
          record.icon || 'Layers',
          record.isDefault ? 1 : 0,
          record.createdAt || new Date().toISOString(),
          record.updatedAt
        ]);
      } catch (e) {
        console.error('[SpeakerGroupRepository] SQLite upsert error:', e);
      }
    }

    return record;
  }

  public deleteGroup(id: string): boolean {
    const existed = this.groups.delete(id);
    if (existed) {
      this.persistAsync();
      if (this.sqliteDb) {
        try {
          this.sqliteDb.run('DELETE FROM speaker_groups WHERE id = ?', [id]);
        } catch (e) {
          console.error('[SpeakerGroupRepository] SQLite delete error:', e);
        }
      }
    }
    return existed;
  }
}

export const speakerGroupRepository = new SpeakerGroupRepository();
