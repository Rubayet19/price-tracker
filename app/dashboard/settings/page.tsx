import { redirect } from "next/navigation";
import DashboardSettingsContent from "@/components/dashboard/dashboard-settings-content";
import config from "@/config";
import { getDashboardSession } from "@/libs/dashboard-session";
import connectMongo from "@/libs/mongoose";
import { normalizeSelfPricingProfile } from "@/libs/self-pricing";
import Company from "@/models/Company";
import SelfPricingProfile from "@/models/SelfPricingProfile";

export default async function DashboardSettingsPage() {
  const session = await getDashboardSession();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  await connectMongo();

  const [selfPricingRaw, selfCompanyRaw] = await Promise.all([
    SelfPricingProfile.findOne({ userId: String(userId) })
      .lean<Record<string, unknown> | null>()
      .exec(),
    Company.findOne({ userId: String(userId), type: "self" })
      .select({ name: 1, domain: 1, homepageUrl: 1, primaryPricingUrl: 1 })
      .lean<{
        _id: string;
        name: string;
        domain: string;
        homepageUrl?: string;
        primaryPricingUrl?: string;
      } | null>()
      .exec(),
  ]);

  const selfPricingProfile = normalizeSelfPricingProfile(selfPricingRaw);
  const selfCompany = selfCompanyRaw
    ? {
        companyId: String(selfCompanyRaw._id),
        name: selfCompanyRaw.name,
        domain: selfCompanyRaw.domain,
        homepageUrl: selfCompanyRaw.homepageUrl ?? null,
        primaryPricingUrl: selfCompanyRaw.primaryPricingUrl ?? null,
      }
    : null;

  return (
    <DashboardSettingsContent
      selfPricingProfile={selfPricingProfile}
      selfCompany={selfCompany}
    />
  );
}
