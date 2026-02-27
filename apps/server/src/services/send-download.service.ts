import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

/**
 * Download and decrypt files from send-solo.io (timvisee/send fork).
 *
 * Protocol (reverse-engineered from client JS):
 * 1. URL: https://send-solo.io/download/{fileId}/#{base64urlSecret}
 * 2. Fetch download page HTML → parse downloadMetadata.nonce
 * 3. Auth:
 *    - No password: authKey = HKDF(rawSecret, empty_salt, "authentication") → HMAC key
 *    - Password: authKey = PBKDF2(password, full_url_string, 100, SHA-256) → HMAC key
 *    - authSig = HMAC-SHA256(authKey, base64Decode(nonce))
 *    - Header: "send-v1 " + base64(authSig)
 * 4. Metadata: GET /api/metadata/{id} → AES-128-GCM(metaKey, iv=zeros, data) → JSON
 * 5. Download: GET /api/download/blob/{id} → ECE aes128gcm decryption with rawSecret
 */

// ── URL parsing ────────────────────────────────────────────────────────────────

interface ParsedSendUrl {
  baseUrl: string;
  fileId: string;
  urlSecret: Buffer;
}

export function parseShareUrl(url: string): ParsedSendUrl {
  const parsed = new URL(url);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  const pathMatch = parsed.pathname.match(/\/download\/([a-zA-Z0-9_-]+)/);
  if (!pathMatch) {
    throw new Error(`Invalid send-solo.io URL: cannot extract fileId from ${parsed.pathname}`);
  }
  const fileId = pathMatch[1];

  const hashFragment = parsed.hash.replace(/^#/, '');
  if (!hashFragment) {
    throw new Error('Invalid send-solo.io URL: missing secret in hash fragment');
  }

  const urlSecret = base64urlDecode(hashFragment);
  return { baseUrl, fileId, urlSecret };
}

// ── Key derivation ─────────────────────────────────────────────────────────────

function hkdfDerive(ikm: Buffer, salt: Buffer, info: string, length: number): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
}

/**
 * Derive the HMAC auth key for non-password files.
 * HKDF(rawSecret, empty_salt, "authentication") → 64-byte HMAC-SHA256 key
 *
 * WebCrypto deriveKey with {name:'HMAC', hash:'SHA-256'} (no explicit length)
 * defaults to the SHA-256 block size = 512 bits = 64 bytes.
 */
function deriveAuthKeyNoPassword(secret: Buffer): Buffer {
  return hkdfDerive(secret, Buffer.alloc(0), 'authentication', 64);
}

/**
 * Derive the HMAC auth key for password-protected files.
 * PBKDF2(password, url_string, 100, SHA-256) → 64-byte HMAC-SHA256 key
 *
 * WebCrypto deriveKey with {name:'HMAC', hash:'SHA-256'} (no explicit length)
 * defaults to the SHA-256 block size = 512 bits = 64 bytes.
 */
function deriveAuthKeyWithPassword(password: string, url: string): Buffer {
  return crypto.pbkdf2Sync(password, url, 100, 64, 'sha256');
}

/**
 * Derive the metadata decryption key.
 * HKDF(rawSecret, empty_salt, "metadata") → 16-byte AES-128 key
 */
function deriveMetaKey(secret: Buffer): Buffer {
  return hkdfDerive(secret, Buffer.alloc(0), 'metadata', 16);
}

// ── Auth header ────────────────────────────────────────────────────────────────

/**
 * Build the send-v1 authorization header.
 * The auth is HMAC-SHA256(authKey, base64Decode(nonce)), base64-encoded.
 */
function buildAuthHeader(authKey: Buffer, nonce: string): string {
  const nonceBytes = Buffer.from(nonce, 'base64');
  const hmac = crypto.createHmac('sha256', authKey);
  hmac.update(nonceBytes);
  const sig = hmac.digest();
  return `send-v1 ${sig.toString('base64')}`;
}

// ── Nonce retrieval ────────────────────────────────────────────────────────────

/**
 * Fetch the download page HTML and extract the nonce from the embedded
 * downloadMetadata JSON. Also returns whether password is required.
 */
async function fetchNonce(
  baseUrl: string,
  fileId: string,
): Promise<{ nonce: string; requiresPassword: boolean }> {
  const pageRes = await fetch(`${baseUrl}/download/${fileId}/`);
  if (!pageRes.ok) {
    throw new Error(`Failed to fetch download page (${pageRes.status})`);
  }
  const html = await pageRes.text();

  const match = html.match(/downloadMetadata\s*=\s*(\{[^;]+\})/);
  if (!match) {
    throw new Error('Could not find downloadMetadata in download page');
  }

  const meta = JSON.parse(match[1]) as { nonce?: string; pwd?: boolean; status?: number };

  if (meta.status === 404) {
    throw new Error('File not found or link has expired');
  }

  if (!meta.nonce) {
    throw new Error('No nonce found in downloadMetadata');
  }

  return { nonce: meta.nonce, requiresPassword: meta.pwd === true };
}

// ── Metadata decryption ────────────────────────────────────────────────────────

/**
 * Decrypt metadata: AES-128-GCM with metaKey, IV = 12 zero bytes.
 * Input is the raw ciphertext + 16-byte auth tag (no prepended IV).
 */
function decryptMetadata(metaKey: Buffer, encryptedMeta: Buffer): string {
  const iv = Buffer.alloc(12); // 12 zero bytes
  const tagStart = encryptedMeta.length - 16;
  const ciphertext = encryptedMeta.subarray(0, tagStart);
  const authTag = encryptedMeta.subarray(tagStart);

  const decipher = crypto.createDecipheriv('aes-128-gcm', metaKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// ── ECE aes128gcm decryption ───────────────────────────────────────────────────

/**
 * Decrypt data encrypted with RFC 8188 Encrypted Content-Encoding (aes128gcm).
 *
 * Format: [salt(16)][rs(4)][idlen(1)][keyid(idlen)][encrypted records...]
 * Each record is `rs` bytes of ciphertext (with 16-byte GCM tag).
 * Plaintext has a 1-byte delimiter: 0x02 for intermediate, 0x01 for final.
 */
function decryptECE(rawSecret: Buffer, encrypted: Buffer): Buffer {
  // Parse header
  const salt = encrypted.subarray(0, 16);
  const rs = encrypted.readUInt32BE(16);
  const idlen = encrypted[20];
  const headerLen = 21 + idlen;

  const body = encrypted.subarray(headerLen);

  // Derive content encryption key and nonce base using HKDF with the header salt
  const contentKey = hkdfDerive(rawSecret, salt, 'Content-Encoding: aes128gcm\0', 16);
  const nonceBase = hkdfDerive(rawSecret, salt, 'Content-Encoding: nonce\0', 12);

  // Decrypt records
  const chunks: Buffer[] = [];
  let offset = 0;
  let seq = 0;

  while (offset < body.length) {
    const end = Math.min(offset + rs, body.length);
    const record = body.subarray(offset, end);

    // Generate nonce: nonceBase XOR sequence number (big-endian, last 4 bytes)
    const nonce = Buffer.from(nonceBase);
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32BE(seq);
    // XOR the last 4 bytes of nonce with seq
    for (let i = 0; i < 4; i++) {
      nonce[nonce.length - 4 + i] ^= seqBuf[i];
    }

    // Decrypt record (ciphertext includes the 16-byte GCM tag)
    const tagStart = record.length - 16;
    const ciphertext = record.subarray(0, tagStart);
    const authTag = record.subarray(tagStart);

    const decipher = crypto.createDecipheriv('aes-128-gcm', contentKey, nonce);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Remove padding: find the delimiter byte (0x01 or 0x02) scanning from the end
    let delimIdx = plaintext.length - 1;
    while (delimIdx >= 0 && plaintext[delimIdx] === 0) {
      delimIdx--;
    }

    if (delimIdx >= 0 && (plaintext[delimIdx] === 1 || plaintext[delimIdx] === 2)) {
      chunks.push(plaintext.subarray(0, delimIdx));
    } else {
      // No delimiter found, use the whole plaintext
      chunks.push(plaintext);
    }

    offset = end;
    seq++;
  }

  return Buffer.concat(chunks);
}

// ── Download ───────────────────────────────────────────────────────────────────

interface SendMetadata {
  name: string;
  type: string;
  size: number;
  manifest?: { files?: Array<{ name: string; size: number }> };
  [key: string]: unknown;
}

/**
 * Download and decrypt a file from send-solo.io.
 */
export async function downloadFromSend(
  rawUrl: string,
  password: string,
): Promise<{ data: Buffer; metadata: SendMetadata }> {
  // Normalize URL: remove shell escape backslashes (e.g. \# → #) that users
  // may copy from terminal output.
  const url = rawUrl.replace(/\\#/g, '#');

  const { baseUrl, fileId, urlSecret } = parseShareUrl(url);

  logger.info({ fileId, baseUrl, secretLen: urlSecret.length, hasPassword: !!password }, 'Downloading file from send-solo.io');

  // Step 1: Fetch nonce from download page
  const { nonce, requiresPassword } = await fetchNonce(baseUrl, fileId);
  logger.info({ fileId, nonce, requiresPassword }, 'Got nonce from download page');

  // Step 2: Derive auth key
  // The PBKDF2 salt must be the canonical URL (without shell escapes) to match
  // what the Send client used during upload.
  let authKey: Buffer;
  if (requiresPassword && password) {
    authKey = deriveAuthKeyWithPassword(password, url);
  } else {
    authKey = deriveAuthKeyNoPassword(urlSecret);
  }

  // Step 3: Build auth header (HMAC-sign the nonce)
  const metaAuth = buildAuthHeader(authKey, nonce);

  // Step 4: Fetch metadata
  const metaRes = await fetch(`${baseUrl}/api/metadata/${fileId}`, {
    headers: { Authorization: metaAuth },
  });

  if (!metaRes.ok) {
    const errorText = await metaRes.text().catch(() => '');
    logger.error({ fileId, status: metaRes.status }, 'Metadata fetch failed');
    throw new Error(
      `Failed to fetch metadata from send-solo.io (${metaRes.status}): ${errorText}`,
    );
  }

  // The server issues a fresh nonce in the WWW-Authenticate header after each
  // successful auth. The download request must use this new nonce.
  const wwwAuth = metaRes.headers.get('www-authenticate');
  const downloadNonce = wwwAuth?.replace('send-v1 ', '') ?? nonce;

  const metaJson = (await metaRes.json()) as { metadata: string };
  const encryptedMeta = Buffer.from(metaJson.metadata, 'base64');
  const metaKey = deriveMetaKey(urlSecret);

  let metadata: SendMetadata;
  try {
    const decrypted = decryptMetadata(metaKey, encryptedMeta);
    metadata = JSON.parse(decrypted) as SendMetadata;
  } catch (err) {
    throw new Error(
      `Failed to decrypt metadata: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  logger.info({ fileId, fileName: metadata.name, size: metadata.size }, 'Metadata decrypted');

  // Step 5: Download encrypted file (using the chained nonce from metadata response)
  const downloadAuth = buildAuthHeader(authKey, downloadNonce);
  const dlRes = await fetch(`${baseUrl}/api/download/blob/${fileId}`, {
    headers: { Authorization: downloadAuth },
  });

  if (!dlRes.ok) {
    const errorText = await dlRes.text().catch(() => '');
    throw new Error(
      `Failed to download file from send-solo.io (${dlRes.status}): ${errorText}`,
    );
  }

  const encryptedData = Buffer.from(await dlRes.arrayBuffer());
  logger.info({ fileId, encryptedSize: encryptedData.length }, 'Download complete, decrypting');

  // Step 6: Decrypt file using ECE aes128gcm
  let data: Buffer;
  try {
    data = decryptECE(urlSecret, encryptedData);
  } catch (err) {
    throw new Error(
      `Failed to decrypt file: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  logger.info({ fileId, decryptedSize: data.length }, 'File decrypted successfully');

  return { data, metadata };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function base64urlDecode(str: string): Buffer {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return Buffer.from(b64, 'base64');
}
