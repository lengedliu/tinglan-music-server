import fs from 'fs';
import path from 'path';

/**
 * Robust Atomic JSON Store
 * Writes data to a temporary file first (.tmp.[pid].[random]) and renames it atomically to prevent corruption.
 */
export class JsonStore {
  /**
   * Synchronously read and parse JSON file safely
   */
  public static readJson<T = any>(filePath: string, defaultValue: T): T {
    try {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (!raw || !raw.trim()) {
        return defaultValue;
      }
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn(`[JsonStore] Failed to read/parse ${filePath}, returning default:`, err);
      return defaultValue;
    }
  }

  /**
   * Atomically save JSON file by writing to a temporary file and renaming.
   */
  public static saveJson<T = any>(filePath: string, data: T): boolean {
    const dir = path.dirname(filePath);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}`);
      const content = JSON.stringify(data, null, 2);
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, filePath);
      return true;
    } catch (err) {
      console.error(`[JsonStore] Failed to atomically save ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Asynchronously save JSON file atomically
   */
  public static async saveJsonAsync<T = any>(filePath: string, data: T): Promise<boolean> {
    const dir = path.dirname(filePath);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp.${process.pid}.${Date.now()}`);
      const content = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(tmpPath, content, 'utf-8');
      await fs.promises.rename(tmpPath, filePath);
      return true;
    } catch (err) {
      console.error(`[JsonStore] Async atomic save failed for ${filePath}:`, err);
      return false;
    }
  }
}
