import fs from 'fs';
import path from 'path';
import {
  encryptSecret,
  decryptSecret,
  prepareConfigForDisk,
  restoreConfigFromDisk,
  prepareDevicesForDisk,
  restoreDevicesFromDisk
} from '../secureVault.js';

export interface StoragePaths {
  DATA_DIR: string;
  MUSIC_DIR: string;
  CONFIG_FILE: string;
  DEVICES_FILE: string;
  NAVIDROME_FILE: string;
  DB_CONFIG_FILE: string;
}

let activeStoragePaths: StoragePaths = {
  DATA_DIR: path.join(process.cwd(), 'data'),
  MUSIC_DIR: path.join(process.cwd(), 'music'),
  CONFIG_FILE: path.join(process.cwd(), 'data', 'config.json'),
  DEVICES_FILE: path.join(process.cwd(), 'data', 'devices.json'),
  NAVIDROME_FILE: path.join(process.cwd(), 'data', 'navidrome.json'),
  DB_CONFIG_FILE: path.join(process.cwd(), 'data', 'db_config.json')
};

export function configureStoragePaths(paths: Partial<StoragePaths>) {
  activeStoragePaths = { ...activeStoragePaths, ...paths };
}

/**
 * Transparently decrypt sensitive secrets after reading from disk
 */
export function unwrapEncryptedDiskData(filePath: string, data: any): any {
  if (!data) return data;
  if (filePath === activeStoragePaths.CONFIG_FILE) {
    return restoreConfigFromDisk(data);
  }
  if (filePath === activeStoragePaths.DEVICES_FILE) {
    return restoreDevicesFromDisk(data);
  }
  if (filePath === activeStoragePaths.NAVIDROME_FILE && data.password && typeof data.password === 'string') {
    return { ...data, password: decryptSecret(data.password) };
  }
  if (filePath === activeStoragePaths.DB_CONFIG_FILE) {
    const clone = { ...data };
    if (clone.postgresConfig?.password) {
      clone.postgresConfig = { ...clone.postgresConfig, password: decryptSecret(clone.postgresConfig.password) };
    }
    if (clone.mysqlConfig?.password) {
      clone.mysqlConfig = { ...clone.mysqlConfig, password: decryptSecret(clone.mysqlConfig.password) };
    }
    return clone;
  }
  return data;
}

/**
 * Transparently encrypt sensitive secrets before serializing to disk
 */
export function wrapEncryptedDiskData(filePath: string, data: any): any {
  if (!data) return data;
  if (filePath === activeStoragePaths.CONFIG_FILE) {
    return prepareConfigForDisk(data);
  }
  if (filePath === activeStoragePaths.DEVICES_FILE) {
    return prepareDevicesForDisk(data);
  }
  if (filePath === activeStoragePaths.NAVIDROME_FILE && data.password && typeof data.password === 'string') {
    return { ...data, password: encryptSecret(data.password) };
  }
  if (filePath === activeStoragePaths.DB_CONFIG_FILE) {
    const clone = { ...data };
    if (clone.postgresConfig?.password) {
      clone.postgresConfig = { ...clone.postgresConfig, password: encryptSecret(clone.postgresConfig.password) };
    }
    if (clone.mysqlConfig?.password) {
      clone.mysqlConfig = { ...clone.mysqlConfig, password: encryptSecret(clone.mysqlConfig.password) };
    }
    return clone;
  }
  return data;
}

// File Mutex Lock & Sequential Write Queue to eliminate race conditions
const saveJsonDebounceTimers = new Map<string, NodeJS.Timeout>();
const pendingSaveJsonData = new Map<string, any>();
const fileWriteLocks = new Map<string, boolean>();

export function executeAtomicFileWrite(filePath: string, dataToWrite: any): void {
  try {
    // 1. Deep clone & prepare encryption for disk
    const diskPayload = wrapEncryptedDiskData(filePath, JSON.parse(JSON.stringify(dataToWrite)));
    const jsonStr = JSON.stringify(diskPayload, null, 2);

    // 2. Ensure parent directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 3. Write to temporary file with unique PID/timestamp
    const tmpFile = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    fs.writeFileSync(tmpFile, jsonStr, 'utf-8');

    // 4. Validate written temporary file
    const stats = fs.statSync(tmpFile);
    if (stats.size === 0) {
      throw new Error(`Temp file ${tmpFile} is empty! Aborting atomic write.`);
    }

    // 5. Rotate .bak backup if target file exists and is valid
    if (fs.existsSync(filePath)) {
      try {
        const currentStats = fs.statSync(filePath);
        if (currentStats.size > 0) {
          const bakFile = `${filePath}.bak`;
          fs.copyFileSync(filePath, bakFile);
        }
      } catch {}
    }

    // 6. Atomic swap
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    console.error(`[Persistence Lock] ❌ Failed to atomically write to ${filePath}:`, err);
  }
}

export function loadJson<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content && content.trim()) {
        const parsed = JSON.parse(content);
        return unwrapEncryptedDiskData(filePath, parsed) as T;
      }
    }
  } catch (err) {
    console.warn(`[Persistence] ⚠️ Failed to load ${filePath}, attempting recovery from backup...`, err);
    // Auto self-healing from .bak
    try {
      const bakFile = `${filePath}.bak`;
      if (fs.existsSync(bakFile)) {
        const bakContent = fs.readFileSync(bakFile, 'utf-8');
        if (bakContent && bakContent.trim()) {
          const parsed = JSON.parse(bakContent);
          console.log(`[Persistence Recovery] ✅ Successfully recovered ${filePath} from ${bakFile}`);
          fs.writeFileSync(filePath, bakContent, 'utf-8');
          return unwrapEncryptedDiskData(filePath, parsed) as T;
        }
      }
    } catch (bakErr) {
      console.error(`[Persistence] ❌ Recovery from backup also failed for ${filePath}:`, bakErr);
    }
  }
  return defaultValue;
}

export function saveJson(filePath: string, data: any, immediate = false): void {
  pendingSaveJsonData.set(filePath, data);

  const doWrite = () => {
    const toWrite = pendingSaveJsonData.get(filePath);
    if (toWrite === undefined) return;
    pendingSaveJsonData.delete(filePath);
    saveJsonDebounceTimers.delete(filePath);

    // Acquire file lock
    if (fileWriteLocks.get(filePath)) {
      setTimeout(doWrite, 50);
      return;
    }

    fileWriteLocks.set(filePath, true);
    try {
      executeAtomicFileWrite(filePath, toWrite);
    } finally {
      fileWriteLocks.set(filePath, false);
    }
  };

  if (immediate) {
    const existing = saveJsonDebounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
      saveJsonDebounceTimers.delete(filePath);
    }
    doWrite();
    return;
  }

  if (!saveJsonDebounceTimers.has(filePath)) {
    const timer = setTimeout(doWrite, 200);
    saveJsonDebounceTimers.set(filePath, timer);
  }
}

export function flushAllPendingWritesSync(): void {
  for (const [filePath, data] of pendingSaveJsonData.entries()) {
    try {
      if (data !== undefined) {
        executeAtomicFileWrite(filePath, data);
      }
    } catch (err) {
      console.error(`[Persistence] Error flushing ${filePath} on exit:`, err);
    }
  }
  pendingSaveJsonData.clear();
}
