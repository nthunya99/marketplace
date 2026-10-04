import { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
    vendorStatus?: string | null;
    vendorId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      vendorStatus?: string | null;
      vendorId?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    vendorStatus?: string | null;
    vendorId?: string | null;
    /** When role/vendor fields were last re-read from the database (ms). */
    refreshedAt?: number;
    /** Set when the account no longer exists; the session counts as signed out. */
    revoked?: boolean;
  }
}
