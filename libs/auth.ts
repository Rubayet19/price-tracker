import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import config from "@/config";
import connectMongo from "./mongo";

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_ID!,
      clientSecret: process.env.GOOGLE_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.given_name ? profile.given_name : profile.name,
          email: profile.email,
          image: profile.picture,
          createdAt: new Date(),
        };
      },
    }),
    ...(connectMongo
      ? [
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
          }),
        ]
      : []),
  ],
  ...(connectMongo && { adapter: MongoDBAdapter(connectMongo) }),
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
    logo: `https://${config.domainName}/logoAndName.png`,
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
