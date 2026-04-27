/**
 * Edge-native password hashing using the Web Crypto API.
 * Uses PBKDF2 with SHA-256 for optimal performance and security on the Edge (e.g., Cloudflare Workers).
 */

const ITERATIONS = 10000;
const SALT_SIZE = 16;
const KEY_SIZE = 32; // 256 bits

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Hashes a password using PBKDF2.
 * Returns a string format: "pbkdf2:iterations:salt:hash"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const pbkdf2Key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    pbkdf2Key,
    KEY_SIZE * 8
  );

  const saltBase64 = arrayBufferToBase64(salt.buffer);
  const hashBase64 = arrayBufferToBase64(hash);

  return `pbkdf2:${ITERATIONS}:${saltBase64}:${hashBase64}`;
}

/**
 * Compares a password against a hash string.
 * Supports both PBKDF2 and legacy bcrypt hashes (via fallback if needed).
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("pbkdf2:")) {
    const [, iterationsStr, saltBase64, hashBase64] = storedHash.split(":");
    const iterations = parseInt(iterationsStr, 10);
    const salt = base64ToArrayBuffer(saltBase64);
    const expectedHash = base64ToArrayBuffer(hashBase64);

    const pbkdf2Key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );

    const actualHash = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: iterations,
        hash: "SHA-256",
      },
      pbkdf2Key,
      KEY_SIZE * 8
    );

    const actualHashView = new Uint8Array(actualHash);
    const expectedHashView = new Uint8Array(expectedHash);

    if (actualHashView.length !== expectedHashView.length) return false;
    
    // Constant-time comparison
    let match = 0;
    for (let i = 0; i < actualHashView.length; i++) {
      match |= actualHashView[i] ^ expectedHashView[i];
    }
    return match === 0;
  }

  // Fallback for bcrypt hashes
  if (storedHash.startsWith("$2b$") || storedHash.startsWith("$2a$")) {
    // Note: bcryptjs is slow on Edge, so this should only be used during migration.
    try {
      const bcrypt = await import("bcryptjs");
      return await bcrypt.compare(password, storedHash);
    } catch (e) {
      console.error("Failed to load bcryptjs for legacy check:", e);
      return false;
    }
  }

  return false;
}
