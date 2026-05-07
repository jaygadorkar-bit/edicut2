import bcrypt from "bcryptjs";

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer) {
  const leftView = new Uint8Array(left);
  const rightView = new Uint8Array(right);

  if (leftView.length !== rightView.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < leftView.length; index += 1) {
    mismatch |= leftView[index] ^ rightView[index];
  }

  return mismatch === 0;
}

async function verifyPbkdf2(password: string, storedHash: string) {
  const separator = storedHash.includes("$") ? "$" : ":";
  const [, iterationsValue, saltBase64, hashBase64] = storedHash.split(separator);
  const iterations = Number(iterationsValue);

  if (!iterations || !saltBase64 || !hashBase64) {
    return false;
  }

  const expectedHash = base64ToArrayBuffer(hashBase64);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const actualHash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: base64ToArrayBuffer(saltBase64),
      iterations,
      hash: "SHA-256",
    },
    key,
    expectedHash.byteLength * 8
  );

  return timingSafeEqual(actualHash, expectedHash);
}

export async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith("pbkdf2$") || storedHash.startsWith("pbkdf2:")) {
    return verifyPbkdf2(password, storedHash);
  }

  return bcrypt.compareSync(password, storedHash);
}
