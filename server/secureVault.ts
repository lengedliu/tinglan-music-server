import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const KEY_FILE = path.join(DATA_DIR, '.vault_master.key');
const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

let masterKeyCache: Buffer | null = null;

/**
 * Retrieves or initializes the persistent 256-bit master key for encrypting secrets on disk.
 */
function getMasterKey(): Buffer {
  if (masterKeyCache && masterKeyCache.length === 32) {
    return masterKeyCache;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(KEY_FILE)) {
      const keyHex = fs.readFileSync(KEY_FILE, 'utf-8').trim();
      if (/^[0-9a-fA-F]{64}$/.test(keyHex)) {
        masterKeyCache = Buffer.from(keyHex, 'hex');
        return masterKeyCache;
      }
    }

    // Generate new random 256-bit key
    const newKey = crypto.randomBytes(32);
    try {
      fs.writeFileSync(KEY_FILE, newKey.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
    } catch {
      fs.writeFileSync(KEY_FILE, newKey.toString('hex'), 'utf-8');
    }
    masterKeyCache = newKey;
    return masterKeyCache;
  } catch (err) {
    console.warn('[SecureVault] Failed to access key file, falling back to process-derived key:', err);
    if (!masterKeyCache) {
      // Fallback deterministic fallback key based on machine context
      masterKeyCache = crypto.createHash('sha256').update(`tinglan-music-vault-${process.cwd()}`).digest();
    }
    return masterKeyCache;
  }
}

/**
 * Encrypts a sensitive string value using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptSecret(plaintext: string | undefined | null): string {
  if (!plaintext || typeof plaintext !== 'string' || plaintext.trim() === '') {
    return '';
  }

  // Already encrypted?
  if (plaintext.startsWith(PREFIX)) {
    return plaintext;
  }

  try {
    const key = getMasterKey();
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    return `${PREFIX}${ivHex}:${authTag}:${ciphertext}`;
  } catch (err) {
    console.error('[SecureVault] Encryption error:', err);
    return plaintext; // Fallback to plaintext if encryption fails
  }
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Transparently returns plaintext if the value is not encrypted.
 */
export function decryptSecret(cipherText: string | undefined | null): string {
  if (!cipherText || typeof cipherText !== 'string' || cipherText.trim() === '') {
    return '';
  }

  // If not encrypted, return as is (backward compatibility)
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText;
  }

  try {
    const key = getMasterKey();
    const payload = cipherText.slice(PREFIX.length);
    const parts = payload.split(':');

    if (parts.length !== 3) {
      console.warn('[SecureVault] Malformed ciphertext format:', cipherText);
      return '';
    }

    const [ivHex, authTagHex, encryptedDataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  } catch (err) {
    console.warn('[SecureVault] Decryption failed (key mismatch or corruption):', err);
    return '';
  }
}

/**
 * Mask sensitive token for API display (e.g. "abcd••••••••")
 */
export function maskSecret(secret?: string | null, visibleChars = 4): string {
  if (!secret || typeof secret !== 'string') return '';
  const clean = decryptSecret(secret).trim();
  if (!clean) return '';
  if (clean.length <= visibleChars) return '••••••••';
  return `${clean.slice(0, visibleChars)}••••••••`;
}

/**
 * Encrypt specific sensitive fields in a plain JavaScript object before writing to disk
 */
export function prepareConfigForDisk(config: any): any {
  if (!config || typeof config !== 'object') return config;
  const clone = JSON.parse(JSON.stringify(config));

  const sensitiveFields = [
    'serviceToken',
    'micoServiceToken',
    'miotServiceToken',
    'passToken',
    'psecurity',
    'ssecurity',
    'password',
    'miPassword'
  ];

  for (const field of sensitiveFields) {
    if (typeof clone[field] === 'string' && clone[field].trim()) {
      clone[field] = encryptSecret(clone[field]);
    }
  }

  return clone;
}

/**
 * Decrypt sensitive fields in a loaded configuration object
 */
export function restoreConfigFromDisk(config: any): any {
  if (!config || typeof config !== 'object') return config;
  const clone = JSON.parse(JSON.stringify(config));

  const sensitiveFields = [
    'serviceToken',
    'micoServiceToken',
    'miotServiceToken',
    'passToken',
    'psecurity',
    'ssecurity',
    'password',
    'miPassword'
  ];

  for (const field of sensitiveFields) {
    if (typeof clone[field] === 'string' && clone[field].startsWith(PREFIX)) {
      clone[field] = decryptSecret(clone[field]);
    }
  }

  return clone;
}

/**
 * Encrypt sensitive fields (e.g. 32-char miio token) in devices array before saving
 */
export function prepareDevicesForDisk(devices: any[]): any[] {
  if (!Array.isArray(devices)) return [];
  return devices.map(d => {
    if (!d || typeof d !== 'object') return d;
    const clone = { ...d };
    if (typeof clone.token === 'string' && clone.token.trim()) {
      clone.token = encryptSecret(clone.token);
    }
    return clone;
  });
}

/**
 * Decrypt device tokens upon loading from disk
 */
export function restoreDevicesFromDisk(devices: any[]): any[] {
  if (!Array.isArray(devices)) return [];
  return devices.map(d => {
    if (!d || typeof d !== 'object') return d;
    const clone = { ...d };
    if (typeof clone.token === 'string' && clone.token.startsWith(PREFIX)) {
      clone.token = decryptSecret(clone.token);
    }
    return clone;
  });
}
