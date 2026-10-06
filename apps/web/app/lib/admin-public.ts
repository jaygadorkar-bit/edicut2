/** Keep credential hashes on the server, including directory and customer rows. */
export function toPublicUser<T extends { passwordHash?: unknown }>(user: T) {
  const { passwordHash: _passwordHash, ...publicUser } = user;

  return publicUser;
}

export const toPublicAdminUser = toPublicUser;
