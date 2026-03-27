import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import config from "@/config";
import client from "./mongo";

const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";
const isLocalAuthHost =
  nextAuthUrl.startsWith("http://localhost") ||
  nextAuthUrl.startsWith("http://127.0.0.1");
const isLocalTestHost = nextAuthUrl.startsWith("http://localtest.me");

const providers = [];

if (process.env.GOOGLE_ID && process.env.GOOGLE_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.given_name ? profile.given_name : profile.name,
          email: profile.email,
          image: profile.picture,
          createdAt: new Date(),
        };
      },
    })
  );
}

providers.push(
  EmailProvider({
    server: {
      host: "smtp.resend.com",
      port: 465,
      auth: {
        user: "resend",
        pass: process.env.RESEND_API_KEY,
      },
    },
    from: config.resend.fromNoReply,
  })
);

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost:
    process.env.AUTH_TRUST_HOST === "true" ||
    isLocalAuthHost ||
    isLocalTestHost,
  providers,
  adapter: MongoDBAdapter(client),
  callbacks: {
    session: async ({ session, token }: any) => {
      if (session?.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt" as const,
  },
  theme: {
    brandColor: config.colors.main,
    logo: `https://${config.domainName}/icon.svg`,
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
