import { redirect } from "next/navigation";
import DashboardSettingsContent from "@/components/dashboard/dashboard-settings-content";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

export default async function DashboardSettingsPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const status = await getSetupStatus(String(userId));

  return <DashboardSettingsContent selfPricingProfile={status.selfPricingProfile} selfCompany={status.selfCompany} />;
}
