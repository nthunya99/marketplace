import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import type { Role } from "@prisma/client";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Server-side session/role guard for API routes and server components.
 * Throws a typed error the caller can translate into an HTTP status —
 * this is the single choke point every protected route should go through
 * (spec section 25: role-based authorization must be enforced server-side,
 * never trusted from the client).
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new AuthError("Not authenticated", 401);
  return session.user;
}

export async function requireRole(...roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role as Role)) {
    throw new AuthError("Not authorized for this action", 403);
  }
  return user;
}
