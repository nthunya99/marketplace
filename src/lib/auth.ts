import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./auth-utils";

const TOKEN_REFRESH_MS = 5 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: { vendorProfile: true },
        });
        if (!user) return null;

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Vendors that are not yet approved can still log in (so they can
        // see their pending status) but every vendor-only API route checks
        // `status === APPROVED` again server-side before allowing writes.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          vendorStatus: user.vendorProfile?.status ?? null,
          vendorId: user.vendorProfile?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * The JWT is the session. Role and vendor details are copied into it at
     * login, so without a refresh they go stale: a customer who becomes a
     * vendor, a vendor who gets approved or suspended, or a deleted account
     * would keep their old access until they log out. So the token is
     * re-read from the database every few minutes (and immediately when
     * the client calls update()). This runs whenever the session is read
     * through NextAuth (useSession, getServerSession), not in middleware.
     */
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.vendorStatus = (user as any).vendorStatus;
        token.vendorId = (user as any).vendorId;
        token.refreshedAt = Date.now();
        return token;
      }
      if (token.revoked || !token.id) return token;

      const stale = !token.refreshedAt || Date.now() - token.refreshedAt > TOKEN_REFRESH_MS;
      if (trigger === "update" || stale) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { name: true, email: true, role: true, vendorProfile: { select: { id: true, status: true } } },
        });
        if (!fresh) {
          // Account no longer exists: treat the session as signed out.
          token.revoked = true;
          return token;
        }
        token.name = fresh.name;
        token.email = fresh.email;
        token.role = fresh.role;
        token.vendorStatus = fresh.vendorProfile?.status ?? null;
        token.vendorId = fresh.vendorProfile?.id ?? null;
        token.refreshedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (token.revoked) {
        // No user on the session = signed out everywhere (requireUser → 401,
        // useSession → unauthenticated).
        return { ...session, user: undefined } as unknown as typeof session;
      }
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).vendorStatus = token.vendorStatus;
        (session.user as any).vendorId = token.vendorId;
        if (token.name) session.user.name = token.name;
        if (token.email) session.user.email = token.email;
      }
      return session;
    },
  },
};
