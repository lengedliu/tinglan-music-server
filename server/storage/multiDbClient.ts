import pg from 'pg';
import mysql from 'mysql2/promise';

export type DatabaseEngineType = 'sqlite' | 'postgres' | 'mysql';

export interface MultiDbConfig {
  engine: DatabaseEngineType;
  postgresConfig?: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
  };
  mysqlConfig?: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
  };
}

/**
 * Universal Multi-Engine Database Connection Pool & Query Executor
 * Allows repositories to asynchronously write to PostgreSQL / MySQL
 * while maintaining SQLite / in-memory speed and zero-stall streaming.
 */
class MultiDbManager {
  private currentConfig: MultiDbConfig = { engine: 'sqlite' };
  private pgPool: pg.Pool | null = null;
  private myPool: mysql.Pool | null = null;

  public setConfig(config: MultiDbConfig) {
    this.currentConfig = { ...config };
    this.reconnect();
  }

  public get engine(): DatabaseEngineType {
    return this.currentConfig.engine || 'sqlite';
  }

  public get isRemoteActive(): boolean {
    return this.currentConfig.engine === 'postgres' || this.currentConfig.engine === 'mysql';
  }

  private async reconnect() {
    // 1. Teardown existing connections
    if (this.pgPool) {
      try {
        await this.pgPool.end();
      } catch {}
      this.pgPool = null;
    }
    if (this.myPool) {
      try {
        await this.myPool.end();
      } catch {}
      this.myPool = null;
    }

    // 2. Initialize new pools if remote
    if (this.currentConfig.engine === 'postgres' && this.currentConfig.postgresConfig?.host) {
      const cfg = this.currentConfig.postgresConfig;
      this.pgPool = new pg.Pool({
        host: cfg.host,
        port: Number(cfg.port) || 5432,
        user: cfg.user || 'postgres',
        password: cfg.password || '',
        database: cfg.database || 'tinglan_db',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });
      this.pgPool.on('error', (err) => {
        console.warn('[MultiDb] PostgreSQL pool error:', err.message);
      });
    } else if (this.currentConfig.engine === 'mysql' && this.currentConfig.mysqlConfig?.host) {
      const cfg = this.currentConfig.mysqlConfig;
      this.myPool = mysql.createPool({
        host: cfg.host,
        port: Number(cfg.port) || 3306,
        user: cfg.user || 'root',
        password: cfg.password || '',
        database: cfg.database || 'tinglan_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 5000
      });
    }
  }

  /**
   * Execute an atomic UPSERT or write operation to the currently active remote database.
   * If remote is unreachable or throws, it catches and logs a warning, never crashing callers.
   */
  public async executeWrite(
    pgSql: string,
    pgValues: any[],
    mySql: string,
    myValues: any[]
  ): Promise<boolean> {
    if (this.currentConfig.engine === 'postgres' && this.pgPool) {
      try {
        await this.pgPool.query(pgSql, pgValues);
        return true;
      } catch (err: any) {
        console.warn('[MultiDb] Failed to write to PostgreSQL:', err?.message || err);
        return false;
      }
    } else if (this.currentConfig.engine === 'mysql' && this.myPool) {
      try {
        await this.myPool.query(mySql, myValues);
        return true;
      } catch (err: any) {
        console.warn('[MultiDb] Failed to write to MySQL:', err?.message || err);
        return false;
      }
    }
    return true;
  }
}

export const multiDbManager = new MultiDbManager();
