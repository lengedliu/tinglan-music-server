import crypto from 'crypto';
import des from 'des.js';

/**
 * Pure JS MD4 implementation (RFC 1320)
 * Replaces OpenSSL 3 disabled legacy MD4 algorithm without requiring CLI flags.
 */
function pureJsMd4(buf: Buffer): Buffer {
  function rol(v: number, s: number) { return (v << s) | (v >>> (32 - s)); }
  function f(x: number, y: number, z: number) { return (x & y) | (~x & z); }
  function g(x: number, y: number, z: number) { return (x & y) | (x & z) | (y & z); }
  function h(x: number, y: number, z: number) { return x ^ y ^ z; }

  const n = buf.length;
  const bitLen = n * 8;
  const padLen = (n % 64 < 56) ? (56 - n % 64) : (120 - n % 64);
  const total = n + padLen + 8;
  const padded = Buffer.alloc(total);
  buf.copy(padded, 0);
  padded[n] = 0x80;
  padded.writeUInt32LE(bitLen >>> 0, total - 8);
  padded.writeUInt32LE(Math.floor(bitLen / 0x100000000), total - 4);

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let i = 0; i < total; i += 64) {
    const x = new Uint32Array(16);
    for (let j = 0; j < 16; j++) x[j] = padded.readUInt32LE(i + j * 4);
    const aa = a, bb = b, cc = c, dd = d;

    // Round 1
    a = rol(a + f(b, c, d) + x[0], 3);   d = rol(d + f(a, b, c) + x[1], 7);
    c = rol(c + f(d, a, b) + x[2], 11);  b = rol(b + f(c, d, a) + x[3], 19);
    a = rol(a + f(b, c, d) + x[4], 3);   d = rol(d + f(a, b, c) + x[5], 7);
    c = rol(c + f(d, a, b) + x[6], 11);  b = rol(b + f(c, d, a) + x[7], 19);
    a = rol(a + f(b, c, d) + x[8], 3);   d = rol(d + f(a, b, c) + x[9], 7);
    c = rol(c + f(d, a, b) + x[10], 11); b = rol(b + f(c, d, a) + x[11], 19);
    a = rol(a + f(b, c, d) + x[12], 3);  d = rol(d + f(a, b, c) + x[13], 7);
    c = rol(c + f(d, a, b) + x[14], 11); b = rol(b + f(c, d, a) + x[15], 19);

    // Round 2
    a = rol(a + g(b, c, d) + x[0] + 0x5a827999, 3);   d = rol(d + g(a, b, c) + x[4] + 0x5a827999, 5);
    c = rol(c + g(d, a, b) + x[8] + 0x5a827999, 9);   b = rol(b + g(c, d, a) + x[12] + 0x5a827999, 13);
    a = rol(a + g(b, c, d) + x[1] + 0x5a827999, 3);   d = rol(d + g(a, b, c) + x[5] + 0x5a827999, 5);
    c = rol(c + g(d, a, b) + x[9] + 0x5a827999, 9);   b = rol(b + g(c, d, a) + x[13] + 0x5a827999, 13);
    a = rol(a + g(b, c, d) + x[2] + 0x5a827999, 3);   d = rol(d + g(a, b, c) + x[6] + 0x5a827999, 5);
    c = rol(c + g(d, a, b) + x[10] + 0x5a827999, 9);  b = rol(b + g(c, d, a) + x[14] + 0x5a827999, 13);
    a = rol(a + g(b, c, d) + x[3] + 0x5a827999, 3);   d = rol(d + g(a, b, c) + x[7] + 0x5a827999, 5);
    c = rol(c + g(d, a, b) + x[11] + 0x5a827999, 9);  b = rol(b + g(c, d, a) + x[15] + 0x5a827999, 13);

    // Round 3
    a = rol(a + h(b, c, d) + x[0] + 0x6ed9eba1, 3);   d = rol(d + h(a, b, c) + x[8] + 0x6ed9eba1, 9);
    c = rol(c + h(d, a, b) + x[4] + 0x6ed9eba1, 11);  b = rol(b + h(c, d, a) + x[12] + 0x6ed9eba1, 15);
    a = rol(a + h(b, c, d) + x[2] + 0x6ed9eba1, 3);   d = rol(d + h(a, b, c) + x[10] + 0x6ed9eba1, 9);
    c = rol(c + h(d, a, b) + x[6] + 0x6ed9eba1, 11);  b = rol(b + h(c, d, a) + x[14] + 0x6ed9eba1, 15);
    a = rol(a + h(b, c, d) + x[1] + 0x6ed9eba1, 3);   d = rol(d + h(a, b, c) + x[9] + 0x6ed9eba1, 9);
    c = rol(c + h(d, a, b) + x[5] + 0x6ed9eba1, 11);  b = rol(b + h(c, d, a) + x[13] + 0x6ed9eba1, 15);
    a = rol(a + h(b, c, d) + x[3] + 0x6ed9eba1, 3);   d = rol(d + h(a, b, c) + x[11] + 0x6ed9eba1, 9);
    c = rol(c + h(d, a, b) + x[7] + 0x6ed9eba1, 11);  b = rol(b + h(c, d, a) + x[15] + 0x6ed9eba1, 15);

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out;
}

/**
 * Setup OpenSSL 3 legacy provider fallback.
 * Checks whether native crypto supports MD4 and DES-ECB. If ERR_OSSL_EVP_UNSUPPORTED
 * is detected, installs transparent fallbacks so that @marsaud/smb2 / ntlm runs flawlessly.
 */
export function initCryptoLegacyCompat(): void {
  // 1. Check MD4 support
  let needsMd4Fallback = false;
  try {
    crypto.createHash('md4');
  } catch (err: any) {
    if (err?.code === 'ERR_OSSL_EVP_UNSUPPORTED' || err?.message?.includes('unsupported')) {
      needsMd4Fallback = true;
    }
  }

  // 2. Check DES-ECB support
  let needsDesFallback = false;
  try {
    crypto.createCipheriv('DES-ECB', Buffer.alloc(8), '');
  } catch (err: any) {
    if (err?.code === 'ERR_OSSL_EVP_UNSUPPORTED' || err?.message?.includes('unsupported')) {
      needsDesFallback = true;
    }
  }

  if (needsMd4Fallback) {
    const origCreateHash = crypto.createHash;
    crypto.createHash = function (algorithm: string, options?: any): any {
      if (algorithm && algorithm.toLowerCase() === 'md4') {
        const chunks: Buffer[] = [];
        return {
          update(data: any, inputEncoding?: string) {
            if (Buffer.isBuffer(data)) {
              chunks.push(data);
            } else if (typeof data === 'string') {
              chunks.push(Buffer.from(data, (inputEncoding as BufferEncoding) || 'utf8'));
            } else {
              chunks.push(Buffer.from(data));
            }
            return this;
          },
          digest(encoding?: string) {
            const full = Buffer.concat(chunks);
            const digestBuf = pureJsMd4(full);
            if (encoding === 'hex') return digestBuf.toString('hex');
            if (encoding === 'binary') return digestBuf.toString('binary');
            if (encoding === 'base64') return digestBuf.toString('base64');
            return digestBuf;
          }
        };
      }
      return origCreateHash.call(crypto, algorithm, options);
    };
    console.log('[CryptoCompat] 🛡️ 已就绪 MD4 纯 JS 兼容垫片 (解决 Node 17+ / OpenSSL 3 ERR_OSSL_EVP_UNSUPPORTED)');
  }

  if (needsDesFallback) {
    const origCreateCipheriv = crypto.createCipheriv;
    crypto.createCipheriv = function (cipher: string, key: any, iv: any, options?: any): any {
      if (cipher && cipher.toUpperCase() === 'DES-ECB') {
        const keyBuf = Buffer.isBuffer(key) ? key : Buffer.from(key);
        // @ts-ignore
        const desInstance = des.DES.create({ type: 'encrypt', key: keyBuf });
        return {
          setAutoPadding(_val?: boolean) {
            return this;
          },
          update(chunk: any, inputEnc?: string, outputEnc?: string) {
            const inBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, (inputEnc as BufferEncoding) || 'binary');
            const outBuf = Buffer.from(desInstance.update(inBuf));
            return outputEnc === 'binary' ? outBuf.toString('binary') : outBuf;
          },
          final(outputEnc?: string) {
            return outputEnc === 'binary' ? '' : Buffer.alloc(0);
          }
        };
      }
      return origCreateCipheriv.call(crypto, cipher, key, iv, options);
    };
    console.log('[CryptoCompat] 🛡️ 已就绪 DES-ECB 纯 JS 兼容垫片 (解决 Node 17+ / OpenSSL 3 ERR_OSSL_EVP_UNSUPPORTED)');
  }
}

// Auto-run on import
initCryptoLegacyCompat();
