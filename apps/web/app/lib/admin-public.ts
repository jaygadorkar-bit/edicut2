/** Keep credential hashes on the server, including directory and customer rows. */
export function toPublicUser<T extends object>(user: T) {
  const { passwordHash: _passwordHash, sessionVersion: _sessionVersion, ...publicUser } = user as T & { passwordHash?: unknown; sessionVersion?: unknown };

  return publicUser;
}

export const toPublicAdminUser = toPublicUser;
