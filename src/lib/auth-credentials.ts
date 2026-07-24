import bcrypt from "bcryptjs";

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return Promise.resolve(true);
  return bcrypt.compare(password, passwordHash);
}

export function isSessionActive(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() > now.getTime();
}
