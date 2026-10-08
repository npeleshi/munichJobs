import type { NextAuthOptions } from "next-auth";
import type { Adapter, AdapterAccount } from "next-auth/adapters";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./db";
import { encryptOptional } from "./crypto";

// Scopes: we only request permission to SEND mail – never to read the inbox.
export const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.send";
export const MS_SCOPES = "openid profile email offline_access User.Read Mail.Send";

// Wrap the adapter so OAuth tokens are encrypted at rest.
function encryptingAdapter(): Adapter {
  const base = PrismaAdapter(prisma) as Adapter;
  return {
    ...base,
    linkAccount: (account: AdapterAccount) =>
      base.linkAccount!({
        ...account,
        access_token: encryptOptional(account.access_token) ?? undefined,
        refresh_token: encryptOptional(account.refresh_token) ?? undefined,
        id_token: undefined, // not needed after sign-in; don't store it
      }),
  };
}

const providers: NextAuthOptions["providers"] = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: GOOGLE_SCOPES, access_type: "offline", prompt: "consent" } },
    }),
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
      authorization: { params: { scope: MS_SCOPES } },
    }),
  );
}

// Local development only: sign in with just an e-mail. Cannot send mail.
if (process.env.ALLOW_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production") {
  providers.push(
    CredentialsProvider({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(c) {
        const email = c?.email?.toLowerCase().trim();
        if (!email) return null;
        const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: email.split("@")[0] } });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: encryptingAdapter(),
  providers,
  session: { strategy: "jwt", maxAge: 7 * 24 * 3600 },
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) (session.user as { id?: string }).id = token.sub;
      return session;
    },
  },
  events: {
    // NextAuth v4 does not refresh stored tokens on later sign-ins; do it here so
    // reconnecting a mailbox always stores the newest (encrypted) refresh token.
    async signIn({ account }) {
      if (!account || account.type !== "oauth" || !account.refresh_token) return;
      await prisma.account
        .update({
          where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
          data: {
            access_token: encryptOptional(account.access_token) ?? null,
            refresh_token: encryptOptional(account.refresh_token) ?? null,
            expires_at: account.expires_at ?? null,
            scope: account.scope ?? null,
          },
        })
        .catch(() => undefined); // first sign-in: linkAccount runs after this event
    },
  },
};

export async function getUserId(): Promise<string | null> {
  const s = await getServerSession(authOptions);
  return (s?.user as { id?: string } | undefined)?.id ?? null;
}
