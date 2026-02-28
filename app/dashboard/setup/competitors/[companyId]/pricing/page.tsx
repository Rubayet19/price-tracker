import { redirect } from "next/navigation";
import CompetitorPricingSetupForm from "@/components/dashboard/setup/competitor-pricing-setup-form";
import SetupFrame from "@/components/dashboard/setup/setup-frame";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

interface CompetitorPricingSetupPageProps {
  params: Promise<{
    companyId: string;
  }>;
}

export default async function CompetitorPricingSetupPage({
  params,
}: CompetitorPricingSetupPageProps) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const [{ companyId }, status] = await Promise.all([params, getSetupStatus(String(userId))]);

  if (status.isSetupComplete) {
    redirect("/dashboard");
  }

  if (status.nextStep.step !== "competitor_pricing" || status.nextStep.companyId !== companyId) {
    redirect(status.nextStep.href);
  }

  const competitor = status.competitors.find((entry) => entry.companyId === companyId);

  if (!competitor) {
    redirect("/dashboard/setup");
  }

  return (
    <SetupFrame
      title={`Confirm ${competitor.name}'s pricing page`}
      description="Discovery stays conservative and low-noise. Confirm the page you trust so the dashboard can attribute future pricing changes to the right source."
      currentStep="competitor_pricing"
      status={status}
    >
      <CompetitorPricingSetupForm competitor={competitor} />
    </SetupFrame>
  );
}
