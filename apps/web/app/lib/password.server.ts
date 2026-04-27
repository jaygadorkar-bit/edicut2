const textEncoder = new TextEncoder();

function base64ToBytes(value: string) {
  return new Uint8Array(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = new ArrayBuffer(salt.length);
  const normalizedSalt = new Uint8Array(saltBuffer);
  normalizedSalt.set(salt);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: normalizedSalt,
      iterations,
    },
    keyMaterial,
    256
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsValue, saltValue, hashValue] = storedHash.split("$");

  if (algorithm !== "pbkdf2" || !iterationsValue || !saltValue || !hashValue) {
    return false;
  }

  const iterations = Number(iterationsValue);

  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const salt = base64ToBytes(saltValue);
  const expected = base64ToBytes(hashValue);
  const derived = new Uint8Array(await deriveBits(password, salt, iterations));

  return bytesEqual(derived, expected);
}
