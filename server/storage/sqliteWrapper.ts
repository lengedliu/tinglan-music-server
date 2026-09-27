import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

function normalizeArgs(paramsOrCb: any, maybeCb: any): { params: any[]; callback?: (err: any, res?: any) => void } {
  if (typeof paramsOrCb === 'function') {
    return { params: [], callback: paramsOrCb };
  }
  const params = Array.isArray(paramsOrCb) ? paramsOrCb : (paramsOrCb !== undefined ? [paramsOrCb] : []);
  const callback = typeof maybeCb === 'function' ? maybeCb : undefined;
  return { params, callback };
}

export class SqliteDatabaseWrapper {
  private db: any = null;
  private filePath: string;
  private isReady = false;
  private queue: Array<() => void> = [];
  private saveTimeout: NodeJS.Timeout | null = null;
  private isDirty = false;

  constructor(filePath: string, onInitialized?: (db: SqliteDatabaseWrapper) => void) {
    this.filePath = filePath;
    this.init(onInitialized);
  }

  private async init(onInitialized?: (db: SqliteDatabaseWrapper) => void) {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const SQL = await initSqlJs();
      let fileBuffer: Buffer | null = null;
      if (fs.existsSync(this.filePath)) {
        try {
          fileBuffer = fs.readFileSync(this.filePath);
        } catch (e: any) {
          console.warn('[SQLite] Failed to read existing database file, creating fresh:', e?.message);
        }
      }

      this.db = fileBuffer && fileBuffer.length > 0 ? new SQL.Database(fileBuffer) : new SQL.Database();
      this.isReady = true;
      console.log(`[SQLite] SQLite 3 (WASM engine) active at ${this.filePath}`);

      if (onInitialized) {
        try {
          onInitialized(this);
        } catch (e: any) {
          console.warn('[SQLite] onInitialized callback error:', e?.message);
        }
      }

      // Flush queued operations
      const pending = [...this.queue];
      this.queue = [];
      for (const op of pending) {
        try {
          op();
        } catch (err: any) {
          console.error('[SQLite] Error executing queued operation:', err);
        }
      }
    } catch (err: any) {
      console.error('[SQLite] Failed to initialize SQLite WASM engine:', err);
    }
  }

  public get ready(): boolean {
    return this.isReady;
  }

  public serialize(fn: () => void): this {
    if (!this.isReady) {
      this.queue.push(() => this.serialize(fn));
      return this;
    }
    try {
      fn();
    } catch (err: any) {
      console.error('[SQLite] Error inside serialize block:', err);
    }
    return this;
  }

  public run(sql: string, paramsOrCb?: any, maybeCb?: any): this {
    const { params, callback } = normalizeArgs(paramsOrCb, maybeCb);
    if (!this.isReady) {
      this.queue.push(() => this.run(sql, params, callback));
      return this;
    }

    try {
      if (params.length > 0) {
        this.db.run(sql, params);
      } else {
        this.db.run(sql);
      }
      this.scheduleSave();
      if (callback) callback(null);
    } catch (err: any) {
      console.warn(`[SQLite] Run error on SQL: ${sql.slice(0, 80)}...`, err?.message);
      if (callback) callback(err);
    }
    return this;
  }

  public get(sql: string, paramsOrCb?: any, maybeCb?: any): any {
    const { params, callback } = normalizeArgs(paramsOrCb, maybeCb);
    if (!this.isReady) {
      if (callback) this.queue.push(() => this.get(sql, params, callback));
      return undefined;
    }

    try {
      const stmt = this.db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const hasRow = stmt.step();
      const row = hasRow ? stmt.getAsObject() : undefined;
      stmt.free();
      if (callback) callback(null, row);
      return row;
    } catch (err: any) {
      console.warn(`[SQLite] Get error on SQL: ${sql.slice(0, 80)}...`, err?.message);
      if (callback) callback(err, undefined);
      return undefined;
    }
  }

  public all(sql: string, paramsOrCb?: any, maybeCb?: any): any[] {
    const { params, callback } = normalizeArgs(paramsOrCb, maybeCb);
    if (!this.isReady) {
      if (callback) this.queue.push(() => this.all(sql, params, callback));
      return [];
    }

    try {
      const stmt = this.db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      if (callback) callback(null, rows);
      return rows;
    } catch (err: any) {
      console.warn(`[SQLite] All error on SQL: ${sql.slice(0, 80)}...`, err?.message);
      if (callback) callback(err, []);
      return [];
    }
  }

  public prepare(sql: string) {
    if (!this.isReady) {
      throw new Error('[SQLite] Database not ready yet for synchronous prepare. Wrap in serialize() or ensure initialized.');
    }
    const stmt = this.db.prepare(sql);
    const self = this;
    return {
      run(...args: any[]) {
        let params = args;
        if (args.length === 1 && Array.isArray(args[0])) {
          params = args[0];
        }
        stmt.run(params);
        self.scheduleSave();
      },
      finalize(cb?: () => void) {
        try {
          stmt.free();
        } catch {}
        if (cb) cb();
      }
    };
  }

  public scheduleSave() {
    this.isDirty = true;
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveSync();
    }, 400);
  }

  public saveSync() {
    if (!this.isDirty || !this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tempPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, this.filePath);
      this.isDirty = false;
    } catch (err: any) {
      console.warn('[SQLite] Failed to flush database to disk:', err?.message);
    }
  }

  public close(cb?: () => void) {
    this.saveSync();
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
    if (cb) cb();
  }
}
