import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { verifyPassword } from "./auth-utils";

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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.vendorStatus = (user as any).vendorStatus;
        token.vendorId = (user as any).vendorId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).vendorStatus = token.vendorStatus;
        (session.user as any).vendorId = token.vendorId;
      }
      return session;
    },
  },
};
