export function toPublicAdminUser<T extends { passwordHash?: unknown }>(adminUser: T) {
  const { passwordHash: _passwordHash, ...publicAdminUser } = adminUser;

  return publicAdminUser;
}
