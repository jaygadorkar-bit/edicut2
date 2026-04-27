export function readEnv(name: string): string | undefined {
  const value = process.env[name];

  // Provide dummy values during build to prevent crashes in strict libraries like NextAuth
  if (!value && process.env.NEXT_PHASE === 'phase-production-build') {
    if (name === 'AUTH_SECRET') return 'dummy-secret-at-least-thirty-two-characters-long';
    if (name.startsWith('AUTH_')) return 'dummy-value';
  }

  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const hasMatchingQuotes =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));

  return hasMatchingQuotes ? trimmed.slice(1, -1) : trimmed;
}

export function normalizeEnv() {
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) {
      continue;
    }

    process.env[key] = readEnv(key);
  }
}
